begin;

create table public.guided_deck_finish_selection_revisions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company_settings(id) on delete restrict,
  visit_id uuid not null,
  target_estimate_id uuid not null references public.estimates(id) on delete restrict,
  selection_revision integer not null check (selection_revision > 0),
  shape_revision_id uuid not null,
  shape_revision integer not null check (shape_revision > 0),
  shape_digest text not null check (shape_digest ~ '^[0-9a-f]{64}$'),
  structural_plan_revision_id uuid not null,
  snapshot_version text not null check (snapshot_version = 'custom-deck-finish-draft-v1'),
  selection_snapshot jsonb not null,
  supersedes_selection_revision_id uuid,
  idempotency_key text not null check (length(idempotency_key) between 1 and 200 and idempotency_key=btrim(idempotency_key)),
  request_sha256 text not null check (request_sha256 ~ '^[0-9a-f]{64}$'),
  saved_by_auth_user_id uuid not null,
  saved_at timestamptz not null default now(),
  unique(company_id,visit_id,selection_revision),
  unique(company_id,idempotency_key),
  unique(id,visit_id,company_id),
  foreign key(visit_id,company_id)
    references public.guided_site_visits(id,company_id) on delete restrict,
  foreign key(shape_revision_id,visit_id,company_id)
    references public.guided_deck_shape_revisions(id,visit_id,company_id) on delete restrict,
  foreign key(structural_plan_revision_id,visit_id,company_id)
    references public.guided_deck_structural_plan_revisions(id,visit_id,company_id) on delete restrict,
  foreign key(supersedes_selection_revision_id,visit_id,company_id)
    references public.guided_deck_finish_selection_revisions(id,visit_id,company_id) on delete restrict
);

alter table public.guided_deck_finish_selection_revisions enable row level security;
revoke all on table public.guided_deck_finish_selection_revisions from public,anon,authenticated;
grant select on table public.guided_deck_finish_selection_revisions to service_role;

create trigger prevent_guided_deck_finish_selection_revision_mutation
before update or delete on public.guided_deck_finish_selection_revisions
for each row execute function public.prevent_guided_site_visit_photo_batch_mutation();

create or replace function public.is_valid_guided_deck_finish_selection(requested jsonb)
returns boolean
language plpgsql immutable
set search_path=pg_catalog,public
as $function$
declare
  line jsonb;
begin
  if jsonb_typeof(requested)<>'object'
    or (select count(*) from jsonb_object_keys(requested))<>8
    or exists(select 1 from jsonb_object_keys(requested) key where key not in (
      'version','deckingFamily','compositeColor','railingFamily','stairRailSides',
      'woodRailingRate','board','lines'
    ))
    or requested->>'version'<>'custom-deck-finish-draft-v1'
    or requested->>'deckingFamily' not in ('wood','composite')
    or (requested->'compositeColor'<>'null'::jsonb and requested->>'compositeColor' not in ('brown','gray','cedar','redwood','coastal'))
    or requested->>'railingFamily' not in ('wood','metal','cable','none')
    or jsonb_typeof(requested->'stairRailSides')<>'number'
    or (requested->>'stairRailSides')::integer not in (1,2)
    or (requested->'woodRailingRate'<>'null'::jsonb and (
      jsonb_typeof(requested->'woodRailingRate')<>'number'
      or (requested->>'woodRailingRate')::numeric<0
      or (requested->>'woodRailingRate')::numeric>100000
    ))
    or jsonb_typeof(requested->'board')<>'object'
    or (select count(*) from jsonb_object_keys(requested->'board'))<>4
    or exists(select 1 from jsonb_object_keys(requested->'board') key where key not in (
      'actualWidthInches','gapInches','stockLengthFeet','wastePercent'
    ))
    or jsonb_typeof(requested->'board'->'actualWidthInches')<>'number'
    or (requested->'board'->>'actualWidthInches')::numeric<=0
    or (requested->'board'->>'actualWidthInches')::numeric>100
    or jsonb_typeof(requested->'board'->'gapInches')<>'number'
    or (requested->'board'->>'gapInches')::numeric<0
    or (requested->'board'->>'gapInches')::numeric>12
    or (requested->'board'->'stockLengthFeet'<>'null'::jsonb and (
      jsonb_typeof(requested->'board'->'stockLengthFeet')<>'number'
      or (requested->'board'->>'stockLengthFeet')::numeric<0
      or (requested->'board'->>'stockLengthFeet')::numeric>1000
    ))
    or jsonb_typeof(requested->'board'->'wastePercent')<>'number'
    or (requested->'board'->>'wastePercent')::numeric<0
    or (requested->'board'->>'wastePercent')::numeric>100
    or jsonb_typeof(requested->'lines')<>'array'
    or jsonb_array_length(requested->'lines')<>2 then return false; end if;

  for line in select value from jsonb_array_elements(requested->'lines') loop
    if jsonb_typeof(line)<>'object'
      or (select count(*) from jsonb_object_keys(line))<>7
      or exists(select 1 from jsonb_object_keys(line) key where key not in (
        'key','description','quantity','unit','unitCost','sourceReference','catalogMaterialId'
      ))
      or line->>'key' not in ('custom_decking','custom_railing')
      or jsonb_typeof(line->'description')<>'string'
      or length(line->>'description')>2000
      or jsonb_typeof(line->'unit')<>'string'
      or length(line->>'unit')>40
      or jsonb_typeof(line->'sourceReference')<>'string'
      or length(line->>'sourceReference')>1000
      or (line->'quantity'<>'null'::jsonb and (
        jsonb_typeof(line->'quantity')<>'number'
        or (line->>'quantity')::numeric<0
        or (line->>'quantity')::numeric>1000000
      ))
      or (line->'unitCost'<>'null'::jsonb and (
        jsonb_typeof(line->'unitCost')<>'number'
        or (line->>'unitCost')::numeric<0
        or (line->>'unitCost')::numeric>1000000
      ))
      or (line->'catalogMaterialId'<>'null'::jsonb and (
        jsonb_typeof(line->'catalogMaterialId')<>'string'
        or (line->>'catalogMaterialId') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      )) then return false; end if;
  end loop;
  if (select count(distinct value->>'key') from jsonb_array_elements(requested->'lines'))<>2 then return false; end if;
  return true;
exception when others then return false;
end
$function$;

create or replace function public.create_guided_deck_finish_selection_revision(
  requested_auth_user_id uuid,
  requested_visit_id uuid,
  requested_expected_selection_revision integer,
  requested_shape_revision_id uuid,
  requested_shape_revision integer,
  requested_shape_digest text,
  requested_structural_plan_revision_id uuid,
  requested_idempotency_key text,
  requested_request_sha256 text,
  requested_selection_snapshot jsonb
)
returns table(result_code text,finish_selection_revision_id uuid,next_selection_revision integer,idempotent_replay boolean)
language plpgsql security definer
set search_path=pg_catalog,public
as $function$
declare
  company uuid;
  visit public.guided_site_visits;
  estimate_record public.estimates;
  shape public.guided_deck_shape_revisions;
  structural_plan public.guided_deck_structural_plan_revisions;
  existing public.guided_deck_finish_selection_revisions;
  prior public.guided_deck_finish_selection_revisions;
  current_revision integer;
  created_id uuid;
begin
  company := public.guided_site_visit_actor_company(requested_auth_user_id);
  if company is null then return query select 'forbidden',null::uuid,null::integer,false; return; end if;
  if requested_expected_selection_revision<0
    or requested_shape_digest !~ '^[0-9a-f]{64}$'
    or requested_request_sha256 !~ '^[0-9a-f]{64}$'
    or nullif(btrim(coalesce(requested_idempotency_key,'')),'') is null
    or length(requested_idempotency_key)>200
    or not public.is_valid_guided_deck_finish_selection(requested_selection_snapshot) then
    return query select 'invalid_selection',null::uuid,null::integer,false; return;
  end if;
  select * into existing from public.guided_deck_finish_selection_revisions
  where company_id=company and idempotency_key=requested_idempotency_key;
  if existing.id is not null then
    if existing.visit_id=requested_visit_id
      and existing.selection_revision=requested_expected_selection_revision+1
      and existing.shape_revision_id=requested_shape_revision_id
      and existing.shape_revision=requested_shape_revision
      and existing.shape_digest=requested_shape_digest
      and existing.structural_plan_revision_id=requested_structural_plan_revision_id
      and existing.request_sha256=requested_request_sha256
      and existing.selection_snapshot=requested_selection_snapshot
      and existing.saved_by_auth_user_id=requested_auth_user_id then
      return query select 'ok',existing.id,existing.selection_revision,true;
    else
      return query select 'idempotency_conflict',existing.id,existing.selection_revision,false;
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

  perform pg_advisory_xact_lock(hashtextextended(company::text||':'||visit.id::text||':finish-selection',0));
  select * into shape from public.guided_deck_shape_revisions
  where company_id=company and visit_id=visit.id order by shape_revision desc limit 1;
  select * into structural_plan from public.guided_deck_structural_plan_revisions
  where company_id=company and visit_id=visit.id order by plan_revision desc limit 1;
  if shape.id is null or structural_plan.id is null
    or shape.id<>requested_shape_revision_id
    or shape.shape_revision<>requested_shape_revision
    or shape.request_sha256<>requested_shape_digest
    or structural_plan.id<>requested_structural_plan_revision_id
    or structural_plan.shape_revision_id<>shape.id
    or structural_plan.shape_revision<>shape.shape_revision
    or structural_plan.shape_digest<>shape.request_sha256 then
    return query select 'stale_design',null::uuid,null::integer,false; return;
  end if;
  select * into prior from public.guided_deck_finish_selection_revisions
  where company_id=company and visit_id=visit.id order by selection_revision desc limit 1;
  current_revision:=coalesce(prior.selection_revision,0);
  if current_revision<>requested_expected_selection_revision then
    return query select 'stale_selection_revision',prior.id,current_revision,false; return;
  end if;
  insert into public.guided_deck_finish_selection_revisions(
    company_id,visit_id,target_estimate_id,selection_revision,shape_revision_id,
    shape_revision,shape_digest,structural_plan_revision_id,snapshot_version,
    selection_snapshot,supersedes_selection_revision_id,idempotency_key,
    request_sha256,saved_by_auth_user_id
  ) values(
    company,visit.id,visit.target_estimate_id,current_revision+1,shape.id,
    shape.shape_revision,shape.request_sha256,structural_plan.id,
    'custom-deck-finish-draft-v1',requested_selection_snapshot,prior.id,
    requested_idempotency_key,requested_request_sha256,requested_auth_user_id
  ) returning id into created_id;
  return query select 'ok',created_id,current_revision+1,false;
end
$function$;

revoke all on function public.is_valid_guided_deck_finish_selection(jsonb) from public,anon,authenticated;
revoke all on function public.create_guided_deck_finish_selection_revision(uuid,uuid,integer,uuid,integer,text,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.create_guided_deck_finish_selection_revision(uuid,uuid,integer,uuid,integer,text,uuid,text,text,jsonb) to service_role;

comment on table public.guided_deck_finish_selection_revisions is
  'Append-only working Deck finish selections and estimating costs bound to the latest immutable custom shape and preliminary geometry revision. These drafts are not customer-ready estimate lines or purchase orders.';
comment on function public.create_guided_deck_finish_selection_revision(uuid,uuid,integer,uuid,integer,text,uuid,text,text,jsonb) is
  'Service-only working finish draft boundary with actor/company, editable estimate, latest shape, latest structural concept, exact revision, and idempotent replay checks.';

commit;
