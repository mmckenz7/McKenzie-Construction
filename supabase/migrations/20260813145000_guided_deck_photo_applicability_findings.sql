begin;

create table public.guided_site_visit_intake_applicability_findings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  visit_id uuid not null,
  visit_item_id uuid not null,
  intake_attempt_id uuid not null,
  classification_review_id uuid not null,
  finding_key text not null check(finding_key ~ '^[a-z][a-z0-9_]{0,63}$'),
  finding text not null check(finding in ('present','absent','unclear')),
  confidence numeric(5,4) not null check(confidence between 0 and 1),
  reason text not null check(length(btrim(reason)) between 1 and 500),
  created_at timestamptz not null default now(),
  unique(classification_review_id,visit_item_id,finding_key),
  foreign key(classification_review_id,visit_id,company_id)
    references public.guided_site_visit_intake_classification_reviews(id,visit_id,company_id) on delete restrict,
  foreign key(intake_attempt_id,visit_id,company_id)
    references public.guided_site_visit_intake_attempts(id,visit_id,company_id) on delete restrict,
  foreign key(visit_item_id,visit_id,company_id)
    references public.guided_site_visit_items(id,visit_id,company_id) on delete restrict
);

alter table public.guided_site_visit_intake_applicability_findings enable row level security;
revoke all on table public.guided_site_visit_intake_applicability_findings
  from public,anon,authenticated,service_role;
grant select on table public.guided_site_visit_intake_applicability_findings to service_role;

create trigger prevent_guided_intake_applicability_finding_mutation
before update or delete on public.guided_site_visit_intake_applicability_findings
for each row execute function public.prevent_guided_site_visit_photo_batch_mutation();

create function public.record_guided_site_visit_intake_classification_v2(
  requested_auth_user_id uuid,
  requested_visit_id uuid,
  requested_attempt_id uuid,
  requested_idempotency_key text,
  requested_provider text,
  requested_model_version text,
  requested_prompt_version text,
  requested_schema_version text,
  requested_request_sha256 text,
  requested_response_sha256 text,
  requested_diagnostic_class text,
  requested_issue_codes text[],
  requested_proposals jsonb,
  requested_applicability_findings jsonb
)
returns table(result_code text,review_id uuid,idempotent_replay boolean)
language plpgsql security definer set search_path=pg_catalog,public as $function$
declare
  company uuid;
  recorded record;
  existing_review public.guided_site_visit_intake_classification_reviews;
  existing_findings jsonb;
  finding_record jsonb;
  item public.guided_site_visit_items;
begin
  company:=public.guided_site_visit_actor_company(requested_auth_user_id);
  if company is null then
    return query select 'forbidden',null::uuid,false;
    return;
  end if;
  if jsonb_typeof(requested_applicability_findings)<>'array'
    or jsonb_array_length(requested_applicability_findings)>16
    or requested_diagnostic_class<>'classified' and requested_applicability_findings<>'[]'::jsonb
  then
    return query select 'invalid_applicability_findings',null::uuid,false;
    return;
  end if;
  for finding_record in select value from jsonb_array_elements(requested_applicability_findings) loop
    if jsonb_typeof(finding_record)<>'object'
      or (select array_agg(key order by key) from jsonb_object_keys(finding_record) key)
        is distinct from array['confidence','finding','findingKey','reason','visitItemId']::text[]
      or finding_record->>'visitItemId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      or finding_record->>'finding' not in ('present','absent','unclear')
      or jsonb_typeof(finding_record->'confidence')<>'number'
      or (finding_record->>'confidence')::numeric not between 0 and 1
      or jsonb_typeof(finding_record->'reason')<>'string'
      or length(btrim(finding_record->>'reason')) not between 1 and 500
    then
      return query select 'invalid_applicability_findings',null::uuid,false;
      return;
    end if;
    select * into item from public.guided_site_visit_items
      where id=(finding_record->>'visitItemId')::uuid
        and visit_id=requested_visit_id and company_id=company;
    if item.id is null or not (
      item.item_key='stairs_landings' and finding_record->>'findingKey' in ('item_applies','landing_present')
      or item.item_key in ('house_ledger','underside_framing','supports_footings','guards_railings')
        and finding_record->>'findingKey'='item_applies'
    ) then
      return query select 'invalid_applicability_findings',null::uuid,false;
      return;
    end if;
  end loop;

  select * into existing_review
    from public.guided_site_visit_intake_classification_reviews
    where company_id=company and idempotency_key=requested_idempotency_key;
  if existing_review.id is not null then
    if existing_review.visit_id<>requested_visit_id
      or existing_review.intake_attempt_id<>requested_attempt_id
      or existing_review.provider<>requested_provider
      or existing_review.model_version<>requested_model_version
      or existing_review.prompt_version<>requested_prompt_version
      or existing_review.schema_version<>requested_schema_version
      or existing_review.request_sha256<>requested_request_sha256
      or existing_review.response_sha256<>requested_response_sha256
      or existing_review.diagnostic_class<>requested_diagnostic_class
      or existing_review.issue_codes<>requested_issue_codes
      or existing_review.proposals<>requested_proposals
      or existing_review.created_by_auth_user_id<>requested_auth_user_id
    then
      return query select 'idempotency_conflict',existing_review.id,true;
      return;
    end if;
    select coalesce(jsonb_agg(jsonb_build_object(
      'visitItemId',visit_item_id::text,'findingKey',finding_key,'finding',finding,
      'confidence',confidence,'reason',reason
    ) order by visit_item_id,finding_key),'[]'::jsonb) into existing_findings
    from public.guided_site_visit_intake_applicability_findings
    where classification_review_id=existing_review.id and company_id=company;
    if existing_findings is distinct from (
      select coalesce(jsonb_agg(value order by value->>'visitItemId',value->>'findingKey'),'[]'::jsonb)
      from jsonb_array_elements(requested_applicability_findings)
    ) then
      return query select 'idempotency_conflict',existing_review.id,true;
      return;
    end if;
    return query select 'ok',existing_review.id,true;
    return;
  end if;

  select * into recorded from public.record_guided_site_visit_intake_classification(
    requested_auth_user_id,requested_visit_id,requested_attempt_id,requested_idempotency_key,
    requested_provider,requested_model_version,requested_prompt_version,requested_schema_version,
    requested_request_sha256,requested_response_sha256,requested_diagnostic_class,
    requested_issue_codes,requested_proposals
  );
  if recorded.result_code<>'ok' then
    return query select recorded.result_code,recorded.review_id,recorded.idempotent_replay;
    return;
  end if;
  if recorded.idempotent_replay then
    select * into existing_review
      from public.guided_site_visit_intake_classification_reviews
      where id=recorded.review_id and company_id=company;
    select coalesce(jsonb_agg(jsonb_build_object(
      'visitItemId',visit_item_id::text,'findingKey',finding_key,'finding',finding,
      'confidence',confidence,'reason',reason
    ) order by visit_item_id,finding_key),'[]'::jsonb) into existing_findings
    from public.guided_site_visit_intake_applicability_findings
    where classification_review_id=recorded.review_id and company_id=company;
    if existing_review.visit_id<>requested_visit_id
      or existing_review.intake_attempt_id<>requested_attempt_id
      or existing_review.provider<>requested_provider
      or existing_review.model_version<>requested_model_version
      or existing_review.prompt_version<>requested_prompt_version
      or existing_review.schema_version<>requested_schema_version
      or existing_review.request_sha256<>requested_request_sha256
      or existing_review.response_sha256<>requested_response_sha256
      or existing_review.diagnostic_class<>requested_diagnostic_class
      or existing_review.issue_codes<>requested_issue_codes
      or existing_review.proposals<>requested_proposals
      or existing_review.created_by_auth_user_id<>requested_auth_user_id
      or existing_findings is distinct from (
        select coalesce(jsonb_agg(value order by value->>'visitItemId',value->>'findingKey'),'[]'::jsonb)
        from jsonb_array_elements(requested_applicability_findings)
      )
    then
      return query select 'idempotency_conflict',recorded.review_id,true;
    else
      return query select 'ok',recorded.review_id,true;
    end if;
    return;
  end if;
  insert into public.guided_site_visit_intake_applicability_findings(
    company_id,visit_id,visit_item_id,intake_attempt_id,classification_review_id,
    finding_key,finding,confidence,reason
  ) select company,requested_visit_id,(value->>'visitItemId')::uuid,requested_attempt_id,
      recorded.review_id,value->>'findingKey',value->>'finding',
      (value->>'confidence')::numeric,btrim(value->>'reason')
    from jsonb_array_elements(requested_applicability_findings);
  return query select 'ok',recorded.review_id,false;
exception when invalid_text_representation or numeric_value_out_of_range or check_violation or unique_violation then
  return query select 'invalid_applicability_findings',null::uuid,false;
end;
$function$;

create or replace function public.is_valid_guided_site_visit_observation(
  requested_requirement jsonb,requested_observation jsonb
)
returns boolean language plpgsql immutable set search_path=pg_catalog,public as $function$
declare mode text; condition_status text; required_field text; landing_absent boolean:=false;
begin
  if jsonb_typeof(requested_requirement)<>'object' or jsonb_typeof(requested_observation)<>'object' then return false; end if;
  if octet_length(requested_observation::text)>32768 then return false; end if;
  if exists(select 1 from jsonb_object_keys(requested_observation) key
    where key not in ('conditionStatus','confirmation','measurements','notes','applicability')) then return false; end if;
  if requested_observation ? 'notes' and (jsonb_typeof(requested_observation->'notes')<>'string'
    or length(requested_observation->>'notes')>2000) then return false; end if;
  if requested_observation ? 'applicability' then
    if not (requested_requirement->'fields' ? 'landing_dimensions')
      or jsonb_typeof(requested_observation->'applicability')<>'object'
      or (select array_agg(key order by key) from jsonb_object_keys(requested_observation->'applicability') key)
        is distinct from array['landingPresent']::text[]
      or jsonb_typeof(requested_observation->'applicability'->'landingPresent')<>'boolean'
    then return false; end if;
    landing_absent:=requested_observation->'applicability'->>'landingPresent'='false';
  end if;
  mode:=requested_requirement->>'mode';
  if mode='photo_only' then return not (requested_observation ? 'applicability'); end if;
  if mode='conditional' then
    condition_status:=requested_observation->>'conditionStatus';
    if condition_status not in ('applies','not_applicable','inaccessible') then return false; end if;
    if condition_status='inaccessible' then return false; end if;
    if condition_status='not_applicable' then
      return not (requested_observation ? 'applicability') and (requested_requirement->>'otherwise' is null
        or requested_observation->>'confirmation'=requested_requirement->>'otherwise');
    end if;
  elsif mode<>'required_measurements' then return false;
  end if;
  if jsonb_typeof(requested_requirement->'fields')<>'array' then return false; end if;
  if jsonb_typeof(requested_observation->'measurements')<>'object' then return false; end if;
  if exists(select 1 from jsonb_object_keys(requested_observation->'measurements') key
    where not (requested_requirement->'fields' ? key)) then return false; end if;
  for required_field in select jsonb_array_elements_text(requested_requirement->'fields') loop
    if required_field='landing_dimensions' and landing_absent then continue; end if;
    if jsonb_typeof(requested_observation->'measurements'->required_field)<>'object'
      or exists(select 1 from jsonb_object_keys(requested_observation->'measurements'->required_field) key
        where key not in ('value','unit'))
      or jsonb_typeof(requested_observation->'measurements'->required_field->'value')<>'string'
      or jsonb_typeof(requested_observation->'measurements'->required_field->'unit')<>'string'
      or nullif(btrim(requested_observation->'measurements'->required_field->>'value'),'') is null
      or length(requested_observation->'measurements'->required_field->>'value')>100
      or nullif(btrim(requested_observation->'measurements'->required_field->>'unit'),'') is null
      or length(requested_observation->'measurements'->required_field->>'unit')>50 then return false;
    end if;
  end loop;
  return true;
end;
$function$;

revoke all on function public.record_guided_site_visit_intake_classification_v2(uuid,uuid,uuid,text,text,text,text,text,text,text,text,text[],jsonb,jsonb)
  from public,anon,authenticated;
grant execute on function public.record_guided_site_visit_intake_classification_v2(uuid,uuid,uuid,text,text,text,text,text,text,text,text,text[],jsonb,jsonb)
  to service_role;

comment on table public.guided_site_visit_intake_applicability_findings is
  'Append-only advisory photo-grounded applicability findings. Missing rows never mean absent; numeric dimensions are never stored here.';

commit;
