begin;
create or replace function public.reserve_guided_site_visit_photo(
 requested_auth_user_id uuid,requested_visit_id uuid,requested_item_id uuid,requested_expected_revision integer,
 requested_attempt_id uuid,requested_asset_id uuid,requested_storage_path text,requested_filename text,
 requested_mime_type text,requested_byte_size bigint,requested_sha256 text,requested_retake_of_attempt_id uuid default null
)
returns table(result_code text,next_revision integer)
language plpgsql security invoker set search_path=pg_catalog,public as $function$
declare company uuid; visit public.guided_site_visits; item public.guided_site_visit_items; next_value integer;
 next_ordinal integer; meaningful_attempt_count integer; reservation_count integer;
begin
 company:=public.guided_site_visit_actor_company(requested_auth_user_id);
 if company is null then return query select 'forbidden',null::integer;return;end if;
 select * into visit from public.guided_site_visits where id=requested_visit_id and company_id=company for update;
 if visit.id is null then return query select 'not_found',null::integer;return;end if;
 if visit.status<>'in_progress' then return query select 'not_editable',visit.revision;return;end if;
 if visit.revision<>requested_expected_revision then return query select 'stale_revision',visit.revision;return;end if;
 select * into item from public.guided_site_visit_items where id=requested_item_id and visit_id=visit.id and company_id=company;
 if item.id is null then return query select 'not_found',visit.revision;return;end if;
 if requested_mime_type not in ('image/jpeg','image/png','image/webp','image/heic','image/heif') or requested_byte_size not between 1 and 15728640
   or requested_sha256 !~ '^[0-9a-f]{64}$' or requested_storage_path not like company::text||'/'||visit.case_id::text||'/'||requested_asset_id::text||'/%'
   then return query select 'invalid_photo',visit.revision;return;end if;
 if requested_retake_of_attempt_id is not null and not exists(select 1 from public.guided_site_visit_photo_attempts where id=requested_retake_of_attempt_id and visit_item_id=item.id and state='confirmed') then return query select 'invalid_retake',visit.revision;return;end if;
 if requested_retake_of_attempt_id is null and exists(select 1 from public.guided_site_visit_photo_attempts where visit_item_id=item.id and state in ('upload_pending','quarantined','confirmed')) then return query select 'current_photo_exists',visit.revision;return;end if;
 if requested_retake_of_attempt_id is not null and exists(select 1 from public.guided_site_visit_photo_attempts where visit_item_id=item.id and state in ('upload_pending','quarantined')) then return query select 'retake_in_progress',visit.revision;return;end if;
 select coalesce(max(ordinal),0)+1,count(*) filter(where state in ('confirmed','superseded')),count(*)
 into next_ordinal,meaningful_attempt_count,reservation_count from public.guided_site_visit_photo_attempts where visit_item_id=item.id;
 if meaningful_attempt_count>=5 then return query select 'attempt_limit_reached',visit.revision;return;end if;
 if reservation_count>=25 then return query select 'recovery_limit_reached',visit.revision;return;end if;
 insert into public.ai_estimator_assets(id,company_id,case_id,asset_kind,origin,storage_bucket,storage_path,original_filename,mime_type,declared_byte_size,declared_sha256,status,created_by_auth_user_id)
 values(requested_asset_id,company,visit.case_id,'photo','user_upload','ai-estimator-private',requested_storage_path,requested_filename,requested_mime_type,requested_byte_size,requested_sha256,'upload_pending',requested_auth_user_id);
 insert into public.guided_site_visit_photo_attempts(id,company_id,visit_id,visit_item_id,case_id,asset_id,retake_of_attempt_id,ordinal)
 values(requested_attempt_id,company,visit.id,item.id,visit.case_id,requested_asset_id,requested_retake_of_attempt_id,next_ordinal);
 next_value:=visit.revision+1;update public.guided_site_visits set revision=next_value,updated_at=now() where id=visit.id;
 return query select 'ok',next_value;
exception when unique_violation or check_violation or invalid_text_representation then return query select 'invalid_photo',visit.revision;
end $function$;
revoke all on function public.reserve_guided_site_visit_photo(uuid,uuid,uuid,integer,uuid,uuid,text,text,text,bigint,text,uuid) from public,anon,authenticated;
grant execute on function public.reserve_guided_site_visit_photo(uuid,uuid,uuid,integer,uuid,uuid,text,text,text,bigint,text,uuid) to service_role;
comment on function public.reserve_guided_site_visit_photo(uuid,uuid,uuid,integer,uuid,uuid,text,text,text,bigint,text,uuid) is 'Allows five confirmed/superseded photos per item. Failed upload evidence does not consume that allowance; all reservations remain append-only and a 25-row safety ceiling bounds abuse.';
commit;
