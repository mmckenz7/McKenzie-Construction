begin;

do $$
declare
  test_app_user_id uuid;
  test_auth_user_id uuid;
  first_estimate_id uuid;
  second_estimate_id uuid;
  first_proposal_id uuid;
  second_proposal_id uuid;
  first_token uuid := gen_random_uuid();
  second_token uuid := gen_random_uuid();
  access_id_value uuid := gen_random_uuid();
  event_count bigint;
  access_count bigint;
  first_generation integer;
  revoked_actor_id uuid;
begin
  select id, auth_user_id
  into test_app_user_id, test_auth_user_id
  from public.app_users
  where is_active
  order by created_at, id
  limit 1;

  if test_app_user_id is null or test_auth_user_id is null then
    raise exception 'Proposal event test requires one active app user fixture.';
  end if;

  insert into public.estimates (title, status)
  values ('Mission Control proposal event test', 'draft')
  returning id into first_estimate_id;

  insert into public.estimate_proposals (
    estimate_id,
    public_token,
    status,
    snapshot,
    customer_name,
    expires_at,
    issued_at,
    created_by_app_user_id
  ) values (
    first_estimate_id,
    first_token,
    'issued',
    '{}'::jsonb,
    'Proposal event test customer',
    now() + interval '1 day',
    now() - interval '2 days',
    test_app_user_id
  )
  returning id into first_proposal_id;

  perform public.get_estimate_proposal_by_token(first_token, access_id_value);
  perform public.get_estimate_proposal_by_token(first_token, access_id_value);

  select count(*)
  into access_count
  from public.estimate_proposal_accesses
  where proposal_id = first_proposal_id
    and access_id = access_id_value;

  if access_count <> 1 then
    raise exception 'Access replay created % rows.', access_count;
  end if;

  update public.estimate_proposals
  set
    status = 'expired',
    expires_at = now() - interval '1 day'
  where id = first_proposal_id;

  update public.estimate_proposals
  set
    status = 'issued',
    public_token = gen_random_uuid(),
    issued_at = now(),
    expires_at = now() + interval '30 days',
    opened_at = null,
    responded_at = null,
    response = null,
    response_name = null,
    response_notes = null,
    acknowledged_nonbinding = false,
    response_agreement_text = null,
    revoked_at = null,
    revoked_by_app_user_id = null,
    created_by_app_user_id = test_app_user_id
  where id = first_proposal_id;

  select issue_generation
  into first_generation
  from public.estimate_proposals
  where id = first_proposal_id;

  if first_generation <> 2 then
    raise exception 'Reissue generation was %, expected 2.', first_generation;
  end if;

  update public.estimate_proposals
  set
    status = 'accepted',
    responded_at = now(),
    response = 'accepted',
    response_name = 'Proposal event test customer',
    acknowledged_nonbinding = true,
    response_agreement_text = 'Test nonbinding acknowledgement.'
  where id = first_proposal_id;

  insert into public.estimates (title, status)
  values ('Mission Control proposal revocation test', 'sent')
  returning id into second_estimate_id;

  insert into public.estimate_proposals (
    estimate_id,
    public_token,
    status,
    snapshot,
    customer_name,
    expires_at,
    issued_at,
    created_by_app_user_id
  ) values (
    second_estimate_id,
    second_token,
    'issued',
    '{}'::jsonb,
    'Proposal revocation test customer',
    now() + interval '30 days',
    now(),
    test_app_user_id
  )
  returning id into second_proposal_id;

  perform public.revoke_estimate_proposal(
    second_estimate_id,
    test_app_user_id
  );

  select actor_id
  into revoked_actor_id
  from public.business_events
  where subject_id = second_proposal_id
    and event_name = 'estimating.proposal_revoked';

  if revoked_actor_id is distinct from test_app_user_id then
    raise exception 'Proposal revocation actor was not attributed.';
  end if;

  select count(*)
  into event_count
  from public.business_events
  where subject_id in (first_proposal_id, second_proposal_id)
    and event_name in (
      'estimating.proposal_issued',
      'estimating.proposal_access_observed',
      'estimating.proposal_expired',
      'estimating.proposal_reissued',
      'estimating.proposal_accepted',
      'estimating.proposal_revoked'
    );

  if event_count <> 7 then
    raise exception 'Proposal lifecycle produced % events, expected 7.', event_count;
  end if;

  if not exists (
    select 1
    from public.business_events
    where subject_id = first_proposal_id
      and event_name = 'estimating.proposal_access_observed'
      and actor_type = 'integration'
      and metadata ->> 'client_signal' = 'server_request'
      and metadata -> 'suspected_automated' = 'null'::jsonb
  ) then
    raise exception 'Proposal access evidence overstates or omits the observed request.';
  end if;

  if not exists (
    select 1
    from public.business_events
    where subject_id = first_proposal_id
      and event_name = 'estimating.proposal_reissued'
      and (metadata ->> 'previous_proposal_generation')::integer = 1
      and (metadata ->> 'proposal_generation')::integer = 2
  ) then
    raise exception 'Proposal reissue event lacks generation evidence.';
  end if;
end
$$;

rollback;
