# Forge AI

Local-first, open-source desktop AI coding environment for Windows. Forge AI provides a
chat-first interface to multiple autonomous coding agents (OpenCode, OpenAI Codex, Gemini)
using your existing subscriptions — no extra API credits or AI editor subscriptions required.

Stack: Electron + React + TypeScript (Vite).

## Status — Milestone 1: Desktop UI shell + security foundation

Implemented in this milestone:

- Electron security hardening: `contextIsolation: true`, `nodeIntegration: false`,
  `worker` Node disabled, `sandbox: true`, navigation/popup guards, dev-only menu.
- Typed, whitelisted IPC: the renderer has **no** raw `ipcRenderer` access. The full
  channel whitelist lives in `src/shared/ipc.ts` (`IpcChannels`), bridged as
  `window.forgeAI` by `electron/preload.ts`.
- Build-time CSP injection (strict policy in production; dev allowances never ship).
- Desktop shell: frameless custom title bar, activity rail, contextual sidebar,
  status bar, and the chat / workspace / history / settings views with navigation.
- Agent selector UI backed by `src/app/agents.ts` — all integrations honestly report
  `planned` status. No mock agent responses, no simulated activity.

Not implemented yet (by design):

- Workspace management (Milestone 2): open/create/switch projects, file tree.
- Agent integrations (Milestones 3–5): OpenCode SDK, Codex App Server, Antigravity CLI.
- Streaming, permissions, terminal (Milestone 6); diff viewer & git (7); SQLite
  persistence (8); multi-agent orchestration (9); packaging & release (10).

## Architecture

```
src/
  shared/            # IPC contract, CSP, bridge types — the only main↔renderer seam
  app/               # navigation model, agent registry
  components/        # shell components (title bar, rail, sidebar, status bar)
  views/             # chat / workspace / history / settings screens
  styles/            # design tokens & shell styles
electron/
  main.ts            # window lifecycle, security config, whitelisted IPC handlers
  preload.ts         # contextBridge: exposes ONLY the typed ForgeApi surface
```

## Scripts

- `npm run dev` — development (Vite HMR + Electron).
- `npm run build` — typecheck, production build, installer (electron-builder).
- `npm run lint` — ESLint.
