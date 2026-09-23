/** Validation and native dispatch for opening a Workspace directory. */

import { isAbsolute } from 'node:path'

export interface WorkspaceFolderInfo {
  isDirectory(): boolean
}

export interface WorkspaceFolderOpenerDependencies {
  stat(path: string): Promise<WorkspaceFolderInfo>
  openPath(path: string): Promise<string>
}

const MAX_PATH_LENGTH = 32_768

/**
 * Open one renderer-requested Workspace directory without accepting files,
 * relative paths, NUL-containing strings, or native shell failures.
 * @param input - untrusted IPC payload from the renderer.
 * @param dependencies - filesystem and Electron shell adapters.
 */
export async function openDesktopWorkspaceFolder(
  input: unknown,
  dependencies: WorkspaceFolderOpenerDependencies,
): Promise<void> {
  if (typeof input !== 'string' || input.length === 0 || input.length > MAX_PATH_LENGTH
    || input.includes('\0') || !isAbsolute(input)) {
    throw new Error('dsh-plugin-desktop: invalid Workspace folder path')
  }

  let info: WorkspaceFolderInfo
  try {
    info = await dependencies.stat(input)
  } catch {
    throw new Error('dsh-plugin-desktop: Workspace folder is unavailable')
  }
  if (!info.isDirectory()) {
    throw new Error('dsh-plugin-desktop: Workspace folder path is not a directory')
  }

  const openError = await dependencies.openPath(input)
  if (openError !== '') {
    throw new Error('dsh-plugin-desktop: operating system could not open the Workspace folder')
  }
}
