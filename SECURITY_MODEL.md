# Forge AI — Security Architecture & Threat Model

## 1. Security Philosophy & Compliance Invariants

As a local-first software engineering tool interacting with local filesystems, terminal environments, and autonomous AI agents, **Forge AI** treats security as an architectural prerequisite rather than an afterthought.

The security model implements **Defense-in-Depth** across five isolated boundaries:

```
+-----------------------------------------------------------------------------------------+
| [BOUNDARY 1: PRESENTATION] Sandboxed Chromium Renderer Process                          |
| - contextIsolation: true                                                                |
| - nodeIntegration: false                                                                |
| - sandbox: true                                                                         |
| - No window.open or external navigation                                                 |
+-----------------------------------------------------------------------------------------+
                                             |
                  Typed Whitelisted IPC Bridge (No generic send/invoke)
                                             |
+-----------------------------------------------------------------------------------------+
| [BOUNDARY 2: PRELOAD SEAM] electron/preload.ts & src/shared/ipc.ts                     |
| - Exposes only frozen ForgeApi interface                                                |
| - Zero Node.js primitives leaked into window                                            |
| - Input validation on all channel arguments                                             |
+-----------------------------------------------------------------------------------------+
                                             |
+-----------------------------------------------------------------------------------------+
| [BOUNDARY 3: MAIN PROCESS] electron/main.ts                                             |
| - Validates path traversal against workspace root                                       |
| - Enforces compile-time strict Content Security Policy (CSP)                            |
| - Subprocess lifecycle supervision                                                      |
+-----------------------------------------------------------------------------------------+
                                             |
+-----------------------------------------------------------------------------------------+
| [BOUNDARY 4: FILESYSTEM & WORKSPACE] electron/workspace.ts                              |
| - Symlink & dot-dot (..) traversal guards                                               |
| - 10MB memory safety limits & binary file suppression                                   |
| - Protected directories (.git, .env, credentials)                                       |
+-----------------------------------------------------------------------------------------+
                                             |
+-----------------------------------------------------------------------------------------+
| [BOUNDARY 5: LOCAL AGENT ENGINE] 127.0.0.1 Loopback Only                                |
| - Zero external port binding (no 0.0.0.0)                                               |
| - Token & cookie isolation (secrets never cross into renderer)                          |
| - Explicit permission checks for destructive shell commands                             |
+-----------------------------------------------------------------------------------------+
```

---

## 2. Threat Analysis & Attack Vectors

| Threat Vector | Potential Impact | Forge AI Architectural Defense |
|---|---|---|
| **Malicious Code Repository** | Cloning a project containing malicious scripts or crafted HTML/Markdown. | Strict CSP forbids external network scripts. Renderers use sanitized Markdown rendering without `dangerouslySetInnerHTML`. |
| **Prompt Injection to RCE** | Agent tricked into executing destructive terminal commands (`rm -rf`, format disk). | Mandatory permission interception gate. Sensitive commands require explicit user approval in the UI before execution. |
| **Path Traversal via Agent/Explorer** | Agent or UI attempting to read or overwrite files outside the opened project (e.g. `../../Windows/System32`). | `path.resolve` combined with `path.relative(workspaceRoot, targetPath)` ensures no operations escape the project root. |
| **Credential & Token Leakage** | Leaking OAuth tokens, browser cookies, or credentials to malicious packages. | Credentials remain exclusively in the OS keychain or protected local CLI store. Tokens are never transmitted to renderer window state. |
| **Local Port Hijacking** | Malicious local processes attempting to connect to the agent server. | Agent servers bind strictly to `127.0.0.1`. Future milestones implement per-session authentication tokens / passwords. |

---

## 3. Defense-in-Depth Implementation Details

### 3.1. Electron Process Hardening (`electron/main.ts`)
```ts
const mainWindow = new BrowserWindow({
  webPreferences: {
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    preload: path.join(__dirname, 'preload.mjs'),
  },
})

// Block unvetted popups and window creation
mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

// Block unhandled navigation outside the app
mainWindow.webContents.on('will-navigate', (event) => event.preventDefault())
```

### 3.2. Build-Time Content Security Policy (`src/shared/csp.ts`, `vite.config.ts`)
Rather than relying on runtime HTML parsing, the Content Security Policy is injected directly into `<head>` during Vite production bundling:

```
default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'
```
*Key features:*
- No `'unsafe-eval'`: Dynamic code evaluation is blocked.
- No remote `connect-src` in production: Prevents data exfiltration to unauthorized origins.
- Development allowances (e.g. HMR WebSockets) are filtered out automatically at build time.

### 3.3. Hardened IPC Surface (`src/shared/ipc.ts`, `electron/preload.ts`)
1. **No Generic Passthrough**: `ipcRenderer.send`, `ipcRenderer.invoke`, and `ipcRenderer.on` are **never** exposed on `window`.
2. **Channel Whitelist**: Only channels declared in `IpcChannels` are reachable.
3. **Payload Sanitization**: File paths, prompts, and IDs are typed and validated.

### 3.4. Path Traversal Protection (`electron/workspace.ts`)
Every filesystem operation enforces workspace containment:
```ts
if (this.currentPath) {
  const rel = path.relative(this.currentPath, target)
  if (rel.startsWith('..') && rel !== '..') {
    return null // Rejected: Target path escapes active workspace
  }
}
```

### 3.5. File Size and Binary Safety
- Files larger than **10MB** are rejected from in-memory string loading to protect against UI freeze or OOM exploitation.
- Binary extensions (`.exe`, `.dll`, `.bin`, `.so`, `.png`, `.zip`, `.wasm`, etc.) are caught before text decoding.

---

## 4. Permission & Destructive Operations Model

For upcoming milestones (Terminal execution and Git rollback), the following permission tiers are enforced:

| Operation Type | Risk Level | Action Required |
|---|---|---|
| **Read Workspace File** | Low | Permitted silently within workspace. |
| **Search Workspace Symbols/Text** | Low | Permitted silently within workspace. |
| **Edit/Create Workspace File** | Medium | Logged in activity cards; file change events emitted. |
| **Execute Safe Read-Only Terminal Command** (`git status`, `npm test`) | Medium | Permitted with live streaming output. |
| **Destructive Command** (`rm`, `git reset --hard`, destructive bash scripts) | High | **UI Permission Modal Required**: Blocks until user explicitly approves or denies. |
| **File Deletion** | High | Explicit confirmation required with visual path indicator. |
