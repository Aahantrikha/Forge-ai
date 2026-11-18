import { app, BrowserWindow, Menu, ipcMain } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { IpcChannels, type AppInfo } from '../src/shared/ipc'
import { WorkspaceService } from './workspace'

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

function sendMaximized(maximized: boolean) {
  win?.webContents.send(IpcChannels.windowMaximizedChanged, maximized)
}

function registerIpcHandlers() {
  // Application info (used by the settings screen + status bar).
  ipcMain.handle(IpcChannels.appGetInfo, (): AppInfo => ({
    version: app.getVersion(),
    electronVersion: process.versions.electron ?? 'unknown',
    platform: process.platform,
    isDevelopment,
    security: SECURITY_STATUS,
  }))

  // Window controls, driven by the frameless custom titlebar.
  ipcMain.on(IpcChannels.windowMinimize, () => win?.minimize())
  ipcMain.on(IpcChannels.windowToggleMaximize, () => {
    if (!win) return
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })
  ipcMain.on(IpcChannels.windowClose, () => win?.close())
  ipcMain.handle(IpcChannels.windowIsMaximized, () => win?.isMaximized() ?? false)

  // Workspace controls (Milestone 2)
  ipcMain.handle(IpcChannels.workspaceSelectDirectory, () => workspaceService.selectDirectory())
  ipcMain.handle(IpcChannels.workspaceGetCurrent, () => workspaceService.getWorkspaceInfo())
  ipcMain.handle(IpcChannels.workspaceSetCurrent, (_event, dirPath: string) => workspaceService.setCurrent(dirPath))
  ipcMain.handle(IpcChannels.workspaceGetTree, (_event, customRoot?: string) => workspaceService.getTree(customRoot))
}

function createWindow() {
  const iconPath = path.join(process.env.APP_ROOT, 'public', 'forge.svg')

  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1080,
    minHeight: 680,
    frame: false, // custom titlebar below (frameless window)
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

  win.center()
  win.setAlwaysOnTop(true)
  win.show()
  win.focus()
  setTimeout(() => {
    win?.setAlwaysOnTop(false)
  }, 1000)

  win.on('maximize', () => sendMaximized(true))
  win.on('unmaximize', () => sendMaximized(false))

  // Navigation guards (§9): no popups, no in-page navigation to remote pages.
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', (event) => event.preventDefault())

  win.webContents.on('did-finish-load', () => {
    win?.show()
    win?.focus()
  })

  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    console.error(`Page failed to load (${errorCode}): ${errorDescription}`)
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
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
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.whenReady().then(() => {
  // In production, remove the default menu entirely (reduces attack surface
  // and removes DevTools shortcuts). Kept in development for debugging.
  if (!isDevelopment) {
    Menu.setApplicationMenu(null)
  }
  registerIpcHandlers()
  createWindow()
})
