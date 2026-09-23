/** Semantic DOM adapter for the upstream Workspace row menu. */

export interface WorkspaceFolderMenuWorkspace {
  readonly path: string
  readonly title: string
}

export interface WorkspaceFolderMenuOptions {
  document: Document
  getWorkspaces(): readonly WorkspaceFolderMenuWorkspace[]
  isLocalHost(): boolean
  label(): string
  openFolder(path: string): Promise<void>
  reportError(cause: unknown): void
}

const ITEM_MARKER = 'data-dsh-workspace-open-folder'
const MENU_MARKER = 'data-dsh-workspace-folder-menu'
const MENU_TIMEOUT_MS = 1_000

export interface WorkspaceFolderMenuController {
  dispose(): void
}

interface PendingMenu {
  readonly path: string
  readonly trigger: HTMLButtonElement
  readonly knownMenus: ReadonlySet<HTMLElement>
  timer: ReturnType<typeof setTimeout>
}

function normalizedText(element: Element): string {
  return element.textContent ?? ''
}

/** Real Workspace rows have the upstream actions trigger plus the new-Session button. */
function workspaceRows(document: Document): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('[role="treeitem"]'))
    .filter(row => row.querySelectorAll<HTMLButtonElement>('button[type="button"]').length === 2)
}

function resolveWorkspace(
  document: Document,
  row: HTMLElement,
  workspaces: readonly WorkspaceFolderMenuWorkspace[],
): WorkspaceFolderMenuWorkspace | undefined {
  const rows = workspaceRows(document)
  if (rows.length !== workspaces.length) return undefined
  const index = rows.indexOf(row)
  if (index < 0) return undefined
  // The upstream grouped view preserves Host Workspace order. Verify every
  // visible label before using that order so search/flat modes fail inertly.
  if (!rows.every((candidate, candidateIndex) => normalizedText(candidate) === workspaces[candidateIndex]?.title)) {
    return undefined
  }
  return workspaces[index]
}

function folderIcon(document: Document): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('width', '16')
  svg.setAttribute('height', '16')
  svg.setAttribute('viewBox', '0 0 16 16')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', '1.25')
  svg.setAttribute('stroke-linecap', 'round')
  svg.setAttribute('stroke-linejoin', 'round')
  svg.setAttribute('aria-hidden', 'true')
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  path.setAttribute('d', 'M1.75 4.25h4l1.25 1.5h7.25v6.5a1.5 1.5 0 0 1-1.5 1.5h-9.5a1.5 1.5 0 0 1-1.5-1.5v-8Zm0 1.5V3.5A1.25 1.25 0 0 1 3 2.25h3.25l1.25 1.5h5.25A1.5 1.5 0 0 1 14.25 5.25v.5')
  svg.appendChild(path)
  return svg
}

function closeMenu(document: Document, item: HTMLButtonElement): void {
  item.focus()
  const KeyboardEventConstructor = document.defaultView?.KeyboardEvent
  if (KeyboardEventConstructor === undefined) return
  document.dispatchEvent(new KeyboardEventConstructor('keydown', { key: 'Escape', bubbles: true }))
}

function injectItem(
  menu: HTMLElement,
  path: string,
  options: WorkspaceFolderMenuOptions,
): HTMLButtonElement | undefined {
  if (menu.hasAttribute(MENU_MARKER) || menu.querySelectorAll('[role="menuitem"]').length !== 2) return undefined
  const firstItem = menu.querySelector<HTMLButtonElement>('[role="menuitem"]')
  const firstWrapper = firstItem?.parentElement
  if (firstItem === null || firstItem === undefined || firstWrapper === null || firstWrapper === undefined) return undefined

  const wrapper = firstWrapper.cloneNode(true) as HTMLElement
  const item = wrapper.querySelector<HTMLButtonElement>('[role="menuitem"]')
  if (item === null) return undefined
  item.removeAttribute('aria-haspopup')
  item.removeAttribute('aria-expanded')
  item.removeAttribute('disabled')
  item.setAttribute(ITEM_MARKER, '')

  const originalChildren = Array.from(firstItem.children)
  const iconClass = originalChildren.find(child => normalizedText(child) === '')?.getAttribute('class')
  const labelClass = originalChildren.find(child => normalizedText(child) !== '')?.getAttribute('class')
  const icon = options.document.createElement('span')
  if (iconClass !== null && iconClass !== undefined) icon.setAttribute('class', iconClass)
  icon.appendChild(folderIcon(options.document))
  const label = options.document.createElement('span')
  if (labelClass !== null && labelClass !== undefined) label.setAttribute('class', labelClass)
  label.textContent = options.label()
  item.replaceChildren(icon, label)

  let opening = false
  item.addEventListener('click', event => {
    event.preventDefault()
    event.stopPropagation()
    if (opening || !options.isLocalHost() || !options.getWorkspaces().some(workspace => workspace.path === path)) return
    opening = true
    closeMenu(options.document, item)
    item.disabled = true
    void options.openFolder(path).catch(options.reportError)
  })
  firstWrapper.before(wrapper)
  menu.setAttribute(MENU_MARKER, '')

  // The upstream portal measured two rows before this third row existed.
  // A resize notification asks its public placement listener to measure again.
  const view = options.document.defaultView
  view?.requestAnimationFrame?.(() => { view.dispatchEvent(new view.Event('resize')) })
  return item
}

function addedMenus(records: readonly MutationRecord[]): HTMLElement[] {
  const menus: HTMLElement[] = []
  for (const record of records) {
    for (const node of record.addedNodes) {
      if (!(node instanceof Element)) continue
      if (node.getAttribute('role') === 'menu') menus.push(node as HTMLElement)
      menus.push(...node.querySelectorAll<HTMLElement>('[role="menu"]'))
    }
  }
  return menus
}

/**
 * Add one Desktop-only action to the upstream two-item Workspace menu and let
 * a right click open that same menu. The adapter relies only on ARIA roles,
 * button counts, Host ordering, and exact labels; an upstream shape change
 * disables the enhancement instead of guessing at another row.
 */
export function attachWorkspaceFolderMenu(options: WorkspaceFolderMenuOptions): WorkspaceFolderMenuController {
  const { document } = options
  let pending: PendingMenu | undefined
  let activeMenu: HTMLElement | undefined
  let activeTrigger: HTMLButtonElement | undefined
  let disposed = false

  const clearPending = () => {
    if (pending === undefined) return
    clearTimeout(pending.timer)
    pending = undefined
  }

  const prepare = (trigger: HTMLButtonElement, row: HTMLElement): boolean => {
    if (!options.isLocalHost()) return false
    const workspace = resolveWorkspace(document, row, options.getWorkspaces())
    if (workspace === undefined) return false
    clearPending()
    const next: PendingMenu = {
      path: workspace.path,
      trigger,
      knownMenus: new Set(document.querySelectorAll<HTMLElement>('[role="menu"]')),
      timer: setTimeout(() => {
        if (pending === next) pending = undefined
      }, MENU_TIMEOUT_MS),
    }
    pending = next
    return true
  }

  const onClick = (event: MouseEvent) => {
    const target = event.target
    if (!(target instanceof Element)) return
    const row = target.closest<HTMLElement>('[role="treeitem"]')
    if (row === null) return
    const buttons = Array.from(row.querySelectorAll<HTMLButtonElement>('button[type="button"]'))
    if (buttons.length !== 2) return
    const trigger = buttons[0]
    if (trigger === undefined || !trigger.contains(target)) return
    prepare(trigger, row)
  }

  const onContextMenu = (event: MouseEvent) => {
    const target = event.target
    if (!(target instanceof Element)) return
    const row = target.closest<HTMLElement>('[role="treeitem"]')
    if (row === null) return
    const buttons = Array.from(row.querySelectorAll<HTMLButtonElement>('button[type="button"]'))
    if (buttons.length !== 2) return
    const trigger = buttons[0]
    if (trigger === undefined || target.closest('button') === buttons[1]) return
    if (!prepare(trigger, row)) return
    event.preventDefault()
    event.stopPropagation()
    if (activeTrigger !== trigger || activeMenu?.isConnected !== true) trigger.click()
  }

  const observer = new MutationObserver(records => {
    if (pending === undefined || disposed) return
    const menu = addedMenus(records).find(candidate => !pending?.knownMenus.has(candidate))
    if (menu === undefined) return
    const prepared = pending
    clearPending()
    const row = prepared.trigger.closest<HTMLElement>('[role="treeitem"]')
    if (!options.isLocalHost() || row === null || !row.isConnected
      || resolveWorkspace(document, row, options.getWorkspaces())?.path !== prepared.path) return
    if (injectItem(menu, prepared.path, options) === undefined) return
    activeMenu = menu
    activeTrigger = prepared.trigger
  })
  observer.observe(document.body, { childList: true, subtree: true })
  document.addEventListener('click', onClick, true)
  document.addEventListener('contextmenu', onContextMenu, true)

  return {
    dispose() {
      if (disposed) return
      disposed = true
      clearPending()
      observer.disconnect()
      document.removeEventListener('click', onClick, true)
      document.removeEventListener('contextmenu', onContextMenu, true)
      for (const item of document.querySelectorAll(`[${ITEM_MARKER}]`)) item.parentElement?.remove()
      for (const menu of document.querySelectorAll(`[${MENU_MARKER}]`)) menu.removeAttribute(MENU_MARKER)
    },
  }
}
