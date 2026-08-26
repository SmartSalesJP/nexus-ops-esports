-- Strict workspace settings validation shared by organization creation table
-- constraints and the authenticated owner-only settings update RPC.
create function app_private.workspace_settings_valid(p_profile jsonb, p_config jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_phase_count integer;
  v_department_count integer;
begin
  if p_profile is null or jsonb_typeof(p_profile) <> 'object'
     or jsonb_typeof(p_profile->'projectName') <> 'string'
     or jsonb_typeof(p_profile->'purpose') <> 'string'
     or jsonb_typeof(p_profile->'knownTasks') <> 'string'
     or jsonb_typeof(p_profile->'generatorVersion') <> 'string'
     or jsonb_typeof(p_profile->'createdAt') <> 'string'
     or char_length(btrim(p_profile->>'projectName')) not between 1 and 120
     or char_length(btrim(p_profile->>'purpose')) not between 20 and 4000
     or char_length(p_profile->>'knownTasks') > 8000
     or p_profile->>'generatorVersion' <> 'nexus-local-v1' then
    return false;
  end if;
  if p_config is null or jsonb_typeof(p_config) <> 'object'
     or jsonb_typeof(p_config->'version') <> 'number'
     or p_config->>'version' <> '1'
     or jsonb_typeof(p_config->'phases') <> 'array'
     or jsonb_typeof(p_config->'departments') <> 'array'
     or jsonb_typeof(p_config->'terminology') <> 'object' then
    return false;
  end if;
  v_phase_count := jsonb_array_length(p_config->'phases');
  v_department_count := jsonb_array_length(p_config->'departments');
  if v_phase_count not between 3 and 7 or v_department_count not between 2 and 12
     or exists (
       select 1 from jsonb_array_elements(p_config->'phases') phase(value)
       where jsonb_typeof(phase.value) <> 'object'
          or jsonb_typeof(phase.value->'code') <> 'number'
          or phase.value->>'code' !~ '^[0-6]$'
          or jsonb_typeof(phase.value->'name') <> 'string'
          or char_length(btrim(phase.value->>'name')) not between 1 and 120
     )
     or (select count(distinct (phase.value->>'code')::integer) from jsonb_array_elements(p_config->'phases') phase(value)) <> v_phase_count
     or (select min((phase.value->>'code')::integer) from jsonb_array_elements(p_config->'phases') phase(value)) <> 0
     or (select max((phase.value->>'code')::integer) from jsonb_array_elements(p_config->'phases') phase(value)) <> v_phase_count - 1
     or (select count(distinct lower(btrim(phase.value->>'name'))) from jsonb_array_elements(p_config->'phases') phase(value)) <> v_phase_count
     or exists (
       select 1 from jsonb_array_elements(p_config->'departments') department(value)
       where jsonb_typeof(department.value) <> 'object'
          or jsonb_typeof(department.value->'id') <> 'string'
          or jsonb_typeof(department.value->'name') <> 'string'
          or coalesce(jsonb_typeof(department.value->'owner'),'null') <> 'string'
          or department.value->>'id' not in ('ops-hq','operations','planning','tournament-admin','casting-relations','sales','partnerships','pr-marketing','broadcast','creative','community','education','administration')
          or char_length(btrim(department.value->>'name')) not between 1 and 120
          or char_length(department.value->>'owner') not between 1 and 120
          or department.value->>'owner' !~ '[^[:space:][:cntrl:]​‌‍⁠﻿]'
     )
     or (select count(distinct department.value->>'id') from jsonb_array_elements(p_config->'departments') department(value)) <> v_department_count
     or (select count(distinct lower(btrim(department.value->>'name'))) from jsonb_array_elements(p_config->'departments') department(value)) <> v_department_count
     or jsonb_typeof(p_config->'terminology'->'task') <> 'string'
     or jsonb_typeof(p_config->'terminology'->'phase') <> 'string'
     or jsonb_typeof(p_config->'terminology'->'department') <> 'string'
     or char_length(btrim(p_config->'terminology'->>'task')) not between 1 and 20
     or char_length(btrim(p_config->'terminology'->>'phase')) not between 1 and 20
     or char_length(btrim(p_config->'terminology'->>'department')) not between 1 and 20 then
    return false;
  end if;
  return true;
exception when others then
  return false;
end;
$$;

revoke all on function app_private.workspace_settings_valid(jsonb,jsonb) from public, anon, authenticated, service_role;

-- Keep task responsibility identical across legacy and custom mutation routes.
-- The existing validator remains authoritative for every other entity field.
create or replace function app_private.validate_entity_payload(
  p_entity_type text,
  p_entity_id text,
  p_payload jsonb
)
returns void
language plpgsql
immutable
security invoker
set search_path = ''
as $function$
begin
  if p_entity_type = 'task_result' then
    perform app_private.validate_task_result_payload(p_entity_id,p_payload);
  else
    perform app_private.validate_entity_payload_v4_legacy(p_entity_type,p_entity_id,p_payload);
  end if;
  if p_entity_type = 'task' and (
    pg_catalog.coalesce(pg_catalog.jsonb_typeof(p_payload->'owner'),'null') <> 'string'
    or pg_catalog.char_length(p_payload->>'owner') not between 1 and 120
    or p_payload->>'owner' !~ '[^[:space:][:cntrl:]​‌‍⁠﻿]'
  ) then
    raise exception using errcode='22023',
      message='task owner must contain 1 to 120 visible characters';
  end if;
end;
$function$;

revoke all on function app_private.validate_entity_payload(text,text,jsonb)
  from public, anon, authenticated, service_role;

-- Validate the committed entity graph, not just the client-supplied change list.
-- The caller invokes this after execute_changes; returning false raises in the
-- same transaction and rolls back profile, config, entities, links, and audit.
create function app_private.workspace_entities_match_config(p_organization_id uuid, p_config jsonb)
returns boolean
language plpgsql
stable
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.entity_records as task
    where task.organization_id = p_organization_id and task.entity_type = 'task'
  ) or exists (
    select 1
    from public.entity_records as task
    where task.organization_id = p_organization_id
      and task.entity_type = 'task'
      and (
        not exists (
          select 1 from pg_catalog.jsonb_array_elements(p_config->'phases') as phase(value)
          where (phase.value->>'code')::integer = (task.payload->>'phase')::integer
        )
        or not exists (
          select 1 from pg_catalog.jsonb_array_elements(p_config->'departments') as department(value)
          where department.value->>'id' = task.payload->>'teamId'
            and department.value->>'name' = task.payload->>'team'
            and department.value->>'name' = task.payload->>'rawTeam'
        )
        or pg_catalog.coalesce(pg_catalog.jsonb_typeof(task.payload->'owner'),'null') <> 'string'
        or pg_catalog.char_length(task.payload->>'owner') not between 1 and 120
        or task.payload->>'owner' !~ '[^[:space:][:cntrl:]​‌‍⁠﻿]'
        or exists (
          select 1
          from pg_catalog.jsonb_array_elements_text(coalesce(task.payload->'dependencies','[]'::jsonb)) as dependency(task_id)
          where not exists (
            select 1 from public.entity_records as target
            where target.organization_id = p_organization_id
              and target.entity_type = 'task'
              and target.entity_id = dependency.task_id
          )
        )
      )
  ) then
    return false;
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_config->'phases') as phase(value)
    where not exists (
      select 1 from public.entity_records as node
      where node.organization_id = p_organization_id
        and node.entity_type = 'flow_node'
        and node.entity_id = 'phase-' || phase.value->>'code'
        and node.payload#>>'{data,label}' = phase.value->>'name'
        and pg_catalog.jsonb_typeof(node.payload#>'{data,taskIds}') = 'array'
    )
  ) or exists (
    select 1
    from public.entity_records as task
    where task.organization_id = p_organization_id
      and task.entity_type = 'task'
      and not exists (
        select 1 from public.entity_records as node
        where node.organization_id = p_organization_id
          and node.entity_type = 'flow_node'
          and node.entity_id = 'phase-' || task.payload->>'phase'
          and node.payload#>'{data,taskIds}' @> pg_catalog.jsonb_build_array(task.entity_id)
      )
  ) or exists (
    select 1
    from public.entity_records as node
    cross join lateral pg_catalog.jsonb_array_elements_text(
      coalesce(node.payload#>'{data,taskIds}','[]'::jsonb)
    ) as node_task(task_id)
    where node.organization_id = p_organization_id
      and node.entity_type = 'flow_node'
      and not exists (
        select 1 from public.entity_records as task
        where task.organization_id = p_organization_id
          and task.entity_type = 'task'
          and task.entity_id = node_task.task_id
          and (node.entity_id !~ '^phase-[0-6]$'
            or node.entity_id = 'phase-' || task.payload->>'phase')
      )
  ) or exists (
    select 1
    from public.entity_records as edge
    where edge.organization_id = p_organization_id
      and edge.entity_type = 'flow_edge'
      and (
        not exists (
          select 1 from public.entity_records as source
          where source.organization_id = p_organization_id
            and source.entity_type = 'flow_node'
            and source.entity_id = edge.payload->>'source'
        )
        or not exists (
          select 1 from public.entity_records as target
          where target.organization_id = p_organization_id
            and target.entity_type = 'flow_node'
            and target.entity_id = edge.payload->>'target'
        )
      )
  ) or exists (
    select 1
    from public.entity_records as result
    where result.organization_id = p_organization_id
      and result.entity_type = 'task_result'
      and not exists (
        select 1 from public.entity_records as task
        where task.organization_id = p_organization_id
          and task.entity_type = 'task'
          and task.entity_id = result.payload->>'taskId'
      )
  ) then
    return false;
  end if;
  return true;
exception when others then
  return false;
end;
$$;

revoke all on function app_private.workspace_entities_match_config(uuid,jsonb) from public, anon, authenticated, service_role;

-- Replace the shared mutation executor in place so every write route keeps the
-- existing validation, optimistic locking, links, audit, and idempotency logic,
-- then validates custom workspace semantics before the transaction can commit.
create or replace function app_private.execute_changes(
  p_organization_id uuid,
  p_expected_state_version bigint,
  p_changes jsonb,
  p_run_id uuid,
  p_operation text,
  p_required_role text,
  p_request_payload jsonb,
  p_result_extra jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_role text;
  v_state_version bigint;
  v_existing_run public.mutation_runs%rowtype;
  v_change jsonb;
  v_reference jsonb;
  v_before public.entity_records%rowtype;
  v_after_version bigint;
  v_event_index integer;
  v_result jsonb;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if p_run_id is null then
    raise exception using errcode = '22023', message = 'run id is required';
  end if;
  if p_operation not in ('apply_changes', 'import_v4', 'weekly_save') then
    raise exception using errcode = '22023', message = 'unsupported mutation operation';
  end if;
  if p_changes is null or jsonb_typeof(p_changes) <> 'array' or jsonb_array_length(p_changes) = 0 then
    raise exception using errcode = '22023', message = 'changes must be a non-empty JSON array';
  end if;
  if jsonb_array_length(p_changes) > 10000 or pg_column_size(p_changes) > 16777216 then
    raise exception using errcode = '22023', message = 'change batch exceeds operation or 16 MiB limit';
  end if;
  if p_request_payload is null or p_result_extra is null
     or jsonb_typeof(p_request_payload) <> 'object' or jsonb_typeof(p_result_extra) <> 'object' then
    raise exception using errcode = '22023', message = 'request and result metadata must be JSON objects';
  end if;

  select o.state_version into v_state_version
  from public.organizations as o
  where o.id = p_organization_id and o.status = 'active'
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'active organization not found';
  end if;

  v_role := app_private.membership_role(p_organization_id, v_actor);
  if v_role is null
     or (p_required_role = 'owner' and v_role <> 'owner')
     or (p_required_role = 'editor' and v_role not in ('owner', 'editor')) then
    raise exception using errcode = '42501', message = 'organization role does not permit this operation';
  end if;

  select r.* into v_existing_run
  from public.mutation_runs as r
  where r.organization_id = p_organization_id and r.run_id = p_run_id;
  if found then
    if v_existing_run.operation <> p_operation or v_existing_run.request_payload <> p_request_payload then
      raise exception using errcode = '22023', message = 'run id was already used with a different request';
    end if;
    return v_existing_run.result || jsonb_build_object('idempotent', true);
  end if;

  if v_state_version <> p_expected_state_version then
    raise exception using errcode = '40001', message = format(
      'state version conflict: expected %s, actual %s', p_expected_state_version, v_state_version
    );
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_changes) as c(value)
    where jsonb_typeof(c.value) <> 'object'
       or c.value->>'op' not in ('upsert', 'delete')
       or coalesce(c.value->>'entityType', '') not in (
         'task', 'flow_node', 'flow_edge', 'flow_viewport', 'client_audit', 'kpi',
         'report_baseline', 'migration_archive', 'weekly_run', 'weekly_completion',
         'weekly_tombstone', 'weekly_meta', 'task_result'
       )
       or char_length(coalesce(c.value->>'entityId', '')) not between 1 and 256
       or (c.value->>'expectedVersion') is null
       or (c.value->>'expectedVersion') !~ '^[0-9]+$'
       or ((c.value->>'expectedVersion')::bigint < 0)
       or (c.value->>'op' = 'upsert' and jsonb_typeof(c.value->'payload') <> 'object')
       or (c.value->>'op' = 'delete' and c.value ? 'payload')
       or (c.value ? 'references' and jsonb_typeof(c.value->'references') <> 'array')
       or (jsonb_typeof(c.value->'references') = 'array' and jsonb_array_length(c.value->'references') > 2048)
  ) then
    raise exception using errcode = '22023', message = 'one or more changes are malformed';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_changes) as c(value)
    where c.value->>'entityType' in ('flow_viewport', 'report_baseline', 'weekly_meta')
      and c.value->>'entityId' <> 'singleton'
  ) then
    raise exception using errcode = '22023', message = 'singleton entity id must be singleton';
  end if;

  for v_change in
    select value from jsonb_array_elements(p_changes) as c(value)
    where value->>'op' = 'upsert'
  loop
    perform app_private.validate_entity_payload(
      v_change->>'entityType', v_change->>'entityId', v_change->'payload'
    );
  end loop;

  if exists (
    select 1 from jsonb_array_elements(p_changes) as c(value)
    where c.value->>'op' = 'delete'
      and (
        c.value->>'entityType' in ('flow_viewport', 'report_baseline', 'weekly_meta')
        or (c.value->>'entityType' = 'task' and c.value->>'entityId' ~ '^P[0-6]-[0-9]{2}$')
      )
  ) then
    raise exception using errcode = '42501', message = 'protected canonical/singleton entities cannot be deleted';
  end if;

  if v_role = 'editor' and (
    select count(*) from jsonb_array_elements(p_changes) as c(value)
    where c.value->>'op' = 'delete'
  ) > 25 then
    raise exception using errcode = '42501', message = 'editor deletion batch exceeds safety limit';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_changes) as c(value)
    group by c.value->>'entityType', c.value->>'entityId'
    having count(*) > 1
  ) then
    raise exception using errcode = '22023', message = 'duplicate entity key in changes';
  end if;

  -- Known schema-v4 relations must be declared as relational links as well as
  -- appearing in JSON. A client cannot bypass cross-org checks by omitting links.
  if exists (
    select 1
    from jsonb_array_elements(p_changes) as c(value)
    where c.value->>'op' = 'upsert'
      and c.value->>'entityType' = 'flow_edge'
      and (
        char_length(coalesce(c.value->'payload'->>'source', '')) = 0
        or char_length(coalesce(c.value->'payload'->>'target', '')) = 0
        or not exists (
          select 1 from jsonb_array_elements(coalesce(c.value->'references', '[]'::jsonb)) as r(value)
          where r.value->>'kind' = 'source'
            and r.value->>'entityType' = 'flow_node'
            and r.value->>'entityId' = c.value->'payload'->>'source'
        )
        or not exists (
          select 1 from jsonb_array_elements(coalesce(c.value->'references', '[]'::jsonb)) as r(value)
          where r.value->>'kind' = 'target'
            and r.value->>'entityType' = 'flow_node'
            and r.value->>'entityId' = c.value->'payload'->>'target'
        )
      )
  ) then
    raise exception using errcode = '22023', message = 'flow edge source/target links must match its payload';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_changes) as c(value)
    where c.value->>'op' = 'upsert'
      and c.value->>'entityType' = 'weekly_completion'
      and (
        char_length(coalesce(c.value->'payload'->>'taskId', '')) = 0
        or not exists (
          select 1 from jsonb_array_elements(coalesce(c.value->'references', '[]'::jsonb)) as r(value)
          where r.value->>'kind' = 'task'
            and r.value->>'entityType' = 'task'
            and r.value->>'entityId' = c.value->'payload'->>'taskId'
        )
      )
  ) then
    raise exception using errcode = '22023', message = 'weekly completion task link must match its payload';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_changes) as c(value)
    where c.value->>'op' = 'upsert'
      and c.value->>'entityType' = 'task'
      and c.value->'payload' ? 'dependencies'
      and jsonb_typeof(c.value->'payload'->'dependencies') <> 'array'
  ) then
    raise exception using errcode = '22023', message = 'task dependencies must be an array';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_changes) as c(value)
    cross join lateral jsonb_array_elements(coalesce(c.value->'payload'->'dependencies', '[]'::jsonb)) as d(value)
    where c.value->>'op' = 'upsert'
      and c.value->>'entityType' = 'task'
      and (
        jsonb_typeof(d.value) <> 'string'
        or not exists (
          select 1 from jsonb_array_elements(coalesce(c.value->'references', '[]'::jsonb)) as r(value)
          where r.value->>'kind' = 'dependency'
            and r.value->>'entityType' = 'task'
            and r.value->>'entityId' = d.value #>> '{}'
        )
      )
  ) then
    raise exception using errcode = '22023', message = 'task dependency links must match its payload';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_changes) as c(value)
    where c.value->>'op' = 'upsert'
      and c.value->>'entityType' = 'task'
      and c.value->'payload' ? 'createdRunId'
      and not exists (
        select 1 from jsonb_array_elements(coalesce(c.value->'references', '[]'::jsonb)) as r(value)
        where r.value->>'kind' = 'created_run'
          and r.value->>'entityType' = 'weekly_run'
          and r.value->>'entityId' = c.value->'payload'->>'createdRunId'
      )
  ) then
    raise exception using errcode = '22023', message = 'task created-run link must match its payload';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_changes) as c(value)
    where c.value->>'op' = 'upsert'
      and c.value->>'entityType' = 'task'
      and c.value->'payload'->'provenance' ? 'sourceTaskId'
      and not exists (
        select 1 from jsonb_array_elements(coalesce(c.value->'references', '[]'::jsonb)) as r(value)
        where r.value->>'kind' = 'provenance_source'
          and r.value->>'entityType' = 'task'
          and r.value->>'entityId' = c.value->'payload'->'provenance'->>'sourceTaskId'
      )
  ) then
    raise exception using errcode = '22023', message = 'task provenance source link must match its payload';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_changes) as c(value)
    cross join lateral jsonb_array_elements(
      coalesce(c.value->'payload'->'provenance'->'dependencyIds', '[]'::jsonb)
    ) as dependency(value)
    where c.value->>'op' = 'upsert'
      and c.value->>'entityType' = 'task'
      and not exists (
        select 1 from jsonb_array_elements(coalesce(c.value->'references', '[]'::jsonb)) as r(value)
        where r.value->>'kind' = 'provenance_dependency'
          and r.value->>'entityType' = 'task'
          and r.value->>'entityId' = dependency.value #>> '{}'
      )
  ) then
    raise exception using errcode = '22023', message = 'task provenance dependency links must match its payload';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_changes) as c(value)
    where c.value->>'op' = 'upsert'
      and c.value->>'entityType' = 'task'
      and c.value->'payload'->'provenance' ? 'kpiId'
      and not exists (
        select 1 from jsonb_array_elements(coalesce(c.value->'references', '[]'::jsonb)) as r(value)
        where r.value->>'kind' = 'provenance_kpi'
          and r.value->>'entityType' = 'kpi'
          and r.value->>'entityId' = c.value->'payload'->'provenance'->>'kpiId'
      )
  ) then
    raise exception using errcode = '22023', message = 'task provenance KPI link must match its payload';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_changes) as c(value)
    where c.value->>'op' = 'upsert'
      and c.value->>'entityType' in ('flow_node', 'flow_edge')
      and c.value->'payload'->'data' ? 'taskIds'
      and jsonb_typeof(c.value->'payload'->'data'->'taskIds') <> 'array'
  ) then
    raise exception using errcode = '22023', message = 'flow taskIds must be an array';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_changes) as c(value)
    cross join lateral jsonb_array_elements(coalesce(c.value->'payload'->'data'->'taskIds', '[]'::jsonb)) as t(value)
    where c.value->>'op' = 'upsert'
      and c.value->>'entityType' in ('flow_node', 'flow_edge')
      and (
        jsonb_typeof(t.value) <> 'string'
        or char_length(t.value #>> '{}') = 0
        or not exists (
          select 1 from jsonb_array_elements(coalesce(c.value->'references', '[]'::jsonb)) as r(value)
          where r.value->>'kind' = 'task'
            and r.value->>'entityType' = 'task'
            and r.value->>'entityId' = t.value #>> '{}'
        )
      )
  ) then
    raise exception using errcode = '22023', message = 'flow task links must match its payload';
  end if;

  -- Managed task nodes/edges must expose one unambiguous task identity and
  -- declare it as an organization-scoped relational link. Nodes also keep the
  -- task in taskIds because that array is the canvas/pruning source of truth.
  if exists (
    select 1
    from jsonb_array_elements(p_changes) as c(value)
    where c.value->>'op' = 'upsert'
      and c.value->>'entityType' in ('flow_node', 'flow_edge')
      and c.value->'payload'->'data'->>'targetType' = 'task'
      and (
        jsonb_typeof(c.value->'payload'->'data'->'targetId') is distinct from 'string'
        or char_length(c.value->'payload'->'data'->>'targetId') = 0
        or jsonb_typeof(c.value->'payload'->'data'->'taskId') is distinct from 'string'
        or char_length(c.value->'payload'->'data'->>'taskId') = 0
        or c.value->'payload'->'data'->>'targetId'
          <> c.value->'payload'->'data'->>'taskId'
        or (
          c.value->>'entityType' = 'flow_node'
          and jsonb_typeof(c.value->'payload'->'data'->'taskIds') is distinct from 'array'
        )
        or (
          c.value->>'entityType' = 'flow_node'
          and not (c.value->'payload'->'data'->'taskIds'
            @> jsonb_build_array(c.value->'payload'->'data'->'taskId'))
        )
        or not exists (
          select 1
          from jsonb_array_elements(coalesce(c.value->'references', '[]'::jsonb)) as r(value)
          where r.value->>'kind' = 'task'
            and r.value->>'entityType' = 'task'
            and r.value->>'entityId' = c.value->'payload'->'data'->>'taskId'
        )
      )
  ) then
    raise exception using errcode = '22023',
      message = 'task-targeted flow data must identify one declared task link';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_changes) as c(value)
    where c.value->>'op' = 'upsert'
      and c.value->>'entityType' = 'flow_node'
      and c.value->'payload'->'data' ? 'runId'
      and not exists (
        select 1 from jsonb_array_elements(coalesce(c.value->'references', '[]'::jsonb)) as r(value)
        where r.value->>'kind' = 'weekly_run'
          and r.value->>'entityType' = 'weekly_run'
          and r.value->>'entityId' = c.value->'payload'->'data'->>'runId'
      )
  ) then
    raise exception using errcode = '22023', message = 'flow node weekly-run link must match its payload';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_changes) as c(value)
    where c.value->>'op' = 'upsert'
      and c.value->>'entityType' = 'weekly_meta'
      and jsonb_typeof(c.value->'payload'->'lastRunId') = 'string'
      and not exists (
        select 1 from jsonb_array_elements(coalesce(c.value->'references', '[]'::jsonb)) as r(value)
        where r.value->>'kind' = 'last_run'
          and r.value->>'entityType' = 'weekly_run'
          and r.value->>'entityId' = c.value->'payload'->>'lastRunId'
      )
  ) then
    raise exception using errcode = '22023', message = 'weekly metadata last-run link must match its payload';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_changes) as c(value)
    where c.value->>'op' = 'upsert'
      and c.value->>'entityType' = 'task_result'
      and not exists (
        select 1
        from jsonb_array_elements(coalesce(c.value->'references', '[]'::jsonb)) as r(value)
        where r.value->>'kind' = 'task'
          and r.value->>'entityType' = 'task'
          and r.value->>'entityId' = c.value->'payload'->>'taskId'
      )
  ) then
    raise exception using errcode = '22023',
      message = 'task result task link must match its payload';
  end if;

  -- Lock existing rows in a deterministic order and validate every expected version
  -- before any mutation, preserving all-or-nothing conflict behavior.
  perform 1
  from public.entity_records as e
  join jsonb_array_elements(p_changes) as c(value)
    on e.organization_id = p_organization_id
   and e.entity_type = c.value->>'entityType'
   and e.entity_id = c.value->>'entityId'
  order by e.entity_type, e.entity_id
  for update of e;

  if exists (
    select 1
    from jsonb_array_elements(p_changes) as c(value)
    left join public.entity_records as e
      on e.organization_id = p_organization_id
     and e.entity_type = c.value->>'entityType'
     and e.entity_id = c.value->>'entityId'
    where (e.version is null and (c.value->>'expectedVersion')::bigint <> 0)
       or (e.version is not null and e.version <> (c.value->>'expectedVersion')::bigint)
       or (c.value->>'op' = 'delete' and e.version is null)
  ) then
    raise exception using errcode = '40001', message = 'one or more entity versions conflict';
  end if;

  -- Remove outgoing links for all changed sources first. This permits an atomic
  -- reference rewrite followed by target deletion while unchanged references
  -- continue to block unsafe deletes through the RESTRICT composite FK.
  delete from public.entity_record_links as l
  using jsonb_array_elements(p_changes) as c(value)
  where l.organization_id = p_organization_id
    and l.from_entity_type = c.value->>'entityType'
    and l.from_entity_id = c.value->>'entityId';

  for v_change in select value from jsonb_array_elements(p_changes) with ordinality as c(value, ord) where value->>'op' = 'upsert' order by ord
  loop
    select e.* into v_before
    from public.entity_records as e
    where e.organization_id = p_organization_id
      and e.entity_type = v_change->>'entityType'
      and e.entity_id = v_change->>'entityId';

    if found then
      v_after_version := v_before.version + 1;
      update public.entity_records as e
      set payload = v_change->'payload',
          ordinal = coalesce((v_change->>'ordinal')::integer, e.ordinal),
          semantic_fingerprint = nullif(v_change->>'semanticFingerprint', ''),
          version = v_after_version,
          updated_at = clock_timestamp(),
          updated_by = v_actor
      where e.organization_id = p_organization_id
        and e.entity_type = v_change->>'entityType'
        and e.entity_id = v_change->>'entityId';
    else
      v_after_version := 1;
      insert into public.entity_records (
        organization_id, entity_type, entity_id, payload, ordinal,
        semantic_fingerprint, version, created_by, updated_by
      ) values (
        p_organization_id, v_change->>'entityType', v_change->>'entityId',
        v_change->'payload', coalesce((v_change->>'ordinal')::integer, 0),
        nullif(v_change->>'semanticFingerprint', ''), 1, v_actor, v_actor
      );
    end if;

    select ord::integer into v_event_index
    from jsonb_array_elements(p_changes) with ordinality as c(value, ord)
    where c.value is not distinct from v_change
    limit 1;
    insert into public.server_audit_events (
      organization_id, run_id, event_index, action, entity_type, entity_id,
      before_version, after_version, before_payload, after_payload, metadata, actor_user_id
    ) values (
      p_organization_id, p_run_id, v_event_index, 'entity_upsert',
      v_change->>'entityType', v_change->>'entityId', v_before.version,
      v_after_version, v_before.payload, v_change->'payload',
      jsonb_build_object('operation', p_operation), v_actor
    );
    v_before := null;
  end loop;

  for v_change in select value from jsonb_array_elements(p_changes) with ordinality as c(value, ord) where value->>'op' = 'delete' order by ord
  loop
    select e.* into strict v_before
    from public.entity_records as e
    where e.organization_id = p_organization_id
      and e.entity_type = v_change->>'entityType'
      and e.entity_id = v_change->>'entityId';
    select ord::integer into v_event_index
    from jsonb_array_elements(p_changes) with ordinality as c(value, ord)
    where c.value is not distinct from v_change
    limit 1;
    delete from public.entity_records as e
    where e.organization_id = p_organization_id
      and e.entity_type = v_change->>'entityType'
      and e.entity_id = v_change->>'entityId';
    insert into public.server_audit_events (
      organization_id, run_id, event_index, action, entity_type, entity_id,
      before_version, after_version, before_payload, after_payload, metadata, actor_user_id
    ) values (
      p_organization_id, p_run_id, v_event_index, 'entity_delete',
      v_change->>'entityType', v_change->>'entityId', v_before.version,
      null, v_before.payload, null, jsonb_build_object('operation', p_operation), v_actor
    );
    v_before := null;
  end loop;

  for v_change in select value from jsonb_array_elements(p_changes) as c(value) where value->>'op' = 'upsert'
  loop
    for v_reference in select value from jsonb_array_elements(coalesce(v_change->'references', '[]'::jsonb)) as r(value)
    loop
      if jsonb_typeof(v_reference) <> 'object'
         or coalesce(v_reference->>'entityType', '') not in (
           'task', 'flow_node', 'flow_edge', 'flow_viewport', 'client_audit', 'kpi',
           'report_baseline', 'migration_archive', 'weekly_run', 'weekly_completion',
           'weekly_tombstone', 'weekly_meta', 'task_result'
         )
         or char_length(coalesce(v_reference->>'entityId', '')) not between 1 and 256
         or char_length(coalesce(v_reference->>'kind', 'reference')) not between 1 and 80 then
        raise exception using errcode = '22023', message = 'malformed entity reference';
      end if;
      insert into public.entity_record_links (
        organization_id, from_entity_type, from_entity_id, link_kind,
        to_entity_type, to_entity_id, created_by
      ) values (
        p_organization_id, v_change->>'entityType', v_change->>'entityId',
        coalesce(nullif(v_reference->>'kind', ''), 'reference'),
        v_reference->>'entityType', v_reference->>'entityId', v_actor
      ) on conflict (
        organization_id, from_entity_type, from_entity_id,
        link_kind, to_entity_type, to_entity_id
      ) do nothing;
    end loop;
  end loop;

  update public.organizations as o
  set state_version = o.state_version + 1,
      updated_at = clock_timestamp(),
      updated_by = v_actor
  where o.id = p_organization_id
  returning o.state_version into v_state_version;

  v_result := jsonb_build_object(
    'organizationId', p_organization_id,
    'stateVersion', v_state_version,
    'runId', p_run_id,
    'operation', p_operation,
    'changedCount', jsonb_array_length(p_changes),
    'idempotent', false,
    'committedAt', clock_timestamp()
  ) || p_result_extra;

  insert into public.mutation_runs (
    organization_id, run_id, operation, request_payload, request_fingerprint,
    result, actor_user_id
  ) values (
    p_organization_id, p_run_id, p_operation, p_request_payload,
    md5(p_request_payload::text), v_result, v_actor
  );
  if exists (
    select 1 from app_private.workspace_configs as config
    where config.organization_id = p_organization_id
  ) and not app_private.workspace_entities_match_config(
    p_organization_id,
    (select config.config from app_private.workspace_configs as config
     where config.organization_id = p_organization_id)
  ) then
    raise exception using errcode = '22023',
      message = 'workspace config does not match the committed entity graph';
  end if;
  return v_result;
end;
$$;

revoke all on function app_private.execute_changes(uuid, bigint, jsonb, uuid, text, text, jsonb, jsonb)
  from public, anon, authenticated, service_role;

alter table app_private.workspace_profiles
  add constraint workspace_profiles_generator_version_exact_check
  check (generator_version = 'nexus-local-v1');

alter table app_private.workspace_configs
  add constraint workspace_configs_strict_values_check
  check (app_private.workspace_settings_valid(
    jsonb_build_object(
      'projectName','placeholder','purpose',repeat('x',20),'knownTasks','',
      'generatorVersion','nexus-local-v1','createdAt','placeholder'
    ), config
  ));

create function public.rpc_update_workspace_settings(
  p_organization_id uuid,
  p_expected_state_version bigint,
  p_workspace_profile jsonb,
  p_workspace_config jsonb,
  p_changes jsonb,
  p_run_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_result jsonb;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if app_private.membership_role(p_organization_id,v_actor) <> 'owner' then
    raise exception using errcode = '42501', message = 'owner membership required';
  end if;
  if not app_private.workspace_settings_valid(p_workspace_profile,p_workspace_config) then
    raise exception using errcode = '22023', message = 'invalid workspace profile or config';
  end if;
  update app_private.workspace_profiles
  set project_name=btrim(p_workspace_profile->>'projectName'),
      purpose=btrim(p_workspace_profile->>'purpose'),
      known_tasks=p_workspace_profile->>'knownTasks',
      generator_version=p_workspace_profile->>'generatorVersion'
  where organization_id=p_organization_id;
  if not found then raise exception using errcode='P0002',message='workspace profile not found'; end if;
  update app_private.workspace_configs set config=p_workspace_config where organization_id=p_organization_id;
  if not found then raise exception using errcode='P0002',message='workspace config not found'; end if;
  v_result := app_private.execute_changes(
    p_organization_id,p_expected_state_version,p_changes,p_run_id,'apply_changes','owner',
    jsonb_build_object('operation','workspace_settings_update','profile',p_workspace_profile,'config',p_workspace_config,'changes',p_changes),
    jsonb_build_object('operation','workspace_settings_update')
  );
  if not app_private.workspace_entities_match_config(p_organization_id,p_workspace_config) then
    raise exception using errcode='22023',message='workspace config does not match the committed entity graph';
  end if;
  return v_result;
end;
$$;

revoke all on function public.rpc_update_workspace_settings(uuid,bigint,jsonb,jsonb,jsonb,uuid) from public, anon, authenticated, service_role;
grant execute on function public.rpc_update_workspace_settings(uuid,bigint,jsonb,jsonb,jsonb,uuid) to authenticated;
-- Creation is exposed only after every strict validator, constraint, shared
-- mutation guard, and owner-only settings RPC above exists successfully.
grant execute on function public.rpc_create_organization(text,text,text,text,text,text,jsonb,jsonb,uuid) to authenticated;
