# Forge AI — Testing Strategy

> Version 1.0. No test framework exists in the baseline; M1 introduces Vitest and the
> conventions below. Tests are a milestone acceptance gate, not an afterthought.

## 1. Principles

1. **No fake success.** Unit tests may use fakes to isolate logic. Acceptance tests must
   exercise real Git repositories, real worktrees and a real configured model provider.
2. **Test the contract.** IPC handlers, repository interfaces, event envelopes and task
   state transitions are tested through their public contracts.
3. **Persistence is observable.** Tests assert database rows and event records, not just
   returned values.
4. **Security is testable.** Path traversal, command policy, approval invalidation and
   credential exposure have dedicated negative tests.
5. **Idempotency.** Duplicate event/message delivery is a normal test scenario.

## 2. Stack and layout

```text
vitest.config.ts
tests/
  unit/
    domain/          Zod schemas, state transitions
    persistence/     repositories, migrations, transactions
    models/          gateway routing, usage, retry/cancel
    agents/          lifecycle, budgets, factory
    security/        path-guard, command-policy, approvals
    orchestration/   planner, dependency resolver, scheduler
    coordination/    messages, artifacts, context, events
  integration/
    git-worktrees/   real temp repos
    execution/       real commands with timeouts
    workflow/        multi-agent fake-or-real provider runs
    recovery/        restart and checkpoint restoration
  ui/                component/view tests (added in M8)
```

Fixtures live in `tests/fixtures/**`. Git fixture repos are created in OS temp directories
and removed in `afterAll`. No test writes into the user's real workspace.

## 3. Test pyramid

| Level | Scope | Fakes allowed? |
|---|---|---|
| Unit | Pure logic, schemas, state machines, mappers | Yes, at module boundaries |
| Integration | Real SQLite, real Git, real child processes, real provider adapter | Git/DB are real; provider may be a local stub only for non-acceptance tests |
| Acceptance (MVP criteria) | End-to-end workflow against a real repository and real model | No simulated agent output, no mocked completions |

## 4. Per-milestone test gates

| Milestone | Required tests |
|---|---|
| M0 | Documentation consistency review (no code tests) |
| M1 | Migration up/down; repository CRUD + transactions; FK enforcement; event persist/replay/dedup; Zod rejection of malformed IPC args |
| M2 | Real OpenCode session create → stream → cancel; independent sessions; usage accounting; provider swap through gateway |
| M3 | All lifecycle transitions; path traversal + symlink escape rejection; write outside owned files denied; concurrency/token/recursion caps; legacy workspace save regression |
| M4 | Worktree create/list/remove on temp repo; base commit tracking; overlapping edit detection; diff generation; command allow/deny/approval-required; real test command with output artifact |
| M5 | Dependency graph ordering and parallel sets; all workflow state transitions; plan approval gate (no agents before approval); pause/resume/cancel; restart recovery |
| M6 | Message persistence and idempotent delivery; handoff context; artifact references; context slice excludes unrelated files; duplicate delivery safety |
| M7 | Reviewer receives diff + test output rather than self-report; approval hash invalidation; merge denied without approval; security check failure feedback loop bounded; conflict escalation |
| M8 | UI renders real backend events; every control has a handler; full 19-criteria acceptance run |

## 5. Verification pipeline

Run for every milestone before recording acceptance:

```
npx tsc --noEmit
npm run lint
npx vite build
npm test -- --run
```

`npm test` is added in M1. A failing command blocks acceptance and is recorded in
`CHANGELOG.md`. We do not skip lint or typecheck to make a milestone appear complete.

## 6. Acceptance traceability

Each of the 19 MVP criteria in `IMPLEMENTATION_PLAN.md` §6 maps to at least one named
integration/acceptance test. The mapping is recorded in `CHANGELOG.md` when M8 is accepted.
A criterion backed only by a UI label or unit fake is not accepted.

## 7. Specialized test requirements

- **Concurrency**: at least three agents running in parallel with distinct worktrees and
  sessions; assert no cross-attribution of events.
- **Recovery**: kill/restart simulation with a persisted checkpoint; assert completed tasks
  are not re-executed and destructive actions are not repeated automatically.
- **Security**: attempt `../../` and symlink escapes; attempt a destructive command without
  approval; attempt reuse of an approval after patch changes; assert denials are logged.
- **Determinism**: timeouts and retries use injected clocks where possible; no test depends
  on wall-clock ordering longer than a bounded tolerance.
