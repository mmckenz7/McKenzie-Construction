begin;

insert into public.customers (
  id,
  customer_name
) values (
  'a1200000-0000-4000-8000-000000000001',
  'Schedule notes contract test'
);

insert into public.projects (
  id,
  customer_id,
  project_name
) values (
  'a1200000-0000-4000-8000-000000000002',
  'a1200000-0000-4000-8000-000000000001',
  'Schedule notes contract test'
);

insert into public.team_members (
  id,
  name,
  roles
) values (
  'a1200000-0000-4000-8000-000000000003',
  'Schedule notes contract test',
  array['subcontractor']::text[]
);

insert into public.subcontractor_schedule_requests (
  id,
  project_id,
  subcontractor_id,
  secure_token,
  status,
  expires_at
) values (
  'a1200000-0000-4000-8000-000000000004',
  'a1200000-0000-4000-8000-000000000002',
  'a1200000-0000-4000-8000-000000000003',
  'a1200000-0000-4000-8000-000000000005',
  'pending',
  now() + interval '1 day'
);

do $$
declare
  first_result jsonb;
  replay_result jsonb;
  activity_description text;
begin
  first_result := public.submit_schedule_request_by_token(
    'a1200000-0000-4000-8000-000000000005',
    'en',
    current_date + 1,
    current_date + 2,
    2,
    10,
    'Schedule notes contract test'
  );

  if first_result ->> 'success' is distinct from 'true' then
    raise exception 'Expected the first schedule submission to succeed.';
  end if;

  select description
  into activity_description
  from public.project_activity
  where activity_type = 'schedule_response_submitted'
    and source_table = 'subcontractor_schedule_requests'
    and source_id = 'a1200000-0000-4000-8000-000000000004';

  if activity_description is distinct from 'Schedule notes contract test' then
    raise exception 'Expected schedule activity to use notes_original.';
  end if;

  replay_result := public.submit_schedule_request_by_token(
    'a1200000-0000-4000-8000-000000000005',
    'en',
    current_date + 1,
    current_date + 2,
    2,
    10,
    'Schedule notes contract replay'
  );

  if replay_result ->> 'already_submitted' is distinct from 'true' then
    raise exception 'Expected replay protection to reject a second submission.';
  end if;
end
$$;

rollback;
