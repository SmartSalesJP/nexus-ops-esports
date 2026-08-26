-- Tenant-aware organization creation. Existing organizations intentionally have
-- no profile/config row and continue to use the client legacy preset.

create table app_private.workspace_profiles (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  project_name text not null check (char_length(btrim(project_name)) between 1 and 120),
  purpose text not null check (char_length(btrim(purpose)) between 20 and 4000),
  known_tasks text not null default '' check (char_length(known_tasks) <= 8000),
  generator_version text not null check (char_length(btrim(generator_version)) between 1 and 80),
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid not null references auth.users(id) on delete restrict
);

create table app_private.workspace_configs (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  config jsonb not null check (jsonb_typeof(config) = 'object' and pg_column_size(config) <= 65536),
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid not null references auth.users(id) on delete restrict
);

create table app_private.organization_creation_requests (
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  run_id uuid not null,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  request_payload jsonb not null check (jsonb_typeof(request_payload) = 'object'),
  request_fingerprint text not null check (request_fingerprint ~ '^[0-9a-f]{32}$'),
  result jsonb not null check (jsonb_typeof(result) = 'object'),
  completed_at timestamptz not null default clock_timestamp(),
  primary key (actor_user_id, run_id),
  unique (organization_id)
);

alter table app_private.workspace_profiles enable row level security;
alter table app_private.workspace_configs enable row level security;
alter table app_private.organization_creation_requests enable row level security;
revoke all on table app_private.workspace_profiles from public, anon, authenticated, service_role;
revoke all on table app_private.workspace_configs from public, anon, authenticated, service_role;
revoke all on table app_private.organization_creation_requests from public, anon, authenticated, service_role;

create function public.rpc_organization_creation_capability()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'allowed', auth.uid() is not null and count(*) > 0,
    'activeOwnerCount', count(*),
    'reason', case
      when auth.uid() is null then 'authentication_required'
      when count(*) = 0 then 'active_owner_membership_required'
      else 'active_owner'
    end
  )
  from public.organization_memberships as m
  join public.organizations as o on o.id = m.organization_id
  where m.user_id = auth.uid() and m.role = 'owner' and o.status = 'active'
$$;

create function public.rpc_create_organization(
  p_name text,
  p_slug text,
  p_project_name text,
  p_purpose text,
  p_known_tasks text,
  p_generator_version text,
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
  v_existing app_private.organization_creation_requests%rowtype;
  v_organization_id uuid;
  v_request jsonb;
  v_result jsonb;
  v_phase_count integer;
  v_department_count integer;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if p_run_id is null then
    raise exception using errcode = '22023', message = 'run id is required';
  end if;

  -- Serialize retries before checking the actor/run registry.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_actor::text || ':' || p_run_id::text, 0)
  );

  if not exists (
    select 1
    from public.organization_memberships as m
    join public.organizations as o on o.id = m.organization_id
    where m.user_id = v_actor and m.role = 'owner' and o.status = 'active'
  ) then
    raise exception using errcode = '42501', message = 'active owner membership required';
  end if;

  if char_length(btrim(coalesce(p_name, ''))) not between 1 and 120
     or coalesce(p_slug, '') !~ '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$'
     or char_length(btrim(coalesce(p_project_name, ''))) not between 1 and 120
     or char_length(btrim(coalesce(p_purpose, ''))) not between 20 and 4000
     or char_length(coalesce(p_known_tasks, '')) > 8000
     or char_length(btrim(coalesce(p_generator_version, ''))) not between 1 and 80 then
    raise exception using errcode = '22023', message = 'invalid organization creation text input';
  end if;
  if p_workspace_config is null or jsonb_typeof(p_workspace_config) <> 'object'
     or pg_column_size(p_workspace_config) > 65536
     or p_workspace_config->>'version' <> '1'
     or jsonb_typeof(p_workspace_config->'phases') <> 'array'
     or jsonb_typeof(p_workspace_config->'departments') <> 'array'
     or jsonb_typeof(p_workspace_config->'terminology') <> 'object' then
    raise exception using errcode = '22023', message = 'invalid workspace config envelope';
  end if;
  v_phase_count := jsonb_array_length(p_workspace_config->'phases');
  v_department_count := jsonb_array_length(p_workspace_config->'departments');
  if v_phase_count not between 3 and 7 or v_department_count not between 2 and 12
     or exists (
       select 1 from jsonb_array_elements(p_workspace_config->'phases') as phase(value)
       where jsonb_typeof(phase.value) <> 'object'
          or jsonb_typeof(phase.value->'code') <> 'number'
          or (phase.value->>'code')::numeric not between 0 and 6
          or trunc((phase.value->>'code')::numeric) <> (phase.value->>'code')::numeric
          or char_length(btrim(coalesce(phase.value->>'name', ''))) not between 1 and 120
     )
     or (select count(distinct (phase.value->>'code')::integer) from jsonb_array_elements(p_workspace_config->'phases') as phase(value)) <> v_phase_count
     or (select count(distinct pg_catalog.lower(pg_catalog.btrim(phase.value->>'name'))) from jsonb_array_elements(p_workspace_config->'phases') as phase(value)) <> v_phase_count
     or (select min((phase.value->>'code')::integer) from jsonb_array_elements(p_workspace_config->'phases') as phase(value)) <> 0
     or (select max((phase.value->>'code')::integer) from jsonb_array_elements(p_workspace_config->'phases') as phase(value)) <> v_phase_count - 1
     or exists (
       select 1 from jsonb_array_elements(p_workspace_config->'departments') as department(value)
       where jsonb_typeof(department.value) <> 'object'
          or department.value->>'id' not in (
            'ops-hq','operations','planning','tournament-admin','casting-relations','sales',
            'partnerships','pr-marketing','broadcast','creative','community','education','administration'
          )
          or char_length(btrim(coalesce(department.value->>'name', ''))) not between 1 and 120
          or char_length(coalesce(department.value->>'owner', '')) not between 1 and 120
          or coalesce(department.value->>'owner', '') !~ '[^[:space:][:cntrl:]​‌‍⁠﻿]'
     )
     or (select count(distinct department.value->>'id') from jsonb_array_elements(p_workspace_config->'departments') as department(value)) <> v_department_count
     or (select count(distinct pg_catalog.lower(pg_catalog.btrim(department.value->>'name'))) from jsonb_array_elements(p_workspace_config->'departments') as department(value)) <> v_department_count
     or exists (
       select 1 from jsonb_array_elements(p_workspace_config->'departments') as department(value)
       where department.value->>'id' is null
     )
     or char_length(btrim(coalesce(p_workspace_config->'terminology'->>'task', ''))) not between 1 and 20
     or char_length(btrim(coalesce(p_workspace_config->'terminology'->>'phase', ''))) not between 1 and 20
     or char_length(btrim(coalesce(p_workspace_config->'terminology'->>'department', ''))) not between 1 and 20 then
    raise exception using errcode = '22023', message = 'workspace config values are invalid';
  end if;
  if p_changes is null or jsonb_typeof(p_changes) <> 'array'
     or jsonb_array_length(p_changes) < 1 or jsonb_array_length(p_changes) > 1000
     or pg_column_size(p_changes) > 8388608
     or (select count(*) from jsonb_array_elements(p_changes) as change(value) where change.value->>'entityType' = 'task') not between 5 and 20
     or (select count(*) from jsonb_array_elements(p_changes) as change(value) where change.value->>'entityType' = 'flow_node') <> v_phase_count
     or (select count(*) from jsonb_array_elements(p_changes) as change(value) where change.value->>'entityType' = 'flow_edge') <> v_phase_count - 1
     or not exists (select 1 from jsonb_array_elements(p_changes) as change(value) where change.value->>'entityType' = 'client_audit')
     or not exists (select 1 from jsonb_array_elements(p_changes) as change(value) where change.value->>'entityType' = 'flow_viewport' and change.value->>'entityId' = 'singleton')
     or not exists (select 1 from jsonb_array_elements(p_changes) as change(value) where change.value->>'entityType' = 'report_baseline' and change.value->>'entityId' = 'singleton')
     or not exists (select 1 from jsonb_array_elements(p_changes) as change(value) where change.value->>'entityType' = 'weekly_meta' and change.value->>'entityId' = 'singleton')
     or exists (
       select 1 from jsonb_array_elements(p_changes) as change(value)
       where change.value->>'op' <> 'upsert'
          or change.value->>'expectedVersion' <> '0'
          or change.value->>'entityType' not in (
            'task','flow_node','flow_edge','flow_viewport','client_audit','kpi',
            'report_baseline','weekly_meta'
          )
          or (change.value->>'entityType' = 'task' and change.value->>'entityId' !~ '^C[0-6]-[0-9]{2}$')
          or (change.value->>'entityType' = 'task' and change.value->>'entityId' !~ ('^C' || change.value->'payload'->>'phase' || '-[0-9]{2}$'))
          or (change.value->>'entityType' = 'task' and not exists (
            select 1 from jsonb_array_elements(p_workspace_config->'phases') as phase(value)
            where phase.value->>'code' = change.value->'payload'->>'phase'
          ))
          or (change.value->>'entityType' = 'task' and not exists (
            select 1 from jsonb_array_elements(p_workspace_config->'departments') as department(value)
            where department.value->>'id' = change.value->'payload'->>'teamId'
              and department.value->>'name' = change.value->'payload'->>'team'
              and department.value->>'name' = change.value->'payload'->>'rawTeam'
          ))
          or (change.value->>'entityType' = 'flow_node' and not exists (
            select 1 from jsonb_array_elements(p_workspace_config->'phases') as phase(value)
            where change.value->>'entityId' = 'phase-' || phase.value->>'code'
              and change.value->'payload'->'data'->>'label' = phase.value->>'name'
          ))
          or (change.value->>'entityType' = 'flow_node'
              and jsonb_typeof(change.value->'payload'->'data'->'taskIds') is distinct from 'array')
     )
     or exists (
       select 1 from jsonb_array_elements(p_changes) as task(value)
       where task.value->>'entityType' = 'task'
         and not exists (
           select 1 from jsonb_array_elements(p_changes) as node(value)
           where node.value->>'entityType' = 'flow_node'
             and node.value->>'entityId' = 'phase-' || task.value->'payload'->>'phase'
             and node.value->'payload'->'data'->'taskIds' @> jsonb_build_array(task.value->>'entityId')
         )
     )
     or exists (
       select 1
       from jsonb_array_elements(p_changes) as node(value)
       cross join lateral jsonb_array_elements(
         case when jsonb_typeof(node.value->'payload'->'data'->'taskIds') = 'array'
           then node.value->'payload'->'data'->'taskIds' else '[]'::jsonb end
       ) as task_id(value)
       where node.value->>'entityType' = 'flow_node'
         and not exists (
           select 1 from jsonb_array_elements(p_changes) as task(value)
           where task.value->>'entityType' = 'task'
             and task.value->>'entityId' = task_id.value #>> '{}'
             and 'phase-' || task.value->'payload'->>'phase' = node.value->>'entityId'
         )
     )
     or exists (
       select 1 from generate_series(0, v_phase_count - 2) as expected(phase)
       where not exists (
         select 1 from jsonb_array_elements(p_changes) as edge(value)
         where edge.value->>'entityType' = 'flow_edge'
           and edge.value->'payload'->>'source' = 'phase-' || expected.phase
           and edge.value->'payload'->>'target' = 'phase-' || (expected.phase + 1)
       )
     ) then
    raise exception using errcode = '22023', message = 'initial workspace changes are invalid';
  end if;

  v_request := jsonb_build_object(
    'name', btrim(p_name), 'slug', p_slug, 'projectName', btrim(p_project_name),
    'purpose', btrim(p_purpose), 'knownTasks', p_known_tasks,
    'generatorVersion', btrim(p_generator_version), 'workspaceConfig', p_workspace_config,
    'changes', p_changes
  );
  select request.* into v_existing
  from app_private.organization_creation_requests as request
  where request.actor_user_id = v_actor and request.run_id = p_run_id;
  if found then
    if v_existing.request_payload <> v_request then
      raise exception using errcode = '22023', message = 'run id was already used with a different request';
    end if;
    return v_existing.result || jsonb_build_object('idempotent', true);
  end if;

  v_organization_id := gen_random_uuid();
  insert into public.organizations (id, name, slug, created_by, updated_by)
  values (v_organization_id, btrim(p_name), p_slug, v_actor, v_actor);
  insert into public.organization_memberships (
    organization_id, user_id, role, created_by, updated_by
  ) values (v_organization_id, v_actor, 'owner', v_actor, v_actor);
  insert into app_private.workspace_profiles (
    organization_id, project_name, purpose, known_tasks, generator_version, created_by
  ) values (
    v_organization_id, btrim(p_project_name), btrim(p_purpose), p_known_tasks,
    btrim(p_generator_version), v_actor
  );
  insert into app_private.workspace_configs (organization_id, config, created_by)
  values (v_organization_id, p_workspace_config, v_actor);

  v_result := app_private.execute_changes(
    v_organization_id, 0, p_changes, p_run_id, 'apply_changes', 'owner',
    jsonb_build_object('operation', 'organization_create', 'request', v_request),
    jsonb_build_object(
      'operation', 'organization_create', 'name', btrim(p_name), 'slug', p_slug,
      'status', 'active', 'role', 'owner'
    )
  );
  insert into app_private.organization_creation_requests (
    actor_user_id, run_id, organization_id, request_payload, request_fingerprint, result
  ) values (
    v_actor, p_run_id, v_organization_id, v_request, md5(v_request::text), v_result
  );
  return v_result;
end;
$$;

create or replace function public.rpc_read_snapshot(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_role text;
  v_result jsonb;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  v_role := app_private.membership_role(p_organization_id, v_actor);
  if v_role is null then
    raise exception using errcode = '42501', message = 'organization membership required';
  end if;
  select jsonb_build_object(
    'schemaVersion', 4,
    'organization', jsonb_build_object(
      'id', o.id, 'name', o.name, 'slug', o.slug, 'status', o.status,
      'stateVersion', o.state_version, 'createdAt', o.created_at, 'updatedAt', o.updated_at
    ),
    'role', v_role,
    'workspaceProfile', (
      select jsonb_build_object(
        'projectName', p.project_name, 'purpose', p.purpose, 'knownTasks', p.known_tasks,
        'generatorVersion', p.generator_version, 'createdAt', p.created_at
      ) from app_private.workspace_profiles as p where p.organization_id = o.id
    ),
    'workspaceConfig', (
      select c.config from app_private.workspace_configs as c where c.organization_id = o.id
    ),
    'entities', coalesce((
      select jsonb_agg(jsonb_build_object(
        'entityType', e.entity_type, 'entityId', e.entity_id, 'payload', e.payload,
        'ordinal', e.ordinal, 'version', e.version,
        'semanticFingerprint', e.semantic_fingerprint,
        'createdAt', e.created_at, 'updatedAt', e.updated_at,
        'createdBy', e.created_by, 'updatedBy', e.updated_by,
        'references', coalesce((
          select jsonb_agg(jsonb_build_object(
            'kind', l.link_kind, 'entityType', l.to_entity_type, 'entityId', l.to_entity_id
          ) order by l.link_kind, l.to_entity_type, l.to_entity_id)
          from public.entity_record_links as l
          where l.organization_id = e.organization_id
            and l.from_entity_type = e.entity_type and l.from_entity_id = e.entity_id
        ), '[]'::jsonb)
      ) order by e.entity_type, e.ordinal, e.entity_id)
      from public.entity_records as e where e.organization_id = o.id
    ), '[]'::jsonb),
    'importState', (
      select jsonb_build_object(
        'status', case when count(i.id) > 0 then 'imported'
          when exists (select 1 from public.entity_records as er where er.organization_id = o.id)
            then 'populated_without_manifest' else 'empty' end,
        'manifestCount', count(i.id), 'lastManifestAt', max(i.imported_at)
      ) from public.import_manifests as i where i.organization_id = o.id
    ),
    'readAt', clock_timestamp()
  ) into v_result
  from public.organizations as o where o.id = p_organization_id;
  if v_result is null then
    raise exception using errcode = 'P0002', message = 'organization not found';
  end if;
  return v_result;
end;
$$;

revoke all on function public.rpc_organization_creation_capability() from public, anon, authenticated, service_role;
revoke all on function public.rpc_create_organization(text,text,text,text,text,text,jsonb,jsonb,uuid) from public, anon, authenticated, service_role;
grant execute on function public.rpc_organization_creation_capability() to authenticated;
-- Deliberately keep creation unavailable until the following hardening
-- migration has installed strict JSON/entity validation and the shared guard.
