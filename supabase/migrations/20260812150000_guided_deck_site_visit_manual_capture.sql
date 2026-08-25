begin;

insert into public.feature_settings(scope_type,scope_id,feature_key,is_enabled,display_name,description,category,sort_order)
values('global','default','guided_site_visits',false,'Guided Site Visits','Private, resumable human-confirmed Deck site-visit capture.','sales',111)
on conflict(scope_type,scope_id,feature_key) do nothing;

update public.role_permission_defaults
set permissions = permissions || '{"capture_site_visits":true}'::jsonb
where role in ('owner','administrator','estimator');

create table public.guided_site_visit_templates (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.company_settings(id) on delete restrict,
  template_key text not null, version integer not null check(version>0), title text not null,
  definition jsonb not null, published_at timestamptz not null default now(), retired_at timestamptz,
  unique(company_id,template_key,version), unique(id,company_id),
  check(jsonb_typeof(definition)='array' and jsonb_array_length(definition)=9)
);

create table public.guided_site_visits (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.company_settings(id) on delete restrict,
  case_id uuid not null, target_estimate_id uuid not null references public.estimates(id) on delete restrict,
  template_id uuid not null, revision integer not null default 0 check(revision>=0),
  status text not null default 'in_progress' check(status in ('in_progress','completed','cancelled')),
  completion_outcome text check(completion_outcome in ('all_passed','documented_with_office_follow_up')),
  retention_policy_status text not null default 'pending_approval' check(retention_policy_status='pending_approval'),
  started_by_auth_user_id uuid not null, completed_by_auth_user_id uuid, started_at timestamptz not null default now(),
  completed_at timestamptz, cancelled_at timestamptz, updated_at timestamptz not null default now(),
  unique(id,company_id), unique(case_id),
  foreign key(case_id,company_id) references public.ai_estimator_cases(id,company_id) on delete restrict,
  foreign key(template_id,company_id) references public.guided_site_visit_templates(id,company_id) on delete restrict,
  check((status='completed')=(completed_at is not null)),
  check((status='completed')=(completion_outcome is not null))
);
create unique index guided_site_visit_one_in_progress_per_estimate_uidx
on public.guided_site_visits(company_id,target_estimate_id) where status='in_progress';

create table public.guided_site_visit_items (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.company_settings(id) on delete restrict,
  visit_id uuid not null, item_key text not null, ordinal integer not null check(ordinal between 1 and 9), title text not null,
  instructions text not null, requirement jsonb not null check(jsonb_typeof(requirement)='object'),
  state text not null default 'pending' check(state in ('pending','confirmed','documented_follow_up')),
  observation jsonb not null default '{}'::jsonb check(jsonb_typeof(observation)='object'),
  follow_up_reason_code text, follow_up_notes text, confirmed_by_auth_user_id uuid, confirmed_at timestamptz,
  unique(visit_id,item_key),unique(visit_id,ordinal),unique(id,visit_id,company_id),
  foreign key(visit_id,company_id) references public.guided_site_visits(id,company_id) on delete restrict,
  check((state='documented_follow_up')=(follow_up_reason_code is not null and nullif(btrim(follow_up_notes),'') is not null)),
  check((state in ('confirmed','documented_follow_up'))=(confirmed_at is not null))
);

create table public.guided_site_visit_photo_attempts (
  id uuid primary key, company_id uuid not null references public.company_settings(id) on delete restrict,
  visit_id uuid not null, visit_item_id uuid not null, case_id uuid not null, asset_id uuid not null,
  retake_of_attempt_id uuid, ordinal integer not null check(ordinal>=1),
  state text not null default 'upload_pending' check(state in ('upload_pending','quarantined','confirmed','superseded','failed_validation')),
  confirmed_by_auth_user_id uuid, confirmed_at timestamptz, created_at timestamptz not null default now(),
  unique(asset_id),unique(visit_item_id,ordinal),unique(id,visit_item_id,visit_id,company_id),
  foreign key(visit_item_id,visit_id,company_id) references public.guided_site_visit_items(id,visit_id,company_id) on delete restrict,
  foreign key(asset_id,case_id,company_id) references public.ai_estimator_assets(id,case_id,company_id) on delete restrict,
  foreign key(retake_of_attempt_id,visit_item_id,visit_id,company_id)
    references public.guided_site_visit_photo_attempts(id,visit_item_id,visit_id,company_id) on delete restrict
);
create unique index guided_site_visit_one_confirmed_photo_per_item_uidx
on public.guided_site_visit_photo_attempts(visit_item_id) where state='confirmed';

create or replace function public.enforce_guided_site_visit_context()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
declare case_estimate uuid;
begin
 select target_estimate_id into case_estimate from public.ai_estimator_cases
 where id=new.case_id and company_id=new.company_id;
 if case_estimate is null or case_estimate is distinct from new.target_estimate_id then
   raise exception 'Guided site visit case and estimate context do not match.';
 end if;
 return new;
end $$;
create trigger enforce_guided_site_visit_context before insert or update on public.guided_site_visits
for each row execute function public.enforce_guided_site_visit_context();

create or replace function public.prevent_guided_site_visit_evidence_mutation()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin raise exception 'Guided site-visit templates and photo attempts are append-only.' using errcode='55000'; end $$;
create trigger prevent_guided_template_mutation before update or delete on public.guided_site_visit_templates
for each row execute function public.prevent_guided_site_visit_evidence_mutation();
create trigger prevent_guided_photo_attempt_mutation before delete on public.guided_site_visit_photo_attempts
for each row execute function public.prevent_guided_site_visit_evidence_mutation();

do $seed$
declare company uuid; template uuid; definition jsonb;
begin
  select id into strict company from public.company_settings;
  definition := jsonb_build_array(
    jsonb_build_object('key','property_context','title','Property and work-area context','instructions','Photograph the property and work-area context.','requirement',jsonb_build_object('mode','photo_only')),
    jsonb_build_object('key','full_deck_yard','title','Full deck from the yard','instructions','Photograph the full deck from the yard.','requirement',jsonb_build_object('mode','required_measurements','fields',jsonb_build_array('length','width','height_from_grade'))),
    jsonb_build_object('key','house_ledger','title','House and ledger connection','instructions','Photograph the house and ledger connection.','requirement',jsonb_build_object('mode','conditional','when','attached','fields',jsonb_build_array('ledger_length'))),
    jsonb_build_object('key','underside_framing','title','Underside framing','instructions','Photograph the underside framing.','requirement',jsonb_build_object('mode','conditional','when','visible','fields',jsonb_build_array('joist_spacing','joist_depth','beam_depth'),'otherwise','confirm_inaccessible_or_follow_up')),
    jsonb_build_object('key','supports_footings','title','Supports, posts, and footings','instructions','Photograph supports, posts, and footings.','requirement',jsonb_build_object('mode','conditional','when','safely_visible','fields',jsonb_build_array('post_dimensions','support_spacing','exposed_footing_dimensions'))),
    jsonb_build_object('key','stairs_landings','title','Stairs and landings','instructions','Photograph stairs and landings.','requirement',jsonb_build_object('mode','conditional','when','stairs_present','fields',jsonb_build_array('stair_width','total_rise','tread_depth','representative_riser','landing_dimensions'),'otherwise','confirm_no_stairs')),
    jsonb_build_object('key','guards_railings','title','Guards and railings','instructions','Photograph guards and railings.','requirement',jsonb_build_object('mode','conditional','when','rail_present','fields',jsonb_build_array('guard_height','opening','rail_lengths_by_area','handrail_height'),'otherwise','confirm_no_rail')),
    jsonb_build_object('key','access_demolition','title','Access and demolition route','instructions','Photograph the access and demolition route.','requirement',jsonb_build_object('mode','conditional','when','narrow_access_present','fields',jsonb_build_array('narrow_access_width','gate_width','clearance'))),
    jsonb_build_object('key','utilities_obstructions','title','Utilities, obstructions, and drainage','instructions','Photograph utilities, obstructions, and drainage.','requirement',jsonb_build_object('mode','conditional','when','utilities_or_obstructions_present','fields',jsonb_build_array('obstruction_clearances'),'otherwise','confirm_no_utilities_or_obstructions'))
  );
  insert into public.guided_site_visit_templates(company_id,template_key,version,title,definition)
  values(company,'deck-v0',1,'Deck Guided Site Visit V0',definition) returning id into template;
end $seed$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('ai-estimator-private','ai-estimator-private',false,52428800,
 array['video/mp4','video/quicktime','video/webm','image/jpeg','image/png','image/webp','image/heic','image/heif'])
on conflict(id) do update set public=false,allowed_mime_types=(
 select array_agg(distinct mime order by mime)
 from unnest(coalesce(storage.buckets.allowed_mime_types,'{}'::text[])||excluded.allowed_mime_types) mime
);

create or replace function public.start_guided_deck_site_visit(
  requested_auth_user_id uuid, requested_estimate_id uuid, requested_recording_permission_acknowledged boolean
)
returns table(result_code text, visit_id uuid, revision integer)
language plpgsql security invoker set search_path=pg_catalog,public as $function$
declare access jsonb; company uuid; user_record public.app_users; estimate_record public.estimates;
  template_record public.guided_site_visit_templates; case_id uuid; created_visit uuid; related_lead_id uuid;
begin
  select public.get_effective_user_access(requested_auth_user_id) into access;
  if access is null or access->'portal_access'->>'sales' is distinct from 'true'
    or access->'permissions'->>'capture_site_visits' is distinct from 'true'
    or requested_recording_permission_acknowledged is distinct from true then
    return query select 'forbidden',null::uuid,null::integer; return;
  end if;
  select * into user_record from public.app_users where auth_user_id=requested_auth_user_id
    and id=(access->>'user_id')::uuid and company_id=(access->>'company_id')::uuid and is_active=true
    and role in ('owner','administrator','estimator');
  if user_record.id is null then return query select 'forbidden',null::uuid,null::integer; return; end if;
  company:=public.assert_single_company_fence_estimate_scope();
  if company is distinct from user_record.company_id then return query select 'forbidden',null::uuid,null::integer; return; end if;
  select * into estimate_record from public.estimates where id=requested_estimate_id;
  if estimate_record.id is null or estimate_record.status <> 'draft' then
    return query select 'not_found',null::uuid,null::integer; return;
  end if;
  related_lead_id:=estimate_record.lead_id;
  if related_lead_id is null and estimate_record.customer_id is not null then
    select source_lead_id into related_lead_id from public.customers where id=estimate_record.customer_id;
  end if;
  if related_lead_id is null then return query select 'not_found',null::uuid,null::integer; return; end if;
  select visit.id,visit.revision into created_visit,revision from public.guided_site_visits visit
    where visit.company_id=company and visit.target_estimate_id=requested_estimate_id and visit.status='in_progress' limit 1;
  if created_visit is not null then return query select 'ok',created_visit,revision; return; end if;
  select * into template_record from public.guided_site_visit_templates
    where company_id=company and template_key='deck-v0' and retired_at is null order by version desc limit 1;
  if template_record.id is null then raise exception 'Published Deck visit template is missing.'; end if;
  insert into public.ai_estimator_cases(company_id,lead_id,customer_id,project_id,target_estimate_id,status,title,
    retention_policy_version,recording_permission_acknowledged_at,recording_permission_acknowledged_by_auth_user_id,created_by_auth_user_id)
  values(company,related_lead_id,estimate_record.customer_id,estimate_record.project_id,requested_estimate_id,'intake',
    'Guided Deck site visit','retention-policy-pending-approval-v0',now(),requested_auth_user_id,requested_auth_user_id)
  returning id into case_id;
  insert into public.guided_site_visits(company_id,case_id,target_estimate_id,template_id,started_by_auth_user_id)
  values(company,case_id,requested_estimate_id,template_record.id,requested_auth_user_id) returning id into created_visit;
  insert into public.guided_site_visit_items(company_id,visit_id,item_key,ordinal,title,instructions,requirement)
  select company,created_visit,item->>'key',ordinality,item->>'title',item->>'instructions',item->'requirement'
  from jsonb_array_elements(template_record.definition) with ordinality source(item,ordinality);
  return query select 'ok',created_visit,0;
exception when unique_violation then
  select visit.id,visit.revision into created_visit,revision from public.guided_site_visits visit
  where visit.company_id=company and visit.target_estimate_id=requested_estimate_id and visit.status='in_progress';
  if created_visit is null then raise; end if;
  return query select 'ok',created_visit,revision;
end $function$;

revoke all on function public.start_guided_deck_site_visit(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.start_guided_deck_site_visit(uuid,uuid,boolean) to service_role;

create or replace function public.guided_site_visit_actor_company(requested_auth_user_id uuid)
returns uuid language plpgsql security invoker set search_path=pg_catalog,public as $$
declare access jsonb; company uuid;
begin
  select public.get_effective_user_access(requested_auth_user_id) into access;
  if access is null or access->'portal_access'->>'sales' is distinct from 'true'
    or access->'permissions'->>'capture_site_visits' is distinct from 'true'
    or access->>'role' not in ('owner','administrator','estimator') then return null; end if;
  company:=(access->>'company_id')::uuid;
  if not exists(select 1 from public.app_users where auth_user_id=requested_auth_user_id and company_id=company and is_active=true)
    then return null; end if;
  return company;
end $$;

create or replace function public.is_valid_guided_site_visit_observation(requested_requirement jsonb,requested_observation jsonb)
returns boolean language plpgsql immutable set search_path=pg_catalog,public as $$
declare mode text; condition_status text; required_field text;
begin
 if jsonb_typeof(requested_requirement)<>'object' or jsonb_typeof(requested_observation)<>'object' then return false; end if;
 if octet_length(requested_observation::text)>32768 then return false; end if;
 if exists(select 1 from jsonb_object_keys(requested_observation) key
   where key not in ('conditionStatus','confirmation','measurements','notes')) then return false; end if;
 if requested_observation ? 'notes' and (jsonb_typeof(requested_observation->'notes')<>'string'
   or length(requested_observation->>'notes')>2000) then return false; end if;
 mode:=requested_requirement->>'mode';
 if mode='photo_only' then return true; end if;
 if mode='conditional' then
   condition_status:=requested_observation->>'conditionStatus';
   if condition_status not in ('applies','not_applicable','inaccessible') then return false; end if;
   if condition_status='inaccessible' then return false; end if;
   if condition_status='not_applicable' then
     return requested_requirement->>'otherwise' is null
       or requested_observation->>'confirmation' = requested_requirement->>'otherwise';
   end if;
 elsif mode<>'required_measurements' then return false;
 end if;
 if jsonb_typeof(requested_requirement->'fields')<>'array' then return false; end if;
 if jsonb_typeof(requested_observation->'measurements')<>'object' then return false; end if;
 if exists(select 1 from jsonb_object_keys(requested_observation->'measurements') key
   where not (requested_requirement->'fields' ? key)) then return false; end if;
 for required_field in select jsonb_array_elements_text(requested_requirement->'fields') loop
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
end $$;

create or replace function public.update_guided_site_visit_item(
  requested_auth_user_id uuid,requested_visit_id uuid,requested_item_id uuid,requested_expected_revision integer,
  requested_action text,requested_observation jsonb,requested_follow_up_reason_code text,requested_follow_up_notes text
)
returns table(result_code text,next_revision integer)
language plpgsql security invoker set search_path=pg_catalog,public as $function$
declare company uuid; visit public.guided_site_visits; item public.guided_site_visit_items; next_value integer;
begin
  company:=public.guided_site_visit_actor_company(requested_auth_user_id);
  if company is null then return query select 'forbidden',null::integer; return; end if;
  select * into visit from public.guided_site_visits where id=requested_visit_id and company_id=company for update;
  if visit.id is null then return query select 'not_found',null::integer; return; end if;
  if visit.status<>'in_progress' then return query select 'not_editable',visit.revision; return; end if;
  if visit.revision<>requested_expected_revision then return query select 'stale_revision',visit.revision; return; end if;
  select * into item from public.guided_site_visit_items where id=requested_item_id and visit_id=visit.id and company_id=company;
  if item.id is null then return query select 'not_found',visit.revision; return; end if;
  if requested_action not in ('confirm','document_follow_up') or jsonb_typeof(requested_observation) is distinct from 'object'
    or octet_length(requested_observation::text)>32768 then return query select 'invalid_item',visit.revision; return; end if;
  if requested_action='confirm' and not exists(select 1 from public.guided_site_visit_photo_attempts p
    where p.visit_item_id=item.id and p.state='confirmed') then return query select 'photo_required',visit.revision; return; end if;
  if requested_action='confirm' and not public.is_valid_guided_site_visit_observation(item.requirement,requested_observation)
    then return query select 'requirements_incomplete',visit.revision; return; end if;
  if requested_action='document_follow_up' and (requested_follow_up_reason_code is null
    or requested_follow_up_reason_code not in ('unsafe_access','inaccessible','concealed','customer_declined','site_condition','office_verification_required')
    or nullif(btrim(coalesce(requested_follow_up_notes,'')),'') is null) then
    return query select 'invalid_item',visit.revision; return;
  end if;
  update public.guided_site_visit_items set state=case when requested_action='confirm' then 'confirmed' else 'documented_follow_up' end,
    observation=requested_observation,follow_up_reason_code=case when requested_action='document_follow_up' then requested_follow_up_reason_code end,
    follow_up_notes=case when requested_action='document_follow_up' then requested_follow_up_notes end,
    confirmed_by_auth_user_id=requested_auth_user_id,confirmed_at=now() where id=item.id;
  next_value:=visit.revision+1;
  update public.guided_site_visits set revision=next_value,updated_at=now() where id=visit.id;
  return query select 'ok',next_value;
exception when invalid_text_representation then return query select 'invalid_item',visit.revision;
end $function$;

create or replace function public.reserve_guided_site_visit_photo(
 requested_auth_user_id uuid,requested_visit_id uuid,requested_item_id uuid,requested_expected_revision integer,
 requested_attempt_id uuid,requested_asset_id uuid,requested_storage_path text,requested_filename text,
 requested_mime_type text,requested_byte_size bigint,requested_sha256 text,requested_retake_of_attempt_id uuid default null
)
returns table(result_code text,next_revision integer)
language plpgsql security invoker set search_path=pg_catalog,public as $function$
declare company uuid; visit public.guided_site_visits; item public.guided_site_visit_items; next_value integer; next_ordinal integer;
begin
 company:=public.guided_site_visit_actor_company(requested_auth_user_id);
 if company is null then return query select 'forbidden',null::integer;return;end if;
 select * into visit from public.guided_site_visits where id=requested_visit_id and company_id=company for update;
 if visit.id is null then return query select 'not_found',null::integer;return;end if;
 if visit.status<>'in_progress' then return query select 'not_editable',visit.revision;return;end if;
 if visit.revision<>requested_expected_revision then return query select 'stale_revision',visit.revision;return;end if;
 select * into item from public.guided_site_visit_items where id=requested_item_id and visit_id=visit.id and company_id=company;
 if item.id is null then return query select 'not_found',visit.revision;return;end if;
 if requested_mime_type not in ('image/jpeg','image/png','image/webp','image/heic','image/heif')
   or requested_byte_size not between 1 and 15728640 or requested_sha256 !~ '^[0-9a-f]{64}$'
   or requested_storage_path not like company::text||'/'||visit.case_id::text||'/'||requested_asset_id::text||'/%'
   then return query select 'invalid_photo',visit.revision;return;end if;
 if requested_retake_of_attempt_id is not null and not exists(select 1 from public.guided_site_visit_photo_attempts
   where id=requested_retake_of_attempt_id and visit_item_id=item.id and state='confirmed')
   then return query select 'invalid_retake',visit.revision;return;end if;
 if requested_retake_of_attempt_id is null and exists(select 1 from public.guided_site_visit_photo_attempts
   where visit_item_id=item.id and state in ('upload_pending','quarantined','confirmed'))
   then return query select 'current_photo_exists',visit.revision;return;end if;
 if requested_retake_of_attempt_id is not null and exists(select 1 from public.guided_site_visit_photo_attempts
   where visit_item_id=item.id and state in ('upload_pending','quarantined'))
   then return query select 'retake_in_progress',visit.revision;return;end if;
 select coalesce(max(ordinal),0)+1 into next_ordinal from public.guided_site_visit_photo_attempts where visit_item_id=item.id;
 if next_ordinal>5 then return query select 'attempt_limit_reached',visit.revision;return;end if;
 insert into public.ai_estimator_assets(id,company_id,case_id,asset_kind,origin,storage_bucket,storage_path,original_filename,mime_type,
   declared_byte_size,declared_sha256,status,created_by_auth_user_id)
 values(requested_asset_id,company,visit.case_id,'photo','user_upload','ai-estimator-private',requested_storage_path,requested_filename,
   requested_mime_type,requested_byte_size,requested_sha256,'upload_pending',requested_auth_user_id);
 insert into public.guided_site_visit_photo_attempts(id,company_id,visit_id,visit_item_id,case_id,asset_id,retake_of_attempt_id,ordinal)
 values(requested_attempt_id,company,visit.id,item.id,visit.case_id,requested_asset_id,requested_retake_of_attempt_id,next_ordinal);
 next_value:=visit.revision+1;update public.guided_site_visits set revision=next_value,updated_at=now() where id=visit.id;
 return query select 'ok',next_value;
exception when unique_violation or check_violation or invalid_text_representation then return query select 'invalid_photo',visit.revision;
end $function$;

create or replace function public.fail_guided_site_visit_photo_reservation(
 requested_auth_user_id uuid,requested_visit_id uuid,requested_attempt_id uuid,requested_expected_revision integer
)
returns table(result_code text,next_revision integer)
language plpgsql security invoker set search_path=pg_catalog,public as $function$
declare company uuid; visit public.guided_site_visits; attempt public.guided_site_visit_photo_attempts; next_value integer;
begin
 company:=public.guided_site_visit_actor_company(requested_auth_user_id);
 if company is null then return query select 'forbidden',null::integer;return;end if;
 select * into visit from public.guided_site_visits where id=requested_visit_id and company_id=company for update;
 if visit.id is null then return query select 'not_found',null::integer;return;end if;
 if visit.revision<>requested_expected_revision then return query select 'stale_revision',visit.revision;return;end if;
 select * into attempt from public.guided_site_visit_photo_attempts where id=requested_attempt_id and visit_id=visit.id
  and company_id=company and state='upload_pending' for update;
 if attempt.id is null then return query select 'not_found',visit.revision;return;end if;
 update public.guided_site_visit_photo_attempts set state='failed_validation' where id=attempt.id;
 update public.ai_estimator_assets set status='failed_validation' where id=attempt.asset_id and status='upload_pending';
 next_value:=visit.revision+1;update public.guided_site_visits set revision=next_value,updated_at=now() where id=visit.id;
 return query select 'ok',next_value;
end $function$;

create or replace function public.complete_guided_site_visit(requested_auth_user_id uuid,requested_visit_id uuid,requested_expected_revision integer)
returns table(result_code text,next_revision integer,completion_outcome text)
language plpgsql security invoker set search_path=pg_catalog,public as $function$
declare company uuid; visit public.guided_site_visits; next_value integer; outcome text;
begin
 company:=public.guided_site_visit_actor_company(requested_auth_user_id);
 if company is null then return query select 'forbidden',null::integer,null::text;return;end if;
 select * into visit from public.guided_site_visits where id=requested_visit_id and company_id=company for update;
 if visit.id is null then return query select 'not_found',null::integer,null::text;return;end if;
 if visit.status<>'in_progress' then return query select 'not_editable',visit.revision,visit.completion_outcome;return;end if;
 if visit.revision<>requested_expected_revision then return query select 'stale_revision',visit.revision,null::text;return;end if;
 if exists(select 1 from public.guided_site_visit_items where visit_id=visit.id and state='pending')
   then return query select 'incomplete',visit.revision,null::text;return;end if;
 outcome:=case when exists(select 1 from public.guided_site_visit_items where visit_id=visit.id and state='documented_follow_up')
   then 'documented_with_office_follow_up' else 'all_passed' end;
 next_value:=visit.revision+1;update public.guided_site_visits set status='completed',completion_outcome=outcome,
   completed_by_auth_user_id=requested_auth_user_id,completed_at=now(),revision=next_value,updated_at=now() where id=visit.id;
 return query select 'ok',next_value,outcome;
end $function$;

create or replace function public.confirm_guided_site_visit_photo(
 requested_auth_user_id uuid,requested_visit_id uuid,requested_attempt_id uuid,requested_expected_revision integer,
 requested_actual_byte_size bigint,requested_storage_mime_type text
)
returns table(result_code text,next_revision integer)
language plpgsql security invoker set search_path=pg_catalog,public as $function$
declare company uuid; visit public.guided_site_visits; attempt public.guided_site_visit_photo_attempts;
 asset public.ai_estimator_assets; next_value integer;
begin
 company:=public.guided_site_visit_actor_company(requested_auth_user_id);
 if company is null then return query select 'forbidden',null::integer;return;end if;
 select * into visit from public.guided_site_visits where id=requested_visit_id and company_id=company for update;
 if visit.id is null then return query select 'not_found',null::integer;return;end if;
 if visit.status<>'in_progress' then return query select 'not_editable',visit.revision;return;end if;
 if visit.revision<>requested_expected_revision then return query select 'stale_revision',visit.revision;return;end if;
 select * into attempt from public.guided_site_visit_photo_attempts where id=requested_attempt_id and visit_id=visit.id and company_id=company for update;
 if attempt.id is null then return query select 'not_found',visit.revision;return;end if;
 select * into asset from public.ai_estimator_assets where id=attempt.asset_id and case_id=visit.case_id and company_id=company for update;
 if asset.status<>'upload_pending' or requested_actual_byte_size is distinct from asset.declared_byte_size
   or requested_storage_mime_type is distinct from asset.mime_type then
   update public.ai_estimator_assets set status='failed_validation',byte_size=requested_actual_byte_size,
    storage_reported_mime_type=requested_storage_mime_type where id=asset.id;
   update public.guided_site_visit_photo_attempts set state='failed_validation' where id=attempt.id;
   next_value:=visit.revision+1;update public.guided_site_visits set revision=next_value,updated_at=now() where id=visit.id;
   return query select 'invalid_photo',next_value;return;
 end if;
 update public.ai_estimator_assets set status='available',byte_size=requested_actual_byte_size,
   storage_reported_mime_type=requested_storage_mime_type where id=asset.id;
 if attempt.retake_of_attempt_id is not null then
   update public.guided_site_visit_photo_attempts set state='superseded'
   where id=attempt.retake_of_attempt_id and state='confirmed';
 end if;
 update public.guided_site_visit_photo_attempts set state='confirmed',confirmed_by_auth_user_id=requested_auth_user_id,
   confirmed_at=now() where id=attempt.id;
 next_value:=visit.revision+1;update public.guided_site_visits set revision=next_value,updated_at=now() where id=visit.id;
 return query select 'ok',next_value;
end $function$;

revoke all on function public.guided_site_visit_actor_company(uuid),
 public.is_valid_guided_site_visit_observation(jsonb,jsonb),
 public.update_guided_site_visit_item(uuid,uuid,uuid,integer,text,jsonb,text,text),
 public.reserve_guided_site_visit_photo(uuid,uuid,uuid,integer,uuid,uuid,text,text,text,bigint,text,uuid),
 public.fail_guided_site_visit_photo_reservation(uuid,uuid,uuid,integer),
 public.confirm_guided_site_visit_photo(uuid,uuid,uuid,integer,bigint,text),
 public.complete_guided_site_visit(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.guided_site_visit_actor_company(uuid),
 public.is_valid_guided_site_visit_observation(jsonb,jsonb),
 public.update_guided_site_visit_item(uuid,uuid,uuid,integer,text,jsonb,text,text),
 public.reserve_guided_site_visit_photo(uuid,uuid,uuid,integer,uuid,uuid,text,text,text,bigint,text,uuid),
 public.fail_guided_site_visit_photo_reservation(uuid,uuid,uuid,integer),
 public.confirm_guided_site_visit_photo(uuid,uuid,uuid,integer,bigint,text),
 public.complete_guided_site_visit(uuid,uuid,integer) to service_role;

alter table public.guided_site_visit_templates enable row level security;
alter table public.guided_site_visits enable row level security;
alter table public.guided_site_visit_items enable row level security;
alter table public.guided_site_visit_photo_attempts enable row level security;
revoke all on table public.guided_site_visit_templates,public.guided_site_visits,
 public.guided_site_visit_items,public.guided_site_visit_photo_attempts from public,anon,authenticated,service_role;
grant select on table public.guided_site_visit_templates to service_role;
grant select,insert,update on table public.guided_site_visits,public.guided_site_visit_items,public.guided_site_visit_photo_attempts to service_role;
grant insert on table public.guided_site_visit_templates to service_role;

comment on column public.guided_site_visits.retention_policy_status is
 'Pre-Production gate: private bytes are preserved; deletion is prohibited until an approved retention policy is migrated.';
comment on table public.guided_site_visit_photo_attempts is
 'Append-only private photo attempts. Retakes add rows and supersede prior attempts; they never overwrite objects.';

commit;
