begin;

create table public.guided_deck_shape_revisions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company_settings(id) on delete restrict,
  visit_id uuid not null,
  target_estimate_id uuid not null references public.estimates(id) on delete restrict,
  shape_revision integer not null check (shape_revision > 0),
  project_kind text not null check (project_kind in ('replacement','new_construction')),
  outline jsonb not null,
  stairs_present boolean not null,
  source text not null check (source in ('human_approved_site_shape')),
  source_visit_revision integer not null check (source_visit_revision >= 0),
  supersedes_shape_revision_id uuid,
  idempotency_key text not null,
  request_sha256 text not null check (request_sha256 ~ '^[0-9a-f]{64}$'),
  approved_by_auth_user_id uuid not null,
  approved_at timestamptz not null default now(),
  unique(company_id,visit_id,shape_revision),
  unique(company_id,idempotency_key),
  unique(id,visit_id,company_id),
  foreign key(visit_id,company_id)
    references public.guided_site_visits(id,company_id) on delete restrict,
  foreign key(supersedes_shape_revision_id,visit_id,company_id)
    references public.guided_deck_shape_revisions(id,visit_id,company_id) on delete restrict,
  check(length(idempotency_key) between 1 and 200 and idempotency_key=btrim(idempotency_key))
);

alter table public.guided_deck_shape_revisions enable row level security;
revoke all on table public.guided_deck_shape_revisions from public,anon,authenticated;
grant select on table public.guided_deck_shape_revisions to service_role;

create trigger prevent_guided_deck_shape_revision_mutation
before update or delete on public.guided_deck_shape_revisions
for each row execute function public.prevent_guided_site_visit_photo_batch_mutation();

create or replace function public.guided_deck_shape_segments_intersect(
  ax numeric, ay numeric, bx numeric, b_y numeric,
  cx numeric, cy numeric, dx numeric, dy numeric
)
returns boolean
language plpgsql immutable
set search_path=pg_catalog,public
as $function$
declare
  o1 numeric := (bx-ax)*(cy-ay)-(b_y-ay)*(cx-ax);
  o2 numeric := (bx-ax)*(dy-ay)-(b_y-ay)*(dx-ax);
  o3 numeric := (dx-cx)*(ay-cy)-(dy-cy)*(ax-cx);
  o4 numeric := (dx-cx)*(b_y-cy)-(dy-cy)*(bx-cx);
begin
  if ((o1 > 0 and o2 < 0) or (o1 < 0 and o2 > 0))
    and ((o3 > 0 and o4 < 0) or (o3 < 0 and o4 > 0)) then
    return true;
  end if;
  if o1=0 and cx between least(ax,bx) and greatest(ax,bx)
    and cy between least(ay,b_y) and greatest(ay,b_y) then return true; end if;
  if o2=0 and dx between least(ax,bx) and greatest(ax,bx)
    and dy between least(ay,b_y) and greatest(ay,b_y) then return true; end if;
  if o3=0 and ax between least(cx,dx) and greatest(cx,dx)
    and ay between least(cy,dy) and greatest(cy,dy) then return true; end if;
  if o4=0 and bx between least(cx,dx) and greatest(cx,dx)
    and b_y between least(cy,dy) and greatest(cy,dy) then return true; end if;
  return false;
end
$function$;

create or replace function public.is_valid_guided_deck_shape(requested_outline jsonb)
returns boolean
language plpgsql immutable
set search_path=pg_catalog,public
as $function$
declare
  n integer;
  i integer;
  j integer;
  a jsonb;
  b jsonb;
  c jsonb;
  d jsonb;
  ax numeric;
  ay numeric;
  bx numeric;
  b_y numeric;
  area_twice numeric := 0;
begin
  if jsonb_typeof(requested_outline) <> 'array' then return false; end if;
  n := jsonb_array_length(requested_outline);
  if n < 3 or n > 24 then return false; end if;

  for i in 0..n-1 loop
    a := requested_outline->i;
    b := requested_outline->((i+1)%n);
    if jsonb_typeof(a) <> 'object' or not (a ? 'x' and a ? 'y')
      or exists(select 1 from jsonb_object_keys(a) key where key not in ('x','y'))
      or jsonb_typeof(a->'x') <> 'number' or jsonb_typeof(a->'y') <> 'number' then
      return false;
    end if;
    ax := (a->>'x')::numeric;
    ay := (a->>'y')::numeric;
    bx := (b->>'x')::numeric;
    b_y := (b->>'y')::numeric;
    if ax < 0 or ay < 0 or ax > 200 or ay > 200
      or (ax=bx and ay=b_y) then return false; end if;
    area_twice := area_twice + ax*b_y-bx*ay;
  end loop;
  if abs(area_twice) < 2 or abs(area_twice) > 20000 then return false; end if;

  for i in 0..n-1 loop
    a := requested_outline->i;
    b := requested_outline->((i+1)%n);
    for j in i+1..n-1 loop
      if j=i or j=(i+1)%n or (i=0 and j=n-1) then continue; end if;
      c := requested_outline->j;
      d := requested_outline->((j+1)%n);
      if public.guided_deck_shape_segments_intersect(
        (a->>'x')::numeric,(a->>'y')::numeric,(b->>'x')::numeric,(b->>'y')::numeric,
        (c->>'x')::numeric,(c->>'y')::numeric,(d->>'x')::numeric,(d->>'y')::numeric
      ) then return false; end if;
    end loop;
  end loop;
  return true;
exception when others then
  return false;
end
$function$;

create or replace function public.approve_guided_deck_shape_revision(
  requested_auth_user_id uuid,
  requested_visit_id uuid,
  requested_expected_shape_revision integer,
  requested_idempotency_key text,
  requested_request_sha256 text,
  requested_project_kind text,
  requested_outline jsonb,
  requested_stairs_present boolean
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
    or not public.is_valid_guided_deck_shape(requested_outline) then
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
    stairs_present,source,source_visit_revision,supersedes_shape_revision_id,
    idempotency_key,request_sha256,approved_by_auth_user_id
  ) values(
    company,visit.id,visit.target_estimate_id,current_revision+1,requested_project_kind,requested_outline,
    requested_stairs_present,'human_approved_site_shape',visit.revision,prior.id,
    requested_idempotency_key,requested_request_sha256,requested_auth_user_id
  ) returning id into created_id;
  return query select 'ok',created_id,current_revision+1,false;
end
$function$;

revoke all on function public.guided_deck_shape_segments_intersect(numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric) from public,anon,authenticated;
revoke all on function public.is_valid_guided_deck_shape(jsonb) from public,anon,authenticated;
revoke all on function public.approve_guided_deck_shape_revision(uuid,uuid,integer,text,text,text,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.approve_guided_deck_shape_revision(uuid,uuid,integer,text,text,text,jsonb,boolean) to service_role;

comment on table public.guided_deck_shape_revisions is
  'Append-only human-approved Deck footprints created after a completed site visit and before structural planning.';

commit;
