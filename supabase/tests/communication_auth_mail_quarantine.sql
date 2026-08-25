begin;

do $$
declare
  legacy_thread_id uuid;
  legacy_message_id uuid;
  quarantine_thread_id uuid;
  quarantine_message_id uuid;
  conversion_thread_id uuid;
  conversion_message_id uuid;
  normal_outbound_message_id uuid;
  trigger_definition text;
begin
  select pg_get_triggerdef(trigger_row.oid)
  into trigger_definition
  from pg_trigger as trigger_row
  where trigger_row.tgrelid = 'public.communication_messages'::regclass
    and trigger_row.tgname = 'emit_mission_control_communication_event';

  if trigger_definition not like '%AFTER INSERT OR UPDATE OF status, metadata%'
    or trigger_definition not like '%new.security_disposition = ''normal''%'
  then
    raise exception 'Mission Control trigger events, update columns, or quarantine predicate changed unexpectedly.';
  end if;

  insert into public.communication_threads (
    provider, provider_thread_id, subject, department, status,
    participant_addresses, unread_count, last_message_at, metadata
  ) values (
    'verification_normal', concat('legacy-', gen_random_uuid()),
    'Legacy default-normal verification', 'general', 'open',
    array['sender@example.test', 'recipient@example.test'], 1, now(), '{}'::jsonb
  ) returning id into legacy_thread_id;

  insert into public.communication_messages (
    channel, direction, sender, recipient, subject, body, status, provider,
    provider_message_id, received_at, thread_id, is_read, has_attachments,
    department, metadata
  ) values (
    'email', 'inbound', 'sender@example.test', 'recipient@example.test',
    'Legacy default-normal verification', 'Synthetic non-secret body.',
    'received', 'verification_normal', concat('legacy-', gen_random_uuid()),
    now(), legacy_thread_id, false, false, 'general', '{}'::jsonb
  ) returning id into legacy_message_id;

  if (select security_disposition from public.communication_threads where id = legacy_thread_id)
    is distinct from 'normal'
    or (select security_disposition from public.communication_messages where id = legacy_message_id)
      is distinct from 'normal'
  then
    raise exception 'Legacy inserts must default to the normal security disposition.';
  end if;

  if not exists (
    select 1
    from public.business_events
    where event_name = 'communication.customer_email_received'
      and subject_id = legacy_message_id
  ) then
    raise exception 'Normal inbound event behavior changed after the quarantine trigger replacement.';
  end if;

  insert into public.communication_messages (
    channel, direction, sender, recipient, subject, body, status, provider,
    provider_message_id, sent_at, thread_id, is_read, has_attachments,
    department, metadata, security_disposition
  ) values (
    'email', 'outbound', 'recipient@example.test', 'sender@example.test',
    'Normal event transition verification', 'Synthetic non-secret body.',
    'queued', 'resend', concat('normal-outbound-', gen_random_uuid()), now(),
    legacy_thread_id, true, false, 'general', '{}'::jsonb, 'normal'
  ) returning id into normal_outbound_message_id;

  update public.communication_messages
  set status = 'sent'
  where id = normal_outbound_message_id
    and security_disposition = 'normal';

  if not exists (
    select 1 from public.business_events
    where event_name = 'communication.employee_email_sent'
      and subject_id = normal_outbound_message_id
      and actor_type = 'system'
  ) then
    raise exception 'Normal sent-event behavior changed after the quarantine trigger replacement.';
  end if;

  update public.communication_messages
  set
    status = 'delivered',
    metadata = jsonb_build_object(
      'resend_event_type', 'email.delivered',
      'resend_event_created_at', now()
    )
  where id = normal_outbound_message_id
    and security_disposition = 'normal';

  if not exists (
    select 1 from public.business_events
    where event_name = 'communication.email_delivery_confirmed'
      and subject_id = normal_outbound_message_id
  ) then
    raise exception 'Normal delivery-event behavior changed after the quarantine trigger replacement.';
  end if;

  update public.communication_messages
  set
    status = 'undelivered',
    metadata = jsonb_build_object(
      'resend_event_type', 'email.bounced',
      'resend_event_created_at', now() + interval '1 second',
      'bounce_type', 'Synthetic',
      'bounce_subtype', 'Verification'
    )
  where id = normal_outbound_message_id
    and security_disposition = 'normal';

  if not exists (
    select 1 from public.business_events
    where event_name = 'communication.email_bounced'
      and subject_id = normal_outbound_message_id
  ) then
    raise exception 'Normal bounce-event behavior changed after the quarantine trigger replacement.';
  end if;

  insert into public.communication_threads (
    provider, provider_thread_id, subject, department, status,
    lead_id, customer_id, assigned_to_id, participant_addresses,
    unread_count, last_message_at, metadata, security_disposition
  ) values (
    'verification_quarantine', concat('quarantine:', gen_random_uuid()),
    'Sensitive authentication message quarantined', 'general', 'archived',
    null, null, null, '{}'::text[], 0, now(), '{}'::jsonb, 'quarantined'
  ) returning id into quarantine_thread_id;

  insert into public.communication_messages (
    channel, direction, sender, recipient, subject, body, status, provider,
    provider_message_id, received_at, thread_id, lead_id, is_read,
    has_attachments, department, metadata, security_disposition,
    security_reason_code, security_detector_version, content_redacted_at
  ) values (
    'email', 'inbound', 'quarantined@invalid.local', 'quarantined@invalid.local',
    'Sensitive authentication message quarantined',
    'This message was quarantined before its content was stored.',
    'received', 'verification_quarantine', concat('quarantine-', gen_random_uuid()),
    now(), quarantine_thread_id, null, true, false, 'general', '{}'::jsonb,
    'quarantined', 'secret_bearing_authentication_content',
    'secret-bearing-auth-mail-v1', now()
  ) returning id into quarantine_message_id;

  raise notice 'quarantine verification stage: valid quarantine';
  set constraints all immediate;
  set constraints all deferred;

  update public.communication_messages
  set status = 'received'
  where id = quarantine_message_id;

  if exists (
    select 1
    from public.business_events
    where subject_id = quarantine_message_id
  ) then
    raise exception 'Quarantined insert or update emitted a Mission Control event.';
  end if;

  begin
    insert into public.communication_threads (
      provider, provider_thread_id, subject, department, status,
      participant_addresses, unread_count, last_message_at, metadata,
      security_disposition
    ) values (
      'verification_null_thread', concat('quarantine:', gen_random_uuid()),
      null, 'general', 'archived', '{}'::text[], 0, now(), '{}'::jsonb,
      'quarantined'
    );
    raise exception 'Expected a quarantined thread with a NULL subject to be rejected.';
  exception
    when check_violation then null;
  end;

  begin
    insert into public.communication_messages (
      channel, direction, sender, recipient, subject, body, status, provider,
      provider_message_id, received_at, thread_id, is_read, has_attachments,
      department, metadata, security_disposition, security_reason_code,
      security_detector_version, content_redacted_at
    ) values (
      'email', 'inbound', 'quarantined@invalid.local', 'quarantined@invalid.local',
      null, 'This message was quarantined before its content was stored.',
      'received', 'verification_null_message', concat('quarantine-', gen_random_uuid()),
      now(), quarantine_thread_id, true, false, 'general', '{}'::jsonb,
      'quarantined', 'secret_bearing_authentication_content',
      'secret-bearing-auth-mail-v1', now()
    );
    raise exception 'Expected a quarantined message with a NULL subject to be rejected.';
  exception
    when check_violation then null;
  end;

  begin
    insert into public.communication_messages (
      channel, direction, sender, recipient, subject, body, status, provider,
      provider_message_id, received_at, thread_id, is_read, has_attachments,
      department, metadata, security_disposition
    ) values (
      'email', 'inbound', 'sender@example.test', 'recipient@example.test',
      'Normal message in quarantined thread', 'Synthetic non-secret body.',
      'received', 'verification_mismatch', concat('normal-', gen_random_uuid()),
      now(), quarantine_thread_id, true, false, 'general', '{}'::jsonb, 'normal'
    );
    raise notice 'quarantine verification stage: normal message mismatch';
    set constraints all immediate;
    raise exception 'Expected a normal message in a quarantined thread to be rejected.';
  exception
    when others then
      if sqlerrm not like 'Communication message and thread security dispositions must match.%' then
        raise;
      end if;
  end;
  set constraints all deferred;

  begin
    insert into public.communication_messages (
      channel, direction, sender, recipient, subject, body, status, provider,
      provider_message_id, received_at, thread_id, is_read, has_attachments,
      department, metadata, security_disposition, security_reason_code,
      security_detector_version, content_redacted_at
    ) values (
      'email', 'inbound', 'quarantined@invalid.local', 'quarantined@invalid.local',
      'Sensitive authentication message quarantined',
      'This message was quarantined before its content was stored.',
      'received', 'verification_mismatch', concat('quarantine-', gen_random_uuid()),
      now(), legacy_thread_id, true, false, 'general', '{}'::jsonb,
      'quarantined', 'secret_bearing_authentication_content',
      'secret-bearing-auth-mail-v1', now()
    );
    raise notice 'quarantine verification stage: quarantined message mismatch';
    set constraints all immediate;
    raise exception 'Expected a quarantined message in a normal thread to be rejected.';
  exception
    when others then
      if sqlerrm not like 'Communication message and thread security dispositions must match.%' then
        raise;
      end if;
  end;
  set constraints all deferred;

  insert into public.communication_threads (
    provider, provider_thread_id, subject, department, status,
    participant_addresses, unread_count, last_message_at, metadata
  ) values (
    'verification_conversion', concat('conversion-', gen_random_uuid()),
    'Normal before conversion', 'general', 'open',
    array['sender@example.test', 'recipient@example.test'], 1, now(), '{}'::jsonb
  ) returning id into conversion_thread_id;

  insert into public.communication_messages (
    channel, direction, sender, recipient, subject, body, status, provider,
    provider_message_id, received_at, thread_id, is_read, has_attachments,
    department, metadata
  ) values (
    'email', 'inbound', 'sender@example.test', 'recipient@example.test',
    'Normal before conversion', 'Synthetic non-secret body.', 'received',
    'verification_conversion', concat('conversion-', gen_random_uuid()),
    now(), conversion_thread_id, false, false, 'general', '{}'::jsonb
  ) returning id into conversion_message_id;

  update public.communication_threads
  set
    provider_thread_id = concat('quarantine:', conversion_message_id),
    subject = 'Sensitive authentication message quarantined',
    status = 'archived', lead_id = null, customer_id = null, assigned_to_id = null,
    participant_addresses = '{}'::text[], unread_count = 0, metadata = '{}'::jsonb,
    security_disposition = 'quarantined'
  where id = conversion_thread_id;

  update public.communication_messages
  set
    sender = 'quarantined@invalid.local', recipient = 'quarantined@invalid.local',
    subject = 'Sensitive authentication message quarantined',
    body = 'This message was quarantined before its content was stored.',
    lead_id = null, is_read = true, has_attachments = false, metadata = '{}'::jsonb,
    security_disposition = 'quarantined',
    security_reason_code = 'secret_bearing_authentication_content',
    security_detector_version = 'secret-bearing-auth-mail-v1',
    content_redacted_at = now()
  where id = conversion_message_id;

  raise notice 'quarantine verification stage: deferred conversion';
  set constraints all immediate;
  set constraints all deferred;

  if (select security_disposition from public.communication_threads where id = conversion_thread_id)
    is distinct from 'quarantined'
    or (select security_disposition from public.communication_messages where id = conversion_message_id)
      is distinct from 'quarantined'
  then
    raise exception 'Deferred same-transaction conversion did not preserve matching dispositions.';
  end if;

  begin
    update public.communication_threads
    set
      provider_thread_id = concat('quarantine:', legacy_message_id),
      subject = 'Sensitive authentication message quarantined', status = 'archived',
      lead_id = null, customer_id = null, assigned_to_id = null,
      participant_addresses = '{}'::text[], unread_count = 0, metadata = '{}'::jsonb,
      security_disposition = 'quarantined'
    where id = legacy_thread_id;
    raise notice 'quarantine verification stage: thread-only conversion';
    set constraints all immediate;
    raise exception 'Expected a thread-only quarantine conversion to be rejected.';
  exception
    when others then
      if sqlerrm not like 'Communication thread and message security dispositions must match.%' then
        raise;
      end if;
  end;
  set constraints all deferred;

  begin
    update public.communication_messages
    set
      sender = 'quarantined@invalid.local', recipient = 'quarantined@invalid.local',
      subject = 'Sensitive authentication message quarantined',
      body = 'This message was quarantined before its content was stored.',
      lead_id = null, is_read = true, has_attachments = false, metadata = '{}'::jsonb,
      security_disposition = 'quarantined',
      security_reason_code = 'secret_bearing_authentication_content',
      security_detector_version = 'secret-bearing-auth-mail-v1',
      content_redacted_at = now()
    where id = legacy_message_id;
    raise notice 'quarantine verification stage: message-only conversion';
    set constraints all immediate;
    raise exception 'Expected a message-only quarantine conversion to be rejected.';
  exception
    when others then
      if sqlerrm not like 'Communication message and thread security dispositions must match.%' then
        raise;
      end if;
  end;
end
$$;

rollback;
