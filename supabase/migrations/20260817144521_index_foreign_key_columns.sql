-- Add indexes for the ten foreign-key columns reported by Database Advisors.
-- Existing primary, unique, and composite indexes already cover every other FK.

create index if not exists organizations_created_by_idx
  on public.organizations (created_by);

create index if not exists organizations_updated_by_idx
  on public.organizations (updated_by);

create index if not exists organization_memberships_created_by_idx
  on public.organization_memberships (created_by);

create index if not exists organization_memberships_updated_by_idx
  on public.organization_memberships (updated_by);

create index if not exists entity_records_created_by_idx
  on public.entity_records (created_by);

create index if not exists entity_records_updated_by_idx
  on public.entity_records (updated_by);

create index if not exists entity_record_links_created_by_idx
  on public.entity_record_links (created_by);

create index if not exists import_manifests_imported_by_idx
  on public.import_manifests (imported_by);

create index if not exists mutation_runs_actor_user_id_idx
  on public.mutation_runs (actor_user_id);

create index if not exists server_audit_events_actor_user_id_idx
  on public.server_audit_events (actor_user_id);
