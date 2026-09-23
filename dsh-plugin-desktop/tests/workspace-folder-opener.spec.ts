import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { openDesktopWorkspaceFolder } from '../src/workspace-folder-opener.ts'

function dependencies() {
  return { stat: vi.fn(async () => ({ isDirectory: (): boolean => true })), openPath: vi.fn(async () => '') }
}

describe('native Workspace folder opening', () => {
  it('opens an existing absolute directory without command-line interpolation', async () => {
    const deps = dependencies()
    const path = resolve('folder with spaces & 中文')
    await openDesktopWorkspaceFolder(path, deps)
    expect(deps.stat).toHaveBeenCalledWith(path)
    expect(deps.openPath).toHaveBeenCalledExactlyOnceWith(path)
  })
  it.each([undefined, null, {}, 42, '', 'relative/folder', 'https://example.com', 'file:///tmp', 'C:\\bad\0path', 'x'.repeat(32_769)])(
    'rejects invalid IPC input %# before touching the filesystem', async input => {
      const deps = dependencies()
      await expect(openDesktopWorkspaceFolder(input, deps)).rejects.toThrow('invalid')
      expect(deps.stat).not.toHaveBeenCalled()
      expect(deps.openPath).not.toHaveBeenCalled()
    },
  )
  it('rejects missing paths and regular files without launching them', async () => {
    const deps = dependencies()
    deps.stat.mockRejectedValueOnce(new Error('ENOENT'))
    await expect(openDesktopWorkspaceFolder(resolve('missing'), deps)).rejects.toThrow('unavailable')
    deps.stat.mockResolvedValueOnce({ isDirectory: () => false })
    await expect(openDesktopWorkspaceFolder(resolve('file.exe'), deps)).rejects.toThrow('not a directory')
    expect(deps.openPath).not.toHaveBeenCalled()
  })
  it('reports operating-system failures', async () => {
    const deps = dependencies()
    deps.openPath.mockResolvedValue('Failed to open')
    await expect(openDesktopWorkspaceFolder(resolve('folder'), deps)).rejects.toThrow('could not open')
  })
})
