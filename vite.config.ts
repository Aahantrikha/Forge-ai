import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import path from 'node:path'
import electron from 'vite-plugin-electron/simple'
import react from '@vitejs/plugin-react'
import { cspMeta, DEV_CSP_CONTENT, PROD_CSP_CONTENT } from './src/shared/csp'

/**
 * CSP injection (§9): injected at build time so the looser development policy
 * (React-refresh preamble, HMR websocket) can never reach a production build.
 */
function injectCsp(dev: boolean): Plugin {
  const content = dev ? DEV_CSP_CONTENT : PROD_CSP_CONTENT
  return {
    name: `forge:inject-csp-${dev ? 'dev' : 'build'}`,
    apply: dev ? 'serve' : 'build',
    transformIndexHtml(html) {
      return html.replace('</head>', `  ${cspMeta(content)}\n  </head>`)
    },
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    injectCsp(true),
    injectCsp(false),
    electron({
      main: {
        // Shortcut of `build.lib.entry`.
        entry: 'electron/main.ts',
      },
      preload: {
        // Shortcut of `build.rollupOptions.input`.
        // Preload scripts may contain Web assets, so use the `build.rollupOptions.input` instead `build.lib.entry`.
        input: path.join(__dirname, 'electron/preload.ts'),
      },
      // NOTE: the `renderer` node-polyfill option from the starter template is
      // intentionally removed — the renderer must not have Node access (§9).
    }),
  ],
})
