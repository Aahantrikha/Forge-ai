# Forge AI — Multi-Agent Transformation Implementation Plan

## 1. Executive Implementation Strategy

This implementation plan outlines the systematic, phased engineering strategy to transform **Forge AI** into a production-grade multi-agent software engineering environment. 

### Strategic Rules
1. **Incremental Milestones Only**: We implement exactly one concrete milestone at a time, followed by complete type-checking, linting, production builds, and end-to-end verification.
2. **Preserve Working Functionality**: Existing workspace management, tree indexing, OpenCode streaming, in-app file editing, and security boundaries must never be broken or degraded.
3. **Never Fake Capabilities**: If a provider or feature is not connected, the UI reports its true status honestly without simulated mock data (§5, §12).
4. **Zero Extra Cost**: All agent integrations must strictly reuse existing user accounts, CLI daemons, or free community models without forcing API billing.

---

## 2. Phased Implementation Roadmap

```
+------------------------------------------------------------------------------------------+
| PHASE 1: Current Baseline Consolidation (Milestones 1–3 Complete)                         |
|   - Hardened Electron IPC & Win32 frame                                                  |
|   - Workspace directory tree, fs.watch & in-app file editor/saver                        |
|   - Unified AgentAdapter & OpenCode SDK integration with real streaming                  |
+------------------------------------------------------------------------------------------+
                                             |
                                             v
+------------------------------------------------------------------------------------------+
| PHASE 2: Milestone 4 — OpenAI Codex Integration                                          |
|   - Investigate & implement official Codex App Server Protocol (127.0.0.1)               |
|   - Reuse ChatGPT Plus / Pro / Team session credentials                                  |
|   - Implement electron/agents/codex.ts implementing AgentAdapter                         |
|   - Model discovery, streaming deltas, cancellation                                      |
+------------------------------------------------------------------------------------------+
                                             |
                                             v
+------------------------------------------------------------------------------------------+
| PHASE 3: Milestone 5 — Gemini via Google Antigravity CLI                                 |
|   - Integrate Google Antigravity CLI (`agy`) stdio daemon                                |
|   - Reuse user's authenticated Google Account (Google AI Pro entitlement)                |
|   - Implement electron/agents/gemini.ts implementing AgentAdapter                        |
|   - Stdio JSON-lines transport, event mapping, interrupt handling                        |
+------------------------------------------------------------------------------------------+
                                             |
                                             v
+------------------------------------------------------------------------------------------+
| PHASE 4: Milestone 6 — Integrated Terminal & Permission Gates                            |
|   - Install xterm.js (renderer) & node-pty (main process Win32 PTY)                      |
|   - PTY session lifecycle management, resize event handling, 16ms throttled streaming     |
|   - Permission modal: block destructive shell commands pending user approval            |
+------------------------------------------------------------------------------------------+
                                             |
                                             v
+------------------------------------------------------------------------------------------+
| PHASE 5: Milestone 7 — Visual Diff Reviewer & Git Checkpoints                            |
|   - Visual before-and-after split diff viewer for agent file edits                       |
|   - Chunk-level accept / reject controls                                                 |
|   - Git-based automated rollback checkpoints (pre-agent change snapshots)                |
+------------------------------------------------------------------------------------------+
                                             |
                                             v
+------------------------------------------------------------------------------------------+
| PHASE 6: Milestone 8 — Persistent Storage & Session Resumption (SQLite)                  |
|   - Integrate better-sqlite3 with WAL mode in main process                              |
|   - Durable storage for projects, conversations, messages, agent events, settings        |
|   - Resume active agent sessions using stored provider session identifiers               |
+------------------------------------------------------------------------------------------+
                                             |
                                             v
+------------------------------------------------------------------------------------------+
| PHASE 7: Milestone 9 — Multi-Agent Collaboration Loop                                    |
|   - Orchestrate Planner Agent -> Implementer Agent -> Reviewer Agent                     |
|   - Automated consensus verification and multi-perspective code inspection               |
+------------------------------------------------------------------------------------------+
                                             |
                                             v
+------------------------------------------------------------------------------------------+
| PHASE 8: Milestone 10 — Production Windows Packaging & Public Release                    |
|   - NSIS installer generation via electron-builder                                       |
|   - Code signing, checksum generation, and release documentation                         |
+------------------------------------------------------------------------------------------+
```

---

## 3. Detailed Phase Breakdown: Next Milestone (Milestone 4 — Codex)

### 3.1. Deliverables
1. **Codex App Server Investigation & Client**:
   - Establish local loopback communication with Codex App Server protocol on `127.0.0.1`.
   - Support browser session authentication (ChatGPT subscription reuse without API keys).
2. **Codex Adapter (`electron/agents/codex.ts`)**:
   - Implements `AgentAdapter`:
     - `checkAuth()`: detects authenticated ChatGPT session.
     - `listModels()`: lists eligible models (e.g. `gpt-5.5`, `o3-mini`, `o1`).
     - `createSession()`: binds to project workspace.
     - `submitPrompt()`: sends prompt and streams tokens.
     - `cancel()`: aborts running turn.
3. **Service Registration (`electron/agent-service.ts`)**:
   - Register `CodexAdapter` into the `AgentService` adapter map.
4. **UI Integration (`src/views/ChatView.tsx`, `src/app/agents.ts`)**:
   - Update Codex status to `available`.
   - Model dropdown switches between OpenCode and Codex models seamlessly.

### 3.2. Affected Files Matrix for Milestone 4

| File Path | Action | Description |
|---|---|---|
| `electron/agents/codex.ts` | **Create** | Implements `AgentAdapter` for OpenAI Codex App Server protocol. |
| `electron/agent-service.ts` | **Modify** | Registers `CodexAdapter` in main process service map. |
| `src/app/agents.ts` | **Modify** | Updates Codex status from `planned` to `available`. |
| `src/views/ChatView.tsx` | **Modify** | Supports Codex model selection, turn submission, and activity cards. |
| `tests/codex.test.ts` | **Create** | Unit test verifying Codex adapter lifecycle and protocol handshake. |

---

## 4. Risk Analysis & Mitigation Strategies

| Risk | Severity | Architectural Mitigation |
|---|---|---|
| **Stale / Port Conflict on Agent Servers** | Medium | Multi-port candidate probing (`4096-4099`) with automatic health checking and fallback launch implemented in `ensureServer()`. |
| **Authentication Expiry Mid-Session** | Low | Protocol emits structured `auth_expired` event; UI prompts user to re-authenticate without corrupting workspace files. |
| **High Output Terminal Freezes UI** | High | Main process buffers terminal stdout with a 16ms frame coalescer before sending IPC messages to `xterm.js`. |
| **Accidental Overwrites / Destructive Commands** | High | Permission gate intercepts destructive shell commands; Git checkpoints create instant rollback snapshots. |
| **Renderer Code Injection** | Critical | Strict build-time CSP with no `'unsafe-eval'`, sandbox enabled, context isolation enforced. |

---

## 5. Verification Checkpoints

Every implementation step must pass the standard verification pipeline:
1. `npx tsc --noEmit` &mdash; Strict TypeScript compiler verification with 0 errors.
2. `npm run lint` &mdash; ESLint verification with 0 errors and 0 warnings.
3. `npx vite build` &mdash; Production bundling of renderer, main, and preload scripts.
4. Automated adapter lifecycle test execution.
