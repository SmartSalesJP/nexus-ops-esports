-- NEXUS OPS shared schema (up-only).
-- This migration intentionally contains no business-table DROP/TRUNCATE statements.

create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated, service_role;

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$'),
  status text not null default 'active' check (status in ('active', 'archived')),
  state_version bigint not null default 0 check (state_version >= 0),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid not null references auth.users(id) on delete restrict
);

create table public.organization_memberships (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'editor', 'viewer')),
  version bigint not null default 1 check (version >= 1),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid not null references auth.users(id) on delete restrict,
  primary key (organization_id, user_id)
);

create index organization_memberships_user_org_idx
  on public.organization_memberships (user_id, organization_id);

create table public.entity_records (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  entity_type text not null check (entity_type in (
    'task', 'flow_node', 'flow_edge', 'flow_viewport', 'client_audit', 'kpi',
    'report_baseline', 'migration_archive', 'weekly_run', 'weekly_completion',
    'weekly_tombstone', 'weekly_meta'
  )),
  entity_id text not null check (char_length(entity_id) between 1 and 256),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  ordinal integer not null default 0 check (ordinal between 0 and 1000000),
  semantic_fingerprint text,
  version bigint not null default 1 check (version >= 1),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid not null references auth.users(id) on delete restrict,
  primary key (organization_id, entity_type, entity_id),
  check (pg_column_size(payload) <= 262144),
  check (jsonb_typeof(payload->'id') = 'string' and payload->>'id' = entity_id),
  check (semantic_fingerprint is null or char_length(semantic_fingerprint) between 1 and 2048),
  check (entity_type not in ('flow_viewport', 'report_baseline', 'weekly_meta') or entity_id = 'singleton')
);

create index entity_records_org_order_idx
  on public.entity_records (organization_id, entity_type, ordinal, entity_id);

create unique index entity_records_org_semantic_fingerprint_uidx
  on public.entity_records (organization_id, semantic_fingerprint)
  where semantic_fingerprint is not null;

-- All cross-entity references are represented here. Both foreign keys include
-- organization_id, so a reference can never cross an organization boundary.
create table public.entity_record_links (
  organization_id uuid not null,
  from_entity_type text not null,
  from_entity_id text not null,
  link_kind text not null default 'reference' check (char_length(link_kind) between 1 and 80),
  to_entity_type text not null,
  to_entity_id text not null,
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid not null references auth.users(id) on delete restrict,
  primary key (
    organization_id, from_entity_type, from_entity_id,
    link_kind, to_entity_type, to_entity_id
  ),
  foreign key (organization_id, from_entity_type, from_entity_id)
    references public.entity_records (organization_id, entity_type, entity_id)
    on delete cascade,
  foreign key (organization_id, to_entity_type, to_entity_id)
    references public.entity_records (organization_id, entity_type, entity_id)
    on delete restrict
);

create index entity_record_links_target_idx
  on public.entity_record_links (organization_id, to_entity_type, to_entity_id);

create table public.import_manifests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  run_id uuid not null,
  source_schema integer not null check (source_schema = 4),
  source_origin text not null check (char_length(btrim(source_origin)) between 1 and 500),
  source_size bigint not null check (source_size > 0),
  source_entity_count integer not null check (source_entity_count >= 0),
  raw_sha256 text not null check (raw_sha256 ~ '^[0-9a-f]{64}$'),
  semantic_fingerprint text not null check (char_length(semantic_fingerprint) between 1 and 2048),
  status text not null default 'completed' check (status = 'completed'),
  imported_at timestamptz not null default clock_timestamp(),
  imported_by uuid not null references auth.users(id) on delete restrict,
  unique (organization_id, run_id),
  unique (organization_id, semantic_fingerprint)
);

create index import_manifests_org_imported_idx
  on public.import_manifests (organization_id, imported_at desc);

create table public.mutation_runs (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  run_id uuid not null,
  operation text not null check (operation in ('apply_changes', 'import_v4', 'weekly_save', 'membership', 'bootstrap')),
  request_payload jsonb not null check (jsonb_typeof(request_payload) = 'object'),
  request_fingerprint text not null check (request_fingerprint ~ '^[0-9a-f]{32}$'),
  result jsonb not null check (jsonb_typeof(result) = 'object'),
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  completed_at timestamptz not null default clock_timestamp(),
  primary key (organization_id, run_id)
);

create table public.server_audit_events (
  event_id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  run_id uuid not null,
  event_index integer not null check (event_index >= 0),
  action text not null check (char_length(action) between 1 and 80),
  entity_type text,
  entity_id text,
  before_version bigint,
  after_version bigint,
  before_payload jsonb,
  after_payload jsonb,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  occurred_at timestamptz not null default clock_timestamp(),
  unique (organization_id, run_id, event_index),
  check ((entity_type is null) = (entity_id is null)),
  check (before_payload is null or jsonb_typeof(before_payload) = 'object'),
  check (after_payload is null or jsonb_typeof(after_payload) = 'object')
);

create index server_audit_events_org_time_idx
  on public.server_audit_events (organization_id, occurred_at desc, event_id desc);

-- Dashboard administrators populate this table only after matching a requested
-- email address to the corresponding auth.users UUID. It is never exposed.
create table app_private.bootstrap_owner_allowlist (
  user_id uuid primary key references auth.users(id) on delete cascade,
  allowed_at timestamptz not null default clock_timestamp(),
  allowed_by text not null check (char_length(btrim(allowed_by)) between 1 and 200),
  organization_id uuid unique references public.organizations(id) on delete restrict,
  bootstrap_run_id uuid,
  consumed_at timestamptz,
  check (
    (organization_id is null and bootstrap_run_id is null and consumed_at is null)
    or
    (organization_id is not null and bootstrap_run_id is not null and consumed_at is not null)
  )
);

-- Defense in depth for every table, including non-exposed private state.
alter table public.organizations enable row level security;
alter table public.organization_memberships enable row level security;
alter table public.entity_records enable row level security;
alter table public.entity_record_links enable row level security;
alter table public.import_manifests enable row level security;
alter table public.mutation_runs enable row level security;
alter table public.server_audit_events enable row level security;
alter table app_private.bootstrap_owner_allowlist enable row level security;

create function app_private.membership_role(p_organization_id uuid, p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select m.role
  from public.organization_memberships as m
  where m.organization_id = p_organization_id
    and m.user_id = p_user_id
$$;

create function app_private.is_org_member(p_organization_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id is not null and exists (
    select 1
    from public.organization_memberships as m
    where m.organization_id = p_organization_id
      and m.user_id = p_user_id
  )
$$;

revoke all on function app_private.membership_role(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function app_private.is_org_member(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function app_private.is_org_member(uuid, uuid) to authenticated;

create policy organizations_member_select
on public.organizations for select to authenticated
using (app_private.is_org_member(id, (select auth.uid())));

create policy memberships_member_select
on public.organization_memberships for select to authenticated
using (app_private.is_org_member(organization_id, (select auth.uid())));

create policy entity_records_member_select
on public.entity_records for select to authenticated
using (app_private.is_org_member(organization_id, (select auth.uid())));

create policy entity_record_links_member_select
on public.entity_record_links for select to authenticated
using (app_private.is_org_member(organization_id, (select auth.uid())));

create policy import_manifests_member_select
on public.import_manifests for select to authenticated
using (app_private.is_org_member(organization_id, (select auth.uid())));

create policy mutation_runs_member_select
on public.mutation_runs for select to authenticated
using (app_private.is_org_member(organization_id, (select auth.uid())));

create policy server_audit_events_member_select
on public.server_audit_events for select to authenticated
using (app_private.is_org_member(organization_id, (select auth.uid())));

-- Authenticated clients can read through RLS. All business writes go through
-- the narrowly granted RPCs below. anon receives no table privilege at all.
revoke all on table public.organizations from anon, authenticated, service_role;
revoke all on table public.organization_memberships from anon, authenticated, service_role;
revoke all on table public.entity_records from anon, authenticated, service_role;
revoke all on table public.entity_record_links from anon, authenticated, service_role;
revoke all on table public.import_manifests from anon, authenticated, service_role;
revoke all on table public.mutation_runs from anon, authenticated, service_role;
revoke all on table public.server_audit_events from anon, authenticated, service_role;
revoke all on sequence public.server_audit_events_event_id_seq from anon, authenticated, service_role;
grant select on table public.organizations to authenticated;
grant select on table public.organization_memberships to authenticated;
grant select on table public.entity_records to authenticated;
grant select on table public.entity_record_links to authenticated;
grant select on table public.import_manifests to authenticated;
grant select on table public.mutation_runs to authenticated;
grant select on table public.server_audit_events to authenticated;
revoke all on table app_private.bootstrap_owner_allowlist from public, anon, authenticated, service_role;

create function app_private.reject_immutable_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception using errcode = '55000', message = format('%I is append-only', tg_table_name);
end;
$$;

revoke all on function app_private.reject_immutable_mutation() from public, anon, authenticated, service_role;

create trigger server_audit_events_immutable
before update or delete on public.server_audit_events
for each row execute function app_private.reject_immutable_mutation();

create trigger import_manifests_immutable
before update or delete on public.import_manifests
for each row execute function app_private.reject_immutable_mutation();

create trigger mutation_runs_immutable
before update or delete on public.mutation_runs
for each row execute function app_private.reject_immutable_mutation();

create function app_private.protect_last_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and (
    new.organization_id <> old.organization_id or new.user_id <> old.user_id
  ) then
    raise exception using errcode = '22023', message = 'membership identity is immutable';
  end if;

  if old.role = 'owner'
     and (tg_op = 'DELETE' or new.role <> 'owner')
     and not exists (
       select 1
       from public.organization_memberships as other_owner
       where other_owner.organization_id = old.organization_id
         and other_owner.user_id <> old.user_id
         and other_owner.role = 'owner'
     ) then
    raise exception using errcode = '23514', message = 'the last organization owner cannot be removed or demoted';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function app_private.protect_last_owner() from public, anon, authenticated, service_role;

create trigger organization_memberships_protect_last_owner
before update or delete on public.organization_memberships
for each row execute function app_private.protect_last_owner();

create function app_private.is_bounded_string_array(
  p_value jsonb,
  p_max_count integer,
  p_max_length integer
)
returns boolean
language plpgsql
immutable
security invoker
set search_path = ''
as $$
begin
  if p_value is null or jsonb_typeof(p_value) <> 'array'
     or p_max_count < 0 or p_max_length < 1 then
    return false;
  end if;
  if jsonb_array_length(p_value) > p_max_count then
    return false;
  end if;
  return not exists (
    select 1 from jsonb_array_elements(p_value) as item(value)
    where jsonb_typeof(item.value) <> 'string'
       or char_length(item.value #>> '{}') > p_max_length
  );
end;
$$;

revoke all on function app_private.is_bounded_string_array(jsonb, integer, integer)
  from public, anon, authenticated, service_role;

create function app_private.validate_entity_payload(
  p_entity_type text,
  p_entity_id text,
  p_payload jsonb
)
returns void
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  v_array jsonb;
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception using errcode = '22023', message = 'entity payload must be a JSON object';
  end if;
  if pg_column_size(p_payload) > 262144 then
    raise exception using errcode = '22023', message = 'entity payload exceeds 256 KiB';
  end if;
  if (select count(*) from jsonb_object_keys(p_payload)) > 128 then
    raise exception using errcode = '22023', message = 'entity payload has too many top-level keys';
  end if;
  if jsonb_typeof(p_payload->'id') <> 'string' or p_payload->>'id' <> p_entity_id then
    raise exception using errcode = '22023', message = 'payload id must equal entity id';
  end if;

  case p_entity_type
    when 'task' then
      if jsonb_typeof(p_payload->'title') <> 'string'
         or char_length(p_payload->>'title') not between 1 and 500
         or jsonb_typeof(p_payload->'phase') <> 'number'
         or (p_payload->>'phase')::numeric not between 0 and 6
         or trunc((p_payload->>'phase')::numeric) <> (p_payload->>'phase')::numeric
         or jsonb_typeof(p_payload->'teamId') <> 'string'
         or char_length(p_payload->>'teamId') not between 1 and 80
         or jsonb_typeof(p_payload->'team') <> 'string'
         or jsonb_typeof(p_payload->'rawTeam') <> 'string'
         or jsonb_typeof(p_payload->'owner') <> 'string'
         or not app_private.is_bounded_string_array(p_payload->'assignees', 256, 200)
         or jsonb_typeof(p_payload->'rawAssignees') <> 'string'
         or not app_private.is_bounded_string_array(p_payload->'personKeys', 256, 200)
         or jsonb_typeof(p_payload->'urgency') <> 'string'
         or jsonb_typeof(p_payload->'deadline') <> 'string'
         or jsonb_typeof(p_payload->'status') <> 'string'
         or char_length(p_payload->>'status') not between 1 and 80
         or jsonb_typeof(p_payload->'holdReason') <> 'string'
         or jsonb_typeof(p_payload->'updatedAt') <> 'string'
         or char_length(p_payload->>'updatedAt') not between 20 and 40
         or not app_private.is_bounded_string_array(p_payload->'dependencies', 256, 256)
         or not app_private.is_bounded_string_array(p_payload->'notes', 512, 4000)
         or jsonb_typeof(p_payload->'sourceRefs') <> 'array'
         or jsonb_array_length(p_payload->'sourceRefs') > 256
         or exists (
           select 1 from jsonb_array_elements(p_payload->'sourceRefs') as source_ref(value)
           where jsonb_typeof(source_ref.value) <> 'object'
              or jsonb_typeof(source_ref.value->'sourceId') <> 'string'
              or jsonb_typeof(source_ref.value->'fileName') <> 'string'
              or jsonb_typeof(source_ref.value->'sha256') <> 'string'
         ) then
        raise exception using errcode = '22023', message = 'task payload minimum structure is invalid';
      end if;
      if p_payload ? 'createdRunId' and (
        jsonb_typeof(p_payload->'createdRunId') <> 'string'
        or p_payload->>'createdRunId' !~ '^weekly:[0-9]{4}-W[0-9]{2}$'
      ) then
        raise exception using errcode = '22023', message = 'task createdRunId is invalid';
      end if;
      if p_payload ? 'provenance' and (
        jsonb_typeof(p_payload->'provenance') <> 'object'
        or jsonb_typeof(p_payload->'provenance'->'ruleId') <> 'string'
        or not app_private.is_bounded_string_array(
          p_payload->'provenance'->'dependencyIds', 256, 256
        )
        or (p_payload->'provenance' ? 'sourceTaskId'
          and jsonb_typeof(p_payload->'provenance'->'sourceTaskId') <> 'string')
        or (p_payload->'provenance' ? 'kpiId'
          and jsonb_typeof(p_payload->'provenance'->'kpiId') <> 'string')
      ) then
        raise exception using errcode = '22023', message = 'task provenance is invalid';
      end if;
      v_array := p_payload->'dependencies';

    when 'flow_node' then
      if jsonb_typeof(p_payload->'position') <> 'object'
         or jsonb_typeof(p_payload->'position'->'x') <> 'number'
         or jsonb_typeof(p_payload->'position'->'y') <> 'number'
         or abs((p_payload->'position'->>'x')::numeric) > 10000000
         or abs((p_payload->'position'->>'y')::numeric) > 10000000
         or jsonb_typeof(p_payload->'data') <> 'object'
         or (p_payload->'data' ? 'runId' and (
           jsonb_typeof(p_payload->'data'->'runId') <> 'string'
           or p_payload->'data'->>'runId' !~ '^weekly:[0-9]{4}-W[0-9]{2}$'
         ))
         or (p_payload->'data' ? 'taskIds'
           and not app_private.is_bounded_string_array(p_payload->'data'->'taskIds', 1024, 256)) then
        raise exception using errcode = '22023', message = 'flow node payload minimum structure is invalid';
      end if;
      v_array := coalesce(p_payload->'data'->'taskIds', '[]'::jsonb);

    when 'flow_edge' then
      if jsonb_typeof(p_payload->'source') <> 'string'
         or char_length(p_payload->>'source') not between 1 and 256
         or jsonb_typeof(p_payload->'target') <> 'string'
         or char_length(p_payload->>'target') not between 1 and 256 then
        raise exception using errcode = '22023', message = 'flow edge payload minimum structure is invalid';
      end if;
      v_array := '[]'::jsonb;

    when 'flow_viewport' then
      if p_entity_id <> 'singleton'
         or jsonb_typeof(p_payload->'x') <> 'number'
         or jsonb_typeof(p_payload->'y') <> 'number'
         or jsonb_typeof(p_payload->'zoom') <> 'number'
         or abs((p_payload->>'x')::numeric) > 10000000
         or abs((p_payload->>'y')::numeric) > 10000000
         or (p_payload->>'zoom')::numeric not between 0.01 and 16 then
        raise exception using errcode = '22023', message = 'flow viewport payload minimum structure is invalid';
      end if;
      v_array := '[]'::jsonb;

    when 'client_audit' then
      if jsonb_typeof(p_payload->'issueId') <> 'string'
         or jsonb_typeof(p_payload->'classification') <> 'string'
         or jsonb_typeof(p_payload->'targetVersion') <> 'string'
         or jsonb_typeof(p_payload->'before') <> 'string'
         or jsonb_typeof(p_payload->'after') <> 'string'
         or jsonb_typeof(p_payload->'retest') <> 'string'
         or jsonb_typeof(p_payload->'residualRisk') <> 'string'
         or jsonb_typeof(p_payload->'at') <> 'string'
         or jsonb_typeof(p_payload->'action') <> 'string'
         or jsonb_typeof(p_payload->'detail') <> 'string'
         or jsonb_typeof(p_payload->'round') <> 'number'
         or (p_payload->>'round')::numeric < 1
         or trunc((p_payload->>'round')::numeric) <> (p_payload->>'round')::numeric
         or not app_private.is_bounded_string_array(p_payload->'files', 128, 1000)
         or not app_private.is_bounded_string_array(p_payload->'evidence', 128, 4000) then
        raise exception using errcode = '22023', message = 'client audit payload minimum structure is invalid';
      end if;
      if exists (
        select 1 from jsonb_array_elements(p_payload->'files') as item(value)
        where jsonb_typeof(item.value) <> 'string' or char_length(item.value #>> '{}') > 1000
      ) or exists (
        select 1 from jsonb_array_elements(p_payload->'evidence') as item(value)
        where jsonb_typeof(item.value) <> 'string' or char_length(item.value #>> '{}') > 4000
      ) then
        raise exception using errcode = '22023', message = 'client audit arrays contain invalid values';
      end if;
      v_array := '[]'::jsonb;

    when 'kpi' then
      if p_entity_id not in ('concurrent', 'pv', 'profit', 'sponsors', 'schools', 'participants')
         or jsonb_typeof(p_payload->'label') <> 'string'
         or char_length(p_payload->>'label') not between 1 and 200
         or jsonb_typeof(p_payload->'unit') <> 'string'
         or char_length(p_payload->>'unit') not between 1 and 80
         or jsonb_typeof(p_payload->'target') <> 'number'
         or (p_payload->>'target')::numeric < 0
         or not (p_payload ? 'actual')
         or (jsonb_typeof(p_payload->'actual') not in ('number', 'null'))
         or (jsonb_typeof(p_payload->'actual') = 'number' and (p_payload->>'actual')::numeric < 0) then
        raise exception using errcode = '22023', message = 'KPI payload minimum structure is invalid';
      end if;
      v_array := '[]'::jsonb;

    when 'report_baseline' then
      if p_entity_id <> 'singleton'
         or not (p_payload ? 'value')
         or jsonb_typeof(p_payload->'value') not in ('object', 'null') then
        raise exception using errcode = '22023', message = 'report baseline payload must contain object/null value';
      end if;
      if jsonb_typeof(p_payload->'value') = 'object' and (
        jsonb_typeof(p_payload->'value'->'savedAt') <> 'string'
        or jsonb_typeof(p_payload->'value'->'statuses') <> 'object'
        or (select count(*) from jsonb_object_keys(p_payload->'value'->'statuses')) > 5000
      ) then
        raise exception using errcode = '22023', message = 'report baseline value is invalid';
      end if;
      if jsonb_typeof(p_payload->'value') = 'object' and exists (
        select 1
        from jsonb_each(p_payload->'value'->'statuses') as status_entry(task_id, value)
        where char_length(status_entry.task_id) not between 1 and 256
           or jsonb_typeof(status_entry.value) <> 'object'
           or jsonb_typeof(status_entry.value->'status') <> 'string'
           or jsonb_typeof(status_entry.value->'updatedAt') <> 'string'
      ) then
        raise exception using errcode = '22023', message = 'report baseline status entry is invalid';
      end if;
      v_array := '[]'::jsonb;

    when 'migration_archive' then
      if jsonb_typeof(p_payload->'fromSchema') <> 'number'
         or (p_payload->>'fromSchema')::numeric < 1
         or trunc((p_payload->>'fromSchema')::numeric) <> (p_payload->>'fromSchema')::numeric
         or jsonb_typeof(p_payload->'migratedAt') <> 'string'
         or jsonb_typeof(p_payload->'reason') <> 'string'
         or char_length(p_payload->>'reason') not between 1 and 2000
         or jsonb_typeof(p_payload->'tasks') <> 'array'
         or jsonb_array_length(p_payload->'tasks') > 5000
         or exists (
           select 1 from jsonb_array_elements(p_payload->'tasks') as archived_task(value)
           where jsonb_typeof(archived_task.value) <> 'object'
         ) then
        raise exception using errcode = '22023', message = 'migration archive payload minimum structure is invalid';
      end if;
      v_array := '[]'::jsonb;

    when 'weekly_run' then
      if jsonb_typeof(p_payload->'runId') <> 'string'
         or p_payload->>'runId' <> p_entity_id
         or p_entity_id !~ '^weekly:[0-9]{4}-W[0-9]{2}$'
         or jsonb_typeof(p_payload->'scheduledFor') <> 'string'
         or jsonb_typeof(p_payload->'ranAt') <> 'string'
         or jsonb_typeof(p_payload->'trigger') <> 'string'
         or p_payload->>'trigger' not in ('scheduled', 'catch-up', 'manual')
         or jsonb_typeof(p_payload->'outcome') <> 'string'
         or p_payload->>'outcome' <> 'success'
         or jsonb_typeof(p_payload->'missedWeekCount') <> 'number'
         or (p_payload->>'missedWeekCount')::numeric < 0
         or jsonb_typeof(p_payload->'addedStickyCount') <> 'number'
         or (p_payload->>'addedStickyCount')::numeric < 0
         or jsonb_typeof(p_payload->'autoTaskCount') <> 'number'
         or (p_payload->>'autoTaskCount')::numeric < 0
         or not app_private.is_bounded_string_array(p_payload->'reasons', 256, 4000)
         or jsonb_typeof(p_payload->'snapshot') <> 'object'
         or jsonb_typeof(p_payload->'snapshot'->'completed') <> 'number'
         or (p_payload->'snapshot'->>'completed')::numeric < 0
         or jsonb_typeof(p_payload->'snapshot'->'total') <> 'number'
         or (p_payload->'snapshot'->>'total')::numeric < 0
         or (p_payload->'snapshot'->>'completed')::numeric > (p_payload->'snapshot'->>'total')::numeric
         or jsonb_typeof(p_payload->'snapshot'->'highUrgencyRemaining') <> 'number'
         or jsonb_typeof(p_payload->'snapshot'->'blockers') <> 'number'
         or jsonb_typeof(p_payload->'snapshot'->'phaseProgress') <> 'object'
         or jsonb_typeof(p_payload->'snapshot'->'kpis') <> 'array'
         or jsonb_array_length(p_payload->'snapshot'->'kpis') > 64 then
        raise exception using errcode = '22023', message = 'weekly run payload minimum structure is invalid';
      end if;
      if exists (
        select 1 from jsonb_array_elements(p_payload->'snapshot'->'kpis') as snapshot_kpi(value)
        where jsonb_typeof(snapshot_kpi.value) <> 'object'
           or jsonb_typeof(snapshot_kpi.value->'id') <> 'string'
           or jsonb_typeof(snapshot_kpi.value->'label') <> 'string'
           or jsonb_typeof(snapshot_kpi.value->'target') <> 'number'
           or not (snapshot_kpi.value ? 'actual')
           or jsonb_typeof(snapshot_kpi.value->'actual') not in ('number', 'null')
      ) then
        raise exception using errcode = '22023', message = 'weekly run KPI snapshot is invalid';
      end if;
      v_array := p_payload->'reasons';

    when 'weekly_completion' then
      if jsonb_typeof(p_payload->'taskId') <> 'string'
         or p_payload->>'taskId' <> p_entity_id
         or jsonb_typeof(p_payload->'firstSeen') <> 'string'
         or jsonb_typeof(p_payload->'lastConfirmed') <> 'string'
         or jsonb_typeof(p_payload->'completedWeek') <> 'string'
         or jsonb_typeof(p_payload->'basis') <> 'string'
         or p_payload->>'basis' not in ('status-change', 'inferred-from-updatedAt')
         or jsonb_typeof(p_payload->'currentStatus') <> 'string' then
        raise exception using errcode = '22023', message = 'weekly completion payload minimum structure is invalid';
      end if;
      v_array := '[]'::jsonb;

    when 'weekly_tombstone' then
      if jsonb_typeof(p_payload->'fingerprint') <> 'string'
         or char_length(p_payload->>'fingerprint') not between 1 and 2048 then
        raise exception using errcode = '22023', message = 'weekly tombstone payload minimum structure is invalid';
      end if;
      v_array := '[]'::jsonb;

    when 'weekly_meta' then
      if p_entity_id <> 'singleton'
         or not (p_payload ? 'lastRunId')
         or jsonb_typeof(p_payload->'lastRunId') not in ('string', 'null')
         or (jsonb_typeof(p_payload->'lastRunId') = 'string'
           and p_payload->>'lastRunId' !~ '^weekly:[0-9]{4}-W[0-9]{2}$') then
        raise exception using errcode = '22023', message = 'weekly metadata payload minimum structure is invalid';
      end if;
      v_array := '[]'::jsonb;

    else
      raise exception using errcode = '22023', message = 'unsupported entity type';
  end case;

  if jsonb_array_length(v_array) > 0 and exists (
    select 1 from jsonb_array_elements(v_array) as item(value)
    where jsonb_typeof(item.value) <> 'string'
       or char_length(item.value #>> '{}') not between 1 and 2048
  ) then
    raise exception using errcode = '22023', message = 'entity array contains invalid string values';
  end if;
end;
$$;

revoke all on function app_private.validate_entity_payload(text, text, jsonb)
  from public, anon, authenticated, service_role;

create function app_private.execute_changes(
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
         'weekly_tombstone', 'weekly_meta'
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
      and c.value->>'entityType' = 'flow_node'
      and c.value->'payload'->'data' ? 'taskIds'
      and jsonb_typeof(c.value->'payload'->'data'->'taskIds') <> 'array'
  ) then
    raise exception using errcode = '22023', message = 'flow node taskIds must be an array';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_changes) as c(value)
    cross join lateral jsonb_array_elements(coalesce(c.value->'payload'->'data'->'taskIds', '[]'::jsonb)) as t(value)
    where c.value->>'op' = 'upsert'
      and c.value->>'entityType' = 'flow_node'
      and (
        jsonb_typeof(t.value) <> 'string'
        or not exists (
          select 1 from jsonb_array_elements(coalesce(c.value->'references', '[]'::jsonb)) as r(value)
          where r.value->>'kind' = 'task'
            and r.value->>'entityType' = 'task'
            and r.value->>'entityId' = t.value #>> '{}'
        )
      )
  ) then
    raise exception using errcode = '22023', message = 'flow node task links must match its payload';
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
           'weekly_tombstone', 'weekly_meta'
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
  return v_result;
end;
$$;

revoke all on function app_private.execute_changes(uuid, bigint, jsonb, uuid, text, text, jsonb, jsonb)
  from public, anon, authenticated, service_role;

create function public.rpc_bootstrap_organization(p_name text, p_slug text, p_run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_allow app_private.bootstrap_owner_allowlist%rowtype;
  v_organization_id uuid;
  v_result jsonb;
  v_request jsonb;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if p_run_id is null or char_length(btrim(p_name)) not between 1 and 120
     or p_slug !~ '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$' then
    raise exception using errcode = '22023', message = 'invalid bootstrap input';
  end if;
  select a.* into v_allow
  from app_private.bootstrap_owner_allowlist as a
  where a.user_id = v_actor
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'user is not on the bootstrap owner allowlist';
  end if;
  if v_allow.organization_id is not null then
    select jsonb_build_object(
      'organizationId', o.id, 'name', o.name, 'slug', o.slug, 'status', o.status,
      'stateVersion', o.state_version, 'role', 'owner', 'runId', v_allow.bootstrap_run_id,
      'idempotent', true
    ) into v_result
    from public.organizations as o where o.id = v_allow.organization_id;
    return v_result;
  end if;

  v_organization_id := gen_random_uuid();
  insert into public.organizations (id, name, slug, created_by, updated_by)
  values (v_organization_id, btrim(p_name), p_slug, v_actor, v_actor);
  insert into public.organization_memberships (
    organization_id, user_id, role, created_by, updated_by
  ) values (v_organization_id, v_actor, 'owner', v_actor, v_actor);
  update app_private.bootstrap_owner_allowlist as a
  set organization_id = v_organization_id,
      bootstrap_run_id = p_run_id,
      consumed_at = clock_timestamp()
  where a.user_id = v_actor;

  v_result := jsonb_build_object(
    'organizationId', v_organization_id, 'name', btrim(p_name), 'slug', p_slug,
    'status', 'active', 'stateVersion', 0, 'role', 'owner', 'runId', p_run_id,
    'idempotent', false
  );
  v_request := jsonb_build_object('name', btrim(p_name), 'slug', p_slug, 'runId', p_run_id);
  insert into public.server_audit_events (
    organization_id, run_id, event_index, action, metadata, actor_user_id
  ) values (
    v_organization_id, p_run_id, 0, 'organization_bootstrap',
    jsonb_build_object('slug', p_slug, 'role', 'owner'), v_actor
  );
  insert into public.mutation_runs (
    organization_id, run_id, operation, request_payload, request_fingerprint,
    result, actor_user_id
  ) values (
    v_organization_id, p_run_id, 'bootstrap', v_request, md5(v_request::text), v_result, v_actor
  );
  return v_result;
end;
$$;

create function public.rpc_list_my_organizations()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', o.id,
    'name', o.name,
    'slug', o.slug,
    'status', o.status,
    'stateVersion', o.state_version,
    'role', m.role
  ) order by o.name, o.id), '[]'::jsonb)
  from public.organization_memberships as m
  join public.organizations as o on o.id = m.organization_id
  where m.user_id = auth.uid()
$$;

create function public.rpc_read_snapshot(p_organization_id uuid)
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
            and l.from_entity_type = e.entity_type
            and l.from_entity_id = e.entity_id
        ), '[]'::jsonb)
      ) order by e.entity_type, e.ordinal, e.entity_id)
      from public.entity_records as e where e.organization_id = o.id
    ), '[]'::jsonb),
    'importState', (
      select jsonb_build_object(
        'status', case
          when count(i.id) > 0 then 'imported'
          when exists (select 1 from public.entity_records as er where er.organization_id = o.id)
            then 'populated_without_manifest'
          else 'empty'
        end,
        'manifestCount', count(i.id),
        'lastManifestAt', max(i.imported_at)
      )
      from public.import_manifests as i where i.organization_id = o.id
    ),
    'readAt', clock_timestamp()
  ) into v_result
  from public.organizations as o
  where o.id = p_organization_id;
  if v_result is null then
    raise exception using errcode = 'P0002', message = 'organization not found';
  end if;
  return v_result;
end;
$$;

create function public.rpc_apply_changes(
  p_organization_id uuid,
  p_expected_state_version bigint,
  p_changes jsonb,
  p_run_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request jsonb := jsonb_build_object(
    'organizationId', p_organization_id, 'expectedStateVersion', p_expected_state_version,
    'changes', p_changes, 'runId', p_run_id
  );
begin
  return app_private.execute_changes(
    p_organization_id, p_expected_state_version, p_changes, p_run_id,
    'apply_changes', 'editor', v_request, '{}'::jsonb
  );
end;
$$;

create function public.rpc_save_weekly(
  p_organization_id uuid,
  p_expected_state_version bigint,
  p_changes jsonb,
  p_run_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request jsonb := jsonb_build_object(
    'organizationId', p_organization_id, 'expectedStateVersion', p_expected_state_version,
    'changes', p_changes, 'runId', p_run_id
  );
begin
  if exists (
    select 1 from jsonb_array_elements(p_changes) as c(value)
    where coalesce(c.value->>'entityType', '') not in (
      'task', 'flow_node', 'flow_edge', 'client_audit', 'weekly_run',
      'weekly_completion', 'weekly_tombstone', 'weekly_meta'
    )
  ) then
    raise exception using errcode = '22023', message = 'weekly transaction contains an unsupported entity type';
  end if;
  return app_private.execute_changes(
    p_organization_id, p_expected_state_version, p_changes, p_run_id,
    'weekly_save', 'editor', v_request, '{}'::jsonb
  );
end;
$$;

create function public.rpc_import_v4(
  p_organization_id uuid,
  p_expected_state_version bigint,
  p_run_id uuid,
  p_raw_sha256 text,
  p_semantic_fingerprint text,
  p_source_origin text,
  p_source_size bigint,
  p_source_entity_count integer,
  p_entities jsonb
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
  v_existing_manifest public.import_manifests%rowtype;
  v_manifest_id uuid := gen_random_uuid();
  v_request jsonb;
  v_result jsonb;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if coalesce(p_raw_sha256, '') !~ '^[0-9a-f]{64}$'
     or char_length(coalesce(p_semantic_fingerprint, '')) not between 1 and 2048
     or char_length(btrim(coalesce(p_source_origin, ''))) not between 1 and 500
     or coalesce(p_source_size, 0) <= 0
     or coalesce(p_source_entity_count, -1) < 0
     or p_entities is null
     or jsonb_typeof(p_entities) <> 'array'
     or jsonb_array_length(p_entities) <> p_source_entity_count then
    raise exception using errcode = '22023', message = 'invalid import manifest or entity count';
  end if;
  v_request := jsonb_build_object(
    'organizationId', p_organization_id, 'expectedStateVersion', p_expected_state_version,
    'runId', p_run_id, 'rawSha256', p_raw_sha256,
    'semanticFingerprint', p_semantic_fingerprint, 'sourceOrigin', btrim(p_source_origin),
    'sourceSize', p_source_size, 'sourceEntityCount', p_source_entity_count,
    'entities', p_entities
  );

  select o.state_version into v_state_version
  from public.organizations as o where o.id = p_organization_id and o.status = 'active'
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'active organization not found';
  end if;
  v_role := app_private.membership_role(p_organization_id, v_actor);
  if v_role is distinct from 'owner' then
    raise exception using errcode = '42501', message = 'owner role required for import';
  end if;

  select r.* into v_existing_run
  from public.mutation_runs as r
  where r.organization_id = p_organization_id and r.run_id = p_run_id;
  if found then
    if v_existing_run.operation <> 'import_v4' or v_existing_run.request_payload <> v_request then
      raise exception using errcode = '22023', message = 'run id was already used with a different request';
    end if;
    return v_existing_run.result || jsonb_build_object('idempotent', true);
  end if;

  select i.* into v_existing_manifest
  from public.import_manifests as i
  where i.organization_id = p_organization_id
    and i.semantic_fingerprint = p_semantic_fingerprint;
  if found then
    v_result := jsonb_build_object(
      'organizationId', p_organization_id, 'stateVersion', v_state_version,
      'runId', p_run_id, 'operation', 'import_v4', 'manifestId', v_existing_manifest.id,
      'manifestStatus', 'already_imported', 'changedCount', 0, 'idempotent', true,
      'committedAt', clock_timestamp()
    );
    insert into public.server_audit_events (
      organization_id, run_id, event_index, action, metadata, actor_user_id
    ) values (
      p_organization_id, p_run_id, 0, 'import_duplicate',
      jsonb_build_object('manifestId', v_existing_manifest.id, 'semanticFingerprint', p_semantic_fingerprint),
      v_actor
    );
    insert into public.mutation_runs (
      organization_id, run_id, operation, request_payload, request_fingerprint,
      result, actor_user_id
    ) values (
      p_organization_id, p_run_id, 'import_v4', v_request, md5(v_request::text), v_result, v_actor
    );
    return v_result;
  end if;

  if exists (select 1 from public.entity_records as e where e.organization_id = p_organization_id)
     or exists (select 1 from public.import_manifests as i where i.organization_id = p_organization_id) then
    raise exception using errcode = '55000', message = 'organization is not empty; merge/replace import is intentionally unsupported';
  end if;

  v_result := app_private.execute_changes(
    p_organization_id, p_expected_state_version, p_entities, p_run_id,
    'import_v4', 'owner', v_request,
    jsonb_build_object('manifestId', v_manifest_id, 'manifestStatus', 'completed')
  );
  insert into public.import_manifests (
    id, organization_id, run_id, source_schema, source_origin, source_size,
    source_entity_count, raw_sha256, semantic_fingerprint, imported_by
  ) values (
    v_manifest_id, p_organization_id, p_run_id, 4, btrim(p_source_origin), p_source_size,
    p_source_entity_count, p_raw_sha256, p_semantic_fingerprint, v_actor
  );
  insert into public.server_audit_events (
    organization_id, run_id, event_index, action, metadata, actor_user_id
  ) values (
    p_organization_id, p_run_id, 0, 'import_v4',
    jsonb_build_object(
      'manifestId', v_manifest_id, 'rawSha256', p_raw_sha256,
      'semanticFingerprint', p_semantic_fingerprint,
      'sourceEntityCount', p_source_entity_count, 'sourceSize', p_source_size
    ), v_actor
  );
  return v_result;
end;
$$;

create function public.rpc_list_memberships(p_organization_id uuid)
returns jsonb
language plpgsql
stable
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
  if app_private.membership_role(p_organization_id, v_actor) is distinct from 'owner' then
    raise exception using errcode = '42501', message = 'owner role required to list memberships';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'userId', m.user_id,
    'role', m.role,
    'version', m.version,
    'createdAt', m.created_at,
    'updatedAt', m.updated_at,
    'createdBy', m.created_by,
    'updatedBy', m.updated_by
  ) order by m.role, m.user_id), '[]'::jsonb)
  into v_result
  from public.organization_memberships as m
  where m.organization_id = p_organization_id;
  return v_result;
end;
$$;

create function public.rpc_manage_membership(
  p_organization_id uuid,
  p_user_id uuid,
  p_role text,
  p_action text,
  p_expected_state_version bigint,
  p_expected_membership_version bigint,
  p_run_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_role text;
  v_state_version bigint;
  v_existing_run public.mutation_runs%rowtype;
  v_before public.organization_memberships%rowtype;
  v_membership_exists boolean;
  v_after_version bigint;
  v_request jsonb;
  v_result jsonb;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if p_run_id is null
     or coalesce(p_expected_state_version, -1) < 0
     or coalesce(p_expected_membership_version, -1) < 0
     or p_action is null or p_action not in ('upsert', 'remove')
     or (p_action = 'upsert' and p_role not in ('owner', 'editor', 'viewer'))
     or (p_action = 'remove' and p_role is not null) then
    raise exception using errcode = '22023', message = 'invalid membership mutation';
  end if;
  if not exists (select 1 from auth.users as u where u.id = p_user_id) then
    raise exception using errcode = '23503', message = 'target auth user does not exist';
  end if;
  select o.state_version into v_state_version
  from public.organizations as o where o.id = p_organization_id and o.status = 'active'
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'active organization not found';
  end if;
  v_actor_role := app_private.membership_role(p_organization_id, v_actor);
  if v_actor_role is distinct from 'owner' then
    raise exception using errcode = '42501', message = 'owner role required to manage membership';
  end if;
  v_request := jsonb_build_object(
    'organizationId', p_organization_id, 'userId', p_user_id,
    'role', p_role, 'action', p_action,
    'expectedStateVersion', p_expected_state_version,
    'expectedMembershipVersion', p_expected_membership_version,
    'runId', p_run_id
  );
  select r.* into v_existing_run
  from public.mutation_runs as r
  where r.organization_id = p_organization_id and r.run_id = p_run_id;
  if found then
    if v_existing_run.operation <> 'membership' or v_existing_run.request_payload <> v_request then
      raise exception using errcode = '22023', message = 'run id was already used with a different request';
    end if;
    return v_existing_run.result || jsonb_build_object('idempotent', true);
  end if;

  if v_state_version <> p_expected_state_version then
    raise exception using errcode = '40001', message = format(
      'state version conflict: expected %s, actual %s', p_expected_state_version, v_state_version
    );
  end if;

  select m.* into v_before
  from public.organization_memberships as m
  where m.organization_id = p_organization_id and m.user_id = p_user_id
  for update;
  v_membership_exists := found;
  if (v_membership_exists and v_before.version <> p_expected_membership_version)
     or (not v_membership_exists and p_expected_membership_version <> 0) then
    raise exception using errcode = '40001', message = format(
      'membership version conflict: expected %s, actual %s',
      p_expected_membership_version,
      case when v_membership_exists then v_before.version::text else '0' end
    );
  end if;
  if p_action = 'remove' then
    if not v_membership_exists then
      raise exception using errcode = 'P0002', message = 'membership not found';
    end if;
    delete from public.organization_memberships as m
    where m.organization_id = p_organization_id and m.user_id = p_user_id;
    v_after_version := null;
  elsif v_membership_exists then
    v_after_version := v_before.version + 1;
    update public.organization_memberships as m
    set role = p_role, version = v_after_version,
        updated_at = clock_timestamp(), updated_by = v_actor
    where m.organization_id = p_organization_id and m.user_id = p_user_id;
  else
    v_after_version := 1;
    insert into public.organization_memberships (
      organization_id, user_id, role, version, created_by, updated_by
    ) values (p_organization_id, p_user_id, p_role, 1, v_actor, v_actor);
  end if;

  update public.organizations as o
  set state_version = o.state_version + 1, updated_at = clock_timestamp(), updated_by = v_actor
  where o.id = p_organization_id
  returning o.state_version into v_state_version;
  v_result := jsonb_build_object(
    'organizationId', p_organization_id, 'stateVersion', v_state_version,
    'runId', p_run_id, 'userId', p_user_id,
    'role', case when p_action = 'remove' then null else p_role end,
    'action', p_action, 'membershipVersion', v_after_version,
    'previousMembershipVersion', case when v_membership_exists then v_before.version else 0 end,
    'idempotent', false, 'committedAt', clock_timestamp()
  );
  insert into public.server_audit_events (
    organization_id, run_id, event_index, action, entity_type, entity_id,
    before_version, after_version, before_payload, after_payload, metadata, actor_user_id
  ) values (
    p_organization_id, p_run_id, 0, 'membership_' || p_action,
    'membership', p_user_id::text, v_before.version, v_after_version,
    case when v_before.user_id is null then null else jsonb_build_object('role', v_before.role) end,
    case when p_action = 'remove' then null else jsonb_build_object('role', p_role) end,
    '{}'::jsonb, v_actor
  );
  insert into public.mutation_runs (
    organization_id, run_id, operation, request_payload, request_fingerprint,
    result, actor_user_id
  ) values (
    p_organization_id, p_run_id, 'membership', v_request, md5(v_request::text), v_result, v_actor
  );
  return v_result;
end;
$$;

-- PostgreSQL grants EXECUTE to PUBLIC when a function is created. Remove that
-- implicit grant first, deny anon explicitly, and expose only the intended RPCs.
revoke all on function public.rpc_bootstrap_organization(text, text, uuid) from public, anon, authenticated, service_role;
revoke all on function public.rpc_list_my_organizations() from public, anon, authenticated, service_role;
revoke all on function public.rpc_read_snapshot(uuid) from public, anon, authenticated, service_role;
revoke all on function public.rpc_apply_changes(uuid, bigint, jsonb, uuid) from public, anon, authenticated, service_role;
revoke all on function public.rpc_save_weekly(uuid, bigint, jsonb, uuid) from public, anon, authenticated, service_role;
revoke all on function public.rpc_import_v4(uuid, bigint, uuid, text, text, text, bigint, integer, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.rpc_list_memberships(uuid) from public, anon, authenticated, service_role;
revoke all on function public.rpc_manage_membership(uuid, uuid, text, text, bigint, bigint, uuid) from public, anon, authenticated, service_role;
grant execute on function public.rpc_bootstrap_organization(text, text, uuid) to authenticated;
grant execute on function public.rpc_list_my_organizations() to authenticated;
grant execute on function public.rpc_read_snapshot(uuid) to authenticated;
grant execute on function public.rpc_apply_changes(uuid, bigint, jsonb, uuid) to authenticated;
grant execute on function public.rpc_save_weekly(uuid, bigint, jsonb, uuid) to authenticated;
grant execute on function public.rpc_import_v4(uuid, bigint, uuid, text, text, text, bigint, integer, jsonb) to authenticated;
grant execute on function public.rpc_list_memberships(uuid) to authenticated;
grant execute on function public.rpc_manage_membership(uuid, uuid, text, text, bigint, bigint, uuid) to authenticated;

-- The project may already contain Supabase's optional event-trigger helper.
-- It never needs to be callable from the Data API.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke execute on function public.rls_auto_enable() from public, anon, authenticated, service_role';
  end if;
end;
$$;
