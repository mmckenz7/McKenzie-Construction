-- Public-token predeployment rollback/audit snapshot
-- Captured read-only from the linked live Supabase project on 2026-08-01 UTC.
-- Project ref: jjvxtwqewpiddhoedwkn
-- Source: `supabase db dump --linked --schema public`.
--
-- This file is evidence and a rollback prerequisite. Do not run it as a
-- migration. No live database changes were made while capturing it.

-- Live ACL snapshot before migrations 20260801080000 and 20260801090000.
-- All eight functions have EXECUTE through the default PUBLIC function ACL.
-- The live dump also contains explicit `GRANT ALL` for each function to anon,
-- authenticated, and service_role.
--
-- public.get_change_order_by_token(uuid)
-- public.get_change_order_vendor_request_by_token(uuid)
-- public.get_material_review_by_token(uuid)
-- public.get_schedule_request_by_token(uuid)
-- public.submit_change_order_response(uuid, text, text, text, text)
-- public.submit_change_order_response_v2(uuid, text, text, text, text, text, boolean)
-- public.submit_change_order_vendor_response(uuid, text, text, text, text, numeric, date, date, integer, integer, date, text, text, jsonb, text, text)
-- public.submit_schedule_request_by_token(uuid, text, date, date, integer, integer, text)

-- Exact live pre-hardening definition of submit_schedule_request_by_token.
CREATE OR REPLACE FUNCTION public.submit_schedule_request_by_token(
  requested_token uuid,
  requested_language text,
  requested_earliest_demo_start date,
  requested_earliest_construction_start date,
  requested_demo_duration_days integer,
  requested_total_duration_days integer,
  requested_notes text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  request_record public.subcontractor_schedule_requests;
begin
  select *
  into request_record
  from public.subcontractor_schedule_requests
  where secure_token = requested_token
  limit 1;

  if request_record.id is null then
    return jsonb_build_object(
      'success', false,
      'error', 'Schedule request not found.'
    );
  end if;

  if (
    request_record.expires_at is not null
    and request_record.expires_at < now()
  ) then
    update public.subcontractor_schedule_requests
    set status = 'expired'
    where id = request_record.id;

    return jsonb_build_object(
      'success', false,
      'error', 'This schedule request has expired.'
    );
  end if;

  if request_record.status in ('cancelled', 'expired') then
    return jsonb_build_object(
      'success', false,
      'error', 'This schedule request is no longer active.'
    );
  end if;

  if requested_language not in ('en', 'es') then
    return jsonb_build_object(
      'success', false,
      'error', 'Invalid language selection.'
    );
  end if;

  if requested_earliest_demo_start is null then
    return jsonb_build_object(
      'success', false,
      'error', 'Earliest demo start is required.'
    );
  end if;

  if requested_earliest_construction_start is null then
    return jsonb_build_object(
      'success', false,
      'error', 'Earliest construction start is required.'
    );
  end if;

  if requested_demo_duration_days is null then
    return jsonb_build_object(
      'success', false,
      'error', 'Demo duration is required.'
    );
  end if;

  if requested_total_duration_days is null then
    return jsonb_build_object(
      'success', false,
      'error', 'Total duration is required.'
    );
  end if;

  update public.subcontractor_schedule_requests
  set
    language = requested_language,
    earliest_demo_start = requested_earliest_demo_start,
    earliest_construction_start = requested_earliest_construction_start,
    demo_duration_days = requested_demo_duration_days,
    total_duration_days = requested_total_duration_days,
    notes_original = nullif(trim(requested_notes), ''),
    notes_language = case
      when nullif(trim(requested_notes), '') is null then null
      else requested_language
    end,
    translation_status = case
      when requested_language = 'es'
        and nullif(trim(requested_notes), '') is not null
      then 'pending'
      else 'not_requested'
    end,
    submitted_at = now(),
    status = 'submitted'
  where id = request_record.id;

  return jsonb_build_object(
    'success', true,
    'request_id', request_record.id
  );
end;
$$;

-- Exact ACL restoration prerequisite for all eight functions. The live dump
-- spells the role grants as GRANT ALL; for functions, ALL currently means
-- EXECUTE. PUBLIC is stated explicitly here because pg_dump represents its
-- default EXECUTE privilege by omitting a revoke.
GRANT ALL ON FUNCTION public.get_change_order_by_token(uuid)
  TO PUBLIC, anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.get_change_order_vendor_request_by_token(uuid)
  TO PUBLIC, anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.get_material_review_by_token(uuid)
  TO PUBLIC, anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.get_schedule_request_by_token(uuid)
  TO PUBLIC, anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.submit_change_order_response(uuid, text, text, text, text)
  TO PUBLIC, anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.submit_change_order_response_v2(uuid, text, text, text, text, text, boolean)
  TO PUBLIC, anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.submit_change_order_vendor_response(uuid, text, text, text, text, numeric, date, date, integer, integer, date, text, text, jsonb, text, text)
  TO PUBLIC, anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.submit_schedule_request_by_token(uuid, text, date, date, integer, integer, text)
  TO PUBLIC, anon, authenticated, service_role;
