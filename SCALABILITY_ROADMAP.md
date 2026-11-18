# Forge AI — Scalability & Architectural Evolution Roadmap

## 1. Current State vs Target Production Platform

Forge AI is transitioning from an initial single-agent environment into a production-grade, local-first multi-agent autonomous software engineering platform.

```
CURRENT STATE (Milestones 1–3 Complete)            TARGET STATE (Production Multi-Agent Platform)
---------------------------------------            ---------------------------------------------
- Electron Shell + Hardened IPC                    - Multi-Agent Orchestration (Planner/Coder/Reviewer)
- Workspace Indexer + fs.watch + Editor            - 3 Native Integrations (OpenCode + Codex + Gemini)
- OpenCode Integration (@opencode-ai/sdk)          - Integrated Terminal (xterm.js + node-pty)
- Real-time Streaming & Real Tool Cards            - Before-and-After Diff Viewer & Git Rollback
- Zero-cost Model Selection Prioritized            - SQLite Persistent Database (Sessions/Messages)
- In-memory conversation state                     - Permission Gates for Destructive Commands
                                                   - Windows NSIS Production Packaging & Auto-Update
```

---

## 2. Milestone Roadmap Matrix

| Milestone | Stage & Focus | Core Deliverables | Architectural Impact | Status |
|---|---|---|---|---|
| **M1** | Desktop UI & Security Foundation | Electron window, strict CSP, context isolation, frameless rail, theme system | Hardened security seam & whitelisted IPC baseline | **Completed** |
| **M2** | Workspace & File Management | Directory tree indexer, `fs.watch` debounce, path traversal guard, recent projects | Filesystem abstraction layer | **Completed** |
| **M3** | Agent Abstraction & OpenCode | Unified `AgentAdapter`, `@opencode-ai/sdk`, real SSE streams, free model prioritization, in-app code editor & saving | Core agent protocol & event streaming | **Completed** |
| **M4** | OpenAI Codex Integration | Codex App Server protocol, ChatGPT account session authentication, loopback JSON-RPC | Multi-provider expansion without API billing | **Next Milestone** |
| **M5** | Gemini Integration | Google Antigravity CLI integration, Google AI Pro account reuse, stdio daemon | Third core provider integration | **Planned** |
| **M6** | Terminal & Permissions Gate | `xterm.js` + `node-pty`, command streaming, PTY lifecycle, destructive action modal | Interactive execution layer | **Planned** |
| **M7** | Diff Viewer & Git Checkpoints | Before-and-after visual diff, chunk accept/reject, Git rollback checkpoints | Version control & verification | **Planned** |
| **M8** | Persistent Sessions (SQLite) | Embedded SQLite (`better-sqlite3`), schema migrations, conversation resumption | Durable local-first persistence | **Planned** |
| **M9** | Multi-Agent Collaboration | Planner & Implementer & Reviewer orchestration loop, consensus verification | Autonomous multi-agent coordination | **Planned** |
| **M10** | Windows Packaging & Public Release | NSIS installer, code signing, automatic updates, documentation | Production distribution | **Planned** |

---

## 3. Scaling Dimensions & Technical Blueprints

### 3.1. Persistence Scaling: SQLite Database Schema (Milestone 8)
Currently, conversation messages reside in React view state. Milestone 8 introduces an embedded SQLite database (`userData/forge.db`) using WAL (Write-Ahead Logging) mode:

```sql
-- Projects
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  path TEXT NOT NULL UNIQUE,
  last_opened_at INTEGER NOT NULL
);

-- Agent Sessions
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL,
  model_id TEXT NOT NULL,
  title TEXT,
  provider_session_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Messages
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- Agent Tool Events & Telemetry
CREATE TABLE IF NOT EXISTS tool_events (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  tool_type TEXT NOT NULL,
  title TEXT NOT NULL,
  detail TEXT,
  status TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  finished_at INTEGER
);
```

### 3.2. Terminal & PTY Architecture (Milestone 6)
To support running build tools, linters, test suites, and interactive shells without UI freezing:
- **Main Process**: Uses `node-pty` to spawn native Win32 PTYs (`powershell.exe`, `cmd.exe`, `bash.exe`).
- **Throttled Streaming**: IPC data chunks are buffered with 16ms frame coalescing to prevent flooding the Chromium renderer during high-output commands (`npm install`, verbose logs).
- **Renderer Process**: Renders using `xterm.js` with WebGL or Canvas addon for hardware-accelerated 60fps rendering.

### 3.3. Multi-Agent Orchestration Architecture (Milestone 9)
Once single-agent integrations (OpenCode, Codex, Gemini) are proven robust, Forge AI implements the multi-agent collaboration loop:

```
                                  +-------------------+
                                  |   USER PROMPT     |
                                  +-------------------+
                                            |
                                            v
                                  +-------------------+
                                  |   PLANNER AGENT   |
                                  | (Deconstruct task)|
                                  +-------------------+
                                            |
                                            v
                                  +-------------------+
                                  | IMPLEMENTER AGENT |
                                  | (Edits workspace) |
                                  +-------------------+
                                            |
                                            v
                                  +-------------------+
                                  |   REVIEWER AGENT  |
                                  | (Tests & inspects)|
                                  +-------------------+
                                     /             \
                               [Issues]          [Pass]
                                 /                 \
                                v                   v
                    +--------------------+    +--------------------+
                    | Feedback to Coder  |    | User Diff Review   |
                    +--------------------+    +--------------------+
```

- **Independent Review**: Agent B inspects code changes written by Agent A using Git diffs before committing.
- **Rollback Safety**: Every collaborative cycle creates an automated lightweight Git stash or temporary commit checkpoint for 1-click reversal.

---

## 4. Performance & Memory Invariants

1. **Cold Startup**: Window ready and interactive within `< 1.2s`.
2. **Idle Memory Footprint**: Electron baseline `< 120MB RSS`.
3. **Streaming Latency**: First text delta rendered within `< 50ms` of receipt from the agent daemon.
4. **Editor Performance**: 10,000+ line files open and scroll with zero frame drops using virtualized line rendering.
