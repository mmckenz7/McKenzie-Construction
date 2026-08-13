begin;

insert into public.feature_settings(scope_type,scope_id,feature_key,is_enabled,display_name,description,category,sort_order)
values('global','default','guided_site_visit_ai_visible_facts',false,'Guided Visit AI Visible Facts','Advisory visible/not-visible/unclear proposals for declared photo checklist criteria.','sales',113)
on conflict(scope_type,scope_id,feature_key) do nothing;

create or replace function public.is_valid_guided_visible_fact_result(requested_criteria jsonb,requested_recommendation jsonb)
returns boolean language plpgsql immutable set search_path=pg_catalog,public as $$
declare count_all integer; count_keys integer; unresolved integer; target_status text;
begin
  if jsonb_typeof(requested_criteria)<>'array' or jsonb_array_length(requested_criteria) not between 1 and 12 then return false; end if;
  if exists(select 1 from jsonb_array_elements(requested_criteria) item where jsonb_typeof(item)<>'object'
    or (select count(*) from jsonb_object_keys(item))<>2 or not item ? 'criterionKey' or not item ? 'status'
    or item->>'criterionKey' !~ '^[a-z][a-z0-9_]{0,63}$'
    or item->>'status' not in ('visible','not_visible','unclear')) then return false; end if;
  select count(*),count(distinct item->>'criterionKey'),count(*) filter(where item->>'status'<>'visible')
    into count_all,count_keys,unresolved from jsonb_array_elements(requested_criteria) item;
  if count_all<>count_keys then return false; end if;
  if requested_recommendation='null'::jsonb then return unresolved=0; end if;
  if jsonb_typeof(requested_recommendation)<>'object' or (select count(*) from jsonb_object_keys(requested_recommendation))<>2
    or not requested_recommendation ? 'criterionKey' or not requested_recommendation ? 'actionCode'
    or requested_recommendation->>'actionCode' not in ('move_closer','step_back','change_angle','add_light','remove_obstruction','show_other_end') then return false; end if;
  select item->>'status' into target_status from jsonb_array_elements(requested_criteria) item
    where item->>'criterionKey'=requested_recommendation->>'criterionKey';
  return coalesce(unresolved>0 and target_status in ('not_visible','unclear'),false);
end $$;

create or replace function public.guided_site_visit_visible_fact_keys(requested_item_key text)
returns text[] language sql immutable parallel safe set search_path=pg_catalog as $$
  select case requested_item_key
    when 'property_context' then array['house_elevation','entire_deck_area','yard_grade_access']::text[]
    when 'full_deck_yard' then array['deck_width_surface_edge','stairs_railings','grade_below_deck']::text[]
    when 'house_ledger' then array['ledger_connection','flashing_area','exterior_finish','ledger_end_conditions']::text[]
    when 'underside_framing' then array['joists_direction','beam_locations','visible_blocking','bearing_relationship']::text[]
    when 'supports_footings' then array['support_lines','post_beam_connections','post_bases','footing_or_ground_entry']::text[]
    when 'stairs_landings' then array['complete_stair_flight','top_connection_stringers','treads_risers','bottom_landing_grade']::text[]
    when 'guards_railings' then array['railing_sections','railing_posts_attachments','corners_transitions','stair_handrail']::text[]
    when 'access_demolition' then array['street_route','gates_passages','ground_constraints','staging_debris_route']::text[]
    when 'utilities_obstructions' then array['visible_utilities','mechanical_equipment','drainage','other_obstructions']::text[]
    else null::text[] end
$$;

create or replace function public.guided_visible_fact_keys_match(requested_criteria jsonb,requested_item_key text)
returns boolean language plpgsql immutable parallel safe set search_path=pg_catalog,public as $$
begin
 if jsonb_typeof(requested_criteria)<>'array' or public.guided_site_visit_visible_fact_keys(requested_item_key) is null then return false;end if;
 return coalesce((select array_agg(item->>'criterionKey' order by item->>'criterionKey') from jsonb_array_elements(requested_criteria) item)
   = (select array_agg(value order by value) from unnest(public.guided_site_visit_visible_fact_keys(requested_item_key)) value),false);
end
$$;

alter table public.guided_site_visit_ai_usability_reviews
  add constraint guided_site_visit_ai_usability_reviews_context_unique
  unique(id,photo_attempt_id,asset_id,visit_item_id,visit_id,company_id);

create table public.guided_site_visit_ai_visible_fact_reviews(
 id uuid primary key default gen_random_uuid(),company_id uuid not null references public.company_settings(id) on delete restrict,
 visit_id uuid not null,visit_item_id uuid not null,photo_attempt_id uuid not null,asset_id uuid not null,usability_review_id uuid not null,
 idempotency_key text not null,provider text not null,model_version text not null,prompt_version text not null,schema_version text not null,
 request_sha256 text not null,response_sha256 text not null,criteria jsonb not null,recommended_next_capture jsonb not null default 'null'::jsonb,
 created_by_auth_user_id uuid not null,created_at timestamptz not null default now(),
 unique(company_id,idempotency_key),unique(usability_review_id),unique(id,photo_attempt_id,asset_id,visit_item_id,visit_id,company_id),
 foreign key(photo_attempt_id,asset_id,visit_item_id,visit_id,company_id) references public.guided_site_visit_photo_attempts(id,asset_id,visit_item_id,visit_id,company_id) on delete restrict,
 foreign key(usability_review_id,photo_attempt_id,asset_id,visit_item_id,visit_id,company_id)
   references public.guided_site_visit_ai_usability_reviews(id,photo_attempt_id,asset_id,visit_item_id,visit_id,company_id) on delete restrict,
 check(length(idempotency_key) between 1 and 200 and idempotency_key=btrim(idempotency_key)),
 check(length(provider) between 1 and 100 and provider=btrim(provider)),
 check(length(model_version) between 1 and 200 and model_version=btrim(model_version)),
 check(length(prompt_version) between 1 and 200 and prompt_version=btrim(prompt_version)),
 check(length(schema_version) between 1 and 200 and schema_version=btrim(schema_version)),
 check(request_sha256~'^[0-9a-f]{64}$' and response_sha256~'^[0-9a-f]{64}$'),
 check(public.is_valid_guided_visible_fact_result(criteria,recommended_next_capture))
);
create index guided_site_visit_visible_facts_photo_idx on public.guided_site_visit_ai_visible_fact_reviews(company_id,visit_id,visit_item_id,photo_attempt_id,created_at,id);

create table public.guided_site_visit_visible_fact_decisions(
 id uuid primary key default gen_random_uuid(),company_id uuid not null references public.company_settings(id) on delete restrict,
 visit_id uuid not null,visit_item_id uuid not null,photo_attempt_id uuid not null,asset_id uuid not null,visible_fact_review_id uuid not null,
 idempotency_key text not null,requested_expected_revision integer not null check(requested_expected_revision>=0),
 decision text not null check(decision in('accepted','corrected')),next_action text not null check(next_action in('confirm_item','retake_photo')),
 final_criteria jsonb not null,final_recommended_next_capture jsonb not null default 'null'::jsonb,
 confirmed_observation jsonb,resulting_visit_revision integer not null check(resulting_visit_revision>=0),decided_by_auth_user_id uuid not null,created_at timestamptz not null default now(),
 unique(company_id,idempotency_key),unique(company_id,visible_fact_review_id),unique(id,company_id),
 foreign key(visible_fact_review_id,photo_attempt_id,asset_id,visit_item_id,visit_id,company_id)
   references public.guided_site_visit_ai_visible_fact_reviews(id,photo_attempt_id,asset_id,visit_item_id,visit_id,company_id) on delete restrict,
 check(length(idempotency_key) between 1 and 200 and idempotency_key=btrim(idempotency_key)),
 check(public.is_valid_guided_visible_fact_result(final_criteria,final_recommended_next_capture))
);

create or replace function public.prevent_guided_site_visit_visible_fact_mutation()
returns trigger language plpgsql set search_path=pg_catalog,public as $$begin raise exception 'Guided Site Visit visible-fact evidence is append-only.' using errcode='55000';end$$;
create trigger prevent_guided_ai_visible_fact_mutation before update or delete on public.guided_site_visit_ai_visible_fact_reviews for each row execute function public.prevent_guided_site_visit_visible_fact_mutation();
create trigger prevent_guided_visible_fact_decision_mutation before update or delete on public.guided_site_visit_visible_fact_decisions for each row execute function public.prevent_guided_site_visit_visible_fact_mutation();

create or replace function public.record_guided_site_visit_ai_visible_fact_review(
 requested_auth_user_id uuid,requested_visit_id uuid,requested_visit_item_id uuid,requested_photo_attempt_id uuid,requested_asset_id uuid,
 requested_usability_review_id uuid,requested_idempotency_key text,requested_provider text,requested_model_version text,requested_prompt_version text,
 requested_schema_version text,requested_request_sha256 text,requested_response_sha256 text,requested_criteria jsonb,requested_recommended_next_capture jsonb)
returns table(result_code text,review_id uuid,idempotent_replay boolean)
language plpgsql security definer set search_path=pg_catalog,public as $function$
declare company uuid; existing public.guided_site_visit_ai_visible_fact_reviews; created uuid; item_key text;
begin
 company:=public.guided_site_visit_actor_company(requested_auth_user_id);if company is null then return query select 'forbidden',null::uuid,false;return;end if;
 select * into existing from public.guided_site_visit_ai_visible_fact_reviews where company_id=company and idempotency_key=requested_idempotency_key;
 if existing.id is not null then
   if existing.visit_id=requested_visit_id and existing.visit_item_id=requested_visit_item_id
     and existing.photo_attempt_id=requested_photo_attempt_id and existing.asset_id=requested_asset_id
     and existing.usability_review_id=requested_usability_review_id and existing.provider=requested_provider
     and existing.model_version=requested_model_version and existing.prompt_version=requested_prompt_version
     and existing.schema_version=requested_schema_version and existing.request_sha256=requested_request_sha256
     and existing.response_sha256=requested_response_sha256 and existing.criteria=requested_criteria
     and existing.recommended_next_capture=requested_recommended_next_capture
     and existing.created_by_auth_user_id=requested_auth_user_id then
     return query select 'ok',existing.id,true;return;
   end if;
   return query select 'idempotency_conflict',existing.id,false;return;
 end if;
 select i.item_key into item_key from public.guided_site_visit_photo_attempts p
   join public.guided_site_visit_items i on i.id=p.visit_item_id and i.visit_id=p.visit_id and i.company_id=p.company_id
   join public.guided_site_visit_ai_usability_reviews u
   on u.id=requested_usability_review_id and u.company_id=p.company_id and u.photo_attempt_id=p.id and u.verdict='usable'
   where p.id=requested_photo_attempt_id and p.asset_id=requested_asset_id and p.visit_item_id=requested_visit_item_id
     and p.visit_id=requested_visit_id and p.company_id=company and p.state='confirmed';
 if item_key is null then return query select 'not_found',null::uuid,false;return;end if;
 if public.is_valid_guided_visible_fact_result(requested_criteria,requested_recommended_next_capture) is distinct from true then
   return query select 'invalid_review',null::uuid,false;return;
 end if;
 if public.guided_visible_fact_keys_match(requested_criteria,item_key) is distinct from true then
   return query select 'invalid_review',null::uuid,false;return;
 end if;
 insert into public.guided_site_visit_ai_visible_fact_reviews(company_id,visit_id,visit_item_id,photo_attempt_id,asset_id,usability_review_id,idempotency_key,provider,model_version,prompt_version,schema_version,request_sha256,response_sha256,criteria,recommended_next_capture,created_by_auth_user_id)
 values(company,requested_visit_id,requested_visit_item_id,requested_photo_attempt_id,requested_asset_id,requested_usability_review_id,requested_idempotency_key,requested_provider,requested_model_version,requested_prompt_version,requested_schema_version,requested_request_sha256,requested_response_sha256,requested_criteria,requested_recommended_next_capture,requested_auth_user_id) returning id into created;
 return query select 'ok',created,false;
exception
 when check_violation or not_null_violation or string_data_right_truncation or invalid_text_representation then
   return query select 'invalid_review',null::uuid,false;
 when unique_violation then
   select * into existing from public.guided_site_visit_ai_visible_fact_reviews where company_id=company and idempotency_key=requested_idempotency_key;
   if existing.id is not null and existing.visit_id=requested_visit_id and existing.visit_item_id=requested_visit_item_id
     and existing.photo_attempt_id=requested_photo_attempt_id and existing.asset_id=requested_asset_id
     and existing.usability_review_id=requested_usability_review_id and existing.provider=requested_provider
     and existing.model_version=requested_model_version and existing.prompt_version=requested_prompt_version
     and existing.schema_version=requested_schema_version and existing.request_sha256=requested_request_sha256
     and existing.response_sha256=requested_response_sha256 and existing.criteria=requested_criteria
     and existing.recommended_next_capture=requested_recommended_next_capture
     and existing.created_by_auth_user_id=requested_auth_user_id then
     return query select 'ok',existing.id,true;return;
   end if;
   return query select 'idempotency_conflict',existing.id,false;
end $function$;

create or replace function public.decide_guided_site_visit_visible_facts(
 requested_auth_user_id uuid,requested_visit_id uuid,requested_item_id uuid,requested_photo_attempt_id uuid,requested_review_id uuid,
 requested_expected_revision integer,requested_idempotency_key text,requested_decision text,requested_next_action text,
 requested_final_criteria jsonb,requested_final_recommended_next_capture jsonb,requested_observation jsonb)
returns table(result_code text,decision_id uuid,next_revision integer,idempotent_replay boolean)
language plpgsql security definer set search_path=pg_catalog,public as $function$
declare company uuid; visit public.guided_site_visits; item public.guided_site_visit_items; review public.guided_site_visit_ai_visible_fact_reviews; existing public.guided_site_visit_visible_fact_decisions; created uuid; next_value integer;
begin
 company:=public.guided_site_visit_actor_company(requested_auth_user_id);if company is null then return query select 'forbidden',null::uuid,null::integer,false;return;end if;
 select * into existing from public.guided_site_visit_visible_fact_decisions where company_id=company and idempotency_key=requested_idempotency_key;
 if existing.id is not null then
   if existing.visit_id=requested_visit_id and existing.visit_item_id=requested_item_id
     and existing.photo_attempt_id=requested_photo_attempt_id and existing.visible_fact_review_id=requested_review_id
     and existing.requested_expected_revision=requested_expected_revision and existing.decision=requested_decision
     and existing.next_action=requested_next_action and existing.final_criteria=requested_final_criteria
     and existing.final_recommended_next_capture=requested_final_recommended_next_capture
     and existing.confirmed_observation is not distinct from requested_observation
     and existing.decided_by_auth_user_id=requested_auth_user_id then
     return query select 'ok',existing.id,existing.resulting_visit_revision,true;return;
   end if;
   return query select 'idempotency_conflict',existing.id,null::integer,false;return;
 end if;
 select * into visit from public.guided_site_visits where id=requested_visit_id and company_id=company for update;if visit.id is null then return query select 'not_found',null::uuid,null::integer,false;return;end if;
 select * into existing from public.guided_site_visit_visible_fact_decisions where company_id=company and idempotency_key=requested_idempotency_key;
 if existing.id is not null then
   if existing.visit_id=requested_visit_id and existing.visit_item_id=requested_item_id
     and existing.photo_attempt_id=requested_photo_attempt_id and existing.visible_fact_review_id=requested_review_id
     and existing.requested_expected_revision=requested_expected_revision and existing.decision=requested_decision
     and existing.next_action=requested_next_action and existing.final_criteria=requested_final_criteria
     and existing.final_recommended_next_capture=requested_final_recommended_next_capture
     and existing.confirmed_observation is not distinct from requested_observation
     and existing.decided_by_auth_user_id=requested_auth_user_id then
     return query select 'ok',existing.id,existing.resulting_visit_revision,true;return;
   end if;
   return query select 'idempotency_conflict',existing.id,null::integer,false;return;
 end if;
 if visit.status<>'in_progress' then return query select 'not_editable',null::uuid,visit.revision,false;return;end if;if visit.revision<>requested_expected_revision then return query select 'stale_revision',null::uuid,visit.revision,false;return;end if;
 select * into item from public.guided_site_visit_items where id=requested_item_id and visit_id=visit.id and company_id=company and state='pending';
 select * into review from public.guided_site_visit_ai_visible_fact_reviews where id=requested_review_id and visit_id=visit.id and visit_item_id=item.id and photo_attempt_id=requested_photo_attempt_id and company_id=company;
 if review.id is null or item.id is null or not exists(select 1 from public.guided_site_visit_photo_attempts
   where id=requested_photo_attempt_id and visit_item_id=item.id and visit_id=visit.id and company_id=company and state='confirmed')
   then return query select 'stale_photo',null::uuid,visit.revision,false;return;end if;
 if requested_decision not in('accepted','corrected') or requested_next_action not in('confirm_item','retake_photo')
   or public.is_valid_guided_visible_fact_result(requested_final_criteria,requested_final_recommended_next_capture) is distinct from true
   or (requested_decision='accepted' and (requested_final_criteria<>review.criteria or requested_final_recommended_next_capture<>review.recommended_next_capture))
   or (requested_decision='corrected' and requested_final_criteria=review.criteria and requested_final_recommended_next_capture=review.recommended_next_capture)
   or (select array_agg(fact->>'criterionKey' order by fact->>'criterionKey') from jsonb_array_elements(requested_final_criteria) fact)
      <> (select array_agg(fact->>'criterionKey' order by fact->>'criterionKey') from jsonb_array_elements(review.criteria) fact)
   or (requested_next_action='confirm_item' and (exists(select 1 from jsonb_array_elements(requested_final_criteria) fact where fact->>'status'<>'visible')
      or requested_final_recommended_next_capture<>'null'::jsonb or requested_observation is null
      or public.is_valid_guided_site_visit_observation(item.requirement,requested_observation) is distinct from true))
   or (requested_next_action='retake_photo' and (not exists(select 1 from jsonb_array_elements(requested_final_criteria) fact where fact->>'status'<>'visible')
      or requested_final_recommended_next_capture='null'::jsonb or requested_observation is not null))
   then return query select 'requirements_incomplete',null::uuid,visit.revision,false;return;end if;
 if public.guided_visible_fact_keys_match(requested_final_criteria,item.item_key) is distinct from true then
   return query select 'requirements_incomplete',null::uuid,visit.revision,false;return;
 end if;
 next_value:=visit.revision+1;
 if requested_next_action='confirm_item' then
   update public.guided_site_visit_items set state='confirmed',observation=requested_observation,confirmed_by_auth_user_id=requested_auth_user_id,confirmed_at=now()
   where id=item.id and company_id=company and visit_id=visit.id and state='pending';
   if not found then return query select 'not_editable',null::uuid,visit.revision,false;return;end if;
 end if;
 insert into public.guided_site_visit_visible_fact_decisions(company_id,visit_id,visit_item_id,photo_attempt_id,asset_id,visible_fact_review_id,idempotency_key,requested_expected_revision,decision,next_action,final_criteria,final_recommended_next_capture,confirmed_observation,resulting_visit_revision,decided_by_auth_user_id)
 values(company,visit.id,item.id,requested_photo_attempt_id,review.asset_id,review.id,requested_idempotency_key,requested_expected_revision,requested_decision,requested_next_action,requested_final_criteria,requested_final_recommended_next_capture,requested_observation,next_value,requested_auth_user_id) returning id into created;
 update public.guided_site_visits set revision=next_value,updated_at=now() where id=visit.id;
 return query select 'ok',created,next_value,false;
exception
 when check_violation or not_null_violation or string_data_right_truncation or invalid_text_representation then
   return query select 'invalid_decision',null::uuid,visit.revision,false;
 when unique_violation then
   select * into existing from public.guided_site_visit_visible_fact_decisions where company_id=company and idempotency_key=requested_idempotency_key;
   if existing.id is not null and existing.visit_id=requested_visit_id and existing.visit_item_id=requested_item_id
     and existing.photo_attempt_id=requested_photo_attempt_id and existing.visible_fact_review_id=requested_review_id
     and existing.requested_expected_revision=requested_expected_revision and existing.decision=requested_decision
     and existing.next_action=requested_next_action and existing.final_criteria=requested_final_criteria
     and existing.final_recommended_next_capture=requested_final_recommended_next_capture
     and existing.confirmed_observation is not distinct from requested_observation
     and existing.decided_by_auth_user_id=requested_auth_user_id then
     return query select 'ok',existing.id,existing.resulting_visit_revision,true;return;
   end if;
   return query select 'idempotency_conflict',existing.id,null::integer,false;
end $function$;

alter table public.guided_site_visit_ai_visible_fact_reviews enable row level security;alter table public.guided_site_visit_visible_fact_decisions enable row level security;
revoke all on table public.guided_site_visit_ai_visible_fact_reviews,public.guided_site_visit_visible_fact_decisions from public,anon,authenticated,service_role;
grant select on table public.guided_site_visit_ai_visible_fact_reviews,public.guided_site_visit_visible_fact_decisions to service_role;
revoke all on function public.is_valid_guided_visible_fact_result(jsonb,jsonb),public.guided_site_visit_visible_fact_keys(text),public.guided_visible_fact_keys_match(jsonb,text),public.prevent_guided_site_visit_visible_fact_mutation(),public.record_guided_site_visit_ai_visible_fact_review(uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text,text,jsonb,jsonb),public.decide_guided_site_visit_visible_facts(uuid,uuid,uuid,uuid,uuid,integer,text,text,text,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.is_valid_guided_visible_fact_result(jsonb,jsonb),public.guided_site_visit_visible_fact_keys(text),public.guided_visible_fact_keys_match(jsonb,text),public.prevent_guided_site_visit_visible_fact_mutation(),public.record_guided_site_visit_ai_visible_fact_review(uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text,text,jsonb,jsonb),public.decide_guided_site_visit_visible_facts(uuid,uuid,uuid,uuid,uuid,integer,text,text,text,jsonb,jsonb,jsonb) to service_role;
comment on table public.guided_site_visit_ai_visible_fact_reviews is 'Immutable advisory visibility proposals limited to server-declared checklist criteria; never measurements, engineering, code, pricing, or estimate mutations.';
comment on table public.guided_site_visit_visible_fact_decisions is 'Immutable human acceptance or correction of AI visibility proposals. Only this human decision may atomically confirm a visit item.';
commit;
