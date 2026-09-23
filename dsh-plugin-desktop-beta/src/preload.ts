/** Minimal context-isolated bridges for drag payloads and Desktop-owned actions. */

import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { DESKTOP_FILE_PATH_BRIDGE } from './file-path-bridge-contract.ts'
import {
  DESKTOP_RENDERER_ACTION_CHANNEL,
  DESKTOP_RENDERER_ACTIONS_BRIDGE,
  type DesktopRendererAction,
  type DesktopRendererActionsBridge,
} from './renderer-actions-contract.ts'
import {
  DESKTOP_WORKSPACE_FOLDER_BRIDGE,
  DESKTOP_WORKSPACE_FOLDER_CHANNEL,
  type DesktopWorkspaceFolderBridge,
} from './workspace-folder-bridge-contract.ts'

contextBridge.exposeInMainWorld(DESKTOP_FILE_PATH_BRIDGE, {
  /** Resolve only genuine disk-backed Web File objects selected by the operator. */
  getPathForFile(file: File): string {
    return webUtils.getPathForFile(file)
  },
})

const actions: DesktopRendererActionsBridge = {
  /** Reach the main process directly, independent of the Host generation. */
  invoke: (action: DesktopRendererAction) => ipcRenderer.invoke(DESKTOP_RENDERER_ACTION_CHANNEL, action),
}
contextBridge.exposeInMainWorld(DESKTOP_RENDERER_ACTIONS_BRIDGE, actions)

const workspaceFolders: DesktopWorkspaceFolderBridge = {
  /** Ask the main process to validate and open one local Workspace directory. */
  open: (path: string) => ipcRenderer.invoke(DESKTOP_WORKSPACE_FOLDER_CHANNEL, path),
}
contextBridge.exposeInMainWorld(DESKTOP_WORKSPACE_FOLDER_BRIDGE, workspaceFolders)
