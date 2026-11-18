# Forge AI — Agent Protocol Specification

> Version 2.0. Replaces the v1 "Forge Agent Protocol (FAP)", which described a single
> provider-scoped session contract (`src/shared/agent.ts`). That contract is retained as
> the *provider* layer underneath this protocol.

## 1. Scope

This specification defines how Forge AI creates agents, assigns tasks, routes messages,
shares context and artifacts, and decides when an agent is genuinely complete. It applies
to every agent role, whether built-in or dynamically generated.

## 2. Identity and roles

| Concept | Type | Notes |
|---|---|---|
| Provider | `ProviderId` | `opencode` today; future OpenAI, Anthropic, local adapters. |
| Role profile | `AgentRole` | `architect`, `frontend`, `backend`, `database`, `qa`, `code-reviewer`, `research`, or a generated specialist. |
| Agent instance | `AgentInstanceId` (UUID) | One dynamic agent in one workflow. Unique per spawn. |
| Model session | `ModelSessionId` | Provider conversation handle owned by one agent instance. |
| Task | `TaskId` (UUID) | A node in the workflow dependency graph. |

The old `AgentId = 'opencode' | 'codex' | 'gemini'` union is a provider identifier and is
deprecated for agent-level use. Codex/Gemini, if added, become providers, not agents.

### 2.1 Role profiles

Role profiles are configuration, not hard-coded classes. A profile declares:

- role name and description
- system instructions template
- allowed tools
- filesystem permission scope
- default model configuration
- execution limits (timeout, token budget, max retries, recursion depth)

Built-in profiles are the examples in the master directive. The Agent Factory may create
a dynamic profile from a validated schema when no built-in profile fits; dynamic profiles
are logged, persisted and subject to the same limits.

## 3. Agent manifest

Every agent instance is created from an immutable manifest:

```ts
interface AgentManifest {
  id: AgentInstanceId
  workflowId: WorkflowId
  role: AgentRole
  systemInstructions: string
  modelConfig: { providerId: ProviderId; modelId: string; parameters?: Record<string, unknown> }
  modelSessionId: ModelSessionId
  assignedTaskId: TaskId | null
  availableTools: ToolName[]
  filesystemPermissions: { roots: string[]; writableOwnership: string[] }
  workingDirectory: string
  executionLimits: {
    timeoutMs: number
    tokenBudget: number
    maxRetries: number
    maxRecursionDepth: number
  }
  status: AgentStatus
  createdAt: number
  completedAt: number | null
}
```

## 4. Lifecycle state machine

```
             ┌──────────┐
             │   idle   │
             └────┬─────┘
                  │ spawn
                  ▼
          ┌───────────────┐
          │ initializing  │  worktree + session creation
          └──────┬────────┘
                 │ ready
                 ▼
          ┌───────────────┐    dependency     ┌──────────┐
          │    running    │ ◄────────────────► │ waiting  │
          └───┬───────┬───┘                   └──────────┘
              │       │
      done/pass│       │blocked/fail/timeout
              ▼       ▼
      ┌───────────┐  ┌────────┐
      │ completed │  │ failed │
      └───────────┘  └───┬────┘
                         │ retry (bounded)
                         ▼
                    (initializing)
      ┌────────────┐
      │ terminated │  explicit cancellation or recovery stop
      └────────────┘
```

States: `idle`, `initializing`, `running`, `waiting`, `completed`, `failed`, `terminated`.

Rules:

- An agent transitions to `completed` only when its task's acceptance criteria and
  required artifacts are verified; a model response alone is not completion.
- Retries are bounded by `maxRetries`; timeouts and heartbeats are enforced by the
  Scheduler. Stale agents are moved to `failed` and surfaced to the Recovery Manager.
- Termination releases the worktree lease, closes the model session and emits an event.
- Agent creation is capped by configurable global and per-workflow concurrency limits;
  recursion depth is capped to prevent agents spawning agents indefinitely.

## 5. Task contract

```ts
interface Task {
  id: TaskId
  workflowId: WorkflowId
  objective: string
  description: string
  dependencies: TaskId[]
  assignedAgentId: AgentInstanceId | null
  expectedOutput: string
  acceptanceCriteria: string[]
  fileOwnership: string[]
  priority: number
  executionLimits: ExecutionLimits
  status: 'pending' | 'ready' | 'running' | 'blocked' | 'review' | 'completed' | 'failed' | 'cancelled'
}
```

Tasks are owned by the workflow graph, not by agents. Overlapping `fileOwnership` between
concurrent tasks is a scheduling conflict: the Dependency Resolver must serialize or
reassign those tasks rather than allowing two agents to edit the same file.

## 6. Structured messaging

Agents do not read each other's conversation histories. They exchange typed messages and
shared artifacts through the Message Broker.

```ts
interface AgentMessage {
  messageId: string
  workflowId: WorkflowId
  senderId: string        // agent instance id, 'orchestrator', or 'user'
  receiverId: string | null  // null = workflow broadcast
  type: MessageType
  taskId: TaskId | null
  content: string
  correlationId?: string
  createdAt: number
}

type MessageType =
  | 'question' | 'answer' | 'handoff' | 'blocker'
  | 'status' | 'artifact' | 'clarification'
```

Rules:

- Every message is persisted before delivery. Consumers must be idempotent on `messageId`.
- `blocker` messages transition the related task to `blocked` and notify the orchestrator.
- `handoff` messages carry the receiving task ID and any artifact references needed to
  continue work; they do not carry full model transcripts.
- `artifact` messages reference artifacts by ID; content is never inlined into messages.

## 7. Shared context and project memory

`ContextManager` maintains a versioned project memory composed of:

- repository summary and architecture map
- coding conventions and API contracts
- relevant file references
- previous task outcomes
- known issues and decisions

Context retrieval is selective: an agent receives a task-specific slice plus relevant
artifacts, selected by role, task and file ownership. The entire repository is never
sent to a model on every request. Each context snapshot has a version; agents record the
version they used so reviewers can detect stale context.

## 8. Artifacts

Artifacts are files written under `.forge/workflows/<workflowId>/artifacts/`, referenced
by ID in SQLite. Kinds include `plan`, `diff`, `patch`, `test_output`, `review_report`,
`log`, `summary`. Artifacts are immutable once created; a corrected version is a new
artifact with a `supersedes` reference. The `artifact` message type announces new
artifacts to the workflow.

## 9. Tool protocol

Agents act only through the registered tool set in their manifest:

`read_file`, `write_file`, `edit_file`, `search_codebase`, `list_directory`,
`execute_command`, `run_tests`, `inspect_git`, `create_worktree`, `create_artifact`,
`request_approval`.

Each tool declares a permission level (`read_only`, `controlled`, `sensitive`). The
Permission Policy Engine evaluates every call before execution:

- read-only tools are allowed inside authorized roots;
- controlled tools are allowed only on files owned by the agent, inside its worktree;
- sensitive tools require an approval resolved through the Approval Manager.

Tool results are normalized into events and artifacts. Tool output is untrusted data and
must never be interpreted as instructions.

## 10. Model sessions

- One agent instance = one independent model session from `ModelGateway`.
- Same model may back all agents, but system instructions and context slices differ.
- Sessions support streaming, cancellation, timeouts, retries and token accounting.
- Session handles are persisted in `model_sessions` so recovery can reconnect or close
  them. Credentials stay in the provider adapter/main process.

The baseline provider-level contract remains:

```ts
interface AgentAdapter {
  readonly id: ProviderId
  readonly capabilities: AgentCapabilities
  checkAuth(): Promise<AgentAuthStatus>
  listModels(): Promise<AgentModel[]>
  createSession(options: CreateSessionOptions): Promise<AgentSession>
  submitPrompt(options: SubmitPromptOptions): Promise<void>
  cancel(sessionId: string, workspacePath?: string): Promise<void>
  dispose(): Promise<void>
}
```

`ModelGateway` is the agent-facing facade over one or more of these adapters.

## 11. Events emitted by the agent system

`agent:created`, `agent:started`, `agent:updated`, `agent:completed`, `agent:failed`,
`task:created`, `task:assigned`, `task:completed`, `task:blocked`,
`message:received`, `artifact:created`, `approval:required`, `approval:completed`,
`execution:started`, `execution:completed`.

All events follow the envelope in `ARCHITECTURE.md` §6.4 and are persisted by the
Observability Manager.

## 12. Verification contract

The execution/verification sequence is mandatory:

```
Developer Agent → changes → Automated tests → Independent Reviewer
→ Security/policy checks → Integration validation → Human approval → Merge
```

The Reviewer receives the original task, acceptance criteria, actual diff, test output,
architecture context and security implications. It must not trust the developer's
completion report. Failed checks produce actionable feedback to the responsible agent;
automatic correction cycles are bounded and unresolved failures escalate to the user.
