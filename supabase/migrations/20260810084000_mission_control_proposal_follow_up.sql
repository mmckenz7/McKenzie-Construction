begin;

do $$
begin
  if to_regclass('public.estimate_proposal_accesses') is null
    or to_regclass('public.business_events') is null
    or to_regclass('public.mission_control_signals') is null
  then
    raise exception 'Mission Control proposal event foundations must be applied first.';
  end if;
end
$$;

alter table public.company_settings
  add column if not exists mission_control_proposal_follow_up_hours integer not null default 72,
  add column if not exists mission_control_proposal_follow_up_accesses integer not null default 2;

alter table public.company_settings
  drop constraint if exists company_settings_mc_proposal_follow_up_hours_check,
  add constraint company_settings_mc_proposal_follow_up_hours_check
    check (mission_control_proposal_follow_up_hours between 1 and 720),
  drop constraint if exists company_settings_mc_proposal_follow_up_accesses_check,
  add constraint company_settings_mc_proposal_follow_up_accesses_check
    check (mission_control_proposal_follow_up_accesses between 1 and 10);

comment on column public.company_settings.mission_control_proposal_follow_up_hours is
  'Calendar hours after issue before confirmed browser access can support a proposal follow-up signal.';
comment on column public.company_settings.mission_control_proposal_follow_up_accesses is
  'Minimum browser-confirmed access observations for a proposal follow-up signal. These remain observations, not verified human identity.';

create or replace function public.confirm_estimate_proposal_browser_access(
  requested_token uuid,
  requested_access_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  proposal_record public.estimate_proposals;
  access_record public.estimate_proposal_accesses;
begin
  if requested_token is null or requested_access_id is null then
    raise exception 'Proposal browser access requires token and access identity.';
  end if;

  select *
  into proposal_record
  from public.estimate_proposals
  where public_token = requested_token
    and status in ('issued', 'viewed')
    and responded_at is null
    and revoked_at is null
    and expires_at > now()
  for share;

  if proposal_record.id is null then
    return jsonb_build_object('recorded', false);
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
    'browser_confirmation',
    false,
    now()
  )
  on conflict (access_id) do nothing
  returning * into access_record;

  if access_record.id is null then
    select *
    into access_record
    from public.estimate_proposal_accesses
    where access_id = requested_access_id;

    if access_record.proposal_id is distinct from proposal_record.id
      or access_record.issue_generation is distinct from proposal_record.issue_generation
      or access_record.client_signal is distinct from 'browser_confirmation'
      or access_record.suspected_automated is distinct from false
    then
      raise exception 'Proposal browser access identity was reused for another fact.';
    end if;
  end if;

  return jsonb_build_object('recorded', true);
end;
$$;

revoke all on function public.confirm_estimate_proposal_browser_access(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.confirm_estimate_proposal_browser_access(uuid, uuid)
  to service_role;

comment on function public.confirm_estimate_proposal_browser_access(uuid, uuid) is
  'Records an idempotent stronger browser access observation without claiming a verified customer identity.';

create or replace function public.evaluate_mission_control_proposal_follow_up_signals(
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
  follow_up_hours integer;
  minimum_accesses integer;
  upsert_count integer := 0;
  resolved_count integer := 0;
begin
  if requested_as_of is null or requested_as_of > now() + interval '5 minutes' then
    raise exception 'Invalid Mission Control proposal follow-up evaluation time.';
  end if;

  select
    (select settings.id from public.company_settings as settings limit 1),
    (select count(*) from public.company_settings),
    (select settings.mission_control_proposal_follow_up_hours from public.company_settings as settings limit 1),
    (select settings.mission_control_proposal_follow_up_accesses from public.company_settings as settings limit 1)
  into resolved_company_id, settings_count, follow_up_hours, minimum_accesses;

  if settings_count <> 1
    or resolved_company_id is null
    or follow_up_hours is null
    or minimum_accesses is null
  then
    raise exception 'Mission Control proposal follow-up evaluation requires exactly one company.';
  end if;

  if exists (
    select 1
    from public.mission_control_signals as signal
    where signal.company_id = resolved_company_id
      and signal.rule_key = 'estimating.proposal_follow_up_opportunity'
      and signal.last_evaluated_at > requested_as_of
  ) then
    raise exception 'Mission Control proposal follow-up evaluation time cannot move backwards.';
  end if;

  with qualifying as (
    select
      proposal.id as proposal_id,
      proposal.issue_generation,
      proposal.lead_id,
      proposal.customer_id,
      proposal.issued_at,
      proposal.expires_at,
      issue_event.id as issue_event_id,
      access_evidence.access_count,
      access_evidence.first_access_at,
      access_evidence.last_access_at,
      access_evidence.event_ids as access_event_ids
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
        and (event.metadata ->> 'proposal_generation')::integer = proposal.issue_generation
      order by event.occurred_at desc, event.id desc
      limit 1
    ) as issue_event on true
    join lateral (
      select
        count(*)::integer as access_count,
        min(access.occurred_at) as first_access_at,
        max(access.occurred_at) as last_access_at,
        jsonb_agg(access_event.id order by access.occurred_at, access.id) as event_ids
      from public.estimate_proposal_accesses as access
      join public.business_events as access_event
        on access_event.company_id = resolved_company_id
       and access_event.event_name = 'estimating.proposal_access_observed'
       and access_event.subject_type = 'proposal'
       and access_event.subject_id = proposal.id
       and access_event.metadata ->> 'access_id' = access.access_id::text
      where access.proposal_id = proposal.id
        and access.issue_generation = proposal.issue_generation
        and access.client_signal = 'browser_confirmation'
        and access.suspected_automated = false
        and access.occurred_at <= requested_as_of
    ) as access_evidence on access_evidence.access_count >= minimum_accesses
    where proposal.status in ('issued', 'viewed')
      and proposal.responded_at is null
      and proposal.revoked_at is null
      and proposal.expires_at > requested_as_of
      and proposal.issued_at <= requested_as_of - make_interval(hours => follow_up_hours)
  )
  insert into public.mission_control_signals (
    company_id, rule_key, rule_version, subject_type, subject_id, dedupe_key,
    status, severity, first_detected_at, last_evaluated_at, due_at,
    evidence, rule_output
  )
  select
    resolved_company_id,
    'estimating.proposal_follow_up_opportunity',
    1,
    'proposal',
    qualifying.proposal_id,
    concat(
      'proposal:', qualifying.proposal_id, ':generation:',
      qualifying.issue_generation, ':follow-up-opportunity'
    ),
    'open',
    'warning',
    requested_as_of,
    requested_as_of,
    qualifying.issued_at + make_interval(hours => follow_up_hours),
    jsonb_strip_nulls(jsonb_build_object(
      'event_ids', jsonb_build_array(qualifying.issue_event_id) || qualifying.access_event_ids,
      'proposal_id', qualifying.proposal_id,
      'proposal_generation', qualifying.issue_generation,
      'lead_id', qualifying.lead_id,
      'customer_id', qualifying.customer_id,
      'issued_at', qualifying.issued_at,
      'expires_at', qualifying.expires_at,
      'first_browser_access_at', qualifying.first_access_at,
      'last_browser_access_at', qualifying.last_access_at,
      'evaluated_at', requested_as_of
    )),
    jsonb_build_object(
      'browser_access_observation_count', qualifying.access_count,
      'minimum_access_observations', minimum_accesses,
      'calendar_hours_since_issue', floor(extract(epoch from (requested_as_of - qualifying.issued_at)) / 3600),
      'verified_human_view', false
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
    resolution_reason = 'proposal_no_longer_needs_follow_up',
    updated_at = now()
  where signal.company_id = resolved_company_id
    and signal.rule_key = 'estimating.proposal_follow_up_opportunity'
    and signal.status not in ('resolved', 'dismissed')
    and not exists (
      select 1
      from public.estimate_proposals as proposal
      join public.business_events as issue_event
        on issue_event.company_id = resolved_company_id
       and issue_event.subject_type = 'proposal'
       and issue_event.subject_id = proposal.id
       and issue_event.event_name in ('estimating.proposal_issued', 'estimating.proposal_reissued')
       and (issue_event.metadata ->> 'proposal_generation')::integer = proposal.issue_generation
      where proposal.id = signal.subject_id
        and proposal.status in ('issued', 'viewed')
        and proposal.responded_at is null
        and proposal.revoked_at is null
        and proposal.expires_at > requested_as_of
        and proposal.issued_at <= requested_as_of - make_interval(hours => follow_up_hours)
        and (
          select count(*)
          from public.estimate_proposal_accesses as access
          join public.business_events as access_event
            on access_event.company_id = resolved_company_id
           and access_event.event_name = 'estimating.proposal_access_observed'
           and access_event.subject_id = proposal.id
           and access_event.metadata ->> 'access_id' = access.access_id::text
          where access.proposal_id = proposal.id
            and access.issue_generation = proposal.issue_generation
            and access.client_signal = 'browser_confirmation'
            and access.suspected_automated = false
            and access.occurred_at <= requested_as_of
        ) >= minimum_accesses
    );

  get diagnostics resolved_count = row_count;

  return jsonb_build_object(
    'as_of', requested_as_of,
    'follow_up_hours', follow_up_hours,
    'minimum_access_observations', minimum_accesses,
    'follow_up_upsert_count', upsert_count,
    'resolved_count', resolved_count
  );
end;
$$;

revoke all on function public.evaluate_mission_control_proposal_follow_up_signals(timestamptz)
  from public, anon, authenticated;
grant execute on function public.evaluate_mission_control_proposal_follow_up_signals(timestamptz)
  to service_role;

comment on function public.evaluate_mission_control_proposal_follow_up_signals(timestamptz) is
  'Evaluates proposal follow-up from current-generation issue and browser-access facts without claiming verified human views.';

commit;
