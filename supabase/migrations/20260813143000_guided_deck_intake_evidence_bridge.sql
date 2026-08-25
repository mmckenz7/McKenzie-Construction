begin;

alter table public.guided_site_visit_intake_assignment_events
  add constraint guided_intake_assignment_event_context_unique
  unique(id,visit_item_id,visit_id,company_id);

create table public.guided_site_visit_intake_item_confirmations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company_settings(id) on delete restrict,
  visit_id uuid not null,
  visit_item_id uuid not null,
  idempotency_key text not null,
  requested_expected_revision integer not null check(requested_expected_revision>=0),
  canonical_assignment_event_ids jsonb not null check(jsonb_typeof(canonical_assignment_event_ids)='array'),
  confirmed_observation jsonb not null check(jsonb_typeof(confirmed_observation)='object'),
  resulting_visit_revision integer not null check(resulting_visit_revision>=0),
  confirmed_by_auth_user_id uuid not null,
  created_at timestamptz not null default now(),
  unique(company_id,idempotency_key),
  unique(company_id,visit_item_id),
  unique(id,visit_item_id,visit_id,company_id),
  foreign key(visit_item_id,visit_id,company_id)
    references public.guided_site_visit_items(id,visit_id,company_id) on delete restrict,
  check(length(idempotency_key) between 1 and 200 and idempotency_key=btrim(idempotency_key))
);

create table public.guided_site_visit_intake_item_confirmation_facts (
  confirmation_id uuid not null,
  company_id uuid not null,
  visit_id uuid not null,
  visit_item_id uuid not null,
  criterion_key text not null,
  source_assignment_event_id uuid not null,
  source_intake_attempt_id uuid not null,
  source_asset_id uuid not null,
  human_decision text not null check(human_decision in('accepted','corrected')),
  created_at timestamptz not null default now(),
  primary key(confirmation_id,criterion_key),
  foreign key(confirmation_id,visit_item_id,visit_id,company_id)
    references public.guided_site_visit_intake_item_confirmations(id,visit_item_id,visit_id,company_id) on delete restrict,
  foreign key(source_assignment_event_id,visit_item_id,visit_id,company_id)
    references public.guided_site_visit_intake_assignment_events(id,visit_item_id,visit_id,company_id) on delete restrict,
  foreign key(source_intake_attempt_id,visit_id,company_id)
    references public.guided_site_visit_intake_attempts(id,visit_id,company_id) on delete restrict,
  foreign key(source_asset_id) references public.ai_estimator_assets(id) on delete restrict
);

alter table public.guided_site_visit_intake_item_confirmations enable row level security;
alter table public.guided_site_visit_intake_item_confirmation_facts enable row level security;
revoke all on table public.guided_site_visit_intake_item_confirmations,
  public.guided_site_visit_intake_item_confirmation_facts from public,anon,authenticated,service_role;
grant select on table public.guided_site_visit_intake_item_confirmations,
  public.guided_site_visit_intake_item_confirmation_facts to service_role;

create trigger prevent_guided_intake_item_confirmation_mutation
before update or delete on public.guided_site_visit_intake_item_confirmations
for each row execute function public.prevent_guided_site_visit_photo_batch_mutation();
create trigger prevent_guided_intake_item_confirmation_fact_mutation
before update or delete on public.guided_site_visit_intake_item_confirmation_facts
for each row execute function public.prevent_guided_site_visit_photo_batch_mutation();

create or replace function public.enforce_guided_intake_assignment_editable_item()
returns trigger language plpgsql set search_path=pg_catalog,public as $f$
begin
  if not exists(
    select 1 from public.guided_site_visits v
    join public.guided_site_visit_items i
      on i.visit_id=v.id and i.company_id=v.company_id
    where v.id=new.visit_id and v.company_id=new.company_id and v.status='in_progress'
      and i.id=new.visit_item_id and i.state='pending'
  ) then
    raise exception 'Guided intake assignment target is not editable.' using errcode='55000';
  end if;
  return new;
end;
$f$;
create trigger enforce_guided_intake_assignment_editable_item
before insert on public.guided_site_visit_intake_assignment_events
for each row execute function public.enforce_guided_intake_assignment_editable_item();

alter function public.decide_guided_site_visit_intake_assignment(uuid,uuid,uuid,uuid,uuid,text,text,uuid,integer,text)
  rename to decide_guided_site_visit_intake_assignment_unhardened;
revoke all on function public.decide_guided_site_visit_intake_assignment_unhardened(uuid,uuid,uuid,uuid,uuid,text,text,uuid,integer,text)
  from public,anon,authenticated,service_role;

create function public.decide_guided_site_visit_intake_assignment(
  requested_auth_user_id uuid,requested_visit_id uuid,requested_attempt_id uuid,
  requested_review_id uuid,requested_item_id uuid,requested_criterion_key text,
  requested_decision text,requested_supersedes_event_id uuid,
  requested_expected_revision integer,requested_idempotency_key text
)
returns table(result_code text,event_id uuid,next_revision integer,idempotent_replay boolean)
language plpgsql security definer set search_path=pg_catalog,public as $f$
declare company uuid; visit public.guided_site_visits; item public.guided_site_visit_items;
  existing public.guided_site_visit_intake_assignment_events;
begin
  company:=public.guided_site_visit_actor_company(requested_auth_user_id);
  if company is null then
    return query select 'forbidden',null::uuid,null::integer,false; return;
  end if;
  select * into existing from public.guided_site_visit_intake_assignment_events
    where company_id=company and idempotency_key=requested_idempotency_key;
  if existing.id is not null then
    return query select * from public.decide_guided_site_visit_intake_assignment_unhardened(
      requested_auth_user_id,requested_visit_id,requested_attempt_id,requested_review_id,
      requested_item_id,requested_criterion_key,requested_decision,requested_supersedes_event_id,
      requested_expected_revision,requested_idempotency_key
    );
    return;
  end if;
  select * into visit from public.guided_site_visits
    where id=requested_visit_id and company_id=company;
  select * into item from public.guided_site_visit_items
    where id=requested_item_id and visit_id=requested_visit_id and company_id=company;
  if visit.id is null or item.id is null then
    return query select 'not_found',null::uuid,null::integer,false; return;
  end if;
  if visit.status<>'in_progress' or item.state<>'pending' then
    return query select 'not_editable',null::uuid,visit.revision,false; return;
  end if;
  return query select * from public.decide_guided_site_visit_intake_assignment_unhardened(
    requested_auth_user_id,requested_visit_id,requested_attempt_id,requested_review_id,
    requested_item_id,requested_criterion_key,requested_decision,requested_supersedes_event_id,
    requested_expected_revision,requested_idempotency_key
  );
end;
$f$;

create function public.confirm_guided_site_visit_item_from_intake(
  requested_auth_user_id uuid,requested_visit_id uuid,requested_item_id uuid,
  requested_expected_revision integer,requested_idempotency_key text,
  requested_assignment_event_ids jsonb,requested_observation jsonb
)
returns table(result_code text,confirmation_id uuid,next_revision integer,idempotent_replay boolean)
language plpgsql security definer set search_path=pg_catalog,public as $f$
declare
  company uuid; visit public.guided_site_visits; item public.guided_site_visit_items;
  existing public.guided_site_visit_intake_item_confirmations; assignment public.guided_site_visit_intake_assignment_events;
  canonical jsonb; declared_keys text[]; selected_keys text[]; selected_assets integer; event_id uuid;
  created uuid; nextv integer;
begin
  company:=public.guided_site_visit_actor_company(requested_auth_user_id);
  if company is null then return query select 'forbidden',null::uuid,null::integer,false; return; end if;
  if jsonb_typeof(requested_assignment_event_ids)<>'array' or jsonb_array_length(requested_assignment_event_ids) not between 1 and 12
    or jsonb_typeof(requested_observation)<>'object'
    or nullif(btrim(coalesce(requested_idempotency_key,'')),'') is null
    or length(requested_idempotency_key)>200
    or exists(select 1 from jsonb_array_elements(requested_assignment_event_ids) value where jsonb_typeof(value)<>'string' or value#>>'{}' !~ '^[0-9a-f-]{36}$')
  then return query select 'invalid_confirmation',null::uuid,null::integer,false; return; end if;
  canonical:=coalesce((select jsonb_agg(value order by value#>>'{}') from jsonb_array_elements(requested_assignment_event_ids) value),'[]'::jsonb);
  if jsonb_array_length(canonical)<>(select count(distinct value#>>'{}') from jsonb_array_elements(canonical) value)
  then return query select 'invalid_confirmation',null::uuid,null::integer,false; return; end if;

  select * into existing from public.guided_site_visit_intake_item_confirmations
    where company_id=company and idempotency_key=requested_idempotency_key;
  if existing.id is not null then
    if existing.visit_id=requested_visit_id and existing.visit_item_id=requested_item_id
      and existing.requested_expected_revision=requested_expected_revision
      and existing.canonical_assignment_event_ids=canonical
      and existing.confirmed_observation=requested_observation
      and existing.confirmed_by_auth_user_id=requested_auth_user_id
    then return query select 'ok',existing.id,existing.resulting_visit_revision,true;
    else return query select 'idempotency_conflict',existing.id,null::integer,false; end if;
    return;
  end if;

  select * into visit from public.guided_site_visits
    where id=requested_visit_id and company_id=company for update;
  if visit.id is null then return query select 'not_found',null::uuid,null::integer,false; return; end if;
  if visit.status<>'in_progress' then return query select 'not_editable',null::uuid,visit.revision,false; return; end if;
  if visit.revision<>requested_expected_revision then return query select 'stale_revision',null::uuid,visit.revision,false; return; end if;
  select * into item from public.guided_site_visit_items
    where id=requested_item_id and visit_id=visit.id and company_id=company and state='pending' for update;
  if item.id is null then return query select 'not_editable',null::uuid,visit.revision,false; return; end if;
  if item.item_key in('access_demolition','utilities_obstructions')
    or public.is_valid_guided_site_visit_observation(item.requirement,requested_observation) is distinct from true
  then return query select 'requirements_incomplete',null::uuid,visit.revision,false; return; end if;

  declared_keys:=public.guided_site_visit_visible_fact_keys(item.item_key);
  select array_agg(e.criterion_key order by e.criterion_key),count(distinct e.asset_id)
    into selected_keys,selected_assets
  from jsonb_array_elements_text(canonical) chosen(id)
  join public.guided_site_visit_intake_assignment_events e on e.id=chosen.id::uuid
  join public.guided_site_visit_intake_attempts a
    on a.id=e.intake_attempt_id and a.visit_id=e.visit_id and a.company_id=e.company_id and a.state='confirmed'
  join public.ai_estimator_assets asset on asset.id=e.asset_id and asset.company_id=e.company_id and asset.status='available'
  join public.guided_site_visit_intake_classification_reviews review
    on review.id=e.classification_review_id and review.intake_attempt_id=e.intake_attempt_id
      and review.company_id=e.company_id and review.diagnostic_class='classified'
  where e.company_id=company and e.visit_id=visit.id and e.visit_item_id=item.id
    and e.decision in('accepted','corrected')
    and not exists(select 1 from public.guided_site_visit_intake_assignment_events later where later.supersedes_assignment_event_id=e.id);
  if selected_keys is distinct from (select array_agg(k order by k) from unnest(declared_keys) k)
    or selected_assets not between 1 and 5
  then return query select 'invalid_evidence',null::uuid,visit.revision,false; return; end if;

  nextv:=visit.revision+1;
  insert into public.guided_site_visit_intake_item_confirmations(
    company_id,visit_id,visit_item_id,idempotency_key,requested_expected_revision,
    canonical_assignment_event_ids,confirmed_observation,resulting_visit_revision,confirmed_by_auth_user_id
  ) values(company,visit.id,item.id,requested_idempotency_key,requested_expected_revision,
    canonical,requested_observation,nextv,requested_auth_user_id) returning id into created;
  for event_id in select value::uuid from jsonb_array_elements_text(canonical) value loop
    select * into assignment from public.guided_site_visit_intake_assignment_events where id=event_id;
    insert into public.guided_site_visit_intake_item_confirmation_facts(
      confirmation_id,company_id,visit_id,visit_item_id,criterion_key,source_assignment_event_id,
      source_intake_attempt_id,source_asset_id,human_decision
    ) values(created,company,visit.id,item.id,assignment.criterion_key,assignment.id,
      assignment.intake_attempt_id,assignment.asset_id,assignment.decision);
  end loop;
  update public.guided_site_visit_items set state='confirmed',observation=requested_observation,
    confirmed_by_auth_user_id=requested_auth_user_id,confirmed_at=now()
    where id=item.id and state='pending';
  if not found then raise exception 'stale item' using errcode='P0001'; end if;
  update public.guided_site_visits set revision=nextv,updated_at=now() where id=visit.id;
  return query select 'ok',created,nextv,false;
exception when invalid_text_representation or unique_violation or check_violation or raise_exception then
  return query select 'invalid_confirmation',null::uuid,visit.revision,false;
end;
$f$;

revoke all on function public.enforce_guided_intake_assignment_editable_item(),
  public.decide_guided_site_visit_intake_assignment(uuid,uuid,uuid,uuid,uuid,text,text,uuid,integer,text),
  public.confirm_guided_site_visit_item_from_intake(uuid,uuid,uuid,integer,text,jsonb,jsonb)
  from public,anon,authenticated;
grant execute on function public.decide_guided_site_visit_intake_assignment(uuid,uuid,uuid,uuid,uuid,text,text,uuid,integer,text),
  public.confirm_guided_site_visit_item_from_intake(uuid,uuid,uuid,integer,text,jsonb,jsonb)
  to service_role;

comment on table public.guided_site_visit_intake_item_confirmations is
  'Immutable human confirmation that exact effective whole-visit intake assignments satisfy one required item; measurements remain human-entered.';

commit;
