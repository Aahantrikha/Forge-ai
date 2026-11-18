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

export interface OpenedFile {
  path: string
  name: string
  relativePath: string
  content: string
  size: number
  extension: string
  lineCount: number
}

export interface WorkspaceOpenResult {
  workspace: WorkspaceInfo
  tree: FileTreeNode
}

export type FileChangeType = 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir'

export interface FileChangeEvent {
  type: FileChangeType
  path: string
  relativePath: string
}
