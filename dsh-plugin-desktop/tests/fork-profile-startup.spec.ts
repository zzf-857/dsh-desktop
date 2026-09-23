import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { beginDesktopProfileStartup, createDesktopWebProfile } from '../src/profile-manager.ts'
import { ensureDesktopProfile, prepareDesktopProfile } from '../src/profile.ts'

vi.mock('../src/fork-distribution.ts', async importOriginal => {
  const actual = await importOriginal<typeof import('../src/fork-distribution.ts')>()
  return { ...actual, seedForkProfile: (manifest: Parameters<typeof actual.seedForkProfile>[0]) =>
    actual.seedForkProfile(manifest, {
      repository: 'https://github.com/zzf-857/dsh-desktop', bundledPlugins: ['fork-bundled-example'],
    }) }
})

const roots: string[] = []
function home() {
  const root = mkdtempSync(join(tmpdir(), 'dsh-fork-startup-'))
  roots.push(root)
  return root
}
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
const manifestAt = (root: string) => join(root, 'profiles', 'desktop', 'package.json')
const read = (root: string) => JSON.parse(readFileSync(manifestAt(root), 'utf8')) as {
  dshDesktopForkPluginsInitialized?: boolean
  dependencies?: Record<string, string>
  dsh: { profile: { bundles: string[] }; desktopDeselectedBundles?: string[] }
}

describe('fork plugin registration through the launcher startup sequence', () => {
  it('registers plugins after the launcher has already materialized the base Desktop profile', () => {
    const root = home()
    const startup = beginDesktopProfileStartup(join(root, 'selection.json'), root)
    expect(startup.profileName).toBe('desktop')
    expect(read(root).dsh.profile.bundles).not.toContain('fork-bundled-example')
    const pluginDir = join(root, 'profiles', 'desktop', 'node_modules', 'fork-bundled-example')
    mkdirSync(pluginDir, { recursive: true })
    writeFileSync(join(pluginDir, 'package.json'), JSON.stringify({ name: 'fork-bundled-example',
      version: '1.0.0', dsh: { bundle: { patch: './cordis.patch.yml' } } }))
    writeFileSync(join(pluginDir, 'cordis.patch.yml'), '[]\n')
    const prepared = prepareDesktopProfile('1', root, 'win32')
    expect(read(root).dsh.profile.bundles).toContain('fork-bundled-example')
    expect(prepared.profile.layers.some(layer => layer.packageName === 'fork-bundled-example')).toBe(true)
    expect(read(root).dshDesktopForkPluginsInitialized).toBe(true)
  })
  it('repairs an existing 2.0.15 base-only profile once, preserving dependencies and later removals', () => {
    const root = home()
    createDesktopWebProfile(root, 'desktop')
    const original = read(root)
    original.dependencies = { 'my-existing-plugin': '1.2.3' }
    writeFileSync(manifestAt(root), JSON.stringify(original))
    ensureDesktopProfile(root)
    const seeded = read(root)
    expect(seeded.dependencies).toEqual(original.dependencies)
    expect(seeded.dsh.profile.bundles).toContain('fork-bundled-example')
    seeded.dsh.profile.bundles = seeded.dsh.profile.bundles.filter(name => name !== 'fork-bundled-example')
    writeFileSync(manifestAt(root), JSON.stringify(seeded))
    ensureDesktopProfile(root)
    expect(read(root).dsh.profile.bundles).not.toContain('fork-bundled-example')
  })
  it('preserves an explicit plugin deselection made before the migration', () => {
    const root = home()
    createDesktopWebProfile(root, 'desktop')
    const original = read(root)
    original.dsh.desktopDeselectedBundles = ['fork-bundled-example']
    writeFileSync(manifestAt(root), JSON.stringify(original))
    ensureDesktopProfile(root)
    expect(read(root).dsh.profile.bundles).not.toContain('fork-bundled-example')
    expect(read(root).dshDesktopForkPluginsInitialized).toBe(true)
  })
  it('does not seed safe-mode or custom profiles during their creation', () => {
    const root = home()
    expect(createDesktopWebProfile(root, 'safe-mode').bundles).not.toContain('fork-bundled-example')
  })
})
