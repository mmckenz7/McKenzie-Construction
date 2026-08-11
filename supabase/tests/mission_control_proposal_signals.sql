begin;

do $$
declare
  test_app_user_id uuid;
  test_lead_id uuid;
  expiring_estimate_id uuid;
  expired_estimate_id uuid;
  expiring_proposal_id uuid;
  expired_proposal_id uuid;
  evaluation_time timestamptz := now();
  later_evaluation_time timestamptz;
  active_signal_count bigint;
  pricing_task_count bigint;
begin
  select id
  into test_app_user_id
  from public.app_users
  where is_active
  order by created_at, id
  limit 1;

  if test_app_user_id is null then
    raise exception 'Proposal signal test requires one active app user fixture.';
  end if;

  insert into public.leads (
    name,
    phone,
    description,
    lead_status,
    is_active
  ) values (
    'Mission Control signal test lead',
    '555-0100',
    'Deterministic proposal signal test',
    'new',
    true
  )
  returning id into test_lead_id;

  insert into public.estimates (lead_id, title, status)
  values (
    test_lead_id,
    'Mission Control expiring proposal test',
    'sent'
  )
  returning id into expiring_estimate_id;

  insert into public.estimate_proposals (
    estimate_id,
    lead_id,
    public_token,
    status,
    snapshot,
    customer_name,
    expires_at,
    issued_at,
    created_by_app_user_id
  ) values (
    expiring_estimate_id,
    test_lead_id,
    gen_random_uuid(),
    'issued',
    '{}'::jsonb,
    'Expiring proposal test customer',
    evaluation_time + interval '12 hours',
    evaluation_time - interval '2 days',
    test_app_user_id
  )
  returning id into expiring_proposal_id;

  insert into public.estimates (lead_id, title, status)
  values (
    test_lead_id,
    'Mission Control expired proposal test',
    'sent'
  )
  returning id into expired_estimate_id;

  insert into public.estimate_proposals (
    estimate_id,
    lead_id,
    public_token,
    status,
    snapshot,
    customer_name,
    expires_at,
    issued_at,
    created_by_app_user_id
  ) values (
    expired_estimate_id,
    test_lead_id,
    gen_random_uuid(),
    'issued',
    '{}'::jsonb,
    'Expired proposal test customer',
    evaluation_time - interval '1 hour',
    evaluation_time - interval '2 days',
    test_app_user_id
  )
  returning id into expired_proposal_id;

  perform public.evaluate_mission_control_proposal_signals(evaluation_time);
  perform public.evaluate_mission_control_proposal_signals(evaluation_time);

  select count(*)
  into active_signal_count
  from public.mission_control_signals
  where subject_id in (expiring_proposal_id, expired_proposal_id)
    and status = 'open'
    and (
      (
        subject_id = expiring_proposal_id
        and rule_key = 'estimating.proposal_expiring_soon'
      )
      or (
        subject_id = expired_proposal_id
        and rule_key = 'estimating.proposal_pricing_review_required'
      )
    );

  if active_signal_count <> 2 then
    raise exception 'Expected two active proposal signals; found %.', active_signal_count;
  end if;

  if not exists (
    select 1
    from public.mission_control_signals as signal
    where signal.subject_id = expiring_proposal_id
      and signal.rule_key = 'estimating.proposal_expiring_soon'
      and jsonb_array_length(signal.evidence -> 'event_ids') = 1
      and (signal.evidence ->> 'proposal_generation')::integer = 1
      and (signal.rule_output ->> 'hours_until_expiry')::numeric between 11 and 12
  ) then
    raise exception 'Expiring proposal signal lacks deterministic evidence.';
  end if;

  if not exists (
    select 1
    from public.estimate_proposals
    where id = expired_proposal_id
      and status = 'expired'
  ) then
    raise exception 'Scheduled evaluation did not expire the due proposal.';
  end if;

  if not exists (
    select 1
    from public.business_events
    where subject_id = expired_proposal_id
      and event_name = 'estimating.proposal_expired'
      and occurred_at = evaluation_time - interval '1 hour'
  ) then
    raise exception 'Scheduled expiration lacks its authoritative business event.';
  end if;

  select count(*)
  into pricing_task_count
  from public.lead_tasks
  where lead_id = test_lead_id::text
    and task_type = 'estimate_pricing_review'
    and metadata @> jsonb_build_object('estimate_id', expired_estimate_id);

  if pricing_task_count <> 1 then
    raise exception 'Pricing-review task replay produced % tasks.', pricing_task_count;
  end if;

  update public.estimate_proposals
  set
    status = 'accepted',
    responded_at = now(),
    response = 'accepted',
    response_name = 'Expiring proposal test customer',
    acknowledged_nonbinding = true,
    response_agreement_text = 'Test nonbinding acknowledgement.'
  where id = expiring_proposal_id;

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
  where id = expired_proposal_id;

  -- now() is transaction-stable; advance explicitly so the monotonic-time
  -- guard is exercised inside this single rollback-only integration test.
  later_evaluation_time := evaluation_time + interval '1 second';
  perform public.evaluate_mission_control_proposal_signals(
    later_evaluation_time
  );

  if not exists (
    select 1
    from public.mission_control_signals
    where subject_id = expiring_proposal_id
      and rule_key = 'estimating.proposal_expiring_soon'
      and status = 'resolved'
      and resolution_reason = 'proposal_no_longer_expiring_soon'
  ) then
    raise exception 'Accepted proposal did not resolve its expiry signal.';
  end if;

  if not exists (
    select 1
    from public.mission_control_signals
    where subject_id = expired_proposal_id
      and rule_key = 'estimating.proposal_pricing_review_required'
      and status = 'resolved'
      and resolution_reason = 'proposal_no_longer_requires_pricing_review'
  ) then
    raise exception 'Reissued proposal did not resolve its pricing signal.';
  end if;

  if not exists (
    select 1
    from public.lead_tasks
    where lead_id = test_lead_id::text
      and task_type = 'estimate_pricing_review'
      and status = 'completed'
      and metadata @> jsonb_build_object('estimate_id', expired_estimate_id)
  ) then
    raise exception 'Reissue did not complete the pricing-review task.';
  end if;

  begin
    perform public.evaluate_mission_control_proposal_signals(evaluation_time);
    raise exception 'Expected backwards evaluation time to fail closed.';
  exception
    when others then
      if sqlerrm not like
        'Mission Control proposal evaluation time cannot move backwards.%'
      then
        raise;
      end if;
  end;
end
$$;

rollback;
