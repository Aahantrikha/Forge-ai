import { app, dialog, type BrowserWindow } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { IpcChannels } from '../src/shared/ipc'
import type {
  FileChangeEvent,
  FileTreeNode,
  OpenedFile,
  WorkspaceInfo,
  WorkspaceOpenResult,
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

export class WorkspaceService {
  private currentPath: string | null = null
  private watcher: fs.FSWatcher | null = null
  private recentPaths: string[] = []
  private debounceTimer: NodeJS.Timeout | null = null

  constructor(private readonly getWindow: () => BrowserWindow | null) {
    this.loadRecentPaths()
  }

  private getStoragePath(): string {
    return path.join(app.getPath('userData'), 'recent-workspaces.json')
  }

  private loadRecentPaths(): void {
    try {
      const storageFile = this.getStoragePath()
      if (fs.existsSync(storageFile)) {
        const raw = fs.readFileSync(storageFile, 'utf-8')
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) {
          this.recentPaths = parsed.filter(
            (p): p is string => typeof p === 'string' && fs.existsSync(p) && fs.statSync(p).isDirectory()
          )
        }
      }
    } catch {
      this.recentPaths = []
    }
  }

  private saveRecentPaths(): void {
    try {
      const storageFile = this.getStoragePath()
      const dir = path.dirname(storageFile)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
      fs.writeFileSync(storageFile, JSON.stringify(this.recentPaths.slice(0, 10), null, 2), 'utf-8')
    } catch {
      // Non-critical persistence failure
    }
  }

  private updateRecentPaths(newPath: string): void {
    const normalized = path.resolve(newPath)
    this.recentPaths = [normalized, ...this.recentPaths.filter((p) => p !== normalized)].slice(0, 10)
    this.saveRecentPaths()
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
    const win = this.getWindow()
    const options: Electron.OpenDialogOptions = {
      title: 'Open Project Folder',
      properties: ['openDirectory', 'createDirectory'],
    }
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    const ws = this.setCurrent(result.filePaths[0])
    if (!ws) return null

    const tree = this.getTree(ws.path)
    if (!tree) return null

    return { workspace: ws, tree }
  }

  public async openFile(): Promise<OpenedFile | null> {
    const win = this.getWindow()
    const options: Electron.OpenDialogOptions = {
      title: 'Open File',
      properties: ['openFile'],
    }
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    return this.readFile(result.filePaths[0])
  }

  public readFile(targetPath: string): OpenedFile | null {
    try {
      const resolved = path.resolve(targetPath)
      if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
        return null
      }

      const stats = fs.statSync(resolved)
      const ext = path.extname(resolved).toLowerCase()
      const relPath = this.currentPath
        ? path.relative(this.currentPath, resolved).replace(/\\/g, '/')
        : path.basename(resolved)

      // Guard against huge files
      if (stats.size > 10 * 1024 * 1024) {
        return {
          path: resolved,
          name: path.basename(resolved),
          relativePath: relPath,
          content: '/* File is larger than 10MB. Displaying raw text disabled for performance. */',
          size: stats.size,
          extension: ext,
          lineCount: 1,
        }
      }

      // Check binary extensions
      const binaryExts = new Set([
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
      if (binaryExts.has(ext)) {
        return {
          path: resolved,
          name: path.basename(resolved),
          relativePath: relPath,
          content: `/* Binary file (${ext}): preview not available as plain text. Size: ${stats.size} bytes */`,
          size: stats.size,
          extension: ext,
          lineCount: 1,
        }
      }

      const content = fs.readFileSync(resolved, 'utf-8')
      const lines = content.split('\n')

      return {
        path: resolved,
        name: path.basename(resolved),
        relativePath: relPath,
        content,
        size: stats.size,
        extension: ext,
        lineCount: lines.length,
      }
    } catch {
      return null
    }
  }

  public async selectDirectory(): Promise<WorkspaceInfo | null> {
    const res = await this.openFolder()
    return res ? res.workspace : this.getWorkspaceInfo()
  }

  public setCurrent(dirPath: string): WorkspaceInfo | null {
    const resolved = path.resolve(dirPath)
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
      return null
    }

    this.currentPath = resolved
    this.updateRecentPaths(resolved)
    this.setupWatcher(resolved)

    return this.getWorkspaceInfo()
  }

  private setupWatcher(rootPath: string): void {
    if (this.watcher) {
      this.watcher.close()
      this.watcher = null
    }

    try {
      // Recursive watch works natively on Windows and macOS
      this.watcher = fs.watch(rootPath, { recursive: true }, (_eventType, filename) => {
        if (!filename) return

        // Skip ignored directories in the path
        const segments = filename.split(/[/\\]/)
        if (segments.some((seg) => IGNORED_NAMES.has(seg))) {
          return
        }

        // Debounce notifications
        if (this.debounceTimer) clearTimeout(this.debounceTimer)
        this.debounceTimer = setTimeout(() => {
          const fullPath = path.join(rootPath, filename)
          const exists = fs.existsSync(fullPath)
          const isDir = exists && fs.statSync(fullPath).isDirectory()

          let type: FileChangeEvent['type'] = exists ? 'change' : 'unlink'
          if (isDir) {
            type = 'change'
          }

          const event: FileChangeEvent = {
            type,
            path: fullPath,
            relativePath: filename.replace(/\\/g, '/'),
          }

          const win = this.getWindow()
          win?.webContents.send(IpcChannels.workspaceFileChanged, event)
        }, 200)
      })
    } catch {
      // Watching not supported or failed
      this.watcher = null
    }
  }

  public getTree(customRoot?: string): FileTreeNode | null {
    const target = customRoot ? path.resolve(customRoot) : this.currentPath
    if (!target) return null

    // Path traversal guard: must reside within currentPath if set
    if (this.currentPath) {
      const rel = path.relative(this.currentPath, target)
      if (rel.startsWith('..') && rel !== '..') {
        return null
      }
    }

    if (!fs.existsSync(target) || !fs.statSync(target).isDirectory()) {
      return null
    }

    let entryCount = 0

    const buildNode = (currentDir: string, depth: number): FileTreeNode => {
      const name = path.basename(currentDir) || currentDir
      const relativePath = this.currentPath ? path.relative(this.currentPath, currentDir).replace(/\\/g, '/') : ''

      const node: FileTreeNode = {
        name,
        path: currentDir,
        relativePath,
        type: 'directory',
        children: [],
      }

      if (depth >= MAX_DEPTH || entryCount >= MAX_ENTRIES) {
        return node
      }

      try {
        const entries = fs.readdirSync(currentDir, { withFileTypes: true })

        // Partition into folders and files
        const dirs: fs.Dirent[] = []
        const files: fs.Dirent[] = []

        for (const entry of entries) {
          if (IGNORED_NAMES.has(entry.name)) continue
          if (entry.name.startsWith('.') && entry.name !== '.gitignore' && entry.name !== '.env.example') continue

          if (entry.isDirectory()) {
            dirs.push(entry)
          } else if (entry.isFile()) {
            files.push(entry)
          }
        }

        // Sort alphabetically
        dirs.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
        files.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))

        for (const d of dirs) {
          if (entryCount >= MAX_ENTRIES) break
          entryCount++
          const childPath = path.join(currentDir, d.name)
          node.children?.push(buildNode(childPath, depth + 1))
        }

        for (const f of files) {
          if (entryCount >= MAX_ENTRIES) break
          entryCount++
          const filePath = path.join(currentDir, f.name)
          const ext = path.extname(f.name).toLowerCase()
          let size = 0
          try {
            size = fs.statSync(filePath).size
          } catch {
            // file stat error ignored
          }

          node.children?.push({
            name: f.name,
            path: filePath,
            relativePath: this.currentPath ? path.relative(this.currentPath, filePath).replace(/\\/g, '/') : f.name,
            type: 'file',
            size,
            extension: ext,
          })
        }
      } catch {
        // Permission or read error
      }

      return node
    }

    return buildNode(target, 0)
  }

  public dispose(): void {
    if (this.watcher) {
      this.watcher.close()
      this.watcher = null
    }
  }
}
