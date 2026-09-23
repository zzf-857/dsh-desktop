/** Additive settings.action plugin; no replacement of the upstream settings shell. */
import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { CSSProperties } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { attachSettingsPanel, resolveSettingsPanelHost } from './dom-adapter.ts'
import type { SettingsPanelController, SettingsPanelHost } from './dom-adapter.ts'
import { RESIZE_EDGES } from './geometry.ts'
import type { PanelGeometryMemory, ResizeEdge } from './geometry.ts'

const en = {
  move: 'Move settings panel',
  moveHint: 'Drag to move; arrow keys to nudge; double-click to reset',
  resize: 'Resize settings panel',
  resizeHint: 'Drag to resize; arrow keys to adjust',
}
const zh: typeof en = {
  move: '移动设置面板',
  moveHint: '拖动移动；方向键微调；双击恢复默认位置和大小',
  resize: '调整设置面板大小',
  resizeHint: '拖动调整大小；方向键微调',
}
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { 'desktop.settings-panel': keyof typeof en }
}

type ControlsProps = PropsRuntime<'settings.action'> & PropsLocale<'desktop.settings-panel'>
  & InjectFace<{ memory: PanelGeometryMemory }>

const edgeStyle: Record<ResizeEdge, CSSProperties> = {
  n: { top: 0, left: 24, right: 24, height: 6 },
  ne: { top: 0, right: 0, width: 24, height: 24 },
  e: { top: 24, right: 0, bottom: 24, width: 6 },
  se: { bottom: 6, right: 6, width: 24, height: 24 },
  s: { bottom: 0, left: 24, right: 30, height: 6 },
  sw: { bottom: 0, left: 0, width: 24, height: 24 },
  w: { top: 24, left: 0, bottom: 24, width: 6 },
  nw: { top: 0, left: 0, width: 24, height: 24 },
}

/** Mount only while the upstream panel renders its public action slot. */
export function SettingsPanelControls({ memory, t }: ControlsProps) {
  const anchor = useRef<HTMLSpanElement>(null)
  const [binding, setBinding] = useState<{ host: SettingsPanelHost; controller: SettingsPanelController }>()
  useLayoutEffect(() => {
    const host = anchor.current && resolveSettingsPanelHost(anchor.current)
    if (!host) return
    const controller = attachSettingsPanel(host, memory)
    if (!controller) return
    setBinding({ host, controller })
    return () => { controller.dispose() }
  }, [memory])
  return <>
    <span ref={anchor} hidden data-dsh-settings-anchor="" />
    {binding && <button type="button" className="dshSettingsPanelMove" data-dsh-settings-move=""
      aria-label={t('move')} title={t('moveHint')}>
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25" aria-hidden="true">
        <path d="M8 1.5v13M1.5 8h13M5.5 4 8 1.5 10.5 4M5.5 12 8 14.5 10.5 12M4 5.5 1.5 8 4 10.5M12 5.5 14.5 8 12 10.5" />
      </svg>
    </button>}
    {binding && createPortal(<div data-dsh-settings-handles="" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 5 }}>
      {RESIZE_EDGES.map(edge => {
        const style: CSSProperties = { ...edgeStyle[edge], position: 'absolute', pointerEvents: 'auto', touchAction: 'none', cursor: edge + '-resize' }
        return edge === 'se'
          ? <button key={edge} type="button" data-dsh-settings-resize={edge} className="dshSettingsPanelResize"
              style={style} aria-label={t('resize')} title={t('resizeHint')}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.25" aria-hidden="true">
                <path d="M3 11 11 3M7 11l4-4" />
              </svg>
            </button>
          : <div key={edge} data-dsh-settings-resize={edge} style={style} aria-hidden="true" />
      })}
    </div>, binding.host.panel)}
  </>
}

const CSS = `
.dshSettingsPanelMove, .dshSettingsPanelResize {
  display: inline-flex; align-items: center; justify-content: center; flex: none;
  box-sizing: border-box; padding: 0; border: 0; border-radius: 6px;
  color: var(--dsw-alias-label-secondary, currentColor); background: transparent;
  touch-action: none; -webkit-app-region: no-drag;
}
.dshSettingsPanelMove { width: 26px; height: 26px; cursor: grab; }
.dshSettingsPanelMove:hover, .dshSettingsPanelResize:hover { background: var(--dsw-alias-interactive-bg-hover, #8882); }
.dshSettingsPanelMove:focus-visible, .dshSettingsPanelResize:focus-visible { outline: 2px solid var(--dsw-alias-interactive-primary, #5b8def); outline-offset: -2px; }
.dshSettingsPanelResize { opacity: .65; }
`

export function applySettingsPanelEnhancement(ctx: Context): void {
  const memory: PanelGeometryMemory = {}
  ctx.effect(() => ctx.locale.register('desktop.settings-panel', { en, zh }), 'desktop: settings panel geometry copy')
  ctx.effect(() => {
    if (typeof document === 'undefined') return () => {}
    const style = document.createElement('style')
    style.dataset.pluginCss = 'dsh-plugin-desktop/settings-panel'
    style.textContent = CSS
    document.head.appendChild(style)
    return () => { style.remove() }
  }, 'desktop: settings panel geometry styles')
  ctx.slots.inject('settings.action', () => ctx.slots.register({
    name: 'settings.action', id: 'desktop-panel-geometry', order: -100,
    locale: 'desktop.settings-panel', inject: () => ({ memory }),
  }, SettingsPanelControls))
}
