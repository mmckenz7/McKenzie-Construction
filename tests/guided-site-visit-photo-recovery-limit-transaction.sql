begin;
do $test$ declare company uuid; auth_id uuid:='74000000-0000-4000-8000-000000000001'; lead_id uuid:='74000000-0000-4000-8000-000000000002'; estimate_id uuid:='74000000-0000-4000-8000-000000000003'; outcome record; item_id uuid; visit uuid; case_id uuid; rev integer; attempt uuid; asset uuid; i integer;
begin
 select id into strict company from public.company_settings;
 insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)values(auth_id,'authenticated','authenticated','recovery@example.invalid','{}','{}',now(),now());
 insert into public.app_users(auth_user_id,company_id,display_name,email,role,default_portal,preferred_language,is_active,permissions,metadata)values(auth_id,company,'Recovery','recovery@example.invalid','estimator','sales','en',true,'{"capture_site_visits":true}'::jsonb,'{}');
 insert into public.leads(id,name,phone,description,status)values(lead_id,'Recovery lead','555-0101','Deck','new');
 insert into public.estimates(id,lead_id,title,status,calculation_policy_version,calculation_revision,overhead_percent,profit_markup_percent,tax_rate_percent,discount_type,discount_value,costs_complete,prices_complete)values(estimate_id,lead_id,'Recovery estimate','draft','structured-estimate-v2-material-tax',0,0,0,0,'fixed_amount',0,true,true);
 select * into outcome from public.start_guided_deck_site_visit(auth_id,estimate_id,true);visit:=outcome.visit_id;rev:=outcome.revision;
 select v.case_id,i.id into case_id,item_id from public.guided_site_visits v join public.guided_site_visit_items i on i.visit_id=v.id where v.id=visit and i.ordinal=1;
 for i in 1..6 loop
   attempt:=gen_random_uuid();asset:=gen_random_uuid();
   select * into outcome from public.reserve_guided_site_visit_photo(auth_id,visit,item_id,rev,attempt,asset,company::text||'/'||case_id::text||'/'||asset::text||'/failed.jpg','failed.jpg','image/jpeg',128,repeat('a',64),null);
   if outcome.result_code<>'ok' then raise exception 'abandoned reservation % rejected: %',i,outcome.result_code;end if;rev:=outcome.next_revision;
   select * into outcome from public.fail_guided_site_visit_photo_reservation(auth_id,visit,attempt,rev);if outcome.result_code<>'ok' then raise exception 'abandon % failed',i;end if;rev:=outcome.next_revision;
 end loop;
 attempt:=gen_random_uuid();asset:=gen_random_uuid();select * into outcome from public.reserve_guided_site_visit_photo(auth_id,visit,item_id,rev,attempt,asset,company::text||'/'||case_id::text||'/'||asset::text||'/success.jpg','success.jpg','image/jpeg',128,repeat('b',64),null);
 if outcome.result_code<>'ok' then raise exception 'reservation after six abandoned uploads failed: %',outcome.result_code;end if;
 if (select count(*) from public.guided_site_visit_photo_attempts where visit_item_id=item_id and state='failed_validation')<>6 then raise exception 'failed evidence rows were not preserved';end if;
 select * into outcome from public.fail_guided_site_visit_photo_reservation(auth_id,visit,attempt,outcome.next_revision);rev:=outcome.next_revision;
 for i in 1..5 loop
   attempt:=gen_random_uuid();asset:=gen_random_uuid();
   insert into public.ai_estimator_assets(id,company_id,case_id,asset_kind,origin,storage_bucket,storage_path,original_filename,mime_type,declared_byte_size,declared_sha256,status,created_by_auth_user_id)
   values(asset,company,case_id,'photo','user_upload','ai-estimator-private',company::text||'/'||case_id::text||'/'||asset::text||'/meaningful.jpg','meaningful.jpg','image/jpeg',128,repeat('c',64),'available',auth_id);
   insert into public.guided_site_visit_photo_attempts(id,company_id,visit_id,visit_item_id,case_id,asset_id,ordinal,state,confirmed_by_auth_user_id,confirmed_at)
   values(attempt,company,visit,item_id,case_id,asset,7+i,'superseded',auth_id,now());
 end loop;
 attempt:=gen_random_uuid();asset:=gen_random_uuid();select * into outcome from public.reserve_guided_site_visit_photo(auth_id,visit,item_id,rev,attempt,asset,company::text||'/'||case_id::text||'/'||asset::text||'/sixth.jpg','sixth.jpg','image/jpeg',128,repeat('d',64),null);
 if outcome.result_code<>'attempt_limit_reached' then raise exception 'five meaningful attempts were not limited: %',outcome.result_code;end if;
end $test$;
rollback;
