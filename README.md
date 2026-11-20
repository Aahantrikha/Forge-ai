# Forge AI

Local-first desktop AI software engineering platform. Forge AI turns a natural-language
objective into a supervised workflow where specialized agents plan, implement, test and
review code in isolated Git worktrees, with the developer approving material actions.
Zero-cost models are the default; paid providers are opt-in.

Stack: Electron + React + TypeScript (Vite).

## Status — M3 agent runtime complete, M4 local execution next

The current release is the working single-agent baseline plus the new foundation:

- **Desktop shell & security foundation**: context isolation, sandboxing, no renderer
  Node access, build-time CSP, native menu, navigation/popup guards, and a typed IPC
  whitelist (`src/shared/ipc.ts`, `electron/preload.ts`) with no raw `ipcRenderer`.
- **Workspace & project management**: directory picker, bounded file tree, live
  filesystem watching, recent workspaces, in-app file editing and saving.
- **OpenCode integration**: provider-level `AgentAdapter`, local engine lifecycle, real
  SSE streaming, tool activity events, free-model prioritization and cancellation.
- **Persistence & coordination foundation**: Zod domain schemas, SQLite with versioned
  migrations and 12 repositories, a durable typed event bus, structured logging and
  validated IPC arguments (`src/shared/domain`, `electron/persistence`,
  `electron/coordination`, `electron/ipc/validation.ts`).
- **Model gateway**: provider-neutral `ProviderAdapter` registry and `ModelGateway` with
  independent persisted sessions, real OpenCode streaming/cancel, timeout/retry, token
  usage accounting, enriched events and typed model IPC (`electron/models`).
- **Agent runtime**: validated role profiles, dynamic role manifests, `AgentFactory`,
  `AgentRegistry`, `AgentRuntime`, scoped `ToolRegistry`, `PathGuard`, lifecycle/heartbeat
  sweeps, concurrency/recursion/token budgets and typed agent IPC (`electron/agents`,
  `electron/security`).

The platform transformation is planned in milestones M0–M8 in `IMPLEMENTATION_PLAN.md`:
M0 audit (complete) → M1 persistence/foundation (complete) → M2 model gateway (complete) → M3 agent runtime (complete) →
M4 worktree execution → M5 orchestration → M6 coordination → M7 verification/approvals →
M8 Agent Workspace. See `ARCHITECTURE.md` for the target design.

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

## Documentation

- `ARCHITECTURE.md` — target system design and migration from the baseline
- `AGENT_PROTOCOL.md` — dynamic agents, lifecycle, messaging and verification
- `SECURITY_MODEL.md` — trust boundaries, permissions and approvals
- `SCALABILITY_ROADMAP.md` — Developer/Professional/Enterprise evolution
- `IMPLEMENTATION_PLAN.md` — M0–M8 milestones, files, dependencies and acceptance
- `DATABASE_SCHEMA.md` — entities, relations and repository interfaces
- `IPC_CONTRACTS.md` — typed renderer↔main channel registry
- `TESTING_STRATEGY.md` — test pyramid and per-milestone gates
- `CHANGELOG.md` — milestone results and decisions

## Scripts

- `npm run dev` — development (Vite HMR + Electron).
- `npm run build` — typecheck, production build, installer (electron-builder).
- `npm run lint` — ESLint.
- `npm test` — Vitest unit/integration tests.
- `npm run test:watch` — Vitest watch mode.
- `npm run rebuild` — rebuild native modules for Electron (requires Visual Studio C++ Build Tools).
