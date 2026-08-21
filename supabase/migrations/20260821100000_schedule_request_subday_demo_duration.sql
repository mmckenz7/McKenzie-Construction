begin;

create or replace function public.submit_schedule_request_by_token(
  requested_token uuid,
  requested_language text,
  requested_earliest_demo_start date,
  requested_earliest_construction_start date,
  requested_demo_duration_days integer,
  requested_total_duration_days integer,
  requested_notes text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  request_record public.subcontractor_schedule_requests;
begin
  select *
  into request_record
  from public.subcontractor_schedule_requests
  where secure_token = requested_token
  for update;

  if request_record.id is null then
    return jsonb_build_object('success', false);
  end if;

  if request_record.status = 'submitted'
    or request_record.submitted_at is not null
  then
    return jsonb_build_object(
      'success', false,
      'already_submitted', true
    );
  end if;

  if request_record.status in ('cancelled', 'expired')
    or (
      request_record.expires_at is not null
      and request_record.expires_at < now()
    )
  then
    return jsonb_build_object('success', false);
  end if;

  if requested_language not in ('en', 'es')
    or requested_earliest_demo_start is null
    or requested_earliest_construction_start is null
    or requested_demo_duration_days not between 0 and 30
    or requested_total_duration_days not between greatest(requested_demo_duration_days, 1) and 120
    or length(coalesce(requested_notes, '')) > 4000
  then
    return jsonb_build_object('success', false);
  end if;

  update public.subcontractor_schedule_requests
  set
    language = requested_language,
    earliest_demo_start = requested_earliest_demo_start,
    earliest_construction_start = requested_earliest_construction_start,
    demo_duration_days = requested_demo_duration_days,
    total_duration_days = requested_total_duration_days,
    notes_original = nullif(btrim(requested_notes), ''),
    notes_language = case
      when nullif(btrim(requested_notes), '') is null then null
      else requested_language
    end,
    translation_status = case
      when requested_language = 'es'
        and nullif(btrim(requested_notes), '') is not null
      then 'pending'
      else 'not_requested'
    end,
    submitted_at = now(),
    status = 'submitted'
  where id = request_record.id;

  return jsonb_build_object('success', true);
end;
$$;

revoke all on function public.submit_schedule_request_by_token(uuid, text, date, date, integer, integer, text)
  from public, anon, authenticated;
grant execute on function public.submit_schedule_request_by_token(uuid, text, date, date, integer, integer, text)
  to service_role;

commit;
