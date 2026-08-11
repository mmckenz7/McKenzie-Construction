-- Allow authorized office users to correct contract recipient details before
-- signature sending begins. Every effective change is recorded atomically.
-- This migration does not send an envelope, create a project, authorize work,
-- or represent any template as an executed legal record.

begin;

alter table public.estimate_contract_preparations
  drop constraint if exists estimate_contract_preparations_ready_recipient_check;
alter table public.estimate_contract_preparations
  add constraint estimate_contract_preparations_ready_recipient_check
  check (
    status <> 'ready_for_signature'
    or (
      recipient_email is not null
      and length(btrim(recipient_email)) between 3 and 320
      and lower(btrim(recipient_email)) ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    )
  ) not valid;

create table if not exists public.estimate_contract_preparation_events (
  id uuid primary key default gen_random_uuid(),
  contract_preparation_id uuid not null
    references public.estimate_contract_preparations(id) on delete restrict,
  event_type text not null,
  actor_app_user_id uuid not null references public.app_users(id) on delete restrict,
  previous_state jsonb not null,
  next_state jsonb not null,
  created_at timestamptz not null default now(),
  constraint estimate_contract_preparation_events_type_check
    check (event_type in ('recipient_updated')),
  constraint estimate_contract_preparation_events_state_check
    check (jsonb_typeof(previous_state) = 'object' and jsonb_typeof(next_state) = 'object')
);

create index if not exists estimate_contract_preparation_events_preparation_idx
  on public.estimate_contract_preparation_events(contract_preparation_id, created_at desc);

alter table public.estimate_contract_preparation_events enable row level security;
revoke all on table public.estimate_contract_preparation_events from public, anon, authenticated;
grant select, insert on table public.estimate_contract_preparation_events to service_role;

create or replace function public.update_estimate_contract_recipient(
  requested_contract_preparation_id uuid,
  requested_app_user_id uuid,
  requested_recipient_name text,
  requested_recipient_email text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  preparation public.estimate_contract_preparations%rowtype;
  normalized_name text := btrim(coalesce(requested_recipient_name, ''));
  normalized_email text := nullif(lower(btrim(coalesce(requested_recipient_email, ''))), '');
  next_status text;
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required.'; end if;
  if requested_app_user_id is null or not exists (
    select 1 from public.app_users where id = requested_app_user_id and is_active
  ) then
    raise exception 'A valid active application user is required.';
  end if;
  if length(normalized_name) not between 1 and 240 then
    raise exception 'Contract recipient name is required.';
  end if;
  if normalized_email is not null and (
    length(normalized_email) > 320
    or normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ) then
    raise exception 'Contract recipient email is invalid.';
  end if;

  select * into preparation
  from public.estimate_contract_preparations
  where id = requested_contract_preparation_id
  for update;
  if not found then raise exception 'Contract preparation was not found.'; end if;
  if preparation.status not in ('draft', 'ready_for_signature')
    or preparation.signature_send_attempt_id is not null
    or preparation.signature_envelope_id is not null then
    raise exception 'Contract recipient details are locked after signature sending begins.';
  end if;

  next_status := case
    when preparation.legal_terms_status = 'approved' and normalized_email is not null
      then 'ready_for_signature'
    else 'draft'
  end;

  if preparation.recipient_name = normalized_name
    and preparation.recipient_email is not distinct from normalized_email
    and preparation.status = next_status then
    return jsonb_build_object('changed', false, 'status', preparation.status);
  end if;

  update public.estimate_contract_preparations
  set recipient_name = normalized_name,
      recipient_email = normalized_email,
      status = next_status
  where id = preparation.id;

  insert into public.estimate_contract_preparation_events (
    contract_preparation_id,
    event_type,
    actor_app_user_id,
    previous_state,
    next_state
  ) values (
    preparation.id,
    'recipient_updated',
    requested_app_user_id,
    jsonb_build_object(
      'recipientName', preparation.recipient_name,
      'recipientEmail', preparation.recipient_email,
      'status', preparation.status
    ),
    jsonb_build_object(
      'recipientName', normalized_name,
      'recipientEmail', normalized_email,
      'status', next_status
    )
  );

  return jsonb_build_object('changed', true, 'status', next_status);
end;
$$;

revoke all on function public.update_estimate_contract_recipient(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.update_estimate_contract_recipient(uuid, uuid, text, text)
  to service_role;

comment on table public.estimate_contract_preparation_events is
  'Internal append-only audit evidence for office-side contract preparation changes. It is not an executed contract record.';
comment on function public.update_estimate_contract_recipient(uuid, uuid, text, text) is
  'Atomically updates pre-send recipient details and records the acting application user plus before/after state.';

commit;
