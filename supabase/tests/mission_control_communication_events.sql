begin;

do $$
declare
  test_app_user_id uuid;
  test_auth_user_id uuid;
  test_lead_id uuid;
  test_thread_id uuid;
  inbound_message_id uuid;
  outbound_message_id uuid;
  evaluation_time timestamptz := now();
  later_evaluation_time timestamptz := now() + interval '1 second';
begin
  select id, auth_user_id
  into test_app_user_id, test_auth_user_id
  from public.app_users
  where is_active
  order by created_at, id
  limit 1;

  if test_app_user_id is null then
    raise exception 'Communication event test requires one active app user fixture.';
  end if;

  insert into public.leads (name, phone, description, lead_status)
  values (
    'Mission Control communication test lead',
    '555-0101',
    'Deterministic unanswered email test',
    'new'
  )
  returning id into test_lead_id;

  insert into public.communication_threads (
    provider, provider_thread_id, subject, department, status, lead_id,
    participant_addresses, unread_count, last_message_at
  ) values (
    'microsoft_graph',
    concat('mission-control-test-', gen_random_uuid()),
    'Sensitive subject excluded from events',
    'sales',
    'open',
    test_lead_id::text,
    array['customer@example.com', 'company@example.com'],
    1,
    evaluation_time - interval '25 hours'
  )
  returning id into test_thread_id;

  insert into public.communication_messages (
    channel, direction, sender, recipient, subject, body, status, provider,
    provider_message_id, lead_id, received_at, thread_id, is_read, department,
    metadata
  ) values (
    'email',
    'inbound',
    'customer@example.com',
    'company@example.com',
    'Sensitive subject excluded from events',
    'Sensitive body excluded from events',
    'received',
    'microsoft_graph',
    concat('inbound-', gen_random_uuid()),
    test_lead_id::text,
    evaluation_time - interval '25 hours',
    test_thread_id,
    false,
    'sales',
    '{}'::jsonb
  )
  returning id into inbound_message_id;

  if not exists (
    select 1
    from public.business_events
    where event_name = 'communication.customer_email_received'
      and subject_id = inbound_message_id
      and actor_type = 'customer'
      and lead_id = test_lead_id
      and source = 'microsoft_graph.inbox_sync'
      and metadata ->> 'identity_matched' = 'true'
      and metadata::text not like '%Sensitive%'
      and metadata::text not like '%customer@example.com%'
  ) then
    raise exception 'Inbound email fact was not recorded with safe evidence.';
  end if;

  perform public.evaluate_mission_control_communication_signals(evaluation_time);
  perform public.evaluate_mission_control_communication_signals(evaluation_time);

  if (
    select count(*)
    from public.mission_control_signals
    where rule_key = 'communication.customer_reply_unanswered'
      and subject_id = test_thread_id
      and status = 'open'
  ) <> 1 then
    raise exception 'Expected one idempotent unanswered customer reply signal.';
  end if;

  if not exists (
    select 1
    from public.mission_control_signals
    where rule_key = 'communication.customer_reply_unanswered'
      and subject_id = test_thread_id
      and evidence ->> 'inbound_message_id' = inbound_message_id::text
      and jsonb_array_length(evidence -> 'event_ids') = 1
      and rule_output ->> 'reply_threshold_hours' = '24'
  ) then
    raise exception 'Unanswered reply signal is missing deterministic evidence.';
  end if;

  insert into public.communication_messages (
    channel, direction, sender, recipient, subject, body, status, provider,
    provider_message_id, lead_id, sent_at, thread_id, is_read, department,
    metadata
  ) values (
    'email',
    'outbound',
    'company@example.com',
    'customer@example.com',
    'Re: Sensitive subject excluded from events',
    'Sensitive response excluded from events',
    'sent',
    'resend',
    concat('outbound-', gen_random_uuid()),
    test_lead_id::text,
    evaluation_time + interval '500 milliseconds',
    test_thread_id,
    true,
    'sales',
    jsonb_build_object('sent_by_team_member_id', test_app_user_id)
  )
  returning id into outbound_message_id;

  if not exists (
    select 1
    from public.business_events
    where event_name = 'communication.employee_email_sent'
      and subject_id = outbound_message_id
      and actor_type = 'employee'
      and actor_id = test_app_user_id
      and actor_auth_user_id = test_auth_user_id
      and source = 'mission_control.reply'
  ) then
    raise exception 'Employee email sent fact has incorrect actor attribution.';
  end if;

  update public.communication_messages
  set
    status = 'delivered',
    metadata = metadata || jsonb_build_object(
      'resend_event_type', 'email.delivered',
      'resend_event_created_at', evaluation_time + interval '600 milliseconds'
    )
  where id = outbound_message_id;

  if not exists (
    select 1
    from public.business_events
    where event_name = 'communication.email_delivery_confirmed'
      and subject_id = outbound_message_id
      and actor_type = 'integration'
      and source = 'resend.webhook'
  ) then
    raise exception 'Provider-confirmed email delivery fact was not recorded.';
  end if;

  perform public.evaluate_mission_control_communication_signals(later_evaluation_time);

  if not exists (
    select 1
    from public.mission_control_signals
    where rule_key = 'communication.customer_reply_unanswered'
      and subject_id = test_thread_id
      and status = 'resolved'
      and resolution_reason = 'customer_reply_no_longer_unanswered'
  ) then
    raise exception 'Employee response did not resolve the unanswered reply signal.';
  end if;

  update public.communication_messages
  set
    status = 'undelivered',
    metadata = metadata || jsonb_build_object(
      'resend_event_type', 'email.bounced',
      'resend_event_created_at', evaluation_time + interval '700 milliseconds',
      'bounce_type', 'Permanent',
      'bounce_subtype', 'General'
    )
  where id = outbound_message_id;

  if not exists (
    select 1
    from public.business_events
    where event_name = 'communication.email_bounced'
      and subject_id = outbound_message_id
      and metadata ->> 'bounce_type' = 'Permanent'
      and metadata ->> 'bounce_subtype' = 'General'
  ) then
    raise exception 'Email bounce fact was not recorded.';
  end if;

  begin
    perform public.evaluate_mission_control_communication_signals(evaluation_time);
    raise exception 'Expected backwards communication evaluation time to fail closed.';
  exception
    when others then
      if sqlerrm not like 'Mission Control communication evaluation time cannot move backwards.%' then
        raise;
      end if;
  end;
end
$$;

rollback;
