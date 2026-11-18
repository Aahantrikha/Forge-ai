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

import type {
  AgentAuthStatus,
  AgentEvent,
  AgentId,
  AgentModel,
  AgentSession,
  CreateSessionOptions,
  SubmitPromptOptions,
} from './agent'
import type {
  FileChangeEvent,
  FileState,
  FileTreeNode,
  OpenedFile,
  WorkspaceEntry,
  WorkspaceInfo,
  WorkspaceOpenResult,
  WorkspaceResult,
} from './workspace'

export type {
  AgentAuthStatus,
  AgentCapabilities,
  AgentEvent,
  AgentId,
  AgentModel,
  AgentModelCost,
  AgentSession,
  AgentToolActivity,
  AuthState,
  CreateSessionOptions,
  SubmitPromptOptions,
  ToolType,
} from './agent'

export type {
  FileChangeEvent,
  FileChangeType,
  FileState,
  FileTreeNode,
  OpenedFile,
  WorkspaceEntry,
  WorkspaceInfo,
  WorkspaceOpenResult,
  WorkspaceResult,
} from './workspace'

/** Whitelisted channel names. Every value is used by an explicit handler. */
export const IpcChannels = {
  appGetInfo: 'forge:app:get-info',

  // Workspace channels (Milestone 2)
  workspaceOpenFolder: 'forge:workspace:open-folder',
  workspaceOpenFile: 'forge:workspace:open-file',
  workspaceReadFile: 'forge:workspace:read-file',
  workspaceSaveFile: 'forge:workspace:save-file',
  workspaceSelectDirectory: 'forge:workspace:select-directory',
  workspaceGetCurrent: 'forge:workspace:get-current',
  workspaceSetCurrent: 'forge:workspace:set-current',
  workspaceGetTree: 'forge:workspace:get-tree',
  workspaceGetFileState: 'forge:workspace:get-file-state',
  workspaceCreateEntry: 'forge:workspace:create-entry',
  workspaceRenameEntry: 'forge:workspace:rename-entry',
  workspaceDeleteEntry: 'forge:workspace:delete-entry',
  workspaceFileChanged: 'forge:workspace:file-changed',

  // Native application menu events
  menuOpenFolder: 'forge:menu:open-folder',
  menuOpenFile: 'forge:menu:open-file',
  menuSaveFile: 'forge:menu:save-file',

  // Agent channels (Milestone 3: OpenCode & Agent Abstraction)
  agentCheckAuth: 'forge:agent:check-auth',
  agentListModels: 'forge:agent:list-models',
  agentCreateSession: 'forge:agent:create-session',
  agentSubmitPrompt: 'forge:agent:submit-prompt',
  agentCancel: 'forge:agent:cancel',
  agentEvent: 'forge:agent:event',
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
  workspace: {
    openFolder(): Promise<WorkspaceOpenResult | null>
    openFile(): Promise<OpenedFile | null>
    selectDirectory(): Promise<WorkspaceInfo | null>
    selectFile(): Promise<OpenedFile | null>
    getCurrent(): Promise<WorkspaceInfo | null>
    setCurrent(path: string): Promise<WorkspaceInfo | null>
    getTree(rootPath?: string): Promise<FileTreeNode | null>
    readDirectory(rootPath?: string): Promise<FileTreeNode | null>
    readFile(filePath: string): Promise<OpenedFile | null>
    saveFile(filePath: string, content: string, expected?: FileState): Promise<WorkspaceResult<OpenedFile>>
    getFileState(filePath: string): Promise<WorkspaceResult<FileState>>
    createEntry(parentPath: string, name: string, type: 'file' | 'directory'): Promise<WorkspaceResult<WorkspaceEntry>>
    renameEntry(entryPath: string, newName: string): Promise<WorkspaceResult<WorkspaceEntry>>
    deleteEntry(entryPath: string): Promise<WorkspaceResult<{ deleted: boolean }>>
    /** Subscribe to workspace file changes; returns an unsubscribe function. */
    onFileChanged(listener: (event: FileChangeEvent) => void): () => void
    /** Subscribe to native menu File > Open Folder; returns an unsubscribe function. */
    onMenuOpenFolder(listener: () => void): () => void
    /** Subscribe to native menu File > Open File; returns an unsubscribe function. */
    onMenuOpenFile(listener: () => void): () => void
    /** Subscribe to native menu File > Save; returns an unsubscribe function. */
    onMenuSaveFile(listener: () => void): () => void
  }
  agent: {
    checkAuth(agentId: AgentId): Promise<AgentAuthStatus>
    listModels(agentId: AgentId): Promise<AgentModel[]>
    createSession(agentId: AgentId, options: CreateSessionOptions): Promise<AgentSession>
    submitPrompt(agentId: AgentId, options: SubmitPromptOptions): Promise<void>
    cancel(agentId: AgentId, sessionId: string, workspacePath?: string): Promise<void>
    /** Subscribe to agent events (text deltas, real tool activity, file changes, done, error). */
    onEvent(listener: (event: AgentEvent) => void): () => void
  }
}
