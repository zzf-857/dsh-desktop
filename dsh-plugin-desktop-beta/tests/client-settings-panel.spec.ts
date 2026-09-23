// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { constrainPanel, transformPanel } from '../src/client/settings-panel/geometry.ts'
import type { PanelGeometryMemory, PanelRect } from '../src/client/settings-panel/geometry.ts'
import { attachSettingsPanel, resolveSettingsPanelHost } from '../src/client/settings-panel/dom-adapter.ts'

const cleanups: (() => void)[] = []
afterEach(() => { for (const dispose of cleanups.splice(0)) dispose(); document.body.replaceChildren() })

function fixture() {
  document.body.innerHTML = `<div role="presentation">
    <div role="dialog" aria-modal="true" aria-labelledby="settings-title" style="position:relative;width:800px;color:red">
      <nav><div id="settings-title">Settings</div><button id="section">Section</button></nav>
      <div><div data-slot="settings.action"><span id="anchor" hidden></span>
        <button data-dsh-settings-move>Move</button><button id="action">Open config</button>
      </div><input id="field" /><div id="content">Scrollable settings</div></div>
      <div data-dsh-settings-resize="e"></div><button data-dsh-settings-resize="se">Resize</button>
    </div>
  </div>`
  const panel = document.querySelector<HTMLElement>('[role="dialog"]')!
  const overlay = panel.parentElement!
  let area = { width: 1280, height: 900 }
  const box = (x: number, y: number, width: number, height: number): DOMRect =>
    ({ x, y, left: x, top: y, right: x + width, bottom: y + height, width, height, toJSON() {} })
  const read = (): PanelRect => ({
    x: Number.parseFloat(panel.style.left) || 240,
    y: Number.parseFloat(panel.style.top) || 50,
    width: Number.parseFloat(panel.style.width) || 800,
    height: Number.parseFloat(panel.style.height) || 800,
  })
  vi.spyOn(overlay, 'getBoundingClientRect').mockImplementation(() => box(0, 36, area.width, area.height))
  vi.spyOn(panel, 'getBoundingClientRect').mockImplementation(() => {
    const r = read(); return box(r.x, r.y + 36, r.width, r.height)
  })
  vi.spyOn(document.getElementById('settings-title')!, 'getBoundingClientRect')
    .mockImplementation(() => { const r = read(); return box(r.x + 24, r.y + 58, 100, 24) })
  const captured = new Set<number>()
  panel.setPointerCapture = vi.fn(id => { captured.add(id) })
  panel.hasPointerCapture = vi.fn(id => captured.has(id))
  panel.releasePointerCapture = vi.fn(id => { captured.delete(id) })
  const anchor = document.getElementById('anchor')!
  const host = resolveSettingsPanelHost(anchor)!
  return { panel, anchor, host, read, captured, setArea: (width: number, height: number) => { area = { width, height } } }
}

function pointer(target: Element, type: string, x: number, y: number, pointerId = 1, button = 0) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button })
  Object.defineProperties(event, { pointerId: { value: pointerId }, isPrimary: { value: true } })
  target.dispatchEvent(event)
  return event
}

describe('settings panel geometry', () => {
  const rect = { x: 200, y: 100, width: 800, height: 500 }
  const area = { width: 1400, height: 900 }
  it('keeps the full panel reachable when dragging beyond every edge', () => {
    expect(transformPanel(rect, 'move', -900, 900, area)).toEqual({ ...rect, x: 12, y: 388 })
  })
  it('resizes opposite corners while keeping the fixed corner stationary', () => {
    expect(transformPanel(rect, 'nw', -100, -50, area)).toEqual({ x: 100, y: 50, width: 900, height: 550 })
    expect(transformPanel(rect, 'se', 100, 50, area)).toEqual({ ...rect, width: 900, height: 550 })
  })
  it.each(['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'] as const)('bounds the %s handle without inverting the panel', edge => {
    const changed = transformPanel(rect, edge, 5000, -5000, area)
    expect(changed.width).toBeGreaterThanOrEqual(720)
    expect(changed.height).toBeGreaterThanOrEqual(380)
    expect(changed.x).toBeGreaterThanOrEqual(12)
    expect(changed.y).toBeGreaterThanOrEqual(12)
    expect(changed.x + changed.width).toBeLessThanOrEqual(1388)
    expect(changed.y + changed.height).toBeLessThanOrEqual(888)
  })
  it('reduces minimum size to fit a smaller viewport', () => {
    expect(constrainPanel(rect, { width: 600, height: 340 })).toEqual({ x: 12, y: 12, width: 576, height: 316 })
  })
})

describe('settings panel semantic DOM adapter', () => {
  it('uses the action slot and ARIA relationships without class names, and fails inertly on an unfamiliar shell', () => {
    const f = fixture()
    expect(resolveSettingsPanelHost(f.anchor)?.panel).toBe(f.panel)
    f.panel.className = 'completely-new-upstream-class'
    expect(resolveSettingsPanelHost(f.anchor)?.panel).toBe(f.panel)
    f.panel.removeAttribute('aria-labelledby')
    expect(resolveSettingsPanelHost(f.anchor)).toBeUndefined()
    expect(f.panel.style.position).toBe('relative')
  })
  it('moves from the title, captures one pointer and releases on cancellation', () => {
    const f = fixture()
    const memory: PanelGeometryMemory = {}
    cleanups.push(attachSettingsPanel(f.host, memory)!.dispose)
    pointer(document.getElementById('settings-title')!, 'pointerdown', 300, 120)
    pointer(f.panel, 'pointermove', 390, 165, 2)
    expect(f.read().x).toBe(240)
    pointer(f.panel, 'pointermove', 390, 165)
    expect(f.read()).toEqual({ x: 330, y: 88, width: 800, height: 800 })
    expect(f.captured.has(1)).toBe(true)
    pointer(f.panel, 'pointercancel', 390, 165)
    expect(f.captured.size).toBe(0)
    expect(f.panel.style.userSelect).toBe('')
    pointer(f.panel, 'pointermove', 700, 400)
    expect(f.read().x).toBe(330)
  })
  it('leaves header actions, inputs and section navigation interactive', () => {
    const f = fixture()
    cleanups.push(attachSettingsPanel(f.host, {})!.dispose)
    for (const id of ['action', 'field', 'section']) {
      expect(pointer(document.getElementById(id)!, 'pointerdown', 300, 120).defaultPrevented).toBe(false)
    }
    expect(pointer(f.panel, 'pointerdown', 300, 120, 1, 2).defaultPrevented).toBe(false)
    expect(f.captured.size).toBe(0)
  })
  it('resizes through its own edge handles and supports keyboard resize', () => {
    const f = fixture()
    cleanups.push(attachSettingsPanel(f.host, {})!.dispose)
    pointer(f.panel.querySelector('[data-dsh-settings-resize="e"]')!, 'pointerdown', 1040, 300)
    pointer(f.panel, 'pointermove', 1180, 300)
    pointer(f.panel, 'pointerup', 1180, 300)
    expect(f.read().width).toBe(940)
    const handle = f.panel.querySelector('[data-dsh-settings-resize="se"]')!
    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, shiftKey: true }))
    expect(f.read().width).toBe(900)
  })
  it('constrains remembered geometry on viewport resize and restores styles/listeners on unmount', () => {
    const f = fixture()
    const memory: PanelGeometryMemory = { rect: { x: 350, y: 80, width: 900, height: 700 } }
    const before = f.panel.getAttribute('style')
    const controller = attachSettingsPanel(f.host, memory)!
    expect(attachSettingsPanel(f.host, {})).toBeUndefined()
    f.setArea(800, 600)
    window.dispatchEvent(new Event('resize'))
    expect(f.read()).toEqual({ x: 12, y: 12, width: 776, height: 576 })
    f.panel.style.color = 'blue'
    controller.dispose()
    expect(f.panel.style.position).toBe('relative')
    expect(f.panel.style.width).toBe('800px')
    expect(f.panel.style.left).toBe('')
    expect(f.panel.style.color).toBe('blue')
    expect(f.panel.hasAttribute('data-dsh-settings-panel')).toBe(false)
    expect(pointer(f.panel, 'pointerdown', 300, 120).defaultPrevented).toBe(false)
    expect(before).not.toBeNull()
  })
})
