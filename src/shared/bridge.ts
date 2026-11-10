import type { ForgeApi } from './ipc'

/**
 * The only window object the renderer is allowed to touch.
 *
 * `forgeAI` is created by electron/preload.ts under context isolation. When
 * the renderer runs outside Electron (e.g. plain `vite` in a browser for
 * styling work) it is `undefined`; UI code treats every call as optional so
 * the app still renders without pretending the runtime exists.
 */
export const forgeApi: ForgeApi | undefined =
  typeof window !== 'undefined' && window.forgeAI ? window.forgeAI : undefined
