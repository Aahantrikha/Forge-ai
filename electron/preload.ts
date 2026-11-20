import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'
import { IpcChannels } from '../src/shared/ipc'
import type {
  Agent,
  AgentAuthStatus,
  AgentEvent,
  AgentId,
  AgentModel,
  AgentSession,
  CreateSessionOptions,
  FileChangeEvent,
  FileState,
  ForgeApi,
  ForgeEvent,
  ModelCatalogEntry,
  ModelUsageSummary,
  ProviderId,
  SpawnAgentRequest,
  SubmitPromptOptions,
} from '../src/shared/ipc'

/**
 * Security boundary (Forge AI spec §9).
 *
 * This script is the renderer's ONLY link to the Electron runtime. It exposes:
 * - no raw `ipcRenderer` object,
 * - no generic `send`/`invoke`/`on` passthrough,
 * - no Node APIs.
 *
 * Only the whitelisted channels from `src/shared/ipc.ts` are reachable, and
 * each maps to an explicit handler in `electron/main.ts`.
 */
const api: ForgeApi = {
  app: {
    getInfo: () => ipcRenderer.invoke(IpcChannels.appGetInfo),
  },
  workspace: {
    openFolder: () => ipcRenderer.invoke(IpcChannels.workspaceOpenFolder),
    openFile: () => ipcRenderer.invoke(IpcChannels.workspaceOpenFile),
    selectDirectory: () => ipcRenderer.invoke(IpcChannels.workspaceSelectDirectory),
    selectFile: () => ipcRenderer.invoke(IpcChannels.workspaceOpenFile),
    getCurrent: () => ipcRenderer.invoke(IpcChannels.workspaceGetCurrent),
    setCurrent: (dirPath: string) => ipcRenderer.invoke(IpcChannels.workspaceSetCurrent, dirPath),
    getTree: (rootPath?: string) => ipcRenderer.invoke(IpcChannels.workspaceGetTree, rootPath),
    readDirectory: (rootPath?: string) => ipcRenderer.invoke(IpcChannels.workspaceGetTree, rootPath),
    readFile: (filePath: string) => ipcRenderer.invoke(IpcChannels.workspaceReadFile, filePath),
    saveFile: (filePath: string, content: string, expected?: FileState) =>
      ipcRenderer.invoke(IpcChannels.workspaceSaveFile, filePath, content, expected),
    getFileState: (filePath: string) => ipcRenderer.invoke(IpcChannels.workspaceGetFileState, filePath),
    createEntry: (parentPath: string, name: string, type: 'file' | 'directory') =>
      ipcRenderer.invoke(IpcChannels.workspaceCreateEntry, parentPath, name, type),
    renameEntry: (entryPath: string, newName: string) =>
      ipcRenderer.invoke(IpcChannels.workspaceRenameEntry, entryPath, newName),
    deleteEntry: (entryPath: string) => ipcRenderer.invoke(IpcChannels.workspaceDeleteEntry, entryPath),
    onFileChanged: (listener) => {
      const wrapped = (_event: IpcRendererEvent, event: FileChangeEvent) => listener(event)
      ipcRenderer.on(IpcChannels.workspaceFileChanged, wrapped)
      return () => {
        ipcRenderer.off(IpcChannels.workspaceFileChanged, wrapped)
      }
    },
    onMenuOpenFolder: (listener) => {
      const wrapped = () => listener()
      ipcRenderer.on(IpcChannels.menuOpenFolder, wrapped)
      return () => {
        ipcRenderer.off(IpcChannels.menuOpenFolder, wrapped)
      }
    },
    onMenuOpenFile: (listener) => {
      const wrapped = () => listener()
      ipcRenderer.on(IpcChannels.menuOpenFile, wrapped)
      return () => {
        ipcRenderer.off(IpcChannels.menuOpenFile, wrapped)
      }
    },
    onMenuSaveFile: (listener) => {
      const wrapped = () => listener()
      ipcRenderer.on(IpcChannels.menuSaveFile, wrapped)
      return () => {
        ipcRenderer.off(IpcChannels.menuSaveFile, wrapped)
      }
    },
  },
  agent: {
    checkAuth: (agentId: AgentId): Promise<AgentAuthStatus> =>
      ipcRenderer.invoke(IpcChannels.agentCheckAuth, agentId),
    listModels: (agentId: AgentId): Promise<AgentModel[]> =>
      ipcRenderer.invoke(IpcChannels.agentListModels, agentId),
    createSession: (agentId: AgentId, options: CreateSessionOptions): Promise<AgentSession> =>
      ipcRenderer.invoke(IpcChannels.agentCreateSession, agentId, options),
    submitPrompt: (agentId: AgentId, options: SubmitPromptOptions): Promise<void> =>
      ipcRenderer.invoke(IpcChannels.agentSubmitPrompt, agentId, options),
    cancel: (agentId: AgentId, sessionId: string, workspacePath?: string): Promise<void> =>
      ipcRenderer.invoke(IpcChannels.agentCancel, agentId, sessionId, workspacePath),
    spawn: (request: SpawnAgentRequest): Promise<Agent> =>
      ipcRenderer.invoke(IpcChannels.agentSpawn, request),
    list: (workflowId: string): Promise<Agent[]> =>
      ipcRenderer.invoke(IpcChannels.agentList, workflowId),
    inspect: (agentId: AgentId): Promise<Agent | null> =>
      ipcRenderer.invoke(IpcChannels.agentInspect, agentId),
    execute: (agentId: AgentId, prompt: string): Promise<Agent> =>
      ipcRenderer.invoke(IpcChannels.agentExecute, agentId, prompt),
    terminate: (agentId: AgentId): Promise<Agent> =>
      ipcRenderer.invoke(IpcChannels.agentTerminate, agentId),
    onEvent: (listener: (event: AgentEvent) => void) => {
      const wrapped = (_event: IpcRendererEvent, event: AgentEvent) => listener(event)
      ipcRenderer.on(IpcChannels.agentEvent, wrapped)
      return () => {
        ipcRenderer.off(IpcChannels.agentEvent, wrapped)
      }
    },
  },
  model: {
    list: (providerId?: ProviderId): Promise<ModelCatalogEntry[]> =>
      ipcRenderer.invoke(IpcChannels.modelList, providerId),
    usage: (workflowId?: string): Promise<ModelUsageSummary> =>
      ipcRenderer.invoke(IpcChannels.modelUsage, workflowId),
  },
  events: {
    onForgeEvent: (listener: (event: ForgeEvent) => void) => {
      const wrapped = (_event: IpcRendererEvent, event: ForgeEvent) => listener(event)
      ipcRenderer.on(IpcChannels.forgeEvent, wrapped)
      return () => {
        ipcRenderer.off(IpcChannels.forgeEvent, wrapped)
      }
    },
  },
}

contextBridge.exposeInMainWorld('forgeAI', api)
