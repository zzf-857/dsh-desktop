/** Desktop-only "Open current folder" contribution for Workspace row menus. */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-workspace-controller/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import {
  DESKTOP_WORKSPACE_FOLDER_BRIDGE,
  type DesktopWorkspaceFolderBridge,
} from '../../workspace-folder-bridge-contract.ts'
import { attachWorkspaceFolderMenu } from './dom-adapter.ts'

const en = {
  openCurrentFolder: 'Open current folder',
  openFailed: 'Could not open the Workspace folder.',
}
const zh: typeof en = {
  openCurrentFolder: '打开当前文件夹',
  openFailed: '无法打开工作区文件夹。',
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { 'desktop.workspace-folder-menu': keyof typeof en }
}

/** Resolve only the exact context-isolated capability published by Desktop. */
export function desktopWorkspaceFolderBridge(
  scope: Record<string, unknown> = globalThis as unknown as Record<string, unknown>,
): DesktopWorkspaceFolderBridge | undefined {
  const bridge: unknown = scope[DESKTOP_WORKSPACE_FOLDER_BRIDGE]
  if (bridge === null || typeof bridge !== 'object') return undefined
  return typeof (bridge as { open?: unknown }).open === 'function'
    ? bridge as DesktopWorkspaceFolderBridge
    : undefined
}

function showOpenError(document: Document, message: string): void {
  document.querySelector('[data-dsh-workspace-folder-error]')?.remove()
  const alert = document.createElement('div')
  alert.dataset.dshWorkspaceFolderError = ''
  alert.className = 'dshWorkspaceFolderError'
  alert.setAttribute('role', 'alert')
  alert.textContent = message
  document.body.appendChild(alert)
  setTimeout(() => { alert.remove() }, 4_000)
}

const CSS = `
.dshWorkspaceFolderError {
  position: fixed; z-index: 2147483647; left: 50%; bottom: 24px;
  transform: translateX(-50%); max-width: min(420px, calc(100vw - 32px));
  padding: 9px 12px; border: 1px solid var(--dsw-alias-border-error, #ef444466);
  border-radius: 8px; color: var(--dsw-alias-label-primary, #fff);
  background: var(--dsw-alias-bg-elevated, #242428);
  box-shadow: 0 10px 30px #0005; font-size: 13px; line-height: 20px;
  pointer-events: none; -webkit-app-region: no-drag;
}
`

/** Install the native menu action without changing the upstream browser component. */
export function applyWorkspaceFolderMenuEnhancement(ctx: Context): void {
  ctx.effect(
    () => ctx.locale.register('desktop.workspace-folder-menu', { en, zh }),
    'desktop: Workspace folder menu copy',
  )
  ctx.effect(() => {
    const style = document.createElement('style')
    style.dataset.pluginCss = 'dsh-plugin-desktop/workspace-folder-menu'
    style.textContent = CSS
    document.head.appendChild(style)
    return () => { style.remove(); document.querySelector('[data-dsh-workspace-folder-error]')?.remove() }
  }, 'desktop: Workspace folder menu styles')

  const t = ctx.locale.bind('desktop.workspace-folder-menu')
  ctx.inject(['workspaces'], scope => {
    scope.effect(() => {
      const bridge = desktopWorkspaceFolderBridge()
      if (bridge === undefined) return () => {}
      const controller = attachWorkspaceFolderMenu({
        document,
        getWorkspaces: () => scope.workspaces.list.getSnapshot().items,
        isLocalHost: () => scope.remote.$host.isLoopback,
        label: () => t('openCurrentFolder'),
        openFolder: path => bridge.open(path),
        reportError: cause => {
          console.error('dsh-plugin-desktop: failed to open Workspace folder', cause)
          showOpenError(document, t('openFailed'))
        },
      })
      return () => { controller.dispose() }
    }, 'dsh-plugin-desktop: Workspace folder menu adapter')
  })
}
