begin;

insert into public.feature_settings(scope_type,scope_id,feature_key,is_enabled,display_name,description,category,sort_order)
values('global','default','guided_site_visit_ai_usability_review',false,'Guided Visit AI Usability Review','Advisory-only AI review of confirmed Guided Site Visit photos.','sales',112)
on conflict(scope_type,scope_id,feature_key) do nothing;

alter table public.guided_site_visit_photo_attempts
  add constraint guided_site_visit_photo_attempts_review_context_unique
  unique(id,asset_id,visit_item_id,visit_id,company_id);

create or replace function public.text_array_has_unique_values(requested_values text[])
returns boolean language sql immutable parallel safe set search_path=pg_catalog as $$
  select cardinality(requested_values)=count(distinct value) from unnest(requested_values) value
$$;

create table public.guided_site_visit_ai_usability_reviews (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company_settings(id) on delete restrict,
  visit_id uuid not null,
  visit_item_id uuid not null,
  photo_attempt_id uuid not null,
  asset_id uuid not null,
  idempotency_key text not null,
  provider text not null,
  model_version text not null,
  prompt_version text not null,
  schema_version text not null,
  request_sha256 text not null,
  response_sha256 text not null,
  verdict text not null check(verdict in ('usable','retake_recommended','unable_to_assess')),
  issue_codes text[] not null default '{}',
  created_by_auth_user_id uuid not null,
  created_at timestamptz not null default now(),
  unique(company_id,idempotency_key),
  unique(id,company_id),
  foreign key(photo_attempt_id,asset_id,visit_item_id,visit_id,company_id)
    references public.guided_site_visit_photo_attempts(id,asset_id,visit_item_id,visit_id,company_id) on delete restrict,
  check(length(idempotency_key) between 1 and 200 and idempotency_key=btrim(idempotency_key)),
  check(length(provider) between 1 and 100 and provider=btrim(provider)),
  check(length(model_version) between 1 and 200 and model_version=btrim(model_version)),
  check(length(prompt_version) between 1 and 200 and prompt_version=btrim(prompt_version)),
  check(length(schema_version) between 1 and 200 and schema_version=btrim(schema_version)),
  check(request_sha256 ~ '^[0-9a-f]{64}$'),
  check(response_sha256 ~ '^[0-9a-f]{64}$'),
  check(cardinality(issue_codes)<=10),
  check(issue_codes <@ array['blurry','too_dark','too_bright','glare','obstructed','wrong_subject','incomplete_view','too_distant','orientation_problem','unsupported_media']::text[]),
  check(public.text_array_has_unique_values(issue_codes)),
  check((verdict='usable' and cardinality(issue_codes)=0) or (verdict<>'usable' and cardinality(issue_codes)>0))
);

create index guided_site_visit_ai_reviews_photo_idx
on public.guided_site_visit_ai_usability_reviews(company_id,visit_id,visit_item_id,photo_attempt_id,created_at);

create or replace function public.prevent_guided_site_visit_ai_review_mutation()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin
  raise exception 'Guided Site Visit AI usability reviews are append-only.' using errcode='55000';
end $$;

create trigger prevent_guided_site_visit_ai_review_mutation
before update or delete on public.guided_site_visit_ai_usability_reviews
for each row execute function public.prevent_guided_site_visit_ai_review_mutation();

create or replace function public.record_guided_site_visit_ai_usability_review(
  requested_auth_user_id uuid,requested_visit_id uuid,requested_visit_item_id uuid,
  requested_photo_attempt_id uuid,requested_asset_id uuid,requested_idempotency_key text,
  requested_provider text,requested_model_version text,requested_prompt_version text,
  requested_schema_version text,requested_request_sha256 text,requested_response_sha256 text,
  requested_verdict text,requested_issue_codes text[]
)
returns table(result_code text,review_id uuid,idempotent_replay boolean)
language plpgsql security definer set search_path=pg_catalog,public as $function$
declare company uuid; existing public.guided_site_visit_ai_usability_reviews; created_id uuid;
begin
  company:=public.guided_site_visit_actor_company(requested_auth_user_id);
  if company is null then return query select 'forbidden',null::uuid,false;return;end if;
  if not exists(select 1 from public.guided_site_visit_photo_attempts p
    where p.id=requested_photo_attempt_id and p.asset_id=requested_asset_id
      and p.visit_item_id=requested_visit_item_id and p.visit_id=requested_visit_id
      and p.company_id=company and p.state='confirmed') then
    return query select 'not_found',null::uuid,false;return;
  end if;
  select * into existing from public.guided_site_visit_ai_usability_reviews
    where company_id=company and idempotency_key=requested_idempotency_key;
  if existing.id is not null then
    if existing.visit_id=requested_visit_id and existing.visit_item_id=requested_visit_item_id
      and existing.photo_attempt_id=requested_photo_attempt_id and existing.asset_id=requested_asset_id
      and existing.provider=requested_provider and existing.model_version=requested_model_version
      and existing.prompt_version=requested_prompt_version and existing.schema_version=requested_schema_version
      and existing.request_sha256=requested_request_sha256 and existing.response_sha256=requested_response_sha256
      and existing.verdict=requested_verdict and existing.issue_codes=requested_issue_codes then
      return query select 'ok',existing.id,true;return;
    end if;
    return query select 'idempotency_conflict',existing.id,false;return;
  end if;
  insert into public.guided_site_visit_ai_usability_reviews(company_id,visit_id,visit_item_id,photo_attempt_id,asset_id,
    idempotency_key,provider,model_version,prompt_version,schema_version,request_sha256,response_sha256,verdict,issue_codes,
    created_by_auth_user_id)
  values(company,requested_visit_id,requested_visit_item_id,requested_photo_attempt_id,requested_asset_id,
    requested_idempotency_key,requested_provider,requested_model_version,requested_prompt_version,requested_schema_version,
    requested_request_sha256,requested_response_sha256,requested_verdict,requested_issue_codes,requested_auth_user_id)
  returning id into created_id;
  return query select 'ok',created_id,false;
exception
  when check_violation or not_null_violation or string_data_right_truncation or invalid_text_representation then
    return query select 'invalid_review',null::uuid,false;
  when unique_violation then
    select * into existing from public.guided_site_visit_ai_usability_reviews
      where company_id=company and idempotency_key=requested_idempotency_key;
    if existing.id is not null and existing.visit_id=requested_visit_id
      and existing.visit_item_id=requested_visit_item_id and existing.photo_attempt_id=requested_photo_attempt_id
      and existing.asset_id=requested_asset_id and existing.provider=requested_provider
      and existing.model_version=requested_model_version and existing.prompt_version=requested_prompt_version
      and existing.schema_version=requested_schema_version and existing.request_sha256=requested_request_sha256
      and existing.response_sha256=requested_response_sha256 and existing.verdict=requested_verdict
      and existing.issue_codes=requested_issue_codes then
      return query select 'ok',existing.id,true;return;
    end if;
    return query select 'idempotency_conflict',existing.id,false;
end $function$;

alter table public.guided_site_visit_ai_usability_reviews enable row level security;
revoke all on table public.guided_site_visit_ai_usability_reviews from public,anon,authenticated,service_role;
grant select on table public.guided_site_visit_ai_usability_reviews to service_role;
revoke all on function public.prevent_guided_site_visit_ai_review_mutation(),
 public.text_array_has_unique_values(text[]),
 public.record_guided_site_visit_ai_usability_review(uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text,text,text,text[])
 from public,anon,authenticated;
grant execute on function public.prevent_guided_site_visit_ai_review_mutation(),
 public.text_array_has_unique_values(text[]),
 public.record_guided_site_visit_ai_usability_review(uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text,text,text,text[])
 to service_role;

comment on table public.guided_site_visit_ai_usability_reviews is
 'Immutable advisory photo-usability evidence. It cannot supply measurements or mutate Guided Site Visit item or completion state.';

commit;
