begin;

alter table public.communication_threads
  add column if not exists security_disposition text not null default 'normal';

alter table public.communication_threads
  drop constraint if exists communication_threads_security_disposition_check,
  add constraint communication_threads_security_disposition_check
    check (security_disposition in ('normal', 'quarantined')),
  drop constraint if exists communication_threads_quarantine_container_check,
  add constraint communication_threads_quarantine_container_check
    check (
      security_disposition = 'normal'
      or (
        status = 'archived'
        and lead_id is null
        and customer_id is null
        and assigned_to_id is null
        and cardinality(participant_addresses) = 0
        and unread_count = 0
        and provider_thread_id like 'quarantine:%'
        and subject is not distinct from 'Sensitive authentication message quarantined'
        and metadata = '{}'::jsonb
      )
    );

alter table public.communication_messages
  add column if not exists security_disposition text not null default 'normal',
  add column if not exists security_reason_code text,
  add column if not exists security_detector_version text,
  add column if not exists content_redacted_at timestamptz;

alter table public.communication_messages
  drop constraint if exists communication_messages_security_disposition_check,
  add constraint communication_messages_security_disposition_check
    check (security_disposition in ('normal', 'quarantined')),
  drop constraint if exists communication_messages_quarantine_metadata_check,
  add constraint communication_messages_quarantine_metadata_check
    check (
      (
        security_disposition = 'normal'
        and security_reason_code is null
        and security_detector_version is null
        and content_redacted_at is null
      )
      or
      (
        security_disposition = 'quarantined'
        and nullif(btrim(security_reason_code), '') is not null
        and nullif(btrim(security_detector_version), '') is not null
        and content_redacted_at is not null
        and thread_id is not null
        and lead_id is null
        and sender = 'quarantined@invalid.local'
        and recipient = 'quarantined@invalid.local'
        and subject is not distinct from 'Sensitive authentication message quarantined'
        and body = 'This message was quarantined before its content was stored.'
        and is_read = true
        and has_attachments = false
        and metadata = '{}'::jsonb
      )
    );

create or replace function public.validate_communication_message_security_disposition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  message_disposition text;
  message_thread_id uuid;
  thread_disposition text;
begin
  select message.security_disposition, message.thread_id
  into message_disposition, message_thread_id
  from public.communication_messages as message
  where message.id = new.id;

  if not found then
    return new;
  end if;

  if message_thread_id is null then
    if message_disposition = 'quarantined' then
      raise exception 'A quarantined communication message requires a quarantined thread.';
    end if;
    return new;
  end if;

  select thread.security_disposition
  into thread_disposition
  from public.communication_threads as thread
  where thread.id = message_thread_id;

  if thread_disposition is null
    or thread_disposition is distinct from message_disposition
  then
    raise exception 'Communication message and thread security dispositions must match.';
  end if;

  return new;
end;
$$;

create or replace function public.validate_communication_thread_security_disposition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  thread_disposition text;
begin
  select thread.security_disposition
  into thread_disposition
  from public.communication_threads as thread
  where thread.id = new.id;

  if not found then
    return new;
  end if;

  if exists (
    select 1
    from public.communication_messages as message
    where message.thread_id = new.id
      and message.security_disposition is distinct from thread_disposition
  ) then
    raise exception 'Communication thread and message security dispositions must match.';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_communication_message_security_disposition
  on public.communication_messages;
create constraint trigger validate_communication_message_security_disposition
  after insert or update on public.communication_messages
  deferrable initially deferred
  for each row
  execute function public.validate_communication_message_security_disposition();

drop trigger if exists validate_communication_thread_security_disposition
  on public.communication_threads;
create constraint trigger validate_communication_thread_security_disposition
  after insert or update on public.communication_threads
  deferrable initially deferred
  for each row
  execute function public.validate_communication_thread_security_disposition();

revoke all on function public.validate_communication_message_security_disposition()
  from public, anon, authenticated, service_role;
revoke all on function public.validate_communication_thread_security_disposition()
  from public, anon, authenticated, service_role;

create index if not exists communication_threads_normal_inbox_idx
  on public.communication_threads(status, unread_count desc, last_message_at desc)
  where security_disposition = 'normal';

create index if not exists communication_messages_normal_thread_idx
  on public.communication_messages(thread_id, coalesce(received_at, sent_at, created_at))
  where security_disposition = 'normal';

create index if not exists communication_messages_quarantine_audit_idx
  on public.communication_messages(content_redacted_at desc)
  where security_disposition = 'quarantined';

comment on column public.communication_threads.security_disposition is
  'Fail-closed visibility boundary. Quarantined technical containers must not appear in normal communication projections.';
comment on column public.communication_messages.security_disposition is
  'Classifies whether message content is available to normal communication workflows.';
comment on column public.communication_messages.security_reason_code is
  'Non-secret reason code only. Never stores the matched URL, token, code, or credential.';
comment on column public.communication_messages.security_detector_version is
  'Version of the in-memory classifier that made the quarantine decision.';
comment on column public.communication_messages.content_redacted_at is
  'Time at which secret-bearing content was replaced before persistence.';

drop trigger if exists emit_mission_control_communication_event
  on public.communication_messages;
create trigger emit_mission_control_communication_event
  after insert or update of status, metadata on public.communication_messages
  for each row
  when (new.security_disposition = 'normal')
  execute function public.emit_mission_control_communication_event();

commit;
