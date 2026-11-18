import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'
import { IpcChannels } from '../src/shared/ipc'
import type { FileChangeEvent, ForgeApi } from '../src/shared/ipc'

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
  window: {
    minimize: () => {
      void ipcRenderer.send(IpcChannels.windowMinimize)
    },
    toggleMaximize: () => {
      void ipcRenderer.send(IpcChannels.windowToggleMaximize)
    },
    close: () => {
      void ipcRenderer.send(IpcChannels.windowClose)
    },
    isMaximized: () => ipcRenderer.invoke(IpcChannels.windowIsMaximized),
    onMaximizedChanged: (listener) => {
      const wrapped = (_event: IpcRendererEvent, maximized: boolean) => listener(maximized)
      ipcRenderer.on(IpcChannels.windowMaximizedChanged, wrapped)
      return () => {
        ipcRenderer.off(IpcChannels.windowMaximizedChanged, wrapped)
      }
    },
  },
  workspace: {
    selectDirectory: () => ipcRenderer.invoke(IpcChannels.workspaceSelectDirectory),
    getCurrent: () => ipcRenderer.invoke(IpcChannels.workspaceGetCurrent),
    setCurrent: (dirPath: string) => ipcRenderer.invoke(IpcChannels.workspaceSetCurrent, dirPath),
    getTree: (rootPath?: string) => ipcRenderer.invoke(IpcChannels.workspaceGetTree, rootPath),
    onFileChanged: (listener) => {
      const wrapped = (_event: IpcRendererEvent, event: FileChangeEvent) => listener(event)
      ipcRenderer.on(IpcChannels.workspaceFileChanged, wrapped)
      return () => {
        ipcRenderer.off(IpcChannels.workspaceFileChanged, wrapped)
      }
    },
  },
}

contextBridge.exposeInMainWorld('forgeAI', api)
