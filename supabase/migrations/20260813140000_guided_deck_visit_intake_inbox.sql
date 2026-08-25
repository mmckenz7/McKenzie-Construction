begin;

create table public.guided_site_visit_intake_batches (
  id uuid primary key,
  company_id uuid not null references public.company_settings(id) on delete restrict,
  visit_id uuid not null,
  case_id uuid not null,
  idempotency_key text not null,
  request_fingerprint text not null check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  member_count integer not null check (member_count between 1 and 30),
  created_by_auth_user_id uuid not null,
  created_at timestamptz not null default now(),
  unique(company_id,idempotency_key), unique(id,visit_id,company_id),
  foreign key(visit_id,company_id) references public.guided_site_visits(id,company_id) on delete restrict,
  foreign key(case_id,company_id) references public.ai_estimator_cases(id,company_id) on delete restrict,
  check(length(idempotency_key) between 1 and 200 and idempotency_key=btrim(idempotency_key))
);

create table public.guided_site_visit_intake_members (
  batch_id uuid not null, company_id uuid not null, visit_id uuid not null,
  ordinal integer not null check(ordinal between 1 and 30),
  original_filename text not null, mime_type text not null,
  declared_byte_size bigint not null check(declared_byte_size between 1 and 15728640),
  declared_sha256 text not null check(declared_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  primary key(batch_id,ordinal), unique(batch_id,declared_sha256,ordinal),
  foreign key(batch_id,visit_id,company_id) references public.guided_site_visit_intake_batches(id,visit_id,company_id) on delete restrict,
  check(mime_type in ('image/jpeg','image/png','image/webp','image/heic','image/heif')),
  check(length(original_filename) between 1 and 240)
);

create table public.guided_site_visit_intake_attempts (
  id uuid primary key, batch_id uuid not null, company_id uuid not null, visit_id uuid not null,
  member_ordinal integer not null, case_id uuid not null, asset_id uuid not null,
  reservation_idempotency_key text not null, state text not null default 'upload_pending'
    check(state in ('upload_pending','confirmed','failed_validation','abandoned')),
  resulting_reservation_revision integer not null, reserved_by_auth_user_id uuid not null,
  confirmed_by_auth_user_id uuid, confirmed_at timestamptz, created_at timestamptz not null default now(),
  unique(company_id,reservation_idempotency_key), unique(asset_id),
  unique(id,batch_id,member_ordinal,visit_id,company_id), unique(id,visit_id,company_id),
  foreign key(batch_id,member_ordinal) references public.guided_site_visit_intake_members(batch_id,ordinal) on delete restrict,
  foreign key(batch_id,visit_id,company_id) references public.guided_site_visit_intake_batches(id,visit_id,company_id) on delete restrict,
  foreign key(asset_id,case_id,company_id) references public.ai_estimator_assets(id,case_id,company_id) on delete restrict
);
create unique index guided_visit_intake_one_inflight_per_batch_uidx
  on public.guided_site_visit_intake_attempts(batch_id) where state='upload_pending';

create table public.guided_site_visit_intake_classification_reviews (
  id uuid primary key default gen_random_uuid(), company_id uuid not null, visit_id uuid not null,
  batch_id uuid not null, member_ordinal integer not null, intake_attempt_id uuid not null, asset_id uuid not null,
  idempotency_key text not null, provider text not null, model_version text not null,
  prompt_version text not null, schema_version text not null,
  request_sha256 text not null check(request_sha256 ~ '^[0-9a-f]{64}$'),
  response_sha256 text not null check(response_sha256 ~ '^[0-9a-f]{64}$'),
  diagnostic_class text not null check(diagnostic_class in ('classified','retake_recommended','review_unavailable','unsupported_media')),
  issue_codes text[] not null default '{}',
  proposals jsonb not null check(jsonb_typeof(proposals)='array' and jsonb_array_length(proposals)<=64),
  created_by_auth_user_id uuid not null, created_at timestamptz not null default now(),
  unique(company_id,idempotency_key), unique(id,visit_id,company_id),
  foreign key(intake_attempt_id,batch_id,member_ordinal,visit_id,company_id)
    references public.guided_site_visit_intake_attempts(id,batch_id,member_ordinal,visit_id,company_id) on delete restrict,
  foreign key(asset_id) references public.ai_estimator_assets(id) on delete restrict,
  check(diagnostic_class='classified' and cardinality(issue_codes)=0 or diagnostic_class<>'classified' and proposals='[]'::jsonb)
);

create table public.guided_site_visit_intake_assignment_events (
  id uuid primary key default gen_random_uuid(), company_id uuid not null, visit_id uuid not null,
  batch_id uuid not null, intake_attempt_id uuid not null, asset_id uuid not null,
  classification_review_id uuid, visit_item_id uuid, criterion_key text,
  supersedes_assignment_event_id uuid,
  decision text not null check(decision in ('accepted','corrected','excluded')),
  idempotency_key text not null, requested_expected_revision integer not null,
  resulting_visit_revision integer not null, decided_by_auth_user_id uuid not null,
  created_at timestamptz not null default now(), unique(company_id,idempotency_key),
  foreign key(visit_item_id,visit_id,company_id) references public.guided_site_visit_items(id,visit_id,company_id) on delete restrict,
  foreign key(intake_attempt_id,visit_id,company_id) references public.guided_site_visit_intake_attempts(id,visit_id,company_id) on delete restrict,
  foreign key(classification_review_id,visit_id,company_id) references public.guided_site_visit_intake_classification_reviews(id,visit_id,company_id) on delete restrict,
  foreign key(supersedes_assignment_event_id) references public.guided_site_visit_intake_assignment_events(id) on delete restrict,
  unique(supersedes_assignment_event_id),
  check(visit_item_id is not null and criterion_key is not null),
  check(criterion_key is null or criterion_key ~ '^[a-z][a-z0-9_]{0,63}$')
);

alter table public.guided_site_visit_intake_batches enable row level security;
alter table public.guided_site_visit_intake_members enable row level security;
alter table public.guided_site_visit_intake_attempts enable row level security;
alter table public.guided_site_visit_intake_classification_reviews enable row level security;
alter table public.guided_site_visit_intake_assignment_events enable row level security;
revoke all on table public.guided_site_visit_intake_batches,public.guided_site_visit_intake_members,
 public.guided_site_visit_intake_attempts,public.guided_site_visit_intake_classification_reviews,
 public.guided_site_visit_intake_assignment_events from public,anon,authenticated,service_role;
grant select on table public.guided_site_visit_intake_batches,public.guided_site_visit_intake_members,
 public.guided_site_visit_intake_attempts,public.guided_site_visit_intake_classification_reviews,
 public.guided_site_visit_intake_assignment_events to service_role;

create trigger prevent_guided_visit_intake_batch_mutation before update or delete on public.guided_site_visit_intake_batches
 for each row execute function public.prevent_guided_site_visit_photo_batch_mutation();
create trigger prevent_guided_visit_intake_member_mutation before update or delete on public.guided_site_visit_intake_members
 for each row execute function public.prevent_guided_site_visit_photo_batch_mutation();
create trigger prevent_guided_visit_intake_review_mutation before update or delete on public.guided_site_visit_intake_classification_reviews
 for each row execute function public.prevent_guided_site_visit_photo_batch_mutation();
create trigger prevent_guided_visit_intake_assignment_mutation before update or delete on public.guided_site_visit_intake_assignment_events
 for each row execute function public.prevent_guided_site_visit_photo_batch_mutation();

create or replace function public.create_guided_site_visit_intake_batch(requested_auth_user_id uuid,requested_visit_id uuid,
 requested_batch_id uuid,requested_idempotency_key text,requested_request_fingerprint text,requested_manifest jsonb)
returns table(result_code text,batch_id uuid,idempotent_replay boolean)
language plpgsql security definer set search_path=pg_catalog,public as $f$
declare company uuid; visit public.guided_site_visits; existing public.guided_site_visit_intake_batches; entry jsonb; n integer;
begin
 company:=public.guided_site_visit_actor_company(requested_auth_user_id); if company is null then return query select 'forbidden',null::uuid,false;return;end if;
 n:=case when jsonb_typeof(requested_manifest)='array' then jsonb_array_length(requested_manifest) else 0 end;
 if requested_batch_id is null or n not between 1 and 30 or requested_request_fingerprint !~ '^[0-9a-f]{64}$'
  or nullif(btrim(coalesce(requested_idempotency_key,'')),'') is null then return query select 'invalid_manifest',null::uuid,false;return;end if;
 select * into existing from public.guided_site_visit_intake_batches where company_id=company and idempotency_key=btrim(requested_idempotency_key);
 if existing.id is not null then return query select case when existing.id=requested_batch_id and existing.visit_id=requested_visit_id and existing.request_fingerprint=requested_request_fingerprint and existing.member_count=n and existing.created_by_auth_user_id=requested_auth_user_id then 'ok' else 'idempotency_conflict' end,existing.id,true;return;end if;
 select * into visit from public.guided_site_visits where id=requested_visit_id and company_id=company for update;
 if visit.id is null then return query select 'not_found',null::uuid,false;return;end if; if visit.status<>'in_progress' then return query select 'not_editable',null::uuid,false;return;end if;
 if exists(select 1 from jsonb_array_elements(requested_manifest) e where jsonb_typeof(e)<>'object' or (select count(*) from jsonb_object_keys(e))<>5
  or (e->>'ordinal')::integer not between 1 and 30 or e->>'mimeType' not in ('image/jpeg','image/png','image/webp','image/heic','image/heif')
  or (e->>'byteSize')::bigint not between 1 and 15728640 or e->>'sha256' !~ '^[0-9a-f]{64}$' or length(e->>'originalFilename') not between 1 and 240)
  or (select count(distinct (e->>'ordinal')::integer) from jsonb_array_elements(requested_manifest)e)<>n
  then return query select 'invalid_manifest',null::uuid,false;return;end if;
 insert into public.guided_site_visit_intake_batches values(requested_batch_id,company,visit.id,visit.case_id,btrim(requested_idempotency_key),requested_request_fingerprint,n,requested_auth_user_id,now());
 insert into public.guided_site_visit_intake_members(batch_id,company_id,visit_id,ordinal,original_filename,mime_type,declared_byte_size,declared_sha256)
 select requested_batch_id,company,visit.id,(e->>'ordinal')::integer,e->>'originalFilename',e->>'mimeType',(e->>'byteSize')::bigint,e->>'sha256' from jsonb_array_elements(requested_manifest)e;
 return query select 'ok',requested_batch_id,false;
exception when unique_violation or check_violation or invalid_text_representation then return query select 'invalid_manifest',null::uuid,false;end;$f$;

create or replace function public.reserve_guided_site_visit_intake_member(requested_auth_user_id uuid,requested_visit_id uuid,requested_batch_id uuid,
 requested_member_ordinal integer,requested_expected_revision integer,requested_idempotency_key text,requested_attempt_id uuid,requested_asset_id uuid,requested_storage_path text)
returns table(result_code text,next_revision integer,attempt_id uuid,asset_id uuid,storage_path text,idempotent_replay boolean)
language plpgsql security definer set search_path=pg_catalog,public as $f$
declare company uuid; visit public.guided_site_visits; batch public.guided_site_visit_intake_batches; member public.guided_site_visit_intake_members; existing public.guided_site_visit_intake_attempts; nextv integer;
begin company:=public.guided_site_visit_actor_company(requested_auth_user_id);if company is null then return query select 'forbidden',null::integer,null::uuid,null::uuid,null::text,false;return;end if;
 select * into existing from public.guided_site_visit_intake_attempts where company_id=company and reservation_idempotency_key=requested_idempotency_key;
 if existing.id is not null then return query select case when not(existing.id=requested_attempt_id and existing.batch_id=requested_batch_id and existing.visit_id=requested_visit_id and existing.member_ordinal=requested_member_ordinal and existing.asset_id=requested_asset_id and existing.reserved_by_auth_user_id=requested_auth_user_id and (select a.storage_path=requested_storage_path and a.original_filename=m.original_filename and a.mime_type=m.mime_type and a.declared_byte_size=m.declared_byte_size and a.declared_sha256=m.declared_sha256 from public.ai_estimator_assets a join public.guided_site_visit_intake_members m on m.batch_id=existing.batch_id and m.ordinal=existing.member_ordinal where a.id=existing.asset_id and a.company_id=company)) then 'idempotency_conflict' when existing.state='upload_pending' then 'ok' when existing.state='confirmed' then 'member_confirmed' else 'reservation_failed' end,existing.resulting_reservation_revision,existing.id,existing.asset_id,(select storage_path from public.ai_estimator_assets where id=existing.asset_id),true;return;end if;
 select * into batch from public.guided_site_visit_intake_batches where id=requested_batch_id and visit_id=requested_visit_id and company_id=company for update;
 select * into visit from public.guided_site_visits where id=requested_visit_id and company_id=company for update;
 select * into member from public.guided_site_visit_intake_members where batch_id=requested_batch_id and ordinal=requested_member_ordinal;
 if batch.id is null or member.batch_id is null then return query select 'not_found',null::integer,null::uuid,null::uuid,null::text,false;return;end if;
 if batch.created_by_auth_user_id<>requested_auth_user_id then return query select 'forbidden',visit.revision,null::uuid,null::uuid,null::text,false;return;end if;
 if visit.status<>'in_progress' then return query select 'not_editable',visit.revision,null::uuid,null::uuid,null::text,false;return;end if;
 if visit.revision<>requested_expected_revision then return query select 'stale_revision',visit.revision,null::uuid,null::uuid,null::text,false;return;end if;
 if exists(select 1 from public.guided_site_visit_intake_attempts where batch_id=batch.id and state='upload_pending') then return query select 'upload_in_progress',visit.revision,null::uuid,null::uuid,null::text,false;return;end if;
 if requested_member_ordinal<>(select coalesce(max(member_ordinal),0)+1 from public.guided_site_visit_intake_attempts where batch_id=batch.id and state='confirmed') then return query select 'out_of_sequence',visit.revision,null::uuid,null::uuid,null::text,false;return;end if;
 if exists(select 1 from public.guided_site_visit_intake_attempts where batch_id=batch.id and member_ordinal=requested_member_ordinal and state='confirmed') then return query select 'member_confirmed',visit.revision,null::uuid,null::uuid,null::text,false;return;end if;
 if requested_storage_path not like company::text||'/'||visit.case_id::text||'/'||requested_asset_id::text||'/%' then return query select 'invalid_photo',visit.revision,null::uuid,null::uuid,null::text,false;return;end if;
 insert into public.ai_estimator_assets(id,company_id,case_id,asset_kind,origin,storage_bucket,storage_path,original_filename,mime_type,declared_byte_size,declared_sha256,status,created_by_auth_user_id)
 values(requested_asset_id,company,visit.case_id,'photo','user_upload','ai-estimator-private',requested_storage_path,member.original_filename,member.mime_type,member.declared_byte_size,member.declared_sha256,'upload_pending',requested_auth_user_id);
 nextv:=visit.revision+1;insert into public.guided_site_visit_intake_attempts(id,batch_id,company_id,visit_id,member_ordinal,case_id,asset_id,reservation_idempotency_key,resulting_reservation_revision,reserved_by_auth_user_id)
 values(requested_attempt_id,batch.id,company,visit.id,member.ordinal,visit.case_id,requested_asset_id,requested_idempotency_key,nextv,requested_auth_user_id);
 update public.guided_site_visits set revision=nextv,updated_at=now() where id=visit.id;return query select 'ok',nextv,requested_attempt_id,requested_asset_id,requested_storage_path,false;
exception when unique_violation then return query select 'upload_in_progress',null::integer,null::uuid,null::uuid,null::text,false;end;$f$;

create or replace function public.confirm_guided_site_visit_intake_member(requested_auth_user_id uuid,requested_visit_id uuid,requested_attempt_id uuid,requested_expected_revision integer,requested_actual_byte_size bigint,requested_storage_mime_type text)
returns table(result_code text,next_revision integer) language plpgsql security definer set search_path=pg_catalog,public as $f$
declare company uuid;visit public.guided_site_visits;attempt public.guided_site_visit_intake_attempts;asset public.ai_estimator_assets;nextv integer;
begin company:=public.guided_site_visit_actor_company(requested_auth_user_id);select * into visit from public.guided_site_visits where id=requested_visit_id and company_id=company for update;
 if visit.id is null then return query select 'not_found',null::integer;return;end if;if visit.revision<>requested_expected_revision then return query select 'stale_revision',visit.revision;return;end if;
 select * into attempt from public.guided_site_visit_intake_attempts where id=requested_attempt_id and visit_id=visit.id and company_id=company for update;
 select * into asset from public.ai_estimator_assets where id=attempt.asset_id and company_id=company for update;
 if attempt.state<>'upload_pending' or asset.status<>'upload_pending' then return query select 'not_uploadable',visit.revision;return;end if;nextv:=visit.revision+1;
 if requested_actual_byte_size is distinct from asset.declared_byte_size or requested_storage_mime_type is distinct from asset.mime_type then update public.ai_estimator_assets set status='failed_validation',byte_size=requested_actual_byte_size,storage_reported_mime_type=requested_storage_mime_type where id=asset.id;update public.guided_site_visit_intake_attempts set state='failed_validation' where id=attempt.id;update public.guided_site_visits set revision=nextv,updated_at=now() where id=visit.id;return query select 'invalid_photo',nextv;return;end if;
 update public.ai_estimator_assets set status='available',byte_size=requested_actual_byte_size,storage_reported_mime_type=requested_storage_mime_type where id=asset.id;update public.guided_site_visit_intake_attempts set state='confirmed',confirmed_by_auth_user_id=requested_auth_user_id,confirmed_at=now() where id=attempt.id;update public.guided_site_visits set revision=nextv,updated_at=now() where id=visit.id;return query select 'ok',nextv;end;$f$;

create or replace function public.fail_guided_site_visit_intake_member(requested_auth_user_id uuid,requested_visit_id uuid,requested_attempt_id uuid,requested_expected_revision integer)
returns table(result_code text,next_revision integer) language plpgsql security definer set search_path=pg_catalog,public as $f$
declare company uuid;visit public.guided_site_visits;attempt public.guided_site_visit_intake_attempts;nextv integer;
begin company:=public.guided_site_visit_actor_company(requested_auth_user_id);if company is null then return query select 'forbidden',null::integer;return;end if;select * into visit from public.guided_site_visits where id=requested_visit_id and company_id=company for update;if visit.id is null then return query select 'not_found',null::integer;return;end if;if visit.revision<>requested_expected_revision then return query select 'stale_revision',visit.revision;return;end if;select * into attempt from public.guided_site_visit_intake_attempts where id=requested_attempt_id and visit_id=visit.id and company_id=company for update;if attempt.id is null or attempt.reserved_by_auth_user_id<>requested_auth_user_id then return query select 'not_found',visit.revision;return;end if;if attempt.state in('failed_validation','abandoned') then return query select 'ok',visit.revision;return;end if;if attempt.state<>'upload_pending' then return query select 'not_abandonable',visit.revision;return;end if;nextv:=visit.revision+1;update public.ai_estimator_assets set status='failed_validation' where id=attempt.asset_id and company_id=company and status='upload_pending';update public.guided_site_visit_intake_attempts set state='abandoned' where id=attempt.id;update public.guided_site_visits set revision=nextv,updated_at=now() where id=visit.id;return query select 'ok',nextv;end;$f$;

create or replace function public.record_guided_site_visit_intake_classification(requested_auth_user_id uuid,requested_visit_id uuid,requested_attempt_id uuid,requested_idempotency_key text,requested_provider text,requested_model_version text,requested_prompt_version text,requested_schema_version text,requested_request_sha256 text,requested_response_sha256 text,requested_diagnostic_class text,requested_issue_codes text[],requested_proposals jsonb)
returns table(result_code text,review_id uuid,idempotent_replay boolean) language plpgsql security definer set search_path=pg_catalog,public as $f$
declare company uuid;attempt public.guided_site_visit_intake_attempts;existing public.guided_site_visit_intake_classification_reviews;created uuid;
begin company:=public.guided_site_visit_actor_company(requested_auth_user_id);select * into existing from public.guided_site_visit_intake_classification_reviews where company_id=company and idempotency_key=requested_idempotency_key;
 if existing.id is not null then return query select case when existing.intake_attempt_id=requested_attempt_id and existing.created_by_auth_user_id=requested_auth_user_id and existing.diagnostic_class=requested_diagnostic_class and existing.issue_codes=requested_issue_codes and existing.proposals=requested_proposals then 'ok' else 'idempotency_conflict' end,existing.id,true;return;end if;
 select * into attempt from public.guided_site_visit_intake_attempts where id=requested_attempt_id and visit_id=requested_visit_id and company_id=company and state='confirmed';if attempt.id is null then return query select 'not_found',null::uuid,false;return;end if;
 if requested_diagnostic_class not in('classified','retake_recommended','review_unavailable','unsupported_media') or jsonb_typeof(requested_proposals)<>'array' or requested_issue_codes is null or requested_diagnostic_class='classified' and cardinality(requested_issue_codes)<>0 or requested_diagnostic_class<>'classified' and requested_proposals<>'[]'::jsonb
  or exists(select 1 from jsonb_array_elements(requested_proposals)p left join public.guided_site_visit_items i on i.id=(p->>'visitItemId')::uuid and i.visit_id=attempt.visit_id and i.company_id=company where jsonb_typeof(p)<>'object' or i.id is null or p->>'criterionKey' !~ '^[a-z][a-z0-9_]{0,63}$' or not (public.guided_site_visit_visible_fact_keys(i.item_key)?(p->>'criterionKey'))) then return query select 'invalid_proposals',null::uuid,false;return;end if;
 insert into public.guided_site_visit_intake_classification_reviews(company_id,visit_id,batch_id,member_ordinal,intake_attempt_id,asset_id,idempotency_key,provider,model_version,prompt_version,schema_version,request_sha256,response_sha256,diagnostic_class,issue_codes,proposals,created_by_auth_user_id)
 values(company,attempt.visit_id,attempt.batch_id,attempt.member_ordinal,attempt.id,attempt.asset_id,requested_idempotency_key,requested_provider,requested_model_version,requested_prompt_version,requested_schema_version,requested_request_sha256,requested_response_sha256,requested_diagnostic_class,requested_issue_codes,requested_proposals,requested_auth_user_id) returning id into created;return query select 'ok',created,false;end;$f$;

create or replace function public.decide_guided_site_visit_intake_assignment(requested_auth_user_id uuid,requested_visit_id uuid,requested_attempt_id uuid,requested_review_id uuid,requested_item_id uuid,requested_criterion_key text,requested_decision text,requested_supersedes_event_id uuid,requested_expected_revision integer,requested_idempotency_key text)
returns table(result_code text,event_id uuid,next_revision integer,idempotent_replay boolean) language plpgsql security definer set search_path=pg_catalog,public as $f$
declare company uuid;visit public.guided_site_visits;attempt public.guided_site_visit_intake_attempts;review public.guided_site_visit_intake_classification_reviews;item public.guided_site_visit_items;existing public.guided_site_visit_intake_assignment_events;superseded public.guided_site_visit_intake_assignment_events;created uuid;nextv integer;active_count integer;
begin company:=public.guided_site_visit_actor_company(requested_auth_user_id);select * into existing from public.guided_site_visit_intake_assignment_events where company_id=company and idempotency_key=requested_idempotency_key;if existing.id is not null then if existing.visit_id=requested_visit_id and existing.intake_attempt_id=requested_attempt_id and existing.classification_review_id is not distinct from requested_review_id and existing.visit_item_id is not distinct from requested_item_id and existing.criterion_key is not distinct from requested_criterion_key and existing.decision=requested_decision and existing.supersedes_assignment_event_id is not distinct from requested_supersedes_event_id and existing.requested_expected_revision=requested_expected_revision and existing.decided_by_auth_user_id=requested_auth_user_id then return query select 'ok',existing.id,existing.resulting_visit_revision,true;else return query select 'idempotency_conflict',existing.id,null::integer,false;end if;return;end if;
 select * into visit from public.guided_site_visits where id=requested_visit_id and company_id=company for update;if visit.id is null then return query select 'not_found',null::uuid,null::integer,false;return;end if;if visit.revision<>requested_expected_revision then return query select 'stale_revision',null::uuid,visit.revision,false;return;end if;
 select * into attempt from public.guided_site_visit_intake_attempts where id=requested_attempt_id and visit_id=visit.id and company_id=company and state='confirmed';select * into review from public.guided_site_visit_intake_classification_reviews where id=requested_review_id and intake_attempt_id=attempt.id and company_id=company;select * into item from public.guided_site_visit_items where id=requested_item_id and visit_id=visit.id and company_id=company;
 if attempt.id is null or review.id is null or review.diagnostic_class<>'classified' or item.id is null or requested_decision not in('accepted','corrected','excluded') or not(public.guided_site_visit_visible_fact_keys(item.item_key)?requested_criterion_key) then return query select 'invalid_assignment',null::uuid,visit.revision,false;return;end if;
 if requested_decision='accepted' and not exists(select 1 from jsonb_array_elements(review.proposals)p where p->>'visitItemId'=item.id::text and p->>'criterionKey'=requested_criterion_key) then return query select 'proposal_mismatch',null::uuid,visit.revision,false;return;end if;
 if requested_supersedes_event_id is not null then select * into superseded from public.guided_site_visit_intake_assignment_events where id=requested_supersedes_event_id and company_id=company and visit_id=visit.id for update;if superseded.id is null or superseded.intake_attempt_id<>attempt.id or superseded.visit_item_id<>item.id or superseded.criterion_key<>requested_criterion_key or exists(select 1 from public.guided_site_visit_intake_assignment_events where supersedes_assignment_event_id=superseded.id) then return query select 'invalid_supersession',null::uuid,visit.revision,false;return;end if;end if;
 if requested_decision in('accepted','corrected') then select count(distinct asset_id) into active_count from (select p.asset_id from public.guided_site_visit_photo_attempts p where p.visit_item_id=item.id and p.state='confirmed' union select e.asset_id from public.guided_site_visit_intake_assignment_events e where e.visit_item_id=item.id and e.decision in('accepted','corrected') and not exists(select 1 from public.guided_site_visit_intake_assignment_events later where later.supersedes_assignment_event_id=e.id))s;if active_count>=5 and not exists(select 1 from public.guided_site_visit_intake_assignment_events e where e.visit_item_id=item.id and e.asset_id=attempt.asset_id and e.decision in('accepted','corrected') and not exists(select 1 from public.guided_site_visit_intake_assignment_events later where later.supersedes_assignment_event_id=e.id)) then return query select 'active_evidence_limit',null::uuid,visit.revision,false;return;end if;end if;
 nextv:=visit.revision+1;insert into public.guided_site_visit_intake_assignment_events(company_id,visit_id,batch_id,intake_attempt_id,asset_id,classification_review_id,visit_item_id,criterion_key,supersedes_assignment_event_id,decision,idempotency_key,requested_expected_revision,resulting_visit_revision,decided_by_auth_user_id) values(company,visit.id,attempt.batch_id,attempt.id,attempt.asset_id,review.id,item.id,requested_criterion_key,requested_supersedes_event_id,requested_decision,requested_idempotency_key,requested_expected_revision,nextv,requested_auth_user_id) returning id into created;update public.guided_site_visits set revision=nextv,updated_at=now() where id=visit.id;return query select 'ok',created,nextv,false;end;$f$;

revoke all on function public.create_guided_site_visit_intake_batch(uuid,uuid,uuid,text,text,jsonb),public.reserve_guided_site_visit_intake_member(uuid,uuid,uuid,integer,integer,text,uuid,uuid,text),public.confirm_guided_site_visit_intake_member(uuid,uuid,uuid,integer,bigint,text),public.fail_guided_site_visit_intake_member(uuid,uuid,uuid,integer),public.record_guided_site_visit_intake_classification(uuid,uuid,uuid,text,text,text,text,text,text,text,text,text[],jsonb),public.decide_guided_site_visit_intake_assignment(uuid,uuid,uuid,uuid,uuid,text,text,uuid,integer,text) from public,anon,authenticated;
grant execute on function public.create_guided_site_visit_intake_batch(uuid,uuid,uuid,text,text,jsonb),public.reserve_guided_site_visit_intake_member(uuid,uuid,uuid,integer,integer,text,uuid,uuid,text),public.confirm_guided_site_visit_intake_member(uuid,uuid,uuid,integer,bigint,text),public.fail_guided_site_visit_intake_member(uuid,uuid,uuid,integer),public.record_guided_site_visit_intake_classification(uuid,uuid,uuid,text,text,text,text,text,text,text,text,text[],jsonb),public.decide_guided_site_visit_intake_assignment(uuid,uuid,uuid,uuid,uuid,text,text,uuid,integer,text) to service_role;
comment on table public.guided_site_visit_intake_batches is 'Immutable Deck Guided Site Visit whole-visit intake manifest; no Mission Control events.';
comment on table public.guided_site_visit_intake_assignment_events is 'Append-only human evidence assignment decisions. AI proposals never confirm evidence.';
commit;
