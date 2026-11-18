import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'
import { IpcChannels } from '../src/shared/ipc'
import type {
  AgentAuthStatus,
  AgentEvent,
  AgentId,
  AgentModel,
  AgentSession,
  CreateSessionOptions,
  FileChangeEvent,
  ForgeApi,
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
    saveFile: (filePath: string, content: string) => ipcRenderer.invoke(IpcChannels.workspaceSaveFile, filePath, content),
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
    onEvent: (listener: (event: AgentEvent) => void) => {
      const wrapped = (_event: IpcRendererEvent, event: AgentEvent) => listener(event)
      ipcRenderer.on(IpcChannels.agentEvent, wrapped)
      return () => {
        ipcRenderer.off(IpcChannels.agentEvent, wrapped)
      }
    },
  },
}

contextBridge.exposeInMainWorld('forgeAI', api)
