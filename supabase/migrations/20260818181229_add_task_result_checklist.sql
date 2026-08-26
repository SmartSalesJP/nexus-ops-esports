-- Extend the existing schema-v4 task_result JSON contract. No table, RLS,
-- authorization, entity type, link, or RPC boundary is changed.

alter function app_private.validate_task_result_payload(text, jsonb)
  rename to validate_task_result_payload_without_checklist;

create function app_private.task_result_has_visible_text(p_value text)
returns boolean language sql immutable security invoker set search_path=''
as $function$
  select char_length(regexp_replace(
    coalesce(p_value,''),
    '[' || chr(9) || '-' || chr(13) || chr(32) || chr(160) || chr(5760)
      || chr(8192) || '-' || chr(8205) || chr(8232) || chr(8233) || chr(8239)
      || chr(8287) || chr(12288) || chr(65279) || ']',
    '', 'g'
  )) > 0
$function$;

create function app_private.validate_task_result_payload(p_entity_id text,p_payload jsonb)
returns void language plpgsql immutable security invoker set search_path=''
as $function$
declare v_item jsonb;
begin
  if p_payload is null or jsonb_typeof(p_payload)<>'object' or pg_column_size(p_payload)>262144 then
    raise exception using errcode='22023',message='task result checklist payload is invalid or exceeds 256 KiB';
  end if;
  perform app_private.validate_task_result_payload_without_checklist(
    p_entity_id, p_payload - 'checklistItems'
  );
  if not (p_payload ? 'checklistItems') then return; end if;
  if jsonb_typeof(p_payload->'checklistItems') is distinct from 'array'
     or jsonb_array_length(p_payload->'checklistItems') > 64 then
    raise exception using errcode='22023',message='task result checklistItems must be an array of at most 64 items';
  end if;
  for v_item in select value from jsonb_array_elements(p_payload->'checklistItems') loop
    if jsonb_typeof(v_item) is distinct from 'object'
       or not (v_item ?& array['id','title','status','acceptanceCriteria','assignee','reviewer','reviewedAt','evidenceMemo','holdReason'])
       or exists(select 1 from jsonb_object_keys(v_item) as item_key(key_name) where item_key.key_name not in ('id','title','status','acceptanceCriteria','assignee','reviewer','reviewedAt','evidenceMemo','holdReason'))
       or jsonb_typeof(v_item->'id') is distinct from 'string' or char_length(v_item->>'id') > 100 or not app_private.task_result_has_visible_text(v_item->>'id')
       or jsonb_typeof(v_item->'title') is distinct from 'string' or char_length(v_item->>'title') > 500 or not app_private.task_result_has_visible_text(v_item->>'title')
       or jsonb_typeof(v_item->'status') is distinct from 'string' or v_item->>'status' not in ('未着手','進行中','完了','保留')
       or jsonb_typeof(v_item->'acceptanceCriteria') is distinct from 'string' or char_length(v_item->>'acceptanceCriteria') > 1000 or not app_private.task_result_has_visible_text(v_item->>'acceptanceCriteria')
       or jsonb_typeof(v_item->'assignee') is distinct from 'string' or char_length(v_item->>'assignee') > 200
       or jsonb_typeof(v_item->'reviewer') is distinct from 'string' or char_length(v_item->>'reviewer') > 200
       or jsonb_typeof(v_item->'reviewedAt') is distinct from 'string' or char_length(v_item->>'reviewedAt') > 40
       or jsonb_typeof(v_item->'evidenceMemo') is distinct from 'string' or char_length(v_item->>'evidenceMemo') > 2000
       or jsonb_typeof(v_item->'holdReason') is distinct from 'string' or char_length(v_item->>'holdReason') > 1000
       or (v_item->>'reviewedAt' <> '' and (char_length(v_item->>'reviewedAt') < 19 or v_item->>'reviewedAt' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}'))
       or (v_item->>'status' = '完了' and (not app_private.task_result_has_visible_text(v_item->>'reviewer') or char_length(v_item->>'reviewedAt')=0 or not app_private.task_result_has_visible_text(v_item->>'evidenceMemo')))
       or (v_item->>'status' = '保留' and not app_private.task_result_has_visible_text(v_item->>'holdReason')) then
      raise exception using errcode='22023',message='task result checklist item structure is invalid';
    end if;
    if v_item->>'reviewedAt' <> '' then
      begin perform (v_item->>'reviewedAt')::timestamptz;
      exception when others then raise exception using errcode='22023',message='task result checklist reviewedAt is invalid'; end;
    end if;
  end loop;
  if exists(select 1 from jsonb_array_elements(p_payload->'checklistItems') as checklist_item(value) group by checklist_item.value->>'id' having count(*)>1) then
    raise exception using errcode='22023',message='task result checklist item ids must be unique';
  end if;
end;$function$;

revoke all on function app_private.validate_task_result_payload_without_checklist(text,jsonb) from public,anon,authenticated,service_role;
revoke all on function app_private.task_result_has_visible_text(text) from public,anon,authenticated,service_role;
revoke all on function app_private.validate_task_result_payload(text,jsonb) from public,anon,authenticated,service_role;

create or replace function app_private.validate_entity_payload(p_entity_type text,p_entity_id text,p_payload jsonb)
returns void language plpgsql immutable security invoker set search_path=''
as $function$
begin
  if p_entity_type='task_result' then perform app_private.validate_task_result_payload(p_entity_id,p_payload);
  else perform app_private.validate_entity_payload_v4_legacy(p_entity_type,p_entity_id,p_payload); end if;
end;$function$;
revoke all on function app_private.validate_entity_payload(text,text,jsonb) from public,anon,authenticated,service_role;

create or replace function app_private.validate_task_result_record()
returns trigger language plpgsql security invoker set search_path=''
as $function$
begin
  if new.entity_type='task_result' then perform app_private.validate_task_result_payload(new.entity_id,new.payload); end if;
  return new;
end;$function$;
revoke all on function app_private.validate_task_result_record() from public,anon,authenticated,service_role;
