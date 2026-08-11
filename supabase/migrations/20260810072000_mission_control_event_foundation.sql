begin;

-- Mission Control V0 remains single-company. The existing company_settings row
-- is the temporary company anchor until a first-class companies/membership model
-- is introduced. Fail closed rather than emitting globally unscoped events.
do $$
declare
  settings_count bigint;
begin
  if to_regclass('public.company_settings') is null then
    raise exception 'Mission Control requires public.company_settings.';
  end if;

  select count(*)
  into settings_count
  from public.company_settings;

  if settings_count <> 1 then
    raise exception
      'Mission Control V0 requires exactly one company_settings row; found %.',
      settings_count;
  end if;
end
$$;

create table public.business_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company_settings(id) on delete restrict,
  event_name text not null,
  event_version smallint not null default 1,
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  actor_type text not null,
  actor_id uuid,
  actor_auth_user_id uuid,
  subject_type text not null,
  subject_id uuid not null,
  project_id uuid,
  lead_id uuid,
  customer_id uuid,
  source text not null,
  source_event_id text,
  idempotency_key text not null,
  correlation_id uuid not null default gen_random_uuid(),
  causation_event_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  classification text not null default 'operational',
  constraint business_events_event_name_check
    check (event_name ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
  constraint business_events_event_version_check
    check (event_version between 1 and 32767),
  constraint business_events_actor_type_check
    check (actor_type in (
      'employee',
      'customer',
      'subcontractor',
      'vendor',
      'system',
      'integration'
    )),
  constraint business_events_subject_type_check
    check (subject_type ~ '^[a-z][a-z0-9_]*$'),
  constraint business_events_source_check
    check (source ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$'),
  constraint business_events_source_event_id_check
    check (
      source_event_id is null
      or length(source_event_id) between 1 and 512
    ),
  constraint business_events_idempotency_key_check
    check (length(idempotency_key) between 1 and 512),
  constraint business_events_metadata_object_check
    check (jsonb_typeof(metadata) = 'object'),
  constraint business_events_metadata_size_check
    check (octet_length(metadata::text) <= 16384),
  constraint business_events_classification_check
    check (classification in (
      'operational',
      'financial_restricted',
      'contract_restricted'
    )),
  constraint business_events_occurred_at_check
    check (occurred_at <= recorded_at + interval '1 day'),
  constraint business_events_company_source_idempotency_key
    unique (company_id, source, idempotency_key)
);

comment on table public.business_events is
  'Append-only semantic business facts for deterministic Mission Control signals. Domain tables remain authoritative current state.';
comment on column public.business_events.company_id is
  'Temporary V0 company anchor to the required singleton company_settings row. Replace with a first-class companies key before multi-company enablement.';
comment on column public.business_events.occurred_at is
  'Time the business fact occurred at its authoritative source.';
comment on column public.business_events.recorded_at is
  'Time McKenzie OS persisted the event; distinct from occurred_at for delayed provider events and backfills.';
comment on column public.business_events.metadata is
  'Small allowlisted fact payload. Secrets, public tokens, raw message bodies, documents, and unrestricted request data are prohibited.';

create index business_events_company_occurred_idx
  on public.business_events(company_id, occurred_at desc, id desc);
create index business_events_subject_timeline_idx
  on public.business_events(
    company_id,
    subject_type,
    subject_id,
    occurred_at desc,
    id desc
  );
create index business_events_name_timeline_idx
  on public.business_events(company_id, event_name, occurred_at desc, id desc);
create index business_events_project_timeline_idx
  on public.business_events(company_id, project_id, occurred_at desc, id desc)
  where project_id is not null;
create index business_events_lead_timeline_idx
  on public.business_events(company_id, lead_id, occurred_at desc, id desc)
  where lead_id is not null;
create index business_events_customer_timeline_idx
  on public.business_events(company_id, customer_id, occurred_at desc, id desc)
  where customer_id is not null;
create index business_events_correlation_idx
  on public.business_events(company_id, correlation_id, occurred_at, id);

create or replace function public.prevent_business_event_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception using
    errcode = '55000',
    message = 'business_events is append-only; record a correction event instead';
end;
$$;

create trigger prevent_business_event_mutation
  before update or delete on public.business_events
  for each row execute function public.prevent_business_event_mutation();

create or replace function public.record_business_event(
  requested_event_name text,
  requested_event_version smallint,
  requested_occurred_at timestamptz,
  requested_actor_type text,
  requested_actor_id uuid,
  requested_actor_auth_user_id uuid,
  requested_subject_type text,
  requested_subject_id uuid,
  requested_project_id uuid,
  requested_lead_id uuid,
  requested_customer_id uuid,
  requested_source text,
  requested_source_event_id text,
  requested_idempotency_key text,
  requested_correlation_id uuid,
  requested_causation_event_id uuid,
  requested_metadata jsonb,
  requested_classification text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_company_id uuid;
  settings_count bigint;
  resolved_metadata jsonb := coalesce(requested_metadata, '{}'::jsonb);
  resolved_classification text := coalesce(requested_classification, 'operational');
  event_record public.business_events;
  event_was_created boolean := false;
begin
  select
    (select settings.id from public.company_settings as settings limit 1),
    (select count(*) from public.company_settings)
  into resolved_company_id, settings_count;

  if settings_count <> 1 or resolved_company_id is null then
    raise exception
      'Mission Control V0 requires exactly one company_settings row.';
  end if;

  if requested_event_name is null
    or requested_event_name !~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'
    or requested_event_version is null
    or requested_event_version < 1
    or requested_occurred_at is null
    or requested_occurred_at > now() + interval '1 day'
    or requested_actor_type is null
    or requested_actor_type not in (
      'employee',
      'customer',
      'subcontractor',
      'vendor',
      'system',
      'integration'
    )
    or requested_subject_type is null
    or requested_subject_type !~ '^[a-z][a-z0-9_]*$'
    or requested_subject_id is null
    or requested_source is null
    or requested_source !~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$'
    or requested_idempotency_key is null
    or length(requested_idempotency_key) not between 1 and 512
    or (
      requested_source_event_id is not null
      and length(requested_source_event_id) not between 1 and 512
    )
    or jsonb_typeof(resolved_metadata) <> 'object'
    or octet_length(resolved_metadata::text) > 16384
    or resolved_classification not in (
      'operational',
      'financial_restricted',
      'contract_restricted'
    )
  then
    raise exception 'Invalid business event contract.';
  end if;

  if requested_causation_event_id is not null
    and not exists (
      select 1
      from public.business_events as cause
      where cause.id = requested_causation_event_id
        and cause.company_id = resolved_company_id
    )
  then
    raise exception 'Causation event is missing or belongs to another company.';
  end if;

  insert into public.business_events (
    company_id,
    event_name,
    event_version,
    occurred_at,
    actor_type,
    actor_id,
    actor_auth_user_id,
    subject_type,
    subject_id,
    project_id,
    lead_id,
    customer_id,
    source,
    source_event_id,
    idempotency_key,
    correlation_id,
    causation_event_id,
    metadata,
    classification
  ) values (
    resolved_company_id,
    requested_event_name,
    requested_event_version,
    requested_occurred_at,
    requested_actor_type,
    requested_actor_id,
    requested_actor_auth_user_id,
    requested_subject_type,
    requested_subject_id,
    requested_project_id,
    requested_lead_id,
    requested_customer_id,
    requested_source,
    requested_source_event_id,
    requested_idempotency_key,
    coalesce(requested_correlation_id, gen_random_uuid()),
    requested_causation_event_id,
    resolved_metadata,
    resolved_classification
  )
  on conflict (company_id, source, idempotency_key) do nothing
  returning * into event_record;

  if event_record.id is not null then
    event_was_created := true;
  else
    select *
    into event_record
    from public.business_events
    where company_id = resolved_company_id
      and source = requested_source
      and idempotency_key = requested_idempotency_key;

    if event_record.id is null then
      raise exception 'Business event idempotency conflict could not be resolved.';
    end if;

    if event_record.event_name is distinct from requested_event_name
      or event_record.event_version is distinct from requested_event_version
      or event_record.occurred_at is distinct from requested_occurred_at
      or event_record.actor_type is distinct from requested_actor_type
      or event_record.actor_id is distinct from requested_actor_id
      or event_record.actor_auth_user_id is distinct from requested_actor_auth_user_id
      or event_record.subject_type is distinct from requested_subject_type
      or event_record.subject_id is distinct from requested_subject_id
      or event_record.project_id is distinct from requested_project_id
      or event_record.lead_id is distinct from requested_lead_id
      or event_record.customer_id is distinct from requested_customer_id
      or event_record.source_event_id is distinct from requested_source_event_id
      or (
        requested_correlation_id is not null
        and event_record.correlation_id is distinct from requested_correlation_id
      )
      or event_record.causation_event_id is distinct from requested_causation_event_id
      or event_record.metadata is distinct from resolved_metadata
      or event_record.classification is distinct from resolved_classification
    then
      raise exception
        'Business event idempotency key was reused with a different immutable payload.';
    end if;
  end if;

  return jsonb_build_object(
    'id', event_record.id,
    'company_id', event_record.company_id,
    'created', event_was_created,
    'recorded_at', event_record.recorded_at
  );
end;
$$;

create table public.mission_control_signals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company_settings(id) on delete restrict,
  rule_key text not null,
  rule_version smallint not null default 1,
  subject_type text not null,
  subject_id uuid not null,
  dedupe_key text not null,
  status text not null default 'open',
  severity text not null default 'warning',
  first_detected_at timestamptz not null default now(),
  last_evaluated_at timestamptz not null default now(),
  due_at timestamptz,
  assigned_to_id uuid references public.team_members(id) on delete set null,
  acknowledged_at timestamptz,
  acknowledged_by_id uuid references public.team_members(id) on delete set null,
  snoozed_until timestamptz,
  resolved_at timestamptz,
  resolution_reason text,
  evidence jsonb not null default '{}'::jsonb,
  rule_output jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mission_control_signals_rule_key_check
    check (rule_key ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
  constraint mission_control_signals_rule_version_check
    check (rule_version between 1 and 32767),
  constraint mission_control_signals_subject_type_check
    check (subject_type ~ '^[a-z][a-z0-9_]*$'),
  constraint mission_control_signals_dedupe_key_check
    check (length(dedupe_key) between 1 and 512),
  constraint mission_control_signals_status_check
    check (status in (
      'open',
      'acknowledged',
      'snoozed',
      'resolved',
      'dismissed'
    )),
  constraint mission_control_signals_severity_check
    check (severity in ('info', 'warning', 'urgent', 'critical')),
  constraint mission_control_signals_evidence_object_check
    check (jsonb_typeof(evidence) = 'object'),
  constraint mission_control_signals_evidence_size_check
    check (octet_length(evidence::text) <= 32768),
  constraint mission_control_signals_rule_output_object_check
    check (jsonb_typeof(rule_output) = 'object'),
  constraint mission_control_signals_rule_output_size_check
    check (octet_length(rule_output::text) <= 16384),
  constraint mission_control_signals_evaluation_time_check
    check (last_evaluated_at >= first_detected_at),
  constraint mission_control_signals_lifecycle_check
    check (
      (status = 'open' and resolved_at is null and snoozed_until is null)
      or (
        status = 'acknowledged'
        and acknowledged_at is not null
        and resolved_at is null
        and snoozed_until is null
      )
      or (
        status = 'snoozed'
        and snoozed_until is not null
        and resolved_at is null
      )
      or (
        status in ('resolved', 'dismissed')
        and resolved_at is not null
        and snoozed_until is null
      )
    ),
  constraint mission_control_signals_dismissal_reason_check
    check (
      status <> 'dismissed'
      or nullif(btrim(resolution_reason), '') is not null
    ),
  constraint mission_control_signals_company_dedupe_key
    unique (company_id, dedupe_key)
);

comment on table public.mission_control_signals is
  'Current deterministic attention state. Signals are derived from typed facts and are distinct from events, tasks, and notifications.';
comment on column public.mission_control_signals.evidence is
  'Typed event and source-fact references that explain exactly why the deterministic rule matched.';
comment on column public.mission_control_signals.rule_output is
  'Deterministic template variables and computed values; not an AI-generated conclusion.';

create index mission_control_signals_open_priority_idx
  on public.mission_control_signals(
    company_id,
    severity,
    due_at,
    first_detected_at,
    id
  )
  where status in ('open', 'acknowledged', 'snoozed');
create index mission_control_signals_subject_idx
  on public.mission_control_signals(
    company_id,
    subject_type,
    subject_id,
    status,
    updated_at desc
  );
create index mission_control_signals_rule_idx
  on public.mission_control_signals(
    company_id,
    rule_key,
    rule_version,
    status,
    last_evaluated_at desc
  );

create trigger set_mission_control_signals_updated_at
  before update on public.mission_control_signals
  for each row execute function public.set_updated_at();

alter table public.business_events enable row level security;
alter table public.business_events force row level security;
alter table public.mission_control_signals enable row level security;
alter table public.mission_control_signals force row level security;

revoke all on table public.business_events
  from public, anon, authenticated, service_role;
revoke all on table public.mission_control_signals
  from public, anon, authenticated, service_role;
grant select on table public.business_events to service_role;
grant select, insert, update on table public.mission_control_signals
  to service_role;

revoke all on function public.prevent_business_event_mutation()
  from public, anon, authenticated, service_role;
revoke all on function public.record_business_event(
  text,
  smallint,
  timestamptz,
  text,
  uuid,
  uuid,
  text,
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  text,
  text,
  uuid,
  uuid,
  jsonb,
  text
) from public, anon, authenticated;
grant execute on function public.record_business_event(
  text,
  smallint,
  timestamptz,
  text,
  uuid,
  uuid,
  text,
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  text,
  text,
  uuid,
  uuid,
  jsonb,
  text
) to service_role;

commit;
