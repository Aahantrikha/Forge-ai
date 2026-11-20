import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { PathGuard, PathGuardError } from '../../../electron/security/path-guard'

const dirs: string[] = []

function setup() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-path-guard-'))
  const root = path.join(base, 'workspace')
  fs.mkdirSync(root, { recursive: true })
  dirs.push(base)
  return { base, root }
}

afterEach(() => {
  while (dirs.length > 0) {
    fs.rmSync(dirs.pop()!, { recursive: true, force: true })
  }
})

function expectGuardError(code: string, run: () => void) {
  try {
    run()
    throw new Error('Expected PathGuardError')
  } catch (error) {
    expect(error).toBeInstanceOf(PathGuardError)
    expect((error as PathGuardError).code).toBe(code)
  }
}

describe('PathGuard', () => {
  it('resolves normalized paths inside the authorized root', () => {
    const { root } = setup()
    const guard = new PathGuard(root)

    expect(guard.getRoot()).toBe(fs.realpathSync.native(root))
    expect(guard.resolve(path.join(root, 'src', '..', 'file.txt'))).toBe(path.join(guard.getRoot(), 'file.txt'))
    expect(guard.contains(path.join(root, 'nested', 'new.txt'))).toBe(true)
  })

  it('rejects absolute paths outside the root', () => {
    const { base, root } = setup()
    const outside = path.join(base, 'outside.txt')
    fs.writeFileSync(outside, 'secret', 'utf-8')
    const guard = new PathGuard(root)

    expectGuardError('PATH_OUTSIDE_WORKSPACE', () => guard.resolve(outside))
    expect(guard.contains(outside)).toBe(false)
    expect(fs.readFileSync(outside, 'utf-8')).toBe('secret')
  })

  it('rejects a non-directory or missing root', () => {
    const { root } = setup()
    const file = path.join(root, 'not-a-directory.txt')
    fs.writeFileSync(file, 'x', 'utf-8')

    expectGuardError('INVALID_PATH', () => new PathGuard(file))
    expectGuardError('PATH_NOT_FOUND', () => new PathGuard(path.join(root, 'missing')))
  })

  it('rejects symlink escapes when the platform permits link creation', () => {
    const { base, root } = setup()
    const outsideDir = path.join(base, 'outside-dir')
    fs.mkdirSync(outsideDir, { recursive: true })
    fs.writeFileSync(path.join(outsideDir, 'secret.txt'), 'secret', 'utf-8')
    const link = path.join(root, 'escape')
    try {
      fs.symlinkSync(outsideDir, link, 'junction')
    } catch {
      return
    }

    const guard = new PathGuard(root)
    expectGuardError('PATH_OUTSIDE_WORKSPACE', () => guard.resolve(path.join(link, 'secret.txt')))
  })
})
