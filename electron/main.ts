import { app, BrowserWindow, Menu, dialog, ipcMain } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { IpcChannels, type AppInfo } from '../src/shared/ipc'
import { WorkspaceService } from './workspace'
import { AgentService } from './agent-service'
import { OpencodeAdapter } from './agents/opencode'
import { AgentFactory } from './agents/agent-factory'
import { AgentRegistry } from './agents/agent-registry'
import { AgentRuntime } from './agents/agent-runtime'
import { ModelGateway } from './models/model-gateway'
import { ProviderRegistry } from './models/provider-registry'
import { createForgeContext, disposeForgeContext } from './context'
import { IpcArgs, validateArgs } from './ipc/validation'

const logPath = path.join(app.getPath('userData'), 'electron-debug.log')
try {
  fs.writeFileSync(logPath, `[${new Date().toISOString()}] Main process initialized\n`)
} catch {
  // Ignored if userData is not yet created
}

function debugLog(msg: string) {
  try {
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${msg}\n`)
  } catch {
    // Ignore
  }
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// The built directory structure
//
// ├─┬ dist          (renderer)
// │ └── index.html
// │
// ├─┬ dist-electron
// │ ├── main.js
// │ └── preload.mjs
//
process.env.APP_ROOT = path.join(__dirname, '..')

// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
const isDevelopment = !!VITE_DEV_SERVER_URL
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = path.join(process.env.APP_ROOT, 'public')

/**
 * Security posture (Forge AI spec §9), configured ONCE and reported verbatim
 * to the renderer via `forge:app:get-info` so the settings screen shows the
 * real runtime state rather than aspirational copy.
 */
const SECURITY_STATUS: AppInfo['security'] = {
  contextIsolationEnabled: true,
  sandboxEnabled: true,
  nodeIntegrationEnabled: false,
  ipcChannels: Object.values(IpcChannels),
}

let win: BrowserWindow | null = null
const forge = createForgeContext(app.getPath('userData'))
const workspaceService = new WorkspaceService({
  userDataPath: app.getPath('userData'),
  getWindow: () => win,
  dialogs: {
    showOpenDialog: (options, parent) =>
      parent ? dialog.showOpenDialog(parent, options) : dialog.showOpenDialog(options),
    showMessageBox: (options, parent) =>
      parent ? dialog.showMessageBox(parent, options) : dialog.showMessageBox(options),
  },
})
const modelGateway = new ModelGateway(
  new ProviderRegistry(),
  forge.repositories.modelSessions,
  forge.events,
  forge.logger
)
modelGateway.getRegistry().register(new OpencodeAdapter((event) => modelGateway.ingestProviderEvent(event)))
const agentService = new AgentService(() => win, modelGateway)
modelGateway.setEventSink((event) => agentService.broadcastEvent(event))
const agentRegistry = new AgentRegistry()
const agentFactory = new AgentFactory(forge.repositories, modelGateway, forge.events, forge.logger)
const agentRuntime = new AgentRuntime(
  forge.repositories,
  agentRegistry,
  agentFactory,
  modelGateway,
  forge.events,
  forge.logger
)
const heartbeatSweep = setInterval(() => agentRuntime.sweepStale(), 30_000)
forge.events.on('*', (event) => win?.webContents.send(IpcChannels.forgeEvent, event))

function registerIpcHandlers() {
  // Application info (used by the settings screen + status bar).
  ipcMain.handle(IpcChannels.appGetInfo, (): AppInfo => ({
    version: app.getVersion(),
    electronVersion: process.versions.electron ?? 'unknown',
    platform: process.platform,
    isDevelopment,
    security: SECURITY_STATUS,
  }))

  // Workspace controls — every argument is validated at the trust boundary.
  ipcMain.handle(IpcChannels.workspaceOpenFolder, () => workspaceService.openFolder())
  ipcMain.handle(IpcChannels.workspaceOpenFile, () => workspaceService.openFile())
  ipcMain.handle(IpcChannels.workspaceReadFile, (_event, ...args: unknown[]) => {
    const [filePath] = validateArgs(IpcArgs.readFile, args, IpcChannels.workspaceReadFile)
    return workspaceService.readFile(filePath)
  })
  ipcMain.handle(IpcChannels.workspaceSaveFile, (_event, ...args: unknown[]) => {
    const [filePath, content, expected] = validateArgs(IpcArgs.saveFile, args, IpcChannels.workspaceSaveFile)
    return workspaceService.saveFile(filePath, content, expected)
  })
  ipcMain.handle(IpcChannels.workspaceGetFileState, (_event, ...args: unknown[]) => {
    const [filePath] = validateArgs(IpcArgs.getFileState, args, IpcChannels.workspaceGetFileState)
    return workspaceService.getFileState(filePath)
  })
  ipcMain.handle(IpcChannels.workspaceCreateEntry, (_event, ...args: unknown[]) => {
    const [parentPath, name, type] = validateArgs(IpcArgs.createEntry, args, IpcChannels.workspaceCreateEntry)
    return workspaceService.createEntry(parentPath, name, type)
  })
  ipcMain.handle(IpcChannels.workspaceRenameEntry, (_event, ...args: unknown[]) => {
    const [entryPath, newName] = validateArgs(IpcArgs.renameEntry, args, IpcChannels.workspaceRenameEntry)
    return workspaceService.renameEntry(entryPath, newName)
  })
  ipcMain.handle(IpcChannels.workspaceDeleteEntry, (_event, ...args: unknown[]) => {
    const [entryPath] = validateArgs(IpcArgs.deleteEntry, args, IpcChannels.workspaceDeleteEntry)
    return workspaceService.deleteEntry(entryPath)
  })
  ipcMain.handle(IpcChannels.workspaceSelectDirectory, () => workspaceService.selectDirectory())
  ipcMain.handle(IpcChannels.workspaceGetCurrent, () => workspaceService.getWorkspaceInfo())
  ipcMain.handle(IpcChannels.workspaceSetCurrent, (_event, ...args: unknown[]) => {
    const [dirPath] = validateArgs(IpcArgs.setCurrent, args, IpcChannels.workspaceSetCurrent)
    return workspaceService.setCurrent(dirPath)
  })
  ipcMain.handle(IpcChannels.workspaceGetTree, (_event, ...args: unknown[]) => {
    const [customRoot] = validateArgs(IpcArgs.getTree, args, IpcChannels.workspaceGetTree)
    return workspaceService.getTree(customRoot)
  })

  // Agent controls — provider-level facade; dynamic agents arrive in M3.
  ipcMain.handle(IpcChannels.agentCheckAuth, (_event, ...args: unknown[]) => {
    const [agentId] = validateArgs(IpcArgs.checkAuth, args, IpcChannels.agentCheckAuth)
    return agentService.checkAuth(agentId)
  })
  ipcMain.handle(IpcChannels.agentListModels, (_event, ...args: unknown[]) => {
    const [agentId] = validateArgs(IpcArgs.listModels, args, IpcChannels.agentListModels)
    return agentService.listModels(agentId)
  })
  ipcMain.handle(IpcChannels.agentCreateSession, (_event, ...args: unknown[]) => {
    const [agentId, options] = validateArgs(IpcArgs.createSession, args, IpcChannels.agentCreateSession)
    return agentService.createSession(agentId, options)
  })
  ipcMain.handle(IpcChannels.agentSubmitPrompt, (_event, ...args: unknown[]) => {
    const [agentId, options] = validateArgs(IpcArgs.submitPrompt, args, IpcChannels.agentSubmitPrompt)
    return agentService.submitPrompt(agentId, options)
  })
  ipcMain.handle(IpcChannels.agentCancel, (_event, ...args: unknown[]) => {
    const [agentId, sessionId, workspacePath] = validateArgs(IpcArgs.cancel, args, IpcChannels.agentCancel)
    return agentService.cancel(agentId, sessionId, workspacePath)
  })

  // Dynamic agent runtime channels — every argument is validated at the trust boundary.
  ipcMain.handle(IpcChannels.agentSpawn, (_event, ...args: unknown[]) => {
    const [request] = validateArgs(IpcArgs.agentSpawn, args, IpcChannels.agentSpawn)
    return agentRuntime.spawn(request)
  })
  ipcMain.handle(IpcChannels.agentList, (_event, ...args: unknown[]) => {
    const [workflowId] = validateArgs(IpcArgs.agentList, args, IpcChannels.agentList)
    return agentRuntime.list(workflowId)
  })
  ipcMain.handle(IpcChannels.agentInspect, (_event, ...args: unknown[]) => {
    const [agentId] = validateArgs(IpcArgs.agentInspect, args, IpcChannels.agentInspect)
    return agentRuntime.get(agentId)
  })
  ipcMain.handle(IpcChannels.agentExecute, (_event, ...args: unknown[]) => {
    const [agentId, prompt] = validateArgs(IpcArgs.agentExecute, args, IpcChannels.agentExecute)
    return agentRuntime.execute(agentId, prompt)
  })
  ipcMain.handle(IpcChannels.agentTerminate, (_event, ...args: unknown[]) => {
    const [agentId] = validateArgs(IpcArgs.agentTerminate, args, IpcChannels.agentTerminate)
    return agentRuntime.terminate(agentId)
  })

  // Model gateway channels — provider catalog and persisted usage.
  ipcMain.handle(IpcChannels.modelList, (_event, ...args: unknown[]) => {
    const [providerId] = validateArgs(IpcArgs.modelList, args, IpcChannels.modelList)
    return modelGateway.listModels(providerId)
  })
  ipcMain.handle(IpcChannels.modelUsage, (_event, ...args: unknown[]) => {
    const [workflowId] = validateArgs(IpcArgs.modelUsage, args, IpcChannels.modelUsage)
    return modelGateway.getUsage(workflowId)
  })
}

function setupApplicationMenu() {
  const isMac = process.platform === 'darwin'
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac ? [{ role: 'appMenu' as const }] : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'Open Folder...',
          accelerator: 'CmdOrCtrl+O',
          click: () => {
            win?.webContents.send(IpcChannels.menuOpenFolder)
          },
        },
        {
          label: 'Open File...',
          accelerator: 'CmdOrCtrl+Shift+O',
          click: () => {
            win?.webContents.send(IpcChannels.menuOpenFile)
          },
        },
        {
          label: 'Save',
          accelerator: 'CmdOrCtrl+S',
          click: () => {
            win?.webContents.send(IpcChannels.menuSaveFile)
          },
        },
        { type: 'separator' as const },
        isMac ? { role: 'close' as const } : { role: 'quit' as const },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' as const },
        { role: 'redo' as const },
        { type: 'separator' as const },
        { role: 'cut' as const },
        { role: 'copy' as const },
        { role: 'paste' as const },
        { role: 'selectAll' as const },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' as const },
        { role: 'forceReload' as const },
        { role: 'toggleDevTools' as const },
        { type: 'separator' as const },
        { role: 'resetZoom' as const },
        { role: 'zoomIn' as const },
        { role: 'zoomOut' as const },
        { type: 'separator' as const },
        { role: 'togglefullscreen' as const },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' as const },
        { role: 'zoom' as const },
        ...(isMac ? [{ type: 'separator' as const }, { role: 'front' as const }] : [{ role: 'close' as const }]),
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About Forge AI',
          click: () => {
            if (win) {
              dialog.showMessageBox(win, {
                type: 'info',
                title: 'About Forge AI',
                message: `Forge AI v${app.getVersion()}`,
                detail:
                  'Local-first, open-source desktop AI coding environment for Windows.\nElectron ' +
                  (process.versions.electron ?? ''),
              })
            }
          },
        },
      ],
    },
  ]

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}

function createWindow() {
  debugLog('createWindow called')
  const iconPath = path.join(process.env.APP_ROOT, 'public', 'forge.svg')

  // Keep native OS window frame intact — frame: true provides native OS window controls
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1080,
    minHeight: 680,
    frame: true,
    show: true,
    center: true,
    backgroundColor: '#0e1013',
    icon: iconPath,
    title: 'Forge AI',
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      // §9 mandatory hardening — explicit instead of relying on defaults.
      contextIsolation: true, // renderer globals isolated from preload/main
      nodeIntegration: false, // no Node access in renderer
      nodeIntegrationInWorker: false,
      sandbox: true, // Chromium sandbox for the renderer
    },
  })

  debugLog(`BrowserWindow created. ID: ${win.id}`)
  win.center()
  win.setAlwaysOnTop(true)
  win.show()
  win.focus()
  setTimeout(() => {
    win?.setAlwaysOnTop(false)
  }, 1000)

  // Navigation guards (§9): no popups, no in-page navigation to remote pages.
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', (event) => event.preventDefault())

  win.webContents.on('did-finish-load', () => {
    debugLog('webContents did-finish-load')
    win?.show()
    win?.focus()
  })

  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    debugLog(`webContents did-fail-load: ${errorCode} - ${errorDescription}`)
  })

  if (VITE_DEV_SERVER_URL) {
    debugLog(`Loading dev URL: ${VITE_DEV_SERVER_URL}`)
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    debugLog(`Loading file: ${path.join(RENDERER_DIST, 'index.html')}`)
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  clearInterval(heartbeatSweep)
  workspaceService.dispose()
  void agentService.dispose()
  disposeForgeContext(forge)
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.whenReady().then(() => {
  debugLog('app.whenReady resolved')
  setupApplicationMenu()
  registerIpcHandlers()
  createWindow()
})
