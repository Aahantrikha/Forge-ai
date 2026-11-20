# Forge AI — System Architecture Specification

> Version 2.0 — supersedes the v1 single-agent architecture. The v1 roadmap is retained
> only as historical context in `SCALABILITY_ROADMAP.md` Appendix A.

## 1. Purpose and scope

Forge AI is a local-first desktop application that turns a natural-language engineering
objective into a supervised, multi-agent development workflow. Humans define goals and
approve material actions; AI agents plan, implement, test and review inside isolated Git
worktrees. This document defines the target architecture, the boundaries between its
parts, and the migration path from the code that exists today.

The architecture is a **modular monolith** in the Electron main process with explicit
service boundaries. It is not a microservices design. Interfaces are shaped so that
persistence, model access and execution can later be backed by remote infrastructure
without rewriting the orchestrator.

## 2. Product decisions (fixed requirements)

| Area | Decision |
|---|---|
| Execution environment | Local-first |
| Initial deployment | Desktop (Electron + React + TypeScript) |
| Agent creation | Dynamic, based on the objective |
| Model strategy | Same underlying model initially; provider-independent gateway |
| Orchestration | Custom TypeScript engine |
| Coordination | Shared state, structured messages, typed events |
| Persistence | SQLite initially; PostgreSQL adapter later |
| Code isolation | Git worktrees, one per coding agent |
| Execution security | Permission-controlled local execution |
| Autonomy | Human approval for major operations |
| Concurrency | Configurable, default maximum 3 active coding agents |
| Future | Distributed workers, enterprise infrastructure |

Default model selection continues to favour zero-cost models available through the
existing OpenCode integration. Paid providers are opt-in only. This is a product default,
not an architectural restriction: the gateway supports any configured provider.

## 3. Baseline: what exists today

The audit at the start of M0 established the following real baseline. It is preserved
working functionality, not greenfield code to be discarded.

- **Electron shell** with `contextIsolation: true`, `sandbox: true`,
  `nodeIntegration: false`, navigation/popup guards, native menu and CSP injection
  (`electron/main.ts`, `src/shared/csp.ts`, `vite.config.ts`).
- **Typed IPC seam**: `window.forgeAI` is the only renderer capability surface; no
  generic `ipcRenderer` passthrough (`electron/preload.ts`, `src/shared/ipc.ts`).
- **Workspace service**: folder picker, bounded tree indexer, debounced `fs.watch`,
  recent workspaces, in-app text editor and save (`electron/workspace.ts`).
- **One working model integration**: `OpencodeAdapter` against `@opencode-ai/sdk` —
  local engine lifecycle, SSE event translation, model discovery, per-workspace sessions,
  cancellation (`electron/agents/opencode.ts`).
- **Chat UI** with real streaming and tool-activity cards (`src/views/ChatView.tsx`).

Absent from the baseline: any database, Git/worktree logic, terminal/PTY, approval or
permission system, orchestration, agent-to-agent messaging, shared context, artifacts,
workflow state, Zod validation, structured logging and tests.

Known baseline defects and their remediation status:

1. `readFile()` and `saveFile()` now use realpath-aware workspace containment through the
   reusable `PathGuard` in `electron/security/path-guard.ts` (M3 complete).
2. `AgentEvent` now carries `providerId`, `agentId`, `workflowId`, `taskId` and
   `correlationId` from `ModelGateway`; the legacy chat renderer still needs concurrency
   attribution work in M3/M8.
3. `AgentId` still names legacy provider keys, but `ModelGateway` uses a separate
   `ProviderId` and treats dynamic `agentId` as event/persistence context.
4. Chat state remains transient; M1 added the persistence layer and M8 will migrate the UI.

## 4. Target architecture

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ CONTROL PLANE — decides what happens, by whom, with what permission          │
│                                                                              │
│  Project Manager  Workflow Orchestrator  Task Planner  Dependency Resolver   │
│  Agent Factory    Agent Scheduler        Context Manager  Approval Manager   │
│  Permission Policy Engine  Workflow Recovery Manager  Observability Manager  │
└───────────────────────────────┬──────────────────────────────────────────────┘
                                │ typed commands / state transitions
┌───────────────────────────────▼──────────────────────────────────────────────┐
│ EXECUTION PLANE — performs work through controlled interfaces                │
│                                                                              │
│  Coding Agent Runtime   Research Agent Runtime   Testing Agent Runtime       │
│  Code Review Agent Runtime                                                   │
│  Terminal Execution Manager  Filesystem Manager  Git Worktree Manager        │
│  Build & Test Runner         Artifact Manager                                │
└───────────────┬───────────────────────────────────┬──────────────────────────┘
                │ model calls                       │ durable state
┌───────────────▼───────────────┐   ┌───────────────▼──────────────────────────┐
│ MODEL GATEWAY                 │   │ INFRASTRUCTURE & DATA LAYER               │
│ ProviderAdapter interface     │   │ SQLite repositories, migrations, events,  │
│ OpenCode adapter (first)      │   │ messages, artifacts refs, agent sessions, │
│ Future: OpenAI/Anthropic/     │   │ structured logs, telemetry                │
│ local/open-source adapters    │   │                                          │
└───────────────────────────────┘   └──────────────────────────────────────────┘
```

All privileged components live in the Electron main process. The renderer observes
through the typed IPC bridge and submits commands that the main process validates,
authorizes and executes.

### 4.1 Control plane components

| Component | Responsibility |
|---|---|
| Project Manager | Registers local repositories, tracks base commits/branches, owns project metadata. |
| Workflow Orchestrator | Drives the workflow state machine and coordinates all other control components. |
| Task Planner | Turns the objective plus repository context into a typed task graph. |
| Dependency Resolver | Computes ordering, parallelizable sets and blocked-task transitions. |
| Agent Factory | Creates dynamic agents with manifests, sessions and scoped permissions. |
| Agent Scheduler | Enforces concurrency, leases, timeouts, budgets and retries. |
| Context Manager | Maintains versioned, selectively retrieved project memory. |
| Approval Manager | Creates, expires and resolves approval requests; enforces exact-action authorization. |
| Permission Policy Engine | Maps tools/actions to allow, require-approval or deny decisions. |
| Workflow Recovery Manager | Checkpoints state, detects stale leases/heartbeats, resumes after restart. |
| Observability Manager | Emits typed events and structured logs; owns the event envelope. |

### 4.2 Execution plane components

| Component | Responsibility |
|---|---|
| Coding Agent Runtime | Executes coding tasks inside an assigned worktree with a tool set. |
| Research Agent Runtime | Investigates code/docs and produces findings without editing files. |
| Testing Agent Runtime | Runs real tests and captures output as artifacts. |
| Code Review Agent Runtime | Independently inspects diffs, acceptance criteria and test results. |
| Terminal Execution Manager | Validates and runs allowlisted commands with timeouts/resource limits. |
| Filesystem Manager | All reads/writes through path guards and file-ownership checks. |
| Git Worktree Manager | Creates/registers isolated worktrees, tracks base commits, generates diffs, detects conflicts. |
| Build and Test Runner | Detects project commands, executes them, normalizes results. |
| Artifact Manager | Writes artifact files and stores references, never blobs, in SQLite. |

### 4.3 Infrastructure and data layer

SQLite in WAL mode with foreign keys and a versioned migration table. All access goes
through repository interfaces (`ProjectRepository`, `WorkflowRepository`, etc.) so a
PostgreSQL implementation can be substituted. Important state transitions are persisted
as events; the in-process bus is a notification mechanism, not the source of truth.

## 5. Domain identities

Three identity kinds must never be conflated:

| Identity | Example | Purpose |
|---|---|---|
| `ProviderId` | `opencode`, `openai`, `anthropic`, `ollama` | Identifies a model transport adapter. |
| `AgentRole` | `architect`, `frontend`, `qa`, `code-reviewer`, dynamic | Identifies a specialist profile and its instructions/tools. |
| `AgentInstanceId` | UUID | Identifies one dynamically spawned agent in one workflow. |

`AgentSession` is a provider-specific conversation handle owned by exactly one agent
instance. `TaskId` is a node in the workflow dependency graph. An agent instance may work
on several tasks sequentially but only one at a time.

## 6. Key flows

### 6.1 Workflow lifecycle

```
objective → planning → awaiting_approval → executing ⇄ blocked
                                             ↓
                              integration_review → awaiting_merge_approval
                                             ↓                    ↘
                                         completed               failed/cancelled
```

Plan approval is mandatory before agent creation. Merge to the base branch requires a
separate, explicit human approval. Completion is asserted only after acceptance criteria
and required artifacts are verified — an agent's self-report is never sufficient.

### 6.2 Agent execution

1. Planner emits tasks with dependencies, file ownership and acceptance criteria.
2. Dependency Resolver marks ready tasks; Scheduler checks concurrency and budgets.
3. Agent Factory creates an agent manifest, a worktree and an independent model session.
4. Runtime executes with mediated tools; messages/artifacts/events are persisted.
5. QA runs real tests; Reviewer inspects the actual diff independently.
6. Worktree Manager detects overlapping edits and integration conflicts.
7. Approval Manager requests merge authorization with the exact patch/branch.

### 6.3 Model access

All model calls go through `ModelGateway`, which selects a `ProviderAdapter`. The
existing `OpencodeAdapter` becomes the first adapter: it already provides multi-provider
model discovery through `client.provider.list()`, SSE streaming, per-directory sessions
and abort. Direct provider adapters can be added later without changing the orchestrator.

### 6.4 Events

All significant transitions produce an immutable event with `eventId`, `workflowId`,
optional `agentId`/`taskId`, type, payload, `occurredAt` and correlation/causation IDs.
Events are stored durably and broadcast in-process. Consumers must be idempotent:
duplicate delivery is expected after crashes.

## 7. Process and trust boundaries

1. **Renderer** — untrusted. Displays state, submits commands. No Node access.
2. **Preload bridge** — explicit whitelisted methods only; no generic IPC.
3. **Main process services** — validate arguments with Zod, check permissions, own all
   privileged operations. No credentials ever cross into the renderer.
4. **Execution/worktree boundary** — every file operation is resolved and contained;
   every command is validated against a policy; sensitive operations require approval.
5. **Provider boundary** — OpenCode binds to `127.0.0.1` only; provider responses and
   repository content are treated as untrusted data, never as instructions.

## 8. Extension points

- **New model providers**: implement `ProviderAdapter`, register with `ModelGateway`.
- **New agent roles**: add a role profile (instructions, tools, limits); dynamic roles can
  be generated at runtime under a bounded profile schema.
- **PostgreSQL**: implement repository interfaces; no business logic changes.
- **Remote workers**: replace the in-process execution interfaces with a worker client;
  the task and event contracts already carry correlation IDs and idempotency keys.
- **Artifact storage**: `ArtifactManager` resolves references; file backend first,
  object storage later.

## 9. Architectural invariants

1. Renderer has zero direct filesystem, process or network capability beyond the bridge.
2. No credentials in renderer IPC, logs, prompts or agent-generated content.
3. No fabricated agent activity, completion state or test result.
4. No uncontrolled shell execution; no path outside authorized roots.
5. No merge into the base branch without explicit human approval.
6. No destructive action is automatically retried after a crash.
7. Complete tasks are not re-executed without an explicit reason.
8. Every significant state transition is persisted before it is observable.
9. Provider-specific code never appears in the orchestrator.
10. Existing working functionality must not regress; changes are additive unless an
    approved migration says otherwise.

## 10. Migration from the baseline

| Step | Migration |
|---|---|
| Introduce `src/shared/domain/*` and Zod schemas | New typed contracts; `src/shared/agent.ts` remains as the provider-level contract during transition. |
| Add `PathGuard` and fix `readFile`/`saveFile` | Non-breaking hardening of `WorkspaceService`. |
| Add `ModelGateway` | Wrap `OpencodeAdapter`; keep `AgentService` as a thin compatibility facade until UI migration. |
| Add SQLite repositories | Start from empty DB; import recent-workspaces JSON once if useful. |
| Add execution plane | New modules only; no existing workspace editor behavior changed. |
| Add orchestration and Agent Workspace | New IPC channels and a new view; existing chat/workspace views stay intact. |

## 11. Decision log

| Decision | Rationale |
|---|---|
| Modular monolith, not microservices | Local desktop MVP; service interfaces preserve future distribution. |
| Reuse OpenCode as first provider adapter | Existing real integration; avoids duplicate model stacks; already multi-provider. |
| SQLite via repositories | Durable local state with a clean PostgreSQL migration path. |
| Worktrees for isolation | Real branch isolation without container infrastructure in the MVP. |
| Execution before orchestration (approved) | The orchestrator can only be acceptance-tested against a real executor. |
| Free models default, paid opt-in (approved) | Preserves the existing product promise without constraining the gateway. |
| Rewrite docs to M0–M8 (approved) | One authoritative roadmap; old plan kept as historical appendix. |
