import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { createServer } from 'node:http'
import { catalogReasoning, planCpaReasoning, readCpaReasoningOverrides, saveCpaReasoning } from './sync-cpa-reasoning.mjs'

const root = new URL('../', import.meta.url)
const require = createRequire(new URL('../dsh-plugin-desktop/package.json', import.meta.url))
const yaml = require('yaml')
const original = '# retained comment\n' + yaml.stringify({
  unrelated: { keep: true },
  'agent-default-model': { provider: 'gateway', model: 'alias/thinking-model' },
  'llm-pi-ai': { providers: { gateway: {
    api: 'openai-completions', apiKeyEnv: 'FIXTURE_KEY', baseURL: 'http://127.0.0.1:1/v1',
    models: [{ id: 'alias/thinking-model', name: 'Fixture Thinker', contextWindow: 65536, maxTokens: 1024 }],
  } } },
})
const catalog = { models: [{ slug: 'alias/thinking-model', supported_reasoning_levels: ['low', 'medium', 'high'].map(effort => ({ effort })) }] }
const extendedEfforts = { low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh', max: 'max' }
const overrides = { 'alias/thinking-model': extendedEfforts }

test('explicit per-model overrides retain Xhigh and Max through repeated catalog synchronization', () => {
  const data = yaml.parse(original)
  data['llm-pi-ai'].providers.gateway.models.push({ id: 'another-model' })
  const listing = { models: [...catalog.models, { ...catalog.models[0], slug: 'another-model' }] }
  const plan = planCpaReasoning(yaml.stringify(data), 'gateway', listing, overrides)
  const configured = yaml.parse(plan.text)['llm-pi-ai'].providers.gateway.models
  assert.deepEqual(configured[0].reasoningEfforts, extendedEfforts)
  assert.deepEqual(configured[1].reasoningEfforts, { low: 'low', medium: 'medium', high: 'high' })
  assert.equal(plan.models[0].source, 'local-override')
  assert.equal(plan.models[1].source, 'cpa-catalog')
  assert.equal(planCpaReasoning(plan.text, 'gateway', listing, overrides).changed, false)
  assert.deepEqual(planCpaReasoning(original, 'gateway', { models: [] }, overrides).models[0].levels, Object.keys(extendedEfforts))
})

test('override files isolate providers, preserve wire mappings and reject malformed declarations', () => {
  const directory = mkdtempSync(join(tmpdir(), 'dsh-cpa-overrides-'))
  const filename = join(directory, 'overrides.json')
  try {
    assert.deepEqual(readCpaReasoningOverrides(filename, 'gateway'), {})
    writeFileSync(filename, JSON.stringify({ version: 1, providers: { gateway: overrides } }))
    assert.deepEqual(readCpaReasoningOverrides(filename, 'gateway'), overrides)
    assert.deepEqual(readCpaReasoningOverrides(filename, 'other-route'), {})
    writeFileSync(filename, JSON.stringify({ version: 2, providers: {} }))
    assert.throws(() => readCpaReasoningOverrides(filename, 'gateway'), /version 1/)
    assert.throws(() => planCpaReasoning(original, 'gateway', catalog, { 'unknown-model': extendedEfforts }), /absent/)
    assert.throws(() => planCpaReasoning(original, 'gateway', catalog, { 'alias/thinking-model': { high: null } }), /wire value/)
    assert.throws(() => planCpaReasoning(original, 'gateway', catalog, { 'alias/thinking-model': { ultra: 'ultra' } }), /unsupported/)
  } finally { rmSync(directory, { recursive: true, force: true }) }
})

test('uses exactly the advertised levels and preserves aliases, settings and the selected default', () => {
  const plan = planCpaReasoning(original, 'gateway', catalog)
  const before = yaml.parse(original)
  const after = yaml.parse(plan.text)
  const provider = after['llm-pi-ai'].providers.gateway
  assert.deepEqual(provider.models[0].reasoningEfforts, { low: 'low', medium: 'medium', high: 'high' })
  assert.deepEqual(after.unrelated, before.unrelated)
  assert.deepEqual(after['agent-default-model'], before['agent-default-model'])
  assert.equal(provider.models[0].id, 'alias/thinking-model')
  assert.equal(provider.models[0].maxTokens, 1024)
  assert.equal(provider.apiKeyEnv, 'FIXTURE_KEY')
  assert.equal(provider.compat.supportsDeveloperRole, false)
  assert.match(plan.text, /^# retained comment/)
  assert.equal(planCpaReasoning(plan.text, 'gateway', catalog).changed, false)
})

test('does not infer reasoning support from names or a plain models response', () => {
  assert.equal(catalogReasoning({ slug: 'gpt-thinking-high' }), undefined)
  assert.throws(() => planCpaReasoning(original, 'gateway', { data: [] }), /extended model catalog/)
  assert.throws(() => planCpaReasoning(original, 'gateway', { models: [{ slug: 'thinking-model' }] }), /no reasoning levels/)
})

test('maps an explicit none level and rejects unknown or duplicate levels', () => {
  assert.deepEqual(catalogReasoning({ supported_reasoning_levels: [{ effort: 'none' }, { effort: 'high' }] }), { off: 'none', high: 'high' })
  assert.throws(() => catalogReasoning({ supported_reasoning_levels: [{ effort: 'ultra' }] }), /cannot represent/)
  assert.throws(() => catalogReasoning({ supported_reasoning_levels: [{ effort: 'low' }, { effort: 'low' }] }), /duplicate/)
})

test('preserves models absent from CPA metadata and refuses conflicting per-model transport', () => {
  const data = yaml.parse(original)
  data['llm-pi-ai'].providers.gateway.models.push({ id: 'unlisted', reasoningEfforts: false })
  const plan = planCpaReasoning(yaml.stringify(data), 'gateway', catalog)
  assert.deepEqual(plan.skipped, ['unlisted'])
  assert.deepEqual(yaml.parse(plan.text)['llm-pi-ai'].providers.gateway.models[1], { id: 'unlisted', reasoningEfforts: false })
  data['llm-pi-ai'].providers.gateway.models[0].compat = { supportsReasoningEffort: false }
  assert.throws(() => planCpaReasoning(yaml.stringify(data), 'gateway', catalog), /incompatible wire override/)
})

test('backs up atomically and refuses to overwrite a concurrent settings change', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'dsh-cpa-sync-'))
  try {
    const filename = join(directory, 'settings.yaml')
    const backups = join(directory, 'backups')
    writeFileSync(filename, original)
    const plan = planCpaReasoning(original, 'gateway', catalog)
    const backup = await saveCpaReasoning(filename, original, plan, backups)
    assert.equal(readFileSync(backup, 'utf8'), original)
    assert.equal(readFileSync(filename, 'utf8'), plan.text)
    await assert.rejects(saveCpaReasoning(filename, original, plan, backups), /Settings changed/)
    assert.equal(readdirSync(backups).length, 1)
    assert.equal(readFileSync(filename, 'utf8'), plan.text)
  } finally { rmSync(directory, { recursive: true, force: true }) }
})

for (const workspace of ['dsh-plugin-desktop-beta', 'dsh-plugin-desktop']) {
  test(workspace + ': declared choices reach the real adapter and HTTP request body', async () => {
    const localRequire = createRequire(new URL(workspace + '/package.json', root))
    const load = name => import(pathToFileURL(localRequire.resolve(name)).href)
    const [{ Context }, llm, pi] = await Promise.all([
      load('@deepseek-ai/cordis'), load('@deepseek-ai/dsh-llm'), load('@deepseek-ai/dsh-llm-pi-ai'),
    ])
    const requests = []
    const server = createServer(async (request, response) => {
      let body = ''
      for await (const chunk of request) body += chunk
      requests.push(JSON.parse(body))
      response.writeHead(200, { 'content-type': 'text/event-stream' })
      response.end('data: {"choices":[{"index":0,"delta":{"role":"assistant","content":"ok"},"finish_reason":null}]}\n\ndata: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":1,"completion_tokens":1}}\n\ndata: [DONE]\n\n')
    })
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    const ctx = new Context()
    const previousKey = process.env.FIXTURE_KEY
    process.env.FIXTURE_KEY = 'test-only-no-real-credential'
    try {
      const config = yaml.parse(planCpaReasoning(original, 'gateway', catalog, overrides).text)['llm-pi-ai']
      config.providers.gateway.baseURL = 'http://127.0.0.1:' + server.address().port + '/v1'
      await ctx.plugin(llm.default)
      await ctx.plugin(pi, config)
      const info = await ctx.llm.resolveModelInfo('gateway', 'alias/thinking-model')
      assert.deepEqual(info.reasoning.efforts.map(e => e.id), ['low', 'medium', 'high', 'xhigh', 'max'])
      for (const effort of ['low', 'medium', 'high', 'xhigh', 'max', undefined]) {
        const chunks = []
        for await (const chunk of ctx.llm.stream({
          provider: 'gateway', model: 'alias/thinking-model', system: 'fixture instruction', messages: [],
          ...(effort === undefined ? {} : { reasoningEffort: effort }),
        })) chunks.push(chunk)
        assert.ok(chunks.some(c => c.type === 'text-delta' && c.text === 'ok'))
      }
      assert.deepEqual(requests.map(r => r.reasoning_effort), ['low', 'medium', 'high', 'xhigh', 'max', undefined])
      assert.ok(requests.every(r => r.model === 'alias/thinking-model' && r.messages[0].role === 'system'))
      assert.equal('reasoning_effort' in requests[5], false)
      await assert.rejects(ctx.llm.resolveCallConfig({ provider: 'gateway', model: 'alias/thinking-model', reasoningEffort: 'minimal' }), /reasoning effort/)
      assert.equal(requests.length, 6)
    } finally {
      await ctx.fiber.dispose()
      await new Promise(resolve => server.close(resolve))
      if (previousKey === undefined) delete process.env.FIXTURE_KEY
      else process.env.FIXTURE_KEY = previousKey
    }
  })
}
