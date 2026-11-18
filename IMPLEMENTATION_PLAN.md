# Forge AI — Implementation Plan

> Version 2.0. Supersedes the v1 M1–M10 plan; see `SCALABILITY_ROADMAP.md` Appendix A.
> Approved decisions: rewrite docs to this plan; free models remain default with paid
> opt-in; local execution is implemented before orchestration.

## 1. Strategy

1. One milestone at a time. Each milestone ends with tests, lint, typecheck, build and a
   written acceptance result in `CHANGELOG.md`.
2. Preserve working functionality: workspace tree, file editor, OpenCode streaming and
   the hardened IPC/CSP boundary remain intact. New capabilities are additive.
3. No fake capabilities. Mock adapters are allowed in unit tests only; acceptance tests
   use real Git repositories, real worktrees and a real configured model provider.
4. Contracts before implementations: Zod-validated domain types and repository/event
   interfaces land in M1 so later modules do not invent incompatible shapes.
5. Privileged code stays in the Electron main process; the renderer only sees typed IPC.

## 2. Baseline (verified in M0)

Complete: Electron shell + security foundation, workspace/file management, provider-level
`AgentAdapter` and OpenCode SDK integration with real streaming and tool events, chat UI.
Absent: persistence, orchestration, agent runtime, execution plane, coordination,
approvals, verification, Agent Workspace, tests, runtime validation, structured logging.
Known defects: partial path containment, no `agentId` on events, provider ID conflated
with agent ID, transient chat state. See `ARCHITECTURE.md` §3 and `SECURITY_MODEL.md` §2.

## 3. Milestone roadmap

| Milestone | Deliverables | Tests / acceptance | Status |
|---|---|---|---|
| **M0 — Audit & architecture** | Repository audit; revised `ARCHITECTURE.md`, `AGENT_PROTOCOL.md`, `SECURITY_MODEL.md`, `SCALABILITY_ROADMAP.md`, `IMPLEMENTATION_PLAN.md`; new `DATABASE_SCHEMA.md`, `IPC_CONTRACTS.md`, `TESTING_STRATEGY.md`, `CHANGELOG.md` | All 9 docs present, internally consistent, based on verified code; M0 result recorded | **Completed** |
| **M1 — Foundation & persistence** | Zod domain schemas; SQLite database, migrations, all 12 repositories; typed event bus + durable event store; structured logger; Vitest harness; IPC argument validation | Schema migration test; repository CRUD/transaction tests; event replay/dedup tests; `npm run lint`, `npx tsc --noEmit`, `npx vite build` | **Completed** |
| **M2 — Model gateway** | `ProviderAdapter` registry; `ModelGateway` with independent sessions, streaming, cancel, timeout, retry, token usage, error reporting; wrap `OpencodeAdapter`; provider-level event enrichment (`agentId`) | Real OpenCode session test (create/stream/cancel); usage accounting test; adapter swap test with a unit-test fake | Pending |
| **M3 — Agent runtime** | `AgentFactory`, `AgentRegistry`, `AgentRuntime`, role prompts, dynamic role validation, tool registry, `PathGuard` (fix read/save containment), lifecycle/heartbeats, budgets/concurrency | Lifecycle transition tests; path traversal/symlink tests; concurrency and budget limit tests; regression test that existing workspace editor still saves | Pending |
| **M4 — Local execution** | Worktree manager (branch `forge/<workflow-id>/<role>`, base commit, registration), filesystem manager with ownership checks, terminal manager with command policy/timeouts, test runner, diff and conflict detection | Integration tests on temp Git repos: create/list/remove worktree, overlapping edit detection, diff generation, command allow/deny/approval-required, real test command execution | Pending |
| **M5 — Orchestration** | Planner, dependency resolver, scheduler, workflow state machine, plan approval gate, pause/resume/cancel/recovery, checkpoints | Graph/dependency tests; state-machine transition tests; restart recovery test; no plan → no agents invariant test | Pending |
| **M6 — Coordination** | Message broker, shared versioned context, artifact manager/refs, dependency/blocker notifications, task handoffs, durable event delivery | Message persistence/idempotency tests; context-scoping test (no full repo prompt); artifact ref test; duplicate-delivery test | Pending |
| **M7 — Verification & approvals** | QA agent integration, independent reviewer, security/policy checks, approval manager with exact-action hashing, audit trail, controlled merge | Independent-review test (reviewer sees diff/test output, not self-report); approval hash-invalidation test; merge without approval denied; conflict escalation test | Pending |
| **M8 — Agent Workspace** | Overview, Agents, Task Board, Communication, Terminal, Files & Diffs, Approval Center, Workflow History views integrated into existing shell; responsive styling; docs finalized | UI integration tests with real backend events; no decorative controls; full MVP acceptance run (§6) | Pending |

Execution (M4) precedes orchestration (M5) by approved decision so the orchestrator is
tested against a real executor.

## 4. Files by milestone

### M1
- Create: `src/shared/domain/{ids,workflow,task,agent,message,approval,artifact,event,execution}.ts`; `electron/persistence/{database,schema,migrations/*,repositories/*}.ts`; `electron/coordination/event-bus.ts`; `electron/observability/logger.ts`; `vitest.config.ts`; `tests/persistence/**`, `tests/coordination/event-bus.test.ts`.
- Modify: `package.json` (scripts/deps), `src/shared/ipc.ts` (validation imports), `electron/main.ts` (initialize database/logger/event bus).

### M2
- Create: `electron/models/{model-gateway,provider-adapter,provider-registry}.ts`; `tests/models/**`.
- Modify: `electron/agents/opencode.ts` (emit enriched events), `electron/agent-service.ts` (thin facade over gateway), `src/shared/agent.ts` (provider ID typing).

### M3
- Create: `electron/agents/{agent-factory,agent-registry,agent-runtime,agent-context}.ts`; `electron/agents/agent-prompts/*`; `electron/security/{tool-permissions,path-guard}.ts`; `tests/agents/**`, `tests/security/path-guard.test.ts`.
- Modify: `electron/workspace.ts` (use `PathGuard` for read/save), `src/shared/ipc.ts` (agent channels).

### M4
- Create: `electron/execution/{git-manager,worktree-manager,filesystem-manager,terminal-manager,test-runner,diff-manager,artifact-manager}.ts`; `electron/security/command-policy.ts`; `tests/execution/**`.
- Modify: `package.json` (git/shell deps if needed), `electron/main.ts` (register services).

### M5
- Create: `electron/orchestration/{orchestrator,planner,scheduler,dependency-resolver,workflow-engine,recovery-manager}.ts`; `tests/orchestration/**`.
- Modify: `src/shared/ipc.ts` (workflow/task channels).

### M6
- Create: `electron/coordination/{message-broker,artifact-manager,context-manager}.ts`; `tests/coordination/**`.
- Modify: `electron/coordination/event-bus.ts` (durable delivery), `src/shared/ipc.ts` (message channels).

### M7
- Create: `electron/approvals/{approval-manager,permission-policy}.ts`; `electron/verification/{qa-runner,code-reviewer,integration-validator}.ts`; `tests/approvals/**`, `tests/verification/**`.
- Modify: `electron/main.ts`, `src/shared/ipc.ts` (approval channels), `SECURITY_MODEL.md` (as-built controls).

### M8
- Create: `src/views/AgentWorkspace.tsx`; `src/components/agents/{Overview,AgentsPanel,TaskBoard,Communication,TerminalPanel,FilesDiffs,ApprovalCenter,WorkflowHistory}.tsx`; `tests/ui/**`.
- Modify: `src/App.tsx`, `src/app/navigation.ts`, `src/components/ActivityRail.tsx`, `src/styles/theme.css`, all docs (final as-built update).

## 5. Dependencies

| Dependency | Purpose | Milestone |
|---|---|---|
| `better-sqlite3`, `@types/better-sqlite3`, `@electron/rebuild` | SQLite persistence with Electron native rebuild | M1 |
| `zod` | Runtime validation at IPC/service/repository boundaries | M1 |
| `vitest` (+ jsdom/testing-library later) | Unit and integration tests | M1 |
| `simple-git` (or direct `child_process` git) | Worktree and diff operations | M4 |
| `node-pty`, `@xterm/xterm` | Live terminal execution | M4/M8 |
| `crypto.randomUUID` (Node built-in) | IDs — no extra dependency | M1 |

No new UI framework, state library or model SDK is planned; OpenCode SDK is reused.

## 6. MVP acceptance criteria (must pass at M8)

1. User selects an existing local repository.
2. User describes a development objective.
3. Architect agent analyzes the repository.
4. Forge AI generates a structured development plan.
5. User approves the plan.
6. Orchestrator dynamically creates at least three agents.
7. Agents receive independent sessions using the same configured model.
8. Independent tasks execute concurrently.
9. Agents communicate through structured messages.
10. Agents operate in isolated Git worktrees.
11. Agents modify actual project files.
12. QA runs real tests.
13. Reviewer inspects actual code changes.
14. Forge AI detects integration conflicts.
15. User inspects every proposed change.
16. Merge requires explicit approval.
17. Workflow state survives application restart.
18. Failed agents recover safely.
19. User pauses, resumes and cancels workflows.

Acceptance fails if any of these is satisfied by mocked UI or simulated agent output.

## 7. Risks and mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| Native SQLite module breaks packaging | High | Rebuild with `@electron/rebuild`; verify `npm run build` from M1, not at release |
| OpenCode executes tools outside the worktree | High | Scope every session to worktree path; verify SDK permission surface; block write tools until confirmed |
| Existing chat state loss viewed as regression | Medium | Keep legacy chat working; new Agent Workspace is additive; persistence arrives in M1/M8 |
| IPC surface grows unsafe | High | Zod validation per handler; no generic passthrough; `IPC_CONTRACTS.md` kept current |
| Worktree operations on dirty repos | Medium | Record base commit; refuse unsafe starts; require user resolution; approval for destructive Git |
| Event misattribution under concurrency | High | `agentId`/`taskId` on all events; route by ID; tests assert attribution |
| Runaway cost/agents | Medium | Token budgets, concurrency caps, recursion limit, free-model default |
| Test flakiness from real providers | Medium | Unit tests use fakes; acceptance tests use configured provider with timeouts and retries; no fake success |

## 8. Verification pipeline for every milestone

```
npx tsc --noEmit  →  npm run lint  →  npx vite build  →  npm test  →  milestone acceptance note
```

If a command is unavailable or fails, the milestone is not accepted and the issue is
recorded in `CHANGELOG.md` before proceeding.

## 9. M0 acceptance result

- Verified the full repository: config, Electron main/preload, IPC, services, OpenCode
  adapter, React views/components, styles, docs, git history. (Read-only audit.)
- Presented the audit, gap analysis, architecture changes, recommended order, file and
  dependency plan, risks and acceptance criteria.
- Recorded three approved decisions: docs replaced by M0–M8 plan; free models default with
  paid opt-in; execution implemented before orchestration.
- All nine required documents are written and reference verified code locations.
- No application code was modified during M0; no tests/build were required for a
  documentation-only milestone. The verification pipeline applies from M1 onward.
