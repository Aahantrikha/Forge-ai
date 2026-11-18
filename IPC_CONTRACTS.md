# Forge AI — IPC Contracts

> Version 1.0. The renderer↔main boundary is the only capability surface exposed to UI
> code. This document is the authoritative channel registry.

## 1. Principles

1. The preload script exposes explicit methods on `window.forgeAI` only. Raw
   `ipcRenderer.send/invoke/on` is never exposed.
2. Every channel is declared in `IpcChannels` (`src/shared/ipc.ts`) with a typed method on
   `ForgeApi`, an explicit `ipcMain.handle` in main, and a Zod schema validating arguments.
3. No credentials, tokens or secret material cross this boundary in either direction.
4. Subscriptions return an unsubscribe function; listeners are removed on unmount.
5. Errors are structured: `{ code, message, details? }`. Renderers never receive raw
   stack traces containing filesystem paths or provider secrets.
6. Commands that mutate state carry an `idempotencyKey` where replay could duplicate work.
7. New capabilities are additive; existing channels are not repurposed without a
   documented migration.

Naming: `forge:<domain>:<action>` for invoke channels, `forge:<domain>:<event>` for
main→renderer events.

## 2. Current channels (baseline — all implemented)

| Channel | Direction | Arguments | Returns |
|---|---|---|---|
| `forge:app:get-info` | invoke | — | `AppInfo` |
| `forge:workspace:open-folder` | invoke | — | `WorkspaceOpenResult \| null` |
| `forge:workspace:open-file` | invoke | — | `OpenedFile \| null` |
| `forge:workspace:read-file` | invoke | `filePath: string` | `OpenedFile \| null` |
| `forge:workspace:save-file` | invoke | `filePath: string, content: string` | `OpenedFile \| null` |
| `forge:workspace:select-directory` | invoke | — | `WorkspaceInfo \| null` |
| `forge:workspace:get-current` | invoke | — | `WorkspaceInfo \| null` |
| `forge:workspace:set-current` | invoke | `dirPath: string` | `WorkspaceInfo \| null` |
| `forge:workspace:get-tree` | invoke | `rootPath?: string` | `FileTreeNode \| null` |
| `forge:workspace:file-changed` | event | `FileChangeEvent` | — |
| `forge:menu:open-folder` / `open-file` / `save-file` | event | — | — |
| `forge:agent:check-auth` | invoke | `providerId` | `AgentAuthStatus` |
| `forge:agent:list-models` | invoke | `providerId` | `AgentModel[]` |
| `forge:agent:create-session` | invoke | `providerId, CreateSessionOptions` | `AgentSession` |
| `forge:agent:submit-prompt` | invoke | `providerId, SubmitPromptOptions` | `void` |
| `forge:agent:cancel` | invoke | `providerId, sessionId, workspacePath?` | `void` |
| `forge:agent:event` | event | `AgentEvent` | — |

Baseline remediation: `workspace:read-file` and `workspace:save-file` must be routed
through `PathGuard` in M3; `agent:event` gains `agentId`/`workflowId`/`taskId` in M2–M5.

## 3. Planned channels by milestone

### M1 — foundation

| Channel | Purpose |
|---|---|
| `forge:event:subscribe` / `forge:event:unsubscribe` | Subscribe to typed workflow events with optional filters |
| `forge:settings:get` / `forge:settings:set` | Typed, validated local settings (never secrets) |

### M2 — model gateway

| Channel | Purpose |
|---|---|
| `forge:model:list` | List providers/models through `ModelGateway` |
| `forge:model:usage` | Token usage for a workflow |

### M3 — agents

| Channel | Purpose |
|---|---|
| `forge:agent:spawn` | Create a dynamic agent from a validated manifest request |
| `forge:agent:list` | List agents in a workflow |
| `forge:agent:inspect` | Full agent state, logs, token usage, modified files |
| `forge:agent:terminate` | Explicitly terminate an agent |
| `forge:agent:event` (extended) | Enriched event envelope with correlation IDs |

### M4 — execution

| Channel | Purpose |
|---|---|
| `forge:execution:start` / `:stop` | Start/stop a command or test run in a worktree |
| `forge:execution:output` | Streamed, coalesced output events |
| `forge:git:worktrees` | List worktrees/branches for a workflow |
| `forge:git:diff` | Diff for a task or workflow |
| `forge:git:conflicts` | Detected overlapping edits/conflicts |

### M5 — orchestration

| Channel | Purpose |
|---|---|
| `forge:workflow:start` | Start a workflow from an objective; creates plan, no agents yet |
| `forge:workflow:get` | Full workflow state including task graph |
| `forge:workflow:list` | Workflow history |
| `forge:workflow:pause` / `:resume` / `:cancel` | Lifecycle control |
| `forge:workflow:plan` | Structured plan artifact for review |
| `forge:workflow:event` | State transition events |

### M6 — coordination

| Channel | Purpose |
|---|---|
| `forge:message:list` / `:send` | Workflow messages (send used by user/handoff flows) |
| `forge:artifact:list` / `:get` | Artifact references and metadata |
| `forge:context:get` | Versioned project memory slice |

### M7 — approvals

| Channel | Purpose |
|---|---|
| `forge:approval:list` | Pending/decided approvals with audit history |
| `forge:approval:decide` | `approve` / `reject` / `request_modifications` with expected action hash |
| `forge:approval:event` | Approval required/completed events |
| `forge:git:merge` | Controlled merge after approval; denied otherwise |

### M8 — workspace UI

No new privileged channels; the Agent Workspace consumes the channels above.

## 4. Event envelope

```ts
interface ForgeEvent {
  eventId: string
  workflowId: string | null
  agentId: string | null
  taskId: string | null
  type: string              // e.g. 'task:blocked', 'approval:required'
  payload: Record<string, unknown>
  correlationId?: string
  causationId?: string
  occurredAt: number
}
```

Required event types are listed in the master directive §15 and `AGENT_PROTOCOL.md` §11.
Producers persist the event before broadcasting. Consumers are idempotent on `eventId`.

## 5. Error model

```ts
interface ForgeError {
  code:
    | 'INVALID_ARGUMENT' | 'NOT_FOUND' | 'PERMISSION_DENIED'
    | 'APPROVAL_REQUIRED' | 'CONFLICT' | 'TIMEOUT'
    | 'PROVIDER_ERROR' | 'INTERNAL'
  message: string
  details?: Record<string, unknown>
}
```

`APPROVAL_REQUIRED` includes the approval ID so the UI can navigate to the request.
`CONFLICT` includes task/agent/file details for integration conflicts.

## 6. Security rules for handlers

1. Validate every argument with its Zod schema before use.
2. Re-check permissions in main regardless of UI state.
3. Never trust `workspacePath`, `filePath`, `command` or model-provided content from the
   renderer; resolve and contain them (`PathGuard`, `CommandPolicy`).
4. Rate-limit or bound expensive operations (tree size, output size, history length).
5. Log structured audit events for approvals, merges, denials and destructive commands.
6. Keep `SECURITY_STATUS` factual: it reports real runtime flags and the real channel
   whitelist, never aspirational values.
