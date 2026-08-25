begin;

create table public.guided_deck_structural_plan_revisions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company_settings(id) on delete restrict,
  visit_id uuid not null,
  target_estimate_id uuid not null references public.estimates(id) on delete restrict,
  plan_revision integer not null check (plan_revision > 0),
  shape_revision_id uuid not null,
  shape_revision integer not null check (shape_revision > 0),
  shape_digest text not null check (shape_digest ~ '^[0-9a-f]{64}$'),
  concept_version text not null check (concept_version = 'custom-deck-generated-estimating-concept-v1'),
  source_type text not null check (source_type = 'generated_estimating_concept'),
  status text not null check (status = 'generated_estimating_concept'),
  concept_payload jsonb not null,
  unresolved_packages jsonb not null,
  supersedes_plan_revision_id uuid,
  idempotency_key text not null,
  request_sha256 text not null check (request_sha256 ~ '^[0-9a-f]{64}$'),
  created_by_auth_user_id uuid not null,
  created_at timestamptz not null default now(),
  unique(company_id,visit_id,plan_revision),
  unique(company_id,idempotency_key),
  unique(id,visit_id,company_id),
  foreign key(visit_id,company_id)
    references public.guided_site_visits(id,company_id) on delete restrict,
  foreign key(shape_revision_id,visit_id,company_id)
    references public.guided_deck_shape_revisions(id,visit_id,company_id) on delete restrict,
  foreign key(supersedes_plan_revision_id,visit_id,company_id)
    references public.guided_deck_structural_plan_revisions(id,visit_id,company_id) on delete restrict,
  check(length(idempotency_key) between 1 and 200 and idempotency_key=btrim(idempotency_key))
);

alter table public.guided_deck_structural_plan_revisions enable row level security;
revoke all on table public.guided_deck_structural_plan_revisions from public,anon,authenticated;
grant select on table public.guided_deck_structural_plan_revisions to service_role;

create trigger prevent_guided_deck_structural_plan_revision_mutation
before update or delete on public.guided_deck_structural_plan_revisions
for each row execute function public.prevent_guided_site_visit_photo_batch_mutation();

create or replace function public.is_valid_guided_deck_estimating_concept(requested_payload jsonb)
returns boolean
language plpgsql immutable
set search_path=pg_catalog,public
as $function$
declare
  segment jsonb;
begin
  if jsonb_typeof(requested_payload)<>'object'
    or (select count(*) from jsonb_object_keys(requested_payload))<>15
    or exists(select 1 from jsonb_object_keys(requested_payload) key where key not in (
      'version','sourceType','status','shapeBinding','joistDirection','joistSpacingInches',
      'areaSquareFeet','perimeterFeet','joistSegments','joistSegmentCount',
      'joistLinearFeet','longestJoistRunFeet','stairsPresent','stairPlacement','unresolvedPackages'
    )) then return false; end if;
  if requested_payload->>'version'<>'custom-deck-generated-estimating-concept-v1'
    or requested_payload->>'sourceType'<>'generated_estimating_concept'
    or requested_payload->>'status'<>'generated_estimating_concept'
    or requested_payload->>'joistDirection' not in ('house_to_yard','side_to_side')
    or jsonb_typeof(requested_payload->'joistSpacingInches')<>'number'
    or (requested_payload->>'joistSpacingInches')::integer not in (12,16,24)
    or jsonb_typeof(requested_payload->'stairsPresent')<>'boolean'
    or jsonb_typeof(requested_payload->'shapeBinding')<>'object'
    or (select count(*) from jsonb_object_keys(requested_payload->'shapeBinding'))<>2
    or exists(select 1 from jsonb_object_keys(requested_payload->'shapeBinding') key where key not in ('id','shapeRevision'))
    or (requested_payload->'shapeBinding'->>'id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or jsonb_typeof(requested_payload->'shapeBinding'->'shapeRevision')<>'number'
    or (requested_payload->'shapeBinding'->>'shapeRevision')::integer<1
    or jsonb_typeof(requested_payload->'areaSquareFeet')<>'number'
    or (requested_payload->>'areaSquareFeet')::numeric<=0
    or (requested_payload->>'areaSquareFeet')::numeric>10000
    or jsonb_typeof(requested_payload->'perimeterFeet')<>'number'
    or (requested_payload->>'perimeterFeet')::numeric<=0
    or (requested_payload->>'perimeterFeet')::numeric>1000
    or jsonb_typeof(requested_payload->'joistSegmentCount')<>'number'
    or (requested_payload->>'joistSegmentCount')::integer<1
    or (requested_payload->>'joistSegmentCount')::integer>500
    or jsonb_typeof(requested_payload->'joistLinearFeet')<>'number'
    or (requested_payload->>'joistLinearFeet')::numeric<=0
    or (requested_payload->>'joistLinearFeet')::numeric>100000
    or jsonb_typeof(requested_payload->'longestJoistRunFeet')<>'number'
    or (requested_payload->>'longestJoistRunFeet')::numeric<=0
    or (requested_payload->>'longestJoistRunFeet')::numeric>200
    or jsonb_typeof(requested_payload->'joistSegments')<>'array'
    or jsonb_array_length(requested_payload->'joistSegments')<>(requested_payload->>'joistSegmentCount')::integer
    or jsonb_typeof(requested_payload->'unresolvedPackages')<>'array'
    then return false; end if;
  for segment in select value from jsonb_array_elements(requested_payload->'joistSegments') loop
    if jsonb_typeof(segment)<>'object'
      or (select count(*) from jsonb_object_keys(segment))<>4
      or exists(select 1 from jsonb_object_keys(segment) key where key not in ('stationFeet','start','end','lengthFeet'))
      or jsonb_typeof(segment->'stationFeet')<>'number'
      or jsonb_typeof(segment->'lengthFeet')<>'number'
      or (segment->>'lengthFeet')::numeric<=0
      or jsonb_typeof(segment->'start')<>'object'
      or jsonb_typeof(segment->'end')<>'object'
      or (select count(*) from jsonb_object_keys(segment->'start'))<>2
      or (select count(*) from jsonb_object_keys(segment->'end'))<>2
      or exists(select 1 from jsonb_object_keys(segment->'start') key where key not in ('x','y'))
      or exists(select 1 from jsonb_object_keys(segment->'end') key where key not in ('x','y'))
      or jsonb_typeof(segment->'start'->'x')<>'number'
      or jsonb_typeof(segment->'start'->'y')<>'number'
      or jsonb_typeof(segment->'end'->'x')<>'number'
      or jsonb_typeof(segment->'end'->'y')<>'number' then return false; end if;
  end loop;
  return true;
exception when others then
  return false;
end
$function$;

create or replace function public.create_guided_deck_structural_plan_revision(
  requested_auth_user_id uuid,
  requested_visit_id uuid,
  requested_expected_plan_revision integer,
  requested_shape_revision_id uuid,
  requested_shape_revision integer,
  requested_shape_digest text,
  requested_idempotency_key text,
  requested_request_sha256 text,
  requested_concept_payload jsonb,
  requested_unresolved_packages jsonb
)
returns table(result_code text,structural_plan_revision_id uuid,next_plan_revision integer,idempotent_replay boolean)
language plpgsql security definer
set search_path=pg_catalog,public
as $function$
declare
  company uuid;
  visit public.guided_site_visits;
  estimate_record public.estimates;
  shape public.guided_deck_shape_revisions;
  existing public.guided_deck_structural_plan_revisions;
  prior public.guided_deck_structural_plan_revisions;
  current_revision integer;
  created_id uuid;
begin
  company := public.guided_site_visit_actor_company(requested_auth_user_id);
  if company is null then return query select 'forbidden',null::uuid,null::integer,false; return; end if;
  if requested_expected_plan_revision<0
    or nullif(btrim(coalesce(requested_idempotency_key,'')),'') is null
    or length(requested_idempotency_key)>200
    or requested_request_sha256 !~ '^[0-9a-f]{64}$'
    or requested_shape_digest !~ '^[0-9a-f]{64}$'
    or not public.is_valid_guided_deck_estimating_concept(requested_concept_payload)
    or requested_unresolved_packages<>requested_concept_payload->'unresolvedPackages'
    or requested_unresolved_packages<>'["joist_member_and_bearing_detail","beam_support_plan","post_foundation_plan","ledger_attachment_detail","blocking_bracing_detail","stair_structural_detail","guard_attachment_detail","hardware_connector_schedule"]'::jsonb
    or requested_concept_payload->'shapeBinding'->>'id'<>requested_shape_revision_id::text
    or (requested_concept_payload->'shapeBinding'->>'shapeRevision')::integer<>requested_shape_revision then
    return query select 'invalid_concept',null::uuid,null::integer,false; return;
  end if;

  select * into existing from public.guided_deck_structural_plan_revisions
  where company_id=company and idempotency_key=requested_idempotency_key;
  if existing.id is not null then
    if existing.visit_id=requested_visit_id
      and existing.plan_revision=requested_expected_plan_revision+1
      and existing.shape_revision_id=requested_shape_revision_id
      and existing.shape_revision=requested_shape_revision
      and existing.shape_digest=requested_shape_digest
      and existing.request_sha256=requested_request_sha256
      and existing.concept_payload=requested_concept_payload
      and existing.unresolved_packages=requested_unresolved_packages
      and existing.created_by_auth_user_id=requested_auth_user_id then
      return query select 'ok',existing.id,existing.plan_revision,true;
    else
      return query select 'idempotency_conflict',existing.id,existing.plan_revision,false;
    end if;
    return;
  end if;

  select * into visit from public.guided_site_visits
  where id=requested_visit_id and company_id=company for share;
  if visit.id is null then return query select 'not_found',null::uuid,null::integer,false; return; end if;
  if visit.status<>'completed' then return query select 'visit_incomplete',null::uuid,null::integer,false; return; end if;
  select * into estimate_record from public.estimates
  where id=visit.target_estimate_id and status='draft' for share;
  if estimate_record.id is null then return query select 'not_editable',null::uuid,null::integer,false; return; end if;

  perform pg_advisory_xact_lock(hashtextextended(company::text||':'||visit.id::text||':structural-plan',0));
  select * into shape from public.guided_deck_shape_revisions
  where company_id=company and visit_id=visit.id order by shape_revision desc limit 1;
  if shape.id is null
    or shape.id<>requested_shape_revision_id
    or shape.shape_revision<>requested_shape_revision
    or shape.request_sha256<>requested_shape_digest
    or requested_concept_payload->'stairsPresent'<>to_jsonb(shape.stairs_present)
    or requested_concept_payload->'stairPlacement'<>coalesce(shape.stair_placement,'null'::jsonb) then
    return query select 'stale_shape_revision',null::uuid,null::integer,false; return;
  end if;
  select * into prior from public.guided_deck_structural_plan_revisions
  where company_id=company and visit_id=visit.id order by plan_revision desc limit 1;
  current_revision := coalesce(prior.plan_revision,0);
  if current_revision<>requested_expected_plan_revision then
    return query select 'stale_plan_revision',prior.id,current_revision,false; return;
  end if;

  insert into public.guided_deck_structural_plan_revisions(
    company_id,visit_id,target_estimate_id,plan_revision,shape_revision_id,
    shape_revision,shape_digest,concept_version,source_type,status,concept_payload,
    unresolved_packages,supersedes_plan_revision_id,idempotency_key,
    request_sha256,created_by_auth_user_id
  ) values(
    company,visit.id,visit.target_estimate_id,current_revision+1,shape.id,
    shape.shape_revision,shape.request_sha256,'custom-deck-generated-estimating-concept-v1',
    'generated_estimating_concept','generated_estimating_concept',requested_concept_payload,
    requested_unresolved_packages,prior.id,requested_idempotency_key,
    requested_request_sha256,requested_auth_user_id
  ) returning id into created_id;
  return query select 'ok',created_id,current_revision+1,false;
end
$function$;

revoke all on function public.is_valid_guided_deck_estimating_concept(jsonb) from public,anon,authenticated;
revoke all on function public.create_guided_deck_structural_plan_revision(uuid,uuid,integer,uuid,integer,text,text,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.create_guided_deck_structural_plan_revision(uuid,uuid,integer,uuid,integer,text,text,text,jsonb,jsonb) to service_role;

comment on table public.guided_deck_structural_plan_revisions is
  'Append-only preliminary estimating concepts bound to an immutable approved Deck shape. Generated concepts are not reviewed structural plans and are not for construction.';
comment on function public.create_guided_deck_structural_plan_revision(uuid,uuid,integer,uuid,integer,text,text,text,jsonb,jsonb) is
  'Service-only structural estimating-concept boundary. It validates actor company, completed visit, editable estimate, latest immutable shape digest, exact revision and replay binding before appending a preliminary non-construction plan.';

commit;
