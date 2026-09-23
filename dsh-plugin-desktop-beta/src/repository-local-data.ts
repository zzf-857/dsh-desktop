/** Opt-in repository-local runtime paths for the owner's Windows build. */
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

export const REPOSITORY_LOCAL_MARKER = 'dsh-local-mode.json'

interface LocalApp {
  readonly isPackaged: boolean
  setPath(name: 'userData' | 'sessionData' | 'crashDumps', path: string): void
}

let repositoryLocalMode = false

/** Normal release builds and headless packaging smokes have no marker. */
export function repositoryLocalPaths(executable: string, isPackaged: boolean):
  { homeDir: string; userDataDir: string; crashDumpsDir: string } | undefined {
  if (!isPackaged) return undefined
  const executableDir = dirname(executable)
  const markerPath = join(executableDir, REPOSITORY_LOCAL_MARKER)
  if (!existsSync(markerPath)) return undefined
  const marker: unknown = JSON.parse(readFileSync(markerPath, 'utf8'))
  if (typeof marker !== 'object' || marker === null || !('version' in marker) || marker.version !== 1) {
    throw new Error('Unsupported repository-local data marker; refusing to start with another data directory')
  }
  const dataRoot = resolve(executableDir, '..', '.local-data')
  return {
    homeDir: join(dataRoot, 'dsh-home'),
    userDataDir: join(dataRoot, 'electron'),
    crashDumpsDir: join(dataRoot, 'electron', 'Crashpad'),
  }
}

/** Must run before the single-instance lock or any Electron session is created. */
export function configureRepositoryLocalData(
  application: LocalApp,
  executable: string,
  environment: NodeJS.ProcessEnv,
): void {
  const paths = repositoryLocalPaths(executable, application.isPackaged)
  repositoryLocalMode = paths !== undefined
  if (paths === undefined) return
  for (const path of Object.values(paths)) mkdirSync(path, { recursive: true })
  application.setPath('userData', paths.userDataDir)
  application.setPath('sessionData', paths.userDataDir)
  application.setPath('crashDumps', paths.crashDumpsDir)
  environment.DSH_HOME = paths.homeDir
}

/** Fork builds are upgraded locally; the upstream installer must not replace them. */
export function isRepositoryLocalMode(): boolean {
  return repositoryLocalMode
}
