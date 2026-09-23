/** The only upstream DOM seam: the public settings action slot and dialog semantics. */
import { constrainPanel, RESIZE_EDGES, transformPanel } from './geometry.ts'
import type { PanelBounds, PanelGeometryMemory, PanelGesture, PanelRect, ResizeEdge } from './geometry.ts'

export interface SettingsPanelHost {
  panel: HTMLElement
  overlay: HTMLElement
  actions: HTMLElement
  title: HTMLElement
}
export interface SettingsPanelController {
  reset(): void
  dispose(): void
}
const INTERACTIVE = 'button, a, input, textarea, select, summary, [role="button"], [role="menuitem"], [role="slider"], [role="switch"], [contenteditable]:not([contenteditable="false"])'
const MOVE = '[data-dsh-settings-move]'
const RESIZE = '[data-dsh-settings-resize]'

/** Fail inertly if an upstream update changes the shell contract; never match CSS hashes. */
export function resolveSettingsPanelHost(anchor: HTMLElement): SettingsPanelHost | undefined {
  const panel = anchor.closest<HTMLElement>('[role="dialog"][aria-modal="true"]')
  const actions = anchor.closest<HTMLElement>('[data-slot="settings.action"]')
  const overlay = panel?.parentElement
  const titleId = panel?.getAttribute('aria-labelledby')?.split(/\s+/u)[0]
  const title = titleId ? anchor.ownerDocument.getElementById(titleId) : null
  if (!panel || !actions || !panel.contains(actions) || !title || !panel.contains(title)
    || !overlay || overlay.getAttribute('role') !== 'presentation') return undefined
  return { panel, overlay, actions, title }
}

/** Own only geometry, pointer listeners and a marker; all changes are reversible. */
export function attachSettingsPanel(host: SettingsPanelHost, memory: PanelGeometryMemory): SettingsPanelController | undefined {
  const { panel, overlay, actions, title } = host
  const view = panel.ownerDocument.defaultView
  if (!view || panel.hasAttribute('data-dsh-settings-panel')) return undefined
  const initialLayer = overlay.getBoundingClientRect()
  const initialPanel = panel.getBoundingClientRect()
  if (initialLayer.width <= 0 || initialLayer.height <= 0 || initialPanel.width <= 0 || initialPanel.height <= 0) return undefined

  const styles = new Map<string, { value: string; priority: string; last: string }>()
  const writeStyle = (name: string, value: string) => {
    let saved = styles.get(name)
    if (!saved) {
      saved = { value: panel.style.getPropertyValue(name), priority: panel.style.getPropertyPriority(name), last: '' }
      styles.set(name, saved)
    }
    panel.style.setProperty(name, value)
    saved.last = panel.style.getPropertyValue(name)
  }
  const restoreStyle = (name: string) => {
    const saved = styles.get(name)
    if (!saved || panel.style.getPropertyValue(name) !== saved.last) return
    panel.style.setProperty(name, saved.value, saved.priority)
    saved.last = saved.value
  }
  const bounds = (): PanelBounds => {
    const box = overlay.getBoundingClientRect()
    return { width: box.width, height: box.height }
  }
  const originalSize = { width: initialPanel.width, height: initialPanel.height }
  let rect = memory.rect ?? {
    x: initialPanel.left - initialLayer.left, y: initialPanel.top - initialLayer.top, ...originalSize,
  }
  let disposed = false
  let drag: { pointerId: number; x: number; y: number; start: PanelRect; gesture: PanelGesture } | undefined
  const render = (next: PanelRect) => {
    rect = constrainPanel(next, bounds())
    memory.rect = { ...rect }
    writeStyle('left', rect.x + 'px')
    writeStyle('top', rect.y + 'px')
    writeStyle('width', rect.width + 'px')
    writeStyle('height', rect.height + 'px')
  }
  panel.setAttribute('data-dsh-settings-panel', '1')
  for (const [key, value] of Object.entries({
    position: 'absolute', margin: '0', transform: 'none', 'max-width': 'none', 'max-height': 'none',
    'box-sizing': 'border-box', '-webkit-app-region': 'no-drag',
  })) writeStyle(key, value)
  render(rect)

  const elementOf = (target: EventTarget | null): Element | undefined => target instanceof view.Element ? target : undefined
  const isMoveTarget = (target: Element, clientY: number): boolean => {
    if (target.closest('[role="dialog"]') !== panel) return false
    if (target.closest(MOVE)) return true
    if (target.closest(INTERACTIVE)) return false
    // The title and action slot establish the header band without structural/CSS selectors.
    const top = overlay.getBoundingClientRect().top + rect.y
    const bottoms = [title.getBoundingClientRect().bottom]
    for (const control of actions.querySelectorAll<HTMLElement>(INTERACTIVE)) {
      if (control.getClientRects().length > 0) bottoms.push(control.getBoundingClientRect().bottom)
    }
    const headerHeight = Math.max(48, Math.min(96, Math.max(...bottoms) - top + 6))
    return clientY >= top && clientY <= top + headerHeight
  }
  const finish = () => {
    const pointerId = drag?.pointerId
    drag = undefined
    if (pointerId !== undefined && panel.hasPointerCapture?.(pointerId)) panel.releasePointerCapture(pointerId)
    restoreStyle('user-select')
    restoreStyle('cursor')
  }
  const pointerDown = (event: PointerEvent) => {
    const target = elementOf(event.target)
    if (!target || event.button !== 0 || event.isPrimary === false || drag) return
    const edge = target.closest(RESIZE)?.getAttribute('data-dsh-settings-resize') as ResizeEdge | undefined
    const gesture = edge && RESIZE_EDGES.includes(edge) ? edge : isMoveTarget(target, event.clientY) ? 'move' : undefined
    if (!gesture) return
    event.preventDefault()
    const control = target.closest<HTMLElement>(MOVE + ', ' + RESIZE)
    if (control?.tagName === 'BUTTON') control.focus({ preventScroll: true })
    drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, start: { ...rect }, gesture }
    writeStyle('user-select', 'none')
    writeStyle('cursor', gesture === 'move' ? 'grabbing' : gesture + '-resize')
    panel.setPointerCapture?.(event.pointerId)
  }
  const pointerMove = (event: PointerEvent) => {
    if (drag) {
      if (event.pointerId !== drag.pointerId) return
      event.preventDefault()
      render(transformPanel(drag.start, drag.gesture, event.clientX - drag.x, event.clientY - drag.y, bounds()))
    } else {
      const target = elementOf(event.target)
      if (target && isMoveTarget(target, event.clientY)) writeStyle('cursor', 'grab')
      else restoreStyle('cursor')
    }
  }
  const pointerEnd = (event: PointerEvent) => {
    if (drag?.pointerId === event.pointerId) finish()
  }
  const reset = () => {
    finish()
    const area = bounds()
    render({ x: (area.width - originalSize.width) / 2, y: (area.height - originalSize.height) / 2, ...originalSize })
  }
  const doubleClick = (event: MouseEvent) => {
    const target = elementOf(event.target)
    if (target && isMoveTarget(target, event.clientY)) reset()
  }
  const keyDown = (event: KeyboardEvent) => {
    const target = elementOf(event.target)
    if (!target || event.altKey || event.metaKey || event.ctrlKey) return
    const gesture = target.closest(MOVE) ? 'move' : target.closest(RESIZE) ? 'se' : undefined
    const delta: Record<string, readonly [number, number]> = {
      ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
    }
    const direction = delta[event.key]
    if (!gesture || !direction) return
    event.preventDefault()
    event.stopPropagation()
    const step = event.shiftKey ? 40 : 8
    render(transformPanel(rect, gesture, direction[0] * step, direction[1] * step, bounds()))
  }
  const resized = () => {
    if (disposed) return
    const area = bounds()
    if (area.width <= 0 || area.height <= 0) return
    finish()
    render(rect)
  }
  const leave = () => { if (!drag) restoreStyle('cursor') }
  panel.addEventListener('pointerdown', pointerDown)
  panel.addEventListener('pointermove', pointerMove)
  panel.addEventListener('pointerup', pointerEnd)
  panel.addEventListener('pointercancel', pointerEnd)
  panel.addEventListener('lostpointercapture', pointerEnd)
  panel.addEventListener('pointerleave', leave)
  panel.addEventListener('dblclick', doubleClick)
  panel.addEventListener('keydown', keyDown)
  view.addEventListener('resize', resized)
  view.addEventListener('blur', finish)
  const observer = typeof view.ResizeObserver === 'function' ? new view.ResizeObserver(resized) : undefined
  observer?.observe(overlay)
  return {
    reset,
    dispose() {
      if (disposed) return
      disposed = true
      finish()
      observer?.disconnect()
      panel.removeEventListener('pointerdown', pointerDown)
      panel.removeEventListener('pointermove', pointerMove)
      panel.removeEventListener('pointerup', pointerEnd)
      panel.removeEventListener('pointercancel', pointerEnd)
      panel.removeEventListener('lostpointercapture', pointerEnd)
      panel.removeEventListener('pointerleave', leave)
      panel.removeEventListener('dblclick', doubleClick)
      panel.removeEventListener('keydown', keyDown)
      view.removeEventListener('resize', resized)
      view.removeEventListener('blur', finish)
      for (const name of styles.keys()) restoreStyle(name)
      panel.removeAttribute('data-dsh-settings-panel')
    },
  }
}
