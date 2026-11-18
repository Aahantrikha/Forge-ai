# Forge AI — Scalability & Evolution Roadmap

> Version 2.0. Describes how the local modular monolith evolves without rewriting its
> contracts. Appendix A preserves the superseded v1 roadmap as historical context.

## 1. Current state vs target

| Dimension | Today (M0 baseline) | Target (MVP) | Later |
|---|---|---|---|
| Topology | Electron main + renderer, one OpenCode adapter | Control/execution planes in main, SQLite, typed events | Remote workers, distributed orchestration |
| Model access | Single provider adapter | `ModelGateway` with provider adapters | Multiple providers per workflow, routing/cost policies |
| Persistence | JSON recents + debug log | SQLite repositories, migrations, durable events | PostgreSQL, centralized event store |
| Execution | OpenCode writes to opened workspace | Isolated Git worktrees, policy-controlled tools | Sandboxed containers, remote workers |
| Coordination | One IPC broadcast channel | Typed event bus + message broker + shared context | NATS/Redis-style distributed messaging |
| UI | Chat/workspace/history/settings shell | Agent Workspace with 8 sections | Team collaboration views |

## 2. Edition model

### 2.1 Developer Edition (MVP — current target)

- Single developer, local execution, SQLite.
- Git worktrees and local workflow orchestration.
- Configurable agent concurrency (default 3 coding agents).
- Free-model-first defaults; paid providers opt-in.
- No external infrastructure required.

### 2.2 Professional Edition (future)

- Multiple projects and shared project memory across workflows.
- Remote execution workers behind the same execution interfaces.
- PostgreSQL for centralized persistence; durable distributed workflow orchestration.
- Team collaboration, advanced sandboxing, usage and cost management.
- Role-based access within a team, audit export.

### 2.3 Enterprise Edition (future)

- Multi-tenant architecture, SSO and organization-level policies.
- Private model endpoints and provider allowlists.
- Audit/compliance capabilities, high availability, disaster recovery.
- Centralized worker management and policy enforcement.

No enterprise infrastructure is introduced into the desktop MVP. Interfaces only.

## 3. Scaling dimensions

### 3.1 Persistence

SQLite with WAL, foreign keys, transactions and versioned migrations. Repositories are
interfaces (`ProjectRepository`, `WorkflowRepository`, ...) so PostgreSQL can replace
the implementation without changing business logic. Timestamps are integer epoch
milliseconds. Large artifacts remain on disk; only references live in the database.

Migration path: double-write/read-compare during cutover, then switch repository binding
by configuration. Event ordering is defined by `(occurredAt, sequence)` so it survives a
storage change.

### 3.2 Orchestration

The workflow state machine and task graph are pure TypeScript with no framework
dependency. Checkpoints persist the full state snapshot plus base commit. Remote
durability (e.g. Temporal) can later wrap the same task contracts; the orchestrator must
not depend on in-memory timers for correctness.

### 3.3 Execution

Execution interfaces (`WorktreeManager`, `TerminalExecutionManager`, `FilesystemManager`,
`TestRunner`) are consumed through ports. Local implementations use Git and child
processes. Remote implementations can run the same port contract in a worker with a
different root. Worktree isolation maps naturally to a per-worker container volume.

### 3.4 Messaging and events

The typed event bus currently delivers in-process. Durable storage makes the event log
the source of truth; in-process delivery is an optimization. Consumers must tolerate
duplicate/out-of-order delivery via idempotency keys and correlation IDs. A distributed
broker can later replace the transport without altering producers.

### 3.5 Model access

`ProviderAdapter` is the only place provider SDKs appear. `ModelGateway` can later add
routing (cost, latency, capability), fallbacks, per-role model selection and usage
budgets. Existing OpenCode integration remains a valid adapter even after direct
providers are added.

### 3.6 Artifacts and observability

Artifact references are storage-agnostic. A local file backend is first; an S3-compatible
backend later implements the same `ArtifactStore` interface. Structured logs use a
stable event envelope; OpenTelemetry can be added as an exporter without changing call
sites.

## 4. Future technologies — evaluate when justified

| Technology | Use when | MVP decision |
|---|---|---|
| Temporal | Durable, long-running distributed workflows with remote workers | Not now; local state machine + checkpoints |
| NATS | Distributed agent messaging across workers | Not now; typed in-process bus + durable events |
| PostgreSQL | Multi-project/team/centralized persistence | Not now; repository interface prepared |
| Redis | Distributed coordination, leases, caches | Not now; SQLite leases |
| Docker | Stronger execution isolation | Not now; worktree isolation + command policy |
| OpenTelemetry | Cross-service tracing and metrics | Add exporters later; stable event envelope now |
| S3-compatible storage | Centralized artifacts | Not now; file-backed artifact store |

Introduction criteria: a measured limitation of the local implementation, or a concrete
Professional/Enterprise requirement — never novelty.

## 5. Non-goals for the MVP

- No microservices, message brokers or external databases.
- No automatic semantic conflict resolution.
- No unattended merge to the base branch.
- No unrestricted shell execution or renderer-held credentials.
- No simulation of agent work to satisfy acceptance criteria.

## 6. Capacity targets (to verify, not aspirational claims)

- Default maximum 3 active coding agents, configurable.
- Workflow checkpoints survive process restart; recoverable within one user action.
- Event consumers tolerate duplicate delivery.
- Context retrieval bounded by task scope; no full-repository prompts.

## Appendix A — Superseded v1 roadmap (historical)

The previous plan, replaced by the approved M0–M8 plan in `IMPLEMENTATION_PLAN.md`:

| Milestone | v1 focus | Outcome |
|---|---|---|
| M1 | Desktop UI shell + security foundation | Completed |
| M2 | Workspace & project management | Completed |
| M3 | Agent abstraction + OpenCode SDK | Completed |
| M4 | OpenAI Codex integration | Not started |
| M5 | Gemini via Antigravity CLI | Not started |
| M6 | Terminal & permissions gate | Not started |
| M7 | Diff viewer & Git checkpoints | Not started |
| M8 | Persistent sessions (SQLite) | Not started |
| M9 | Multi-agent collaboration loop | Not started |
| M10 | Windows packaging & release | Not started |

Codex/Gemini work, if pursued, becomes new `ProviderAdapter` implementations under the
v2 model gateway. Packaging remains a release milestone, not an architectural phase.
