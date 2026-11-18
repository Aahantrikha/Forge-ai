# Changelog

All notable changes to Forge AI are recorded here. Format follows Keep a Changelog.

## [Unreleased]

### M1 — Foundation & persistence — Completed

- Added `better-sqlite3`, `zod`, `vitest`, `@types/better-sqlite3`, `@electron/rebuild`,
  `npm test`, `npm run test:watch` and `npm run rebuild`.
- Created Zod domain schemas for ids, workflows, tasks, agents, messages, artifacts,
  approvals, events, model sessions, executions and checkpoints in `src/shared/domain`.
- Added the SQLite foundation: `ForgeDatabase`, WAL/foreign-key pragmas, versioned
  migrations with idempotent application, a typed schema table registry and all 12
  repositories with CRUD, transaction and cascade coverage.
- Added `TypedEventBus` with durable persistence, typed/wildcard listeners, sequence
  assignment, event-id deduplication, replay and delivery tracking.
- Added `StructuredLogger` with newline-delimited JSON output and secret redaction.
- Added Zod IPC argument validation at the main-process trust boundary and initialized
  the database, repositories, event bus and logger in `electron/main.ts`.
- Added a Vitest harness and 24 tests covering schema validation, migrations, foreign
  keys, transactions, repository CRUD, cascades, event replay/dedup, delivery counts,
  IPC rejection and log redaction.
- Acceptance result: `npx tsc --noEmit`, `npm run lint`, `npx vite build` and `npm test`
  all pass (24/24 tests). `better-sqlite3` works via its N-API prebuilt binary;
  `npm run rebuild` still requires Visual Studio C++ Build Tools on this machine and is
  deferred to the packaging milestone.

### M0 — Repository audit & architecture specification — Completed

- Audited the full repository: Electron entry points, IPC whitelist, preload bridge,
  workspace service, provider adapter, React views/components, styles, config and git
  history. Audit was read-only; no application code was changed.
- Verified baseline: Electron shell and hardened IPC/CSP, workspace/file editor, and a
  working OpenCode SDK adapter with real streaming are complete. No persistence,
  orchestration, agent runtime, worktrees, approvals, coordination, verification, tests,
  runtime validation or structured logging exist yet.
- Recorded three approved decisions:
  - replace the v1 M1–M10 roadmap with the master directive's M0–M8 architecture;
  - keep zero-cost models as the default with paid providers strictly opt-in;
  - implement local execution before orchestration so acceptance tests use a real executor.
- Rewrote `ARCHITECTURE.md`, `AGENT_PROTOCOL.md`, `SECURITY_MODEL.md`,
  `SCALABILITY_ROADMAP.md` and `IMPLEMENTATION_PLAN.md` for the two-plane architecture.
- Added `DATABASE_SCHEMA.md`, `IPC_CONTRACTS.md`, `TESTING_STRATEGY.md` and this changelog.
- Documented known baseline defects for remediation: partial path containment
  (`readFile`/`saveFile`), missing `agentId` on events, provider/agent identity conflation,
  and transient chat state.
- Acceptance result: all nine documents present and internally consistent; every claim
  about current code verified against source locations. Documentation-only milestone, so
  the code verification pipeline (typecheck/lint/build/test) begins at M1.

## [0.1.0] — Baseline milestones (historical)

### Added (v1 roadmap)

- Desktop UI shell, hardened Electron configuration, CSP and typed IPC bridge.
- Workspace directory tree, filesystem watching and in-app file editing/saving.
- Unified provider-level `AgentAdapter` and OpenCode SDK integration with real streaming,
  tool activity events, free-model prioritization and cancellation.

### Superseded

- The v1 M4–M10 roadmap (Codex, Gemini, terminal, diff, SQLite, multi-agent, packaging)
  is retained only as historical context in `SCALABILITY_ROADMAP.md` Appendix A. Its
  capabilities are re-scoped under the M0–M8 plan in `IMPLEMENTATION_PLAN.md`.
