# NEXUS OPS Supabase database

## Additional organizations

`rpc_bootstrap_organization` remains the one-time administrator-approved first-owner path. It is not reused for ordinary creation.

An authenticated user with at least one owner membership on an active organization may call `rpc_create_organization`. The RPC validates bounded text, a 3〜7 Phase/2〜12 department config, 5〜20 initial custom tasks, required singleton entities, and an audit entity. It creates the organization, creator owner membership, private workspace profile/config, organization-scoped entities/links, server audit events, and `(actor_user_id, run_id)` creation registry in one transaction. Identical retries return the same result; a reused run ID with different JSON is rejected. A duplicate slug or any late entity/reference failure rolls back every insert.

`app_private.workspace_profiles`, `workspace_configs`, and `organization_creation_requests` have RLS enabled with no client policies or API-role grants. `rpc_create_organization` and `rpc_organization_creation_capability` use `SECURITY DEFINER`, an empty `search_path`, fully qualified relations, revoked default/API execution, and an explicit `authenticated` grant. No table DML grant is added. The expected advisor result is the documented authenticated definer warning only; investigate any other new finding relative to the existing baseline.

`rpc_update_workspace_settings` is authenticated but owner-only and updates profile/config plus only the entity fields that depend on their display configuration; task-specific `owner` values remain authoritative. Once an organization has a workspace config, the shared `app_private.execute_changes` engine validates the committed task/phase/department/flow/dependency/result graph at the end of every apply, weekly, import, and settings transaction. A mismatch raises and rolls the entire mutation back; legacy organizations without a config retain the previous behavior. Migration 1 deliberately leaves `rpc_create_organization` revoked from `authenticated`; the hardening migration grants it only as its final statement after the strict validators and shared guard exist.

`app_private.workspace_settings_valid` strictly validates every profile/config JSON scalar type, bounded name, department owner, terminology value, contiguous Phase code, allowed department ID, and the exact `nexus-local-v1` generator version. Owner-only `rpc_update_workspace_settings` updates the profile/config and related entity bundle atomically through the existing change executor. Its default, `anon`, and `service_role` execute privileges are revoked; only `authenticated` receives execute permission.

This directory defines the reproducible database boundary for the existing Supabase project:

- project ref: `tfbiecbetxvxjksvptbx`
- organization: SmartSalesJP
- region: `ap-northeast-1`
- production migrations: `migrations/20260817065432_nexus_ops_shared_schema.sql`,
  `migrations/20260817070015_index_foreign_key_columns.sql`,
  `migrations/20260817102047_add_task_result_entity.sql`,
  `migrations/20260818181229_add_task_result_checklist.sql`,
  `migrations/20260826065233_create_organization_workspaces.sql`, and
  `migrations/20260826065243_harden_organization_workspace_settings.sql`
- SQL self-test: `tests/rls.sql`

The task-result entity and checklist migrations are applied to the production database. They are intentionally up-only; verify future follow-up migrations through independent review and a disposable branch/local verification pass before applying them.

## Security model

### Browser local-only mode

The configured frontend also offers an unauthenticated “メールなしでこの端末だけで使う” path. It does not call Supabase Auth or create an anonymous Supabase user; it mounts the existing app without cloud controls and persists the mode choice in that browser's `localStorage`. Data remains only in that device and browser profile, is not shared or synchronized, and may be lost when browser/site data is deleted. The persistent banner can return the user to the existing invited-email login flow after any dirty draft is saved or explicitly discarded. Auth callback codes, tokens, and errors take priority over the remembered local choice. This UI mode does not change shared data, grants, RLS, database schema, or Auth configuration.

- `anon` has no table access and cannot execute any NEXUS RPC.
- `service_role` also has no direct business-table DML or RPC execution grant; administrative bootstrap uses a direct administrator connection/SQL Editor.
- An authenticated organization member can select that organization's rows through RLS.
- Browser-side business writes have no direct table grant. All writes use an explicitly granted RPC.
- `viewer` is read-only. `editor` can apply entity/weekly changes. `owner` can also import and manage membership.
- Local Auth configuration keeps global, email, SMS, and anonymous signup disabled. Mirror those settings in the remote Auth dashboard; `config.toml` does not change an existing cloud project's Auth settings by itself.
- Every mutation uses a caller-provided UUID `run_id`. Replaying the exact request is a no-op; reusing the UUID with different input is rejected.
- Entity writes compare both the organization `state_version` and every entity `expectedVersion`. New entities use `expectedVersion: 0`.
- `entity_record_links` uses organization-scoped composite foreign keys. References cannot resolve to another organization.
- Server audit rows, import manifests, and completed mutation runs are append-only. Actor UUIDs and timestamps are database values.
- The last owner cannot be removed or demoted, including by an Auth-user cascade.

## Initial owner (must be decided before bootstrap)

There is no first-visitor or first-request ownership path. If the initial owner is not yet known, stop after applying the schema and do not call the bootstrap RPC.

1. Invite/create the intended person in Supabase Auth.
2. In the Dashboard, verify the person's requested email against the corresponding `auth.users.id`. Do not commit the email or UUID to Git.
3. As a database administrator in SQL Editor, add only that verified UUID to the private allowlist:

   ```sql
   insert into app_private.bootstrap_owner_allowlist (user_id, allowed_by)
   values ('<verified-auth-user-uuid>'::uuid, '<ticket-or-admin-identity>');
   ```

4. Sign in as that Auth user and call:

   ```ts
   supabase.rpc('rpc_bootstrap_organization', {
     p_name: 'NEXUS OPS',
     p_slug: 'nexus-ops',
     p_run_id: crypto.randomUUID(),
   })
   ```

The allowlist row is consumed atomically and records the created organization. A second call returns the same organization. Never grant browser access to `app_private` and never use a publishable key for the administrator insert.

## Entity mapping for schema v4

Each `entity_records` row has `(organization_id, entity_type, entity_id)`, an object `payload`, stable `ordinal`, and server-managed `version`/audit columns.

| schema v4 section | `entity_type` | `entity_id` |
| --- | --- | --- |
| `tasks[]` | `task` | task `id` |
| `flow.nodes[]` | `flow_node` | node `id` |
| `flow.edges[]` | `flow_edge` | edge `id` |
| `flow.viewport` | `flow_viewport` | `singleton` |
| `audit[]` | `client_audit` | audit `id` |
| `kpis[]` | `kpi` | KPI `id` |
| `reportBaseline` | `report_baseline` | `singleton` |
| `migrationArchive[]` | `migration_archive` | `${fromSchema}:${migratedAt}` |
| `weekly.runs[]` | `weekly_run` | `runId` |
| `weekly.completions` entries | `weekly_completion` | task ID |
| `weekly.tombstones[]` | `weekly_tombstone` | canonical fingerprint (or its stable hash) |
| weekly `lastRun`/container metadata | `weekly_meta` | `singleton` |
| `taskResults` entries | `task_result` | `task-result:${taskId}` |

Every payload includes a string `id` equal to `entityId`. Singleton/container values use an envelope: report baseline is `{ "id": "singleton", "value": ReportSnapshot | null }`, and weekly metadata is `{ "id": "singleton", "lastRunId": string | null }`. The database rejects payloads over 256 KiB, oversized arrays/batches, missing minimum type-specific keys, mismatched IDs, malformed task/node/run data, and undeclared references. Relations also go in each change's `references` array, for example a task dependency, flow edge source/target, flow-node task, or weekly-completion task. The database persists those relations in `entity_record_links`; omitting a reference removes the previous link on update. Identical repeated references are normalized to one relational link.

### Task result sheet contract

`task_result` is added without changing schema version 4, table columns, or RPC signatures. Save it through `rpc_apply_changes` (or include it in an owner-only schema-v4 import); `rpc_save_weekly` remains restricted to weekly entity types. Its stable ID is `task-result:${taskId}`, and every upsert must declare `{ "kind": "task", "entityType": "task", "entityId": taskId }`. The composite link foreign key requires that task to exist in the same organization and prevents task deletion while its result sheet remains linked.

Required payload fields are `id`, `taskId`, `resultBody`, `verificationState`, `verificationSummary`, `deliverables`, `nextStep`, `completionCriteria`, `verificationMemo`, and `updatedAt`. `verifiedBy` and `verifiedAt` may be omitted; when present they must be strings and JSON `null` is rejected to match the frontend TypeScript contract. Verification state is one of `未確認`, `確認中`, `適合`, `要修正`, or `確認不能`.

Each of at most 32 deliverables requires `id`, `title`, `type`, `href`, and `accessState`; `note` and `lastCheckedAt` may be omitted but cannot be JSON `null`. Types are `excel`, `google-sheets`, `google-docs`, `notion`, `url`, `file`, or `other`; access states are `未確認`, `利用可能`, `権限不足`, or `リンク切れ`. Deliverable IDs must be unique in the payload. `href` is limited to 2048 characters and must be an absolute HTTPS URL without userinfo, whitespace/control characters, backslashes, protocol-relative syntax, or another scheme. Hosts are restricted to ASCII DNS labels or canonical dotted-decimal IPv4; Unicode IDNs, IPv6 literals, empty/consecutive-dot labels, labels longer than 63 characters, leading/trailing label hyphens, ambiguous numeric address forms, and IPv4 octets above 255 are rejected. An explicit port must be an integer from 1 through 65535.

Database limits are 10,000 characters for `resultBody` and `verificationMemo`; 4,000 for `verificationSummary`, `nextStep`, and `completionCriteria`; 200 for `verifiedBy`; 100 for deliverable IDs; 200 for titles; and 1,000 for notes. Timestamps must start with an ISO date-time through seconds and must parse as a real PostgreSQL timestamp; optional timestamp fields follow the same rule when present. The task-result validator rejects unknown task-result and deliverable fields. Existing entity types continue through the unchanged legacy validator to keep older clients compatible.

Task deletion is a client-coordinated atomic graph rewrite. The client must delete or rewrite task-result, completion, dependency, and managed-canvas references in the same RPC batch before deleting the task. Any residual managed reference is intentionally rejected by the composite foreign key, and the entire transaction—including earlier changes in that batch—is rolled back.

For `flow_node` or `flow_edge` payloads whose `data.targetType` is `task`, `data.targetId` and `data.taskId` are required, must be equal, and must have a matching `task` reference. A task-targeted node must also provide a `data.taskIds` array containing that task; an edge's `taskIds` is optional, but every value is validated when present. The organization-scoped composite foreign key requires every declared task to exist in the same organization. Missing, inconsistent, undeclared, absent, and cross-organization task targets reject the whole RPC batch.

## RPC contract

- `rpc_list_my_organizations()` returns `[{id,name,slug,status,stateVersion,role}]`.
- `rpc_read_snapshot(p_organization_id)` returns `{schemaVersion, organization, role, entities, importState, readAt}`. `importState.status` is `empty`, `imported`, or `populated_without_manifest`.
- `rpc_apply_changes(p_organization_id, p_expected_state_version, p_changes, p_run_id)` is the editor/owner optimistic-concurrency transaction.
- `rpc_save_weekly(...)` has the same arguments but permits task, flow, `client_audit`, and weekly entity types, so a weekly run and its client audit are atomic.
- `rpc_import_v4(p_organization_id, p_expected_state_version, p_run_id, p_raw_sha256, p_semantic_fingerprint, p_source_origin, p_source_size, p_source_entity_count, p_entities)` is owner-only, requires an empty organization for a new fingerprint, and writes entities plus the manifest in one transaction.
- `rpc_list_memberships(p_organization_id)` is owner-only and returns `[{userId,role,version,createdAt,updatedAt,createdBy,updatedBy}]` without email addresses.
- `rpc_manage_membership(p_organization_id, p_user_id, p_role, p_action, p_expected_state_version, p_expected_membership_version, p_run_id)` is owner-only. New membership uses expected membership version `0`; update/removal uses the version returned by `rpc_list_memberships`. For removal, pass `p_role: null`. Both organization and membership versions are checked after row locks.

`p_changes`/`p_entities` is a non-empty array:

```json
[
  {
    "op": "upsert",
    "entityType": "task",
    "entityId": "P0-01",
    "expectedVersion": 0,
    "payload": {
      "id": "P0-01",
      "title": "...",
      "phase": 0,
      "teamId": "ops-hq",
      "team": "...",
      "rawTeam": "...",
      "owner": "...",
      "assignees": [],
      "rawAssignees": "",
      "personKeys": [],
      "urgency": "...",
      "deadline": "...",
      "status": "...",
      "holdReason": "",
      "dependencies": ["P0-00"],
      "notes": [],
      "sourceRefs": [],
      "updatedAt": "2026-08-17T00:00:00.000Z"
    },
    "ordinal": 0,
    "semanticFingerprint": null,
    "references": [
      { "kind": "dependency", "entityType": "task", "entityId": "P0-00" }
    ]
  }
]
```

Reference `kind` values enforced from payload fields are `dependency`, `created_run`, `provenance_source`, `provenance_dependency`, `provenance_kpi`, `source`, `target`, `task`, `weekly_run`, and `last_run`. The referenced entity may be created in the same transaction, but must resolve inside the same organization.

Delete changes contain `op`, `entityType`, `entityId`, and the current `expectedVersion`, with no `payload`.

## Database Advisor disposition

`20260817070015_index_foreign_key_columns.sql` adds the ten missing foreign-key indexes reported after the initial remote migration. Existing primary, unique, and composite indexes already cover the other foreign keys. Do not remove indexes merely because a new or empty database reports them as unused; reassess `unused_index` INFO only after representative production workload and query-plan evidence exist.

`20260817102047_add_task_result_entity.sql` adds no table, column, new foreign key, or RPC signature. It reuses the indexed organization-scoped entity link constraints and preserves the existing `SECURITY DEFINER` write engine's empty `search_path` and grants. Re-run linked security/performance advisors after applying it; do not treat the accepted RPC/allowlist INFO items below as newly introduced findings.

The remaining security INFO items are intentional and must be reviewed, not suppressed by weakening access controls:

- Public `rpc_*` functions use `SECURITY DEFINER` because all business writes must pass through the transactional authorization/OCC layer. Every RPC fixes `search_path` to empty, rejects a missing `auth.uid()`, reloads the organization and membership from database state, checks the required organization role, and has default `PUBLIC`, `anon`, and `service_role` execution revoked. Only the explicitly listed RPC signatures are granted to `authenticated`.
- `app_private.bootstrap_owner_allowlist` intentionally has RLS enabled with no client policy. The schema and table have no API-role grants; only the guarded bootstrap function accesses it as definer. Administrators seed it through a trusted SQL/admin path, never with a publishable browser key.

## Apply and verify safely

Use a disposable local database or a Supabase development branch first. Do not run the self-test against production because it creates and rolls back Auth fixtures.

```powershell
supabase --help
supabase migration --help
supabase db --help
supabase start
supabase db reset
psql $env:LOCAL_DB_URL -v ON_ERROR_STOP=1 -f supabase/tests/rls.sql
supabase migration list --local
supabase db advisors --local --type all --fail-on warn
```

Before remote application:

1. Confirm `tfbiecbetxvxjksvptbx` is still the intended empty target and obtain a recoverable backup/branch.
   The generated local config currently uses PostgreSQL 17; compare it with `show server_version` on the target and adjust `db.major_version` before local parity testing if necessary.
2. Apply the migration to a disposable branch, run `tests/rls.sql`, and run current security/performance advisors.
3. Confirm all `rpc_*` `SECURITY DEFINER` functions show an empty `search_path`, `anon` has no execute/table privileges, and authenticated roles have SELECT-only table grants.
4. Verify the initial Auth owner UUID and add it to the private allowlist manually.
5. Test owner/editor/viewer/non-member/anon behavior with separate sessions, including stale state/entity versions, last-owner protection, duplicate run IDs, duplicate imports, and cross-organization references.
6. Only then apply the exact reviewed migration to the remote project. Re-check migration history and advisors after application.

Clean migration/advisor gate for the linked target (the dry run is read-only; omit `db push` without `--dry-run` until explicit approval):

```powershell
supabase link --project-ref tfbiecbetxvxjksvptbx
supabase migration list --linked
supabase db push --linked --dry-run --skip-vault
supabase db advisors --linked --type all --fail-on warn
```

After the reviewed migration has actually been applied and advisors pass, regenerate committed database types from the remote schema and review the diff before committing:

```powershell
supabase gen types --project-id tfbiecbetxvxjksvptbx --schema public --lang typescript > src/cloud/database.types.ts
```

Do not generate the types before migration application: that would describe the old empty remote schema.

## Publishable/anon API smoke test

Run this only against a disposable local/branch URL with its publishable key. Never paste a service-role or secret key into the browser or command history.

```powershell
$headers = @{ apikey = $env:SUPABASE_PUBLISHABLE_KEY; Authorization = "Bearer $($env:SUPABASE_PUBLISHABLE_KEY)" }
Invoke-WebRequest -Method Get -Uri "$env:SUPABASE_URL/rest/v1/organizations?select=*" -Headers $headers -SkipHttpErrorCheck
Invoke-WebRequest -Method Post -Uri "$env:SUPABASE_URL/rest/v1/rpc/rpc_list_my_organizations" -Headers ($headers + @{ 'Content-Type' = 'application/json' }) -Body '{}' -SkipHttpErrorCheck
Invoke-WebRequest -Method Post -Uri "$env:SUPABASE_URL/rest/v1/entity_records" -Headers ($headers + @{ 'Content-Type' = 'application/json'; Prefer = 'return=representation' }) -Body '{"entity_type":"task"}' -SkipHttpErrorCheck
```

Expected: table read/write and RPC execution are denied for `anon` (HTTP 401/403 with PostgREST permission/RLS errors), and no row is created. Repeat the same checks with authenticated owner/editor/viewer/non-member JWTs according to `tests/rls.sql`; do not treat HTTP 200 plus an unexpected empty body as proof of a successful write.

Supabase's 2026 Data API default no longer guarantees automatic exposure for new tables. This migration therefore grants authenticated `SELECT` and RPC `EXECUTE` explicitly, while keeping all DML and all `anon` access revoked.
