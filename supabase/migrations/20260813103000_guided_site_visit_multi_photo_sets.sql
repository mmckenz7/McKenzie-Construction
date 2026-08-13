begin;

drop index if exists public.guided_site_visit_one_confirmed_photo_per_item_uidx;
create unique index guided_site_visit_one_inflight_photo_per_item_uidx
on public.guided_site_visit_photo_attempts(company_id,visit_item_id)
where state in ('upload_pending','quarantined');

alter table public.guided_site_visit_visible_fact_decisions drop constraint guided_site_visit_visible_fact_decisions_next_action_check;
alter table public.guided_site_visit_visible_fact_decisions add constraint guided_site_visit_visible_fact_decisions_next_action_check
 check(next_action in('confirm_item','add_complementary_photo','retake_photo'));

create or replace function public.decide_guided_site_visit_visible_facts(
 requested_auth_user_id uuid,requested_visit_id uuid,requested_item_id uuid,requested_photo_attempt_id uuid,requested_review_id uuid,
 requested_expected_revision integer,requested_idempotency_key text,requested_decision text,requested_next_action text,
 requested_final_criteria jsonb,requested_final_recommended_next_capture jsonb,requested_observation jsonb)
returns table(result_code text,decision_id uuid,next_revision integer,idempotent_replay boolean)
language plpgsql security definer set search_path=pg_catalog,public as $function$
declare company uuid;visit public.guided_site_visits;item public.guided_site_visit_items;review public.guided_site_visit_ai_visible_fact_reviews;existing public.guided_site_visit_visible_fact_decisions;created uuid;next_value integer;
begin company:=public.guided_site_visit_actor_company(requested_auth_user_id);if company is null then return query select 'forbidden',null::uuid,null::integer,false;return;end if;
 select * into existing from public.guided_site_visit_visible_fact_decisions where company_id=company and idempotency_key=requested_idempotency_key;if existing.id is not null then if existing.visit_id=requested_visit_id and existing.visit_item_id=requested_item_id and existing.photo_attempt_id=requested_photo_attempt_id and existing.visible_fact_review_id=requested_review_id and existing.requested_expected_revision=requested_expected_revision and existing.decision=requested_decision and existing.next_action=requested_next_action and existing.final_criteria=requested_final_criteria and existing.final_recommended_next_capture=requested_final_recommended_next_capture and existing.confirmed_observation is not distinct from requested_observation and existing.decided_by_auth_user_id=requested_auth_user_id then return query select 'ok',existing.id,existing.resulting_visit_revision,true;return;end if;return query select 'idempotency_conflict',existing.id,null::integer,false;return;end if;
 select * into visit from public.guided_site_visits where id=requested_visit_id and company_id=company for update;if visit.id is null then return query select 'not_found',null::uuid,null::integer,false;return;end if;
 select * into existing from public.guided_site_visit_visible_fact_decisions where company_id=company and idempotency_key=requested_idempotency_key;if existing.id is not null then if existing.visit_id=requested_visit_id and existing.visit_item_id=requested_item_id and existing.photo_attempt_id=requested_photo_attempt_id and existing.visible_fact_review_id=requested_review_id and existing.requested_expected_revision=requested_expected_revision and existing.decision=requested_decision and existing.next_action=requested_next_action and existing.final_criteria=requested_final_criteria and existing.final_recommended_next_capture=requested_final_recommended_next_capture and existing.confirmed_observation is not distinct from requested_observation and existing.decided_by_auth_user_id=requested_auth_user_id then return query select 'ok',existing.id,existing.resulting_visit_revision,true;return;end if;return query select 'idempotency_conflict',existing.id,null::integer,false;return;end if;
 if visit.status<>'in_progress' then return query select 'not_editable',null::uuid,visit.revision,false;return;end if;if visit.revision<>requested_expected_revision then return query select 'stale_revision',null::uuid,visit.revision,false;return;end if;
 select * into item from public.guided_site_visit_items where id=requested_item_id and visit_id=visit.id and company_id=company and state='pending';select * into review from public.guided_site_visit_ai_visible_fact_reviews where id=requested_review_id and visit_id=visit.id and visit_item_id=item.id and photo_attempt_id=requested_photo_attempt_id and company_id=company;
 if review.id is null or item.id is null or not exists(select 1 from public.guided_site_visit_photo_attempts where id=requested_photo_attempt_id and visit_item_id=item.id and visit_id=visit.id and company_id=company and state='confirmed') then return query select 'stale_photo',null::uuid,visit.revision,false;return;end if;
 if requested_decision not in('accepted','corrected') or requested_next_action not in('confirm_item','add_complementary_photo','retake_photo') or public.is_valid_guided_visible_fact_result(requested_final_criteria,requested_final_recommended_next_capture) is distinct from true or public.guided_visible_fact_keys_match(requested_final_criteria,item.item_key) is distinct from true
  or requested_decision='accepted' and (requested_final_criteria<>review.criteria or requested_final_recommended_next_capture<>review.recommended_next_capture)
  or requested_decision='corrected' and requested_final_criteria=review.criteria and requested_final_recommended_next_capture=review.recommended_next_capture
  or requested_next_action='confirm_item' and (exists(select 1 from jsonb_array_elements(requested_final_criteria) fact where fact->>'status'<>'visible') or requested_final_recommended_next_capture<>'null'::jsonb or requested_observation is null or public.is_valid_guided_site_visit_observation(item.requirement,requested_observation) is distinct from true)
  or requested_next_action in('add_complementary_photo','retake_photo') and (not exists(select 1 from jsonb_array_elements(requested_final_criteria) fact where fact->>'status'<>'visible') or requested_final_recommended_next_capture='null'::jsonb or requested_observation is not null)
  then return query select 'requirements_incomplete',null::uuid,visit.revision,false;return;end if;
 next_value:=visit.revision+1;if requested_next_action='confirm_item' then update public.guided_site_visit_items set state='confirmed',observation=requested_observation,confirmed_by_auth_user_id=requested_auth_user_id,confirmed_at=now() where id=item.id and state='pending';if not found then return query select 'not_editable',null::uuid,visit.revision,false;return;end if;end if;
 insert into public.guided_site_visit_visible_fact_decisions(company_id,visit_id,visit_item_id,photo_attempt_id,asset_id,visible_fact_review_id,idempotency_key,requested_expected_revision,decision,next_action,final_criteria,final_recommended_next_capture,confirmed_observation,resulting_visit_revision,decided_by_auth_user_id)
 values(company,visit.id,item.id,requested_photo_attempt_id,review.asset_id,review.id,requested_idempotency_key,requested_expected_revision,requested_decision,requested_next_action,requested_final_criteria,requested_final_recommended_next_capture,requested_observation,next_value,requested_auth_user_id) returning id into created;
 update public.guided_site_visits set revision=next_value,updated_at=now() where id=visit.id;return query select 'ok',created,next_value,false;end; $function$;

alter table public.guided_site_visit_photo_attempts
 add column capture_intent text,
 add column requested_from_visible_fact_decision_id uuid,
 add column reservation_idempotency_key text,
 add column reserved_by_auth_user_id uuid,
 add column resulting_reservation_revision integer,
 add constraint guided_site_visit_photo_capture_intent_check check(capture_intent is null or capture_intent in('initial','complement','retake')),
 add constraint guided_site_visit_photo_reservation_key_check check(reservation_idempotency_key is null or length(reservation_idempotency_key) between 1 and 200 and reservation_idempotency_key=btrim(reservation_idempotency_key)),
 add constraint guided_site_visit_photo_reservation_revision_check check(resulting_reservation_revision is null or resulting_reservation_revision>=0),
 add constraint guided_site_visit_photo_reservation_provenance_check check(capture_intent is null or
   reservation_idempotency_key is not null and reserved_by_auth_user_id is not null and resulting_reservation_revision is not null),
 add constraint guided_site_visit_photo_intent_context_check check(capture_intent is null or
   capture_intent='initial' and retake_of_attempt_id is null and requested_from_visible_fact_decision_id is null or
   capture_intent='complement' and retake_of_attempt_id is null and requested_from_visible_fact_decision_id is not null or
   capture_intent='retake' and retake_of_attempt_id is not null),
 add unique(company_id,reservation_idempotency_key);

alter table public.guided_site_visit_visible_fact_decisions
 add constraint guided_visible_fact_decision_item_context_unique unique(id,visit_item_id,visit_id,company_id);
alter table public.guided_site_visit_photo_attempts
 add constraint guided_photo_source_decision_context_fk
 foreign key(requested_from_visible_fact_decision_id,visit_item_id,visit_id,company_id)
 references public.guided_site_visit_visible_fact_decisions(id,visit_item_id,visit_id,company_id) on delete restrict;

create or replace function public.prevent_guided_site_visit_photo_attempt_provenance_mutation()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin
 if new.id is distinct from old.id or new.company_id is distinct from old.company_id
   or new.visit_id is distinct from old.visit_id or new.visit_item_id is distinct from old.visit_item_id
   or new.case_id is distinct from old.case_id or new.asset_id is distinct from old.asset_id
   or new.retake_of_attempt_id is distinct from old.retake_of_attempt_id or new.ordinal is distinct from old.ordinal
   or new.created_at is distinct from old.created_at or new.capture_intent is distinct from old.capture_intent
   or new.requested_from_visible_fact_decision_id is distinct from old.requested_from_visible_fact_decision_id
   or new.reservation_idempotency_key is distinct from old.reservation_idempotency_key
   or new.reserved_by_auth_user_id is distinct from old.reserved_by_auth_user_id
   or new.resulting_reservation_revision is distinct from old.resulting_reservation_revision then
   raise exception 'Guided Site Visit photo-attempt provenance is immutable.' using errcode='55000';
 end if;
 if new.state is distinct from old.state and not (
   old.state='upload_pending' and new.state in('quarantined','confirmed','failed_validation')
   or old.state='quarantined' and new.state in('confirmed','failed_validation')
   or old.state='confirmed' and new.state='superseded'
 ) then raise exception 'Invalid Guided Site Visit photo-attempt state transition.' using errcode='55000';end if;
 if new.confirmed_by_auth_user_id is distinct from old.confirmed_by_auth_user_id
   and not (old.confirmed_by_auth_user_id is null and new.confirmed_by_auth_user_id is not null and new.state='confirmed') then
   raise exception 'Invalid Guided Site Visit photo confirmation provenance.' using errcode='55000';
 end if;
 if new.confirmed_at is distinct from old.confirmed_at
   and not (old.confirmed_at is null and new.confirmed_at is not null and new.state='confirmed') then
   raise exception 'Invalid Guided Site Visit photo confirmation timestamp.' using errcode='55000';
 end if;
 return new;
end; $$;
create trigger prevent_guided_photo_attempt_provenance_mutation
before update on public.guided_site_visit_photo_attempts
for each row execute function public.prevent_guided_site_visit_photo_attempt_provenance_mutation();

create or replace function public.enforce_guided_site_visit_photo_attempt_source_decision()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin
 if new.capture_intent='complement' and not exists(select 1 from public.guided_site_visit_visible_fact_decisions d
   where d.id=new.requested_from_visible_fact_decision_id and d.company_id=new.company_id and d.visit_id=new.visit_id
     and d.visit_item_id=new.visit_item_id and d.next_action='add_complementary_photo') then
   raise exception 'Complementary photo source decision is invalid.' using errcode='23514';
 end if;
 if new.capture_intent='retake' and new.requested_from_visible_fact_decision_id is not null and not exists(
   select 1 from public.guided_site_visit_visible_fact_decisions d
   where d.id=new.requested_from_visible_fact_decision_id and d.company_id=new.company_id and d.visit_id=new.visit_id
     and d.visit_item_id=new.visit_item_id and d.next_action='retake_photo' and d.photo_attempt_id=new.retake_of_attempt_id) then
   raise exception 'Retake source decision does not target the selected photo.' using errcode='23514';
 end if;
 return new;
end; $$;
create trigger enforce_guided_photo_attempt_source_decision
before insert or update on public.guided_site_visit_photo_attempts
for each row execute function public.enforce_guided_site_visit_photo_attempt_source_decision();

create table public.guided_site_visit_photo_set_confirmations(
 id uuid primary key default gen_random_uuid(),company_id uuid not null references public.company_settings(id) on delete restrict,
 visit_id uuid not null,visit_item_id uuid not null,idempotency_key text not null,requested_expected_revision integer not null check(requested_expected_revision>=0),
 canonical_selection jsonb not null,confirmed_observation jsonb not null,resulting_visit_revision integer not null check(resulting_visit_revision>=0),
 confirmed_by_auth_user_id uuid not null,created_at timestamptz not null default now(),
 unique(company_id,idempotency_key),unique(company_id,visit_item_id),unique(id,visit_item_id,visit_id,company_id),
 foreign key(visit_item_id,visit_id,company_id) references public.guided_site_visit_items(id,visit_id,company_id) on delete restrict,
 check(length(idempotency_key) between 1 and 200 and idempotency_key=btrim(idempotency_key)),check(jsonb_typeof(canonical_selection)='array')
);
create table public.guided_site_visit_photo_set_confirmation_facts(
 confirmation_id uuid not null,company_id uuid not null,visit_id uuid not null,visit_item_id uuid not null,criterion_key text not null,
 source_visible_fact_review_id uuid not null,source_photo_attempt_id uuid not null,source_asset_id uuid not null,source_status text not null check(source_status in('visible','not_visible','unclear')),
 human_decision text not null check(human_decision in('accepted','corrected')),created_at timestamptz not null default now(),
 primary key(confirmation_id,criterion_key),
 foreign key(confirmation_id,visit_item_id,visit_id,company_id) references public.guided_site_visit_photo_set_confirmations(id,visit_item_id,visit_id,company_id) on delete restrict,
 foreign key(source_visible_fact_review_id,source_photo_attempt_id,source_asset_id,visit_item_id,visit_id,company_id)
   references public.guided_site_visit_ai_visible_fact_reviews(id,photo_attempt_id,asset_id,visit_item_id,visit_id,company_id) on delete restrict
);

create trigger prevent_guided_photo_set_confirmation_mutation before update or delete on public.guided_site_visit_photo_set_confirmations for each row execute function public.prevent_guided_site_visit_visible_fact_mutation();
create trigger prevent_guided_photo_set_fact_mutation before update or delete on public.guided_site_visit_photo_set_confirmation_facts for each row execute function public.prevent_guided_site_visit_visible_fact_mutation();

create or replace function public.reserve_guided_site_visit_photo_set_member(
 requested_auth_user_id uuid,requested_visit_id uuid,requested_item_id uuid,requested_expected_revision integer,
 requested_idempotency_key text,requested_capture_intent text,requested_source_decision_id uuid,requested_retake_of_attempt_id uuid,
 requested_attempt_id uuid,requested_asset_id uuid,requested_storage_path text,requested_filename text,
 requested_mime_type text,requested_byte_size bigint,requested_sha256 text)
returns table(result_code text,next_revision integer,attempt_id uuid,asset_id uuid,storage_path text,idempotent_replay boolean)
language plpgsql security definer set search_path=pg_catalog,public as $function$
declare company uuid;visit public.guided_site_visits;item public.guided_site_visit_items;existing public.guided_site_visit_photo_attempts;
 source_decision public.guided_site_visit_visible_fact_decisions;source_asset public.ai_estimator_assets;next_value integer;next_ordinal integer;active_count integer;meaningful_count integer;total_count integer;
begin
 company:=public.guided_site_visit_actor_company(requested_auth_user_id);if company is null then return query select 'forbidden',null::integer,null::uuid,null::uuid,null::text,false;return;end if;
 select * into existing from public.guided_site_visit_photo_attempts where company_id=company and reservation_idempotency_key=requested_idempotency_key;
 if existing.id is not null then select * into source_asset from public.ai_estimator_assets where id=existing.asset_id and company_id=company;
   if existing.visit_id=requested_visit_id and existing.visit_item_id=requested_item_id and existing.id=requested_attempt_id and existing.asset_id=requested_asset_id
    and existing.capture_intent=requested_capture_intent and existing.requested_from_visible_fact_decision_id is not distinct from requested_source_decision_id
    and existing.retake_of_attempt_id is not distinct from requested_retake_of_attempt_id and existing.reserved_by_auth_user_id=requested_auth_user_id
    and source_asset.storage_path=requested_storage_path and source_asset.original_filename=requested_filename and source_asset.mime_type=requested_mime_type
    and source_asset.declared_byte_size=requested_byte_size and source_asset.declared_sha256=requested_sha256 then
    if existing.state='upload_pending' and source_asset.status='upload_pending' then return query select 'ok',existing.resulting_reservation_revision,existing.id,existing.asset_id,source_asset.storage_path,true;return;end if;
    if existing.state='confirmed' and source_asset.status='available' then return query select 'already_confirmed',existing.resulting_reservation_revision,existing.id,existing.asset_id,source_asset.storage_path,true;return;end if;
    if existing.state='failed_validation' or source_asset.status='failed_validation' then return query select 'reservation_failed',existing.resulting_reservation_revision,existing.id,existing.asset_id,source_asset.storage_path,true;return;end if;
    return query select 'reservation_not_uploadable',existing.resulting_reservation_revision,existing.id,existing.asset_id,source_asset.storage_path,true;return;end if;
   return query select 'idempotency_conflict',null::integer,existing.id,existing.asset_id,source_asset.storage_path,false;return;
 end if;
 select * into visit from public.guided_site_visits where id=requested_visit_id and company_id=company for update;
 if visit.id is null then return query select 'not_found',null::integer,null::uuid,null::uuid,null::text,false;return;end if;
 select * into existing from public.guided_site_visit_photo_attempts where company_id=company and reservation_idempotency_key=requested_idempotency_key;
 if existing.id is not null then select * into source_asset from public.ai_estimator_assets where id=existing.asset_id and company_id=company;
   if existing.visit_id=requested_visit_id and existing.visit_item_id=requested_item_id and existing.id=requested_attempt_id and existing.asset_id=requested_asset_id
    and existing.capture_intent=requested_capture_intent and existing.requested_from_visible_fact_decision_id is not distinct from requested_source_decision_id
    and existing.retake_of_attempt_id is not distinct from requested_retake_of_attempt_id and existing.reserved_by_auth_user_id=requested_auth_user_id
    and source_asset.storage_path=requested_storage_path and source_asset.original_filename=requested_filename and source_asset.mime_type=requested_mime_type
    and source_asset.declared_byte_size=requested_byte_size and source_asset.declared_sha256=requested_sha256 then
    if existing.state='upload_pending' and source_asset.status='upload_pending' then return query select 'ok',existing.resulting_reservation_revision,existing.id,existing.asset_id,source_asset.storage_path,true;return;end if;
    if existing.state='confirmed' and source_asset.status='available' then return query select 'already_confirmed',existing.resulting_reservation_revision,existing.id,existing.asset_id,source_asset.storage_path,true;return;end if;
    if existing.state='failed_validation' or source_asset.status='failed_validation' then return query select 'reservation_failed',existing.resulting_reservation_revision,existing.id,existing.asset_id,source_asset.storage_path,true;return;end if;
    return query select 'reservation_not_uploadable',existing.resulting_reservation_revision,existing.id,existing.asset_id,source_asset.storage_path,true;return;
   end if;
   return query select 'idempotency_conflict',null::integer,existing.id,existing.asset_id,source_asset.storage_path,false;return;
 end if;
 if visit.status<>'in_progress' then return query select 'not_editable',visit.revision,null::uuid,null::uuid,null::text,false;return;end if;
 if visit.revision<>requested_expected_revision then return query select 'stale_revision',visit.revision,null::uuid,null::uuid,null::text,false;return;end if;
 select * into item from public.guided_site_visit_items where id=requested_item_id and visit_id=visit.id and company_id=company and state='pending';if item.id is null then return query select 'not_found',visit.revision,null::uuid,null::uuid,null::text,false;return;end if;
 if requested_capture_intent not in('initial','complement','retake') or length(requested_idempotency_key) not between 1 and 200
  or requested_mime_type not in('image/jpeg','image/png','image/webp','image/heic','image/heif') or requested_byte_size not between 1 and 15728640
  or requested_sha256 !~ '^[0-9a-f]{64}$' or requested_storage_path not like company::text||'/'||visit.case_id::text||'/'||requested_asset_id::text||'/%'
  then return query select 'invalid_photo',visit.revision,null::uuid,null::uuid,null::text,false;return;end if;
 if exists(select 1 from public.guided_site_visit_photo_attempts where company_id=company and visit_item_id=item.id and state in('upload_pending','quarantined')) then return query select 'upload_in_progress',visit.revision,null::uuid,null::uuid,null::text,false;return;end if;
 select count(*) filter(where state='confirmed'),count(*) filter(where state in('confirmed','superseded')),count(*),coalesce(max(ordinal),0)+1 into active_count,meaningful_count,total_count,next_ordinal from public.guided_site_visit_photo_attempts where company_id=company and visit_item_id=item.id;
 if meaningful_count>=10 then return query select 'attempt_limit_reached',visit.revision,null::uuid,null::uuid,null::text,false;return;end if;if total_count>=25 then return query select 'recovery_limit_reached',visit.revision,null::uuid,null::uuid,null::text,false;return;end if;
 if requested_capture_intent='initial' and (meaningful_count<>0 or requested_source_decision_id is not null or requested_retake_of_attempt_id is not null) then return query select 'invalid_initial',visit.revision,null::uuid,null::uuid,null::text,false;return;end if;
 if requested_capture_intent='complement' or requested_capture_intent='retake' and requested_source_decision_id is not null then select * into source_decision from public.guided_site_visit_visible_fact_decisions where id=requested_source_decision_id and company_id=company and visit_id=visit.id and visit_item_id=item.id;
  if source_decision.id is null or source_decision.next_action<>case requested_capture_intent when 'complement' then 'add_complementary_photo' else 'retake_photo' end then return query select 'invalid_source_decision',visit.revision,null::uuid,null::uuid,null::text,false;return;end if;
  if requested_capture_intent='retake' and source_decision.photo_attempt_id is distinct from requested_retake_of_attempt_id then return query select 'retake_source_mismatch',visit.revision,null::uuid,null::uuid,null::text,false;return;end if;
  if exists(select 1 from public.guided_site_visit_photo_attempts where requested_from_visible_fact_decision_id=source_decision.id and state<>'failed_validation') then return query select 'source_decision_used',visit.revision,null::uuid,null::uuid,null::text,false;return;end if;
 end if;
 if requested_capture_intent='complement' and (active_count<1 or active_count>=5 or requested_retake_of_attempt_id is not null) then return query select 'active_photo_limit',visit.revision,null::uuid,null::uuid,null::text,false;return;end if;
 if requested_capture_intent='retake' and not exists(select 1 from public.guided_site_visit_photo_attempts where id=requested_retake_of_attempt_id and company_id=company and visit_id=visit.id and visit_item_id=item.id and state='confirmed') then return query select 'invalid_retake',visit.revision,null::uuid,null::uuid,null::text,false;return;end if;
 -- A null source decision is an explicit manual retake authorized by the authenticated actor recorded on this reservation.
 insert into public.ai_estimator_assets(id,company_id,case_id,asset_kind,origin,storage_bucket,storage_path,original_filename,mime_type,declared_byte_size,declared_sha256,status,created_by_auth_user_id)
 values(requested_asset_id,company,visit.case_id,'photo','user_upload','ai-estimator-private',requested_storage_path,requested_filename,requested_mime_type,requested_byte_size,requested_sha256,'upload_pending',requested_auth_user_id);
 next_value:=visit.revision+1;
 insert into public.guided_site_visit_photo_attempts(id,company_id,visit_id,visit_item_id,case_id,asset_id,retake_of_attempt_id,ordinal,capture_intent,requested_from_visible_fact_decision_id,reservation_idempotency_key,reserved_by_auth_user_id,resulting_reservation_revision)
 values(requested_attempt_id,company,visit.id,item.id,visit.case_id,requested_asset_id,requested_retake_of_attempt_id,next_ordinal,requested_capture_intent,requested_source_decision_id,requested_idempotency_key,requested_auth_user_id,next_value);
 update public.guided_site_visits set revision=next_value,updated_at=now() where id=visit.id;
 return query select 'ok',next_value,requested_attempt_id,requested_asset_id,requested_storage_path,false;
exception when unique_violation or check_violation or invalid_text_representation then return query select 'invalid_photo',visit.revision,null::uuid,null::uuid,null::text,false;end; $function$;

create or replace function public.confirm_guided_site_visit_photo(
 requested_auth_user_id uuid,requested_visit_id uuid,requested_attempt_id uuid,requested_expected_revision integer,requested_actual_byte_size bigint,requested_storage_mime_type text)
returns table(result_code text,next_revision integer)
language plpgsql security definer set search_path=pg_catalog,public as $function$
declare company uuid;visit public.guided_site_visits;attempt public.guided_site_visit_photo_attempts;asset public.ai_estimator_assets;next_value integer;active_count integer;
begin company:=public.guided_site_visit_actor_company(requested_auth_user_id);if company is null then return query select 'forbidden',null::integer;return;end if;
 select * into visit from public.guided_site_visits where id=requested_visit_id and company_id=company for update;if visit.id is null then return query select 'not_found',null::integer;return;end if;
 if visit.status<>'in_progress' then return query select 'not_editable',visit.revision;return;end if;if visit.revision<>requested_expected_revision then return query select 'stale_revision',visit.revision;return;end if;
 select * into attempt from public.guided_site_visit_photo_attempts where id=requested_attempt_id and visit_id=visit.id and company_id=company and state='upload_pending' for update;if attempt.id is null then return query select 'not_found',visit.revision;return;end if;
 if not exists(select 1 from public.guided_site_visit_items where id=attempt.visit_item_id and visit_id=visit.id and company_id=company and state='pending') then return query select 'not_editable',visit.revision;return;end if;
 select * into asset from public.ai_estimator_assets where id=attempt.asset_id and case_id=visit.case_id and company_id=company for update;
 if asset.status<>'upload_pending' or requested_actual_byte_size is distinct from asset.declared_byte_size or requested_storage_mime_type is distinct from asset.mime_type then update public.ai_estimator_assets set status='failed_validation',byte_size=requested_actual_byte_size,storage_reported_mime_type=requested_storage_mime_type where id=asset.id;update public.guided_site_visit_photo_attempts set state='failed_validation' where id=attempt.id;next_value:=visit.revision+1;update public.guided_site_visits set revision=next_value,updated_at=now() where id=visit.id;return query select 'invalid_photo',next_value;return;end if;
 select count(*) into active_count from public.guided_site_visit_photo_attempts where company_id=company and visit_item_id=attempt.visit_item_id and state='confirmed';if attempt.capture_intent='complement' and active_count>=5 then return query select 'active_photo_limit',visit.revision;return;end if;
 if attempt.capture_intent='retake' then
   if attempt.requested_from_visible_fact_decision_id is not null and not exists(select 1 from public.guided_site_visit_visible_fact_decisions d where d.id=attempt.requested_from_visible_fact_decision_id and d.company_id=company and d.visit_id=visit.id and d.visit_item_id=attempt.visit_item_id and d.next_action='retake_photo' and d.photo_attempt_id=attempt.retake_of_attempt_id) then return query select 'retake_source_mismatch',visit.revision;return;end if;
   update public.guided_site_visit_photo_attempts set state='superseded' where id=attempt.retake_of_attempt_id and company_id=company and visit_id=visit.id and visit_item_id=attempt.visit_item_id and state='confirmed';if not found then return query select 'stale_retake',visit.revision;return;end if;
 end if;
 update public.ai_estimator_assets set status='available',byte_size=requested_actual_byte_size,storage_reported_mime_type=requested_storage_mime_type where id=asset.id;update public.guided_site_visit_photo_attempts set state='confirmed',confirmed_by_auth_user_id=requested_auth_user_id,confirmed_at=now() where id=attempt.id;
 next_value:=visit.revision+1;update public.guided_site_visits set revision=next_value,updated_at=now() where id=visit.id;return query select 'ok',next_value;end; $function$;

create or replace function public.confirm_guided_site_visit_photo_set(
 requested_auth_user_id uuid,requested_visit_id uuid,requested_item_id uuid,requested_expected_revision integer,
 requested_idempotency_key text,requested_coverage jsonb,requested_observation jsonb)
returns table(result_code text,confirmation_id uuid,next_revision integer,idempotent_replay boolean)
language plpgsql security definer set search_path=pg_catalog,public as $function$
declare company uuid;visit public.guided_site_visits;item public.guided_site_visit_items;existing public.guided_site_visit_photo_set_confirmations;
 entry jsonb;review public.guided_site_visit_ai_visible_fact_reviews;source_status text;created uuid;next_value integer;canonical jsonb;declared_keys text[];
begin
 company:=public.guided_site_visit_actor_company(requested_auth_user_id);if company is null then return query select 'forbidden',null::uuid,null::integer,false;return;end if;
 if jsonb_typeof(requested_coverage)<>'array' then return query select 'invalid_coverage',null::uuid,null::integer,false;return;end if;
 canonical:=coalesce((select jsonb_agg(value order by value->>'criterionKey') from jsonb_array_elements(requested_coverage) value),'[]'::jsonb);
 select * into existing from public.guided_site_visit_photo_set_confirmations where company_id=company and idempotency_key=requested_idempotency_key;
 if existing.id is not null then if existing.visit_id=requested_visit_id and existing.visit_item_id=requested_item_id and existing.requested_expected_revision=requested_expected_revision and existing.canonical_selection=canonical and existing.confirmed_observation is not distinct from requested_observation and existing.confirmed_by_auth_user_id=requested_auth_user_id then return query select 'ok',existing.id,existing.resulting_visit_revision,true;return;end if;return query select 'idempotency_conflict',existing.id,null::integer,false;return;end if;
 select * into visit from public.guided_site_visits where id=requested_visit_id and company_id=company for update;if visit.id is null then return query select 'not_found',null::uuid,null::integer,false;return;end if;
 select * into existing from public.guided_site_visit_photo_set_confirmations where company_id=company and idempotency_key=requested_idempotency_key;if existing.id is not null then if existing.visit_id=requested_visit_id and existing.visit_item_id=requested_item_id and existing.requested_expected_revision=requested_expected_revision and existing.canonical_selection=canonical and existing.confirmed_observation is not distinct from requested_observation and existing.confirmed_by_auth_user_id=requested_auth_user_id then return query select 'ok',existing.id,existing.resulting_visit_revision,true;return;end if;return query select 'idempotency_conflict',existing.id,null::integer,false;return;end if;
 if visit.status<>'in_progress' then return query select 'not_editable',null::uuid,visit.revision,false;return;end if;if visit.revision<>requested_expected_revision then return query select 'stale_revision',null::uuid,visit.revision,false;return;end if;
 select * into item from public.guided_site_visit_items where id=requested_item_id and visit_id=visit.id and company_id=company and state='pending';if item.id is null then return query select 'not_found',null::uuid,visit.revision,false;return;end if;
 if jsonb_typeof(requested_coverage)<>'array' or jsonb_array_length(requested_coverage) not between 1 and 12 or jsonb_typeof(requested_observation)<>'object' or public.is_valid_guided_site_visit_observation(item.requirement,requested_observation) is distinct from true then return query select 'invalid_coverage',null::uuid,visit.revision,false;return;end if;
 declared_keys:=public.guided_site_visit_visible_fact_keys(item.item_key);
 if (select array_agg(value->>'criterionKey' order by value->>'criterionKey') from jsonb_array_elements(requested_coverage) value)<>(select array_agg(k order by k) from unnest(declared_keys) k)
  or exists(select 1 from jsonb_array_elements(requested_coverage) value where jsonb_typeof(value)<>'object' or (select count(*) from jsonb_object_keys(value))<>3 or not value?'criterionKey' or not value?'sourceReviewId' or not value?'decision' or value->>'decision' not in('accepted','corrected'))
  or (select count(distinct value->>'sourceReviewId') from jsonb_array_elements(requested_coverage) value)>5 then return query select 'invalid_coverage',null::uuid,visit.revision,false;return;end if;
 next_value:=visit.revision+1;
 insert into public.guided_site_visit_photo_set_confirmations(company_id,visit_id,visit_item_id,idempotency_key,requested_expected_revision,canonical_selection,confirmed_observation,resulting_visit_revision,confirmed_by_auth_user_id)
 values(company,visit.id,item.id,requested_idempotency_key,requested_expected_revision,canonical,requested_observation,next_value,requested_auth_user_id) returning id into created;
 for entry in select value from jsonb_array_elements(requested_coverage) value loop
  select * into review from public.guided_site_visit_ai_visible_fact_reviews where id=(entry->>'sourceReviewId')::uuid and company_id=company and visit_id=visit.id and visit_item_id=item.id;
  if review.id is null or not exists(select 1 from public.guided_site_visit_photo_attempts where id=review.photo_attempt_id and asset_id=review.asset_id and visit_item_id=item.id and visit_id=visit.id and company_id=company and state='confirmed') then raise exception 'invalid active coverage source' using errcode='P0001';end if;
  select fact->>'status' into source_status from jsonb_array_elements(review.criteria) fact where fact->>'criterionKey'=entry->>'criterionKey';
  if source_status is null or entry->>'decision'='accepted' and source_status<>'visible' or entry->>'decision'='corrected' and source_status='visible' then raise exception 'invalid coverage decision' using errcode='P0001';end if;
  insert into public.guided_site_visit_photo_set_confirmation_facts(confirmation_id,company_id,visit_id,visit_item_id,criterion_key,source_visible_fact_review_id,source_photo_attempt_id,source_asset_id,source_status,human_decision)
  values(created,company,visit.id,item.id,entry->>'criterionKey',review.id,review.photo_attempt_id,review.asset_id,source_status,entry->>'decision');
 end loop;
 update public.guided_site_visit_items set state='confirmed',observation=requested_observation,confirmed_by_auth_user_id=requested_auth_user_id,confirmed_at=now() where id=item.id and state='pending';if not found then raise exception 'stale item' using errcode='P0001';end if;
 update public.guided_site_visits set revision=next_value,updated_at=now() where id=visit.id;return query select 'ok',created,next_value,false;
exception when invalid_text_representation or check_violation or raise_exception then return query select 'invalid_coverage',null::uuid,visit.revision,false;end; $function$;

alter table public.guided_site_visit_photo_set_confirmations enable row level security;alter table public.guided_site_visit_photo_set_confirmation_facts enable row level security;
revoke all on table public.guided_site_visit_photo_set_confirmations,public.guided_site_visit_photo_set_confirmation_facts from public,anon,authenticated,service_role;
grant select on table public.guided_site_visit_photo_set_confirmations,public.guided_site_visit_photo_set_confirmation_facts to service_role;
revoke all on function public.prevent_guided_site_visit_photo_attempt_provenance_mutation(),public.enforce_guided_site_visit_photo_attempt_source_decision(),public.reserve_guided_site_visit_photo_set_member(uuid,uuid,uuid,integer,text,text,uuid,uuid,uuid,uuid,text,text,text,bigint,text) from public,anon,authenticated;
grant execute on function public.reserve_guided_site_visit_photo_set_member(uuid,uuid,uuid,integer,text,text,uuid,uuid,uuid,uuid,text,text,text,bigint,text) to service_role;
revoke all on function public.confirm_guided_site_visit_photo_set(uuid,uuid,uuid,integer,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.confirm_guided_site_visit_photo_set(uuid,uuid,uuid,integer,text,jsonb,jsonb) to service_role;
comment on table public.guided_site_visit_photo_set_confirmations is 'Immutable human confirmation that a bounded active photo set covers every declared visible criterion.';
commit;
