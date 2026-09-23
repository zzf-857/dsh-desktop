import { describe, expect, it } from 'vitest'
import { parseForkDistribution } from '../src/fork-distribution.ts'

describe('fork distribution metadata', () => {
  const repository = 'https://github.com/zzf-857/dsh-desktop'
  it('leaves normal builds unchanged', () => {
    expect(parseForkDistribution({})).toBeUndefined()
  })
  it('accepts only explicit installed plugin names and removes duplicates', () => {
    expect(parseForkDistribution({ dependencies: { plugin: '1.0.0' },
      dshDesktopFork: { repository, bundledPlugins: ['plugin', 'plugin'] },
    })).toEqual({ repository, bundledPlugins: ['plugin'] })
  })
  it.each(['../private', 'missing', 'https://example.com', 'file:settings.yaml'])(
    'rejects a missing package or path-like entry: %s', name => {
      expect(() => parseForkDistribution({ dshDesktopFork: { repository, bundledPlugins: [name] } })).toThrow('Invalid')
    },
  )
})
