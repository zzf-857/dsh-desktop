// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { attachWorkspaceFolderMenu } from '../src/client/workspace-folder-menu/dom-adapter.ts'

const disposers: (() => void)[] = []
afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose()
  document.body.replaceChildren()
})

function fixture(titles = ['Alpha', 'Beta']) {
  const workspaces = titles.map((title, index) => ({ title, path: `C:\\projects\\${index}` }))
  document.body.innerHTML = titles.map(title => `<div role="treeitem" aria-expanded="false"><span>${title}</span><span><span><button type="button" aria-label="actions"><svg></svg></button></span><button type="button" aria-label="new"></button></span></div>`).join('')
    + '<div role="treeitem">Ungrouped<button type="button"></button></div>'
  const rows = Array.from(document.querySelectorAll<HTMLElement>('[role="treeitem"][aria-expanded]'))
  const triggers = rows.map(row => row.querySelector<HTMLButtonElement>('button')!)
  const options = {
    document, getWorkspaces: () => workspaces, isLocalHost: () => true,
    label: () => '打开当前文件夹', openFolder: vi.fn(async (_path: string) => {}), reportError: vi.fn(),
  }
  for (const trigger of triggers) trigger.addEventListener('click', () => {
    document.querySelector('[role="menu"]')?.remove()
    const menu = document.createElement('div')
    menu.setAttribute('role', 'menu')
    menu.innerHTML = '<div role="presentation"><div><button type="button" role="menuitem"><span class="icon"></span><span class="label">Rename</span></button></div><div><button type="button" role="menuitem">Delete</button></div></div>'
    document.body.appendChild(menu)
  })
  const controller = attachWorkspaceFolderMenu(options)
  disposers.push(() => { controller.dispose() })
  return { rows, triggers, options, workspaces, controller }
}
const flush = async () => { await new Promise(resolve => { setTimeout(resolve, 0) }) }
const item = () => document.querySelector<HTMLButtonElement>('[data-dsh-workspace-open-folder]')

describe('Workspace folder menu', () => {
  it.each(['ellipsis', 'contextmenu'])('opens the clicked row through %s, not the selected Workspace', async action => {
    const f = fixture()
    if (action === 'ellipsis') f.triggers[1]!.click()
    else {
      const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
      f.rows[1]!.dispatchEvent(event)
      expect(event.defaultPrevented).toBe(true)
    }
    await flush()
    expect(Array.from(document.querySelectorAll('[role="menuitem"]')).map(node => node.textContent)).toEqual(['打开当前文件夹', 'Rename', 'Delete'])
    const escape = vi.fn()
    document.addEventListener('keydown', escape, { once: true })
    item()!.click()
    item()!.click()
    await flush()
    expect(escape).toHaveBeenCalledWith(expect.objectContaining({ key: 'Escape' }))
    expect(f.options.openFolder).toHaveBeenCalledExactlyOnceWith(f.workspaces[1]!.path)
  })
  it('distinguishes duplicate titles using the verified Host order', async () => {
    const f = fixture(['same', 'same'])
    f.triggers[1]!.click()
    await flush()
    item()!.click()
    expect(f.options.openFolder).toHaveBeenCalledWith(f.workspaces[1]!.path)
  })
  it('supports workspace titles with leading and trailing spaces', async () => {
    const f = fixture([' Alpha '])
    f.triggers[0]!.click()
    await flush()
    expect(item()).not.toBeNull()
  })
  it.each(['remote', 'reordered', 'filtered'])('fails inertly for %s rows', async mode => {
    const f = fixture()
    if (mode === 'remote') f.options.isLocalHost = () => false
    if (mode === 'reordered') f.workspaces.reverse()
    if (mode === 'filtered') f.rows[1]!.remove()
    f.triggers[0]!.click()
    await flush()
    expect(item()).toBeNull()
  })
  it('does not add a menu for Ungrouped or the new-session button', async () => {
    const f = fixture()
    const newSession = f.rows[0]!.querySelector('button[aria-label="new"]')!
    for (const target of [newSession, document.querySelector('[role="treeitem"]:last-child')!]) {
      const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
      target.dispatchEvent(event)
      expect(event.defaultPrevented).toBe(false)
    }
    await flush()
    expect(item()).toBeNull()
  })
  it('reports an open failure and removes only its own item on disposal', async () => {
    const f = fixture()
    const failure = new Error('missing')
    f.options.openFolder.mockRejectedValueOnce(failure)
    f.triggers[0]!.click()
    await flush()
    item()!.click()
    await flush()
    expect(f.options.reportError).toHaveBeenCalledWith(failure)
    f.controller.dispose()
    expect(item()).toBeNull()
    expect(document.querySelectorAll('[role="menuitem"]')).toHaveLength(2)
    f.triggers[0]!.click()
    await flush()
    expect(item()).toBeNull()
  })
})
