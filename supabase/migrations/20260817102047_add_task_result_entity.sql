-- Add schema-v4 task result sheets without changing RPC signatures or legacy payload validation.

alter table public.entity_records
  drop constraint entity_records_entity_type_check;

alter table public.entity_records
  add constraint entity_records_entity_type_check
  check (entity_type in (
    'task', 'flow_node', 'flow_edge', 'flow_viewport', 'client_audit', 'kpi',
    'report_baseline', 'migration_archive', 'weekly_run', 'weekly_completion',
    'weekly_tombstone', 'weekly_meta', 'task_result'
  ));

-- Preserve the applied validator unchanged for every pre-existing entity type.
alter function app_private.validate_entity_payload(text, text, jsonb)
  rename to validate_entity_payload_v4_legacy;

revoke all on function app_private.validate_entity_payload_v4_legacy(text, text, jsonb)
  from public, anon, authenticated, service_role;

create function app_private.validate_task_result_payload(
  p_entity_id text,
  p_payload jsonb
)
returns void
language plpgsql
immutable
security invoker
set search_path = ''
as $function$
declare
  v_deliverable jsonb;
  v_authority text;
  v_href text;
  v_host text;
  v_host_labels text[];
  v_label text;
  v_port_text text;
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception using errcode = '22023',
      message = 'task result payload must be a JSON object';
  end if;
  if pg_column_size(p_payload) > 262144 then
    raise exception using errcode = '22023',
      message = 'task result payload exceeds 256 KiB';
  end if;
  if (select count(*) from jsonb_object_keys(p_payload)) > 128 then
    raise exception using errcode = '22023',
      message = 'task result payload has too many top-level keys';
  end if;
  if exists (
    select 1
    from jsonb_object_keys(p_payload) as payload_key(key_name)
    where payload_key.key_name not in (
      'id', 'taskId', 'resultBody', 'verificationState', 'verificationSummary',
      'verifiedBy', 'verifiedAt', 'deliverables', 'nextStep',
      'completionCriteria', 'verificationMemo', 'updatedAt'
    )
  ) then
    raise exception using errcode = '22023',
      message = 'task result payload contains an unsupported field';
  end if;

  if jsonb_typeof(p_payload->'id') is distinct from 'string'
     or p_payload->>'id' <> p_entity_id
     or jsonb_typeof(p_payload->'taskId') is distinct from 'string'
     or char_length(p_payload->>'taskId') not between 1 and 244
     or p_entity_id <> 'task-result:' || (p_payload->>'taskId')
     or jsonb_typeof(p_payload->'resultBody') is distinct from 'string'
     or char_length(p_payload->>'resultBody') > 10000
     or jsonb_typeof(p_payload->'verificationState') is distinct from 'string'
     or p_payload->>'verificationState' not in (
       '未確認', '確認中', '適合', '要修正', '確認不能'
     )
     or jsonb_typeof(p_payload->'verificationSummary') is distinct from 'string'
     or char_length(p_payload->>'verificationSummary') > 4000
     or jsonb_typeof(p_payload->'nextStep') is distinct from 'string'
     or char_length(p_payload->>'nextStep') > 4000
     or jsonb_typeof(p_payload->'completionCriteria') is distinct from 'string'
     or char_length(p_payload->>'completionCriteria') > 4000
     or jsonb_typeof(p_payload->'verificationMemo') is distinct from 'string'
     or char_length(p_payload->>'verificationMemo') > 10000
     or jsonb_typeof(p_payload->'updatedAt') is distinct from 'string'
     or char_length(p_payload->>'updatedAt') not between 19 and 40
     or p_payload->>'updatedAt'
       !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}'
     or (p_payload ? 'verifiedBy'
       and jsonb_typeof(p_payload->'verifiedBy') is distinct from 'string')
     or (jsonb_typeof(p_payload->'verifiedBy') = 'string'
       and char_length(p_payload->>'verifiedBy') > 200)
     or (p_payload ? 'verifiedAt'
       and jsonb_typeof(p_payload->'verifiedAt') is distinct from 'string')
     or (jsonb_typeof(p_payload->'verifiedAt') = 'string' and (
       char_length(p_payload->>'verifiedAt') not between 19 and 40
       or p_payload->>'verifiedAt'
         !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}'
     )) then
    raise exception using errcode = '22023',
      message = 'task result payload structure is invalid';
  end if;

  begin
    perform (p_payload->>'updatedAt')::timestamptz;
    if jsonb_typeof(p_payload->'verifiedAt') = 'string' then
      perform (p_payload->>'verifiedAt')::timestamptz;
    end if;
  exception when others then
    raise exception using errcode = '22023',
      message = 'task result timestamp is invalid';
  end;

  if jsonb_typeof(p_payload->'deliverables') is distinct from 'array' then
    raise exception using errcode = '22023',
      message = 'task result deliverables must be an array';
  end if;
  if jsonb_array_length(p_payload->'deliverables') > 32 then
    raise exception using errcode = '22023',
      message = 'task result deliverables exceed 32 items';
  end if;

  for v_deliverable in
    select value
    from jsonb_array_elements(p_payload->'deliverables') as deliverable(value)
  loop
    if jsonb_typeof(v_deliverable) is distinct from 'object' then
      raise exception using errcode = '22023',
        message = 'task result deliverable must be an object';
    end if;
    if exists (
      select 1
      from jsonb_object_keys(v_deliverable) as deliverable_key(key_name)
      where deliverable_key.key_name not in (
        'id', 'title', 'type', 'href', 'note', 'accessState', 'lastCheckedAt'
      )
    ) then
      raise exception using errcode = '22023',
        message = 'task result deliverable contains an unsupported field';
    end if;
    if jsonb_typeof(v_deliverable->'id') is distinct from 'string'
       or char_length(btrim(v_deliverable->>'id')) not between 1 and 100
       or jsonb_typeof(v_deliverable->'title') is distinct from 'string'
       or char_length(btrim(v_deliverable->>'title')) not between 1 and 200
       or jsonb_typeof(v_deliverable->'type') is distinct from 'string'
       or v_deliverable->>'type' not in (
         'excel', 'google-sheets', 'google-docs', 'notion', 'url', 'file', 'other'
       )
       or jsonb_typeof(v_deliverable->'accessState') is distinct from 'string'
       or v_deliverable->>'accessState' not in (
         '未確認', '利用可能', '権限不足', 'リンク切れ'
       )
       or jsonb_typeof(v_deliverable->'href') is distinct from 'string'
       or (v_deliverable ? 'note'
         and jsonb_typeof(v_deliverable->'note') is distinct from 'string')
       or (jsonb_typeof(v_deliverable->'note') = 'string'
         and char_length(v_deliverable->>'note') > 1000)
       or (v_deliverable ? 'lastCheckedAt'
         and jsonb_typeof(v_deliverable->'lastCheckedAt') is distinct from 'string')
       or (jsonb_typeof(v_deliverable->'lastCheckedAt') = 'string' and (
         char_length(v_deliverable->>'lastCheckedAt') not between 19 and 40
         or v_deliverable->>'lastCheckedAt'
           !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}'
       )) then
      raise exception using errcode = '22023',
        message = 'task result deliverable structure is invalid';
    end if;

    v_href := v_deliverable->>'href';
    if char_length(v_href) not between 1 and 2048
       or v_href ~ '[[:space:][:cntrl:]]'
       or position(chr(92) in v_href) > 0
       or v_href !~* '^https://[a-z0-9.-]+(:[0-9]{1,5})?([/?#][^[:space:][:cntrl:]]*)?$' then
      raise exception using errcode = '22023',
        message = 'task result deliverable href must use an ASCII hostname or IPv4 address over HTTPS without userinfo, whitespace, control characters, backslashes, or IPv6';
    end if;

    v_authority := split_part(
      split_part(split_part(substring(v_href from 9), '/', 1), '?', 1), '#', 1
    );
    v_host := split_part(v_authority, ':', 1);
    v_port_text := null;
    if position(':' in v_authority) > 0 then
      v_port_text := split_part(v_authority, ':', 2);
    end if;
    if v_port_text is not null and v_port_text::integer not between 1 and 65535 then
      raise exception using errcode = '22023',
        message = 'task result deliverable HTTPS port must be between 1 and 65535';
    end if;

    if char_length(v_host) not between 1 and 253 then
      raise exception using errcode = '22023',
        message = 'task result deliverable hostname must be between 1 and 253 ASCII characters';
    end if;
    v_host_labels := string_to_array(lower(v_host), '.');
    foreach v_label in array v_host_labels
    loop
      if char_length(v_label) not between 1 and 63
         or v_label !~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$' then
        raise exception using errcode = '22023',
          message = 'task result deliverable hostname contains an invalid label';
      end if;
    end loop;

    -- Numeric-only hosts are interpreted only as canonical dotted-decimal IPv4.
    -- This rejects ambiguous alternate forms and octets outside 0..255.
    if v_host ~ '^[0-9.]+$' then
      if cardinality(v_host_labels) <> 4 or exists (
        select 1
        from unnest(v_host_labels) as ipv4_octet(value)
        where ipv4_octet.value !~ '^(0|[1-9][0-9]{0,2})$'
           or case
             when ipv4_octet.value ~ '^(0|[1-9][0-9]{0,2})$'
               then ipv4_octet.value::integer > 255
             else true
           end
      ) then
        raise exception using errcode = '22023',
          message = 'task result deliverable IPv4 address must use four decimal octets from 0 through 255';
      end if;
    end if;

    if jsonb_typeof(v_deliverable->'lastCheckedAt') = 'string' then
      begin
        perform (v_deliverable->>'lastCheckedAt')::timestamptz;
      exception when others then
        raise exception using errcode = '22023',
          message = 'task result deliverable timestamp is invalid';
      end;
    end if;
  end loop;

  if exists (
    select 1
    from jsonb_array_elements(p_payload->'deliverables') as deliverable(value)
    group by deliverable.value->>'id'
    having count(*) > 1
  ) then
    raise exception using errcode = '22023',
      message = 'task result deliverable ids must be unique';
  end if;
end;
$function$;

revoke all on function app_private.validate_task_result_payload(text, jsonb)
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
as $function$
begin
  if p_entity_type = 'task_result' then
    perform app_private.validate_task_result_payload(p_entity_id, p_payload);
  else
    perform app_private.validate_entity_payload_v4_legacy(
      p_entity_type, p_entity_id, p_payload
    );
  end if;
end;
$function$;

revoke all on function app_private.validate_entity_payload(text, text, jsonb)
  from public, anon, authenticated, service_role;

create function app_private.validate_task_result_record()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if new.entity_type = 'task_result' then
    perform app_private.validate_task_result_payload(new.entity_id, new.payload);
  end if;
  return new;
end;
$function$;

revoke all on function app_private.validate_task_result_record()
  from public, anon, authenticated, service_role;

create trigger entity_records_validate_task_result
before insert or update on public.entity_records
for each row execute function app_private.validate_task_result_record();

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
  return v_result;
end;
$$;

revoke all on function app_private.execute_changes(uuid, bigint, jsonb, uuid, text, text, jsonb, jsonb)
  from public, anon, authenticated, service_role;
