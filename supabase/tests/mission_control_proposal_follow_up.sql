begin;

do $$
declare
  test_app_user_id uuid;
  test_lead_id uuid;
  test_estimate_id uuid;
  test_proposal_id uuid;
  test_token uuid := gen_random_uuid();
  first_access_id uuid := gen_random_uuid();
  second_access_id uuid := gen_random_uuid();
  evaluation_time timestamptz := now();
  later_evaluation_time timestamptz := now() + interval '1 second';
begin
  select id
  into test_app_user_id
  from public.app_users
  where is_active
  order by created_at, id
  limit 1;

  if test_app_user_id is null then
    raise exception 'Proposal follow-up test requires one active app user fixture.';
  end if;

  insert into public.leads (name, phone, description, lead_status)
  values (
    'Mission Control follow-up test lead',
    '555-0102',
    'Deterministic proposal follow-up test',
    'new'
  )
  returning id into test_lead_id;

  insert into public.estimates (lead_id, title, status)
  values (test_lead_id, 'Mission Control proposal follow-up test', 'sent')
  returning id into test_estimate_id;

  insert into public.estimate_proposals (
    estimate_id, lead_id, public_token, status, snapshot, customer_name,
    expires_at, issued_at, created_by_app_user_id
  ) values (
    test_estimate_id,
    test_lead_id,
    test_token,
    'issued',
    '{}'::jsonb,
    'Proposal follow-up customer',
    evaluation_time + interval '10 days',
    evaluation_time - interval '4 days',
    test_app_user_id
  )
  returning id into test_proposal_id;

  perform public.confirm_estimate_proposal_browser_access(test_token, first_access_id);
  perform public.confirm_estimate_proposal_browser_access(test_token, first_access_id);
  perform public.confirm_estimate_proposal_browser_access(test_token, second_access_id);

  if (
    select count(*)
    from public.estimate_proposal_accesses
    where proposal_id = test_proposal_id
      and client_signal = 'browser_confirmation'
      and suspected_automated = false
  ) <> 2 then
    raise exception 'Browser access confirmation was not retry-idempotent.';
  end if;

  if (
    select count(*)
    from public.business_events
    where event_name = 'estimating.proposal_access_observed'
      and subject_id = test_proposal_id
      and metadata ->> 'client_signal' = 'browser_confirmation'
      and metadata ->> 'suspected_automated' = 'false'
  ) <> 2 then
    raise exception 'Browser access observations did not produce two exact facts.';
  end if;

  perform public.evaluate_mission_control_proposal_follow_up_signals(evaluation_time);
  perform public.evaluate_mission_control_proposal_follow_up_signals(evaluation_time);

  if (
    select count(*)
    from public.mission_control_signals
    where rule_key = 'estimating.proposal_follow_up_opportunity'
      and subject_id = test_proposal_id
      and status = 'open'
      and rule_output ->> 'browser_access_observation_count' = '2'
      and rule_output ->> 'verified_human_view' = 'false'
      and jsonb_array_length(evidence -> 'event_ids') = 3
  ) <> 1 then
    raise exception 'Expected one evidence-backed proposal follow-up signal.';
  end if;

  update public.estimate_proposals
  set
    status = 'accepted',
    responded_at = evaluation_time + interval '500 milliseconds',
    response = 'accepted',
    response_name = 'Proposal follow-up customer',
    acknowledged_nonbinding = true,
    response_agreement_text = 'Nonbinding estimate response test'
  where id = test_proposal_id;

  perform public.evaluate_mission_control_proposal_follow_up_signals(later_evaluation_time);

  if not exists (
    select 1
    from public.mission_control_signals
    where rule_key = 'estimating.proposal_follow_up_opportunity'
      and subject_id = test_proposal_id
      and status = 'resolved'
      and resolution_reason = 'proposal_no_longer_needs_follow_up'
  ) then
    raise exception 'Proposal response did not resolve follow-up signal.';
  end if;

  begin
    perform public.evaluate_mission_control_proposal_follow_up_signals(evaluation_time);
    raise exception 'Expected backwards proposal follow-up evaluation to fail closed.';
  exception
    when others then
      if sqlerrm not like 'Mission Control proposal follow-up evaluation time cannot move backwards.%' then
        raise;
      end if;
  end;
end
$$;

rollback;
