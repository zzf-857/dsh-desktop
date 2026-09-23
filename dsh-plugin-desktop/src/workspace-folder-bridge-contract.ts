/** Context-isolated bridge for opening one local Workspace directory. */

/** Main-world key exposed by the Desktop preload. */
export const DESKTOP_WORKSPACE_FOLDER_BRIDGE = 'dshDesktopWorkspaceFolder'

/** Renderer-to-main channel for one validated local directory path. */
export const DESKTOP_WORKSPACE_FOLDER_CHANNEL = 'dsh-desktop:open-workspace-folder'

/** Native folder-opening capability published to the Desktop renderer. */
export interface DesktopWorkspaceFolderBridge {
  /** Open an absolute local Workspace directory in the operating system file manager. */
  open(path: string): Promise<void>
}
