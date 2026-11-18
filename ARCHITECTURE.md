# Forge AI — System Architecture Specification

## 1. Executive Overview & Product Vision

**Forge AI** is a local-first, open-source desktop AI software engineering platform engineered specifically for Windows developers. It delivers an autonomous multi-agent coding environment (comparable to Cursor and Claude Code) while adhering to a strict cost invariant: **zero required additional subscriptions or paid API billing**. Forge AI enables developers to orchestrate autonomous coding agents by reusing their existing subscriptions, authenticated accounts, and free community models.

```
+-----------------------------------------------------------------------------------------+
|                                    FORGE AI DESKTOP                                     |
|                                                                                         |
|  +--------------------+  +----------------------------+  +---------------------------+  |
|  |      OpenCode      |  |        OpenAI Codex        |  |          Gemini           |  |
|  | TypeScript SDK     |  | Codex App Server Protocol  |  | Google Antigravity CLI    |  |
|  | (Free Models / 0$) |  | (Existing ChatGPT Account) |  | (Google Account Auth)     |  |
|  +--------------------+  +----------------------------+  +---------------------------+  |
|             \                          |                          /                     |
|              +-------------------------+-------------------------+                      |
|                                        |                                                |
|                      +-----------------------------------+                              |
|                      |   Unified AgentAdapter Interface  |                              |
|                      +-----------------------------------+                              |
|                                        |                                                |
|              +-------------------------+-------------------------+                      |
|              |                         |                         |                      |
|      +---------------+         +---------------+         +---------------+              |
|      | Chat & Prompt |         | Workspace &   |         | In-App Code   |              |
|      | Engine        |         | Tree Watcher  |         | Editor & Diff |              |
|      +---------------+         +---------------+         +---------------+              |
+-----------------------------------------------------------------------------------------+
```

---

## 2. Architectural Layering

Forge AI implements a clean four-tier separation of concerns with zero leaking of privileged APIs into the presentation layer:

```
+--------------------------------------------------------------------------------+
| TIER 1: PRESENTATION LAYER (Renderer Process)                                  |
| React 18, TypeScript, CSS Variables Design System                              |
| Components: TitleBar, ActivityRail, Sidebar, StatusBar, MarkdownMessage        |
| Views: ChatView, WorkspaceView, HistoryView, SettingsView                      |
+--------------------------------------------------------------------------------+
                                      |
                      window.forgeAI (Typed ContextBridge)
                                      |
+--------------------------------------------------------------------------------+
| TIER 2: HARDENED PRELOAD BRIDGE (electron/preload.ts)                          |
| Whitelisted IPC Channels Only (IpcChannels)                                    |
| Strict Context Isolation, Zero Node APIs Exposed, Unidirectional Event Emitters|
+--------------------------------------------------------------------------------+
                                      |
                              Electron IPC Channel
                                      |
+--------------------------------------------------------------------------------+
| TIER 3: ELECTRON MAIN PROCESS (electron/main.ts, agent-service.ts, workspace.ts)|
| Lifecycle Management, Win32 Window Framing, Native OS Menus, CSP Enforcement   |
| Service Layer:                                                                 |
|   - WorkspaceService: Recursive Tree, fs.watch, Safe Path Traversal, IO        |
|   - AgentService: Adapter Dispatch, Event Bus Broadcast, Lifecycle             |
+--------------------------------------------------------------------------------+
                                      |
                     Local Loopback / Subprocess IPC (127.0.0.1)
                                      |
+--------------------------------------------------------------------------------+
| TIER 4: AGENT ENGINE SUBSYSTEM (Local Daemons & Adapters)                      |
|   - OpencodeAdapter (@opencode-ai/sdk headless server on 127.0.0.1)            |
|   - CodexAdapter (Codex App Server loopback protocol - Milestone 4)            |
|   - GeminiAdapter (Google Antigravity CLI stdio daemon - Milestone 5)          |
+--------------------------------------------------------------------------------+
```

---

## 3. Subsystem Breakdown

### 3.1. Main Process & Application Lifecycle (`electron/main.ts`)
- **Window Management**: Maintains standard Win32 OS frame (`frame: true`) to retain native Windows 11 snap layouts, maximize/minimize/close window controls, and OS-native title bar.
- **Application Menu**: Implements native menu templates with standard accelerators:
  - `File > Open Folder...` (`CmdOrCtrl+O`) &rarr; triggers `forge:menu:open-folder`
  - `File > Open File...` (`CmdOrCtrl+Shift+O`) &rarr; triggers `forge:menu:open-file`
  - `File > Save` (`CmdOrCtrl+S`) &rarr; triggers `forge:menu:save-file`
- **Security Posture Initialization**: Enforces Chromium sandboxing, context isolation, disables Node integration in renderer, and denies unhandled navigation or `window.open` calls.
- **Graceful Teardown**: Hooks `app.on('window-all-closed')` to shut down `WorkspaceService` file watchers and gracefully invoke `AgentService.dispose()` to kill background daemons without leaving orphaned child processes.

### 3.2. Hardened IPC Preload Bridge (`electron/preload.ts`, `src/shared/ipc.ts`)
- **Explicit Channel Whitelist**: The renderer cannot invoke arbitrary IPC channels. All channels are statically declared in `src/shared/ipc.ts` under `IpcChannels`.
- **Preload API (`window.forgeAI`)**:
  - `app`: `getInfo()`
  - `workspace`: `openFolder()`, `openFile()`, `readFile()`, `saveFile()`, `getCurrent()`, `setCurrent()`, `getTree()`, `onFileChanged()`, `onMenuOpenFolder()`, `onMenuOpenFile()`, `onMenuSaveFile()`
  - `agent`: `checkAuth()`, `listModels()`, `createSession()`, `submitPrompt()`, `cancel()`, `onEvent()`

### 3.3. Workspace & Filesystem Subsystem (`electron/workspace.ts`)
- **Directory Traversal Guard**: All file reading, saving, and tree generation validate that the target path does not traverse outside the active workspace root (`path.relative(root, target).startsWith('..')` protection).
- **Tree Indexer**: Traverses the filesystem up to depth 8 or 2,500 entries. Automatically prunes noise directories (`.git`, `node_modules`, `dist`, `.next`, `build`, `coverage`, `__pycache__`).
- **Filesystem Watcher**: Native recursive `fs.watch` on the root workspace with a 200ms debounce timer to prevent event floods during large Git operations or builds.
- **Recent Projects Persistence**: Persists up to 10 recently opened workspaces in `%APPDATA%/forge-ai/recent-workspaces.json`.
- **Safe File IO**: `readFile` guards against binary files (images, audio, archives, executables) and files exceeding 10MB to maintain responsive UI performance. `saveFile` ensures parent directories exist recursively before writing UTF-8 text.

### 3.4. Unified Agent Subsystem (`src/shared/agent.ts`, `electron/agent-service.ts`)
- **Contract Decoupling**: Adapters implement the `AgentAdapter` interface:
  ```ts
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
- **Agent Service**: Orchestrates adapter registration, handles channel routing, and multiplexes asynchronous event streams from background engines to the renderer via `forge:agent:event`.

### 3.5. OpenCode Engine Adapter (`electron/agents/opencode.ts`)
- **Local Engine Lifecycle**: Probes candidate ports (`4096-4099`) on `127.0.0.1` for an existing instance or starts a local headless server via `createOpencodeServer`.
- **SSE Stream Multiplexing**: Subscribes to Server-Sent Events per directory (`client.event.subscribe({ query: { directory } })`).
- **Zero-Cost Model Prioritization**: Scans providers and separates zero-cost models (`cost.input === 0 && cost.output === 0`) such as `opencode/big-pickle`, `opencode/beam-free`, and `opencode/deepseek-v4.1-flash-free`. Free models are prioritized and badged; paid models are never auto-selected.

---

## 4. End-to-End Data Flow

### 4.1. Prompt Submission & Streaming Flow
```
Renderer (ChatView)                 Preload Bridge              Electron Main                   OpenCode Engine
        |                                 |                           |                               |
        |--- submitPrompt(text) --------->|                           |                               |
        |                                 |--- ipcRenderer.invoke --->|                               |
        |                                 |    (forge:agent:prompt)   |--- submitPrompt() ----------->|
        |                                 |                           |                               |
        |                                 |                           |<-- SSE: message.part.delta ---|
        |                                 |<-- win.webContents.send --|                               |
        |                                 |    (forge:agent:event)    |                               |
        |<-- onEvent(text_delta) ---------|                           |                               |
        |    [Update Markdown UI]         |                           |                               |
        |                                 |                           |<-- SSE: command.executed -----|
        |                                 |<-- win.webContents.send --|                               |
        |<-- onEvent(tool_activity) ------|                           |                               |
        |    [Render Activity Card]       |                           |                               |
        |                                 |                           |<-- SSE: session.status (idle)-|
        |<-- onEvent(done) ---------------|                           |                               |
        |    [Complete message stream]    |                           |                               |
```

### 4.2. File Editing & Persistence Flow
```
User (WorkspaceView Editor)             Preload Bridge                  Electron Main (WorkspaceService)   Local Disk
        |                                     |                                       |                        |
        |--- Types in editor (Dirty)          |                                       |                        |
        |    [Shows ● Modified badge]         |                                       |                        |
        |                                     |                                       |                        |
        |--- Ctrl+S / Save Button ----------->|                                       |                        |
        |                                     |--- ipcRenderer.invoke --------------->|                        |
        |                                     |    (forge:workspace:save-file)        |--- fs.writeFile ------>|
        |                                     |                                       |<-- File written -------|
        |                                     |                                       |--- fs.stat / readFile -|
        |                                     |<-- Returns Updated OpenedFile --------|                        |
        |<-- Updates activeFile & clears dirty|                                       |                        |
        |    [Shows ✓ Saved! indicator]       |                                       |                        |
        |                                     |                                       |<-- fs.watch event -----|
        |<-- onFileChanged() -----------------|                                       |                        |
        |    [Refreshes File Tree Explorer]   |                                       |                        |
```

---

## 5. Architectural Invariants

1. **Context Isolation & Sandboxing**: Renderer has zero direct Node.js or native filesystem access.
2. **Zero Hardcoded Secrets**: Authentication tokens and keys must never be committed, transmitted over renderer IPC, or logged to disk.
3. **No Fabricated Agent Activity**: The presentation layer never simulates artificial tool calls or fake agent progress; all displayed events correspond to verified backend telemetry.
4. **Zero Forced Billing**: Free community models and existing account authentications are strictly prioritized. Paid models require explicit opt-in.
5. **Localhost Bound Engine Communication**: All agent server sockets bind exclusively to `127.0.0.1`. No external network exposure of agent control endpoints is permitted.
