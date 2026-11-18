# Forge AI — Unified Agent Protocol Specification (FAP)

## 1. Specification Overview

The **Forge Agent Protocol (FAP)** defines a standardized, provider-agnostic communication and orchestration standard for autonomous coding agents within Forge AI. 

Rather than enforcing a lowest-common-denominator model that strips unique provider abilities, FAP establishes:
1. A **Uniform Control Plane**: Consistent lifecycle, session creation, streaming, cancellation, and error handling.
2. **Provider-Specific Capability Flags**: Precise exposure of capabilities (streaming, tool calls, bash execution, file changes, reasoning tokens, context limits).
3. **Guaranteed Zero-Cost Prioritization**: Clear mechanical distinction between free community models and paid commercial endpoints.
4. **Verifiable Activity Telemetry**: Authentic event mapping for tool usage without simulation or fabrication.

---

## 2. Protocol State Machine

Every agent session follows a deterministic state machine:

```
                  +-----------------------+
                  |   UNAUTHENTICATED     |
                  +-----------------------+
                              |
                     checkAuth() passes
                              |
                              v
+-------------------------------------------------------------------+
|                        IDLE / DISCOVERED                          |
|  - listModels() executed                                          |
|  - Capabilities registered                                        |
+-------------------------------------------------------------------+
                              |
                    createSession(workspace)
                              |
                              v
+-------------------------------------------------------------------+
|                        SESSION READY                              |
|  - Scoped to local workspace path                                 |
|  - SSE / Stdio event stream attached                              |
+-------------------------------------------------------------------+
        |                                             ^
  submitPrompt()                                  done / idle
        |                                             |
        v                                             |
+-------------------------------------------------------------------+
|                         GENERATING                                |
|  - Streams: text_delta                                            |
|  - Tool activities: tool_activity (read/search/exec/edit)         |
|  - File changes: file_change                                      |
+-------------------------------------------------------------------+
        |                             |
  Requires Approval               cancel()
        |                             |
        v                             v
+---------------------+     +--------------------+
|  AWAITING APPROVAL  |     |      ABORTED       |
+---------------------+     +--------------------+
        |
  User Approves/Denies
        |
        v
  Resume Generating
```

---

## 3. Data Contracts & Type Definitions

The protocol data contracts are located in `src/shared/agent.ts`:

### 3.1. Agent Adapter Interface
```ts
export type AgentId = 'opencode' | 'codex' | 'gemini'

export interface AgentCapabilities {
  streaming: boolean
  toolEvents: boolean
  cancellation: boolean
  fileChanges: boolean
  sessionResumption: boolean
  modelSelection: boolean
}

export interface AgentAdapter {
  readonly id: AgentId
  readonly capabilities: AgentCapabilities

  checkAuth(): Promise<AgentAuthStatus>
  listModels(): Promise<AgentModel[]>
  createSession(options: CreateSessionOptions): Promise<AgentSession>
  submitPrompt(options: SubmitPromptOptions): Promise<void>
  cancel(sessionId: string, workspacePath?: string): Promise<void>
  dispose(): Promise<void>
}
```

### 3.2. Model Descriptor with Zero-Cost Attributes
```ts
export interface AgentModelCost {
  input: number          // USD per million tokens (0 = free)
  output: number         // USD per million tokens (0 = free)
  cacheRead?: number
  cacheWrite?: number
}

export interface AgentModel {
  id: string             // e.g. "opencode/big-pickle", "codex/gpt-5.5", "gemini/gemini-2.5-pro"
  name: string
  providerId: string
  isFree: boolean        // Computed: (cost.input === 0 && cost.output === 0)
  cost: AgentModelCost
  description?: string
  contextLimit?: number
}
```

### 3.3. Telemetry & Tool Activity Events
```ts
export type ToolType =
  | 'read_file'
  | 'search_codebase'
  | 'run_command'
  | 'edit_file'
  | 'create_file'
  | 'run_tests'
  | 'generic'

export interface AgentToolActivity {
  id: string
  toolType: ToolType
  title: string
  detail?: string
  status: 'running' | 'completed' | 'failed'
  startedAt: number
  finishedAt?: number
  error?: string
}

export type AgentEvent =
  | {
      type: 'status'
      sessionId: string
      status: 'connecting' | 'idle' | 'generating' | 'aborted' | 'error'
      message?: string
    }
  | {
      type: 'text_delta'
      sessionId: string
      messageId: string
      delta: string
    }
  | {
      type: 'tool_activity'
      sessionId: string
      activity: AgentToolActivity
    }
  | {
      type: 'file_change'
      sessionId: string
      path: string
      changeType: 'created' | 'modified' | 'deleted'
    }
  | {
      type: 'done'
      sessionId: string
      fullText?: string
    }
  | {
      type: 'error'
      sessionId: string
      error: string
    }
```

---

## 4. Provider-Specific Implementations

### 4.1. OpenCode Integration (Active — Milestone 3)
- **Library**: `@opencode-ai/sdk` v1.19.6
- **Transport**: Local HTTP + Server-Sent Events (SSE) on `127.0.0.1:4096-4099`.
- **Authentication**: Native built-in free provider `opencode` is connected out of the box with zero credentials required (`~/.local/share/opencode/auth.json` managed locally).
- **Model Discovery**: Maps models from `client.provider.list()`. Automatically flags and sorts zero-cost models (`cost.input === 0 && cost.output === 0`) to the top.
- **Event Translation**:
  - `message.part.delta` &rarr; `text_delta`
  - `message.part.updated` (`part.type === 'tool'`) &rarr; `tool_activity`
  - `command.executed` &rarr; `tool_activity (toolType: 'run_command')`
  - `file.edited` &rarr; `file_change` + `tool_activity (toolType: 'edit_file')`
  - `session.status` (`busy` / `idle`) &rarr; `status` / `done`
- **Cancellation**: Dispatches `client.session.abort({ path: { id: sessionId }, query: { directory } })`.

### 4.2. OpenAI Codex Integration (Planned — Milestone 4)
- **Protocol**: Official Codex App Server Protocol (local loopback server).
- **Authentication**: Reuses existing ChatGPT Plus / Pro / Team browser authentication sessions. Zero OpenAI API keys or platform credit balances required.
- **Transport**: Local loopback JSON-RPC over WebSockets or SSE.
- **Permissions Gate**: Destructive shell commands require user approval via `forge:agent:permission-request`.

### 4.3. Gemini Integration (Planned — Milestone 5)
- **Protocol**: Google Antigravity CLI stdio daemon (`agy --mode=agent-server`).
- **Authentication**: Reuses the user's existing authenticated Google account session (Google AI Pro entitlement). Never prompts for Google Cloud API keys or GCP billing setup.
- **Transport**: Stdio pipes with JSON-lines messaging.
- **Cancellation**: Native process SIGINT/interrupt signaling supported by Antigravity CLI.

---

## 5. Security & Isolation Rules in FAP

1. **No External Port Binding**: Agent engines must bind strictly to `127.0.0.1`. Binding to `0.0.0.0` or public network interfaces is rejected by security validation.
2. **Workspace Sandboxing**: All file paths supplied to agents are verified against the active workspace boundary.
3. **Approval Interception**: Destructive actions (e.g. `rm -rf`, modifying git history, overwriting uncommitted files) emit an approval event and pause execution until the user explicitly accepts in the UI.
4. **Credential Isolation**: Tokens and cookies are stored only within the OS credential store or local CLI authentication files, never passed to the renderer process.
