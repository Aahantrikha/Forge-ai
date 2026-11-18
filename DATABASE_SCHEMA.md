# Forge AI — Database Schema

> Version 1.0. SQLite is the initial implementation; all access goes through repository
> interfaces so PostgreSQL can be introduced without changing business logic.

## 1. Conventions

- Every table has `id TEXT PRIMARY KEY` (UUID v4 from `crypto.randomUUID`).
- Timestamps are integer epoch milliseconds in UTC: `created_at`, `updated_at`,
  `started_at`, `completed_at`, etc.
- JSON columns are stored as `TEXT` and validated with Zod at the repository boundary.
- Foreign keys are enforced (`PRAGMA foreign_keys = ON`); WAL mode and a busy timeout are
  set on connection.
- All writes participate in explicit transactions where multiple rows must agree.
- Large artifacts are files on disk; the database stores only references and checksums.
- Status/type columns use `CHECK` constraints matching the Zod enums in
  `src/shared/domain/*`. The database is the second line of defense, not the first.

## 2. Migration management

A `schema_migrations` table (`version INTEGER PRIMARY KEY`, `name TEXT NOT NULL`,
`applied_at INTEGER NOT NULL`) records applied migrations. Migration files are numbered
and applied in order at startup; each runs in a transaction. Migrations are additive by
default; destructive changes require an explicit down-migration and a documented reason.

## 3. Entity relationship overview

```
projects 1───* workflows 1───* tasks 1───* agent_tasks *───1 agents
                  │               │                       │
                  ├─* artifacts   ├─* execution_records   ├─1 model_sessions
                  ├─* agent_messages (also → tasks)       │
                  ├─* approvals (also → tasks, agents)    │
                  ├─* events (also → agents, tasks)       │
                  └─* workflow_checkpoints                │
```

## 4. Tables

### 4.1 projects

| Column | Type | Constraints |
|---|---|---|
| id | TEXT | PK |
| name | TEXT | NOT NULL |
| path | TEXT | NOT NULL UNIQUE (resolved absolute path) |
| repo_remote | TEXT | nullable |
| default_branch | TEXT | nullable |
| last_opened_at | INTEGER | NOT NULL |
| created_at / updated_at | INTEGER | NOT NULL |

### 4.2 workflows

| Column | Type | Constraints |
|---|---|---|
| id | TEXT | PK |
| project_id | TEXT | NOT NULL FK → projects(id) ON DELETE CASCADE |
| objective | TEXT | NOT NULL |
| status | TEXT | NOT NULL CHECK IN (`planning`, `awaiting_approval`, `executing`, `blocked`, `integration_review`, `awaiting_merge_approval`, `completed`, `failed`, `cancelled`) |
| plan_artifact_id | TEXT | nullable FK → artifacts(id) |
| base_commit | TEXT | nullable |
| base_branch | TEXT | nullable |
| failure_reason | TEXT | nullable |
| metadata | TEXT | nullable JSON |
| created_at / updated_at / started_at / completed_at | INTEGER | NOT NULL for created/updated; others nullable |

Indexes: `(project_id, created_at)`, `(status)`.

### 4.3 tasks

| Column | Type | Constraints |
|---|---|---|
| id | TEXT | PK |
| workflow_id | TEXT | NOT NULL FK → workflows(id) ON DELETE CASCADE |
| parent_task_id | TEXT | nullable FK → tasks(id) |
| objective | TEXT | NOT NULL |
| description | TEXT | NOT NULL DEFAULT '' |
| task_type | TEXT | NOT NULL CHECK IN (`planning`, `research`, `coding`, `testing`, `review`, `integration`) |
| status | TEXT | NOT NULL CHECK IN (`pending`, `ready`, `running`, `blocked`, `review`, `completed`, `failed`, `cancelled`) |
| dependencies | TEXT | NOT NULL JSON array of TaskId |
| expected_output | TEXT | NOT NULL DEFAULT '' |
| acceptance_criteria | TEXT | NOT NULL JSON array of strings |
| file_ownership | TEXT | NOT NULL JSON array of paths |
| assigned_agent_id | TEXT | nullable FK → agents(id) |
| priority | INTEGER | NOT NULL DEFAULT 0 |
| max_attempts | INTEGER | NOT NULL DEFAULT 1 |
| attempt_count | INTEGER | NOT NULL DEFAULT 0 |
| execution_limits | TEXT | NOT NULL JSON |
| result_summary | TEXT | nullable |
| created_at / updated_at / started_at / completed_at | INTEGER | as workflows |

Indexes: `(workflow_id, status)`, `(assigned_agent_id)`, `(parent_task_id)`.

### 4.4 agents

| Column | Type | Constraints |
|---|---|---|
| id | TEXT | PK |
| workflow_id | TEXT | NOT NULL FK → workflows(id) ON DELETE CASCADE |
| role | TEXT | NOT NULL (profile name, including generated roles) |
| system_instructions | TEXT | NOT NULL |
| model_config | TEXT | NOT NULL JSON (`providerId`, `modelId`, parameters) |
| model_session_id | TEXT | nullable FK → model_sessions(id) |
| assigned_task_id | TEXT | nullable FK → tasks(id) |
| available_tools | TEXT | NOT NULL JSON array |
| filesystem_permissions | TEXT | NOT NULL JSON (roots, writableOwnership) |
| working_directory | TEXT | NOT NULL (worktree path) |
| execution_limits | TEXT | NOT NULL JSON (timeoutMs, tokenBudget, maxRetries, maxRecursionDepth) |
| tokens_used | INTEGER | NOT NULL DEFAULT 0 |
| status | TEXT | NOT NULL CHECK IN (`idle`, `initializing`, `running`, `waiting`, `completed`, `failed`, `terminated`) |
| heartbeat_at | INTEGER | nullable |
| failure_reason | TEXT | nullable |
| created_at / updated_at / completed_at | INTEGER | as workflows |

Indexes: `(workflow_id, status)`, `(assigned_task_id)`.

### 4.5 agent_tasks

Join table with attempt history (an agent may retry a task).

| Column | Type | Constraints |
|---|---|---|
| id | TEXT | PK |
| agent_id | TEXT | NOT NULL FK → agents(id) ON DELETE CASCADE |
| task_id | TEXT | NOT NULL FK → tasks(id) ON DELETE CASCADE |
| attempt | INTEGER | NOT NULL |
| status | TEXT | NOT NULL CHECK IN (`assigned`, `running`, `completed`, `failed`, `released`) |
| assigned_at / started_at / completed_at | INTEGER | assigned_at NOT NULL; others nullable |

Unique: `(agent_id, task_id, attempt)`. Index: `(task_id, status)`.

### 4.6 agent_messages

| Column | Type | Constraints |
|---|---|---|
| id | TEXT | PK (= messageId) |
| workflow_id | TEXT | NOT NULL FK → workflows(id) ON DELETE CASCADE |
| sender_id | TEXT | NOT NULL (agent id, `orchestrator`, or `user`) |
| receiver_id | TEXT | nullable (NULL = workflow broadcast) |
| type | TEXT | NOT NULL CHECK IN (`question`, `answer`, `handoff`, `blocker`, `status`, `artifact`, `clarification`) |
| task_id | TEXT | nullable FK → tasks(id) |
| content | TEXT | NOT NULL |
| correlation_id | TEXT | nullable |
| created_at | INTEGER | NOT NULL |

Indexes: `(workflow_id, created_at)`, `(receiver_id, created_at)`, `(task_id)`.

### 4.7 artifacts

| Column | Type | Constraints |
|---|---|---|
| id | TEXT | PK |
| workflow_id | TEXT | NOT NULL FK → workflows(id) ON DELETE CASCADE |
| task_id | TEXT | nullable FK → tasks(id) |
| agent_id | TEXT | nullable FK → agents(id) |
| kind | TEXT | NOT NULL CHECK IN (`plan`, `diff`, `patch`, `test_output`, `review_report`, `log`, `summary`) |
| name | TEXT | NOT NULL |
| file_path | TEXT | NOT NULL (relative to `.forge/workflows/<workflowId>/artifacts/`) |
| checksum | TEXT | nullable |
| size_bytes | INTEGER | NOT NULL DEFAULT 0 |
| supersedes | TEXT | nullable FK → artifacts(id) |
| created_at | INTEGER | NOT NULL |

Index: `(workflow_id, kind)`. No binary content column.

### 4.8 approvals

| Column | Type | Constraints |
|---|---|---|
| id | TEXT | PK |
| workflow_id | TEXT | NOT NULL FK → workflows(id) ON DELETE CASCADE |
| task_id | TEXT | nullable FK → tasks(id) |
| agent_id | TEXT | nullable FK → agents(id) |
| action_type | TEXT | NOT NULL CHECK IN (`plan`, `dependency_install`, `config_change`, `file_delete`, `external_access`, `db_migration`, `git_merge`, `remote_push`) |
| requested_action | TEXT | NOT NULL |
| reason | TEXT | NOT NULL |
| affected_files | TEXT | NOT NULL JSON array |
| proposed_command | TEXT | nullable |
| impact | TEXT | NOT NULL |
| action_payload_hash | TEXT | NOT NULL (hash of the exact reviewed action/patch) |
| proposed_patch_ref | TEXT | nullable FK → artifacts(id) |
| status | TEXT | NOT NULL CHECK IN (`pending`, `approved`, `rejected`, `modification_requested`, `expired`, `cancelled`) |
| requested_by | TEXT | NOT NULL |
| decided_by | TEXT | nullable |
| decision_note | TEXT | nullable |
| expires_at | INTEGER | nullable |
| created_at / updated_at / decided_at | INTEGER | as workflows |

Indexes: `(workflow_id, status)`, `(status, expires_at)`.

### 4.9 events

| Column | Type | Constraints |
|---|---|---|
| id | TEXT | PK (= eventId, UNIQUE enforces idempotent ingestion) |
| workflow_id | TEXT | nullable FK → workflows(id) ON DELETE CASCADE |
| agent_id | TEXT | nullable FK → agents(id) |
| task_id | TEXT | nullable FK → tasks(id) |
| event_type | TEXT | NOT NULL (dot-namespaced, e.g. `agent:started`) |
| payload | TEXT | NOT NULL JSON |
| correlation_id | TEXT | nullable |
| causation_id | TEXT | nullable |
| sequence | INTEGER | NOT NULL (per-workflow ordering) |
| delivery_count | INTEGER | NOT NULL DEFAULT 0 |
| occurred_at / persisted_at | INTEGER | NOT NULL |

Indexes: `(workflow_id, sequence)`, `(event_type, occurred_at)`, `(correlation_id)`.

### 4.10 model_sessions

| Column | Type | Constraints |
|---|---|---|
| id | TEXT | PK |
| workflow_id | TEXT | nullable FK → workflows(id) ON DELETE SET NULL |
| agent_id | TEXT | nullable FK → agents(id) ON DELETE SET NULL |
| provider_id | TEXT | NOT NULL |
| model_id | TEXT | NOT NULL |
| provider_session_id | TEXT | nullable (opaque handle, never a credential) |
| status | TEXT | NOT NULL CHECK IN (`active`, `closed`, `error`) |
| input_tokens / output_tokens / cache_read_tokens / cache_write_tokens | INTEGER | NOT NULL DEFAULT 0 |
| cost_estimate | REAL | nullable |
| created_at / closed_at | INTEGER | created_at NOT NULL; closed_at nullable |

Index: `(agent_id)`, `(provider_id, provider_session_id)`.

### 4.11 execution_records

| Column | Type | Constraints |
|---|---|---|
| id | TEXT | PK |
| workflow_id | TEXT | NOT NULL FK → workflows(id) ON DELETE CASCADE |
| task_id | TEXT | nullable FK → tasks(id) |
| agent_id | TEXT | nullable FK → agents(id) |
| kind | TEXT | NOT NULL CHECK IN (`command`, `test`, `tool`, `git`) |
| command | TEXT | NOT NULL (normalized, secrets redacted) |
| working_directory | TEXT | NOT NULL |
| status | TEXT | NOT NULL CHECK IN (`running`, `completed`, `failed`, `cancelled`, `timed_out`) |
| exit_code | INTEGER | nullable |
| output_ref | TEXT | nullable FK → artifacts(id) |
| timeout_ms | INTEGER | NOT NULL |
| started_at / finished_at | INTEGER | started_at NOT NULL; finished_at nullable |

Index: `(workflow_id, started_at)`, `(task_id)`.

### 4.12 workflow_checkpoints

| Column | Type | Constraints |
|---|---|---|
| id | TEXT | PK |
| workflow_id | TEXT | NOT NULL FK → workflows(id) ON DELETE CASCADE |
| reason | TEXT | NOT NULL |
| state_snapshot | TEXT | NOT NULL JSON (full workflow + task state) |
| base_commit | TEXT | nullable |
| restored_at | INTEGER | nullable |
| restore_count | INTEGER | NOT NULL DEFAULT 0 |
| created_at | INTEGER | NOT NULL |

Index: `(workflow_id, created_at)`.

## 5. Repository interfaces

`ProjectRepository`, `WorkflowRepository`, `TaskRepository`, `AgentRepository`,
`AgentTaskRepository`, `MessageRepository`, `ArtifactRepository`, `ApprovalRepository`,
`EventRepository`, `ModelSessionRepository`, `ExecutionRecordRepository`,
`CheckpointRepository`. Each exposes typed CRUD plus domain-specific queries used by the
control plane; none exposes SQL to callers. A PostgreSQL implementation supplies the
same interfaces.

## 6. Data integrity rules

- A workflow cannot leave `awaiting_approval` without an approved `plan` approval.
- A task cannot be `running` without an assigned agent in `running`/`waiting`.
- An agent cannot be `completed` until its task has required artifacts and passing
  verification events.
- An approval with a changed `action_payload_hash` cannot be reused.
- Checkpoints are immutable; restoration increments `restore_count` and emits an event.
- Completed tasks are never re-executed without an explicit reason recorded in events.
