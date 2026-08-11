-- DocuSign contract lifecycle. Estimate acceptance remains nonbinding and this
-- migration does not create projects or authorize work.

alter table public.estimate_contract_preparations
  drop constraint if exists estimate_contract_preparations_status_check;
alter table public.estimate_contract_preparations
  add constraint estimate_contract_preparations_status_check
  check (status in ('draft', 'ready_for_signature', 'sending', 'sent_for_signature', 'signed', 'declined', 'void'));

alter table public.estimate_contract_preparations
  drop constraint if exists estimate_contract_preparations_signature_boundary_check;
alter table public.estimate_contract_preparations
  add column if not exists signature_send_attempt_id uuid,
  add column if not exists declined_at timestamptz,
  add column if not exists last_signature_event_at timestamptz;
alter table public.estimate_contract_preparations
  add constraint estimate_contract_preparations_signature_boundary_check
  check (
    (status in ('draft', 'ready_for_signature') and signature_send_attempt_id is null and sent_for_signature_at is null and signed_at is null and declined_at is null)
    or (status = 'sending' and signature_send_attempt_id is not null and signature_provider = 'docusign' and sent_for_signature_at is null and signed_at is null and declined_at is null)
    or (status = 'sent_for_signature' and signature_send_attempt_id is null and signature_envelope_id is not null and sent_for_signature_at is not null and signed_at is null and declined_at is null)
    or (status = 'signed' and signature_send_attempt_id is null and signature_envelope_id is not null and sent_for_signature_at is not null and signed_at is not null and declined_at is null)
    or (status = 'declined' and signature_send_attempt_id is null and signature_envelope_id is not null and sent_for_signature_at is not null and signed_at is null and declined_at is not null)
    or (status = 'void' and signature_send_attempt_id is null)
  );

create unique index if not exists estimate_contract_preparations_provider_envelope_uidx
  on public.estimate_contract_preparations(signature_provider, signature_envelope_id)
  where signature_provider is not null and signature_envelope_id is not null;

create table if not exists public.estimate_contract_signature_events (
  id uuid primary key default gen_random_uuid(),
  contract_preparation_id uuid not null references public.estimate_contract_preparations(id) on delete restrict,
  provider text not null,
  provider_event_id text not null,
  provider_envelope_id text not null,
  event_type text not null,
  occurred_at timestamptz not null,
  payload_sha256 text not null,
  processed_at timestamptz,
  processing_error text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  constraint estimate_contract_signature_events_provider_check check (provider = 'docusign'),
  constraint estimate_contract_signature_events_event_type_check
    check (event_type in ('sent', 'delivered', 'completed', 'declined', 'voided')),
  constraint estimate_contract_signature_events_identity_unique unique (provider, provider_event_id),
  constraint estimate_contract_signature_events_payload_digest_check
    check (payload_sha256 ~ '^[0-9a-f]{64}$')
);

create index if not exists estimate_contract_signature_events_preparation_idx
  on public.estimate_contract_signature_events(contract_preparation_id, occurred_at desc);

alter table public.estimate_contract_signature_events enable row level security;
revoke all on table public.estimate_contract_signature_events from public, anon, authenticated;
grant select, insert, update on table public.estimate_contract_signature_events to service_role;

create or replace function public.claim_estimate_contract_signature_send(
  requested_contract_preparation_id uuid,
  requested_app_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  preparation public.estimate_contract_preparations%rowtype;
  attempt_id uuid := gen_random_uuid();
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required.'; end if;
  if requested_app_user_id is null or not exists (select 1 from public.app_users where id = requested_app_user_id) then
    raise exception 'A valid application user is required.';
  end if;
  select * into preparation from public.estimate_contract_preparations
    where id = requested_contract_preparation_id for update;
  if not found then raise exception 'Contract preparation was not found.'; end if;
  if preparation.status <> 'ready_for_signature' or preparation.legal_terms_status <> 'approved' then
    raise exception 'Contract is not ready for signature.';
  end if;
  if preparation.recipient_email is null or btrim(preparation.recipient_email) = '' then
    raise exception 'Contract recipient email is required.';
  end if;
  if preparation.signature_envelope_id is not null then raise exception 'Contract already has a signature envelope.'; end if;

  update public.estimate_contract_preparations set
    status = 'sending', signature_provider = 'docusign', signature_send_attempt_id = attempt_id,
    metadata = metadata || jsonb_build_object('signature_send_claimed_by_app_user_id', requested_app_user_id)
  where id = preparation.id;
  return jsonb_build_object(
    'contract_preparation_id', preparation.id,
    'attempt_id', attempt_id,
    'recipient_name', preparation.recipient_name,
    'recipient_email', preparation.recipient_email
  );
end;
$$;

create or replace function public.complete_estimate_contract_signature_send(
  requested_contract_preparation_id uuid,
  requested_attempt_id uuid,
  requested_envelope_id text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required.'; end if;
  if requested_envelope_id is null or btrim(requested_envelope_id) = '' then raise exception 'Envelope ID is required.'; end if;
  update public.estimate_contract_preparations set
    status = 'sent_for_signature', signature_send_attempt_id = null,
    signature_envelope_id = btrim(requested_envelope_id), sent_for_signature_at = now(),
    last_signature_event_at = now()
  where id = requested_contract_preparation_id
    and status = 'sending' and signature_provider = 'docusign'
    and signature_send_attempt_id = requested_attempt_id and signature_envelope_id is null;
  if not found then raise exception 'Signature send claim is no longer active.'; end if;
end;
$$;

create or replace function public.release_estimate_contract_signature_send(
  requested_contract_preparation_id uuid,
  requested_attempt_id uuid,
  requested_error_code text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required.'; end if;
  update public.estimate_contract_preparations set
    status = 'ready_for_signature', signature_provider = null, signature_send_attempt_id = null,
    metadata = metadata || jsonb_build_object('last_signature_send_error', left(coalesce(requested_error_code, 'send_failed'), 100))
  where id = requested_contract_preparation_id and status = 'sending'
    and signature_send_attempt_id = requested_attempt_id and signature_envelope_id is null;
end;
$$;

create or replace function public.record_docusign_contract_event(
  requested_contract_preparation_id uuid,
  requested_provider_event_id text,
  requested_envelope_id text,
  requested_event_type text,
  requested_occurred_at timestamptz,
  requested_payload_sha256 text,
  requested_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  event_row public.estimate_contract_signature_events%rowtype;
  preparation public.estimate_contract_preparations%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required.'; end if;
  if requested_event_type not in ('sent', 'delivered', 'completed', 'declined', 'voided') then raise exception 'Unsupported DocuSign event.'; end if;

  insert into public.estimate_contract_signature_events (
    contract_preparation_id, provider, provider_event_id, provider_envelope_id,
    event_type, occurred_at, payload_sha256, metadata
  ) values (
    requested_contract_preparation_id, 'docusign', requested_provider_event_id,
    requested_envelope_id, requested_event_type, requested_occurred_at,
    requested_payload_sha256, coalesce(requested_metadata, '{}'::jsonb)
  ) on conflict (provider, provider_event_id) do nothing
  returning * into event_row;

  if event_row.id is null then
    select * into event_row from public.estimate_contract_signature_events
      where provider = 'docusign' and provider_event_id = requested_provider_event_id;
    if event_row.payload_sha256 <> requested_payload_sha256
      or event_row.contract_preparation_id <> requested_contract_preparation_id
      or event_row.provider_envelope_id <> requested_envelope_id then
      raise exception 'DocuSign event idempotency conflict.';
    end if;
    return jsonb_build_object('duplicate', true, 'status', event_row.event_type);
  end if;

  select * into preparation from public.estimate_contract_preparations
    where id = requested_contract_preparation_id for update;
  if not found or preparation.signature_provider <> 'docusign'
    or preparation.signature_envelope_id <> requested_envelope_id then
    update public.estimate_contract_signature_events set processing_error = 'Envelope linkage failed.' where id = event_row.id;
    raise exception 'DocuSign envelope linkage failed.';
  end if;

  if preparation.last_signature_event_at is null or requested_occurred_at >= preparation.last_signature_event_at then
    update public.estimate_contract_preparations set
      status = case
        when requested_event_type = 'completed' then 'signed'
        when requested_event_type = 'declined' and status <> 'signed' then 'declined'
        when requested_event_type = 'voided' and status <> 'signed' then 'void'
        else status
      end,
      signed_at = case when requested_event_type = 'completed' then requested_occurred_at else signed_at end,
      declined_at = case when requested_event_type = 'declined' and status <> 'signed' then requested_occurred_at else declined_at end,
      voided_at = case when requested_event_type = 'voided' and status <> 'signed' then requested_occurred_at else voided_at end,
      last_signature_event_at = greatest(coalesce(last_signature_event_at, requested_occurred_at), requested_occurred_at)
    where id = preparation.id;
  end if;

  update public.estimate_contract_signature_events set processed_at = now() where id = event_row.id;
  return jsonb_build_object('duplicate', false, 'status', requested_event_type);
end;
$$;

revoke all on function public.claim_estimate_contract_signature_send(uuid, uuid) from public, anon, authenticated;
revoke all on function public.complete_estimate_contract_signature_send(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.release_estimate_contract_signature_send(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.record_docusign_contract_event(uuid, text, text, text, timestamptz, text, jsonb) from public, anon, authenticated;
grant execute on function public.claim_estimate_contract_signature_send(uuid, uuid) to service_role;
grant execute on function public.complete_estimate_contract_signature_send(uuid, uuid, text) to service_role;
grant execute on function public.release_estimate_contract_signature_send(uuid, uuid, text) to service_role;
grant execute on function public.record_docusign_contract_event(uuid, text, text, text, timestamptz, text, jsonb) to service_role;

comment on table public.estimate_contract_signature_events is
  'Verified, idempotent DocuSign lifecycle evidence. Events do not create projects or authorize work.';
