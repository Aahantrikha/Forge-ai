# Forge AI — Security Model & Threat Analysis

> Version 2.0. This document records both the verified current posture and the target
> controls. Claims in the v1 document that were not implemented are explicitly marked.

## 1. Security philosophy

Forge AI runs AI agents that read local repositories, edit files and execute commands.
Security is therefore a set of enforced boundaries, not a UI convention. The guiding
principles are:

- least privilege by default (read-only first, controlled writes second, sensitive
  actions require human approval);
- all privileged operations occur in the Electron main process or a trusted worker;
- repository content, model output and tool output are untrusted data;
- every material action is attributable, auditable and reversible where possible.

## 2. Verified current posture

Controls that exist in code today:

| Control | Implementation |
|---|---|
| Context isolation, sandbox, no Node integration | `electron/main.ts:206-212` |
| Popup/navigation denial | `electron/main.ts:225-227` |
| Typed, whitelisted IPC; no generic passthrough | `src/shared/ipc.ts`, `electron/preload.ts` |
| Build-time CSP, no remote `connect-src` in production | `src/shared/csp.ts`, `vite.config.ts` |
| Localhost-only agent server binding | `electron/agents/opencode.ts:70-106` |
| Bounded tree indexing and binary/large-file guards | `electron/workspace.ts:31-32, 142-182` |
| No credentials in source or renderer IPC | verified by audit |

Baseline gaps and current status:

1. **Workspace containment is enforced by `PathGuard`.** `electron/workspace.ts` routes
   reads, saves and entry mutations through `electron/security/path-guard.ts`, which uses
   canonical ancestor realpaths before checking containment.
2. **A scoped `ToolRegistry` now gates agent tools.** Read-only, controlled and sensitive
   levels are enforced against role permissions, workspace roots and writable ownership;
   sensitive tools return `APPROVAL_REQUIRED`.
3. **No command policy, approval manager or audit trail exists yet.** Command interception
   and exact-action approval hashing are deferred to M4/M7.
4. **No secret storage** is implemented; the v1 text referred to a future OS keychain.
5. **Security tests now exist** for path traversal, symlink escapes, tool ownership and
   sensitive-tool denial. Command and approval tests arrive in M4–M7.

M3 closes path/tool containment and adds lifecycle/heartbeat, concurrency, recursion and
token-budget limits; destructive commands remain unavailable until M4/M7.

## 3. Trust boundaries

```
Renderer (untrusted)  ──typed IPC──►  Preload (whitelist)  ──►  Main services (trusted)
                                                                  │
                     ┌────────────────────────────────────────────┤
                     ▼                                            ▼
        PathGuard / CommandPolicy / ApprovalManager     ModelGateway / ProviderAdapter
                     │                                            │
                     ▼                                            ▼
        Worktree filesystem + Git                   Local OpenCode engine (127.0.0.1)
```

Repository files, model responses, tool output and agent messages all cross into the
trusted plane as **data**. They never grant authority. Prompt-injection text that asks
an agent to run a destructive command is treated as a request that still goes through
the same policy and approval checks.

## 4. Permission model

### 4.1 Levels

| Level | Tools / actions | Default decision |
|---|---|---|
| Read-only | `read_file`, `search_codebase`, `list_directory`, `inspect_git` (read commands) | Allowed inside authorized roots |
| Controlled | `write_file`, `edit_file`, `run_tests`, `create_artifact`, `create_worktree` | Allowed only inside the agent's worktree and on owned files |
| Sensitive | dependency installs, env/config changes, file deletion, out-of-root access, privileged commands, destructive DB migrations, remote push, merge to base | **Require explicit approval** |

### 4.2 Policy engine

`PermissionPolicyEngine.evaluate(action, context)` returns `allow`, `require_approval`
or `deny`. Context includes agent role, workflow, worktree root, file ownership, command
parsed form and current approval state. Rules are versioned and stored; changes to a
rule do not retroactively authorize already-rejected actions.

### 4.3 Approval semantics

An approval request contains: requested action, reason, affected files, proposed command,
potential impact, agent ID, workflow ID and an exact-action/patch reference plus hash.

- Approve authorizes **only** the reviewed operation. If any parameter, command or patch
  changes, a new approval is required (enforced by comparing the action hash).
- Reject, request modifications, expire and cancel are first-class outcomes.
- Decisions are recorded in an append-only audit trail with actor and timestamp.
- Plan approval, merge approval and sensitive operations are mandatory gates.

## 5. Filesystem and path safety

`PathGuard` will centralize all path decisions:

1. Resolve every path with `path.resolve`; reject relative escapes.
2. Verify containment via `path.relative(root, target)` for read and write operations.
3. Use `fs.realpathSync` (where the path exists) to defeat symlink escapes.
4. Restrict writes to the agent's declared `fileOwnership` inside its worktree.
5. Reject device files, junctions outside roots and paths containing null bytes.
6. Keep the existing 10 MB and binary-extension guards for renderer display.

This replaces the partial guard in `getTree()` and applies to `readFile`/`saveFile` before
any agent tooling is enabled.

## 6. Command execution safety

- No free-form shell string is executed without parsing and policy evaluation.
- Commands are represented as `{ executable, args, cwd, env }`; shell metacharacters are
  rejected unless a specific allowlisted command form requires them.
- Working directory is always an authorized worktree or the project root for read-only
  inspection. Environment variables are allowlisted; secrets are injected only by main.
- Process timeouts, output caps and cancellation are mandatory. Output is stored as an
  artifact reference, not streamed unbounded into renderer memory.
- Destructive patterns (history rewriting, force push, recursive delete, disk format,
  package install, migration) always require approval.

## 7. Credential isolation

- Model credentials remain with the provider adapter or OS credential store in main.
- No API key may be returned over IPC, written to logs, embedded in prompts, or included
  in artifacts. OpenCode's local auth files are never copied into projects or worktrees.
- Future direct provider adapters must use the same rule; a credential never enters a
  model session transcript.

## 8. Git and worktree safety

- One registered worktree per coding agent, on branch `forge/<workflow-id>/<agent-role>`.
- Base commit and base branch are recorded at workflow start; main/base branch is never
  modified by an agent.
- Overlapping file modifications are detected before merge; semantic conflicts are not
  auto-resolved by an unverified model.
- Merge and push require explicit human approval with the exact diff/branch reviewed.
- Rollback uses recorded base commits; destructive Git operations require approval.

## 9. Untrusted data handling

- Markdown is rendered with a custom sanitizing renderer — no `dangerouslySetInnerHTML`.
- CSP forbids remote scripts/connections in production.
- Tool output, diffs and model text are escaped before display.
- Agent instructions and role profiles are data validated by Zod; dynamic roles cannot
  grant tools or permissions outside their manifest.

## 10. Observability and audit

Structured logs and persisted events record: approvals and decisions, permission denials,
tool invocations, command execution with exit codes, agent lifecycle transitions, merges
and recoveries. Logs never contain secrets or full credential material. Event consumers
are idempotent; audit records are append-only.

## 11. Threat → control mapping

| Threat | Control |
|---|---|
| Prompt injection to destructive command | Command policy + approval gate; model text has no authority |
| Path traversal / symlink escape | `PathGuard` on workspace reads/writes and agent file tools (M3) |
| Agent edits overlap / bad merge | File ownership, worktrees, conflict detection, human merge approval |
| Credential leakage to renderer | Main-only secret storage; IPC contract; log filtering |
| Malicious repo content | CSP, safe markdown, untrusted-data rule, no auto-execution |
| Runaway agent creation | Global/per-workflow concurrency, token budgets, recursion limits |
| Crash mid-destructive action | Checkpoints, idempotent operations, no automatic destructive retry |
| Fake completion | Acceptance criteria + artifacts + independent review |

## 12. Remediation order

1. M1: Zod validation at IPC boundaries; structured logging foundation.
2. M3 (complete): `PathGuard` applied to workspace reads/writes and agent file tools;
   tool registry with permission levels and lifecycle/budget limits.
3. M4: command policy, worktree containment, diff/conflict detection.
4. M7: approval manager, exact-action hashing, audit trail, controlled merge.
5. M8: approval center UI exposes decisions and audit history.
