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
}

contextBridge.exposeInMainWorld('forgeAI', api)
