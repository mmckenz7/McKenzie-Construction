begin;

do $$
begin
  if to_regclass('public.business_events') is null
    or to_regclass('public.mission_control_signals') is null
    or to_regclass('public.estimate_proposal_accesses') is null
  then
    raise exception 'Mission Control proposal event foundations must be applied first.';
  end if;
end
$$;

alter table public.company_settings
  add column mission_control_proposal_expiry_warning_hours integer
    not null default 24;

alter table public.company_settings
  add constraint company_settings_proposal_expiry_warning_hours_check
  check (mission_control_proposal_expiry_warning_hours between 1 and 168);

comment on column public.company_settings.mission_control_proposal_expiry_warning_hours is
  'Deterministic window for proposal-expiry attention signals. Calendar hours are used; no holiday calendar is implied.';

create or replace function public.expire_due_estimate_proposals(
  requested_as_of timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  proposal_record public.estimate_proposals;
  lead_record public.leads;
  expired_count integer := 0;
  task_count integer := 0;
  inserted_task_count integer;
begin
  if requested_as_of is null
    or requested_as_of > now() + interval '5 minutes'
  then
    raise exception 'Invalid proposal expiration evaluation time.';
  end if;

  for proposal_record in
    select proposal.*
    from public.estimate_proposals as proposal
    where proposal.status in ('issued', 'viewed')
      and proposal.expires_at <= requested_as_of
    order by proposal.expires_at, proposal.id
    for update skip locked
  loop
    update public.estimate_proposals
    set status = 'expired', updated_at = now()
    where id = proposal_record.id
      and status in ('issued', 'viewed');

    if not found then
      continue;
    end if;

    expired_count := expired_count + 1;

    update public.estimates
    set status = 'reviewing', updated_at = now()
    where id = proposal_record.estimate_id
      and status in ('sent', 'viewed');

    if proposal_record.lead_id is null then
      continue;
    end if;

    select *
    into lead_record
    from public.leads
    where id = proposal_record.lead_id;

    if lead_record.id is null
      or lead_record.is_active is distinct from true
      or lead_record.lead_status = 'lost'
    then
      continue;
    end if;

    insert into public.lead_tasks (
      lead_id,
      task_type,
      title,
      description,
      status,
      priority,
      due_at,
      assigned_to_id,
      assigned_at,
      metadata
    )
    select
      proposal_record.lead_id::text,
      'estimate_pricing_review',
      'Review expired estimate pricing',
      'Review current labor, material, subcontractor, tax, and markup pricing before reissuing the estimate.',
      'open',
      'high',
      requested_as_of,
      lead_record.responsible_person_id,
      case
        when lead_record.responsible_person_id is null then null
        else now()
      end,
      jsonb_build_object(
        'estimate_id', proposal_record.estimate_id,
        'estimate_proposal_id', proposal_record.id,
        'proposal_generation', proposal_record.issue_generation,
        'expired_at', proposal_record.expires_at,
        'reason', 'estimate_expired'
      )
    where not exists (
      select 1
      from public.lead_tasks as existing_task
      where existing_task.lead_id = proposal_record.lead_id::text
        and existing_task.task_type = 'estimate_pricing_review'
        and existing_task.status in ('open', 'in_progress')
        and existing_task.metadata @> jsonb_build_object(
          'estimate_id', proposal_record.estimate_id
        )
    );

    get diagnostics inserted_task_count = row_count;
    task_count := task_count + inserted_task_count;

    insert into public.lead_activities (
      lead_id,
      activity_type,
      channel,
      direction,
      summary,
      details,
      metadata
    ) values (
      proposal_record.lead_id::text,
      'estimate_expired',
      'estimate',
      'internal',
      'Estimate expired; pricing review required',
      'The customer link expired without closing the lead. Review current pricing before revising or reissuing the estimate.',
      jsonb_build_object(
        'estimate_id', proposal_record.estimate_id,
        'estimate_proposal_id', proposal_record.id,
        'proposal_generation', proposal_record.issue_generation,
        'lead_remains_active', true,
        'pricing_review_required', true,
        'expiration_source', 'mission_control_scheduler'
      )
    );
  end loop;

  return jsonb_build_object(
    'as_of', requested_as_of,
    'expired_count', expired_count,
    'pricing_review_task_count', task_count
  );
end;
$$;

create or replace function public.evaluate_mission_control_proposal_signals(
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
  expiry_warning_hours integer;
  expiration_result jsonb;
  expiring_upsert_count integer := 0;
  pricing_upsert_count integer := 0;
  resolved_count integer := 0;
  changed_count integer;
begin
  if requested_as_of is null
    or requested_as_of > now() + interval '5 minutes'
  then
    raise exception 'Invalid Mission Control proposal evaluation time.';
  end if;

  select
    (select settings.id from public.company_settings as settings limit 1),
    (select count(*) from public.company_settings),
    (
      select settings.mission_control_proposal_expiry_warning_hours
      from public.company_settings as settings
      limit 1
    )
  into resolved_company_id, settings_count, expiry_warning_hours;

  if settings_count <> 1
    or resolved_company_id is null
    or expiry_warning_hours is null
  then
    raise exception 'Mission Control proposal evaluation requires exactly one company.';
  end if;

  if exists (
    select 1
    from public.mission_control_signals as signal
    where signal.company_id = resolved_company_id
      and signal.rule_key in (
        'estimating.proposal_expiring_soon',
        'estimating.proposal_pricing_review_required'
      )
      and signal.last_evaluated_at > requested_as_of
  ) then
    raise exception 'Mission Control proposal evaluation time cannot move backwards.';
  end if;

  expiration_result := public.expire_due_estimate_proposals(requested_as_of);

  insert into public.mission_control_signals (
    company_id,
    rule_key,
    rule_version,
    subject_type,
    subject_id,
    dedupe_key,
    status,
    severity,
    first_detected_at,
    last_evaluated_at,
    due_at,
    evidence,
    rule_output
  )
  select
    resolved_company_id,
    'estimating.proposal_expiring_soon',
    1,
    'proposal',
    proposal.id,
    concat(
      'proposal:',
      proposal.id,
      ':generation:',
      proposal.issue_generation,
      ':expiring-soon'
    ),
    'open',
    'warning',
    requested_as_of,
    requested_as_of,
    proposal.expires_at,
    jsonb_build_object(
      'event_ids', jsonb_build_array(issue_event.id),
      'proposal_id', proposal.id,
      'proposal_generation', proposal.issue_generation,
      'issued_at', proposal.issued_at,
      'expires_at', proposal.expires_at,
      'evaluated_at', requested_as_of
    ),
    jsonb_build_object(
      'hours_until_expiry', greatest(
        0,
        floor(extract(epoch from (proposal.expires_at - requested_as_of)) / 3600)
      ),
      'expires_at', proposal.expires_at
    )
  from public.estimate_proposals as proposal
  join lateral (
    select event.id
    from public.business_events as event
    where event.company_id = resolved_company_id
      and event.subject_type = 'proposal'
      and event.subject_id = proposal.id
      and event.event_name in (
        'estimating.proposal_issued',
        'estimating.proposal_reissued'
      )
      and (event.metadata ->> 'proposal_generation')::integer =
        proposal.issue_generation
    order by event.occurred_at desc, event.id desc
    limit 1
  ) as issue_event on true
  where proposal.status in ('issued', 'viewed')
    and proposal.response is null
    and proposal.revoked_at is null
    and proposal.expires_at > requested_as_of
    and proposal.expires_at <= requested_as_of
      + make_interval(hours => expiry_warning_hours)
  on conflict (company_id, dedupe_key) do update set
    last_evaluated_at = excluded.last_evaluated_at,
    due_at = excluded.due_at,
    evidence = excluded.evidence,
    rule_output = excluded.rule_output,
    status = case
      when mission_control_signals.status = 'dismissed'
        then 'dismissed'
      when mission_control_signals.status = 'acknowledged'
        then 'acknowledged'
      when mission_control_signals.status = 'snoozed'
        and mission_control_signals.snoozed_until > requested_as_of
        then 'snoozed'
      else 'open'
    end,
    acknowledged_at = case
      when mission_control_signals.status = 'acknowledged'
        then mission_control_signals.acknowledged_at
      else null
    end,
    acknowledged_by_id = case
      when mission_control_signals.status = 'acknowledged'
        then mission_control_signals.acknowledged_by_id
      else null
    end,
    snoozed_until = case
      when mission_control_signals.status = 'snoozed'
        and mission_control_signals.snoozed_until > requested_as_of
        then mission_control_signals.snoozed_until
      else null
    end,
    resolved_at = case
      when mission_control_signals.status = 'dismissed'
        then mission_control_signals.resolved_at
      else null
    end,
    resolution_reason = case
      when mission_control_signals.status = 'dismissed'
        then mission_control_signals.resolution_reason
      else null
    end;

  get diagnostics expiring_upsert_count = row_count;

  insert into public.mission_control_signals (
    company_id,
    rule_key,
    rule_version,
    subject_type,
    subject_id,
    dedupe_key,
    status,
    severity,
    first_detected_at,
    last_evaluated_at,
    due_at,
    evidence,
    rule_output
  )
  select
    resolved_company_id,
    'estimating.proposal_pricing_review_required',
    1,
    'proposal',
    proposal.id,
    concat(
      'proposal:',
      proposal.id,
      ':generation:',
      proposal.issue_generation,
      ':pricing-review-required'
    ),
    'open',
    'urgent',
    requested_as_of,
    requested_as_of,
    proposal.expires_at,
    jsonb_build_object(
      'event_ids', jsonb_build_array(expired_event.id),
      'proposal_id', proposal.id,
      'proposal_generation', proposal.issue_generation,
      'expired_at', proposal.expires_at,
      'evaluated_at', requested_as_of
    ),
    jsonb_build_object(
      'hours_since_expiry', greatest(
        0,
        floor(extract(epoch from (requested_as_of - proposal.expires_at)) / 3600)
      ),
      'expired_at', proposal.expires_at
    )
  from public.estimate_proposals as proposal
  join lateral (
    select event.id
    from public.business_events as event
    where event.company_id = resolved_company_id
      and event.subject_type = 'proposal'
      and event.subject_id = proposal.id
      and event.event_name = 'estimating.proposal_expired'
      and (event.metadata ->> 'proposal_generation')::integer =
        proposal.issue_generation
    order by event.occurred_at desc, event.id desc
    limit 1
  ) as expired_event on true
  where proposal.status = 'expired'
    and proposal.response is null
    and proposal.revoked_at is null
  on conflict (company_id, dedupe_key) do update set
    last_evaluated_at = excluded.last_evaluated_at,
    due_at = excluded.due_at,
    evidence = excluded.evidence,
    rule_output = excluded.rule_output,
    status = case
      when mission_control_signals.status = 'dismissed'
        then 'dismissed'
      when mission_control_signals.status = 'acknowledged'
        then 'acknowledged'
      when mission_control_signals.status = 'snoozed'
        and mission_control_signals.snoozed_until > requested_as_of
        then 'snoozed'
      else 'open'
    end,
    acknowledged_at = case
      when mission_control_signals.status = 'acknowledged'
        then mission_control_signals.acknowledged_at
      else null
    end,
    acknowledged_by_id = case
      when mission_control_signals.status = 'acknowledged'
        then mission_control_signals.acknowledged_by_id
      else null
    end,
    snoozed_until = case
      when mission_control_signals.status = 'snoozed'
        and mission_control_signals.snoozed_until > requested_as_of
        then mission_control_signals.snoozed_until
      else null
    end,
    resolved_at = case
      when mission_control_signals.status = 'dismissed'
        then mission_control_signals.resolved_at
      else null
    end,
    resolution_reason = case
      when mission_control_signals.status = 'dismissed'
        then mission_control_signals.resolution_reason
      else null
    end;

  get diagnostics pricing_upsert_count = row_count;

  update public.mission_control_signals as signal
  set
    status = 'resolved',
    last_evaluated_at = requested_as_of,
    snoozed_until = null,
    resolved_at = requested_as_of,
    resolution_reason = 'proposal_no_longer_expiring_soon'
  where signal.company_id = resolved_company_id
    and signal.rule_key = 'estimating.proposal_expiring_soon'
    and signal.rule_version = 1
    and signal.status in ('open', 'acknowledged', 'snoozed')
    and not exists (
      select 1
      from public.estimate_proposals as proposal
      where proposal.id = signal.subject_id
        and proposal.status in ('issued', 'viewed')
        and proposal.response is null
        and proposal.revoked_at is null
        and proposal.expires_at > requested_as_of
        and proposal.expires_at <= requested_as_of
          + make_interval(hours => expiry_warning_hours)
        and signal.dedupe_key = concat(
          'proposal:',
          proposal.id,
          ':generation:',
          proposal.issue_generation,
          ':expiring-soon'
        )
    );

  get diagnostics changed_count = row_count;
  resolved_count := resolved_count + changed_count;

  update public.mission_control_signals as signal
  set
    status = 'resolved',
    last_evaluated_at = requested_as_of,
    snoozed_until = null,
    resolved_at = requested_as_of,
    resolution_reason = 'proposal_no_longer_requires_pricing_review'
  where signal.company_id = resolved_company_id
    and signal.rule_key = 'estimating.proposal_pricing_review_required'
    and signal.rule_version = 1
    and signal.status in ('open', 'acknowledged', 'snoozed')
    and not exists (
      select 1
      from public.estimate_proposals as proposal
      where proposal.id = signal.subject_id
        and proposal.status = 'expired'
        and proposal.response is null
        and proposal.revoked_at is null
        and signal.dedupe_key = concat(
          'proposal:',
          proposal.id,
          ':generation:',
          proposal.issue_generation,
          ':pricing-review-required'
        )
    );

  get diagnostics changed_count = row_count;
  resolved_count := resolved_count + changed_count;

  return jsonb_build_object(
    'as_of', requested_as_of,
    'expiration', expiration_result,
    'expiring_signal_count', expiring_upsert_count,
    'pricing_review_signal_count', pricing_upsert_count,
    'resolved_signal_count', resolved_count
  );
end;
$$;

revoke all on function public.expire_due_estimate_proposals(timestamptz)
  from public, anon, authenticated;
grant execute on function public.expire_due_estimate_proposals(timestamptz)
  to service_role;

revoke all on function public.evaluate_mission_control_proposal_signals(timestamptz)
  from public, anon, authenticated;
grant execute on function public.evaluate_mission_control_proposal_signals(timestamptz)
  to service_role;

comment on function public.expire_due_estimate_proposals(timestamptz) is
  'Idempotently advances due active proposals to expired and creates the existing pricing-review checkpoint without waiting for public-token access.';
comment on function public.evaluate_mission_control_proposal_signals(timestamptz) is
  'Runs deterministic proposal expiry rules from recorded lifecycle events and typed proposal facts; no AI or free-form note parsing is used.';

commit;
