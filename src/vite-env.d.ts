/// <reference types="vite/client" />
import type { ForgeApi } from './shared/ipc'

declare global {
  interface Window {
    /**
     * Typed bridge exposed by electron/preload.ts under context isolation.
     * Optional: it only exists when the renderer runs inside Electron.
     */
    forgeAI?: ForgeApi
  }
}

export {}
