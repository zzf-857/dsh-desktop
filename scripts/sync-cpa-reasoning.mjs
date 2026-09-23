/** Import CPA reasoning capabilities, honoring explicit per-model local overrides. */
import { readFileSync, mkdirSync, copyFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { randomUUID } from 'node:crypto'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(join(root, 'dsh-plugin-desktop/package.json'))
const yaml = require('yaml')
const { withFileLock, writeFileAtomic } = await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-atomic-write')).href)
const LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** Local overrides are explicit wire mappings, never inferred from model names. */
export function validateReasoningOverride(value) {
  if (!isRecord(value) || Object.keys(value).length === 0) throw new Error('A local reasoning override must declare at least one thinking level')
  for (const [level, wire] of Object.entries(value)) {
    if (!LEVELS.includes(level) || !(typeof wire === 'string' && wire.length > 0 || level === 'off' && wire === null)) {
      throw new Error('A local reasoning override has an unsupported level or wire value')
    }
  }
  if (!Object.keys(value).some(level => level !== 'off')) throw new Error('A local reasoning override must declare a level beyond off')
  return Object.fromEntries(LEVELS.filter(level => Object.hasOwn(value, level)).map(level => [level, value[level]]))
}

/** Optional private file: exact provider ID -> exact model ID -> effort wire mappings. */
export function readCpaReasoningOverrides(filename, providerId) {
  let document
  try {
    document = JSON.parse(readFileSync(filename, 'utf8'))
  } catch (error) {
    if (error?.code === 'ENOENT') return {}
    throw new Error('Cannot read the local CPA reasoning override file')
  }
  if (!isRecord(document) || document.version !== 1 || !isRecord(document.providers)) {
    throw new Error('The local CPA reasoning override file must have version 1 and a providers map')
  }
  if (!Object.hasOwn(document.providers, providerId)) return {}
  const models = document.providers[providerId]
  if (!isRecord(models)) throw new Error('Local CPA provider overrides must be a model map')
  return Object.fromEntries(Object.entries(models).map(([model, value]) => [model, validateReasoningOverride(value)]))
}

/** Exact metadata only: never infer capability from a model's name or provider prefix. */
export function catalogReasoning(entry) {
  if (!Array.isArray(entry?.supported_reasoning_levels) || entry.supported_reasoning_levels.length === 0) return undefined
  const values = new Map()
  for (const item of entry.supported_reasoning_levels) {
    const wire = item?.effort
    const level = wire === 'none' ? 'off' : wire
    if (!LEVELS.includes(level)) throw new Error('CPA advertised a reasoning level this DSH runtime cannot represent')
    if (values.has(level)) throw new Error('CPA advertised a duplicate reasoning level')
    values.set(level, wire)
  }
  if (![...values.keys()].some(level => level !== 'off')) return undefined
  return Object.fromEntries(LEVELS.filter(level => values.has(level)).map(level => [level, values.get(level)]))
}

/** Preserve unrelated settings and each model's existing fields/comments. */
export function planCpaReasoning(text, providerId, catalog, overrides = {}) {
  const document = yaml.parseDocument(text)
  if (document.errors.length > 0) throw new Error('Cannot parse local settings YAML')
  const settings = document.toJS()
  const provider = settings?.['llm-pi-ai']?.providers?.[providerId]
  if (provider?.api !== 'openai-completions' || !Array.isArray(provider.models)) {
    throw new Error('Select a configured CPA Chat Completions provider with an explicit model list')
  }
  if (!Array.isArray(catalog?.models)) throw new Error('CPA did not return its extended model catalog')
  const entries = new Map()
  for (const entry of catalog.models) {
    if (typeof entry?.slug !== 'string') continue
    if (entries.has(entry.slug)) throw new Error('CPA catalog contains duplicate model IDs')
    entries.set(entry.slug, entry)
  }
  const base = ['llm-pi-ai', 'providers', providerId]
  const models = []
  const skipped = []
  const configuredIds = new Set(provider.models.map(model => model.id))
  for (const modelId of Object.keys(overrides)) {
    if (!configuredIds.has(modelId)) throw new Error('A local reasoning override names a model absent from this provider')
  }
  provider.models.forEach((model, index) => {
    const hasOverride = Object.hasOwn(overrides, model.id)
    const efforts = hasOverride ? validateReasoningOverride(overrides[model.id]) : catalogReasoning(entries.get(model.id))
    if (efforts === undefined) { skipped.push(model.id); return }
    if ((model.api ?? provider.api) !== 'openai-completions'
      || model.compat?.supportsReasoningEffort === false
      || (model.compat?.thinkingFormat !== undefined && model.compat.thinkingFormat !== 'openai')) {
      throw new Error('A selected model has an incompatible wire override; resolve it before syncing')
    }
    document.setIn([...base, 'models', index, 'reasoningEfforts'], efforts)
    models.push({ id: model.id, levels: Object.keys(efforts), source: hasOverride ? 'local-override' : 'cpa-catalog' })
  })
  if (models.length === 0) throw new Error('CPA advertised no reasoning levels for the configured models')
  document.setIn([...base, 'compat', 'thinkingFormat'], 'openai')
  document.setIn([...base, 'compat', 'supportsReasoningEffort'], true)
  // Enabling reasoning must not silently change the existing system prompt role to developer.
  if (provider.compat?.supportsDeveloperRole === undefined) {
    document.setIn([...base, 'compat', 'supportsDeveloperRole'], false)
  }
  const nextText = document.toString()
  return { text: nextText, changed: nextText !== text, models, skipped }
}

/** Use the same lock and atomic writer as DSH; refuse edits made during metadata fetch. */
export async function saveCpaReasoning(settingsPath, previous, plan, backupDirectory) {
  if (!plan.changed) return undefined
  return withFileLock(settingsPath, async () => {
    if (readFileSync(settingsPath, 'utf8') !== previous) {
      throw new Error('Settings changed while querying CPA; rerun the command to merge the latest settings')
    }
    mkdirSync(backupDirectory, { recursive: true, mode: 0o700 })
    const backup = join(backupDirectory, 'settings-' + new Date().toISOString().replaceAll(':', '-') + '-' + randomUUID() + '.yaml')
    copyFileSync(settingsPath, backup)
    await writeFileAtomic(settingsPath, plan.text, { mode: 0o600, dirMode: 0o700 })
    return backup
  })
}

export async function syncCpaReasoning({ providerId, apply = false }) {
  const home = join(root, '.local-data', 'dsh-home')
  const settingsPath = join(home, 'settings.yaml')
  const previous = readFileSync(settingsPath, 'utf8')
  const provider = yaml.parse(previous)?.['llm-pi-ai']?.providers?.[providerId]
  if (typeof provider?.baseURL !== 'string') throw new Error('Configured provider has no baseURL')
  const endpoint = new URL(provider.baseURL.replace(/\/$/, '') + '/models')
  if (!['http:', 'https:'].includes(endpoint.protocol) || endpoint.username || endpoint.password || endpoint.hash || endpoint.search) {
    throw new Error('CPA baseURL must be an HTTP(S) API base without credentials, a query, or a fragment')
  }
  endpoint.searchParams.set('client_version', 'pi')
  const credentials = yaml.parse(readFileSync(join(home, '.credentials.yaml'), 'utf8'))
  const key = process.env[provider.apiKeyEnv] || credentials?.refs?.[provider.apiKeyEnv]
  if (typeof key !== 'string' || key.length === 0) throw new Error('Configured CPA credential is unavailable')
  let response
  try {
    response = await fetch(endpoint, {
      headers: { Authorization: 'Bearer ' + key },
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    })
  } catch {
    throw new Error('CPA model catalog request failed; settings were not changed')
  }
  if (!response.ok) throw new Error('CPA model catalog returned HTTP ' + response.status)
  const overrides = readCpaReasoningOverrides(join(root, '.local-data', 'cpa-reasoning-overrides.json'), providerId)
  const plan = planCpaReasoning(previous, providerId, await response.json(), overrides)
  const backup = apply
    ? await saveCpaReasoning(settingsPath, previous, plan, join(root, '.local-data', 'provider-backups'))
    : undefined
  return { provider: providerId, applied: apply && plan.changed, changed: plan.changed, models: plan.models, skipped: plan.skipped, backup }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { values } = parseArgs({ options: { provider: { type: 'string' }, apply: { type: 'boolean', default: false } } })
    if (!values.provider) throw new Error('Usage: corepack yarn provider:cpa:sync --provider <provider-id> [--apply]')
    console.log(JSON.stringify(await syncCpaReasoning({ providerId: values.provider, apply: values.apply }), null, 2))
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'CPA reasoning sync failed')
    process.exitCode = 1
  }
}
