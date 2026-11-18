/**
 * Single source of truth for the renderer↔main IPC surface.
 *
 * Security contract (Forge AI spec §9):
 * - The preload script may ONLY reference channel names from `IpcChannels`.
 * - There is no generic `send`/`invoke` passthrough: every capability must be
 *   declared here as a typed function on `ForgeApi` and implemented with
 *   explicit handlers in `electron/main.ts`.
 * - Never hardcode credentials or tokens through this surface; secrets live in
 *   the main process only (OS credential store in a later milestone).
 *
 * Adding a capability: declare its channel here first, then implement the
 * handler in main and the bridge function in preload. Nothing else changes.
 */

import type { FileChangeEvent, FileTreeNode, WorkspaceInfo } from './workspace'

export type { FileChangeEvent, FileChangeType, FileTreeNode, WorkspaceInfo } from './workspace'

/** Whitelisted channel names. Every value is used by an explicit handler. */
export const IpcChannels = {
  appGetInfo: 'forge:app:get-info',

  windowMinimize: 'forge:window:minimize',
  windowToggleMaximize: 'forge:window:toggle-maximize',
  windowClose: 'forge:window:close',
  windowIsMaximized: 'forge:window:is-maximized',
  windowMaximizedChanged: 'forge:window:maximized-changed',

  // Workspace channels (Milestone 2)
  workspaceSelectDirectory: 'forge:workspace:select-directory',
  workspaceGetCurrent: 'forge:workspace:get-current',
  workspaceSetCurrent: 'forge:workspace:set-current',
  workspaceGetTree: 'forge:workspace:get-tree',
  workspaceFileChanged: 'forge:workspace:file-changed',
} as const

export type IpcChannel = (typeof IpcChannels)[keyof typeof IpcChannels]

/** Runtime security posture, reported factually from the main process. */
export interface SecurityStatus {
  contextIsolationEnabled: boolean
  sandboxEnabled: boolean
  nodeIntegrationEnabled: boolean
  /** The exact whitelist, so the renderer can display the real IPC surface. */
  ipcChannels: readonly string[]
}

export interface AppInfo {
  version: string
  electronVersion: string
  platform: string
  isDevelopment: boolean
  security: SecurityStatus
}

/** Typed API exposed to the renderer via `contextBridge` as `window.forgeAI`. */
export interface ForgeApi {
  app: {
    getInfo(): Promise<AppInfo>
  }
  window: {
    minimize(): void
    toggleMaximize(): void
    close(): void
    isMaximized(): Promise<boolean>
    /** Subscribe to maximized-state changes; returns an unsubscribe function. */
    onMaximizedChanged(listener: (maximized: boolean) => void): () => void
  }
  workspace: {
    selectDirectory(): Promise<WorkspaceInfo | null>
    getCurrent(): Promise<WorkspaceInfo | null>
    setCurrent(path: string): Promise<WorkspaceInfo | null>
    getTree(rootPath?: string): Promise<FileTreeNode | null>
    /** Subscribe to workspace file changes; returns an unsubscribe function. */
    onFileChanged(listener: (event: FileChangeEvent) => void): () => void
  }
}
