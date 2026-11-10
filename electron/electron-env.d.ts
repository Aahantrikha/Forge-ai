/// <reference types="vite-plugin-electron/electron-env" />

// NOTE: the renderer no longer receives `window.ipcRenderer`.
// The typed bridge is `window.forgeAI` (declared in src/vite-env.d.ts).

declare namespace NodeJS {
  interface ProcessEnv {
    /**
     * The built directory structure
     *
     * ```tree
     * ├─┬─┬ dist
     * │ │ └── index.html
     * │ │
     * │ ├─┬ dist-electron
     * │ │ ├── main.js
     * │ │ └── preload.mjs
     * │
     * ```
     */
    APP_ROOT: string
    /** /dist/ or /public/ */
    VITE_PUBLIC: string
  }
}
