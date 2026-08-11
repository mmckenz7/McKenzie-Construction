begin;

do $$
begin
  if to_regclass('public.business_events') is null
    or to_regclass('public.mission_control_signals') is null
    or to_regclass('public.communication_messages') is null
    or to_regclass('public.communication_threads') is null
  then
    raise exception 'Mission Control communication events require the event and communication foundations.';
  end if;
end
$$;

alter table public.company_settings
  add column if not exists mission_control_customer_reply_hours integer not null default 24;

alter table public.company_settings
  drop constraint if exists company_settings_mission_control_customer_reply_hours_check,
  add constraint company_settings_mission_control_customer_reply_hours_check
    check (mission_control_customer_reply_hours between 1 and 168);

comment on column public.company_settings.mission_control_customer_reply_hours is
  'Calendar-hour threshold before an unanswered, identity-matched inbound customer email becomes a deterministic Mission Control signal.';

create or replace function public.mission_control_uuid_or_null(value text)
returns uuid
language plpgsql
immutable
strict
set search_path = public
as $$
begin
  return value::uuid;
exception
  when invalid_text_representation then
    return null;
end;
$$;

create or replace function public.emit_mission_control_communication_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_lead_id uuid := public.mission_control_uuid_or_null(new.lead_id);
  resolved_customer_id uuid;
  resolved_actor_id uuid;
  resolved_actor_auth_user_id uuid;
  resolved_actor_type text;
  resolved_event_name text;
  resolved_occurred_at timestamptz;
  resolved_source text;
  resolved_source_event_id text;
  resolved_idempotency_key text;
  resolved_metadata jsonb;
  provider_event_type text := nullif(new.metadata ->> 'resend_event_type', '');
  provider_event_occurred_at timestamptz;
begin
  if new.channel <> 'email' then
    return new;
  end if;

  if new.thread_id is not null then
    select thread.customer_id
    into resolved_customer_id
    from public.communication_threads as thread
    where thread.id = new.thread_id;
  end if;

  if tg_op = 'INSERT' and new.direction = 'inbound' and new.status = 'received' then
    resolved_event_name := 'communication.customer_email_received';
    resolved_occurred_at := coalesce(new.received_at, new.created_at);
    resolved_actor_type := 'customer';
    resolved_actor_id := resolved_customer_id;
    resolved_source := case
      when new.provider = 'microsoft_graph' then 'microsoft_graph.inbox_sync'
      else 'communication.message'
    end;
    resolved_source_event_id := new.provider_message_id;
    resolved_idempotency_key := concat('message:', new.id, ':received');
    resolved_metadata := jsonb_strip_nulls(jsonb_build_object(
      'channel', 'email',
      'direction', 'inbound',
      'provider', new.provider,
      'thread_id', new.thread_id,
      'identity_matched', resolved_lead_id is not null or resolved_customer_id is not null
    ));
  elsif new.direction = 'outbound'
    and new.status = 'sent'
    and (tg_op = 'INSERT' or old.status is distinct from 'sent')
  then
    resolved_event_name := 'communication.employee_email_sent';
    resolved_occurred_at := coalesce(new.sent_at, new.created_at);
    resolved_actor_id := public.mission_control_uuid_or_null(
      new.metadata ->> 'sent_by_team_member_id'
    );
    resolved_actor_type := case when resolved_actor_id is null then 'system' else 'employee' end;

    select app_user.auth_user_id
    into resolved_actor_auth_user_id
    from public.app_users as app_user
    where app_user.id = resolved_actor_id;

    resolved_source := case
      when new.metadata ? 'sent_by_team_member_id' then 'mission_control.reply'
      else 'communication.outbox'
    end;
    resolved_source_event_id := new.provider_message_id;
    resolved_idempotency_key := concat('message:', new.id, ':sent');
    resolved_metadata := jsonb_strip_nulls(jsonb_build_object(
      'channel', 'email',
      'direction', 'outbound',
      'provider', new.provider,
      'thread_id', new.thread_id,
      'outbox_id', new.outbox_id
    ));
  elsif tg_op = 'UPDATE'
    and new.direction = 'outbound'
    and provider_event_type = 'email.delivered'
    and (
      old.metadata ->> 'resend_event_created_at' is distinct from
      new.metadata ->> 'resend_event_created_at'
    )
  then
    begin
      provider_event_occurred_at := (new.metadata ->> 'resend_event_created_at')::timestamptz;
    exception
      when invalid_text_representation or datetime_field_overflow then
        raise exception 'Invalid Resend event occurrence time on communication message %.', new.id;
    end;
    resolved_event_name := 'communication.email_delivery_confirmed';
    resolved_occurred_at := provider_event_occurred_at;
    resolved_actor_type := 'integration';
    resolved_source := 'resend.webhook';
    resolved_source_event_id := new.provider_message_id;
    resolved_idempotency_key := concat(
      'message:', new.id, ':delivered:', new.metadata ->> 'resend_event_created_at'
    );
    resolved_metadata := jsonb_strip_nulls(jsonb_build_object(
      'channel', 'email',
      'provider', new.provider,
      'thread_id', new.thread_id,
      'provider_event_type', provider_event_type
    ));
  elsif tg_op = 'UPDATE'
    and new.direction = 'outbound'
    and provider_event_type in ('email.bounced', 'email.failed')
    and (
      old.metadata ->> 'resend_event_created_at' is distinct from
      new.metadata ->> 'resend_event_created_at'
    )
  then
    begin
      provider_event_occurred_at := (new.metadata ->> 'resend_event_created_at')::timestamptz;
    exception
      when invalid_text_representation or datetime_field_overflow then
        raise exception 'Invalid Resend event occurrence time on communication message %.', new.id;
    end;
    resolved_event_name := 'communication.email_bounced';
    resolved_occurred_at := provider_event_occurred_at;
    resolved_actor_type := 'integration';
    resolved_source := 'resend.webhook';
    resolved_source_event_id := new.provider_message_id;
    resolved_idempotency_key := concat(
      'message:', new.id, ':', provider_event_type, ':',
      new.metadata ->> 'resend_event_created_at'
    );
    resolved_metadata := jsonb_strip_nulls(jsonb_build_object(
      'channel', 'email',
      'provider', new.provider,
      'thread_id', new.thread_id,
      'provider_event_type', provider_event_type,
      'bounce_type', nullif(new.metadata ->> 'bounce_type', ''),
      'bounce_subtype', nullif(new.metadata ->> 'bounce_subtype', '')
    ));
  else
    return new;
  end if;

  perform public.record_business_event(
    resolved_event_name,
    1::smallint,
    resolved_occurred_at,
    resolved_actor_type,
    resolved_actor_id,
    resolved_actor_auth_user_id,
    'communication_message',
    new.id,
    null,
    resolved_lead_id,
    resolved_customer_id,
    resolved_source,
    resolved_source_event_id,
    resolved_idempotency_key,
    new.thread_id,
    null,
    resolved_metadata,
    'operational'
  );

  return new;
end;
$$;

drop trigger if exists emit_mission_control_communication_event
  on public.communication_messages;
create trigger emit_mission_control_communication_event
  after insert or update of status, metadata on public.communication_messages
  for each row execute function public.emit_mission_control_communication_event();

revoke all on function public.mission_control_uuid_or_null(text)
  from public, anon, authenticated;
revoke all on function public.emit_mission_control_communication_event()
  from public, anon, authenticated, service_role;

comment on function public.emit_mission_control_communication_event() is
  'Emits only authoritative email receipt, provider acceptance, delivery, and bounce business facts. Message bodies and addresses are excluded.';

create or replace function public.evaluate_mission_control_communication_signals(
  requested_as_of timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_company_id uuid;
  settings_count bigint;
  reply_hours integer;
  upsert_count integer := 0;
  resolved_count integer := 0;
begin
  if requested_as_of is null or requested_as_of > now() + interval '5 minutes' then
    raise exception 'Invalid Mission Control communication evaluation time.';
  end if;

  select
    (select settings.id from public.company_settings as settings limit 1),
    (select count(*) from public.company_settings),
    (select settings.mission_control_customer_reply_hours from public.company_settings as settings limit 1)
  into resolved_company_id, settings_count, reply_hours;

  if settings_count <> 1 or resolved_company_id is null or reply_hours is null then
    raise exception 'Mission Control communication evaluation requires exactly one company.';
  end if;

  if exists (
    select 1
    from public.mission_control_signals as signal
    where signal.company_id = resolved_company_id
      and signal.rule_key = 'communication.customer_reply_unanswered'
      and signal.last_evaluated_at > requested_as_of
  ) then
    raise exception 'Mission Control communication evaluation time cannot move backwards.';
  end if;

  with qualifying as (
    select distinct on (message.thread_id)
      message.thread_id,
      message.id as message_id,
      coalesce(message.received_at, message.created_at) as received_at,
      public.mission_control_uuid_or_null(message.lead_id) as lead_id,
      thread.customer_id,
      receipt_event.id as receipt_event_id
    from public.communication_messages as message
    join public.communication_threads as thread on thread.id = message.thread_id
    join public.business_events as receipt_event
      on receipt_event.company_id = resolved_company_id
     and receipt_event.event_name = 'communication.customer_email_received'
     and receipt_event.subject_type = 'communication_message'
     and receipt_event.subject_id = message.id
    where message.channel = 'email'
      and message.direction = 'inbound'
      and message.status = 'received'
      and thread.status <> 'archived'
      and (
        public.mission_control_uuid_or_null(message.lead_id) is not null
        or thread.customer_id is not null
      )
      and coalesce(message.received_at, message.created_at)
        <= requested_as_of - make_interval(hours => reply_hours)
      and not exists (
        select 1
        from public.communication_messages as response
        where response.thread_id = message.thread_id
          and response.channel = 'email'
          and response.direction = 'outbound'
          and response.status in ('sent', 'delivered')
          and coalesce(response.sent_at, response.created_at)
            > coalesce(message.received_at, message.created_at)
          and coalesce(response.sent_at, response.created_at) <= requested_as_of
      )
    order by message.thread_id, coalesce(message.received_at, message.created_at) desc, message.id desc
  )
  insert into public.mission_control_signals (
    company_id, rule_key, rule_version, subject_type, subject_id, dedupe_key,
    status, severity, first_detected_at, last_evaluated_at, due_at,
    evidence, rule_output
  )
  select
    resolved_company_id,
    'communication.customer_reply_unanswered',
    1,
    'communication_thread',
    qualifying.thread_id,
    concat('communication-thread:', qualifying.thread_id, ':customer-reply-unanswered'),
    'open',
    'urgent',
    requested_as_of,
    requested_as_of,
    qualifying.received_at + make_interval(hours => reply_hours),
    jsonb_strip_nulls(jsonb_build_object(
      'event_ids', jsonb_build_array(qualifying.receipt_event_id),
      'inbound_message_id', qualifying.message_id,
      'thread_id', qualifying.thread_id,
      'lead_id', qualifying.lead_id,
      'customer_id', qualifying.customer_id,
      'received_at', qualifying.received_at,
      'evaluated_at', requested_as_of
    )),
    jsonb_build_object(
      'calendar_hours_waiting', floor(extract(epoch from (requested_as_of - qualifying.received_at)) / 3600),
      'reply_threshold_hours', reply_hours
    )
  from qualifying
  on conflict (company_id, dedupe_key) do update
  set
    rule_version = excluded.rule_version,
    last_evaluated_at = excluded.last_evaluated_at,
    due_at = excluded.due_at,
    evidence = excluded.evidence,
    rule_output = excluded.rule_output,
    status = case
      when mission_control_signals.status = 'dismissed' then 'dismissed'
      when mission_control_signals.status = 'acknowledged' then 'acknowledged'
      when mission_control_signals.status = 'snoozed'
        and mission_control_signals.snoozed_until > requested_as_of then 'snoozed'
      else 'open'
    end,
    snoozed_until = case
      when mission_control_signals.status = 'snoozed'
        and mission_control_signals.snoozed_until > requested_as_of
      then mission_control_signals.snoozed_until else null end,
    resolved_at = case when mission_control_signals.status = 'dismissed'
      then mission_control_signals.resolved_at else null end,
    resolution_reason = case when mission_control_signals.status = 'dismissed'
      then mission_control_signals.resolution_reason else null end,
    updated_at = now();

  get diagnostics upsert_count = row_count;

  update public.mission_control_signals as signal
  set
    status = 'resolved',
    last_evaluated_at = requested_as_of,
    snoozed_until = null,
    resolved_at = requested_as_of,
    resolution_reason = 'customer_reply_no_longer_unanswered',
    updated_at = now()
  where signal.company_id = resolved_company_id
    and signal.rule_key = 'communication.customer_reply_unanswered'
    and signal.status not in ('resolved', 'dismissed')
    and not exists (
      select 1
      from public.communication_messages as inbound
      join public.communication_threads as thread on thread.id = inbound.thread_id
      join public.business_events as receipt_event
        on receipt_event.company_id = resolved_company_id
       and receipt_event.event_name = 'communication.customer_email_received'
       and receipt_event.subject_id = inbound.id
      where inbound.thread_id = signal.subject_id
        and inbound.channel = 'email'
        and inbound.direction = 'inbound'
        and inbound.status = 'received'
        and thread.status <> 'archived'
        and (
          public.mission_control_uuid_or_null(inbound.lead_id) is not null
          or thread.customer_id is not null
        )
        and coalesce(inbound.received_at, inbound.created_at)
          <= requested_as_of - make_interval(hours => reply_hours)
        and not exists (
          select 1
          from public.communication_messages as response
          where response.thread_id = inbound.thread_id
            and response.channel = 'email'
            and response.direction = 'outbound'
            and response.status in ('sent', 'delivered')
            and coalesce(response.sent_at, response.created_at)
              > coalesce(inbound.received_at, inbound.created_at)
            and coalesce(response.sent_at, response.created_at) <= requested_as_of
        )
    );

  get diagnostics resolved_count = row_count;

  return jsonb_build_object(
    'as_of', requested_as_of,
    'reply_threshold_hours', reply_hours,
    'unanswered_upsert_count', upsert_count,
    'resolved_count', resolved_count
  );
end;
$$;

revoke all on function public.evaluate_mission_control_communication_signals(timestamptz)
  from public, anon, authenticated;
grant execute on function public.evaluate_mission_control_communication_signals(timestamptz)
  to service_role;

comment on function public.evaluate_mission_control_communication_signals(timestamptz) is
  'Evaluates the evidence-backed unanswered customer email rule. It does not infer identity from unmatched messages or inspect message content.';

commit;
