/**
 * Workspace data types and contracts (Milestone 2).
 */

export interface WorkspaceInfo {
  path: string
  name: string
  recentPaths: string[]
}

export interface FileTreeNode {
  name: string
  path: string
  relativePath: string
  type: 'file' | 'directory'
  children?: FileTreeNode[]
  size?: number
  extension?: string
}

export interface FileState {
  path: string
  size: number
  mtimeMs: number
  hash: string
}

export interface OpenedFile extends FileState {
  name: string
  relativePath: string
  content: string
  extension: string
  lineCount: number
  readable: boolean
}

export interface WorkspaceOpenResult {
  workspace: WorkspaceInfo
  tree: FileTreeNode
}

export interface WorkspaceEntry {
  path: string
  type: 'file' | 'directory'
}

export type FileChangeType = 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir'

export interface FileChangeEvent {
  type: FileChangeType
  path: string
  relativePath: string
}

export type WorkspaceErrorCode =
  | 'NO_WORKSPACE'
  | 'PATH_OUTSIDE_WORKSPACE'
  | 'NOT_FOUND'
  | 'ALREADY_EXISTS'
  | 'INVALID_NAME'
  | 'INVALID_TARGET'
  | 'CONFLICT'
  | 'PERMISSION_DENIED'
  | 'IO_ERROR'

export interface WorkspaceErrorInfo {
  code: WorkspaceErrorCode
  message: string
  path?: string
  current?: FileState
}

export type WorkspaceResult<T> = { ok: true; value: T } | { ok: false; error: WorkspaceErrorInfo }
