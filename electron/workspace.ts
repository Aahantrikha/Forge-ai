import type {
  BrowserWindow,
  MessageBoxOptions,
  MessageBoxReturnValue,
  OpenDialogOptions,
  OpenDialogReturnValue,
} from 'electron'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { IpcChannels } from '../src/shared/ipc'
import type {
  FileChangeEvent,
  FileState,
  FileTreeNode,
  OpenedFile,
  WorkspaceEntry,
  WorkspaceErrorInfo,
  WorkspaceErrorCode,
  WorkspaceInfo,
  WorkspaceOpenResult,
  WorkspaceResult,
} from '../src/shared/workspace'

const IGNORED_NAMES = new Set([
  '.git',
  'node_modules',
  'dist',
  'dist-electron',
  '.next',
  '.nuxt',
  'out',
  'coverage',
  '.cache',
  '.turbo',
  'build',
  '__pycache__',
  '.venv',
  '.DS_Store',
  'Thumbs.db',
])

const MAX_DEPTH = 8
const MAX_ENTRIES = 2500
const MAX_READ_BYTES = 10 * 1024 * 1024
const BINARY_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.ico',
  '.pdf',
  '.zip',
  '.tar',
  '.gz',
  '.7z',
  '.exe',
  '.dll',
  '.bin',
  '.wasm',
])

export interface WorkspaceDialogs {
  showOpenDialog(options: OpenDialogOptions, parent?: BrowserWindow | null): Promise<OpenDialogReturnValue>
  showMessageBox(options: MessageBoxOptions, parent?: BrowserWindow | null): Promise<MessageBoxReturnValue>
}

export interface WorkspaceServiceOptions {
  userDataPath: string
  getWindow: () => BrowserWindow | null
  dialogs: WorkspaceDialogs
}

export class WorkspaceServiceError extends Error {
  constructor(
    readonly code: WorkspaceErrorCode,
    message: string,
    readonly details: Partial<WorkspaceErrorInfo> = {}
  ) {
    super(message)
    this.name = 'WorkspaceServiceError'
  }

  toInfo(): WorkspaceErrorInfo {
    return { code: this.code, message: this.message, ...this.details }
  }
}

function toErrorInfo(error: unknown, fallbackPath?: string): WorkspaceErrorInfo {
  if (error instanceof WorkspaceServiceError) return error.toInfo()
  const code = (error as NodeJS.ErrnoException | undefined)?.code
  const message = error instanceof Error ? error.message : 'Filesystem operation failed.'
  if (code === 'ENOENT') return { code: 'NOT_FOUND', message, path: fallbackPath }
  if (code === 'EEXIST') return { code: 'ALREADY_EXISTS', message, path: fallbackPath }
  if (code === 'EACCES' || code === 'EPERM' || code === 'EBUSY') {
    return { code: 'PERMISSION_DENIED', message, path: fallbackPath }
  }
  return { code: 'IO_ERROR', message, path: fallbackPath }
}

async function asResult<T>(run: () => T | Promise<T>): Promise<WorkspaceResult<T>> {
  try {
    return { ok: true, value: await run() }
  } catch (error) {
    return { ok: false, error: toErrorInfo(error) }
  }
}

export class WorkspaceService {
  private currentPath: string | null = null
  private watcher: fs.FSWatcher | null = null
  private recentPaths: string[] = []
  private debounceTimer: NodeJS.Timeout | null = null

  constructor(private readonly options: WorkspaceServiceOptions) {
    this.loadRecentPaths()
  }

  private getStoragePath(): string {
    return path.join(this.options.userDataPath, 'recent-workspaces.json')
  }

  private loadRecentPaths(): void {
    try {
      const storageFile = this.getStoragePath()
      if (fs.existsSync(storageFile)) {
        const parsed: unknown = JSON.parse(fs.readFileSync(storageFile, 'utf-8'))
        if (Array.isArray(parsed)) {
          this.recentPaths = parsed.filter((item): item is string => {
            if (typeof item !== 'string') return false
            try {
              return fs.statSync(item).isDirectory()
            } catch {
              return false
            }
          })
        }
      }
    } catch {
      this.recentPaths = []
    }
  }

  private saveRecentPaths(): void {
    try {
      const storageFile = this.getStoragePath()
      fs.mkdirSync(path.dirname(storageFile), { recursive: true })
      fs.writeFileSync(storageFile, JSON.stringify(this.recentPaths.slice(0, 10), null, 2), 'utf-8')
    } catch {
      return
    }
  }

  private updateRecentPaths(newPath: string): void {
    this.recentPaths = [newPath, ...this.recentPaths.filter((item) => item !== newPath)].slice(0, 10)
    this.saveRecentPaths()
  }

  private rootPath(): string {
    if (!this.currentPath) {
      throw new WorkspaceServiceError('NO_WORKSPACE', 'Open a project folder first.')
    }
    return this.currentPath
  }

  private containedPath(targetPath: string): string {
    const root = this.rootPath()
    const resolved = path.resolve(targetPath)
    const realRoot = fs.realpathSync.native(root)
    let cursor = resolved
    while (!fs.existsSync(cursor)) {
      const parent = path.dirname(cursor)
      if (parent === cursor) break
      cursor = parent
    }

    if (!fs.existsSync(cursor)) {
      throw new WorkspaceServiceError('NOT_FOUND', 'Path does not exist.', { path: resolved })
    }

    const realCursor = fs.realpathSync.native(cursor)
    const suffix = path.relative(cursor, resolved)
    const candidate = suffix ? path.join(realCursor, suffix) : realCursor
    const relative = path.relative(realRoot, candidate)
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw new WorkspaceServiceError('PATH_OUTSIDE_WORKSPACE', 'Path is outside the selected workspace.', {
        path: resolved,
      })
    }

    return candidate
  }

  private validateName(rawName: string): string {
    const name = rawName.trim()
    if (!name || name === '.' || name === '..' || name !== path.basename(name)) {
      throw new WorkspaceServiceError('INVALID_NAME', 'Enter a valid file or folder name.')
    }
    const hasControl = Array.from(name).some((char) => char.charCodeAt(0) < 32)
    if (/[\\/:*?"<>|]/.test(name) || hasControl) {
      throw new WorkspaceServiceError('INVALID_NAME', 'Name contains unsupported characters.')
    }
    if (process.platform === 'win32' && /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i.test(name)) {
      throw new WorkspaceServiceError('INVALID_NAME', 'Name is reserved by Windows.')
    }
    return name
  }

  private relativeDisplayPath(resolved: string): string {
    return path.relative(this.rootPath(), resolved).replace(/\\/g, '/')
  }

  private makeFileState(resolved: string, stats: fs.Stats, buffer?: Buffer): FileState {
    const hash = buffer
      ? createHash('sha256').update(buffer).digest('hex')
      : `meta:${stats.size}:${Math.trunc(stats.mtimeMs)}`
    return { path: resolved, size: stats.size, mtimeMs: stats.mtimeMs, hash }
  }

  private statFile(resolved: string): fs.Stats {
    let stats: fs.Stats
    try {
      stats = fs.statSync(resolved)
    } catch {
      throw new WorkspaceServiceError('NOT_FOUND', 'File no longer exists.', { path: resolved })
    }
    if (!stats.isFile()) {
      throw new WorkspaceServiceError('INVALID_TARGET', 'Path is not a file.', { path: resolved })
    }
    return stats
  }

  private computeFileState(resolved: string): FileState {
    const stats = this.statFile(resolved)
    const ext = path.extname(resolved).toLowerCase()
    const readable = stats.size <= MAX_READ_BYTES && !BINARY_EXTENSIONS.has(ext)
    return this.makeFileState(resolved, stats, readable ? fs.readFileSync(resolved) : undefined)
  }

  private statDirectory(resolved: string): fs.Stats {
    let stats: fs.Stats
    try {
      stats = fs.statSync(resolved)
    } catch {
      throw new WorkspaceServiceError('NOT_FOUND', 'Folder no longer exists.', { path: resolved })
    }
    if (!stats.isDirectory()) {
      throw new WorkspaceServiceError('INVALID_TARGET', 'Path is not a folder.', { path: resolved })
    }
    return stats
  }

  private readFileRequired(targetPath: string): OpenedFile {
    const resolved = this.containedPath(targetPath)
    const stats = this.statFile(resolved)
    const ext = path.extname(resolved).toLowerCase()
    const readable = stats.size <= MAX_READ_BYTES && !BINARY_EXTENSIONS.has(ext)

    if (!readable) {
      return {
        ...this.makeFileState(resolved, stats),
        name: path.basename(resolved),
        relativePath: this.relativeDisplayPath(resolved),
        content: BINARY_EXTENSIONS.has(ext)
          ? `/* Binary file (${ext}): preview not available as plain text. Size: ${stats.size} bytes */`
          : '/* File is larger than 10MB. Displaying raw text disabled for performance. */',
        extension: ext,
        lineCount: 1,
        readable: false,
      }
    }

    const buffer = fs.readFileSync(resolved)
    const content = buffer.toString('utf-8')
    return {
      ...this.makeFileState(resolved, stats, buffer),
      name: path.basename(resolved),
      relativePath: this.relativeDisplayPath(resolved),
      content,
      extension: ext,
      lineCount: content.split('\n').length,
      readable: true,
    }
  }

  public getWorkspaceInfo(): WorkspaceInfo | null {
    if (!this.currentPath) return null
    return {
      path: this.currentPath,
      name: path.basename(this.currentPath) || this.currentPath,
      recentPaths: [...this.recentPaths],
    }
  }

  public async openFolder(): Promise<WorkspaceOpenResult | null> {
    const root = this.currentPath ?? undefined
    const options: OpenDialogOptions = {
      title: 'Open Project Folder',
      properties: ['openDirectory', 'createDirectory'],
      ...(root ? { defaultPath: root } : {}),
    }
    const parent = this.options.getWindow()
    const result = parent
      ? await this.options.dialogs.showOpenDialog(options, parent)
      : await this.options.dialogs.showOpenDialog(options)
    if (result.canceled || result.filePaths.length === 0) return null

    const workspace = this.setCurrent(result.filePaths[0])
    if (!workspace) return null
    const tree = this.getTree(workspace.path)
    return tree ? { workspace, tree } : null
  }

  public async openFile(): Promise<OpenedFile | null> {
    const root = this.currentPath
    if (!root) return null
    const options: OpenDialogOptions = {
      title: 'Open File',
      properties: ['openFile'],
      defaultPath: root,
    }
    const parent = this.options.getWindow()
    const result = parent
      ? await this.options.dialogs.showOpenDialog(options, parent)
      : await this.options.dialogs.showOpenDialog(options)
    if (result.canceled || result.filePaths.length === 0) return null

    try {
      return this.readFileRequired(result.filePaths[0])
    } catch {
      return null
    }
  }

  public readFile(targetPath: string): OpenedFile | null {
    try {
      return this.readFileRequired(targetPath)
    } catch {
      return null
    }
  }

  public getFileState(targetPath: string): Promise<WorkspaceResult<FileState>> {
    return asResult(() => {
      const resolved = this.containedPath(targetPath)
      return this.computeFileState(resolved)
    })
  }

  public saveFile(
    targetPath: string,
    content: string,
    expected?: FileState
  ): Promise<WorkspaceResult<OpenedFile>> {
    return asResult(async () => {
      const resolved = this.containedPath(targetPath)
      this.statFile(resolved)

      if (expected) {
        const current = this.computeFileState(resolved)
        if (
          current.hash !== expected.hash ||
          current.size !== expected.size ||
          current.mtimeMs !== expected.mtimeMs
        ) {
          throw new WorkspaceServiceError(
            'CONFLICT',
            'This file changed on disk since it was opened. Reload it before saving or overwrite deliberately.',
            { path: resolved, current }
          )
        }
      }

      await fs.promises.writeFile(resolved, content, 'utf-8')
      return this.readFileRequired(resolved)
    })
  }

  public createEntry(
    parentPath: string,
    rawName: string,
    type: 'file' | 'directory'
  ): Promise<WorkspaceResult<WorkspaceEntry>> {
    return asResult(async () => {
      const parent = this.containedPath(parentPath)
      this.statDirectory(parent)
      const name = this.validateName(rawName)
      const target = this.containedPath(path.join(parent, name))
      if (fs.existsSync(target)) {
        throw new WorkspaceServiceError('ALREADY_EXISTS', `"${name}" already exists.`, { path: target })
      }

      if (type === 'directory') {
        await fs.promises.mkdir(target)
      } else {
        await fs.promises.writeFile(target, '', { flag: 'wx' })
      }

      return { path: target, type }
    })
  }

  public renameEntry(targetPath: string, rawName: string): Promise<WorkspaceResult<WorkspaceEntry>> {
    return asResult(async () => {
      const resolved = this.containedPath(targetPath)
      if (resolved === this.rootPath()) {
        throw new WorkspaceServiceError('INVALID_TARGET', 'The workspace folder cannot be renamed.', { path: resolved })
      }
      const stat = fs.statSync(resolved)
      const name = this.validateName(rawName)
      const destination = this.containedPath(path.join(path.dirname(resolved), name))
      if (destination !== resolved && fs.existsSync(destination)) {
        throw new WorkspaceServiceError('ALREADY_EXISTS', `"${name}" already exists.`, { path: destination })
      }

      await fs.promises.rename(resolved, destination)
      return { path: destination, type: stat.isDirectory() ? 'directory' : 'file' }
    })
  }

  public deleteEntry(targetPath: string): Promise<WorkspaceResult<{ deleted: boolean }>> {
    return asResult(async () => {
      const resolved = this.containedPath(targetPath)
      if (resolved === this.rootPath()) {
        throw new WorkspaceServiceError('INVALID_TARGET', 'The workspace folder cannot be deleted.', { path: resolved })
      }
      const stat = fs.statSync(resolved)
      const options: MessageBoxOptions = {
        type: 'warning',
        title: stat.isDirectory() ? 'Delete folder?' : 'Delete file?',
        message: `Delete "${path.basename(resolved)}" from the workspace?`,
        detail: resolved,
        buttons: ['Delete', 'Cancel'],
        defaultId: 1,
        cancelId: 1,
      }
      const parent = this.options.getWindow()
      const answer = parent
        ? await this.options.dialogs.showMessageBox(options, parent)
        : await this.options.dialogs.showMessageBox(options)
      if (answer.response !== 0) return { deleted: false }

      if (stat.isDirectory()) {
        await fs.promises.rm(resolved, { recursive: true })
      } else {
        await fs.promises.unlink(resolved)
      }
      return { deleted: true }
    })
  }

  public async selectDirectory(): Promise<WorkspaceInfo | null> {
    const result = await this.openFolder()
    return result ? result.workspace : this.getWorkspaceInfo()
  }

  public setCurrent(dirPath: string): WorkspaceInfo | null {
    try {
      const resolved = path.resolve(dirPath)
      const realPath = fs.realpathSync.native(resolved)
      if (!fs.statSync(realPath).isDirectory()) return null

      this.currentPath = realPath
      this.updateRecentPaths(realPath)
      this.setupWatcher(realPath)
      return this.getWorkspaceInfo()
    } catch {
      return null
    }
  }

  private setupWatcher(rootPath: string): void {
    if (this.watcher) {
      this.watcher.close()
      this.watcher = null
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }

    try {
      this.watcher = fs.watch(rootPath, { recursive: true }, (_eventType, filename) => {
        if (!filename) return
        const segments = filename.split(/[/\\]/)
        if (segments.some((segment) => IGNORED_NAMES.has(segment))) return

        if (this.debounceTimer) clearTimeout(this.debounceTimer)
        this.debounceTimer = setTimeout(() => {
          const fullPath = path.join(rootPath, filename)
          let type: FileChangeEvent['type'] = 'change'
          try {
            const stat = fs.statSync(fullPath)
            type = stat.isDirectory() ? 'addDir' : 'add'
          } catch {
            type = 'unlink'
          }

          const event: FileChangeEvent = {
            type,
            path: fullPath,
            relativePath: filename.replace(/\\/g, '/'),
          }
          this.options.getWindow()?.webContents.send(IpcChannels.workspaceFileChanged, event)
        }, 200)
      })
    } catch {
      this.watcher = null
    }
  }

  public getTree(customRoot?: string): FileTreeNode | null {
    try {
      const target = this.containedPath(customRoot ?? this.rootPath())
      this.statDirectory(target)
      let entryCount = 0

      const buildNode = (currentDir: string, depth: number): FileTreeNode => {
        const node: FileTreeNode = {
          name: path.basename(currentDir) || currentDir,
          path: currentDir,
          relativePath: this.relativeDisplayPath(currentDir),
          type: 'directory',
          children: [],
        }

        if (depth >= MAX_DEPTH || entryCount >= MAX_ENTRIES) return node

        try {
          const entries = fs.readdirSync(currentDir, { withFileTypes: true })
          const dirs: fs.Dirent[] = []
          const files: fs.Dirent[] = []

          for (const entry of entries) {
            if (IGNORED_NAMES.has(entry.name)) continue
            if (entry.name.startsWith('.') && entry.name !== '.gitignore' && entry.name !== '.env.example') continue
            if (entry.isDirectory()) dirs.push(entry)
            else if (entry.isFile()) files.push(entry)
          }

          const sort = (a: fs.Dirent, b: fs.Dirent) =>
            a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
          dirs.sort(sort)
          files.sort(sort)

          for (const entry of dirs) {
            if (entryCount >= MAX_ENTRIES) break
            entryCount++
            node.children?.push(buildNode(path.join(currentDir, entry.name), depth + 1))
          }

          for (const entry of files) {
            if (entryCount >= MAX_ENTRIES) break
            entryCount++
            const filePath = path.join(currentDir, entry.name)
            let size = 0
            try {
              size = fs.statSync(filePath).size
            } catch {
              size = 0
            }
            node.children?.push({
              name: entry.name,
              path: filePath,
              relativePath: this.relativeDisplayPath(filePath),
              type: 'file',
              size,
              extension: path.extname(entry.name).toLowerCase(),
            })
          }
        } catch {
          return node
        }

        return node
      }

      return buildNode(target, 0)
    } catch {
      return null
    }
  }

  public dispose(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }
    if (this.watcher) {
      this.watcher.close()
      this.watcher = null
    }
  }
}
