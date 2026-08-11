begin;

do $$
begin
  if to_regclass('public.business_events') is null
    or to_regprocedure(
      'public.record_business_event(text,smallint,timestamptz,text,uuid,uuid,text,uuid,uuid,uuid,uuid,text,text,text,uuid,uuid,jsonb,text)'
    ) is null
  then
    raise exception 'Mission Control event foundation must be applied first.';
  end if;

  if to_regclass('public.estimate_proposals') is null then
    raise exception 'Proposal event production requires public.estimate_proposals.';
  end if;
end
$$;

alter table public.estimate_proposals
  add column issue_generation integer not null default 1,
  add column revoked_by_app_user_id uuid references public.app_users(id) on delete set null;

alter table public.estimate_proposals
  add constraint estimate_proposals_issue_generation_check
  check (issue_generation >= 1);

comment on column public.estimate_proposals.issue_generation is
  'Monotonic lifecycle generation used for event idempotency. Preexisting rows begin at instrumentation generation 1; this is not a reconstructed historical issue count.';
comment on column public.estimate_proposals.revoked_by_app_user_id is
  'Employee app-user identity that performed the latest proposal revocation.';

create or replace function public.advance_estimate_proposal_issue_generation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status in ('expired', 'revoked')
    and new.status = 'issued'
  then
    new.issue_generation := old.issue_generation + 1;
  elsif new.issue_generation is distinct from old.issue_generation then
    raise exception 'Proposal issue generation is managed by the lifecycle.';
  end if;

  return new;
end;
$$;

create trigger advance_estimate_proposal_issue_generation
  before update on public.estimate_proposals
  for each row execute function public.advance_estimate_proposal_issue_generation();

create table public.estimate_proposal_accesses (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.estimate_proposals(id) on delete restrict,
  issue_generation integer not null,
  access_id uuid not null unique,
  client_signal text not null default 'server_request',
  suspected_automated boolean,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint estimate_proposal_accesses_generation_check
    check (issue_generation >= 1),
  constraint estimate_proposal_accesses_client_signal_check
    check (client_signal in ('server_request', 'browser_confirmation'))
);

comment on table public.estimate_proposal_accesses is
  'Append-only observations that a public proposal link was accessed. A server request does not prove which person viewed the proposal.';
comment on column public.estimate_proposal_accesses.suspected_automated is
  'Null means automation is unknown. False must only be stored when a stronger browser signal supports it.';

create index estimate_proposal_accesses_timeline_idx
  on public.estimate_proposal_accesses(
    proposal_id,
    issue_generation,
    occurred_at desc,
    id desc
  );

alter table public.estimate_proposal_accesses enable row level security;
alter table public.estimate_proposal_accesses force row level security;
revoke all on table public.estimate_proposal_accesses
  from public, anon, authenticated, service_role;
grant select on table public.estimate_proposal_accesses to service_role;

create or replace function public.prevent_estimate_proposal_access_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception using
    errcode = '55000',
    message = 'estimate_proposal_accesses is append-only';
end;
$$;

create trigger prevent_estimate_proposal_access_mutation
  before update or delete on public.estimate_proposal_accesses
  for each row execute function public.prevent_estimate_proposal_access_mutation();

create or replace function public.log_estimate_proposal_business_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  event_name_value text;
  event_time_value timestamptz;
  event_actor_type text;
  event_actor_id uuid;
  event_actor_auth_user_id uuid;
  event_metadata jsonb;
  event_idempotency_key text;
  estimate_project_id uuid;
begin
  if tg_op = 'INSERT' then
    event_name_value := 'estimating.proposal_issued';
    event_time_value := new.issued_at;
    event_actor_type := 'employee';
    event_actor_id := new.created_by_app_user_id;
    event_metadata := jsonb_build_object(
      'estimate_id', new.estimate_id,
      'proposal_generation', new.issue_generation,
      'expires_at', new.expires_at
    );
  elsif old.status is distinct from new.status then
    case new.status
      when 'issued' then
        if old.status not in ('expired', 'revoked') then
          return new;
        end if;

        event_name_value := 'estimating.proposal_reissued';
        event_time_value := new.issued_at;
        event_actor_type := 'employee';
        event_actor_id := new.created_by_app_user_id;
        event_metadata := jsonb_build_object(
          'previous_proposal_generation', old.issue_generation,
          'proposal_generation', new.issue_generation,
          'expires_at', new.expires_at
        );
      when 'accepted' then
        event_name_value := 'estimating.proposal_accepted';
        event_time_value := new.responded_at;
        event_actor_type := 'customer';
        event_actor_id := new.customer_id;
        event_metadata := jsonb_build_object(
          'proposal_generation', new.issue_generation,
          'acknowledged_nonbinding', new.acknowledged_nonbinding
        );
      when 'declined' then
        event_name_value := 'estimating.proposal_declined';
        event_time_value := new.responded_at;
        event_actor_type := 'customer';
        event_actor_id := new.customer_id;
        event_metadata := jsonb_build_object(
          'proposal_generation', new.issue_generation
        );
      when 'expired' then
        event_name_value := 'estimating.proposal_expired';
        event_time_value := new.expires_at;
        event_actor_type := 'system';
        event_actor_id := null;
        event_metadata := jsonb_build_object(
          'proposal_generation', new.issue_generation,
          'expires_at', new.expires_at
        );
      when 'revoked' then
        event_name_value := 'estimating.proposal_revoked';
        event_time_value := new.revoked_at;
        event_actor_type := 'employee';
        event_actor_id := new.revoked_by_app_user_id;
        event_metadata := jsonb_build_object(
          'proposal_generation', new.issue_generation
        );
      else
        return new;
    end case;
  else
    return new;
  end if;

  if event_time_value is null then
    raise exception 'Proposal business event requires an authoritative occurrence time.';
  end if;

  if event_actor_type = 'employee' and event_actor_id is null then
    raise exception 'Proposal employee event requires an attributed app user.';
  end if;

  if event_actor_id is not null and event_actor_type = 'employee' then
    select app_user.auth_user_id
    into event_actor_auth_user_id
    from public.app_users as app_user
    where app_user.id = event_actor_id;

    if event_actor_auth_user_id is null then
      raise exception 'Proposal event app user is missing.';
    end if;
  end if;

  select estimate.project_id
  into estimate_project_id
  from public.estimates as estimate
  where estimate.id = new.estimate_id;

  event_idempotency_key := concat(
    'proposal:',
    new.id,
    ':generation:',
    new.issue_generation,
    ':',
    event_name_value
  );

  perform public.record_business_event(
    event_name_value,
    1::smallint,
    event_time_value,
    event_actor_type,
    event_actor_id,
    event_actor_auth_user_id,
    'proposal',
    new.id,
    estimate_project_id,
    new.lead_id,
    new.customer_id,
    'db.estimate_proposal',
    concat(new.id, ':', new.issue_generation, ':', event_name_value),
    event_idempotency_key,
    null,
    null,
    event_metadata,
    'operational'
  );

  return new;
end;
$$;

create trigger log_estimate_proposal_business_event
  after insert or update of status on public.estimate_proposals
  for each row execute function public.log_estimate_proposal_business_event();

create or replace function public.log_estimate_proposal_access_business_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  proposal_record public.estimate_proposals;
  estimate_project_id uuid;
begin
  select *
  into proposal_record
  from public.estimate_proposals
  where id = new.proposal_id;

  if proposal_record.id is null
    or proposal_record.issue_generation is distinct from new.issue_generation
  then
    raise exception 'Proposal access generation does not match the active proposal generation.';
  end if;

  select estimate.project_id
  into estimate_project_id
  from public.estimates as estimate
  where estimate.id = proposal_record.estimate_id;

  perform public.record_business_event(
    'estimating.proposal_access_observed',
    1::smallint,
    new.occurred_at,
    'integration',
    null,
    null,
    'proposal',
    proposal_record.id,
    estimate_project_id,
    proposal_record.lead_id,
    proposal_record.customer_id,
    'db.estimate_proposal_access',
    new.access_id::text,
    concat('proposal-access:', new.access_id),
    null,
    null,
    jsonb_build_object(
      'proposal_generation', new.issue_generation,
      'access_id', new.access_id,
      'client_signal', new.client_signal,
      'suspected_automated', new.suspected_automated
    ),
    'operational'
  );

  return new;
end;
$$;

create trigger log_estimate_proposal_access_business_event
  after insert on public.estimate_proposal_accesses
  for each row execute function public.log_estimate_proposal_access_business_event();

create or replace function public.get_estimate_proposal_by_token(
  requested_token uuid,
  requested_access_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  proposal_payload jsonb;
  proposal_record public.estimate_proposals;
begin
  if requested_access_id is null then
    raise exception 'Proposal access ID is required.';
  end if;

  proposal_payload := public.get_estimate_proposal_by_token(requested_token);

  if proposal_payload is null or proposal_payload ? 'expired' then
    return proposal_payload;
  end if;

  select *
  into proposal_record
  from public.estimate_proposals
  where public_token = requested_token;

  if proposal_record.id is null or proposal_record.status = 'revoked' then
    return null;
  end if;

  if proposal_record.status = 'expired' then
    return jsonb_build_object('expired', true);
  end if;

  insert into public.estimate_proposal_accesses (
    proposal_id,
    issue_generation,
    access_id,
    client_signal,
    suspected_automated,
    occurred_at
  ) values (
    proposal_record.id,
    proposal_record.issue_generation,
    requested_access_id,
    'server_request',
    null,
    now()
  )
  on conflict (access_id) do nothing;

  return proposal_payload;
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
    select 1
    from public.app_users
    where id = requested_app_user_id
      and is_active
  ) then
    raise exception 'Invalid estimate proposal revocation.';
  end if;

  select *
  into proposal_record
  from public.estimate_proposals
  where estimate_id = requested_estimate_id
  for update;

  if proposal_record.id is null
    or proposal_record.status not in ('issued', 'viewed', 'expired')
  then
    raise exception 'No reviewable estimate proposal is available to revoke.';
  end if;

  update public.estimate_proposals
  set
    status = 'revoked',
    revoked_at = now(),
    revoked_by_app_user_id = requested_app_user_id,
    updated_at = now()
  where id = proposal_record.id;

  update public.estimates
  set status = 'draft', updated_at = now()
  where id = requested_estimate_id
    and status in ('sent', 'viewed', 'reviewing', 'expired');

  return jsonb_build_object(
    'status', 'revoked',
    'estimate_status', 'draft',
    'pricing_review_required', proposal_record.status = 'expired'
  );
end;
$$;

revoke all on function public.advance_estimate_proposal_issue_generation()
  from public, anon, authenticated, service_role;
revoke all on function public.prevent_estimate_proposal_access_mutation()
  from public, anon, authenticated, service_role;
revoke all on function public.log_estimate_proposal_business_event()
  from public, anon, authenticated, service_role;
revoke all on function public.log_estimate_proposal_access_business_event()
  from public, anon, authenticated, service_role;

revoke all on function public.get_estimate_proposal_by_token(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.get_estimate_proposal_by_token(uuid, uuid)
  to service_role;

revoke all on function public.revoke_estimate_proposal(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.revoke_estimate_proposal(uuid, uuid)
  to service_role;

comment on function public.get_estimate_proposal_by_token(uuid, uuid) is
  'Returns the existing customer-safe proposal payload and idempotently records one access observation without claiming a verified human view.';

commit;
