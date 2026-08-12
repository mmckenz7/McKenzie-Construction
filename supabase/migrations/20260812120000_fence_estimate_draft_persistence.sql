begin;

create or replace function public.is_valid_fence_layout_snapshot(
  requested_run_lengths_inches integer[],
  requested_total_length_inches integer
)
returns boolean
language sql
immutable
set search_path = pg_catalog, public
as $function$
  select
    requested_run_lengths_inches is not null
    and cardinality(requested_run_lengths_inches) between 1 and 50
    and requested_total_length_inches between 1 and 60000
    and not exists (
      select 1
      from unnest(requested_run_lengths_inches) as run_length(length_inches)
      where length_inches is null
        or length_inches < 1
        or length_inches > 12000
    )
    and requested_total_length_inches = (
      select sum(length_inches)::integer
      from unnest(requested_run_lengths_inches) as run_length(length_inches)
    );
$function$;

revoke all on function public.is_valid_fence_layout_snapshot(integer[], integer)
from public, anon, authenticated;
grant execute on function public.is_valid_fence_layout_snapshot(integer[], integer)
to service_role;

create or replace function public.is_valid_fence_context_snapshot(
  requested_run_lengths_inches integer[],
  requested_needs_gate boolean,
  requested_system text,
  requested_measurement_basis text,
  requested_terrain text,
  requested_corners text,
  requested_frost_depth_inches integer,
  requested_conditions text
)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog, public
as $function$
begin
  if requested_system is null then
    return requested_measurement_basis is null and requested_terrain is null
      and requested_corners is null and requested_frost_depth_inches is null
      and requested_conditions is null;
  end if;
  if requested_system not in ('emblem_6x8_white', 'different_or_unsure') then return false; end if;
  if requested_system = 'different_or_unsure' then
    return requested_measurement_basis is null and requested_terrain is null
      and requested_corners is null and requested_frost_depth_inches is null
      and requested_conditions is null;
  end if;
  if requested_measurement_basis is null then
    return requested_terrain is null and requested_corners is null
      and requested_frost_depth_inches is null and requested_conditions is null;
  end if;
  if requested_measurement_basis not in ('post_centers', 'different_or_unsure') then return false; end if;
  if requested_measurement_basis = 'different_or_unsure' then
    return requested_terrain is null and requested_corners is null
      and requested_frost_depth_inches is null and requested_conditions is null;
  end if;
  if requested_terrain is null then
    return requested_corners is null and requested_frost_depth_inches is null
      and requested_conditions is null;
  end if;
  if requested_terrain not in ('level', 'sloped_or_unsure') then return false; end if;
  if requested_terrain = 'sloped_or_unsure' then
    return requested_corners is null and requested_frost_depth_inches is null
      and requested_conditions is null;
  end if;
  if cardinality(requested_run_lengths_inches) > 1 then
    if requested_corners is null then
      return requested_frost_depth_inches is null and requested_conditions is null;
    end if;
    if requested_corners not in ('exact_90', 'different_or_unsure') then return false; end if;
    if requested_corners = 'different_or_unsure' then
      return requested_frost_depth_inches is null and requested_conditions is null;
    end if;
  elsif requested_corners is not null then
    return false;
  end if;
  if requested_frost_depth_inches is null then return requested_conditions is null; end if;
  if requested_frost_depth_inches < 1 or requested_frost_depth_inches > 9999 then return false; end if;
  if requested_conditions is null then return true; end if;
  if requested_conditions not in ('none', 'single_gate_4ft', 'single_gate_5ft', 'pool', 'other_unsupported') then return false; end if;
  return not requested_needs_gate or requested_conditions <> 'none';
end;
$function$;

revoke all on function public.is_valid_fence_context_snapshot(integer[], boolean, text, text, text, text, integer, text)
from public, anon, authenticated;
grant execute on function public.is_valid_fence_context_snapshot(integer[], boolean, text, text, text, text, integer, text)
to service_role;

create table public.fence_estimate_drafts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company_settings(id) on delete restrict,
  estimate_id uuid not null unique references public.estimates(id) on delete restrict,
  schema_version text not null default 'fence-layout-v1',
  revision integer not null,
  run_lengths_inches integer[] not null,
  total_length_inches integer not null,
  needs_gate boolean not null default false,
  context_schema_version text not null default 'fence-context-v1',
  context_system text,
  context_measurement_basis text,
  context_terrain text,
  context_corners text,
  context_frost_depth_inches integer,
  context_conditions text,
  created_by uuid not null references public.app_users(id) on delete restrict,
  updated_by uuid not null references public.app_users(id) on delete restrict,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint fence_estimate_drafts_schema_version_check
    check (schema_version = 'fence-layout-v1'),
  constraint fence_estimate_drafts_revision_check
    check (revision >= 1),
  constraint fence_estimate_drafts_layout_check
    check (public.is_valid_fence_layout_snapshot(run_lengths_inches, total_length_inches)),
  constraint fence_estimate_drafts_context_schema_check
    check (context_schema_version = 'fence-context-v1'),
  constraint fence_estimate_drafts_context_check check (
    public.is_valid_fence_context_snapshot(
      run_lengths_inches, needs_gate, context_system, context_measurement_basis,
      context_terrain, context_corners, context_frost_depth_inches, context_conditions
    )
  )
);

create index fence_estimate_drafts_company_estimate_idx
  on public.fence_estimate_drafts(company_id, estimate_id);

create table public.fence_estimate_draft_revisions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company_settings(id) on delete restrict,
  fence_draft_id uuid not null references public.fence_estimate_drafts(id) on delete restrict,
  estimate_id uuid not null references public.estimates(id) on delete restrict,
  revision integer not null,
  event_kind text not null,
  schema_version text not null,
  run_lengths_inches integer[] not null,
  total_length_inches integer not null,
  needs_gate boolean not null,
  context_schema_version text not null,
  context_system text,
  context_measurement_basis text,
  context_terrain text,
  context_corners text,
  context_frost_depth_inches integer,
  context_conditions text,
  saved_by uuid not null references public.app_users(id) on delete restrict,
  saved_at timestamp with time zone not null default now(),
  constraint fence_estimate_draft_revisions_identity_unique
    unique (fence_draft_id, revision),
  constraint fence_estimate_draft_revisions_revision_check
    check (revision >= 1),
  constraint fence_estimate_draft_revisions_event_kind_check
    check (event_kind in ('created', 'saved')),
  constraint fence_estimate_draft_revisions_schema_version_check
    check (schema_version = 'fence-layout-v1'),
  constraint fence_estimate_draft_revisions_layout_check
    check (public.is_valid_fence_layout_snapshot(run_lengths_inches, total_length_inches)),
  constraint fence_estimate_draft_revisions_context_schema_check
    check (context_schema_version = 'fence-context-v1'),
  constraint fence_estimate_draft_revisions_context_check check (
    public.is_valid_fence_context_snapshot(
      run_lengths_inches, needs_gate, context_system, context_measurement_basis,
      context_terrain, context_corners, context_frost_depth_inches, context_conditions
    )
  )
);

create index fence_estimate_draft_revisions_estimate_revision_idx
  on public.fence_estimate_draft_revisions(company_id, estimate_id, revision desc);

create or replace function public.prevent_fence_estimate_draft_revision_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $function$
begin
  raise exception 'Fence estimate draft revisions are append-only.'
    using errcode = '55000';
end;
$function$;

revoke all on function public.prevent_fence_estimate_draft_revision_mutation()
from public, anon, authenticated;
grant execute on function public.prevent_fence_estimate_draft_revision_mutation()
to service_role;

create trigger prevent_fence_estimate_draft_revision_mutation
before update or delete on public.fence_estimate_draft_revisions
for each row execute function public.prevent_fence_estimate_draft_revision_mutation();

alter table public.fence_estimate_drafts enable row level security;
alter table public.fence_estimate_draft_revisions enable row level security;

revoke all on table public.fence_estimate_drafts,
  public.fence_estimate_draft_revisions
from public, anon, authenticated, service_role;
grant select, insert, update on table public.fence_estimate_drafts
to service_role;
grant select, insert on table public.fence_estimate_draft_revisions
to service_role;

create or replace function public.assert_single_company_fence_estimate_scope()
returns uuid
language plpgsql
security invoker
set search_path = pg_catalog, public
as $function$
declare
  resolved_company_id uuid;
  company_count integer;
  domain_tenant_column_count integer;
begin
  select count(*)
  into company_count
  from public.company_settings;

  select id
  into resolved_company_id
  from public.company_settings
  limit 1;

  if company_count <> 1 or resolved_company_id is null then
    raise exception 'Fence estimate persistence requires exactly one company.'
      using errcode = '55000';
  end if;

  if exists (
    select 1
    from public.app_users
    where company_id is distinct from resolved_company_id
  ) then
    raise exception 'Fence estimate persistence requires every application user to match the singleton company.'
      using errcode = '55000';
  end if;

  select count(*)
  into domain_tenant_column_count
  from information_schema.columns
  where table_schema = 'public'
    and table_name in ('estimates', 'leads', 'customers', 'projects')
    and column_name in ('company_id', 'tenant_id', 'workspace_id', 'organization_id');

  if domain_tenant_column_count <> 0 then
    raise exception 'Estimate ownership has changed; replace singleton Fence scope before continuing.'
      using errcode = '55000';
  end if;

  return resolved_company_id;
end;
$function$;

revoke all on function public.assert_single_company_fence_estimate_scope()
from public, anon, authenticated;
grant execute on function public.assert_single_company_fence_estimate_scope()
to service_role;

create or replace function public.get_fence_estimate_draft(
  requested_auth_user_id uuid,
  requested_estimate_id uuid
)
returns table(result_code text, draft jsonb)
language plpgsql
security invoker
set search_path = pg_catalog, public
as $function$
declare
  effective_access jsonb;
  resolved_company_id uuid;
  user_record public.app_users;
  estimate_record public.estimates;
  draft_record public.fence_estimate_drafts;
begin
  if requested_auth_user_id is null or requested_estimate_id is null then
    return query select 'forbidden', null::jsonb;
    return;
  end if;

  select public.get_effective_user_access(requested_auth_user_id)
  into effective_access;

  if effective_access is null
    or effective_access -> 'portal_access' ->> 'sales' is distinct from 'true'
  then
    return query select 'forbidden', null::jsonb;
    return;
  end if;

  select * into user_record
  from public.app_users
  where auth_user_id = requested_auth_user_id
    and id = (effective_access ->> 'user_id')::uuid
    and company_id = (effective_access ->> 'company_id')::uuid
    and is_active = true;

  if user_record.id is null then
    return query select 'forbidden', null::jsonb;
    return;
  end if;

  resolved_company_id := public.assert_single_company_fence_estimate_scope();
  if user_record.company_id is distinct from resolved_company_id then
    return query select 'forbidden', null::jsonb;
    return;
  end if;

  select * into estimate_record
  from public.estimates
  where id = requested_estimate_id;

  if estimate_record.id is null
    or estimate_record.calculation_policy_version is null
    or estimate_record.calculation_policy_version not in (
      'structured-estimate-v1',
      'structured-estimate-v2-material-tax'
    )
  then
    return query select 'not_found', null::jsonb;
    return;
  end if;

  if estimate_record.status <> 'draft' then
    return query select 'non_draft', null::jsonb;
    return;
  end if;

  select * into draft_record
  from public.fence_estimate_drafts
  where company_id = resolved_company_id
    and estimate_id = requested_estimate_id;

  if draft_record.id is null then
    return query select 'ok', null::jsonb;
    return;
  end if;

  return query select 'ok', jsonb_build_object(
    'id', draft_record.id,
    'estimateId', draft_record.estimate_id,
    'schemaVersion', draft_record.schema_version,
    'revision', draft_record.revision,
    'runLengthsInches', to_jsonb(draft_record.run_lengths_inches),
    'totalLengthInches', draft_record.total_length_inches,
    'needsGate', draft_record.needs_gate,
    'contextSchemaVersion', draft_record.context_schema_version,
    'contextAnswers', jsonb_strip_nulls(jsonb_build_object(
      'system', draft_record.context_system,
      'measurementBasis', draft_record.context_measurement_basis,
      'terrain', draft_record.context_terrain,
      'corners', draft_record.context_corners,
      'frostDepthInches', draft_record.context_frost_depth_inches,
      'conditions', draft_record.context_conditions
    )),
    'updatedAt', draft_record.updated_at
  );
end;
$function$;

create or replace function public.save_fence_estimate_draft(
  requested_auth_user_id uuid,
  requested_estimate_id uuid,
  requested_expected_revision integer,
  requested_schema_version text,
  requested_run_lengths_inches integer[],
  requested_needs_gate boolean,
  requested_context_schema_version text default 'fence-context-v1',
  requested_context_system text default null,
  requested_context_measurement_basis text default null,
  requested_context_terrain text default null,
  requested_context_corners text default null,
  requested_context_frost_depth_inches integer default null,
  requested_context_conditions text default null
)
returns table(result_code text, next_revision integer, resource_id uuid)
language plpgsql
security invoker
set search_path = pg_catalog, public
as $function$
declare
  effective_access jsonb;
  resolved_company_id uuid;
  user_record public.app_users;
  estimate_record public.estimates;
  draft_record public.fence_estimate_drafts;
  computed_total integer;
  next_value integer;
  event_value text;
begin
  if requested_auth_user_id is null or requested_estimate_id is null then
    return query select 'forbidden', null::integer, null::uuid;
    return;
  end if;

  select public.get_effective_user_access(requested_auth_user_id)
  into effective_access;

  if effective_access is null
    or effective_access -> 'portal_access' ->> 'sales' is distinct from 'true'
    or effective_access -> 'permissions' ->> 'edit_prices' is distinct from 'true'
  then
    return query select 'forbidden', null::integer, null::uuid;
    return;
  end if;

  select * into user_record
  from public.app_users
  where auth_user_id = requested_auth_user_id
    and id = (effective_access ->> 'user_id')::uuid
    and company_id = (effective_access ->> 'company_id')::uuid
    and is_active = true;

  if user_record.id is null then
    return query select 'forbidden', null::integer, null::uuid;
    return;
  end if;

  resolved_company_id := public.assert_single_company_fence_estimate_scope();
  if user_record.company_id is distinct from resolved_company_id then
    return query select 'forbidden', null::integer, null::uuid;
    return;
  end if;

  if requested_expected_revision is null or requested_expected_revision < 0
    or requested_schema_version is distinct from 'fence-layout-v1'
    or requested_context_schema_version is distinct from 'fence-context-v1'
    or requested_needs_gate is null
  then
    return query select 'invalid_draft', null::integer, null::uuid;
    return;
  end if;

  select sum(length_inches)::integer
  into computed_total
  from unnest(requested_run_lengths_inches) as run_length(length_inches);

  if not public.is_valid_fence_layout_snapshot(
    requested_run_lengths_inches,
    computed_total
  ) then
    return query select 'invalid_draft', null::integer, null::uuid;
    return;
  end if;

  if not public.is_valid_fence_context_snapshot(
    requested_run_lengths_inches, requested_needs_gate, requested_context_system,
    requested_context_measurement_basis, requested_context_terrain,
    requested_context_corners, requested_context_frost_depth_inches,
    requested_context_conditions
  ) then
    return query select 'invalid_context', null::integer, null::uuid;
    return;
  end if;

  select * into estimate_record
  from public.estimates
  where id = requested_estimate_id
  for update;

  if estimate_record.id is null
    or estimate_record.calculation_policy_version is null
    or estimate_record.calculation_policy_version not in (
      'structured-estimate-v1',
      'structured-estimate-v2-material-tax'
    )
  then
    return query select 'not_found', null::integer, null::uuid;
    return;
  end if;

  if estimate_record.status <> 'draft' then
    return query select 'non_draft', estimate_record.calculation_revision, null::uuid;
    return;
  end if;

  select * into draft_record
  from public.fence_estimate_drafts
  where estimate_id = requested_estimate_id
  for update;

  if draft_record.id is null then
    if requested_expected_revision <> 0 then
      return query select 'stale_fence_revision', 0, null::uuid;
      return;
    end if;

    insert into public.fence_estimate_drafts (
      company_id, estimate_id, schema_version, revision,
      run_lengths_inches, total_length_inches, needs_gate,
      context_schema_version, context_system, context_measurement_basis,
      context_terrain, context_corners, context_frost_depth_inches, context_conditions,
      created_by, updated_by
    ) values (
      resolved_company_id, requested_estimate_id, requested_schema_version, 1,
      requested_run_lengths_inches, computed_total, requested_needs_gate,
      requested_context_schema_version, requested_context_system,
      requested_context_measurement_basis, requested_context_terrain,
      requested_context_corners, requested_context_frost_depth_inches,
      requested_context_conditions,
      user_record.id, user_record.id
    ) returning * into draft_record;

    next_value := 1;
    event_value := 'created';
  else
    if draft_record.company_id is distinct from resolved_company_id then
      return query select 'forbidden', draft_record.revision, draft_record.id;
      return;
    end if;

    if draft_record.revision <> requested_expected_revision then
      return query select 'stale_fence_revision', draft_record.revision, draft_record.id;
      return;
    end if;

    next_value := draft_record.revision + 1;
    update public.fence_estimate_drafts
    set schema_version = requested_schema_version,
      revision = next_value,
      run_lengths_inches = requested_run_lengths_inches,
      total_length_inches = computed_total,
      needs_gate = requested_needs_gate,
      context_schema_version = requested_context_schema_version,
      context_system = requested_context_system,
      context_measurement_basis = requested_context_measurement_basis,
      context_terrain = requested_context_terrain,
      context_corners = requested_context_corners,
      context_frost_depth_inches = requested_context_frost_depth_inches,
      context_conditions = requested_context_conditions,
      updated_by = user_record.id,
      updated_at = now()
    where id = draft_record.id
    returning * into draft_record;

    event_value := 'saved';
  end if;

  insert into public.fence_estimate_draft_revisions (
    company_id, fence_draft_id, estimate_id, revision, event_kind,
    schema_version, run_lengths_inches, total_length_inches, needs_gate,
    context_schema_version, context_system, context_measurement_basis,
    context_terrain, context_corners, context_frost_depth_inches, context_conditions,
    saved_by
  ) values (
    resolved_company_id, draft_record.id, requested_estimate_id, next_value,
    event_value, requested_schema_version, requested_run_lengths_inches,
    computed_total, requested_needs_gate,
    requested_context_schema_version, requested_context_system,
    requested_context_measurement_basis, requested_context_terrain,
    requested_context_corners, requested_context_frost_depth_inches,
    requested_context_conditions, user_record.id
  );

  return query select 'ok', next_value, draft_record.id;
end;
$function$;

revoke all on function public.get_fence_estimate_draft(uuid, uuid)
from public, anon, authenticated;
revoke all on function public.save_fence_estimate_draft(uuid, uuid, integer, text, integer[], boolean, text, text, text, text, text, integer, text)
from public, anon, authenticated;
grant execute on function public.get_fence_estimate_draft(uuid, uuid)
to service_role;
grant execute on function public.save_fence_estimate_draft(uuid, uuid, integer, text, integer[], boolean, text, text, text, text, text, integer, text)
to service_role;

comment on table public.fence_estimate_drafts is
  'Current exact-inch Fence layout draft for one draft structured estimate. It does not contain takeoff, product, or price quantities.';
comment on table public.fence_estimate_draft_revisions is
  'Append-only complete snapshots of accepted Fence draft saves.';
comment on function public.assert_single_company_fence_estimate_scope() is
  'Fail-closed transitional V0 assertion. Replace when estimates gain authoritative company ownership.';

commit;
