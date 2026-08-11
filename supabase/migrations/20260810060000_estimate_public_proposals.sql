begin;

create table if not exists public.estimate_proposals (
  id uuid primary key default gen_random_uuid(),
  estimate_id uuid not null unique references public.estimates(id) on delete restrict,
  lead_id uuid references public.leads(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  public_token uuid not null unique,
  status text not null default 'issued',
  snapshot_version text not null default 'estimate-public-proposal-v1',
  snapshot jsonb not null,
  customer_name text not null,
  customer_email text,
  expires_at timestamptz not null,
  issued_at timestamptz not null default now(),
  opened_at timestamptz,
  responded_at timestamptz,
  response text,
  response_name text,
  response_notes text,
  acknowledged_nonbinding boolean not null default false,
  response_agreement_text text,
  revoked_at timestamptz,
  created_by_app_user_id uuid not null references public.app_users(id) on delete restrict,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint estimate_proposals_status_check
    check (status in ('issued', 'viewed', 'accepted', 'declined', 'expired', 'revoked')),
  constraint estimate_proposals_snapshot_version_check
    check (snapshot_version = 'estimate-public-proposal-v1'),
  constraint estimate_proposals_customer_name_check
    check (length(btrim(customer_name)) between 1 and 240),
  constraint estimate_proposals_response_check
    check (response is null or response in ('accepted', 'declined')),
  constraint estimate_proposals_response_name_check
    check (response_name is null or length(btrim(response_name)) between 1 and 160),
  constraint estimate_proposals_response_notes_check
    check (response_notes is null or length(response_notes) <= 4000),
  constraint estimate_proposals_expiry_check
    check (expires_at > issued_at),
  constraint estimate_proposals_lifecycle_check
    check (
      (status in ('issued', 'viewed') and response is null and responded_at is null and revoked_at is null)
      or (status = 'accepted' and response = 'accepted' and responded_at is not null and acknowledged_nonbinding and revoked_at is null)
      or (status = 'declined' and response = 'declined' and responded_at is not null and revoked_at is null)
      or (status = 'expired' and response is null and responded_at is null and revoked_at is null)
      or (status = 'revoked' and response is null and responded_at is null and revoked_at is not null)
    )
);

create index if not exists estimate_proposals_status_expiry_idx
  on public.estimate_proposals(status, expires_at);
create index if not exists estimate_proposals_lead_idx
  on public.estimate_proposals(lead_id, issued_at desc);

alter table public.estimate_proposals enable row level security;
revoke all on table public.estimate_proposals from public, anon, authenticated;
grant select, insert, update, delete on table public.estimate_proposals to service_role;

drop trigger if exists set_estimate_proposals_updated_at on public.estimate_proposals;
create trigger set_estimate_proposals_updated_at
  before update on public.estimate_proposals
  for each row execute function public.set_updated_at();

create or replace function public.issue_estimate_proposal(
  requested_estimate_id uuid,
  requested_token uuid,
  requested_snapshot jsonb,
  requested_customer_name text,
  requested_customer_email text,
  requested_expires_at timestamptz,
  requested_app_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  estimate_record public.estimates;
  proposal_record public.estimate_proposals;
begin
  if requested_token is null
    or requested_snapshot is null
    or jsonb_typeof(requested_snapshot) <> 'object'
    or nullif(btrim(requested_customer_name), '') is null
    or length(btrim(requested_customer_name)) > 240
    or requested_expires_at <= now()
    or requested_expires_at > now() + interval '90 days'
    or not exists (
      select 1 from public.app_users
      where id = requested_app_user_id and is_active
    )
  then
    raise exception 'Invalid estimate proposal request.';
  end if;

  select * into estimate_record
  from public.estimates
  where id = requested_estimate_id
  for update;

  if estimate_record.id is null
    or estimate_record.status not in ('draft', 'reviewing', 'sent', 'viewed')
    or estimate_record.prices_complete is distinct from true
    or estimate_record.presentation_version is distinct from 'estimate-presentation-v1'
  then
    raise exception 'Estimate is not available for proposal issuance.';
  end if;

  select * into proposal_record
  from public.estimate_proposals
  where estimate_id = requested_estimate_id
  for update;

  if proposal_record.id is not null
    and proposal_record.status in ('issued', 'viewed')
    and proposal_record.expires_at > now()
  then
    return jsonb_build_object(
      'id', proposal_record.id,
      'estimate_id', proposal_record.estimate_id,
      'public_token', proposal_record.public_token,
      'status', proposal_record.status,
      'expires_at', proposal_record.expires_at,
      'issued_at', proposal_record.issued_at,
      'opened_at', proposal_record.opened_at,
      'created', false
    );
  end if;

  if proposal_record.id is not null and proposal_record.status in ('accepted', 'declined') then
    raise exception 'A customer response has already been recorded.';
  end if;

  insert into public.estimate_proposals (
    estimate_id, lead_id, customer_id, public_token, status,
    snapshot_version, snapshot, customer_name, customer_email,
    expires_at, issued_at, opened_at, responded_at, response,
    response_name, response_notes, acknowledged_nonbinding,
    response_agreement_text, revoked_at, created_by_app_user_id, metadata
  ) values (
    estimate_record.id, estimate_record.lead_id, estimate_record.customer_id,
    requested_token, 'issued', 'estimate-public-proposal-v1', requested_snapshot,
    btrim(requested_customer_name), nullif(btrim(requested_customer_email), ''),
    requested_expires_at, now(), null, null, null, null, null, false, null, null,
    requested_app_user_id,
    jsonb_build_object('work_authorized', false, 'project_creation_authorized', false)
  )
  on conflict (estimate_id) do update set
    public_token = excluded.public_token,
    status = 'issued',
    snapshot_version = excluded.snapshot_version,
    snapshot = excluded.snapshot,
    customer_name = excluded.customer_name,
    customer_email = excluded.customer_email,
    expires_at = excluded.expires_at,
    issued_at = now(),
    opened_at = null,
    responded_at = null,
    response = null,
    response_name = null,
    response_notes = null,
    acknowledged_nonbinding = false,
    response_agreement_text = null,
    revoked_at = null,
    created_by_app_user_id = excluded.created_by_app_user_id,
    metadata = excluded.metadata
  returning * into proposal_record;

  update public.estimates
  set status = 'sent', updated_at = now()
  where id = estimate_record.id;

  return jsonb_build_object(
    'id', proposal_record.id,
    'estimate_id', proposal_record.estimate_id,
    'public_token', proposal_record.public_token,
    'status', proposal_record.status,
    'expires_at', proposal_record.expires_at,
    'issued_at', proposal_record.issued_at,
    'opened_at', proposal_record.opened_at,
    'created', true
  );
end;
$$;

create or replace function public.get_estimate_proposal_by_token(requested_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  proposal_record public.estimate_proposals;
begin
  select * into proposal_record
  from public.estimate_proposals
  where public_token = requested_token
  for update;

  if proposal_record.id is null or proposal_record.status = 'revoked' then
    return null;
  end if;

  if proposal_record.status in ('issued', 'viewed') and proposal_record.expires_at <= now() then
    update public.estimate_proposals
    set status = 'expired', updated_at = now()
    where id = proposal_record.id
    returning * into proposal_record;
    return jsonb_build_object('expired', true);
  end if;

  if proposal_record.status = 'issued' then
    update public.estimate_proposals
    set status = 'viewed', opened_at = coalesce(opened_at, now()), updated_at = now()
    where id = proposal_record.id
    returning * into proposal_record;
    update public.estimates set status = 'viewed', updated_at = now()
    where id = proposal_record.estimate_id and status = 'sent';
  end if;

  return jsonb_build_object(
    'status', proposal_record.status,
    'expires_at', proposal_record.expires_at,
    'opened_at', proposal_record.opened_at,
    'responded_at', proposal_record.responded_at,
    'response', proposal_record.response,
    'response_name', proposal_record.response_name,
    'response_notes', proposal_record.response_notes,
    'acknowledged_nonbinding', proposal_record.acknowledged_nonbinding,
    'snapshot', proposal_record.snapshot
  );
end;
$$;

create or replace function public.submit_estimate_proposal_response(
  requested_token uuid,
  requested_response text,
  requested_name text,
  requested_notes text,
  requested_acknowledged_nonbinding boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  proposal_record public.estimate_proposals;
  agreement_text constant text := 'I understand that accepting this estimate records a nonbinding intent to proceed. Work will not begin until a separate construction contract is reviewed and signed.';
  updated_estimate_id uuid;
begin
  if requested_response not in ('accepted', 'declined')
    or nullif(btrim(requested_name), '') is null
    or length(btrim(requested_name)) > 160
    or length(coalesce(requested_notes, '')) > 4000
    or (requested_response = 'accepted' and requested_acknowledged_nonbinding is distinct from true)
  then
    raise exception 'Invalid estimate response.';
  end if;

  select * into proposal_record
  from public.estimate_proposals
  where public_token = requested_token
  for update;

  if proposal_record.id is null
    or proposal_record.status in ('revoked', 'expired')
    or (proposal_record.status in ('issued', 'viewed') and proposal_record.expires_at <= now())
  then
    return null;
  end if;

  if proposal_record.status in ('accepted', 'declined') then
    return jsonb_build_object(
      'already_submitted', true,
      'status', proposal_record.status,
      'responded_at', proposal_record.responded_at
    );
  end if;

  update public.estimates
  set status = requested_response, updated_at = now()
  where id = proposal_record.estimate_id and status in ('sent', 'viewed')
  returning id into updated_estimate_id;

  if updated_estimate_id is null then
    raise exception 'Estimate response state changed.';
  end if;

  update public.estimate_proposals set
    status = requested_response,
    responded_at = now(),
    response = requested_response,
    response_name = btrim(requested_name),
    response_notes = nullif(btrim(requested_notes), ''),
    acknowledged_nonbinding = requested_response = 'accepted' and requested_acknowledged_nonbinding,
    response_agreement_text = case when requested_response = 'accepted' then agreement_text else null end,
    updated_at = now()
  where id = proposal_record.id
  returning * into proposal_record;

  if proposal_record.lead_id is not null then
    insert into public.lead_activities (
      lead_id, activity_type, channel, direction, summary, details, metadata
    ) values (
      proposal_record.lead_id::text,
      case when requested_response = 'accepted'
        then 'estimate_accepted'
        else 'estimate_declined'
      end,
      'estimate',
      'inbound',
      case when requested_response = 'accepted'
        then 'Customer accepted estimate'
        else 'Customer declined estimate'
      end,
      case when requested_response = 'accepted'
        then 'Nonbinding acceptance recorded. A separate signed construction contract is required before work begins.'
        else 'Customer declined the estimate.'
      end,
      jsonb_build_object(
        'estimate_id', proposal_record.estimate_id,
        'estimate_proposal_id', proposal_record.id,
        'response_name', proposal_record.response_name,
        'acknowledged_nonbinding', proposal_record.acknowledged_nonbinding,
        'contract_required', proposal_record.status = 'accepted',
        'work_authorized', false
      )
    );
  end if;

  return jsonb_build_object(
    'status', proposal_record.status,
    'responded_at', proposal_record.responded_at,
    'response_name', proposal_record.response_name,
    'acknowledged_nonbinding', proposal_record.acknowledged_nonbinding,
    'contract_required', proposal_record.status = 'accepted',
    'work_authorized', false
  );
end;
$$;

create or replace function public.revoke_estimate_proposal(
  requested_estimate_id uuid,
  requested_app_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  proposal_record public.estimate_proposals;
begin
  if not exists (
    select 1 from public.app_users where id = requested_app_user_id and is_active
  ) then
    raise exception 'Invalid estimate proposal revocation.';
  end if;

  select * into proposal_record
  from public.estimate_proposals
  where estimate_id = requested_estimate_id
  for update;

  if proposal_record.id is null or proposal_record.status not in ('issued', 'viewed') then
    raise exception 'No active estimate proposal is available to revoke.';
  end if;

  update public.estimate_proposals
  set status = 'revoked', revoked_at = now(), updated_at = now()
  where id = proposal_record.id;

  update public.estimates
  set status = 'draft', updated_at = now()
  where id = requested_estimate_id and status in ('sent', 'viewed');

  return jsonb_build_object('status', 'revoked', 'estimate_status', 'draft');
end;
$$;

revoke all on function public.issue_estimate_proposal(uuid, uuid, jsonb, text, text, timestamptz, uuid)
  from public, anon, authenticated;
revoke all on function public.get_estimate_proposal_by_token(uuid)
  from public, anon, authenticated;
revoke all on function public.submit_estimate_proposal_response(uuid, text, text, text, boolean)
  from public, anon, authenticated;
revoke all on function public.revoke_estimate_proposal(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.issue_estimate_proposal(uuid, uuid, jsonb, text, text, timestamptz, uuid)
  to service_role;
grant execute on function public.get_estimate_proposal_by_token(uuid)
  to service_role;
grant execute on function public.submit_estimate_proposal_response(uuid, text, text, text, boolean)
  to service_role;
grant execute on function public.revoke_estimate_proposal(uuid, uuid)
  to service_role;

create or replace function public.check_public_token_rate_limit(
  requested_route_category text,
  requested_method text,
  requested_network_key text,
  requested_token_key text,
  requested_window_seconds integer,
  requested_network_limit integer,
  requested_token_limit integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_window timestamptz;
  network_count integer;
  token_count integer;
  retry_after integer;
begin
  if requested_route_category not in (
    'change_order', 'change_order_vendor', 'estimate_proposal',
    'material_review', 'schedule_request'
  )
    or requested_method not in ('GET', 'POST')
    or length(requested_network_key) <> 64
    or length(requested_token_key) <> 64
    or requested_window_seconds not between 60 and 3600
    or requested_network_limit not between 1 and 1000
    or requested_token_limit not between 1 and requested_network_limit
  then
    raise exception 'Invalid rate limit configuration.';
  end if;

  current_window := to_timestamp(
    floor(extract(epoch from clock_timestamp()) / requested_window_seconds)
      * requested_window_seconds
  );

  insert into public.public_token_rate_limit_buckets (
    route_category, request_method, identifier_kind, identifier_hash,
    window_started_at, request_count
  ) values (
    requested_route_category, requested_method, 'network', requested_network_key,
    current_window, 1
  )
  on conflict (route_category, request_method, identifier_kind, identifier_hash, window_started_at)
  do update set request_count = public.public_token_rate_limit_buckets.request_count + 1
  returning request_count into network_count;

  insert into public.public_token_rate_limit_buckets (
    route_category, request_method, identifier_kind, identifier_hash,
    window_started_at, request_count
  ) values (
    requested_route_category, requested_method, 'token', requested_token_key,
    current_window, 1
  )
  on conflict (route_category, request_method, identifier_kind, identifier_hash, window_started_at)
  do update set request_count = public.public_token_rate_limit_buckets.request_count + 1
  returning request_count into token_count;

  if random() < 0.01 then
    delete from public.public_token_rate_limit_buckets
    where window_started_at < now() - interval '48 hours';
  end if;

  retry_after := greatest(
    1,
    requested_window_seconds - (
      extract(epoch from clock_timestamp())::integer % requested_window_seconds
    )
  );

  return jsonb_build_object(
    'allowed', network_count <= requested_network_limit and token_count <= requested_token_limit,
    'retry_after_seconds', retry_after
  );
end;
$$;

revoke all on function public.check_public_token_rate_limit(
  text, text, text, text, integer, integer, integer
) from public, anon, authenticated;
grant execute on function public.check_public_token_rate_limit(
  text, text, text, text, integer, integer, integer
) to service_role;

comment on table public.estimate_proposals is
  'Frozen public estimate snapshots with revocable tokens and nonbinding customer responses. Acceptance does not authorize work.';

commit;
