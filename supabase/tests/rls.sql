-- Run against a disposable/local Supabase database after applying migrations:
--   psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls.sql
-- Everything below is rolled back. Do not point this file at production.

begin;

create extension if not exists pgtap with schema extensions;

select extensions.plan(1);

do $$
declare
  v_table text;
  v_function regprocedure;
  v_rls_function regprocedure;
begin
  foreach v_table in array array[
    'organizations', 'organization_memberships', 'entity_records',
    'entity_record_links', 'import_manifests', 'mutation_runs', 'server_audit_events'
  ] loop
    if not exists (
      select 1 from pg_catalog.pg_class as c
      join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = v_table and c.relrowsecurity
    ) then
      raise exception 'RLS is not enabled on public.%', v_table;
    end if;
    if pg_catalog.has_table_privilege('anon', format('public.%I', v_table), 'SELECT')
       or pg_catalog.has_table_privilege('anon', format('public.%I', v_table), 'INSERT')
       or pg_catalog.has_table_privilege('anon', format('public.%I', v_table), 'UPDATE')
       or pg_catalog.has_table_privilege('anon', format('public.%I', v_table), 'DELETE') then
      raise exception 'anon unexpectedly has a privilege on public.%', v_table;
    end if;
    if not pg_catalog.has_table_privilege('authenticated', format('public.%I', v_table), 'SELECT')
       or pg_catalog.has_table_privilege('authenticated', format('public.%I', v_table), 'INSERT')
       or pg_catalog.has_table_privilege('authenticated', format('public.%I', v_table), 'UPDATE')
       or pg_catalog.has_table_privilege('authenticated', format('public.%I', v_table), 'DELETE') then
      raise exception 'authenticated table grants are wrong on public.%', v_table;
    end if;
    if pg_catalog.has_table_privilege('service_role', format('public.%I', v_table), 'INSERT')
       or pg_catalog.has_table_privilege('service_role', format('public.%I', v_table), 'UPDATE')
       or pg_catalog.has_table_privilege('service_role', format('public.%I', v_table), 'DELETE') then
      raise exception 'service_role unexpectedly has direct business DML on public.%', v_table;
    end if;
  end loop;

  foreach v_function in array array[
    'public.rpc_bootstrap_organization(text,text,uuid)'::regprocedure,
    'public.rpc_list_my_organizations()'::regprocedure,
    'public.rpc_read_snapshot(uuid)'::regprocedure,
    'public.rpc_apply_changes(uuid,bigint,jsonb,uuid)'::regprocedure,
    'public.rpc_save_weekly(uuid,bigint,jsonb,uuid)'::regprocedure,
    'public.rpc_import_v4(uuid,bigint,uuid,text,text,text,bigint,integer,jsonb)'::regprocedure,
    'public.rpc_list_memberships(uuid)'::regprocedure,
    'public.rpc_manage_membership(uuid,uuid,text,text,bigint,bigint,uuid)'::regprocedure
  ] loop
    if pg_catalog.has_function_privilege('anon', v_function, 'EXECUTE') then
      raise exception 'anon can execute %', v_function;
    end if;
    if not pg_catalog.has_function_privilege('authenticated', v_function, 'EXECUTE') then
      raise exception 'authenticated cannot execute %', v_function;
    end if;
    if pg_catalog.has_function_privilege('service_role', v_function, 'EXECUTE') then
      raise exception 'service_role can unexpectedly execute %', v_function;
    end if;
  end loop;

  if exists (
    select 1
    from pg_catalog.pg_proc as p
    join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
    where p.prosecdef
      and n.nspname in ('public', 'app_private')
      and (p.proname like 'rpc\_%' escape '\' or n.nspname = 'app_private')
      and not exists (
        select 1 from unnest(coalesce(p.proconfig, array[]::text[])) as setting(value)
        where setting.value in ('search_path=', 'search_path=""')
      )
  ) then
    raise exception 'a SECURITY DEFINER function is missing an empty search_path';
  end if;

  v_rls_function := pg_catalog.to_regprocedure('public.rls_auto_enable()');
  if v_rls_function is not null and (
    pg_catalog.has_function_privilege('anon', v_rls_function, 'EXECUTE')
    or pg_catalog.has_function_privilege('authenticated', v_rls_function, 'EXECUTE')
  ) then
    raise exception 'rls_auto_enable remains executable by an API role';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc as p
    join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
    where n.nspname = 'app_private'
      and p.proname in (
        'validate_task_result_payload', 'validate_task_result_record',
        'validate_task_result_payload_without_checklist',
        'task_result_has_visible_text',
        'validate_entity_payload', 'validate_entity_payload_v4_legacy'
      )
      and (
        pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
        or pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
        or pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE')
      )
  ) then
    raise exception 'a task-result validator is executable by an API role';
  end if;
end;
$$;

-- Transactional fixture users. These are intentionally fake and disappear at ROLLBACK.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000001',
   'authenticated', 'authenticated', 'nexus-owner-1@example.invalid', '', clock_timestamp(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, clock_timestamp(), clock_timestamp()),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000002',
   'authenticated', 'authenticated', 'nexus-owner-2@example.invalid', '', clock_timestamp(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, clock_timestamp(), clock_timestamp()),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000003',
   'authenticated', 'authenticated', 'nexus-nonmember@example.invalid', '', clock_timestamp(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, clock_timestamp(), clock_timestamp()),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000004',
   'authenticated', 'authenticated', 'nexus-fixture-owner@example.invalid', '', clock_timestamp(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, clock_timestamp(), clock_timestamp());

insert into app_private.bootstrap_owner_allowlist (user_id, allowed_by)
values
  ('10000000-0000-0000-0000-000000000001', 'local SQL self-test'),
  ('10000000-0000-0000-0000-000000000002', 'local SQL self-test'),
  ('10000000-0000-0000-0000-000000000003', 'local SQL self-test'),
  ('10000000-0000-0000-0000-000000000004', 'local SQL self-test');

-- Transaction-local payload builder for task_result boundary tests.
create function public.nexus_test_task_result_payload(
  p_task_id text,
  p_href text default 'https://example.invalid:65535/results/P0-01'
)
returns jsonb
language sql
immutable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'id', 'task-result:' || p_task_id,
    'taskId', p_task_id,
    'resultBody', 'Completed result body',
    'verificationState', '確認中',
    'verificationSummary', 'Verification is in progress.',
    'deliverables', jsonb_build_array(jsonb_build_object(
      'id', repeat('d', 100),
      'title', 'Result sheet',
      'type', 'google-sheets',
      'href', p_href,
      'accessState', '利用可能',
      'lastCheckedAt', '2026-08-17T00:00:00.000Z'
    )),
    'nextStep', 'Independent review',
    'completionCriteria', 'Reviewer confirms every row.',
    'verificationMemo', 'No unresolved fixture issues.',
    'updatedAt', '2026-08-17T00:00:00.000Z'
  );
$$;

revoke all on function public.nexus_test_task_result_payload(text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.nexus_test_task_result_payload(text, text)
  to authenticated;

set local role authenticated;
select pg_catalog.set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select pg_catalog.set_config(
  'nexus.test.org1',
  public.rpc_bootstrap_organization(
    'NEXUS Test One', 'nexus-test-one', '20000000-0000-0000-0000-000000000001'
  )->>'organizationId',
  true
);

-- Create one entity, then replay the identical run with a stale expected state.
select public.rpc_apply_changes(
  pg_catalog.current_setting('nexus.test.org1')::uuid,
  0,
  jsonb_build_array(jsonb_build_object(
    'op', 'upsert', 'entityType', 'task', 'entityId', 'T-TEST', 'expectedVersion', 0,
    'payload', jsonb_build_object(
      'id', 'T-TEST', 'title', 'Test task', 'phase', 0, 'teamId', 'ops-hq',
      'team', 'Ops', 'rawTeam', 'Ops', 'owner', 'Owner', 'assignees', '[]'::jsonb,
      'rawAssignees', '', 'personKeys', '[]'::jsonb, 'urgency', 'medium',
      'deadline', 'later', 'status', 'not-started', 'holdReason', '',
      'dependencies', '[]'::jsonb, 'notes', '[]'::jsonb, 'sourceRefs', '[]'::jsonb,
      'updatedAt', '2026-08-17T00:00:00.000Z'
    ),
    'ordinal', 0, 'references', '[]'::jsonb
  )),
  '20000000-0000-0000-0000-000000000002'
);

do $$
declare v_result jsonb;
begin
  v_result := public.rpc_apply_changes(
    pg_catalog.current_setting('nexus.test.org1')::uuid,
    0,
    jsonb_build_array(jsonb_build_object(
      'op', 'upsert', 'entityType', 'task', 'entityId', 'T-TEST', 'expectedVersion', 0,
      'payload', jsonb_build_object(
        'id', 'T-TEST', 'title', 'Test task', 'phase', 0, 'teamId', 'ops-hq',
        'team', 'Ops', 'rawTeam', 'Ops', 'owner', 'Owner', 'assignees', '[]'::jsonb,
        'rawAssignees', '', 'personKeys', '[]'::jsonb, 'urgency', 'medium',
        'deadline', 'later', 'status', 'not-started', 'holdReason', '',
        'dependencies', '[]'::jsonb, 'notes', '[]'::jsonb, 'sourceRefs', '[]'::jsonb,
        'updatedAt', '2026-08-17T00:00:00.000Z'
      ),
      'ordinal', 0, 'references', '[]'::jsonb
    )),
    '20000000-0000-0000-0000-000000000002'
  );
  if v_result->>'idempotent' <> 'true' then raise exception 'run replay was not idempotent'; end if;
end;
$$;

-- A new run with a stale state version must conflict without overwriting data.
do $$
begin
  perform public.rpc_apply_changes(
    pg_catalog.current_setting('nexus.test.org1')::uuid,
    0,
    jsonb_build_array(jsonb_build_object(
      'op', 'upsert', 'entityType', 'task', 'entityId', 'T-TEST', 'expectedVersion', 1,
      'payload', jsonb_build_object(
        'id', 'T-TEST', 'title', 'Test task', 'phase', 0, 'teamId', 'ops-hq',
        'team', 'Ops', 'rawTeam', 'Ops', 'owner', 'Owner', 'assignees', '[]'::jsonb,
        'rawAssignees', '', 'personKeys', '[]'::jsonb, 'urgency', 'medium',
        'deadline', 'later', 'status', 'done', 'holdReason', '',
        'dependencies', '[]'::jsonb, 'notes', '[]'::jsonb, 'sourceRefs', '[]'::jsonb,
        'updatedAt', '2026-08-17T00:01:00.000Z'
      )
    )),
    '20000000-0000-0000-0000-000000000003'
  );
  raise exception 'expected a state conflict';
exception when serialization_failure then null;
end;
$$;

-- Add the second user as viewer.
select public.rpc_manage_membership(
  pg_catalog.current_setting('nexus.test.org1')::uuid,
  '10000000-0000-0000-0000-000000000002', 'viewer', 'upsert',
  1, 0,
  '20000000-0000-0000-0000-000000000004'
);

do $$
declare v_memberships jsonb;
begin
  v_memberships := public.rpc_list_memberships(pg_catalog.current_setting('nexus.test.org1')::uuid);
  if jsonb_array_length(v_memberships) <> 2
     or not exists (
       select 1 from jsonb_array_elements(v_memberships) as member(value)
       where member.value->>'userId' = '10000000-0000-0000-0000-000000000002'
         and member.value->>'role' = 'viewer'
         and member.value->>'version' = '1'
     ) then
    raise exception 'owner membership list/version is incorrect';
  end if;
end;
$$;

-- A viewer can read but cannot write through a privileged RPC.
select pg_catalog.set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
do $$
begin
  if public.rpc_read_snapshot(pg_catalog.current_setting('nexus.test.org1')::uuid)->>'role' <> 'viewer' then
    raise exception 'viewer read failed';
  end if;
  begin
    perform public.rpc_apply_changes(
      pg_catalog.current_setting('nexus.test.org1')::uuid,
      2, jsonb_build_array(jsonb_build_object(
        'op', 'upsert', 'entityType', 'task', 'entityId', 'VIEWER-WRITE',
        'expectedVersion', 0, 'payload', '{}'::jsonb
      )), '20000000-0000-0000-0000-000000000005'
    );
    raise exception 'viewer write unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
end;
$$;

-- The same user can bootstrap its independently allowlisted organization.
select pg_catalog.set_config(
  'nexus.test.org2',
  public.rpc_bootstrap_organization(
    'NEXUS Test Two', 'nexus-test-two', '20000000-0000-0000-0000-000000000006'
  )->>'organizationId',
  true
);
select public.rpc_import_v4(
  pg_catalog.current_setting('nexus.test.org2')::uuid,
  0,
  '20000000-0000-0000-0000-000000000007',
  '0000000000000000000000000000000000000000000000000000000000000000',
  'test-semantic-import-v4',
  'local SQL self-test', 128, 1,
  jsonb_build_array(jsonb_build_object(
    'op', 'upsert', 'entityType', 'flow_node', 'entityId', 'OTHER-NODE',
    'expectedVersion', 0, 'payload', jsonb_build_object(
      'id', 'OTHER-NODE', 'position', jsonb_build_object('x', 0, 'y', 0),
      'data', '{}'::jsonb
    )
  ))
);

-- The same semantic import under a new run ID does not create duplicate entities
-- or a second manifest and does not advance organization state.
do $$
declare v_result jsonb; v_snapshot jsonb;
begin
  v_result := public.rpc_import_v4(
    pg_catalog.current_setting('nexus.test.org2')::uuid,
    1,
    '20000000-0000-0000-0000-000000000008',
    '0000000000000000000000000000000000000000000000000000000000000000',
    'test-semantic-import-v4',
    'local SQL self-test', 128, 1,
    jsonb_build_array(jsonb_build_object(
      'op', 'upsert', 'entityType', 'flow_node', 'entityId', 'OTHER-NODE',
      'expectedVersion', 0, 'payload', jsonb_build_object(
        'id', 'OTHER-NODE', 'position', jsonb_build_object('x', 0, 'y', 0),
        'data', '{}'::jsonb
      )
    ))
  );
  v_snapshot := public.rpc_read_snapshot(pg_catalog.current_setting('nexus.test.org2')::uuid);
  if v_result->>'idempotent' <> 'true'
     or v_snapshot->'organization'->>'stateVersion' <> '1'
     or v_snapshot->'importState'->>'manifestCount' <> '1' then
    raise exception 'semantic import idempotency failed';
  end if;
end;
$$;

-- Weekly changes use the same OCC engine but are committed as one restricted batch.
select pg_catalog.set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select public.rpc_save_weekly(
  pg_catalog.current_setting('nexus.test.org1')::uuid,
  2,
  jsonb_build_array(
    jsonb_build_object(
      'op', 'upsert', 'entityType', 'weekly_meta', 'entityId', 'singleton',
      'expectedVersion', 0,
      'payload', jsonb_build_object('id', 'singleton', 'lastRunId', null)
    ),
    jsonb_build_object(
      'op', 'upsert', 'entityType', 'client_audit', 'entityId', 'weekly-audit:test',
      'expectedVersion', 0,
      'payload', jsonb_build_object(
        'id', 'weekly-audit:test', 'issueId', 'OP-WEEKLY-TEST',
        'classification', 'persistence', 'targetVersion', '0.4.0',
        'files', '[]'::jsonb, 'before', 'before', 'after', 'after',
        'evidence', '[]'::jsonb, 'retest', 'self-test', 'residualRisk', 'none',
        'round', 1, 'at', '2026-08-17T00:00:00.000Z',
        'action', 'weekly test', 'detail', 'atomic client audit'
      )
    )
  ),
  '20000000-0000-0000-0000-000000000009'
);

-- Exact weekly retry is idempotent; a different run with the stale state loses.
do $$
declare v_result jsonb;
begin
  v_result := public.rpc_save_weekly(
    pg_catalog.current_setting('nexus.test.org1')::uuid,
    2,
    jsonb_build_array(
      jsonb_build_object(
        'op', 'upsert', 'entityType', 'weekly_meta', 'entityId', 'singleton',
        'expectedVersion', 0,
        'payload', jsonb_build_object('id', 'singleton', 'lastRunId', null)
      ),
      jsonb_build_object(
        'op', 'upsert', 'entityType', 'client_audit', 'entityId', 'weekly-audit:test',
        'expectedVersion', 0,
        'payload', jsonb_build_object(
          'id', 'weekly-audit:test', 'issueId', 'OP-WEEKLY-TEST',
          'classification', 'persistence', 'targetVersion', '0.4.0',
          'files', '[]'::jsonb, 'before', 'before', 'after', 'after',
          'evidence', '[]'::jsonb, 'retest', 'self-test', 'residualRisk', 'none',
          'round', 1, 'at', '2026-08-17T00:00:00.000Z',
          'action', 'weekly test', 'detail', 'atomic client audit'
        )
      )
    ),
    '20000000-0000-0000-0000-000000000009'
  );
  if v_result->>'idempotent' <> 'true' then raise exception 'weekly replay was not idempotent'; end if;
  begin
    perform public.rpc_save_weekly(
      pg_catalog.current_setting('nexus.test.org1')::uuid,
      2,
      jsonb_build_array(jsonb_build_object(
        'op', 'upsert', 'entityType', 'weekly_meta', 'entityId', 'singleton',
        'expectedVersion', 1,
        'payload', jsonb_build_object('id', 'singleton', 'lastRunId', null)
      )),
      '20000000-0000-0000-0000-000000000012'
    );
    raise exception 'stale weekly run unexpectedly succeeded';
  exception when serialization_failure then null;
  end;
end;
$$;

-- A target that exists only in another organization is still unresolved because
-- link foreign keys include organization_id.
do $$
declare v_state bigint;
begin
  v_state := (public.rpc_read_snapshot(pg_catalog.current_setting('nexus.test.org1')::uuid)
              ->'organization'->>'stateVersion')::bigint;
  begin
    perform public.rpc_apply_changes(
      pg_catalog.current_setting('nexus.test.org1')::uuid,
      v_state,
      jsonb_build_array(
        jsonb_build_object(
          'op', 'upsert', 'entityType', 'flow_node', 'entityId', 'LOCAL-NODE',
          'expectedVersion', 0, 'payload', jsonb_build_object(
            'id', 'LOCAL-NODE', 'position', jsonb_build_object('x', 0, 'y', 0),
            'data', '{}'::jsonb
          )
        ),
        jsonb_build_object(
          'op', 'upsert', 'entityType', 'flow_edge', 'entityId', 'CROSS-ORG',
          'expectedVersion', 0,
          'payload', jsonb_build_object(
            'id', 'CROSS-ORG', 'source', 'LOCAL-NODE', 'target', 'OTHER-NODE'
          ),
          'references', jsonb_build_array(
            jsonb_build_object(
              'kind', 'source', 'entityType', 'flow_node', 'entityId', 'LOCAL-NODE'
            ),
            jsonb_build_object(
              'kind', 'target', 'entityType', 'flow_node', 'entityId', 'OTHER-NODE'
            )
          )
        )
      ),
      '20000000-0000-0000-0000-000000000010'
    );
    raise exception 'cross-organization reference unexpectedly succeeded';
  exception when foreign_key_violation then null;
  end;
end;
$$;

-- The last owner guard is enforced in the database, not just in the UI/RPC.
do $$
declare v_state bigint;
begin
  v_state := (public.rpc_read_snapshot(pg_catalog.current_setting('nexus.test.org1')::uuid)
              ->'organization'->>'stateVersion')::bigint;
  perform public.rpc_manage_membership(
    pg_catalog.current_setting('nexus.test.org1')::uuid,
    '10000000-0000-0000-0000-000000000001', null, 'remove',
    v_state, 1,
    '20000000-0000-0000-0000-000000000011'
  );
  raise exception 'last owner removal unexpectedly succeeded';
exception when check_violation then null;
end;
$$;

-- Membership OCC prevents a later owner action from overwriting a newer role.
select public.rpc_manage_membership(
  pg_catalog.current_setting('nexus.test.org1')::uuid,
  '10000000-0000-0000-0000-000000000002', 'editor', 'upsert',
  3, 1, '20000000-0000-0000-0000-000000000013'
);
do $$
begin
  perform public.rpc_manage_membership(
    pg_catalog.current_setting('nexus.test.org1')::uuid,
    '10000000-0000-0000-0000-000000000002', 'owner', 'upsert',
    4, 1, '20000000-0000-0000-0000-000000000014'
  );
  raise exception 'stale membership update unexpectedly succeeded';
exception when serialization_failure then null;
end;
$$;

-- Editor business DML succeeds, while membership administration remains owner-only.
select pg_catalog.set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select public.rpc_apply_changes(
  pg_catalog.current_setting('nexus.test.org1')::uuid,
  4,
  jsonb_build_array(jsonb_build_object(
    'op', 'upsert', 'entityType', 'task', 'entityId', 'EDITOR-OK', 'expectedVersion', 0,
    'payload', jsonb_build_object(
      'id', 'EDITOR-OK', 'title', 'Editor task', 'phase', 0, 'teamId', 'ops-hq',
      'team', 'Ops', 'rawTeam', 'Ops', 'owner', 'Editor', 'assignees', '[]'::jsonb,
      'rawAssignees', '', 'personKeys', '[]'::jsonb, 'urgency', 'medium',
      'deadline', 'later', 'status', 'not-started', 'holdReason', '',
      'dependencies', '[]'::jsonb, 'notes', '[]'::jsonb, 'sourceRefs', '[]'::jsonb,
      'updatedAt', '2026-08-17T00:02:00.000Z'
    )
  )),
  '20000000-0000-0000-0000-000000000015'
);
do $$
begin
  perform public.rpc_manage_membership(
    pg_catalog.current_setting('nexus.test.org1')::uuid,
    '10000000-0000-0000-0000-000000000003', 'viewer', 'upsert',
    5, 0, '20000000-0000-0000-0000-000000000016'
  );
  raise exception 'editor membership administration unexpectedly succeeded';
exception when insufficient_privilege then null;
end;
$$;

-- Two-session equivalent: both actors read state 5; the first commit wins and
-- the second actor's stale write cannot overwrite it.
select public.rpc_apply_changes(
  pg_catalog.current_setting('nexus.test.org1')::uuid,
  5,
  jsonb_build_array(jsonb_build_object(
    'op', 'upsert', 'entityType', 'task', 'entityId', 'EDITOR-OK', 'expectedVersion', 1,
    'payload', jsonb_build_object(
      'id', 'EDITOR-OK', 'title', 'Editor task', 'phase', 0, 'teamId', 'ops-hq',
      'team', 'Ops', 'rawTeam', 'Ops', 'owner', 'Editor', 'assignees', '[]'::jsonb,
      'rawAssignees', '', 'personKeys', '[]'::jsonb, 'urgency', 'medium',
      'deadline', 'later', 'status', 'in-progress', 'holdReason', '',
      'dependencies', '[]'::jsonb, 'notes', '[]'::jsonb, 'sourceRefs', '[]'::jsonb,
      'updatedAt', '2026-08-17T00:03:00.000Z'
    )
  )),
  '20000000-0000-0000-0000-000000000017'
);
select pg_catalog.set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
do $$
begin
  perform public.rpc_apply_changes(
    pg_catalog.current_setting('nexus.test.org1')::uuid,
    5,
    jsonb_build_array(jsonb_build_object(
      'op', 'upsert', 'entityType', 'task', 'entityId', 'T-TEST', 'expectedVersion', 1,
      'payload', jsonb_build_object(
        'id', 'T-TEST', 'title', 'Stale owner write', 'phase', 0, 'teamId', 'ops-hq',
        'team', 'Ops', 'rawTeam', 'Ops', 'owner', 'Owner', 'assignees', '[]'::jsonb,
        'rawAssignees', '', 'personKeys', '[]'::jsonb, 'urgency', 'medium',
        'deadline', 'later', 'status', 'done', 'holdReason', '',
        'dependencies', '[]'::jsonb, 'notes', '[]'::jsonb, 'sourceRefs', '[]'::jsonb,
        'updatedAt', '2026-08-17T00:04:00.000Z'
      )
    )),
    '20000000-0000-0000-0000-000000000018'
  );
  raise exception 'second session stale write unexpectedly succeeded';
exception when serialization_failure then null;
end;
$$;

-- Malformed payloads are rejected at the RPC boundary without state change.
do $$
declare v_before bigint; v_after bigint;
begin
  v_before := (public.rpc_read_snapshot(pg_catalog.current_setting('nexus.test.org1')::uuid)
               ->'organization'->>'stateVersion')::bigint;
  begin
    perform public.rpc_apply_changes(
      pg_catalog.current_setting('nexus.test.org1')::uuid,
      v_before,
      jsonb_build_array(jsonb_build_object(
        'op', 'upsert', 'entityType', 'task', 'entityId', 'MALFORMED',
        'expectedVersion', 0, 'payload', jsonb_build_object('id', 'WRONG-ID')
      )),
      '20000000-0000-0000-0000-000000000019'
    );
    raise exception 'malformed payload unexpectedly succeeded';
  exception when invalid_parameter_value then null;
  end;
  v_after := (public.rpc_read_snapshot(pg_catalog.current_setting('nexus.test.org1')::uuid)
              ->'organization'->>'stateVersion')::bigint;
  if v_after <> v_before then raise exception 'malformed payload changed state'; end if;
end;
$$;

-- A late failure inside a weekly batch rolls back earlier entity/audit inserts.
select pg_catalog.set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
do $$
declare v_before bigint; v_after bigint; v_snapshot jsonb;
begin
  v_before := (public.rpc_read_snapshot(pg_catalog.current_setting('nexus.test.org1')::uuid)
               ->'organization'->>'stateVersion')::bigint;
  begin
    perform public.rpc_save_weekly(
      pg_catalog.current_setting('nexus.test.org1')::uuid,
      v_before,
      jsonb_build_array(
        jsonb_build_object(
          'op', 'upsert', 'entityType', 'flow_node', 'entityId', 'ROLLBACK-NODE',
          'expectedVersion', 0, 'payload', jsonb_build_object(
            'id', 'ROLLBACK-NODE', 'position', jsonb_build_object('x', 1, 'y', 1),
            'data', '{}'::jsonb
          )
        ),
        jsonb_build_object(
          'op', 'upsert', 'entityType', 'client_audit', 'entityId', 'ROLLBACK-AUDIT',
          'expectedVersion', 0, 'payload', jsonb_build_object(
            'id', 'ROLLBACK-AUDIT', 'issueId', 'ROLLBACK', 'classification', 'persistence',
            'targetVersion', '0.4.0', 'files', '[]'::jsonb, 'before', 'before',
            'after', 'after', 'evidence', '[]'::jsonb, 'retest', 'self-test',
            'residualRisk', 'none', 'round', 1, 'at', '2026-08-17T00:05:00.000Z',
            'action', 'rollback', 'detail', 'must roll back'
          )
        ),
        jsonb_build_object(
          'op', 'upsert', 'entityType', 'flow_edge', 'entityId', 'ROLLBACK-EDGE',
          'expectedVersion', 0,
          'payload', jsonb_build_object(
            'id', 'ROLLBACK-EDGE', 'source', 'ROLLBACK-NODE', 'target', 'MISSING-NODE'
          ),
          'references', jsonb_build_array(
            jsonb_build_object('kind', 'source', 'entityType', 'flow_node', 'entityId', 'ROLLBACK-NODE'),
            jsonb_build_object('kind', 'target', 'entityType', 'flow_node', 'entityId', 'MISSING-NODE')
          )
        )
      ),
      '20000000-0000-0000-0000-000000000020'
    );
    raise exception 'faulting weekly batch unexpectedly succeeded';
  exception when foreign_key_violation then null;
  end;
  v_snapshot := public.rpc_read_snapshot(pg_catalog.current_setting('nexus.test.org1')::uuid);
  v_after := (v_snapshot->'organization'->>'stateVersion')::bigint;
  if v_after <> v_before or exists (
    select 1 from jsonb_array_elements(v_snapshot->'entities') as entity(value)
    where entity.value->>'entityId' in ('ROLLBACK-NODE', 'ROLLBACK-AUDIT', 'ROLLBACK-EDGE')
  ) then
    raise exception 'weekly intermediate failure was not atomic';
  end if;
end;
$$;

-- Owner removes the editor using both state and membership OCC tokens.
select pg_catalog.set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select public.rpc_manage_membership(
  pg_catalog.current_setting('nexus.test.org1')::uuid,
  '10000000-0000-0000-0000-000000000002', null, 'remove',
  6, 2, '20000000-0000-0000-0000-000000000021'
);

-- A removed member immediately loses both read and write access.
select pg_catalog.set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
do $$
begin
  begin
    perform public.rpc_read_snapshot(pg_catalog.current_setting('nexus.test.org1')::uuid);
    raise exception 'removed member read unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.rpc_apply_changes(
      pg_catalog.current_setting('nexus.test.org1')::uuid,
      7, jsonb_build_array(jsonb_build_object(
        'op', 'delete', 'entityType', 'task', 'entityId', 'EDITOR-OK', 'expectedVersion', 2
      )), '20000000-0000-0000-0000-000000000022'
    );
    raise exception 'removed member write unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
end;
$$;

-- Import is atomic on an intermediate FK failure, and a second competing import
-- cannot populate a non-empty organization.
select pg_catalog.set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
select pg_catalog.set_config(
  'nexus.test.org3',
  public.rpc_bootstrap_organization(
    'NEXUS Test Three', 'nexus-test-three', '20000000-0000-0000-0000-000000000023'
  )->>'organizationId',
  true
);
do $$
declare v_snapshot jsonb;
begin
  begin
    perform public.rpc_import_v4(
      pg_catalog.current_setting('nexus.test.org3')::uuid,
      0, '20000000-0000-0000-0000-000000000024',
      '1111111111111111111111111111111111111111111111111111111111111111',
      'faulting-import', 'local SQL self-test', 256, 2,
      jsonb_build_array(
        jsonb_build_object(
          'op', 'upsert', 'entityType', 'flow_node', 'entityId', 'IMPORT-NODE',
          'expectedVersion', 0, 'payload', jsonb_build_object(
            'id', 'IMPORT-NODE', 'position', jsonb_build_object('x', 0, 'y', 0),
            'data', '{}'::jsonb
          )
        ),
        jsonb_build_object(
          'op', 'upsert', 'entityType', 'flow_edge', 'entityId', 'IMPORT-EDGE',
          'expectedVersion', 0,
          'payload', jsonb_build_object(
            'id', 'IMPORT-EDGE', 'source', 'IMPORT-NODE', 'target', 'MISSING-NODE'
          ),
          'references', jsonb_build_array(
            jsonb_build_object('kind', 'source', 'entityType', 'flow_node', 'entityId', 'IMPORT-NODE'),
            jsonb_build_object('kind', 'target', 'entityType', 'flow_node', 'entityId', 'MISSING-NODE')
          )
        )
      )
    );
    raise exception 'faulting import unexpectedly succeeded';
  exception when foreign_key_violation then null;
  end;
  v_snapshot := public.rpc_read_snapshot(pg_catalog.current_setting('nexus.test.org3')::uuid);
  if v_snapshot->'organization'->>'stateVersion' <> '0'
     or v_snapshot->'importState'->>'status' <> 'empty'
     or jsonb_array_length(v_snapshot->'entities') <> 0 then
    raise exception 'faulting import left partial data';
  end if;
end;
$$;

select public.rpc_import_v4(
  pg_catalog.current_setting('nexus.test.org3')::uuid,
  0, '20000000-0000-0000-0000-000000000025',
  '2222222222222222222222222222222222222222222222222222222222222222',
  'winning-import', 'local SQL self-test', 128, 1,
  jsonb_build_array(jsonb_build_object(
    'op', 'upsert', 'entityType', 'flow_node', 'entityId', 'IMPORT-NODE',
    'expectedVersion', 0, 'payload', jsonb_build_object(
      'id', 'IMPORT-NODE', 'position', jsonb_build_object('x', 0, 'y', 0),
      'data', '{}'::jsonb
    )
  ))
);
do $$
declare v_snapshot jsonb;
begin
  begin
    perform public.rpc_import_v4(
      pg_catalog.current_setting('nexus.test.org3')::uuid,
      0, '20000000-0000-0000-0000-000000000026',
      '3333333333333333333333333333333333333333333333333333333333333333',
      'losing-import', 'local SQL self-test', 128, 1,
      jsonb_build_array(jsonb_build_object(
        'op', 'upsert', 'entityType', 'flow_node', 'entityId', 'OTHER-IMPORT-NODE',
        'expectedVersion', 0, 'payload', jsonb_build_object(
          'id', 'OTHER-IMPORT-NODE', 'position', jsonb_build_object('x', 1, 'y', 1),
          'data', '{}'::jsonb
        )
      ))
    );
    raise exception 'competing second import unexpectedly succeeded';
  exception when object_not_in_prerequisite_state then null;
  end;
  v_snapshot := public.rpc_read_snapshot(pg_catalog.current_setting('nexus.test.org3')::uuid);
  if v_snapshot->'organization'->>'stateVersion' <> '1'
     or v_snapshot->'importState'->>'manifestCount' <> '1'
     or jsonb_array_length(v_snapshot->'entities') <> 1 then
    raise exception 'competing import changed winning snapshot';
  end if;
end;
$$;

-- A schema-v4 fixture matching initial and weekly frontend shapes exercises every
-- entity type, including all payload envelopes and payload-derived references.
-- The completion sticky deliberately repeats the same task link because the
-- frontend shape exposes both data.taskIds[] and data.taskId.
select pg_catalog.set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000004', true);
select pg_catalog.set_config(
  'nexus.test.org4',
  public.rpc_bootstrap_organization(
    'NEXUS Entity Fixture', 'nexus-entity-fixture', '20000000-0000-0000-0000-000000000027'
  )->>'organizationId',
  true
);
do $$
declare
  v_entities jsonb;
  v_snapshot jsonb;
begin
  v_entities := jsonb_build_array(
    jsonb_build_object(
      'op', 'upsert', 'entityType', 'task', 'entityId', 'P0-01', 'expectedVersion', 0,
      'payload', jsonb_build_object(
        'id', 'P0-01', 'title', 'Canonical fixture task', 'phase', 0,
        'teamId', 'ops-hq', 'team', 'Operations HQ', 'rawTeam', 'Operations HQ',
        'owner', 'Owner', 'assignees', jsonb_build_array('Owner'),
        'rawAssignees', 'Owner', 'personKeys', jsonb_build_array('Owner'),
        'urgency', 'high', 'deadline', '2026-08-31', 'deadlineDate', '2026-08-31',
        'status', 'not-started', 'holdReason', '', 'dependencies', '[]'::jsonb,
        'notes', jsonb_build_array('fixture'),
        'sourceRefs', jsonb_build_array(jsonb_build_object(
          'sourceId', 'S4', 'fileName', 'source.xlsx', 'sha256', repeat('a', 64),
          'lineStart', 1, 'lineEnd', 1, 'asOf', '2026-08-17', 'confidence', 'high'
        )),
        'updatedAt', '2026-08-17T00:00:00.000Z'
      ),
      'ordinal', 0, 'references', '[]'::jsonb
    ),
    jsonb_build_object(
      'op', 'upsert', 'entityType', 'kpi', 'entityId', 'concurrent', 'expectedVersion', 0,
      'payload', jsonb_build_object(
        'id', 'concurrent', 'label', 'Concurrent viewers', 'target', 5000,
        'unit', 'people', 'actual', null
      ),
      'ordinal', 0, 'references', '[]'::jsonb
    ),
    jsonb_build_object(
      'op', 'upsert', 'entityType', 'weekly_run', 'entityId', 'weekly:2026-W33',
      'expectedVersion', 0,
      'payload', jsonb_build_object(
        'id', 'weekly:2026-W33', 'runId', 'weekly:2026-W33',
        'scheduledFor', '2026-08-17T00:00:00+09:00',
        'ranAt', '2026-08-17T00:01:00+09:00', 'trigger', 'manual',
        'missedWeekCount', 0, 'addedStickyCount', 2, 'autoTaskCount', 1,
        'outcome', 'success', 'reasons', jsonb_build_array('fixture'),
        'snapshot', jsonb_build_object(
          'completed', 1, 'total', 2,
          'phaseProgress', jsonb_build_object(
            '0', jsonb_build_object('completed', 1, 'total', 2, 'rate', 0.5)
          ),
          'highUrgencyRemaining', 1, 'blockers', 0,
          'kpis', jsonb_build_array(jsonb_build_object(
            'id', 'concurrent', 'label', 'Concurrent viewers', 'target', 5000,
            'unit', 'people', 'actual', null
          ))
        )
      ),
      'ordinal', 0, 'references', '[]'::jsonb
    ),
    jsonb_build_object(
      'op', 'upsert', 'entityType', 'task', 'entityId', 'AUTO-2026-W33-01',
      'expectedVersion', 0,
      'payload', jsonb_build_object(
        'id', 'AUTO-2026-W33-01', 'title', 'Automatic fixture task', 'phase', 0,
        'teamId', 'ops-hq', 'team', 'Operations HQ', 'rawTeam', 'Operations HQ',
        'owner', 'Owner', 'assignees', jsonb_build_array('Owner'),
        'rawAssignees', 'Owner', 'personKeys', jsonb_build_array('Owner'),
        'urgency', 'high', 'deadline', '2026-08-31', 'status', 'not-started',
        'holdReason', '', 'dependencies', jsonb_build_array('P0-01'),
        'notes', '[]'::jsonb, 'sourceRefs', '[]'::jsonb,
        'updatedAt', '2026-08-17T00:01:00.000Z', 'reason', 'fixture',
        'expectedDeliverable', 'verified fixture',
        'createdBy', 'esports_progress_control',
        'createdByDepartment', 'esports_progress_control',
        'createdRunId', 'weekly:2026-W33',
        'provenance', jsonb_build_object(
          'ruleId', 'fixture-rule', 'sourceTaskId', 'P0-01',
          'dependencyIds', jsonb_build_array('P0-01'), 'kpiId', 'concurrent'
        ),
        'fingerprint', 'progress-control:fixture',
        'rationaleCodes', jsonb_build_array('FIXTURE'),
        'approvalState', 'review-required', 'automationDisabled', false
      ),
      'ordinal', 1, 'semanticFingerprint', 'progress-control:fixture',
      'references', jsonb_build_array(
        jsonb_build_object('kind', 'dependency', 'entityType', 'task', 'entityId', 'P0-01'),
        jsonb_build_object('kind', 'created_run', 'entityType', 'weekly_run', 'entityId', 'weekly:2026-W33'),
        jsonb_build_object('kind', 'provenance_source', 'entityType', 'task', 'entityId', 'P0-01'),
        jsonb_build_object('kind', 'provenance_dependency', 'entityType', 'task', 'entityId', 'P0-01'),
        jsonb_build_object('kind', 'provenance_kpi', 'entityType', 'kpi', 'entityId', 'concurrent')
      )
    ),
    jsonb_build_object(
      'op', 'upsert', 'entityType', 'flow_node', 'entityId', 'phase-0',
      'expectedVersion', 0,
      'payload', jsonb_build_object(
        'id', 'phase-0', 'position', jsonb_build_object('x', 40, 'y', 100),
        'data', jsonb_build_object(
          'label', 'Phase 0', 'taskIds', jsonb_build_array('P0-01')
        )
      ),
      'ordinal', 0,
      'references', jsonb_build_array(
        jsonb_build_object('kind', 'task', 'entityType', 'task', 'entityId', 'P0-01')
      )
    ),
    jsonb_build_object(
      'op', 'upsert', 'entityType', 'flow_node', 'entityId', 'weekly-complete:P0-01',
      'expectedVersion', 0,
      'payload', jsonb_build_object(
        'id', 'weekly-complete:P0-01', 'position', jsonb_build_object('x', 80, 'y', 140),
        'className', 'weekly-sticky weekly-complete',
        'data', jsonb_build_object(
          'weeklyKind', 'completion', 'label', 'Completed P0-01',
          'taskIds', jsonb_build_array('P0-01'), 'taskId', 'P0-01',
          'firstSeen', '2026-08-17T00:00:00.000Z',
          'lastConfirmed', '2026-08-17T00:01:00.000Z',
          'completedWeek', '2026-W33', 'basis', 'status-change',
          'currentStatus', 'done'
        )
      ),
      'ordinal', 1,
      'references', jsonb_build_array(
        jsonb_build_object('kind', 'task', 'entityType', 'task', 'entityId', 'P0-01'),
        jsonb_build_object('kind', 'task', 'entityType', 'task', 'entityId', 'P0-01')
      )
    ),
    jsonb_build_object(
      'op', 'upsert', 'entityType', 'flow_node',
      'entityId', 'weekly-summary:weekly:2026-W33', 'expectedVersion', 0,
      'payload', jsonb_build_object(
        'id', 'weekly-summary:weekly:2026-W33',
        'position', jsonb_build_object('x', 120, 'y', 180),
        'className', 'weekly-sticky weekly-summary',
        'data', jsonb_build_object(
          'weeklyKind', 'summary', 'runId', 'weekly:2026-W33',
          'scheduledFor', '2026-08-17T00:00:00+09:00',
          'snapshot', jsonb_build_object('completed', 1, 'total', 2),
          'taskIds', '[]'::jsonb, 'label', 'Weekly summary'
        )
      ),
      'ordinal', 2,
      'references', jsonb_build_array(
        jsonb_build_object('kind', 'weekly_run', 'entityType', 'weekly_run', 'entityId', 'weekly:2026-W33')
      )
    ),
    jsonb_build_object(
      'op', 'upsert', 'entityType', 'flow_edge', 'entityId', 'plan-e1',
      'expectedVersion', 0,
      'payload', jsonb_build_object(
        'id', 'plan-e1', 'source', 'phase-0', 'target', 'weekly-summary:weekly:2026-W33'
      ),
      'ordinal', 0,
      'references', jsonb_build_array(
        jsonb_build_object('kind', 'source', 'entityType', 'flow_node', 'entityId', 'phase-0'),
        jsonb_build_object('kind', 'target', 'entityType', 'flow_node', 'entityId', 'weekly-summary:weekly:2026-W33')
      )
    ),
    jsonb_build_object(
      'op', 'upsert', 'entityType', 'flow_viewport', 'entityId', 'singleton',
      'expectedVersion', 0,
      'payload', jsonb_build_object('id', 'singleton', 'x', 0, 'y', 0, 'zoom', 1),
      'ordinal', 0, 'references', '[]'::jsonb
    ),
    jsonb_build_object(
      'op', 'upsert', 'entityType', 'client_audit',
      'entityId', 'weekly-audit:weekly:2026-W33', 'expectedVersion', 0,
      'payload', jsonb_build_object(
        'id', 'weekly-audit:weekly:2026-W33', 'issueId', 'OP-WEEKLY-RUN',
        'classification', 'persistence', 'targetVersion', '0.4.0',
        'files', jsonb_build_array('src/weekly.ts'), 'before', 'before', 'after', 'after',
        'evidence', jsonb_build_array('schema v4 fixture'), 'retest', 'full validation',
        'residualRisk', 'none', 'round', 4, 'at', '2026-08-17T00:01:00.000Z',
        'action', 'weekly run', 'detail', 'fixture audit'
      ),
      'ordinal', 0, 'references', '[]'::jsonb
    ),
    jsonb_build_object(
      'op', 'upsert', 'entityType', 'report_baseline', 'entityId', 'singleton',
      'expectedVersion', 0,
      'payload', jsonb_build_object(
        'id', 'singleton',
        'value', jsonb_build_object(
          'savedAt', '2026-08-17T00:00:00.000Z',
          'statuses', jsonb_build_object(
            'P0-01', jsonb_build_object(
              'status', 'not-started', 'updatedAt', '2026-08-17T00:00:00.000Z'
            )
          )
        )
      ),
      'ordinal', 0, 'references', '[]'::jsonb
    ),
    jsonb_build_object(
      'op', 'upsert', 'entityType', 'migration_archive',
      'entityId', '3:2026-08-17T00:00:00.000Z', 'expectedVersion', 0,
      'payload', jsonb_build_object(
        'id', '3:2026-08-17T00:00:00.000Z', 'fromSchema', 3,
        'migratedAt', '2026-08-17T00:00:00.000Z', 'reason', 'schema v4 fixture',
        'tasks', jsonb_build_array(jsonb_build_object('id', 'legacy-task'))
      ),
      'ordinal', 0, 'references', '[]'::jsonb
    ),
    jsonb_build_object(
      'op', 'upsert', 'entityType', 'weekly_completion', 'entityId', 'P0-01',
      'expectedVersion', 0,
      'payload', jsonb_build_object(
        'id', 'P0-01', 'taskId', 'P0-01',
        'firstSeen', '2026-08-17T00:00:00.000Z',
        'lastConfirmed', '2026-08-17T00:01:00.000Z',
        'completedWeek', '2026-W33', 'basis', 'status-change', 'currentStatus', 'done'
      ),
      'ordinal', 0,
      'references', jsonb_build_array(
        jsonb_build_object('kind', 'task', 'entityType', 'task', 'entityId', 'P0-01')
      )
    ),
    jsonb_build_object(
      'op', 'upsert', 'entityType', 'weekly_tombstone',
      'entityId', 'progress-control:fixture', 'expectedVersion', 0,
      'payload', jsonb_build_object(
        'id', 'progress-control:fixture', 'fingerprint', 'progress-control:fixture'
      ),
      'ordinal', 0, 'references', '[]'::jsonb
    ),
    jsonb_build_object(
      'op', 'upsert', 'entityType', 'weekly_meta', 'entityId', 'singleton',
      'expectedVersion', 0,
      'payload', jsonb_build_object(
        'id', 'singleton', 'lastRunId', 'weekly:2026-W33'
      ),
      'ordinal', 0,
      'references', jsonb_build_array(
        jsonb_build_object('kind', 'last_run', 'entityType', 'weekly_run', 'entityId', 'weekly:2026-W33')
      )
    )
  );

  perform public.rpc_import_v4(
    pg_catalog.current_setting('nexus.test.org4')::uuid,
    0, '20000000-0000-0000-0000-000000000028',
    repeat('4', 64), 'all-entity-shapes-v4', 'local SQL shape fixture',
    4096, jsonb_array_length(v_entities), v_entities
  );

  v_snapshot := public.rpc_read_snapshot(pg_catalog.current_setting('nexus.test.org4')::uuid);
  if v_snapshot->'organization'->>'stateVersion' <> '1'
     or jsonb_array_length(v_snapshot->'entities') <> 15
     or (
       select count(distinct entity.value->>'entityType')
       from jsonb_array_elements(v_snapshot->'entities') as entity(value)
     ) <> 12
     or exists (
       select 1 from jsonb_array_elements(v_snapshot->'entities') as entity(value)
       where entity.value->'payload'->>'id' <> entity.value->>'entityId'
     ) then
    raise exception 'all-entity schema-v4 fixture did not round-trip';
  end if;

  if (
    select count(*) from public.entity_record_links as link
    where link.organization_id = pg_catalog.current_setting('nexus.test.org4')::uuid
      and link.from_entity_type = 'flow_node'
      and link.from_entity_id = 'weekly-complete:P0-01'
      and link.link_kind = 'task'
      and link.to_entity_type = 'task'
      and link.to_entity_id = 'P0-01'
  ) <> 1 then
    raise exception 'duplicate frontend task references were not normalized';
  end if;
end;
$$;

-- A valid task result is stored with one same-organization task link.
select public.rpc_apply_changes(
  pg_catalog.current_setting('nexus.test.org4')::uuid,
  1,
  jsonb_build_array(jsonb_build_object(
    'op', 'upsert', 'entityType', 'task_result',
    'entityId', 'task-result:P0-01', 'expectedVersion', 0,
    'payload', public.nexus_test_task_result_payload('P0-01'),
    'ordinal', 0,
    'references', jsonb_build_array(jsonb_build_object(
      'kind', 'task', 'entityType', 'task', 'entityId', 'P0-01'
    ))
  )),
  '20000000-0000-0000-0000-000000000029'
);

do $$
declare
  v_result jsonb;
  v_snapshot jsonb;
begin
  -- The identical run is replay-safe even though the state token is now stale.
  v_result := public.rpc_apply_changes(
    pg_catalog.current_setting('nexus.test.org4')::uuid,
    1,
    jsonb_build_array(jsonb_build_object(
      'op', 'upsert', 'entityType', 'task_result',
      'entityId', 'task-result:P0-01', 'expectedVersion', 0,
      'payload', public.nexus_test_task_result_payload('P0-01'),
      'ordinal', 0,
      'references', jsonb_build_array(jsonb_build_object(
        'kind', 'task', 'entityType', 'task', 'entityId', 'P0-01'
      ))
    )),
    '20000000-0000-0000-0000-000000000029'
  );
  if v_result->>'idempotent' <> 'true' then
    raise exception 'task result run replay was not idempotent';
  end if;

  v_snapshot := public.rpc_read_snapshot(pg_catalog.current_setting('nexus.test.org4')::uuid);
  if v_snapshot->'organization'->>'stateVersion' <> '2'
     or not exists (
       select 1 from jsonb_array_elements(v_snapshot->'entities') as entity(value)
       where entity.value->>'entityType' = 'task_result'
         and entity.value->>'entityId' = 'task-result:P0-01'
         and entity.value->'payload'->>'taskId' = 'P0-01'
         and entity.value->>'version' = '1'
     )
     or (
       select count(*) from public.entity_record_links as link
       where link.organization_id = pg_catalog.current_setting('nexus.test.org4')::uuid
         and link.from_entity_type = 'task_result'
         and link.from_entity_id = 'task-result:P0-01'
         and link.link_kind = 'task'
         and link.to_entity_type = 'task'
         and link.to_entity_id = 'P0-01'
     ) <> 1 then
    raise exception 'task result did not round-trip with its task link';
  end if;
end;
$$;

-- Optional fields accept strings when present; canonical dotted-decimal IPv4,
-- port 1, and a 100-character deliverable ID are valid boundary values. The
-- sentinel rolls back this valid write so later OCC fixtures keep the same
-- state/version tokens.
do $$
declare
  v_payload jsonb;
begin
  v_payload := public.nexus_test_task_result_payload(
    'P0-01', 'https://127.0.0.1:1/result'
  );
  v_payload := jsonb_set(v_payload, '{verifiedBy}', to_jsonb('reviewer'::text));
  v_payload := jsonb_set(
    v_payload, '{verifiedAt}', to_jsonb('2026-08-17T00:00:00+09:00'::text)
  );
  v_payload := jsonb_set(v_payload, '{deliverables,0,note}', to_jsonb(''::text));
  v_payload := jsonb_set(
    v_payload, '{deliverables,0,lastCheckedAt}',
    to_jsonb('2026-08-17T00:00:00Z'::text)
  );
  begin
    perform public.rpc_apply_changes(
      pg_catalog.current_setting('nexus.test.org4')::uuid,
      2,
      jsonb_build_array(jsonb_build_object(
        'op', 'upsert', 'entityType', 'task_result',
        'entityId', 'task-result:P0-01', 'expectedVersion', 1,
        'payload', v_payload,
        'references', jsonb_build_array(jsonb_build_object(
          'kind', 'task', 'entityType', 'task', 'entityId', 'P0-01'
        ))
      )),
      gen_random_uuid()
    );
    raise exception using errcode = 'ZX001', message = 'rollback valid optional boundary fixture';
  exception when sqlstate 'ZX001' then null;
  end;
  if (public.rpc_read_snapshot(pg_catalog.current_setting('nexus.test.org4')::uuid)
      ->'organization'->>'stateVersion')::bigint <> 2 then
    raise exception 'valid optional boundary fixture was not rolled back';
  end if;
end;
$$;

-- The optional checklist uses the existing editor RPC and task link. This
-- successful write is rolled back locally so later OCC fixtures remain stable.
do $$
declare
  v_payload jsonb;
  v_item jsonb;
begin
  v_item := jsonb_build_object(
    'id','checklist:P0-01:1','title','contact stakeholder','status','完了',
    'acceptanceCriteria','reply is recorded','assignee','owner',
    'reviewer','reviewer','reviewedAt','2026-08-17T00:00:00Z',
    'evidenceMemo','message log checked','holdReason',''
  );
  v_payload := jsonb_set(
    public.nexus_test_task_result_payload('P0-01'),
    '{checklistItems}', jsonb_build_array(v_item)
  );
  begin
    perform public.rpc_apply_changes(
      pg_catalog.current_setting('nexus.test.org4')::uuid,
      2,
      jsonb_build_array(jsonb_build_object(
        'op','upsert','entityType','task_result',
        'entityId','task-result:P0-01','expectedVersion',1,
        'payload',v_payload,
        'references',jsonb_build_array(jsonb_build_object(
          'kind','task','entityType','task','entityId','P0-01'
        ))
      )),
      gen_random_uuid()
    );
    raise exception using errcode='ZX001',message='rollback valid checklist RPC fixture';
  exception when sqlstate 'ZX001' then null;
  end;
  if (public.rpc_read_snapshot(pg_catalog.current_setting('nexus.test.org4')::uuid)
      ->'organization'->>'stateVersion')::bigint <> 2 then
    raise exception 'valid checklist RPC fixture was not rolled back';
  end if;
end;
$$;

-- Checklist validation rejects unknown keys, whitespace/zero-width-only
-- required text, missing completion evidence, and missing hold reasons. The
-- preceding legacy payload RPC proves checklistItems remains optional.
do $$
declare
  v_base jsonb;
  v_item jsonb;
  v_variant jsonb;
  v_variants jsonb[];
  v_rejected boolean;
begin
  v_item := jsonb_build_object(
    'id','checklist:P0-01:1','title','item','status','完了',
    'acceptanceCriteria','criteria','assignee','owner','reviewer','reviewer',
    'reviewedAt','2026-08-17T00:00:00Z','evidenceMemo','evidence','holdReason',''
  );
  v_base := jsonb_set(
    public.nexus_test_task_result_payload('P0-01'),
    '{checklistItems}',jsonb_build_array(v_item)
  );
  v_variants := array[
    jsonb_set(v_base,'{checklistItems,0,unexpected}','true'::jsonb),
    jsonb_set(v_base,'{checklistItems,0,reviewer}',to_jsonb(E'\t' || chr(8203))),
    jsonb_set(v_base,'{checklistItems,0,reviewedAt}',to_jsonb(''::text)),
    jsonb_set(v_base,'{checklistItems,0,evidenceMemo}',to_jsonb(''::text)),
    jsonb_set(
      jsonb_set(v_base,'{checklistItems,0,status}',to_jsonb('保留'::text)),
      '{checklistItems,0,holdReason}',to_jsonb(E' \t' || chr(8203))
    )
  ];
  foreach v_variant in array v_variants loop
    v_rejected := false;
    begin
      perform public.rpc_apply_changes(
        pg_catalog.current_setting('nexus.test.org4')::uuid,
        2,
        jsonb_build_array(jsonb_build_object(
          'op','upsert','entityType','task_result',
          'entityId','task-result:P0-01','expectedVersion',1,
          'payload',v_variant,
          'references',jsonb_build_array(jsonb_build_object(
            'kind','task','entityType','task','entityId','P0-01'
          ))
        )),
        gen_random_uuid()
      );
    exception when invalid_parameter_value then v_rejected := true;
    end;
    if not v_rejected then
      raise exception 'invalid checklist payload unexpectedly passed: %',v_variant;
    end if;
  end loop;
  if (public.rpc_read_snapshot(pg_catalog.current_setting('nexus.test.org4')::uuid)
      ->'organization'->>'stateVersion')::bigint <> 2 then
    raise exception 'invalid checklist RPC changed organization state';
  end if;
end;
$$;

-- A different task-result run with a stale organization token loses OCC.
do $$
begin
  perform public.rpc_apply_changes(
    pg_catalog.current_setting('nexus.test.org4')::uuid,
    1,
    jsonb_build_array(jsonb_build_object(
      'op', 'upsert', 'entityType', 'task_result',
      'entityId', 'task-result:P0-01', 'expectedVersion', 1,
      'payload', jsonb_set(
        public.nexus_test_task_result_payload('P0-01'),
        '{verificationState}', to_jsonb('適合'::text)
      ),
      'references', jsonb_build_array(jsonb_build_object(
        'kind', 'task', 'entityType', 'task', 'entityId', 'P0-01'
      ))
    )),
    '20000000-0000-0000-0000-000000000030'
  );
  raise exception 'stale task result write unexpectedly succeeded';
exception when serialization_failure then null;
end;
$$;

-- Unsafe or non-HTTPS deliverable URLs are rejected before any state change.
do $$
declare
  v_href text;
  v_before bigint;
  v_after bigint;
begin
  v_before := (public.rpc_read_snapshot(pg_catalog.current_setting('nexus.test.org4')::uuid)
               ->'organization'->>'stateVersion')::bigint;
  foreach v_href in array array[
    'http://example.invalid/result',
    'javascript:alert(1)',
    'data:text/plain,hello',
    'file:///tmp/result.xlsx',
    'vbscript:msgbox(1)',
    '//example.invalid/result',
    'https://user:pass@example.invalid/result',
    'https://example.invalid:0/result',
    'https://example.invalid:65536/result',
    'https://[::1]/result',
    'https://[::::]/result',
    'https://例え.invalid/result',
    'https://example..invalid/result',
    'https://-example.invalid/result',
    'https://example-.invalid/result',
    'https://.example.invalid/result',
    'https://example.invalid./result',
    'https://256.0.0.1/result',
    'https://127.00.0.1/result',
    'https://127.0.0/result',
    'https://' || repeat('9', 63) || '/result',
    'https://' || repeat('a', 64) || '.invalid/result',
    E'https://example.invalid\\result',
    'https://example.invalid/result with-space',
    E'https://example.invalid/result\nnext',
    'https://example.invalid/' || repeat('x', 2030)
  ] loop
    begin
      perform public.rpc_apply_changes(
        pg_catalog.current_setting('nexus.test.org4')::uuid,
        v_before,
        jsonb_build_array(jsonb_build_object(
          'op', 'upsert', 'entityType', 'task_result',
          'entityId', 'task-result:P0-01', 'expectedVersion', 1,
          'payload', public.nexus_test_task_result_payload('P0-01', v_href),
          'references', jsonb_build_array(jsonb_build_object(
            'kind', 'task', 'entityType', 'task', 'entityId', 'P0-01'
          ))
        )),
        gen_random_uuid()
      );
      raise exception 'unsafe task result href unexpectedly succeeded: %', v_href;
    exception when invalid_parameter_value then null;
    end;
  end loop;
  v_after := (public.rpc_read_snapshot(pg_catalog.current_setting('nexus.test.org4')::uuid)
              ->'organization'->>'stateVersion')::bigint;
  if v_after <> v_before then
    raise exception 'unsafe href validation changed organization state';
  end if;
end;
$$;

-- Payload, field, collection, and deliverable-ID limits are enforced strictly.
do $$
declare
  v_base jsonb := public.nexus_test_task_result_payload('P0-01');
  v_payload jsonb;
  v_payloads jsonb[];
  v_many_deliverables jsonb;
  v_before bigint;
  v_after bigint;
begin
  select jsonb_agg(jsonb_build_object(
    'id', 'deliverable-' || item::text,
    'title', 'Result ' || item::text,
    'type', 'file',
    'accessState', '未確認'
  ))
  into v_many_deliverables
  from generate_series(1, 33) as item;

  v_payloads := array[
    jsonb_set(v_base, '{resultBody}', to_jsonb(repeat('x', 10001))),
    jsonb_set(v_base, '{verificationSummary}', to_jsonb(repeat('x', 4001))),
    jsonb_set(v_base, '{nextStep}', to_jsonb(repeat('x', 4001))),
    jsonb_set(v_base, '{completionCriteria}', to_jsonb(repeat('x', 4001))),
    jsonb_set(v_base, '{verificationMemo}', to_jsonb(repeat('x', 10001))),
    jsonb_set(v_base, '{verifiedBy}', to_jsonb(repeat('x', 201))),
    jsonb_set(v_base, '{deliverables,0,id}', to_jsonb(repeat('x', 101))),
    jsonb_set(v_base, '{deliverables,0,title}', to_jsonb(repeat('x', 201))),
    jsonb_set(v_base, '{deliverables,0,note}', to_jsonb(repeat('x', 1001))),
    v_base #- '{deliverables,0,href}',
    jsonb_set(v_base, '{deliverables,0,href}', 'null'::jsonb),
    jsonb_set(v_base, '{verifiedBy}', 'null'::jsonb),
    jsonb_set(v_base, '{verifiedAt}', 'null'::jsonb),
    jsonb_set(v_base, '{deliverables,0,note}', 'null'::jsonb),
    jsonb_set(v_base, '{deliverables,0,lastCheckedAt}', 'null'::jsonb),
    jsonb_set(v_base, '{updatedAt}', to_jsonb('2026-08-17T00:00Z'::text)),
    jsonb_set(v_base, '{verifiedAt}', to_jsonb('not-an-iso-timestamp'::text)),
    jsonb_set(v_base, '{deliverables,0,lastCheckedAt}', to_jsonb('2026-08-17'::text)),
    jsonb_set(v_base, '{deliverables}', v_many_deliverables),
    jsonb_set(v_base, '{deliverables}', jsonb_build_array(
      jsonb_build_object(
        'id', 'duplicate', 'title', 'First', 'type', 'other',
        'href', 'https://example.invalid/first', 'accessState', '未確認'
      ),
      jsonb_build_object(
        'id', 'duplicate', 'title', 'Second', 'type', 'other',
        'href', 'https://example.invalid/second', 'accessState', '未確認'
      )
    ))
  ];

  v_before := (public.rpc_read_snapshot(pg_catalog.current_setting('nexus.test.org4')::uuid)
               ->'organization'->>'stateVersion')::bigint;
  foreach v_payload in array v_payloads loop
    begin
      perform public.rpc_apply_changes(
        pg_catalog.current_setting('nexus.test.org4')::uuid,
        v_before,
        jsonb_build_array(jsonb_build_object(
          'op', 'upsert', 'entityType', 'task_result',
          'entityId', 'task-result:P0-01', 'expectedVersion', 1,
          'payload', v_payload,
          'references', jsonb_build_array(jsonb_build_object(
            'kind', 'task', 'entityType', 'task', 'entityId', 'P0-01'
          ))
        )),
        gen_random_uuid()
      );
      raise exception 'invalid task result payload unexpectedly succeeded';
    exception when invalid_parameter_value then null;
    end;
  end loop;
  v_after := (public.rpc_read_snapshot(pg_catalog.current_setting('nexus.test.org4')::uuid)
              ->'organization'->>'stateVersion')::bigint;
  if v_after <> v_before then
    raise exception 'task result limit validation changed organization state';
  end if;
end;
$$;

-- Missing and cross-organization task references fail through the composite FK.
do $$
declare
  v_task_id text;
  v_before bigint;
  v_after bigint;
begin
  v_before := (public.rpc_read_snapshot(pg_catalog.current_setting('nexus.test.org4')::uuid)
               ->'organization'->>'stateVersion')::bigint;
  begin
    perform public.rpc_apply_changes(
      pg_catalog.current_setting('nexus.test.org4')::uuid,
      v_before,
      jsonb_build_array(jsonb_build_object(
        'op', 'upsert', 'entityType', 'task_result',
        'entityId', 'task-result:P0-01', 'expectedVersion', 1,
        'payload', public.nexus_test_task_result_payload('P0-01'),
        'references', '[]'::jsonb
      )),
      gen_random_uuid()
    );
    raise exception 'undeclared task result link unexpectedly succeeded';
  exception when invalid_parameter_value then null;
  end;
  foreach v_task_id in array array['MISSING-TASK', 'T-TEST'] loop
    begin
      perform public.rpc_apply_changes(
        pg_catalog.current_setting('nexus.test.org4')::uuid,
        v_before,
        jsonb_build_array(jsonb_build_object(
          'op', 'upsert', 'entityType', 'task_result',
          'entityId', 'task-result:' || v_task_id, 'expectedVersion', 0,
          'payload', public.nexus_test_task_result_payload(v_task_id),
          'references', jsonb_build_array(jsonb_build_object(
            'kind', 'task', 'entityType', 'task', 'entityId', v_task_id
          ))
        )),
        gen_random_uuid()
      );
      raise exception 'unresolved task result reference unexpectedly succeeded: %', v_task_id;
    exception when foreign_key_violation then null;
    end;
  end loop;
  v_after := (public.rpc_read_snapshot(pg_catalog.current_setting('nexus.test.org4')::uuid)
              ->'organization'->>'stateVersion')::bigint;
  if v_after <> v_before then
    raise exception 'unresolved task result reference changed organization state';
  end if;
end;
$$;

-- A late missing-task link rolls back earlier valid task-result work in the batch.
do $$
declare
  v_before bigint;
  v_after bigint;
  v_snapshot jsonb;
begin
  v_before := (public.rpc_read_snapshot(pg_catalog.current_setting('nexus.test.org4')::uuid)
               ->'organization'->>'stateVersion')::bigint;
  begin
    perform public.rpc_apply_changes(
      pg_catalog.current_setting('nexus.test.org4')::uuid,
      v_before,
      jsonb_build_array(
        jsonb_build_object(
          'op', 'upsert', 'entityType', 'task_result',
          'entityId', 'task-result:AUTO-2026-W33-01', 'expectedVersion', 0,
          'payload', public.nexus_test_task_result_payload('AUTO-2026-W33-01'),
          'references', jsonb_build_array(jsonb_build_object(
            'kind', 'task', 'entityType', 'task', 'entityId', 'AUTO-2026-W33-01'
          ))
        ),
        jsonb_build_object(
          'op', 'upsert', 'entityType', 'task_result',
          'entityId', 'task-result:MISSING-LATE', 'expectedVersion', 0,
          'payload', public.nexus_test_task_result_payload('MISSING-LATE'),
          'references', jsonb_build_array(jsonb_build_object(
            'kind', 'task', 'entityType', 'task', 'entityId', 'MISSING-LATE'
          ))
        )
      ),
      '20000000-0000-0000-0000-000000000031'
    );
    raise exception 'faulting task result batch unexpectedly succeeded';
  exception when foreign_key_violation then null;
  end;

  v_snapshot := public.rpc_read_snapshot(pg_catalog.current_setting('nexus.test.org4')::uuid);
  v_after := (v_snapshot->'organization'->>'stateVersion')::bigint;
  if v_after <> v_before or exists (
    select 1 from jsonb_array_elements(v_snapshot->'entities') as entity(value)
    where entity.value->>'entityId' in (
      'task-result:AUTO-2026-W33-01', 'task-result:MISSING-LATE'
    )
  ) then
    raise exception 'task result batch failure was not atomic';
  end if;
end;
$$;

-- Managed task flow data resolves through explicit same-organization task links.
-- A sentinel exception rolls back the otherwise-valid node/edge update.
do $$
declare
  v_before bigint;
  v_snapshot jsonb;
begin
  v_before := (public.rpc_read_snapshot(pg_catalog.current_setting('nexus.test.org4')::uuid)
               ->'organization'->>'stateVersion')::bigint;
  begin
    perform public.rpc_apply_changes(
      pg_catalog.current_setting('nexus.test.org4')::uuid,
      v_before,
      jsonb_build_array(
        jsonb_build_object(
          'op', 'upsert', 'entityType', 'flow_node',
          'entityId', 'weekly-complete:P0-01', 'expectedVersion', 1,
          'payload', jsonb_build_object(
            'id', 'weekly-complete:P0-01',
            'position', jsonb_build_object('x', 80, 'y', 140),
            'data', jsonb_build_object(
              'label', 'Managed task node', 'targetType', 'task',
              'targetId', 'P0-01', 'taskId', 'P0-01',
              'taskIds', jsonb_build_array('P0-01')
            )
          ),
          'references', jsonb_build_array(jsonb_build_object(
            'kind', 'task', 'entityType', 'task', 'entityId', 'P0-01'
          ))
        ),
        jsonb_build_object(
          'op', 'upsert', 'entityType', 'flow_edge',
          'entityId', 'plan-e1', 'expectedVersion', 1,
          'payload', jsonb_build_object(
            'id', 'plan-e1', 'source', 'phase-0',
            'target', 'weekly-summary:weekly:2026-W33',
            'data', jsonb_build_object(
              'targetType', 'task', 'targetId', 'P0-01', 'taskId', 'P0-01'
            )
          ),
          'references', jsonb_build_array(
            jsonb_build_object(
              'kind', 'source', 'entityType', 'flow_node', 'entityId', 'phase-0'
            ),
            jsonb_build_object(
              'kind', 'target', 'entityType', 'flow_node',
              'entityId', 'weekly-summary:weekly:2026-W33'
            ),
            jsonb_build_object(
              'kind', 'task', 'entityType', 'task', 'entityId', 'P0-01'
            )
          )
        )
      ),
      gen_random_uuid()
    );
    raise exception using errcode = 'ZX001',
      message = 'rollback valid managed-flow fixture';
  exception when sqlstate 'ZX001' then null;
  end;

  v_snapshot := public.rpc_read_snapshot(pg_catalog.current_setting('nexus.test.org4')::uuid);
  if (v_snapshot->'organization'->>'stateVersion')::bigint <> v_before
     or exists (
       select 1
       from jsonb_array_elements(v_snapshot->'entities') as entity(value)
       where entity.value->>'entityType' in ('flow_node', 'flow_edge')
         and entity.value->>'entityId' in ('weekly-complete:P0-01', 'plan-e1')
         and entity.value->'payload'->'data'->>'targetType' = 'task'
     ) then
    raise exception 'valid managed-flow sentinel was not rolled back';
  end if;
end;
$$;

-- Missing, inconsistent, undeclared, and cross-organization task targets are
-- rejected without changing the organization state.
do $$
declare
  v_change jsonb;
  v_cases jsonb[];
  v_before bigint;
  v_after bigint;
begin
  v_before := (public.rpc_read_snapshot(pg_catalog.current_setting('nexus.test.org4')::uuid)
               ->'organization'->>'stateVersion')::bigint;
  v_cases := array[
    jsonb_build_object(
      'op', 'upsert', 'entityType', 'flow_node',
      'entityId', 'weekly-complete:P0-01', 'expectedVersion', 1,
      'payload', jsonb_build_object(
        'id', 'weekly-complete:P0-01',
        'position', jsonb_build_object('x', 80, 'y', 140),
        'data', jsonb_build_object(
          'targetType', 'task', 'taskId', 'P0-01',
          'taskIds', jsonb_build_array('P0-01')
        )
      ),
      'references', jsonb_build_array(jsonb_build_object(
        'kind', 'task', 'entityType', 'task', 'entityId', 'P0-01'
      ))
    ),
    jsonb_build_object(
      'op', 'upsert', 'entityType', 'flow_node',
      'entityId', 'weekly-complete:P0-01', 'expectedVersion', 1,
      'payload', jsonb_build_object(
        'id', 'weekly-complete:P0-01',
        'position', jsonb_build_object('x', 80, 'y', 140),
        'data', jsonb_build_object(
          'targetType', 'task', 'targetId', 'P0-01',
          'taskIds', jsonb_build_array('P0-01')
        )
      ),
      'references', jsonb_build_array(jsonb_build_object(
        'kind', 'task', 'entityType', 'task', 'entityId', 'P0-01'
      ))
    ),
    jsonb_build_object(
      'op', 'upsert', 'entityType', 'flow_node',
      'entityId', 'weekly-complete:P0-01', 'expectedVersion', 1,
      'payload', jsonb_build_object(
        'id', 'weekly-complete:P0-01',
        'position', jsonb_build_object('x', 80, 'y', 140),
        'data', jsonb_build_object(
          'targetType', 'task', 'targetId', 'P0-01', 'taskId', 'P0-01'
        )
      ),
      'references', jsonb_build_array(jsonb_build_object(
        'kind', 'task', 'entityType', 'task', 'entityId', 'P0-01'
      ))
    ),
    jsonb_build_object(
      'op', 'upsert', 'entityType', 'flow_node',
      'entityId', 'weekly-complete:P0-01', 'expectedVersion', 1,
      'payload', jsonb_build_object(
        'id', 'weekly-complete:P0-01',
        'position', jsonb_build_object('x', 80, 'y', 140),
        'data', jsonb_build_object(
          'targetType', 'task', 'targetId', 'P0-01',
          'taskId', 'AUTO-2026-W33-01',
          'taskIds', jsonb_build_array('P0-01', 'AUTO-2026-W33-01')
        )
      ),
      'references', jsonb_build_array(
        jsonb_build_object(
          'kind', 'task', 'entityType', 'task', 'entityId', 'P0-01'
        ),
        jsonb_build_object(
          'kind', 'task', 'entityType', 'task', 'entityId', 'AUTO-2026-W33-01'
        )
      )
    ),
    jsonb_build_object(
      'op', 'upsert', 'entityType', 'flow_edge',
      'entityId', 'plan-e1', 'expectedVersion', 1,
      'payload', jsonb_build_object(
        'id', 'plan-e1', 'source', 'phase-0',
        'target', 'weekly-summary:weekly:2026-W33',
        'data', jsonb_build_object(
          'targetType', 'task', 'targetId', 'P0-01', 'taskId', 'P0-01'
        )
      ),
      'references', jsonb_build_array(
        jsonb_build_object(
          'kind', 'source', 'entityType', 'flow_node', 'entityId', 'phase-0'
        ),
        jsonb_build_object(
          'kind', 'target', 'entityType', 'flow_node',
          'entityId', 'weekly-summary:weekly:2026-W33'
        )
      )
    ),
    jsonb_build_object(
      'op', 'upsert', 'entityType', 'flow_node',
      'entityId', 'weekly-complete:P0-01', 'expectedVersion', 1,
      'payload', jsonb_build_object(
        'id', 'weekly-complete:P0-01',
        'position', jsonb_build_object('x', 80, 'y', 140),
        'data', jsonb_build_object(
          'targetType', 'task', 'targetId', 'T-TEST', 'taskId', 'T-TEST',
          'taskIds', jsonb_build_array('T-TEST')
        )
      ),
      'references', jsonb_build_array(jsonb_build_object(
        'kind', 'task', 'entityType', 'task', 'entityId', 'T-TEST'
      ))
    ),
    jsonb_build_object(
      'op', 'upsert', 'entityType', 'flow_node',
      'entityId', 'weekly-complete:P0-01', 'expectedVersion', 1,
      'payload', jsonb_build_object(
        'id', 'weekly-complete:P0-01',
        'position', jsonb_build_object('x', 80, 'y', 140),
        'data', jsonb_build_object(
          'targetType', 'task', 'targetId', 'P0-01', 'taskId', 'P0-01',
          'taskIds', jsonb_build_array('P0-01', 'T-TEST')
        )
      ),
      'references', jsonb_build_array(
        jsonb_build_object(
          'kind', 'task', 'entityType', 'task', 'entityId', 'P0-01'
        ),
        jsonb_build_object(
          'kind', 'task', 'entityType', 'task', 'entityId', 'T-TEST'
        )
      )
    )
  ];

  foreach v_change in array v_cases loop
    begin
      perform public.rpc_apply_changes(
        pg_catalog.current_setting('nexus.test.org4')::uuid,
        v_before, jsonb_build_array(v_change), gen_random_uuid()
      );
      raise exception 'invalid managed-flow task reference unexpectedly succeeded';
    exception
      when invalid_parameter_value or foreign_key_violation then null;
    end;
  end loop;

  v_after := (public.rpc_read_snapshot(pg_catalog.current_setting('nexus.test.org4')::uuid)
              ->'organization'->>'stateVersion')::bigint;
  if v_after <> v_before then
    raise exception 'managed-flow reference validation changed organization state';
  end if;
end;
$$;

-- A late cross-organization flow link rolls back an earlier valid managed-node
-- rewrite in the same batch.
do $$
declare
  v_before bigint;
  v_snapshot jsonb;
begin
  v_before := (public.rpc_read_snapshot(pg_catalog.current_setting('nexus.test.org4')::uuid)
               ->'organization'->>'stateVersion')::bigint;
  begin
    perform public.rpc_apply_changes(
      pg_catalog.current_setting('nexus.test.org4')::uuid,
      v_before,
      jsonb_build_array(
        jsonb_build_object(
          'op', 'upsert', 'entityType', 'flow_node',
          'entityId', 'weekly-complete:P0-01', 'expectedVersion', 1,
          'payload', jsonb_build_object(
            'id', 'weekly-complete:P0-01',
            'position', jsonb_build_object('x', 80, 'y', 140),
            'data', jsonb_build_object(
              'targetType', 'task', 'targetId', 'P0-01', 'taskId', 'P0-01',
              'taskIds', jsonb_build_array('P0-01')
            )
          ),
          'references', jsonb_build_array(jsonb_build_object(
            'kind', 'task', 'entityType', 'task', 'entityId', 'P0-01'
          ))
        ),
        jsonb_build_object(
          'op', 'upsert', 'entityType', 'flow_node',
          'entityId', 'cross-org-managed', 'expectedVersion', 0,
          'payload', jsonb_build_object(
            'id', 'cross-org-managed',
            'position', jsonb_build_object('x', 0, 'y', 0),
            'data', jsonb_build_object(
              'targetType', 'task', 'targetId', 'T-TEST', 'taskId', 'T-TEST',
              'taskIds', jsonb_build_array('T-TEST')
            )
          ),
          'references', jsonb_build_array(jsonb_build_object(
            'kind', 'task', 'entityType', 'task', 'entityId', 'T-TEST'
          ))
        )
      ),
      gen_random_uuid()
    );
    raise exception 'faulting managed-flow batch unexpectedly succeeded';
  exception when foreign_key_violation then null;
  end;

  v_snapshot := public.rpc_read_snapshot(pg_catalog.current_setting('nexus.test.org4')::uuid);
  if (v_snapshot->'organization'->>'stateVersion')::bigint <> v_before
     or exists (
       select 1
       from jsonb_array_elements(v_snapshot->'entities') as entity(value)
       where entity.value->>'entityId' = 'cross-org-managed'
          or (
            entity.value->>'entityId' = 'weekly-complete:P0-01'
            and entity.value->'payload'->'data'->>'targetType' = 'task'
          )
     ) then
    raise exception 'managed-flow batch failure was not atomic';
  end if;
end;
$$;

-- Viewer membership permits reads but never task-result writes.
select public.rpc_manage_membership(
  pg_catalog.current_setting('nexus.test.org4')::uuid,
  '10000000-0000-0000-0000-000000000002', 'viewer', 'upsert',
  2, 0, '20000000-0000-0000-0000-000000000032'
);
select pg_catalog.set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
do $$
begin
  if public.rpc_read_snapshot(pg_catalog.current_setting('nexus.test.org4')::uuid)->>'role' <> 'viewer' then
    raise exception 'task result viewer read failed';
  end if;
  begin
    perform public.rpc_apply_changes(
      pg_catalog.current_setting('nexus.test.org4')::uuid,
      3,
      jsonb_build_array(jsonb_build_object(
        'op', 'upsert', 'entityType', 'task_result',
        'entityId', 'task-result:P0-01', 'expectedVersion', 1,
        'payload', public.nexus_test_task_result_payload('P0-01'),
        'references', jsonb_build_array(jsonb_build_object(
          'kind', 'task', 'entityType', 'task', 'entityId', 'P0-01'
        ))
      )),
      '20000000-0000-0000-0000-000000000033'
    );
    raise exception 'viewer task result write unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
end;
$$;

-- A validly authenticated non-member cannot read the organization.
select pg_catalog.set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
do $$
begin
  perform public.rpc_read_snapshot(pg_catalog.current_setting('nexus.test.org1')::uuid);
  raise exception 'non-member read unexpectedly succeeded';
exception when insufficient_privilege then null;
end;
$$;

-- Authenticated API roles cannot forge or delete server audit rows directly.
do $$
begin
  begin
    insert into public.server_audit_events default values;
    raise exception 'authenticated audit insert unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.server_audit_events
    where organization_id = pg_catalog.current_setting('nexus.test.org3')::uuid;
    raise exception 'authenticated audit delete unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;

-- Even the migration owner cannot alter server audit history through ordinary DML.
do $$
begin
  update public.server_audit_events set metadata = '{"tampered":true}'::jsonb;
  raise exception 'server audit mutation unexpectedly succeeded';
exception when object_not_in_prerequisite_state then null;
end;
$$;

do $$
begin
  delete from public.server_audit_events;
  raise exception 'server audit delete trigger unexpectedly allowed deletion';
exception when object_not_in_prerequisite_state then null;
end;
$$;

-- The table trigger protects task_result payloads even on trusted direct SQL.
do $$
begin
  insert into public.entity_records (
    organization_id, entity_type, entity_id, payload, created_by, updated_by
  ) values (
    pg_catalog.current_setting('nexus.test.org3')::uuid,
    'task_result', 'task-result:IMPORT-NODE',
    '{"id":"task-result:IMPORT-NODE","taskId":"IMPORT-NODE"}'::jsonb,
    '10000000-0000-0000-0000-000000000003',
    '10000000-0000-0000-0000-000000000003'
  );
  raise exception 'direct malformed task result insert unexpectedly succeeded';
exception when invalid_parameter_value then null;
end;
$$;

select extensions.pass('RLS and RPC self-test completed without exceptions');
select * from extensions.finish();

rollback;
