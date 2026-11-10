/**
 * Content-Security-Policy definitions (Forge AI spec §9).
 *
 * The CSP is injected at build time by vite.config.ts instead of being baked
 * into index.html, so the looser development policy (React-refresh preamble,
 * HMR websocket) can never ship in a production build.
 */

/** Production policy: renderer loads only local app assets, no remote origins. */
export const PROD_CSP_CONTENT = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ')

/**
 * Development policy: additionally allows the inline React-refresh preamble,
 * Vite-injected styles and the localhost dev server / HMR websocket.
 */
export const DEV_CSP_CONTENT = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self' http://localhost:* ws://localhost:*",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ')

export function cspMeta(content: string): string {
  return `<meta http-equiv="Content-Security-Policy" content="${content}" />`
}
