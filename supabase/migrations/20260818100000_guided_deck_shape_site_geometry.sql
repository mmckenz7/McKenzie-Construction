begin;

alter table public.guided_deck_shape_revisions
  add column stair_placement jsonb,
  add column grade_heights jsonb;

create or replace function public.is_valid_guided_deck_site_geometry(
  requested_outline jsonb,
  requested_stairs_present boolean,
  requested_stair_placement jsonb,
  requested_grade_heights jsonb
)
returns boolean
language plpgsql immutable
set search_path=pg_catalog,public
as $function$
declare
  key text;
  edge_index integer;
  edge_start jsonb;
  edge_end jsonb;
  edge_length numeric;
  stair_offset numeric;
  stair_width numeric;
begin
  if jsonb_typeof(requested_grade_heights)<>'object'
    or (select count(*) from jsonb_object_keys(requested_grade_heights))<>4 then return false; end if;
  foreach key in array array['houseLeftFeet','houseRightFeet','yardLeftFeet','yardRightFeet'] loop
    if not (requested_grade_heights ? key)
      or jsonb_typeof(requested_grade_heights->key)<>'number'
      or (requested_grade_heights->>key)::numeric<0
      or (requested_grade_heights->>key)::numeric>50 then return false; end if;
  end loop;
  if exists(select 1 from jsonb_object_keys(requested_grade_heights) item
    where item not in ('houseLeftFeet','houseRightFeet','yardLeftFeet','yardRightFeet')) then return false; end if;

  if not requested_stairs_present then return requested_stair_placement is null; end if;
  if jsonb_typeof(requested_stair_placement)<>'object'
    or (select count(*) from jsonb_object_keys(requested_stair_placement))<>4
    or exists(select 1 from jsonb_object_keys(requested_stair_placement) item
      where item not in ('edgeIndex','offsetFeet','widthFeet','projectionFeet')) then return false; end if;
  if jsonb_typeof(requested_stair_placement->'edgeIndex')<>'number'
    or jsonb_typeof(requested_stair_placement->'offsetFeet')<>'number'
    or jsonb_typeof(requested_stair_placement->'widthFeet')<>'number'
    or jsonb_typeof(requested_stair_placement->'projectionFeet')<>'number' then return false; end if;
  edge_index := (requested_stair_placement->>'edgeIndex')::integer;
  if edge_index<0 or edge_index>=jsonb_array_length(requested_outline)
    or (requested_stair_placement->>'edgeIndex')::numeric<>edge_index then return false; end if;
  stair_offset := (requested_stair_placement->>'offsetFeet')::numeric;
  stair_width := (requested_stair_placement->>'widthFeet')::numeric;
  if stair_offset<=0 or stair_offset>200 or stair_width<2 or stair_width>12
    or (requested_stair_placement->>'projectionFeet')::numeric<=0
    or (requested_stair_placement->>'projectionFeet')::numeric>30 then return false; end if;
  edge_start := requested_outline->edge_index;
  edge_end := requested_outline->((edge_index+1)%jsonb_array_length(requested_outline));
  edge_length := sqrt(
    power((edge_end->>'x')::numeric-(edge_start->>'x')::numeric,2)+
    power((edge_end->>'y')::numeric-(edge_start->>'y')::numeric,2)
  );
  return stair_width<=edge_length
    and stair_offset>=stair_width/2
    and stair_offset<=edge_length-stair_width/2;
exception when others then
  return false;
end
$function$;

alter table public.guided_deck_shape_revisions
  add constraint guided_deck_shape_site_geometry_valid check (
    (stair_placement is null and grade_heights is null)
    or public.is_valid_guided_deck_site_geometry(outline,stairs_present,stair_placement,grade_heights)
  );

create or replace function public.approve_guided_deck_shape_revision_v2(
  requested_auth_user_id uuid,
  requested_visit_id uuid,
  requested_expected_shape_revision integer,
  requested_idempotency_key text,
  requested_request_sha256 text,
  requested_project_kind text,
  requested_outline jsonb,
  requested_stairs_present boolean,
  requested_stair_placement jsonb,
  requested_grade_heights jsonb
)
returns table(result_code text,shape_revision_id uuid,next_shape_revision integer,idempotent_replay boolean)
language plpgsql security invoker
set search_path=pg_catalog,public
as $function$
declare
  company uuid;
  visit public.guided_site_visits;
  estimate_record public.estimates;
  existing public.guided_deck_shape_revisions;
  prior public.guided_deck_shape_revisions;
  current_revision integer;
  created_id uuid;
begin
  company := public.guided_site_visit_actor_company(requested_auth_user_id);
  if company is null then return query select 'forbidden',null::uuid,null::integer,false; return; end if;
  if requested_expected_shape_revision < 0
    or nullif(btrim(coalesce(requested_idempotency_key,'')),'') is null
    or length(requested_idempotency_key)>200
    or requested_request_sha256 !~ '^[0-9a-f]{64}$'
    or requested_project_kind not in ('replacement','new_construction')
    or requested_stairs_present is null
    or not public.is_valid_guided_deck_shape(requested_outline)
    or not public.is_valid_guided_deck_site_geometry(
      requested_outline,requested_stairs_present,requested_stair_placement,requested_grade_heights
    ) then
    return query select 'invalid_shape',null::uuid,null::integer,false; return;
  end if;

  select * into existing from public.guided_deck_shape_revisions
  where company_id=company and idempotency_key=requested_idempotency_key;
  if existing.id is not null then
    if existing.visit_id=requested_visit_id
      and existing.shape_revision=requested_expected_shape_revision+1
      and existing.request_sha256=requested_request_sha256
      and existing.project_kind=requested_project_kind
      and existing.outline=requested_outline
      and existing.stairs_present=requested_stairs_present
      and existing.stair_placement is not distinct from requested_stair_placement
      and existing.grade_heights=requested_grade_heights
      and existing.approved_by_auth_user_id=requested_auth_user_id then
      return query select 'ok',existing.id,existing.shape_revision,true;
    else
      return query select 'idempotency_conflict',existing.id,existing.shape_revision,false;
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

  perform pg_advisory_xact_lock(hashtextextended(company::text||':'||visit.id::text,0));
  select * into prior from public.guided_deck_shape_revisions
  where company_id=company and visit_id=visit.id order by shape_revision desc limit 1;
  current_revision := coalesce(prior.shape_revision,0);
  if current_revision<>requested_expected_shape_revision then
    return query select 'stale_shape_revision',prior.id,current_revision,false; return;
  end if;

  insert into public.guided_deck_shape_revisions(
    company_id,visit_id,target_estimate_id,shape_revision,project_kind,outline,
    stairs_present,stair_placement,grade_heights,source,source_visit_revision,
    supersedes_shape_revision_id,idempotency_key,request_sha256,approved_by_auth_user_id
  ) values(
    company,visit.id,visit.target_estimate_id,current_revision+1,requested_project_kind,requested_outline,
    requested_stairs_present,requested_stair_placement,requested_grade_heights,
    'human_approved_site_shape',visit.revision,prior.id,
    requested_idempotency_key,requested_request_sha256,requested_auth_user_id
  ) returning id into created_id;
  return query select 'ok',created_id,current_revision+1,false;
end
$function$;

revoke all on function public.is_valid_guided_deck_site_geometry(jsonb,boolean,jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.approve_guided_deck_shape_revision(uuid,uuid,integer,text,text,text,jsonb,boolean) from service_role;
revoke all on function public.approve_guided_deck_shape_revision_v2(uuid,uuid,integer,text,text,text,jsonb,boolean,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.approve_guided_deck_shape_revision_v2(uuid,uuid,integer,text,text,text,jsonb,boolean,jsonb,jsonb) to service_role;

comment on column public.guided_deck_shape_revisions.grade_heights is
  'Human-entered deck-to-grade heights at house-left, house-right, yard-left, and yard-right used for an estimating-only steady grade plane.';
comment on column public.guided_deck_shape_revisions.stair_placement is
  'Human-approved stair wall, offset, width, and projection associated with this immutable shape revision.';

commit;
