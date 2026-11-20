import fs from 'node:fs'
import path from 'node:path'

export type PathGuardErrorCode = 'PATH_OUTSIDE_WORKSPACE' | 'PATH_NOT_FOUND' | 'INVALID_PATH'

export class PathGuardError extends Error {
  readonly code: PathGuardErrorCode

  constructor(code: PathGuardErrorCode, message: string, readonly details: { path?: string; root?: string } = {}) {
    super(message)
    this.name = 'PathGuardError'
    this.code = code
  }
}

export class PathGuard {
  private readonly root: string

  constructor(rootPath: string) {
    try {
      this.root = fs.realpathSync.native(path.resolve(rootPath))
    } catch {
      throw new PathGuardError('PATH_NOT_FOUND', 'Workspace root does not exist.', { path: rootPath })
    }
    if (!fs.statSync(this.root).isDirectory()) {
      throw new PathGuardError('INVALID_PATH', 'Workspace root is not a directory.', { path: rootPath })
    }
  }

  getRoot(): string {
    return this.root
  }

  resolve(targetPath: string): string {
    if (typeof targetPath !== 'string' || targetPath.trim().length === 0) {
      throw new PathGuardError('INVALID_PATH', 'Path must be a non-empty string.')
    }

    const resolved = path.resolve(targetPath)
    let existing = resolved
    while (!fs.existsSync(existing)) {
      const parent = path.dirname(existing)
      if (parent === existing) break
      existing = parent
    }

    if (!fs.existsSync(existing)) {
      throw new PathGuardError('PATH_NOT_FOUND', 'Path does not exist.', { path: resolved, root: this.root })
    }

    const realExisting = fs.realpathSync.native(existing)
    const suffix = path.relative(existing, resolved)
    const candidate = suffix ? path.join(realExisting, suffix) : realExisting
    const relative = path.relative(this.root, candidate)

    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw new PathGuardError('PATH_OUTSIDE_WORKSPACE', 'Path is outside the authorized root.', {
        path: resolved,
        root: this.root,
      })
    }

    return candidate
  }

  contains(targetPath: string): boolean {
    try {
      this.resolve(targetPath)
      return true
    } catch {
      return false
    }
  }
}
