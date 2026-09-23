import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  configureRepositoryLocalData,
  isRepositoryLocalMode,
  repositoryLocalPaths,
  REPOSITORY_LOCAL_MARKER,
} from '../src/repository-local-data.ts'

const roots: string[] = []
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'dsh-local-data-'))
  roots.push(root)
  mkdirSync(join(root, 'exe'))
  return { root, executable: join(root, 'exe', 'DSH Desktop.exe'), marker: join(root, 'exe', REPOSITORY_LOCAL_MARKER) }
}
afterEach(() => {
  configureRepositoryLocalData({ isPackaged: false, setPath() {} }, '', {})
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})
describe('repository-local runtime', () => {
  it('leaves regular releases and packaging smokes untouched without a marker', () => {
    const { executable } = fixture()
    const env = { DSH_HOME: 'original' }
    configureRepositoryLocalData({ isPackaged: true, setPath() { throw new Error('unexpected path change') } }, executable, env)
    expect(env.DSH_HOME).toBe('original')
    expect(isRepositoryLocalMode()).toBe(false)
  })
  it('keeps development isolated even beside a deployed marker', () => {
    const { executable, marker } = fixture()
    writeFileSync(marker, '{"version":1}')
    expect(repositoryLocalPaths(executable, false)).toBeUndefined()
  })
  it('pins both Electron storage and DSH home outside replaceable binaries', () => {
    const { root, executable, marker } = fixture()
    writeFileSync(marker, '{"version":1}')
    const calls: Record<string, string> = {}
    const env = { DSH_HOME: 'unrelated-home' }
    configureRepositoryLocalData({ isPackaged: true, setPath(name, path) { calls[name] = path } }, executable, env)
    expect(env.DSH_HOME).toBe(join(root, '.local-data', 'dsh-home'))
    expect(calls.userData).toBe(join(root, '.local-data', 'electron'))
    expect(calls.sessionData).toBe(calls.userData)
    expect(calls.crashDumps).toBe(join(calls.userData!, 'Crashpad'))
    expect(isRepositoryLocalMode()).toBe(true)
  })
  it('fails closed for an invalid marker instead of silently opening an empty profile', () => {
    const { executable, marker } = fixture()
    writeFileSync(marker, '{"version":2}')
    expect(() => repositoryLocalPaths(executable, true)).toThrow('Unsupported')
  })
})
