/** Public fork metadata is embedded by the fork packager, never read from user state. */
import { readFileSync } from 'node:fs'

export interface ForkDistribution {
  readonly repository: string
  readonly bundledPlugins: readonly string[]
}

/** Accept only the distribution marker produced by this fork's build configuration. */
export function parseForkDistribution(manifest: unknown): ForkDistribution | undefined {
  if (manifest === null || typeof manifest !== 'object') return undefined
  const root = manifest as { dshDesktopFork?: unknown; dependencies?: Record<string, unknown> }
  if (root.dshDesktopFork === undefined) return undefined
  const value = root.dshDesktopFork as Partial<ForkDistribution> | null
  if (value === null || typeof value !== 'object'
    || value.repository !== 'https://github.com/zzf-857/dsh-desktop'
    || !Array.isArray(value.bundledPlugins)
    || value.bundledPlugins.some(name => typeof name !== 'string'
      || !/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/u.test(name)
      || typeof root.dependencies?.[name] !== 'string')) {
    throw new Error('Invalid Desktop fork distribution metadata')
  }
  return { repository: value.repository, bundledPlugins: [...new Set(value.bundledPlugins)] }
}

/** No local account, profile, settings, or credential files participate in this read. */
export function desktopForkDistribution(): ForkDistribution | undefined {
  return parseForkDistribution(JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')))
}
