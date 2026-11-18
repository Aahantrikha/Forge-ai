import { app, BrowserWindow, Menu, dialog, ipcMain } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { IpcChannels, type AppInfo } from '../src/shared/ipc'
import { WorkspaceService } from './workspace'

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
const workspaceService = new WorkspaceService(() => win)

function registerIpcHandlers() {
  // Application info (used by the settings screen + status bar).
  ipcMain.handle(IpcChannels.appGetInfo, (): AppInfo => ({
    version: app.getVersion(),
    electronVersion: process.versions.electron ?? 'unknown',
    platform: process.platform,
    isDevelopment,
    security: SECURITY_STATUS,
  }))

  // Workspace controls (Milestone 2 - End-to-End Folder & File operations)
  ipcMain.handle(IpcChannels.workspaceOpenFolder, () => workspaceService.openFolder())
  ipcMain.handle(IpcChannels.workspaceOpenFile, () => workspaceService.openFile())
  ipcMain.handle(IpcChannels.workspaceReadFile, (_event, filePath: string) => workspaceService.readFile(filePath))
  ipcMain.handle(IpcChannels.workspaceSelectDirectory, () => workspaceService.selectDirectory())
  ipcMain.handle(IpcChannels.workspaceGetCurrent, () => workspaceService.getWorkspaceInfo())
  ipcMain.handle(IpcChannels.workspaceSetCurrent, (_event, dirPath: string) => workspaceService.setCurrent(dirPath))
  ipcMain.handle(IpcChannels.workspaceGetTree, (_event, customRoot?: string) => workspaceService.getTree(customRoot))
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
  workspaceService.dispose()
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
