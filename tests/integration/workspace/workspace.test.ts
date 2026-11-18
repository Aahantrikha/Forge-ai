import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WorkspaceService, type WorkspaceDialogs } from '../../../electron/workspace'
import { IpcChannels } from '../../../src/shared/ipc'

interface Harness {
  base: string
  root: string
  userData: string
  service: WorkspaceService
  send: ReturnType<typeof vi.fn>
  allowDelete: { value: boolean }
}

const harnesses: Harness[] = []

function makeHarness(): Harness {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-ws-'))
  const root = path.join(base, 'project')
  const userData = path.join(base, 'user-data')
  fs.mkdirSync(root, { recursive: true })
  fs.mkdirSync(userData, { recursive: true })

  const send = vi.fn()
  const allowDelete = { value: true }
  const dialogs: WorkspaceDialogs = {
    showOpenDialog: vi.fn(async () => ({ canceled: true, filePaths: [] })),
    showMessageBox: vi.fn(async () => ({ response: allowDelete.value ? 0 : 1 })),
  }

  const service = new WorkspaceService({
    userDataPath: userData,
    getWindow: () => ({ webContents: { send } } as never),
    dialogs,
  })
  expect(service.setCurrent(root)).not.toBeNull()

  const harness = { base, root, userData, service, send, allowDelete }
  harnesses.push(harness)
  return harness
}

afterEach(() => {
  while (harnesses.length > 0) {
    const harness = harnesses.pop()!
    harness.service.dispose()
    fs.rmSync(harness.base, { recursive: true, force: true })
  }
})

function findNode(tree: ReturnType<WorkspaceService['getTree']>, name: string) {
  const walk = (node: NonNullable<ReturnType<WorkspaceService['getTree']>>) => {
    if (node.name === name) return node
    for (const child of node.children ?? []) {
      const found = walk(child)
      if (found) return found
    }
    return null
  }
  return tree ? walk(tree) : null
}

describe('WorkspaceService filesystem integration', () => {
  it('opens a real directory, indexes it, and reads original bytes', () => {
    const { root, service } = makeHarness()
    const file = path.join(root, 'src', 'hello.ts')
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, 'export const answer = 42\n', 'utf-8')

    const tree = service.getTree()
    expect(findNode(tree, 'src')?.type).toBe('directory')
    expect(findNode(tree, 'hello.ts')?.type).toBe('file')

    const opened = service.readFile(file)
    expect(opened).not.toBeNull()
    expect(opened?.content).toBe(fs.readFileSync(file, 'utf-8'))
    expect(opened?.readable).toBe(true)
    expect(opened?.relativePath).toBe('src/hello.ts')
    expect(opened?.hash).toMatch(/^[a-f0-9]{64}$/)
  })

  it('persists edits to the original file on disk and returns the new state', async () => {
    const { root, service } = makeHarness()
    const file = path.join(root, 'notes.txt')
    fs.writeFileSync(file, 'before', 'utf-8')
    const original = service.readFile(file)
    expect(original).not.toBeNull()

    const next = 'after\nsaved directly'
    const result = await service.saveFile(file, next, original!)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(fs.readFileSync(file, 'utf-8')).toBe(next)
    expect(result.value.content).toBe(next)
    expect(result.value.readable).toBe(true)
    expect(result.value.hash).not.toBe(original!.hash)
    expect(result.value.size).toBe(Buffer.byteLength(next, 'utf-8'))
  })

  it('creates real files and folders inside the selected workspace', async () => {
    const { root, service } = makeHarness()

    const folder = await service.createEntry(root, 'generated', 'directory')
    expect(folder.ok).toBe(true)
    if (!folder.ok) return
    expect(fs.statSync(folder.value.path).isDirectory()).toBe(true)

    const file = await service.createEntry(folder.value.path, 'created.txt', 'file')
    expect(file.ok).toBe(true)
    if (!file.ok) return
    expect(fs.readFileSync(file.value.path, 'utf-8')).toBe('')
    expect(findNode(service.getTree(), 'created.txt')?.type).toBe('file')
  })

  it('renames and deletes real entries, honoring delete confirmation', async () => {
    const { root, service, allowDelete } = makeHarness()
    const file = path.join(root, 'rename-me.txt')
    fs.writeFileSync(file, 'content', 'utf-8')

    const renamed = await service.renameEntry(file, 'renamed.txt')
    expect(renamed.ok).toBe(true)
    if (!renamed.ok) return
    expect(fs.existsSync(file)).toBe(false)
    expect(fs.readFileSync(renamed.value.path, 'utf-8')).toBe('content')

    const deleted = await service.deleteEntry(renamed.value.path)
    expect(deleted).toEqual({ ok: true, value: { deleted: true } })
    expect(fs.existsSync(renamed.value.path)).toBe(false)

    const kept = path.join(root, 'keep-me.txt')
    fs.writeFileSync(kept, 'keep', 'utf-8')
    allowDelete.value = false
    const cancelled = await service.deleteEntry(kept)
    expect(cancelled).toEqual({ ok: true, value: { deleted: false } })
    expect(fs.readFileSync(kept, 'utf-8')).toBe('keep')
  })

  it('detects external edits, blocks stale saves, and allows deliberate overwrite', async () => {
    const { root, service } = makeHarness()
    const file = path.join(root, 'shared.txt')
    fs.writeFileSync(file, 'original', 'utf-8')
    const opened = service.readFile(file)
    expect(opened).not.toBeNull()

    const external = 'changed by another process'
    fs.writeFileSync(file, external, 'utf-8')
    const state = await service.getFileState(file)
    expect(state.ok).toBe(true)
    if (!state.ok) return
    expect(state.value.hash).not.toBe(opened!.hash)
    expect(service.readFile(file)?.content).toBe(external)

    const blocked = await service.saveFile(file, 'stale editor content', opened!)
    expect(blocked.ok).toBe(false)
    if (blocked.ok) return
    expect(blocked.error.code).toBe('CONFLICT')
    expect(blocked.error.current?.hash).toBe(state.value.hash)
    expect(fs.readFileSync(file, 'utf-8')).toBe(external)

    const overwritten = await service.saveFile(file, 'deliberate overwrite')
    expect(overwritten.ok).toBe(true)
    expect(fs.readFileSync(file, 'utf-8')).toBe('deliberate overwrite')
  })

  it('refuses reads, writes, and deletes outside the selected workspace', async () => {
    const { base, root, service } = makeHarness()
    const outside = path.join(base, 'outside.txt')
    fs.writeFileSync(outside, 'do not touch', 'utf-8')

    expect(service.readFile(outside)).toBeNull()

    const saved = await service.saveFile(outside, 'overwritten')
    expect(saved.ok).toBe(false)
    if (!saved.ok) expect(saved.error.code).toBe('PATH_OUTSIDE_WORKSPACE')
    expect(fs.readFileSync(outside, 'utf-8')).toBe('do not touch')

    const created = await service.createEntry(root, '../escaped.txt', 'file')
    expect(created.ok).toBe(false)
    if (!created.ok) expect(created.error.code).toBe('INVALID_NAME')
    expect(fs.existsSync(path.join(base, 'escaped.txt'))).toBe(false)

    const deleted = await service.deleteEntry(outside)
    expect(deleted.ok).toBe(false)
    if (!deleted.ok) expect(deleted.error.code).toBe('PATH_OUTSIDE_WORKSPACE')
    expect(fs.existsSync(outside)).toBe(true)
  })

  it('emits file-change events for external modifications', async () => {
    const { root, send } = makeHarness()
    const file = path.join(root, 'watched.txt')
    fs.writeFileSync(file, 'one', 'utf-8')
    send.mockClear()

    fs.writeFileSync(file, 'two', 'utf-8')

    const deadline = Date.now() + 4000
    let received = false
    while (Date.now() < deadline && !received) {
      received = send.mock.calls.some(
        (call) => call[0] === IpcChannels.workspaceFileChanged && String(call[1]?.path).endsWith('watched.txt')
      )
      if (!received) await new Promise((resolve) => setTimeout(resolve, 50))
    }

    expect(received).toBe(true)
  })

  it('returns structured errors for invalid filesystem operations', async () => {
    const { root, service } = makeHarness()

    expect(service.readFile(path.join(root, 'missing.txt'))).toBeNull()

    const missingSave = await service.saveFile(path.join(root, 'missing.txt'), 'x')
    expect(missingSave.ok).toBe(false)
    if (!missingSave.ok) expect(missingSave.error.code).toBe('NOT_FOUND')

    fs.writeFileSync(path.join(root, 'taken.txt'), 'x', 'utf-8')
    const duplicate = await service.createEntry(root, 'taken.txt', 'file')
    expect(duplicate.ok).toBe(false)
    if (!duplicate.ok) expect(duplicate.error.code).toBe('ALREADY_EXISTS')

    const invalid = await service.createEntry(root, '../bad', 'file')
    expect(invalid.ok).toBe(false)
    if (!invalid.ok) expect(invalid.error.code).toBe('INVALID_NAME')

    const removeRoot = await service.deleteEntry(root)
    expect(removeRoot.ok).toBe(false)
    if (!removeRoot.ok) expect(removeRoot.error.code).toBe('INVALID_TARGET')
  })
})
