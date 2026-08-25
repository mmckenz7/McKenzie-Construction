begin;

alter table public.guided_site_visit_photo_attempts
  drop constraint guided_site_visit_photo_capture_intent_check,
  drop constraint guided_site_visit_photo_intent_context_check;
alter table public.guided_site_visit_photo_attempts
  add constraint guided_site_visit_photo_capture_intent_check
    check (capture_intent is null or capture_intent in ('initial', 'complement', 'retake', 'batch')),
  add constraint guided_site_visit_photo_intent_context_check check (
    capture_intent is null
    or capture_intent = 'initial' and retake_of_attempt_id is null and requested_from_visible_fact_decision_id is null
    or capture_intent = 'complement' and retake_of_attempt_id is null and requested_from_visible_fact_decision_id is not null
    or capture_intent = 'retake' and retake_of_attempt_id is not null
    or capture_intent = 'batch' and retake_of_attempt_id is null and requested_from_visible_fact_decision_id is null
  );

create table public.guided_site_visit_photo_batches (
  id uuid primary key,
  company_id uuid not null references public.company_settings(id) on delete restrict,
  visit_id uuid not null,
  visit_item_id uuid not null,
  idempotency_key text not null,
  request_fingerprint text not null,
  member_count integer not null,
  created_by_auth_user_id uuid not null,
  created_at timestamptz not null default now(),
  unique (company_id, idempotency_key),
  unique (id, visit_item_id, visit_id, company_id),
  foreign key (visit_item_id, visit_id, company_id)
    references public.guided_site_visit_items(id, visit_id, company_id) on delete restrict,
  check (length(idempotency_key) between 1 and 200 and idempotency_key = btrim(idempotency_key)),
  check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  check (member_count between 1 and 5)
);

create table public.guided_site_visit_photo_batch_members (
  batch_id uuid not null,
  company_id uuid not null,
  visit_id uuid not null,
  visit_item_id uuid not null,
  batch_ordinal integer not null,
  photo_attempt_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (batch_id, batch_ordinal, photo_attempt_id),
  unique (photo_attempt_id),
  foreign key (batch_id, visit_item_id, visit_id, company_id)
    references public.guided_site_visit_photo_batches(id, visit_item_id, visit_id, company_id) on delete restrict,
  foreign key (photo_attempt_id, visit_item_id, visit_id, company_id)
    references public.guided_site_visit_photo_attempts(id, visit_item_id, visit_id, company_id) on delete restrict,
  check (batch_ordinal between 1 and 5)
);

alter table public.guided_site_visit_photo_batches enable row level security;
alter table public.guided_site_visit_photo_batch_members enable row level security;
revoke all on table public.guided_site_visit_photo_batches,
  public.guided_site_visit_photo_batch_members
from public, anon, authenticated, service_role;

create or replace function public.prevent_guided_site_visit_photo_batch_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $function$
begin
  raise exception 'Guided Site Visit photo-batch provenance is immutable.' using errcode = '55000';
end;
$function$;

create trigger prevent_guided_site_visit_photo_batch_mutation
before update or delete on public.guided_site_visit_photo_batches
for each row execute function public.prevent_guided_site_visit_photo_batch_mutation();

create trigger prevent_guided_site_visit_photo_batch_member_mutation
before update or delete on public.guided_site_visit_photo_batch_members
for each row execute function public.prevent_guided_site_visit_photo_batch_mutation();

create or replace function public.create_guided_site_visit_photo_batch(
  requested_auth_user_id uuid,
  requested_visit_id uuid,
  requested_item_id uuid,
  requested_batch_id uuid,
  requested_idempotency_key text,
  requested_request_fingerprint text,
  requested_member_count integer
)
returns table(result_code text, batch_id uuid, idempotent_replay boolean)
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  company uuid;
  visit public.guided_site_visits;
  existing public.guided_site_visit_photo_batches;
begin
  company := public.guided_site_visit_actor_company(requested_auth_user_id);
  if company is null then
    return query select 'forbidden', null::uuid, false;
    return;
  end if;
  if requested_batch_id is null
    or nullif(btrim(coalesce(requested_idempotency_key, '')), '') is null
    or length(btrim(requested_idempotency_key)) > 200
    or requested_request_fingerprint !~ '^[0-9a-f]{64}$'
    or requested_member_count not between 1 and 5 then
    return query select 'invalid_batch', null::uuid, false;
    return;
  end if;

  select * into existing
  from public.guided_site_visit_photo_batches
  where company_id = company and idempotency_key = btrim(requested_idempotency_key);
  if existing.id is not null then
    if existing.id = requested_batch_id
      and existing.visit_id = requested_visit_id
      and existing.visit_item_id = requested_item_id
      and existing.request_fingerprint = requested_request_fingerprint
      and existing.member_count = requested_member_count
      and existing.created_by_auth_user_id = requested_auth_user_id then
      return query select 'ok', existing.id, true;
    else
      return query select 'idempotency_conflict', null::uuid, false;
    end if;
    return;
  end if;

  select * into visit from public.guided_site_visits
  where id = requested_visit_id and company_id = company for update;
  if visit.id is null then
    return query select 'not_found', null::uuid, false;
    return;
  end if;
  if visit.status <> 'in_progress' then
    return query select 'not_editable', null::uuid, false;
    return;
  end if;
  if not exists(
    select 1 from public.guided_site_visit_items
    where id = requested_item_id and visit_id = visit.id
      and company_id = company and state = 'pending'
  ) then
    return query select 'not_found', null::uuid, false;
    return;
  end if;

  select * into existing
  from public.guided_site_visit_photo_batches
  where company_id = company and idempotency_key = btrim(requested_idempotency_key);
  if existing.id is not null then
    if existing.id = requested_batch_id
      and existing.visit_id = requested_visit_id
      and existing.visit_item_id = requested_item_id
      and existing.request_fingerprint = requested_request_fingerprint
      and existing.member_count = requested_member_count
      and existing.created_by_auth_user_id = requested_auth_user_id then
      return query select 'ok', existing.id, true;
    end if;
    return query select 'idempotency_conflict', null::uuid, false;
    return;
  end if;

  insert into public.guided_site_visit_photo_batches(
    id, company_id, visit_id, visit_item_id, idempotency_key,
    request_fingerprint, member_count, created_by_auth_user_id
  ) values (
    requested_batch_id, company, visit.id, requested_item_id,
    btrim(requested_idempotency_key), requested_request_fingerprint,
    requested_member_count, requested_auth_user_id
  );
  return query select 'ok', requested_batch_id, false;
exception when unique_violation or check_violation then
  return query select 'idempotency_conflict', null::uuid, false;
end;
$function$;

create or replace function public.reserve_guided_site_visit_photo_batch_member(
  requested_auth_user_id uuid, requested_visit_id uuid, requested_item_id uuid,
  requested_expected_revision integer, requested_idempotency_key text,
  requested_capture_intent text, requested_source_decision_id uuid,
  requested_retake_of_attempt_id uuid, requested_attempt_id uuid,
  requested_asset_id uuid, requested_storage_path text, requested_filename text,
  requested_mime_type text, requested_byte_size bigint, requested_sha256 text,
  requested_batch_id uuid, requested_batch_ordinal integer
)
returns table(result_code text, next_revision integer, attempt_id uuid,
  asset_id uuid, storage_path text, idempotent_replay boolean)
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  company uuid;
  batch public.guided_site_visit_photo_batches;
  member public.guided_site_visit_photo_batch_members;
  visit public.guided_site_visits;
  item public.guided_site_visit_items;
  existing public.guided_site_visit_photo_attempts;
  source_asset public.ai_estimator_assets;
  next_value integer;
  next_ordinal integer;
  active_count integer;
  meaningful_count integer;
  total_count integer;
begin
  company := public.guided_site_visit_actor_company(requested_auth_user_id);
  if company is null then
    return query select 'forbidden', null::integer, null::uuid, null::uuid, null::text, false;
    return;
  end if;
  select * into batch from public.guided_site_visit_photo_batches
  where id = requested_batch_id and company_id = company for update;
  if batch.id is null
    or batch.visit_id <> requested_visit_id
    or batch.visit_item_id <> requested_item_id
    or batch.created_by_auth_user_id <> requested_auth_user_id then
    return query select 'batch_not_found', null::integer, null::uuid, null::uuid, null::text, false;
    return;
  end if;
  if requested_batch_ordinal is null
    or requested_batch_ordinal < 1
    or requested_batch_ordinal > batch.member_count then
    return query select 'invalid_batch_ordinal', null::integer, null::uuid, null::uuid, null::text, false;
    return;
  end if;

  select * into existing from public.guided_site_visit_photo_attempts
  where company_id = company
    and reservation_idempotency_key = requested_idempotency_key;
  if existing.id is not null then
    select * into source_asset from public.ai_estimator_assets
    where id = existing.asset_id and company_id = company;
    if existing.id = requested_attempt_id
      and existing.visit_id = requested_visit_id
      and existing.visit_item_id = requested_item_id
      and existing.asset_id = requested_asset_id
      and existing.capture_intent = 'batch'
      and existing.requested_from_visible_fact_decision_id is null
      and existing.retake_of_attempt_id is null
      and existing.reserved_by_auth_user_id = requested_auth_user_id
      and source_asset.storage_path = requested_storage_path
      and source_asset.original_filename = requested_filename
      and source_asset.mime_type = requested_mime_type
      and source_asset.declared_byte_size = requested_byte_size
      and source_asset.declared_sha256 = requested_sha256 then
      select * into member from public.guided_site_visit_photo_batch_members
      where batch_id = batch.id and batch_ordinal = requested_batch_ordinal
        and photo_attempt_id = existing.id;
      if member.batch_id is null or member.photo_attempt_id <> existing.id then
        return query select 'batch_member_conflict', null::integer,
          existing.id, existing.asset_id, source_asset.storage_path, false;
        return;
      end if;
      if existing.state = 'upload_pending' and source_asset.status = 'upload_pending' then
        return query select 'ok', existing.resulting_reservation_revision,
          existing.id, existing.asset_id, source_asset.storage_path, true;
        return;
      end if;
      if existing.state = 'confirmed' and source_asset.status = 'available' then
        return query select 'already_confirmed', existing.resulting_reservation_revision,
          existing.id, existing.asset_id, source_asset.storage_path, true;
        return;
      end if;
      if existing.state = 'failed_validation' or source_asset.status = 'failed_validation' then
        return query select 'reservation_failed', existing.resulting_reservation_revision,
          existing.id, existing.asset_id, source_asset.storage_path, true;
        return;
      end if;
      return query select 'reservation_not_uploadable', existing.resulting_reservation_revision,
        existing.id, existing.asset_id, source_asset.storage_path, true;
      return;
    end if;
    return query select 'idempotency_conflict', null::integer,
      existing.id, existing.asset_id, source_asset.storage_path, false;
    return;
  end if;

  select * into member from public.guided_site_visit_photo_batch_members
  where batch_id = batch.id and batch_ordinal = requested_batch_ordinal
    and photo_attempt_id = requested_attempt_id;
  if member.batch_id is null and exists(
    select 1
    from public.guided_site_visit_photo_batch_members prior
    join public.guided_site_visit_photo_attempts attempt
      on attempt.id = prior.photo_attempt_id
      and attempt.company_id = prior.company_id
    where prior.batch_id = batch.id
      and prior.batch_ordinal = requested_batch_ordinal
      and attempt.state <> 'failed_validation'
  ) then
    return query select 'batch_member_conflict', null::integer, null::uuid, null::uuid, null::text, false;
    return;
  end if;
  if exists(
    select 1 from public.guided_site_visit_photo_batch_members
    where photo_attempt_id = requested_attempt_id
      and (batch_id <> batch.id or batch_ordinal <> requested_batch_ordinal)
  ) then
    return query select 'batch_member_conflict', null::integer, requested_attempt_id, null::uuid, null::text, false;
    return;
  end if;

  select * into visit from public.guided_site_visits
  where id = requested_visit_id and company_id = company for update;
  if visit.id is null then
    return query select 'not_found', null::integer, null::uuid, null::uuid, null::text, false;
    return;
  end if;
  if visit.status <> 'in_progress' then
    return query select 'not_editable', visit.revision, null::uuid, null::uuid, null::text, false;
    return;
  end if;
  if visit.revision <> requested_expected_revision then
    return query select 'stale_revision', visit.revision, null::uuid, null::uuid, null::text, false;
    return;
  end if;
  select * into item from public.guided_site_visit_items
  where id = requested_item_id and visit_id = visit.id
    and company_id = company and state = 'pending';
  if item.id is null then
    return query select 'not_found', visit.revision, null::uuid, null::uuid, null::text, false;
    return;
  end if;
  if requested_capture_intent <> 'batch'
    or requested_source_decision_id is not null
    or requested_retake_of_attempt_id is not null
    or length(requested_idempotency_key) not between 1 and 200
    or requested_mime_type not in ('image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif')
    or requested_byte_size not between 1 and 15728640
    or requested_sha256 !~ '^[0-9a-f]{64}$'
    or requested_storage_path not like company::text || '/' || visit.case_id::text || '/' || requested_asset_id::text || '/%' then
    return query select 'invalid_photo', visit.revision, null::uuid, null::uuid, null::text, false;
    return;
  end if;
  if exists(
    select 1 from public.guided_site_visit_photo_attempts
    where company_id = company and visit_item_id = item.id
      and state in ('upload_pending', 'quarantined')
  ) then
    return query select 'upload_in_progress', visit.revision, null::uuid, null::uuid, null::text, false;
    return;
  end if;
  select count(*) filter (where state = 'confirmed'),
    count(*) filter (where state in ('confirmed', 'superseded')),
    count(*), coalesce(max(ordinal), 0) + 1
  into active_count, meaningful_count, total_count, next_ordinal
  from public.guided_site_visit_photo_attempts
  where company_id = company and visit_item_id = item.id;
  if active_count >= 5 then
    return query select 'active_photo_limit', visit.revision, null::uuid, null::uuid, null::text, false;
    return;
  end if;
  if meaningful_count >= 10 then
    return query select 'attempt_limit_reached', visit.revision, null::uuid, null::uuid, null::text, false;
    return;
  end if;
  if total_count >= 25 then
    return query select 'recovery_limit_reached', visit.revision, null::uuid, null::uuid, null::text, false;
    return;
  end if;

  insert into public.ai_estimator_assets(
    id, company_id, case_id, asset_kind, origin, storage_bucket,
    storage_path, original_filename, mime_type, declared_byte_size,
    declared_sha256, status, created_by_auth_user_id
  ) values (
    requested_asset_id, company, visit.case_id, 'photo', 'user_upload',
    'ai-estimator-private', requested_storage_path, requested_filename,
    requested_mime_type, requested_byte_size, requested_sha256,
    'upload_pending', requested_auth_user_id
  );
  next_value := visit.revision + 1;
  insert into public.guided_site_visit_photo_attempts(
    id, company_id, visit_id, visit_item_id, case_id, asset_id,
    retake_of_attempt_id, ordinal, capture_intent,
    requested_from_visible_fact_decision_id, reservation_idempotency_key,
    reserved_by_auth_user_id, resulting_reservation_revision
  ) values (
    requested_attempt_id, company, visit.id, item.id, visit.case_id,
    requested_asset_id, null, next_ordinal, 'batch', null,
    requested_idempotency_key, requested_auth_user_id, next_value
  );
  insert into public.guided_site_visit_photo_batch_members(
    batch_id, company_id, visit_id, visit_item_id, batch_ordinal,
    photo_attempt_id
  ) values (
    batch.id, company, batch.visit_id, batch.visit_item_id,
    requested_batch_ordinal, requested_attempt_id
  );
  update public.guided_site_visits set revision = next_value, updated_at = now()
  where id = visit.id;
  return query select 'ok', next_value, requested_attempt_id,
    requested_asset_id, requested_storage_path, false;
exception when unique_violation or check_violation then
  return query select 'batch_member_conflict', null::integer,
    null::uuid, null::uuid, null::text, false;
end;
$function$;

revoke all on function public.prevent_guided_site_visit_photo_batch_mutation()
from public, anon, authenticated, service_role;
revoke all on function public.create_guided_site_visit_photo_batch(uuid,uuid,uuid,uuid,text,text,integer)
from public, anon, authenticated;
grant execute on function public.create_guided_site_visit_photo_batch(uuid,uuid,uuid,uuid,text,text,integer)
to service_role;
revoke all on function public.reserve_guided_site_visit_photo_batch_member(uuid,uuid,uuid,integer,text,text,uuid,uuid,uuid,uuid,text,text,text,bigint,text,uuid,integer)
from public, anon, authenticated;
grant execute on function public.reserve_guided_site_visit_photo_batch_member(uuid,uuid,uuid,integer,text,text,uuid,uuid,uuid,uuid,text,text,text,bigint,text,uuid,integer)
to service_role;

comment on table public.guided_site_visit_photo_batches is
  'Immutable actor- and item-bound manifest for sequential photo uploads. It does not relax the one-in-flight upload invariant.';
comment on table public.guided_site_visit_photo_batch_members is
  'Immutable ordinal-to-photo-attempt provenance for a sequential Guided Site Visit photo batch.';

commit;
