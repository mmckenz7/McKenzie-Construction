do $$
declare
  required_table text;
  required_column record;
  response_request_fk record;
  activity_constraint_count integer;
  installed_activity_definition text;
  expected_activity_definition text;
  installed_activity_types text[];
  expected_activity_types constant text[] := array[
    'schedule_request_created',
    'schedule_response_submitted',
    'schedule_response_reviewed',
    'material_review_created',
    'material_review_opened',
    'material_review_submitted',
    'material_review_reviewed',
    'material_issue_reported',
    'material_issue_updated',
    'message_created',
    'project_updated',
    'project_note',
    'change_order_created',
    'change_order_updated',
    'change_order_approved',
    'change_order_declined',
    'change_order_completed',
    'change_order_response_reviewed',
    'change_order_approval_sent',
    'change_order_approval_opened',
    'change_order_approval_reminder',
    'change_order_approval_expired',
    'change_order_approval_revoked',
    'change_order_response_archived',
    'change_order_revision_created',
    'change_order_invoiced',
    'change_order_payment_recorded',
    'change_order_payment_updated',
    'change_order_payment_deleted',
    'change_order_paid',
    'change_order_vendor_request_created',
    'change_order_vendor_request_sent',
    'change_order_vendor_request_opened',
    'change_order_vendor_request_reminder',
    'change_order_vendor_response_submitted',
    'change_order_vendor_response_declined',
    'change_order_vendor_request_cancelled',
    'inspection_settings_updated',
    'inspection_research_started',
    'inspection_research_completed',
    'inspection_research_failed',
    'inspection_research_reviewed',
    'inspection_research_applied',
    'inspection_checklist_verified',
    'inspection_created',
    'inspection_requested',
    'inspection_scheduled',
    'inspection_rescheduled',
    'inspection_cancelled',
    'inspection_result_uploaded',
    'inspection_result_confirmed',
    'inspection_passed',
    'inspection_partial_pass',
    'inspection_failed',
    'inspection_reinspection_required',
    'inspection_area_released',
    'inspection_area_blocked',
    'inspection_checklist_reopened',
    'inspection_workflow_activated',
    'inspection_dependency_added',
    'inspection_dependency_removed',
    'inspection_dependency_released',
    'inspection_dependency_blocked',
    'inspection_correction_created',
    'inspection_correction_assigned',
    'inspection_correction_started',
    'inspection_correction_completed',
    'inspection_correction_verified',
    'inspection_correction_reopened',
    'inspection_reinspection_requested',
    'inspection_reinspection_scheduled',
    'inspection_document_uploaded',
    'inspection_document_extraction_started',
    'inspection_document_extraction_completed',
    'inspection_document_extraction_failed',
    'inspection_document_extraction_reviewed',
    'inspection_document_extraction_applied',
    'system'
  ]::text[];
begin
  foreach required_table in array array[
    'project_change_orders',
    'change_order_vendor_requests',
    'change_order_vendor_responses',
    'app_users',
    'project_activity'
  ]::text[] loop
    if to_regclass('public.' || required_table) is null then
      raise exception 'Required audited table public.% is missing.', required_table;
    end if;
  end loop;

  for required_column in
    select *
    from (values
      ('project_change_orders', 'id', 'uuid'),
      ('project_change_orders', 'project_id', 'uuid'),
      ('project_change_orders', 'status', 'text'),
      ('project_change_orders', 'superseded_by_change_order_id', 'uuid'),
      ('change_order_vendor_requests', 'id', 'uuid'),
      ('change_order_vendor_requests', 'change_order_id', 'uuid'),
      ('change_order_vendor_requests', 'project_id', 'uuid'),
      ('change_order_vendor_requests', 'request_status', 'text'),
      ('change_order_vendor_requests', 'expires_at', 'timestamp with time zone'),
      ('change_order_vendor_responses', 'id', 'uuid'),
      ('change_order_vendor_responses', 'request_id', 'uuid'),
      ('change_order_vendor_responses', 'change_order_id', 'uuid'),
      ('change_order_vendor_responses', 'project_id', 'uuid'),
      ('change_order_vendor_responses', 'response_status', 'text'),
      ('change_order_vendor_responses', 'quote_expiration_date', 'date'),
      ('app_users', 'id', 'uuid'),
      ('app_users', 'auth_user_id', 'uuid'),
      ('app_users', 'is_active', 'boolean'),
      ('project_activity', 'id', 'uuid'),
      ('project_activity', 'project_id', 'uuid'),
      ('project_activity', 'activity_type', 'text'),
      ('project_activity', 'title', 'text'),
      ('project_activity', 'description', 'text'),
      ('project_activity', 'actor_type', 'text'),
      ('project_activity', 'actor_app_user_id', 'uuid'),
      ('project_activity', 'source_table', 'text'),
      ('project_activity', 'source_id', 'uuid'),
      ('project_activity', 'metadata', 'jsonb'),
      ('project_activity', 'occurred_at', 'timestamp with time zone')
    ) as required(table_name, column_name, sql_type)
  loop
    if not exists (
      select 1
      from pg_attribute attribute
      join pg_class relation on relation.oid = attribute.attrelid
      join pg_namespace namespace on namespace.oid = relation.relnamespace
      where namespace.nspname = 'public'
        and relation.relname = required_column.table_name
        and attribute.attname = required_column.column_name
        and attribute.attnum > 0
        and not attribute.attisdropped
        and format_type(attribute.atttypid, attribute.atttypmod) = required_column.sql_type
    ) then
      raise exception 'Audited column public.%.% is missing or is not %.',
        required_column.table_name,
        required_column.column_name,
        required_column.sql_type;
    end if;
  end loop;

  select
    constraint_record.conname,
    constraint_record.confdeltype,
    constraint_record.confupdtype
  into response_request_fk
  from pg_constraint constraint_record
  where constraint_record.conrelid = 'public.change_order_vendor_responses'::regclass
    and constraint_record.contype = 'f'
    and constraint_record.confrelid = 'public.change_order_vendor_requests'::regclass
    and constraint_record.conkey = array[
      (
        select attnum
        from pg_attribute
        where attrelid = 'public.change_order_vendor_responses'::regclass
          and attname = 'request_id'
      )::smallint
    ]
    and constraint_record.confkey = array[
      (
        select attnum
        from pg_attribute
        where attrelid = 'public.change_order_vendor_requests'::regclass
          and attname = 'id'
      )::smallint
    ];

  if response_request_fk.conname is distinct from
      'change_order_vendor_responses_request_id_fkey'
    or response_request_fk.confdeltype is distinct from 'c'
    or response_request_fk.confupdtype is distinct from 'a'
  then
    raise exception 'The audited vendor-response request foreign key contract does not match.';
  end if;

  select count(*)
  into activity_constraint_count
  from pg_constraint
  where conrelid = 'public.project_activity'::regclass
    and conname = 'project_activity_type_check'
    and contype = 'c';

  if activity_constraint_count <> 1 then
    raise exception 'The audited project_activity_type_check constraint is missing or ambiguous.';
  end if;

  select pg_get_constraintdef(constraint_record.oid)
  into installed_activity_definition
  from pg_constraint constraint_record
  where constraint_record.conrelid = 'public.project_activity'::regclass
    and constraint_record.conname = 'project_activity_type_check'
    and constraint_record.contype = 'c';

  select
    'CHECK ((activity_type = ANY (ARRAY[' ||
    string_agg(
      quote_literal(activity_type) || '::text',
      ', ' order by ordinal_position
    ) ||
    '])))'
  into expected_activity_definition
  from unnest(expected_activity_types) with ordinality
    as expected(activity_type, ordinal_position);

  if regexp_replace(installed_activity_definition, '\s+', '', 'g')
    is distinct from
    regexp_replace(expected_activity_definition, '\s+', '', 'g')
  then
    raise exception 'The complete installed project_activity_type_check definition differs from the audited contract.';
  end if;

  select array_agg(matches[1] order by matches[1])
  into installed_activity_types
  from pg_constraint constraint_record
  cross join lateral regexp_matches(
    pg_get_constraintdef(constraint_record.oid),
    '''([^'']+)''::text',
    'g'
  ) as matches
  where constraint_record.conrelid = 'public.project_activity'::regclass
    and constraint_record.conname = 'project_activity_type_check';

  if installed_activity_types is distinct from (
    select array_agg(activity_type order by activity_type)
    from unnest(expected_activity_types) as expected(activity_type)
  ) then
    raise exception 'The installed project activity types differ from the audited contract.';
  end if;
end;
$$;

create unique index change_order_vendor_acceptance_change_order_scope_uidx
  on public.project_change_orders (id, project_id);

create unique index change_order_vendor_acceptance_request_scope_uidx
  on public.change_order_vendor_requests (id, change_order_id, project_id);

create unique index change_order_vendor_acceptance_response_scope_uidx
  on public.change_order_vendor_responses (
    id,
    request_id,
    change_order_id,
    project_id
  );

alter table public.project_activity
  drop constraint project_activity_type_check;

alter table public.project_activity
  add constraint project_activity_type_check
  check (activity_type = any (array[
    'schedule_request_created', 'schedule_response_submitted', 'schedule_response_reviewed',
    'material_review_created', 'material_review_opened', 'material_review_submitted',
    'material_review_reviewed', 'material_issue_reported', 'material_issue_updated',
    'message_created', 'project_updated', 'project_note', 'change_order_created',
    'change_order_updated', 'change_order_approved', 'change_order_declined',
    'change_order_completed', 'change_order_response_reviewed', 'change_order_approval_sent',
    'change_order_approval_opened', 'change_order_approval_reminder',
    'change_order_approval_expired', 'change_order_approval_revoked',
    'change_order_response_archived', 'change_order_revision_created', 'change_order_invoiced',
    'change_order_payment_recorded', 'change_order_payment_updated',
    'change_order_payment_deleted', 'change_order_paid',
    'change_order_vendor_request_created', 'change_order_vendor_request_sent',
    'change_order_vendor_request_opened', 'change_order_vendor_request_reminder',
    'change_order_vendor_response_submitted', 'change_order_vendor_response_declined',
    'change_order_vendor_request_cancelled', 'inspection_settings_updated',
    'inspection_research_started', 'inspection_research_completed', 'inspection_research_failed',
    'inspection_research_reviewed', 'inspection_research_applied',
    'inspection_checklist_verified', 'inspection_created', 'inspection_requested',
    'inspection_scheduled', 'inspection_rescheduled', 'inspection_cancelled',
    'inspection_result_uploaded', 'inspection_result_confirmed', 'inspection_passed',
    'inspection_partial_pass', 'inspection_failed', 'inspection_reinspection_required',
    'inspection_area_released', 'inspection_area_blocked', 'inspection_checklist_reopened',
    'inspection_workflow_activated', 'inspection_dependency_added',
    'inspection_dependency_removed', 'inspection_dependency_released',
    'inspection_dependency_blocked', 'inspection_correction_created',
    'inspection_correction_assigned', 'inspection_correction_started',
    'inspection_correction_completed', 'inspection_correction_verified',
    'inspection_correction_reopened', 'inspection_reinspection_requested',
    'inspection_reinspection_scheduled', 'inspection_document_uploaded',
    'inspection_document_extraction_started', 'inspection_document_extraction_completed',
    'inspection_document_extraction_failed', 'inspection_document_extraction_reviewed',
    'inspection_document_extraction_applied', 'system',
    'change_order_vendor_response_accepted'
  ]));

create table public.change_order_vendor_response_acceptances (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  source_change_order_id uuid not null,
  target_change_order_id uuid not null,
  request_id uuid not null,
  response_id uuid not null,
  accepted_by uuid not null,
  accepted_at timestamp with time zone not null default now(),
  created_at timestamp with time zone not null default now(),
  constraint change_order_vendor_response_acceptances_same_draft_check
    check (source_change_order_id = target_change_order_id),
  constraint change_order_vendor_response_acceptances_accepted_by_fkey
    foreign key (accepted_by) references public.app_users(id) on delete restrict,
  constraint change_order_vendor_response_acceptances_change_order_project_fkey
    foreign key (target_change_order_id, project_id)
    references public.project_change_orders(id, project_id) on delete restrict,
  constraint change_order_vendor_response_acceptances_request_scope_fkey
    foreign key (request_id, source_change_order_id, project_id)
    references public.change_order_vendor_requests(id, change_order_id, project_id)
    on delete restrict,
  constraint change_order_vendor_response_acceptances_response_scope_fkey
    foreign key (response_id, request_id, source_change_order_id, project_id)
    references public.change_order_vendor_responses(id, request_id, change_order_id, project_id)
    on delete restrict,
  constraint change_order_vendor_response_acceptances_request_key unique (request_id),
  constraint change_order_vendor_response_acceptances_response_key unique (response_id)
);

comment on table public.change_order_vendor_response_acceptances is
  'Records the deliberately selected vendor response only; it does not apply quoted values.';
comment on column public.change_order_vendor_response_acceptances.source_change_order_id is
  'Equals target_change_order_id for the draft-only acceptance workflow.';
comment on column public.change_order_vendor_response_acceptances.response_id is
  'References the immutable selected quote; acceptance does not apply cost, schedule, line-item, approval, or billing values.';

alter table public.change_order_vendor_response_acceptances enable row level security;
revoke all on table public.change_order_vendor_response_acceptances from public, anon, authenticated;

create or replace function public.accept_change_order_vendor_response(
  requested_project_id uuid,
  requested_change_order_id uuid,
  requested_request_id uuid,
  requested_response_id uuid,
  requested_auth_user_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  app_user_record public.app_users;
  change_order_record public.project_change_orders;
  request_record public.change_order_vendor_requests;
  response_record public.change_order_vendor_responses;
  existing_acceptance public.change_order_vendor_response_acceptances;
  acceptance_record public.change_order_vendor_response_acceptances;
begin
  select * into app_user_record
  from public.app_users
  where auth_user_id = requested_auth_user_id
    and is_active = true;

  if app_user_record.id is null then
    return jsonb_build_object('success', false, 'code', 'inactive_actor');
  end if;

  select * into change_order_record
  from public.project_change_orders
  where id = requested_change_order_id
  for update;

  if change_order_record.id is null
    or change_order_record.project_id <> requested_project_id
  then
    return jsonb_build_object('success', false, 'code', 'not_found');
  end if;

  select * into request_record
  from public.change_order_vendor_requests
  where id = requested_request_id
  for update;

  if request_record.id is null
    or request_record.project_id <> requested_project_id
    or request_record.change_order_id <> requested_change_order_id
  then
    return jsonb_build_object('success', false, 'code', 'not_found');
  end if;

  select * into response_record
  from public.change_order_vendor_responses
  where id = requested_response_id
  for update;

  if response_record.id is null
    or response_record.request_id <> requested_request_id
    or response_record.change_order_id <> requested_change_order_id
    or response_record.project_id <> requested_project_id
  then
    return jsonb_build_object('success', false, 'code', 'not_found');
  end if;

  select * into existing_acceptance
  from public.change_order_vendor_response_acceptances
  where request_id = requested_request_id
    or response_id = requested_response_id
  order by created_at
  limit 1;

  if existing_acceptance.id is not null then
    if existing_acceptance.request_id = requested_request_id
      and existing_acceptance.response_id = requested_response_id
      and existing_acceptance.project_id = requested_project_id
      and existing_acceptance.source_change_order_id = requested_change_order_id
      and existing_acceptance.target_change_order_id = requested_change_order_id
    then
      return jsonb_build_object(
        'success', true,
        'code', 'already_accepted',
        'acceptance_id', existing_acceptance.id,
        'project_id', existing_acceptance.project_id,
        'change_order_id', existing_acceptance.target_change_order_id,
        'request_id', existing_acceptance.request_id,
        'response_id', existing_acceptance.response_id,
        'accepted_by', existing_acceptance.accepted_by,
        'accepted_at', existing_acceptance.accepted_at,
        'already_accepted', true
      );
    end if;

    return jsonb_build_object('success', false, 'code', 'acceptance_conflict');
  end if;

  if change_order_record.status <> 'draft'
    or change_order_record.superseded_by_change_order_id is not null
  then
    return jsonb_build_object('success', false, 'code', 'revision_required');
  end if;

  if request_record.request_status <> 'submitted' then
    return jsonb_build_object('success', false, 'code', 'request_unavailable');
  end if;

  if request_record.expires_at is not null and request_record.expires_at < now() then
    return jsonb_build_object('success', false, 'code', 'request_expired');
  end if;

  if response_record.response_status <> 'submitted' then
    return jsonb_build_object('success', false, 'code', 'response_unavailable');
  end if;

  if response_record.quote_expiration_date is not null
    and response_record.quote_expiration_date < current_date
  then
    return jsonb_build_object('success', false, 'code', 'quote_expired');
  end if;

  insert into public.change_order_vendor_response_acceptances (
    project_id,
    source_change_order_id,
    target_change_order_id,
    request_id,
    response_id,
    accepted_by
  ) values (
    requested_project_id,
    requested_change_order_id,
    requested_change_order_id,
    requested_request_id,
    requested_response_id,
    app_user_record.id
  ) returning * into acceptance_record;

  insert into public.project_activity (
    project_id,
    activity_type,
    title,
    description,
    actor_type,
    actor_app_user_id,
    source_table,
    source_id,
    metadata,
    occurred_at
  ) values (
    requested_project_id,
    'change_order_vendor_response_accepted',
    'Vendor response accepted',
    null,
    'office',
    app_user_record.id,
    'change_order_vendor_response_acceptances',
    acceptance_record.id,
    jsonb_build_object(
      'acceptance_id', acceptance_record.id,
      'request_id', requested_request_id,
      'response_id', requested_response_id,
      'source_change_order_id', requested_change_order_id,
      'target_change_order_id', requested_change_order_id
    ),
    acceptance_record.accepted_at
  );

  return jsonb_build_object(
    'success', true,
    'code', 'accepted',
    'acceptance_id', acceptance_record.id,
    'project_id', acceptance_record.project_id,
    'change_order_id', acceptance_record.target_change_order_id,
    'request_id', acceptance_record.request_id,
    'response_id', acceptance_record.response_id,
    'accepted_by', acceptance_record.accepted_by,
    'accepted_at', acceptance_record.accepted_at,
    'already_accepted', false
  );
end;
$$;

revoke all on function public.accept_change_order_vendor_response(uuid, uuid, uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.accept_change_order_vendor_response(uuid, uuid, uuid, uuid, uuid)
  to service_role;
