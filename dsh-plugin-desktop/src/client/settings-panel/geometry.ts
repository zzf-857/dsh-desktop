/** Pure CSS-pixel geometry; independent of Electron, React and upstream markup. */
export interface PanelRect { x: number; y: number; width: number; height: number }
export interface PanelBounds { width: number; height: number }
export type ResizeEdge = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw'
export type PanelGesture = 'move' | ResizeEdge
export interface PanelGeometryMemory { rect?: PanelRect }

export const RESIZE_EDGES: readonly ResizeEdge[] = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw']

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max)
function limits(bounds: PanelBounds) {
  const gap = Math.min(12, bounds.width / 4, bounds.height / 4)
  const width = Math.max(1, bounds.width - gap * 2)
  const height = Math.max(1, bounds.height - gap * 2)
  return { gap, width, height, minWidth: Math.min(720, width), minHeight: Math.min(380, height) }
}

/** Keep the entire panel, including its close button, inside the modal layer. */
export function constrainPanel(rect: PanelRect, bounds: PanelBounds): PanelRect {
  const limit = limits(bounds)
  const width = clamp(rect.width, limit.minWidth, limit.width)
  const height = clamp(rect.height, limit.minHeight, limit.height)
  return {
    x: clamp(rect.x, limit.gap, bounds.width - limit.gap - width),
    y: clamp(rect.y, limit.gap, bounds.height - limit.gap - height),
    width, height,
  }
}

/** Resize from the grabbed edge, keeping its opposite edge stationary. */
export function transformPanel(start: PanelRect, gesture: PanelGesture, dx: number, dy: number, bounds: PanelBounds): PanelRect {
  const rect = constrainPanel(start, bounds)
  if (gesture === 'move') return constrainPanel({ ...rect, x: rect.x + dx, y: rect.y + dy }, bounds)
  const limit = limits(bounds)
  let left = rect.x
  let top = rect.y
  let right = left + rect.width
  let bottom = top + rect.height
  if (gesture.includes('w')) left = clamp(left + dx, limit.gap, right - limit.minWidth)
  if (gesture.includes('e')) right = clamp(right + dx, left + limit.minWidth, bounds.width - limit.gap)
  if (gesture.includes('n')) top = clamp(top + dy, limit.gap, bottom - limit.minHeight)
  if (gesture.includes('s')) bottom = clamp(bottom + dy, top + limit.minHeight, bounds.height - limit.gap)
  return { x: left, y: top, width: right - left, height: bottom - top }
}
