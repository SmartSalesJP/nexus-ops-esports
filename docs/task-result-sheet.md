# Task Result Sheet / Weekly Project Graph

## Data contract

Schema v4 remains the storage version. `taskResults` is a backward-compatible bundle member; legacy local/cloud bundles without it are normalized to `[]`. Each saved sheet has the identity `task-result:<taskId>` and is persisted as a separate `task_result` cloud entity, so task and result OCC versions and audit diffs are independent.

The frontend validator enforces one sheet per existing task, one stable ID per deliverable, field/count limits, ISO timestamps, and HTTPS-only links. URLs with credentials, protocol-relative syntax, control characters, or any non-HTTPS scheme are rejected. External links use `target="_blank"` with `rel="noopener noreferrer"`; result content is rendered as text.

## UI behavior

Every task card exposes a dedicated `成果シート` action. An unsaved task displays a logical empty sheet and creates its entity on the first successful save. Viewer mode has no edit action. Failed saves keep the draft. Hash navigation uses `#task-result/<taskId>` and returning to the task board preserves the in-memory filters.

## Weekly graph

The weekly runner owns only elements whose `data.managedBy` is `weekly-project-graph`. The generated graph uses stable `weekly-project:` IDs, sorted task order, fixed fallback positions, and project → phase → task edges. Existing managed node positions are retained. Manual nodes, edges, and viewport remain untouched. Reserved-ID collisions abort the weekly update.

The first run's `WeeklyRun.snapshot` stays frozen. A same-week result/status change updates only the managed graph. Re-running identical input in the same JST week returns the original bundle object without changing bytes.

## Verification commands

Run with Node available on PATH:

```text
pnpm typecheck
pnpm lint
pnpm test
pnpm test:ui
pnpm test:a11y
pnpm test:e2e
pnpm build
pnpm verify:pages
pnpm audit --audit-level high
```

The Supabase database migration that allows and validates `task_result` is intentionally outside this frontend-owned change set.

## Database contract proposal (not applied)

The current frontend and database limits agree on task-result identity (`taskId`: 1–244, entity ID: at most 256), deliverable identity (1–100), HTTPS links, credential rejection, timestamps, and optional verification fields. The frontend additionally relies on the JavaScript URL parser, so database contract tests should retain representative whitespace, backslash, malformed-port, user-info, and non-HTTPS cases to prevent parser/regex drift.

Round 3 fixes the shared URL policy to ASCII DNS hostnames (including literal `xn--` punycode) or canonical dotted-decimal IPv4. Unicode input hostnames, IPv6 literals, empty/consecutive labels, non-canonical shortened IPv4, credentials, malformed ports, and port `0` are rejected by both layers. The database migration contract supplied by the database owner is identified by SHA-256 `43B97743459C21E91E75FF90448E9658A4827CF4F48575817092156C005890F3`; database files remain outside this frontend change.

Task deletion should be atomic at the persistence boundary: deleting a task and its `task_result`, weekly completion/provenance references, managed flow nodes, and connected edges must be accepted or rejected as one final-state change. The recommended database/API contract is a transaction-scoped cascade-prune RPC (or equivalent deferred final-state validation), rather than validation that depends on mutation order. No Supabase migration is changed here; this is a handoff proposal for the database owner.

## Correction history

- Final review finding: `flow_edge.data.taskIds` did not emit cloud task references, and frontend flow validation was weaker than the database migration contract. Correction: every node/edge `taskIds` entry now emits a `kind: task` reference; task-targeted nodes and edges require non-empty matching `targetId`/`taskId`, task-targeted nodes additionally require `taskIds` containing that identity, and every declared task ID must resolve to an active task. Positive, missing, mismatch, invalid-reference, prune, and weekly-generation regressions cover the contract.
- Final review finding: the synchronous lock covered `commit` but local weekly, JSON import, and reset could still persist concurrently. Correction: one global synchronous mutation lock now owns commit, weekly, import, and reset persistence; competing operations return before reading import content or deriving/applying a weekly bundle, and every acquired path releases in `finally`. Same-tick baseline/weekly, commit/import, weekly double-click, and failure/retry tests prove one mutation and successful lock recovery.
- Round-3 review finding: a dirty source could navigate away or authorize another source's save. Correction: the registry is source-named (`canvas`, `result`, `modal`, `kpi`), all navigation outside the active source is stopped, and `commit(saveSource)` accepts dirty persistence only when that source is the sole dirty source.
- Round-3 review finding: result Back and modal Escape/X/backdrop could discard drafts implicitly, KPI lacked a restore baseline, and cloud state-version changes remounted the app. Correction: those implicit exits now stop, explicit discard controls were added, KPI restores its last confirmed baseline, and same-organization cloud read-back updates the existing App only while clean.
- Round-3 review finding: React state was not a same-tick save lock and dirty hash changes could leave URL and UI inconsistent. Correction: synchronous ref locks cover App commit, task modal, KPI, result, and canvas saves; rejected hash/pop transitions immediately restore the last accepted URL.
- Round-3 review finding: task-targeted edge references and complete prune batch evidence were missing. Correction: both flow nodes and edges emit `kind: task` links for `taskId` and task `targetId`; the prune fixture now includes a real result, completion, nodes, edges, dependency, and recursive provenance and validates the post-prune bundle plus one `diffEntities` batch.

- Round-2 review finding: task deletion could leave dependent result, weekly, provenance, flow-node, or edge references. Correction: deletion now runs through one common recursive prune function before validation and persistence.
- Round-2 review finding: only canvas edits participated in navigation/save guards. Correction: a unified dirty-source registry now covers canvas, result sheet, task modal, and KPI edits; result deletion and direct draft changes are detected by baseline comparison.
- Round-2 review finding: viewer pan/zoom could behave like a persisted edit. Correction: viewer viewport interaction remains local and does not register dirty state; clean editable canvases synchronize confirmed managed graph updates, while dirty canvases keep their draft and block weekly replacement.
- Round-2 review finding: URL and identifier edge cases lacked frontend parity evidence. Correction: unsafe whitespace, backslash, malformed-port, credential, scheme, and deliverable-ID cases are validated and covered by regression tests; the atomic database deletion contract is proposed above without modifying database files.

- Review finding: a dirty canvas could still be lost when an unrelated save caused cloud read-back and an application remount. Correction: all non-canvas commits now stop while the canvas is dirty; manual/startup weekly execution is guarded internally; remote reload, polling, organization switching, JSON import, KPI save, and result navigation remain blocked until resolution.
- Review finding: there was no explicit discard route. Correction: the canvas now offers `未保存変更を破棄`, restoring nodes, edges, viewport, selection, and connection controls from the last persisted flow.
- Review finding: event-based dirty flags could report changes for transient selection state or no-op operations. Correction: dirty state now uses deep equality over persisted node, edge, and viewport fields while excluding React Flow's transient selection, drag, measurement, width, and height fields.
- Regression finding: dirty notification was initially emitted from a child state updater and React reported a render-time parent update. Correction: next flow state is calculated first and the parent notification is emitted outside React's state-updater callback. The focused desktop/mobile test and the complete E2E suite passed afterward.
