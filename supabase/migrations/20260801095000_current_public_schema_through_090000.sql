SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;
CREATE SCHEMA IF NOT EXISTS "public";
ALTER SCHEMA "public" OWNER TO "pg_database_owner";
COMMENT ON SCHEMA "public" IS 'standard public schema';
CREATE OR REPLACE FUNCTION "public"."activate_project_inspection_workflow"("requested_project_id" "uuid", "requested_auth_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  app_user_record public.app_users;
  settings_record public.project_inspection_settings;
  created_count integer;
  total_count integer;
begin
  select *
  into app_user_record
  from public.app_users
  where auth_user_id =
    requested_auth_user_id
  limit 1;

  if app_user_record.id is null then
    raise exception
      'Authenticated application user not found.';
  end if;

  select *
  into settings_record
  from public.project_inspection_settings
  where project_id =
    requested_project_id
  limit 1
  for update;

  if settings_record.id is null then
    raise exception
      'Project inspection settings not found.';
  end if;

  if not settings_record.inspections_enabled then
    raise exception
      'Inspections are disabled for this project.';
  end if;

  if settings_record.contractor_verified_at is null then
    raise exception
      'The contractor must verify the inspection checklist before activating the workflow.';
  end if;

  if exists (
    select 1
    from public.project_inspection_requirements requirement
    where requirement.project_id =
      requested_project_id

      and requirement.contractor_decision in (
        'unreviewed',
        'verify_with_authority'
      )
  ) then
    raise exception
      'The inspection checklist contains unresolved requirements.';
  end if;

  insert into public.project_inspections (
    project_id,
    requirement_id,
    inspection_name,
    inspection_category,
    inspection_status,
    permit_number,
    schedule_blocking_enabled,
    sort_order,
    created_by
  )
  select
    requirement.project_id,
    requirement.id,
    requirement.inspection_name,
    requirement.inspection_category,
    'not_scheduled',
    settings_record.permit_number,
    settings_record.schedule_dependencies_enabled,
    requirement.sort_order,
    app_user_record.id

  from public.project_inspection_requirements requirement

  where requirement.project_id =
    requested_project_id

    and requirement.contractor_decision =
      'required'

  on conflict (
    requirement_id
  )
  where requirement_id is not null
  do nothing;

  get diagnostics created_count =
    row_count;

  select count(*)
  into total_count
  from public.project_inspections inspection
  where inspection.project_id =
    requested_project_id;

  update public.project_inspection_settings
  set
    workflow_activated_at =
      coalesce(
        workflow_activated_at,
        now()
      ),

    workflow_activated_by =
      coalesce(
        workflow_activated_by,
        app_user_record.id
      ),

    updated_at =
      now()

  where id =
    settings_record.id;

  insert into public.project_activity (
    project_id,
    activity_type,
    title,
    actor_type,
    actor_app_user_id,
    source_table,
    source_id,
    metadata,
    occurred_at
  )
  values (
    requested_project_id,
    'inspection_created',
    'Verified inspection workflow activated',
    'office',
    app_user_record.id,
    'project_inspection_settings',
    settings_record.id,
    jsonb_build_object(
      'created_inspection_count',
      created_count,
      'total_inspection_count',
      total_count,
      'schedule_dependencies_enabled',
      settings_record.schedule_dependencies_enabled,
      'partial_pass_enabled',
      settings_record.partial_pass_enabled,
      'document_extraction_enabled',
      settings_record.document_extraction_enabled
    ),
    now()
  );

  return jsonb_build_object(
    'success',
    true,
    'project_id',
    requested_project_id,
    'created_inspection_count',
    created_count,
    'total_inspection_count',
    total_count,
    'workflow_activated_at',
    coalesce(
      settings_record.workflow_activated_at,
      now()
    )
  );
end;
$$;
ALTER FUNCTION "public"."activate_project_inspection_workflow"("requested_project_id" "uuid", "requested_auth_user_id" "uuid") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."add_project_activity_note"("requested_project_id" "uuid", "requested_auth_user_id" "uuid", "requested_title" "text", "requested_description" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  app_user_record public.app_users;
  project_record public.projects;
  activity_record public.project_activity;
  clean_title text;
  clean_description text;
begin
  clean_title :=
    nullif(
      btrim(requested_title),
      ''
    );

  clean_description :=
    nullif(
      btrim(requested_description),
      ''
    );

  if clean_title is null then
    raise exception
      'A note title is required.';
  end if;

  if clean_description is null then
    raise exception
      'Note details are required.';
  end if;

  select *
  into app_user_record
  from public.app_users
  where auth_user_id =
    requested_auth_user_id
  limit 1;

  if app_user_record.id is null then
    raise exception
      'Authenticated application user not found.';
  end if;

  select *
  into project_record
  from public.projects
  where id = requested_project_id
  limit 1;

  if project_record.id is null then
    raise exception
      'Project not found.';
  end if;

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
  )
  values (
    requested_project_id,
    'project_note',
    clean_title,
    clean_description,
    'office',
    app_user_record.id,
    'manual_project_notes',
    gen_random_uuid(),
    jsonb_build_object(
      'manual_note',
      true
    ),
    now()
  )
  returning *
  into activity_record;

  return jsonb_build_object(
    'success',
      true,

    'activity_id',
      activity_record.id,

    'project_id',
      activity_record.project_id,

    'title',
      activity_record.title,

    'description',
      activity_record.description,

    'occurred_at',
      activity_record.occurred_at
  );
end;
$$;
ALTER FUNCTION "public"."add_project_activity_note"("requested_project_id" "uuid", "requested_auth_user_id" "uuid", "requested_title" "text", "requested_description" "text") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."add_workdays"("starting_date" "date", "workdays_to_add" integer) RETURNS "date"
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
declare
  result_date date := starting_date;
  added_days integer := 0;
begin
  if starting_date is null then
    return null;
  end if;

  if workdays_to_add <= 0 then
    return starting_date;
  end if;

  while added_days < workdays_to_add loop
    result_date := result_date + 1;

    if extract(isodow from result_date) between 1 and 5 then
      added_days := added_days + 1;
    end if;
  end loop;

  return result_date;
end;
$$;
ALTER FUNCTION "public"."add_workdays"("starting_date" "date", "workdays_to_add" integer) OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."apply_installer_schedule_response"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if (
    new.status = 'submitted'
    and new.submitted_at is not null
    and (
      old.status is distinct from new.status
      or old.submitted_at is distinct from new.submitted_at
      or old.earliest_demo_start
        is distinct from new.earliest_demo_start
      or old.earliest_construction_start
        is distinct from new.earliest_construction_start
      or old.demo_duration_days
        is distinct from new.demo_duration_days
      or old.total_duration_days
        is distinct from new.total_duration_days
    )
  ) then
    insert into public.project_schedule_readiness (
      project_id,
      installer_earliest_demo_start,
      installer_earliest_construction_start,
      expected_demo_duration_days,
      expected_total_duration_days,
      schedule_status
    )
    values (
      new.project_id,
      new.earliest_demo_start,
      new.earliest_construction_start,
      new.demo_duration_days,
      new.total_duration_days,
      'planning'
    )
    on conflict (project_id) do update
    set
      installer_earliest_demo_start =
        excluded.installer_earliest_demo_start,

      installer_earliest_construction_start =
        excluded.installer_earliest_construction_start,

      expected_demo_duration_days =
        excluded.expected_demo_duration_days,

      expected_total_duration_days =
        excluded.expected_total_duration_days,

      schedule_status =
        case
          when public.project_schedule_readiness.schedule_status in (
            'confirmed',
            'in_progress',
            'completed',
            'on_hold'
          )
            then public.project_schedule_readiness.schedule_status
          else 'planning'
        end,

      updated_at = now();

    perform public.recalculate_project_schedule(
      new.project_id
    );
  end if;

  return new;
end;
$$;
ALTER FUNCTION "public"."apply_installer_schedule_response"() OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."apply_project_inspection_research"("requested_research_run_id" "uuid", "requested_project_id" "uuid", "requested_auth_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  app_user_record public.app_users;
  settings_record public.project_inspection_settings;
  research_record public.project_inspection_research_runs;
  finding_record record;
  requirement_record public.project_inspection_requirements;
  applied_count integer := 0;
  skipped_count integer := 0;
begin
  select *
  into app_user_record
  from public.app_users
  where auth_user_id =
    requested_auth_user_id
  limit 1;

  if app_user_record.id is null then
    raise exception
      'Authenticated application user not found.';
  end if;

  select *
  into settings_record
  from public.project_inspection_settings
  where project_id =
    requested_project_id
  limit 1
  for update;

  if settings_record.id is null then
    raise exception
      'Project inspection settings not found.';
  end if;

  if settings_record.checklist_locked_at is not null then
    raise exception
      'The inspection checklist is locked. Reopen it before applying new research.';
  end if;

  select *
  into research_record
  from public.project_inspection_research_runs
  where id =
    requested_research_run_id

    and project_id =
      requested_project_id
  limit 1
  for update;

  if research_record.id is null then
    raise exception
      'Inspection research run not found.';
  end if;

  if research_record.research_status not in (
    'review_required',
    'completed'
  ) then
    raise exception
      'Inspection research must be completed before it can be applied.';
  end if;

  if exists (
    select 1
    from public.project_inspection_research_findings
    where research_run_id =
      requested_research_run_id

      and finding_type =
        'inspection_requirement'

      and contractor_review_status in (
        'unreviewed',
        'needs_verification'
      )
  ) then
    raise exception
      'Every inspection finding must be accepted, rejected, or modified before applying the research.';
  end if;

  for finding_record in
    select *
    from public.project_inspection_research_findings
    where research_run_id =
      requested_research_run_id

      and finding_type =
        'inspection_requirement'

    order by
      sort_order,
      created_at
  loop
    if finding_record.contractor_review_status =
      'rejected'
    then
      skipped_count :=
        skipped_count + 1;

      continue;
    end if;

    insert into public.project_inspection_requirements (
      project_id,
      inspection_settings_id,
      inspection_key,
      inspection_name,
      inspection_category,
      description,
      source_type,
      researched_requirement_status,
      contractor_decision,
      contractor_notes,
      source_title,
      source_url,
      source_excerpt,
      source_last_verified_at,
      sort_order,
      is_custom,
      created_by,
      reviewed_by,
      reviewed_at
    )
    values (
      requested_project_id,
      settings_record.id,

      coalesce(
        nullif(
          btrim(
            coalesce(
              finding_record.finding_key,
              ''
            )
          ),
          ''
        ),
        'research-' ||
          finding_record.id::text
      ),

      finding_record.finding_title,

      coalesce(
        nullif(
          btrim(
            coalesce(
              finding_record.inspection_category,
              ''
            )
          ),
          ''
        ),
        'general'
      ),

      finding_record.finding_description,

      'research',

      case
        when finding_record.requirement_status =
          'required'
        then 'required'

        when finding_record.requirement_status =
          'not_required'
        then 'not_required'

        when finding_record.requirement_status =
          'unknown'
        then 'unknown'

        else 'suggested'
      end,

      case
        when finding_record.contractor_review_status in (
          'accepted',
          'modified'
        )
          and finding_record.requirement_status =
            'required'
        then 'required'

        when finding_record.contractor_review_status in (
          'accepted',
          'modified'
        )
          and finding_record.requirement_status =
            'not_required'
        then 'not_required'

        else 'unreviewed'
      end,

      finding_record.contractor_review_notes,

      (
        select source.source_title
        from public.project_inspection_research_sources source
        where source.id =
          finding_record.source_id
        limit 1
      ),

      (
        select source.source_url
        from public.project_inspection_research_sources source
        where source.id =
          finding_record.source_id
        limit 1
      ),

      (
        select source.source_excerpt
        from public.project_inspection_research_sources source
        where source.id =
          finding_record.source_id
        limit 1
      ),

      (
        select source.source_accessed_at
        from public.project_inspection_research_sources source
        where source.id =
          finding_record.source_id
        limit 1
      ),

      finding_record.sort_order,

      false,

      app_user_record.id,

      case
        when finding_record.contractor_review_status in (
          'accepted',
          'modified'
        )
        then app_user_record.id
        else null
      end,

      case
        when finding_record.contractor_review_status in (
          'accepted',
          'modified'
        )
        then now()
        else null
      end
    )
    on conflict (
      project_id,
      inspection_key
    )
    do update set
      inspection_name =
        excluded.inspection_name,

      inspection_category =
        excluded.inspection_category,

      description =
        excluded.description,

      source_type =
        excluded.source_type,

      researched_requirement_status =
        excluded.researched_requirement_status,

      contractor_decision =
        excluded.contractor_decision,

      contractor_notes =
        excluded.contractor_notes,

      source_title =
        excluded.source_title,

      source_url =
        excluded.source_url,

      source_excerpt =
        excluded.source_excerpt,

      source_last_verified_at =
        excluded.source_last_verified_at,

      sort_order =
        excluded.sort_order,

      reviewed_by =
        excluded.reviewed_by,

      reviewed_at =
        excluded.reviewed_at,

      updated_at =
        now()

    returning *
    into requirement_record;

    update public.project_inspection_research_findings
    set
      applied_requirement_id =
        requirement_record.id,

      applied_at =
        now()

    where id =
      finding_record.id;

    applied_count :=
      applied_count + 1;
  end loop;

  update public.project_inspection_research_runs
  set
    research_status =
      'completed',

    reviewed_at =
      coalesce(
        reviewed_at,
        now()
      ),

    reviewed_by =
      coalesce(
        reviewed_by,
        app_user_record.id
      ),

    applied_at =
      now(),

    applied_by =
      app_user_record.id

  where id =
    research_record.id;

  update public.project_inspection_settings
  set
    governing_authority_name =
      coalesce(
        research_record.detected_authority_name,
        governing_authority_name
      ),

    governing_authority_type =
      coalesce(
        research_record.detected_authority_type,
        governing_authority_type
      ),

    municipality =
      coalesce(
        research_record.detected_municipality,
        municipality
      ),

    county =
      coalesce(
        research_record.detected_county,
        county
      ),

    state_code =
      coalesce(
        research_record.detected_state_code,
        state_code
      ),

    researched_at =
      coalesce(
        research_record.completed_at,
        now()
      ),

    researched_by =
      app_user_record.id,

    research_source_summary =
      research_record.research_summary,

    research_sources =
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'id',
                source.id,

              'title',
                source.source_title,

              'url',
                source.source_url,

              'type',
                source.source_type,

              'authority',
                source.source_authority_name,

              'accessed_at',
                source.source_accessed_at,

              'primary',
                source.is_primary_authority_source
            )

            order by
              source.is_primary_authority_source desc,
              source.created_at
          )

          from public.project_inspection_research_sources source

          where source.research_run_id =
            requested_research_run_id
        ),
        '[]'::jsonb
      ),

    updated_at =
      now()

  where id =
    settings_record.id;

  insert into public.project_activity (
    project_id,
    activity_type,
    title,
    actor_type,
    actor_app_user_id,
    source_table,
    source_id,
    metadata,
    occurred_at
  )
  values (
    requested_project_id,
    'inspection_research_applied',
    'Municipality inspection research applied to checklist',
    'office',
    app_user_record.id,
    'project_inspection_research_runs',
    research_record.id,
    jsonb_build_object(
      'applied_requirement_count',
        applied_count,

      'skipped_finding_count',
        skipped_count,

      'authority_name',
        research_record.detected_authority_name,

      'municipality',
        research_record.detected_municipality,

      'county',
        research_record.detected_county,

      'state_code',
        research_record.detected_state_code
    ),
    now()
  );

  return jsonb_build_object(
    'success',
      true,

    'research_run_id',
      research_record.id,

    'applied_requirement_count',
      applied_count,

    'skipped_finding_count',
      skipped_count
  );
end;
$$;
ALTER FUNCTION "public"."apply_project_inspection_research"("requested_research_run_id" "uuid", "requested_project_id" "uuid", "requested_auth_user_id" "uuid") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."archive_change_order_response"("requested_change_order_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  change_order_record public.project_change_orders;
  response_record public.project_change_order_responses;
  item_count integer;
begin
  select *
  into change_order_record
  from public.project_change_orders
  where id =
    requested_change_order_id
  limit 1
  for update;

  if change_order_record.id is null then
    raise exception
      'Change order not found.';
  end if;

  if change_order_record.status not in (
    'approved',
    'declined'
  ) then
    return jsonb_build_object(
      'success', true,
      'archived', false,
      'reason',
        'No submitted response exists.'
    );
  end if;

  insert into public.project_change_order_responses (
    change_order_id,
    project_id,
    response,
    customer_name,
    customer_notes,
    agreement_text,
    acknowledged_terms,
    submitted_at,
    submitted_ip,
    submitted_user_agent,
    approval_token,
    change_order_number,
    title,
    description,
    reason,
    amount,
    schedule_impact_days,
    customer_notes_snapshot
  )
  values (
    change_order_record.id,
    change_order_record.project_id,
    change_order_record.status,
    coalesce(
      change_order_record.approved_by_name,
      'Customer'
    ),
    change_order_record.customer_response_notes,
    coalesce(
      change_order_record.customer_agreement_text,
      case
        when change_order_record.status =
          'approved'
        then
          'Customer approved the change order.'
        else
          'Customer declined the change order.'
      end
    ),
    change_order_record.customer_acknowledged_terms,
    coalesce(
      change_order_record.approved_at,
      change_order_record.declined_at,
      change_order_record.updated_at,
      now()
    ),
    change_order_record.customer_response_ip,
    change_order_record.customer_response_user_agent,
    change_order_record.approval_token,
    change_order_record.change_order_number,
    change_order_record.title,
    change_order_record.description,
    change_order_record.reason,
    change_order_record.amount,
    change_order_record.schedule_impact_days,
    change_order_record.customer_notes
  )
  returning *
  into response_record;

  item_count :=
    public.snapshot_change_order_response_items(
      response_record.id,
      change_order_record.id
    );

  insert into public.project_activity (
    project_id,
    activity_type,
    title,
    actor_type,
    source_table,
    source_id,
    metadata,
    occurred_at
  )
  values (
    change_order_record.project_id,
    'change_order_response_archived',
    'Customer change-order response archived',
    'system',
    'project_change_order_responses',
    response_record.id,
    jsonb_build_object(
      'change_order_id',
        change_order_record.id,
      'response_id',
        response_record.id,
      'change_order_number',
        change_order_record.change_order_number,
      'response',
        change_order_record.status,
      'customer_name',
        response_record.customer_name,
      'submitted_at',
        response_record.submitted_at,
      'line_item_count',
        item_count
    ),
    now()
  );

  return jsonb_build_object(
    'success', true,
    'archived', true,
    'response_id',
      response_record.id,
    'line_item_count',
      item_count
  );
end;
$$;
ALTER FUNCTION "public"."archive_change_order_response"("requested_change_order_id" "uuid") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."assign_project_change_order_number"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if new.change_order_number is null
    or new.change_order_number <= 0
  then
    select coalesce(
      max(change_order_number),
      0
    ) + 1
    into new.change_order_number
    from public.project_change_orders
    where project_id = new.project_id;
  end if;

  return new;
end;
$$;
ALTER FUNCTION "public"."assign_project_change_order_number"() OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."assign_project_inspection_correction_number"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  if new.correction_number is null
    or new.correction_number <= 0
  then
    select coalesce(
      max(correction_number),
      0
    ) + 1
    into new.correction_number
    from public.project_inspection_corrections
    where inspection_id =
      new.inspection_id;
  end if;

  return new;
end;
$$;
ALTER FUNCTION "public"."assign_project_inspection_correction_number"() OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."complete_project_inspection_document_extraction"("requested_document_id" "uuid", "requested_project_id" "uuid", "requested_extracted_text" "text", "requested_extracted_data" "jsonb", "requested_confidence_level" "text", "requested_confidence_notes" "text", "requested_findings" "jsonb", "requested_auth_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  app_user_record public.app_users;
  document_record public.project_inspection_documents;
  finding_record record;
  inserted_finding_count integer := 0;
begin
  if requested_confidence_level not in (
    'low',
    'medium',
    'high'
  ) then
    raise exception
      'Invalid extraction confidence level.';
  end if;

  select *
  into app_user_record
  from public.app_users
  where auth_user_id =
    requested_auth_user_id
  limit 1;

  if app_user_record.id is null then
    raise exception
      'Authenticated application user not found.';
  end if;

  select *
  into document_record
  from public.project_inspection_documents
  where id =
    requested_document_id

    and project_id =
      requested_project_id
  limit 1
  for update;

  if document_record.id is null then
    raise exception
      'Inspection document not found.';
  end if;

  delete from public.project_inspection_document_findings
  where document_id =
    document_record.id

    and applied_at is null;

  if requested_findings is not null
    and jsonb_typeof(
      requested_findings
    ) = 'array'
  then
    for finding_record in
      select *
      from jsonb_to_recordset(
        requested_findings
      ) as finding_data (
        finding_type text,
        finding_key text,
        finding_title text,
        finding_value text,
        finding_description text,
        detected_status text,
        detected_date date,
        detected_boolean boolean,
        detected_number numeric,
        detected_data jsonb,
        confidence_level text,
        source_excerpt text,
        page_number integer,
        sort_order integer
      )
    loop
      if finding_record.finding_type not in (
        'inspection_result',
        'inspection_area',
        'correction',
        'reinspection_requirement',
        'inspection_number',
        'inspector',
        'inspection_date',
        'permit_number',
        'general_note',
        'uncertainty'
      ) then
        raise exception
          'Invalid extracted finding type.';
      end if;

      if nullif(
        btrim(
          coalesce(
            finding_record.finding_title,
            ''
          )
        ),
        ''
      ) is null then
        raise exception
          'Every extracted finding must have a title.';
      end if;

      insert into public.project_inspection_document_findings (
        document_id,
        project_id,
        inspection_id,
        finding_type,
        finding_key,
        finding_title,
        finding_value,
        finding_description,
        detected_status,
        detected_date,
        detected_boolean,
        detected_number,
        detected_data,
        confidence_level,
        source_excerpt,
        page_number,
        sort_order
      )
      values (
        document_record.id,
        requested_project_id,
        document_record.inspection_id,
        finding_record.finding_type,
        coalesce(
          nullif(
            btrim(
              coalesce(
                finding_record.finding_key,
                ''
              )
            ),
            ''
          ),
          finding_record.finding_type ||
            '-' ||
            gen_random_uuid()::text
        ),
        btrim(
          finding_record.finding_title
        ),
        nullif(
          btrim(
            coalesce(
              finding_record.finding_value,
              ''
            )
          ),
          ''
        ),
        nullif(
          btrim(
            coalesce(
              finding_record.finding_description,
              ''
            )
          ),
          ''
        ),
        nullif(
          btrim(
            coalesce(
              finding_record.detected_status,
              ''
            )
          ),
          ''
        ),
        finding_record.detected_date,
        finding_record.detected_boolean,
        finding_record.detected_number,
        coalesce(
          finding_record.detected_data,
          '{}'::jsonb
        ),
        coalesce(
          finding_record.confidence_level,
          requested_confidence_level
        ),
        nullif(
          btrim(
            coalesce(
              finding_record.source_excerpt,
              ''
            )
          ),
          ''
        ),
        finding_record.page_number,
        coalesce(
          finding_record.sort_order,
          inserted_finding_count
        )
      );

      inserted_finding_count :=
        inserted_finding_count + 1;
    end loop;
  end if;

  update public.project_inspection_documents
  set
    extraction_status =
      'review_required',

    extraction_completed_at =
      now(),

    extraction_failed_at =
      null,

    extraction_error =
      null,

    extracted_text =
      nullif(
        btrim(
          coalesce(
            requested_extracted_text,
            ''
          )
        ),
        ''
      ),

    extracted_data =
      coalesce(
        requested_extracted_data,
        '{}'::jsonb
      ),

    extraction_confidence =
      requested_confidence_level,

    extraction_confidence_notes =
      nullif(
        btrim(
          coalesce(
            requested_confidence_notes,
            ''
          )
        ),
        ''
      ),

    contractor_review_status =
      'unreviewed',

    contractor_review_notes =
      null,

    reviewed_at =
      null,

    reviewed_by =
      null

  where id =
    document_record.id;

  insert into public.project_activity (
    project_id,
    activity_type,
    title,
    actor_type,
    actor_app_user_id,
    source_table,
    source_id,
    metadata,
    occurred_at
  )
  values (
    requested_project_id,
    'inspection_document_extraction_completed',
    'Inspection document extraction completed',
    'office',
    app_user_record.id,
    'project_inspection_documents',
    document_record.id,
    jsonb_build_object(
      'file_name',
        document_record.file_name,

      'finding_count',
        inserted_finding_count,

      'confidence_level',
        requested_confidence_level,

      'requires_contractor_review',
        true
    ),
    now()
  );

  return jsonb_build_object(
    'success',
      true,

    'document_id',
      document_record.id,

    'extraction_status',
      'review_required',

    'finding_count',
      inserted_finding_count
  );
end;
$$;
ALTER FUNCTION "public"."complete_project_inspection_document_extraction"("requested_document_id" "uuid", "requested_project_id" "uuid", "requested_extracted_text" "text", "requested_extracted_data" "jsonb", "requested_confidence_level" "text", "requested_confidence_notes" "text", "requested_findings" "jsonb", "requested_auth_user_id" "uuid") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."confirm_project_inspection_result"("requested_inspection_id" "uuid", "requested_result_history_id" "uuid", "requested_confirmed_result_status" "text", "requested_confirmation_notes" "text", "requested_auth_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  app_user_record public.app_users;
  inspection_record public.project_inspections;
  history_record public.project_inspection_result_history;
  settings_record public.project_inspection_settings;
  released_dependency_count integer := 0;
  blocked_dependency_count integer := 0;
  released_area_count integer := 0;
  blocked_area_count integer := 0;
begin
  if requested_confirmed_result_status not in (
    'passed',
    'partial_pass',
    'failed'
  ) then
    raise exception
      'Confirmed result must be passed, partial pass, or failed.';
  end if;

  select *
  into app_user_record
  from public.app_users
  where auth_user_id =
    requested_auth_user_id
  limit 1;

  if app_user_record.id is null then
    raise exception
      'Authenticated application user not found.';
  end if;

  select *
  into inspection_record
  from public.project_inspections
  where id =
    requested_inspection_id
  limit 1
  for update;

  if inspection_record.id is null then
    raise exception
      'Inspection not found.';
  end if;

  select *
  into history_record
  from public.project_inspection_result_history
  where id =
    requested_result_history_id

    and inspection_id =
      requested_inspection_id
  limit 1
  for update;

  if history_record.id is null then
    raise exception
      'Inspection result record not found.';
  end if;

  if history_record.contractor_confirmed then
    raise exception
      'This inspection result has already been confirmed.';
  end if;

  select *
  into settings_record
  from public.project_inspection_settings
  where project_id =
    inspection_record.project_id
  limit 1;

  if requested_confirmed_result_status =
      'partial_pass'
    and (
      settings_record.id is null
      or not settings_record.partial_pass_enabled
    )
  then
    raise exception
      'Partial inspection results are disabled for this project.';
  end if;

  if requested_confirmed_result_status =
      'partial_pass'
    and not exists (
      select 1
      from public.project_inspection_areas
      where inspection_id =
        inspection_record.id
    )
  then
    raise exception
      'A partial pass must identify approved and blocked project areas.';
  end if;

  update public.project_inspection_result_history
  set
    result_status =
      requested_confirmed_result_status,

    contractor_confirmed =
      true,

    contractor_confirmed_at =
      now(),

    contractor_confirmed_by =
      app_user_record.id,

    contractor_confirmation_notes =
      nullif(
        btrim(
          coalesce(
            requested_confirmation_notes,
            ''
          )
        ),
        ''
      ),

    extraction_status =
      'confirmed'

  where id =
    history_record.id;

  update public.project_inspections
  set
    inspection_status =
      requested_confirmed_result_status,

    contractor_result_verified_at =
      now(),

    contractor_result_verified_by =
      app_user_record.id,

    contractor_result_verification_notes =
      nullif(
        btrim(
          coalesce(
            requested_confirmation_notes,
            ''
          )
        ),
        ''
      ),

    extraction_status =
      'confirmed',

    updated_at =
      now()

  where id =
    inspection_record.id;

  if requested_confirmed_result_status =
    'passed'
  then
    update public.project_inspection_areas
    set
      result_status =
        'passed',

      work_may_continue =
        true,

      blocked_reason =
        null,

      released_at =
        coalesce(
          released_at,
          now()
        ),

      released_by =
        coalesce(
          released_by,
          app_user_record.id
        ),

      updated_at =
        now()

    where inspection_id =
      inspection_record.id;

    update public.project_inspection_task_dependencies
    set
      is_blocking =
        false,

      released_at =
        coalesce(
          released_at,
          now()
        ),

      released_by =
        coalesce(
          released_by,
          app_user_record.id
        )

    where inspection_id =
      inspection_record.id

      and is_blocking;

    get diagnostics released_dependency_count =
      row_count;

  elsif requested_confirmed_result_status =
    'partial_pass'
  then
    update public.project_inspection_task_dependencies dependency
    set
      is_blocking =
        false,

      released_at =
        coalesce(
          dependency.released_at,
          now()
        ),

      released_by =
        coalesce(
          dependency.released_by,
          app_user_record.id
        )

    from public.project_inspection_areas area

    where dependency.inspection_id =
      inspection_record.id

      and dependency.inspection_area_id =
        area.id

      and area.work_may_continue

      and dependency.is_blocking;

    get diagnostics released_dependency_count =
      row_count;

    update public.project_inspection_task_dependencies dependency
    set
      is_blocking =
        true,

      released_at =
        null,

      released_by =
        null

    from public.project_inspection_areas area

    where dependency.inspection_id =
      inspection_record.id

      and dependency.inspection_area_id =
        area.id

      and not area.work_may_continue;

    get diagnostics blocked_dependency_count =
      row_count;

  else
    update public.project_inspection_areas
    set
      work_may_continue =
        false,

      released_at =
        null,

      released_by =
        null,

      updated_at =
        now()

    where inspection_id =
      inspection_record.id;

    update public.project_inspection_task_dependencies
    set
      is_blocking =
        true,

      released_at =
        null,

      released_by =
        null

    where inspection_id =
      inspection_record.id;

    get diagnostics blocked_dependency_count =
      row_count;
  end if;

  select count(*)
  into released_area_count
  from public.project_inspection_areas
  where inspection_id =
    inspection_record.id

    and work_may_continue;

  select count(*)
  into blocked_area_count
  from public.project_inspection_areas
  where inspection_id =
    inspection_record.id

    and not work_may_continue

    and result_status <>
      'not_applicable';

  insert into public.project_activity (
    project_id,
    activity_type,
    title,
    actor_type,
    actor_app_user_id,
    source_table,
    source_id,
    metadata,
    occurred_at
  )
  values (
    inspection_record.project_id,

    case
      when requested_confirmed_result_status =
        'passed'
      then 'inspection_passed'

      when requested_confirmed_result_status =
        'partial_pass'
      then 'inspection_partial_pass'

      else 'inspection_failed'
    end,

    case
      when requested_confirmed_result_status =
        'passed'
      then inspection_record.inspection_name ||
        ' passed'

      when requested_confirmed_result_status =
        'partial_pass'
      then inspection_record.inspection_name ||
        ' partially passed'

      else inspection_record.inspection_name ||
        ' failed'
    end,

    'office',
    app_user_record.id,
    'project_inspections',
    inspection_record.id,

    jsonb_build_object(
      'result_history_id',
        history_record.id,

      'confirmed_result_status',
        requested_confirmed_result_status,

      'released_area_count',
        released_area_count,

      'blocked_area_count',
        blocked_area_count,

      'released_dependency_count',
        released_dependency_count,

      'blocked_dependency_count',
        blocked_dependency_count,

      'reinspection_required',
        history_record.reinspection_required,

      'reinspection_due_date',
        history_record.reinspection_due_date,

      'confirmation_notes',
        requested_confirmation_notes
    ),

    now()
  );

  if history_record.reinspection_required then
    insert into public.project_activity (
      project_id,
      activity_type,
      title,
      actor_type,
      actor_app_user_id,
      source_table,
      source_id,
      metadata,
      occurred_at
    )
    values (
      inspection_record.project_id,
      'inspection_reinspection_required',
      'Reinspection required for ' ||
        inspection_record.inspection_name,
      'office',
      app_user_record.id,
      'project_inspections',
      inspection_record.id,
      jsonb_build_object(
        'reinspection_due_date',
          history_record.reinspection_due_date,

        'correction_summary',
          history_record.correction_summary
      ),
      now()
    );
  end if;

  return jsonb_build_object(
    'success',
      true,

    'inspection_id',
      inspection_record.id,

    'result_history_id',
      history_record.id,

    'confirmed_result_status',
      requested_confirmed_result_status,

    'released_area_count',
      released_area_count,

    'blocked_area_count',
      blocked_area_count,

    'released_dependency_count',
      released_dependency_count,

    'blocked_dependency_count',
      blocked_dependency_count,

    'reinspection_required',
      history_record.reinspection_required
  );
end;
$$;
ALTER FUNCTION "public"."confirm_project_inspection_result"("requested_inspection_id" "uuid", "requested_result_history_id" "uuid", "requested_confirmed_result_status" "text", "requested_confirmation_notes" "text", "requested_auth_user_id" "uuid") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."create_change_order_revision"("requested_source_change_order_id" "uuid", "requested_auth_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare
  app_user_record public.app_users;
  source_record public.project_change_orders;
  root_change_order_id uuid;
  revision_record public.project_change_orders;
  existing_draft_record public.project_change_orders;
  next_revision_number integer;
  copied_item_count integer;
begin
  select *
  into app_user_record
  from public.app_users
  where auth_user_id =
    requested_auth_user_id
  limit 1;

  if app_user_record.id is null then
    raise exception
      'Authenticated application user not found.';
  end if;

  select *
  into source_record
  from public.project_change_orders
  where id =
    requested_source_change_order_id
  limit 1
  for update;

  if source_record.id is null then
    raise exception
      'Source change order not found.';
  end if;

  if source_record.status = 'draft' then
    raise exception
      'Draft change orders can be edited directly and do not require a revision.';
  end if;

  if source_record.superseded_by_change_order_id is not null then
    raise exception
      'A newer revision already replaces this change order.';
  end if;

  root_change_order_id :=
    coalesce(
      source_record.revised_from_change_order_id,
      source_record.id
    );

  select *
  into existing_draft_record
  from public.project_change_orders
  where
    project_id =
      source_record.project_id

    and status = 'draft'

    and superseded_by_change_order_id
      is null

    and (
      id =
        root_change_order_id

      or revised_from_change_order_id =
        root_change_order_id
    )
  order by
    revision_number desc,
    created_at desc
  limit 1;

  if existing_draft_record.id is not null then
    return jsonb_build_object(
      'success', true,

      'existing_draft',
        true,

      'source_change_order_id',
        source_record.id,

      'revision_change_order_id',
        existing_draft_record.id,

      'revision_change_order_number',
        existing_draft_record.change_order_number,

      'revision_number',
        existing_draft_record.revision_number,

      'copied_line_item_count',
        0
    );
  end if;

  select
    coalesce(
      max(revision_number),
      0
    ) + 1
  into next_revision_number
  from public.project_change_orders
  where
    id =
      root_change_order_id

    or revised_from_change_order_id =
      root_change_order_id;

  insert into public.project_change_orders (
    project_id,
    change_order_number,
    title,
    description,
    reason,
    status,
    amount,
    cost_amount,
    schedule_impact_days,
    customer_notes,
    internal_notes,
    requested_by,
    created_by,
    revised_from_change_order_id,
    revision_number
  )
  values (
    source_record.project_id,
    0,

    regexp_replace(
      source_record.title,
      '\s+—\s+Revision\s+[0-9]+$',
      '',
      'i'
    ) ||
      ' — Revision ' ||
      next_revision_number,

    source_record.description,
    source_record.reason,
    'draft',
    source_record.amount,
    source_record.cost_amount,
    source_record.schedule_impact_days,
    source_record.customer_notes,
    source_record.internal_notes,
    source_record.requested_by,
    app_user_record.id,
    root_change_order_id,
    next_revision_number
  )
  returning *
  into revision_record;

  insert into public.project_change_order_items (
    change_order_id,
    description,
    quantity,
    unit,
    unit_price,
    unit_cost,
    sort_order
  )
  select
    revision_record.id,
    item.description,
    item.quantity,
    item.unit,
    item.unit_price,
    item.unit_cost,
    item.sort_order
  from public.project_change_order_items item
  where item.change_order_id =
    source_record.id
  order by
    item.sort_order,
    item.created_at;

  get diagnostics copied_item_count =
    row_count;

  update public.project_change_orders
  set
    superseded_by_change_order_id =
      revision_record.id,

    superseded_at =
      now(),

    approval_token =
      null,

    approval_sent_at =
      null,

    approval_opened_at =
      null,

    approval_expires_at =
      null,

    approval_reminder_sent_at =
      null,

    approval_reminder_count =
      0,

    updated_at =
      now()

  where id =
    source_record.id;

  insert into public.project_activity (
    project_id,
    activity_type,
    title,
    actor_type,
    actor_app_user_id,
    source_table,
    source_id,
    metadata,
    occurred_at
  )
  values (
    revision_record.project_id,
    'change_order_revision_created',
    'Change-order revision created',
    'office',
    app_user_record.id,
    'project_change_orders',
    revision_record.id,
    jsonb_build_object(
      'source_change_order_id',
        source_record.id,

      'source_change_order_number',
        source_record.change_order_number,

      'revision_change_order_id',
        revision_record.id,

      'revision_change_order_number',
        revision_record.change_order_number,

      'revision_number',
        revision_record.revision_number,

      'copied_line_item_count',
        copied_item_count,

      'source_marked_superseded',
        true,

      'source_approval_link_disabled',
        source_record.approval_token
          is not null
    ),
    now()
  );

  return jsonb_build_object(
    'success', true,

    'existing_draft',
      false,

    'source_change_order_id',
      source_record.id,

    'revision_change_order_id',
      revision_record.id,

    'revision_change_order_number',
      revision_record.change_order_number,

    'revision_number',
      revision_record.revision_number,

    'copied_line_item_count',
      copied_item_count
  );
end;
$_$;
ALTER FUNCTION "public"."create_change_order_revision"("requested_source_change_order_id" "uuid", "requested_auth_user_id" "uuid") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."create_project_inspection_correction"("requested_project_id" "uuid", "requested_inspection_id" "uuid", "requested_result_history_id" "uuid", "requested_inspection_area_id" "uuid", "requested_title" "text", "requested_description" "text", "requested_priority" "text", "requested_due_date" "date", "requested_reinspection_required" boolean, "requested_source_type" "text", "requested_source_excerpt" "text", "requested_auth_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  app_user_record public.app_users;
  inspection_record public.project_inspections;
  area_record public.project_inspection_areas;
  correction_record public.project_inspection_corrections;
begin
  if nullif(
    btrim(
      coalesce(
        requested_title,
        ''
      )
    ),
    ''
  ) is null then
    raise exception
      'Correction title is required.';
  end if;

  if requested_priority not in (
    'low',
    'normal',
    'high',
    'urgent'
  ) then
    raise exception
      'Invalid correction priority.';
  end if;

  if requested_source_type not in (
    'inspection_report',
    'document_extraction',
    'contractor',
    'inspector',
    'custom'
  ) then
    raise exception
      'Invalid correction source type.';
  end if;

  select *
  into app_user_record
  from public.app_users
  where auth_user_id =
    requested_auth_user_id
  limit 1;

  if app_user_record.id is null then
    raise exception
      'Authenticated application user not found.';
  end if;

  select *
  into inspection_record
  from public.project_inspections
  where id =
    requested_inspection_id

    and project_id =
      requested_project_id
  limit 1;

  if inspection_record.id is null then
    raise exception
      'Inspection not found for this project.';
  end if;

  if requested_result_history_id is not null
    and not exists (
      select 1
      from public.project_inspection_result_history history
      where history.id =
        requested_result_history_id

        and history.inspection_id =
          requested_inspection_id

        and history.project_id =
          requested_project_id
    )
  then
    raise exception
      'Inspection result record not found.';
  end if;

  if requested_inspection_area_id is not null then
    select *
    into area_record
    from public.project_inspection_areas
    where id =
      requested_inspection_area_id

      and inspection_id =
        requested_inspection_id

      and project_id =
        requested_project_id
    limit 1;

    if area_record.id is null then
      raise exception
        'Inspection area not found.';
    end if;
  end if;

  insert into public.project_inspection_corrections (
    project_id,
    inspection_id,
    result_history_id,
    inspection_area_id,
    correction_number,
    title,
    description,
    correction_status,
    priority,
    due_date,
    reinspection_required,
    source_type,
    source_excerpt,
    created_by
  )
  values (
    requested_project_id,
    requested_inspection_id,
    requested_result_history_id,
    requested_inspection_area_id,
    null,
    btrim(requested_title),
    nullif(
      btrim(
        coalesce(
          requested_description,
          ''
        )
      ),
      ''
    ),
    'open',
    requested_priority,
    requested_due_date,
    coalesce(
      requested_reinspection_required,
      true
    ),
    requested_source_type,
    nullif(
      btrim(
        coalesce(
          requested_source_excerpt,
          ''
        )
      ),
      ''
    ),
    app_user_record.id
  )
  returning *
  into correction_record;

  if requested_inspection_area_id is not null then
    update public.project_inspection_areas
    set
      work_may_continue =
        false,

      blocked_reason =
        coalesce(
          nullif(
            btrim(
              requested_description
            ),
            ''
          ),
          btrim(
            requested_title
          )
        ),

      correction_notes =
        coalesce(
          correction_notes,
          nullif(
            btrim(
              requested_description
            ),
            ''
          )
        ),

      reinspection_required =
        coalesce(
          requested_reinspection_required,
          true
        ),

      released_at =
        null,

      released_by =
        null,

      updated_at =
        now()

    where id =
      requested_inspection_area_id;
  end if;

  insert into public.project_activity (
    project_id,
    activity_type,
    title,
    actor_type,
    actor_app_user_id,
    source_table,
    source_id,
    metadata,
    occurred_at
  )
  values (
    requested_project_id,
    'inspection_correction_created',
    'Inspection correction created: ' ||
      correction_record.title,
    'office',
    app_user_record.id,
    'project_inspection_corrections',
    correction_record.id,
    jsonb_build_object(
      'inspection_id',
        requested_inspection_id,

      'inspection_name',
        inspection_record.inspection_name,

      'inspection_area_id',
        requested_inspection_area_id,

      'area_name',
        area_record.area_name,

      'correction_number',
        correction_record.correction_number,

      'priority',
        correction_record.priority,

      'due_date',
        correction_record.due_date,

      'reinspection_required',
        correction_record.reinspection_required
    ),
    now()
  );

  return jsonb_build_object(
    'success',
      true,

    'correction_id',
      correction_record.id,

    'correction_number',
      correction_record.correction_number,

    'correction_status',
      correction_record.correction_status,

    'inspection_id',
      correction_record.inspection_id,

    'inspection_area_id',
      correction_record.inspection_area_id
  );
end;
$$;
ALTER FUNCTION "public"."create_project_inspection_correction"("requested_project_id" "uuid", "requested_inspection_id" "uuid", "requested_result_history_id" "uuid", "requested_inspection_area_id" "uuid", "requested_title" "text", "requested_description" "text", "requested_priority" "text", "requested_due_date" "date", "requested_reinspection_required" boolean, "requested_source_type" "text", "requested_source_excerpt" "text", "requested_auth_user_id" "uuid") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."create_project_inspection_document"("requested_project_id" "uuid", "requested_inspection_id" "uuid", "requested_result_history_id" "uuid", "requested_document_type" "text", "requested_file_name" "text", "requested_file_url" "text", "requested_storage_bucket" "text", "requested_storage_path" "text", "requested_mime_type" "text", "requested_file_size_bytes" bigint, "requested_document_date" "date", "requested_source_name" "text", "requested_source_reference" "text", "requested_notes" "text", "requested_auth_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  app_user_record public.app_users;
  settings_record public.project_inspection_settings;
  document_record public.project_inspection_documents;
begin
  if requested_document_type not in (
    'inspection_report',
    'inspection_photo',
    'permit',
    'correction_notice',
    'reinspection_report',
    'municipality_document',
    'other'
  ) then
    raise exception
      'Invalid inspection document type.';
  end if;

  if nullif(
    btrim(
      coalesce(
        requested_file_name,
        ''
      )
    ),
    ''
  ) is null then
    raise exception
      'File name is required.';
  end if;

  if nullif(
    btrim(
      coalesce(
        requested_file_url,
        ''
      )
    ),
    ''
  ) is null then
    raise exception
      'File URL is required.';
  end if;

  select *
  into app_user_record
  from public.app_users
  where auth_user_id =
    requested_auth_user_id
  limit 1;

  if app_user_record.id is null then
    raise exception
      'Authenticated application user not found.';
  end if;

  select *
  into settings_record
  from public.project_inspection_settings
  where project_id =
    requested_project_id
  limit 1;

  if settings_record.id is null then
    raise exception
      'Project inspection settings not found.';
  end if;

  if not settings_record.inspections_enabled then
    raise exception
      'Inspections are disabled for this project.';
  end if;

  if requested_inspection_id is not null
    and not exists (
      select 1
      from public.project_inspections inspection
      where inspection.id =
        requested_inspection_id

        and inspection.project_id =
          requested_project_id
    )
  then
    raise exception
      'Inspection not found for this project.';
  end if;

  if requested_result_history_id is not null
    and not exists (
      select 1
      from public.project_inspection_result_history history
      where history.id =
        requested_result_history_id

        and history.project_id =
          requested_project_id

        and (
          requested_inspection_id is null
          or history.inspection_id =
            requested_inspection_id
        )
    )
  then
    raise exception
      'Inspection result history record not found.';
  end if;

  insert into public.project_inspection_documents (
    project_id,
    inspection_id,
    result_history_id,
    document_type,
    file_name,
    file_url,
    storage_bucket,
    storage_path,
    mime_type,
    file_size_bytes,
    document_date,
    source_name,
    source_reference,
    notes,
    extraction_status,
    created_by
  )
  values (
    requested_project_id,
    requested_inspection_id,
    requested_result_history_id,
    requested_document_type,
    btrim(requested_file_name),
    btrim(requested_file_url),
    nullif(
      btrim(
        coalesce(
          requested_storage_bucket,
          ''
        )
      ),
      ''
    ),
    nullif(
      btrim(
        coalesce(
          requested_storage_path,
          ''
        )
      ),
      ''
    ),
    nullif(
      btrim(
        coalesce(
          requested_mime_type,
          ''
        )
      ),
      ''
    ),
    requested_file_size_bytes,
    requested_document_date,
    nullif(
      btrim(
        coalesce(
          requested_source_name,
          ''
        )
      ),
      ''
    ),
    nullif(
      btrim(
        coalesce(
          requested_source_reference,
          ''
        )
      ),
      ''
    ),
    nullif(
      btrim(
        coalesce(
          requested_notes,
          ''
        )
      ),
      ''
    ),
    case
      when settings_record.document_extraction_enabled
      then 'queued'
      else 'not_started'
    end,
    app_user_record.id
  )
  returning *
  into document_record;

  insert into public.project_activity (
    project_id,
    activity_type,
    title,
    actor_type,
    actor_app_user_id,
    source_table,
    source_id,
    metadata,
    occurred_at
  )
  values (
    requested_project_id,
    'inspection_document_uploaded',
    'Inspection document uploaded: ' ||
      document_record.file_name,
    'office',
    app_user_record.id,
    'project_inspection_documents',
    document_record.id,
    jsonb_build_object(
      'inspection_id',
        document_record.inspection_id,

      'result_history_id',
        document_record.result_history_id,

      'document_type',
        document_record.document_type,

      'file_name',
        document_record.file_name,

      'mime_type',
        document_record.mime_type,

      'file_size_bytes',
        document_record.file_size_bytes,

      'extraction_status',
        document_record.extraction_status
    ),
    now()
  );

  return jsonb_build_object(
    'success',
      true,

    'document_id',
      document_record.id,

    'extraction_status',
      document_record.extraction_status
  );
end;
$$;
ALTER FUNCTION "public"."create_project_inspection_document"("requested_project_id" "uuid", "requested_inspection_id" "uuid", "requested_result_history_id" "uuid", "requested_document_type" "text", "requested_file_name" "text", "requested_file_url" "text", "requested_storage_bucket" "text", "requested_storage_path" "text", "requested_mime_type" "text", "requested_file_size_bytes" bigint, "requested_document_date" "date", "requested_source_name" "text", "requested_source_reference" "text", "requested_notes" "text", "requested_auth_user_id" "uuid") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."create_project_inspection_reinspection"("requested_correction_id" "uuid", "requested_project_id" "uuid", "requested_scheduled_start_at" timestamp with time zone, "requested_scheduled_end_at" timestamp with time zone, "requested_inspector_name" "text", "requested_inspector_department" "text", "requested_inspection_number" "text", "requested_auth_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  app_user_record public.app_users;
  correction_record public.project_inspection_corrections;
  original_inspection public.project_inspections;
  reinspection_record public.project_inspections;
begin
  select *
  into app_user_record
  from public.app_users
  where auth_user_id =
    requested_auth_user_id
  limit 1;

  if app_user_record.id is null then
    raise exception
      'Authenticated application user not found.';
  end if;

  select *
  into correction_record
  from public.project_inspection_corrections
  where id =
    requested_correction_id

    and project_id =
      requested_project_id
  limit 1
  for update;

  if correction_record.id is null then
    raise exception
      'Inspection correction not found.';
  end if;

  if correction_record.correction_status <>
    'verified'
  then
    raise exception
      'The correction must be verified before creating a reinspection.';
  end if;

  if not correction_record.reinspection_required then
    raise exception
      'This correction does not require reinspection.';
  end if;

  if correction_record.reinspection_inspection_id
    is not null
  then
    select *
    into reinspection_record
    from public.project_inspections
    where id =
      correction_record.reinspection_inspection_id;

    return jsonb_build_object(
      'success',
        true,

      'reinspection_id',
        reinspection_record.id,

      'already_existed',
        true
    );
  end if;

  select *
  into original_inspection
  from public.project_inspections
  where id =
    correction_record.inspection_id

    and project_id =
      requested_project_id
  limit 1;

  if original_inspection.id is null then
    raise exception
      'Original inspection not found.';
  end if;

  insert into public.project_inspections (
    project_id,
    requirement_id,
    inspection_name,
    inspection_category,
    inspection_status,
    requested_at,
    scheduled_start_at,
    scheduled_end_at,
    inspector_name,
    inspector_department,
    inspection_number,
    permit_number,
    schedule_blocking_enabled,
    sort_order,
    created_by
  )
  values (
    requested_project_id,
    null,
    original_inspection.inspection_name ||
      ' Reinspection',

    original_inspection.inspection_category,

    case
      when requested_scheduled_start_at
        is null
      then 'requested'
      else 'scheduled'
    end,

    now(),
    requested_scheduled_start_at,
    requested_scheduled_end_at,

    nullif(
      btrim(
        coalesce(
          requested_inspector_name,
          ''
        )
      ),
      ''
    ),

    nullif(
      btrim(
        coalesce(
          requested_inspector_department,
          ''
        )
      ),
      ''
    ),

    nullif(
      btrim(
        coalesce(
          requested_inspection_number,
          ''
        )
      ),
      ''
    ),

    original_inspection.permit_number,

    original_inspection.schedule_blocking_enabled,

    original_inspection.sort_order + 1,

    app_user_record.id
  )
  returning *
  into reinspection_record;

  update public.project_inspection_corrections
  set
    reinspection_requested_at =
      coalesce(
        reinspection_requested_at,
        now()
      ),

    reinspection_scheduled_at =
      case
        when requested_scheduled_start_at
          is null
        then reinspection_scheduled_at
        else now()
      end,

    reinspection_inspection_id =
      reinspection_record.id

  where id =
    correction_record.id;

  insert into public.project_activity (
    project_id,
    activity_type,
    title,
    actor_type,
    actor_app_user_id,
    source_table,
    source_id,
    metadata,
    occurred_at
  )
  values (
    requested_project_id,

    case
      when requested_scheduled_start_at
        is null
      then 'inspection_reinspection_requested'
      else 'inspection_reinspection_scheduled'
    end,

    case
      when requested_scheduled_start_at
        is null
      then 'Reinspection created for ' ||
        original_inspection.inspection_name
      else 'Reinspection scheduled for ' ||
        original_inspection.inspection_name
    end,

    'office',
    app_user_record.id,
    'project_inspections',
    reinspection_record.id,

    jsonb_build_object(
      'original_inspection_id',
        original_inspection.id,

      'correction_id',
        correction_record.id,

      'correction_number',
        correction_record.correction_number,

      'scheduled_start_at',
        requested_scheduled_start_at,

      'scheduled_end_at',
        requested_scheduled_end_at
    ),

    now()
  );

  return jsonb_build_object(
    'success',
      true,

    'reinspection_id',
      reinspection_record.id,

    'inspection_status',
      reinspection_record.inspection_status,

    'scheduled_start_at',
      reinspection_record.scheduled_start_at,

    'already_existed',
      false
  );
end;
$$;
ALTER FUNCTION "public"."create_project_inspection_reinspection"("requested_correction_id" "uuid", "requested_project_id" "uuid", "requested_scheduled_start_at" timestamp with time zone, "requested_scheduled_end_at" timestamp with time zone, "requested_inspector_name" "text", "requested_inspector_department" "text", "requested_inspection_number" "text", "requested_auth_user_id" "uuid") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."create_project_inspection_research_run"("requested_project_id" "uuid", "requested_address" "text", "requested_city" "text", "requested_county" "text", "requested_state_code" "text", "requested_postal_code" "text", "requested_municipality" "text", "requested_authority_name" "text", "requested_authority_type" "text", "requested_project_type" "text", "requested_permit_type" "text", "requested_scope_summary" "text", "requested_auth_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  app_user_record public.app_users;
  settings_record public.project_inspection_settings;
  research_record public.project_inspection_research_runs;
begin
  select *
  into app_user_record
  from public.app_users
  where auth_user_id =
    requested_auth_user_id
  limit 1;

  if app_user_record.id is null then
    raise exception
      'Authenticated application user not found.';
  end if;

  select *
  into settings_record
  from public.project_inspection_settings
  where project_id =
    requested_project_id
  limit 1;

  if settings_record.id is null then
    raise exception
      'Project inspection settings not found.';
  end if;

  if not settings_record.inspections_enabled then
    raise exception
      'Inspections are disabled for this project.';
  end if;

  if not settings_record.municipality_research_enabled then
    raise exception
      'Municipality inspection research is disabled for this project.';
  end if;

  insert into public.project_inspection_research_runs (
    project_id,
    inspection_settings_id,
    research_status,
    requested_address,
    requested_city,
    requested_county,
    requested_state_code,
    requested_postal_code,
    requested_municipality,
    requested_authority_name,
    requested_authority_type,
    requested_project_type,
    requested_permit_type,
    requested_scope_summary,
    started_at,
    created_by
  )
  values (
    requested_project_id,
    settings_record.id,
    'queued',
    nullif(btrim(coalesce(requested_address, '')), ''),
    nullif(btrim(coalesce(requested_city, '')), ''),
    nullif(btrim(coalesce(requested_county, '')), ''),
    nullif(btrim(coalesce(requested_state_code, '')), ''),
    nullif(btrim(coalesce(requested_postal_code, '')), ''),
    nullif(btrim(coalesce(requested_municipality, '')), ''),
    nullif(btrim(coalesce(requested_authority_name, '')), ''),
    nullif(btrim(coalesce(requested_authority_type, '')), ''),
    nullif(btrim(coalesce(requested_project_type, '')), ''),
    nullif(btrim(coalesce(requested_permit_type, '')), ''),
    nullif(btrim(coalesce(requested_scope_summary, '')), ''),
    now(),
    app_user_record.id
  )
  returning *
  into research_record;

  insert into public.project_activity (
    project_id,
    activity_type,
    title,
    actor_type,
    actor_app_user_id,
    source_table,
    source_id,
    metadata,
    occurred_at
  )
  values (
    requested_project_id,
    'inspection_research_started',
    'Municipality inspection research started',
    'office',
    app_user_record.id,
    'project_inspection_research_runs',
    research_record.id,
    jsonb_build_object(
      'municipality',
        research_record.requested_municipality,

      'county',
        research_record.requested_county,

      'state_code',
        research_record.requested_state_code,

      'project_type',
        research_record.requested_project_type,

      'permit_type',
        research_record.requested_permit_type
    ),
    now()
  );

  return jsonb_build_object(
    'success',
      true,

    'research_run_id',
      research_record.id,

    'research_status',
      research_record.research_status
  );
end;
$$;
ALTER FUNCTION "public"."create_project_inspection_research_run"("requested_project_id" "uuid", "requested_address" "text", "requested_city" "text", "requested_county" "text", "requested_state_code" "text", "requested_postal_code" "text", "requested_municipality" "text", "requested_authority_name" "text", "requested_authority_type" "text", "requested_project_type" "text", "requested_permit_type" "text", "requested_scope_summary" "text", "requested_auth_user_id" "uuid") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."expire_change_order_approvals"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  expired_record record;
  expired_count integer := 0;
begin
  for expired_record in
    update public.project_change_orders
    set
      status = 'draft',
      updated_at = now()
    where
      status = 'pending_customer'
      and approval_expires_at is not null
      and approval_expires_at < now()
    returning *
  loop
    expired_count :=
      expired_count + 1;

    insert into public.project_activity (
      project_id,
      activity_type,
      title,
      actor_type,
      source_table,
      source_id,
      metadata,
      occurred_at
    )
    values (
      expired_record.project_id,
      'change_order_approval_expired',
      'Change-order approval link expired',
      'system',
      'project_change_orders',
      gen_random_uuid(),
      jsonb_build_object(
        'change_order_id',
          expired_record.id,
        'change_order_number',
          expired_record.change_order_number,
        'approval_expires_at',
          expired_record.approval_expires_at,
        'previous_status',
          'pending_customer',
        'current_status',
          'draft'
      ),
      now()
    );
  end loop;

  return jsonb_build_object(
    'success', true,
    'expired_count', expired_count
  );
end;
$$;
ALTER FUNCTION "public"."expire_change_order_approvals"() OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."fail_project_inspection_document_extraction"("requested_document_id" "uuid", "requested_project_id" "uuid", "requested_error_message" "text", "requested_auth_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  app_user_record public.app_users;
  document_record public.project_inspection_documents;
begin
  select *
  into app_user_record
  from public.app_users
  where auth_user_id =
    requested_auth_user_id
  limit 1;

  if app_user_record.id is null then
    raise exception
      'Authenticated application user not found.';
  end if;

  select *
  into document_record
  from public.project_inspection_documents
  where id =
    requested_document_id

    and project_id =
      requested_project_id
  limit 1
  for update;

  if document_record.id is null then
    raise exception
      'Inspection document not found.';
  end if;

  update public.project_inspection_documents
  set
    extraction_status =
      'failed',

    extraction_failed_at =
      now(),

    extraction_error =
      coalesce(
        nullif(
          btrim(
            coalesce(
              requested_error_message,
              ''
            )
          ),
          ''
        ),
        'Inspection document extraction failed.'
      )

  where id =
    document_record.id;

  insert into public.project_activity (
    project_id,
    activity_type,
    title,
    actor_type,
    actor_app_user_id,
    source_table,
    source_id,
    metadata,
    occurred_at
  )
  values (
    requested_project_id,
    'inspection_document_extraction_failed',
    'Inspection document extraction failed',
    'office',
    app_user_record.id,
    'project_inspection_documents',
    document_record.id,
    jsonb_build_object(
      'file_name',
        document_record.file_name,

      'error',
        coalesce(
          nullif(
            btrim(
              coalesce(
                requested_error_message,
                ''
              )
            ),
            ''
          ),
          'Inspection document extraction failed.'
        )
    ),
    now()
  );

  return jsonb_build_object(
    'success',
      true,

    'document_id',
      document_record.id,

    'extraction_status',
      'failed'
  );
end;
$$;
ALTER FUNCTION "public"."fail_project_inspection_document_extraction"("requested_document_id" "uuid", "requested_project_id" "uuid", "requested_error_message" "text", "requested_auth_user_id" "uuid") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."get_change_order_by_token"("requested_token" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  change_order_record public.project_change_orders;
  project_record public.projects;
  line_items jsonb;
begin
  select *
  into change_order_record
  from public.project_change_orders
  where approval_token =
    requested_token
  limit 1;

  if change_order_record.id is null then
    return null;
  end if;

  if (
    change_order_record
      .superseded_by_change_order_id
    is not null
  ) then
    return jsonb_build_object(
      'superseded', true,
      'change_order_number',
        change_order_record.change_order_number,
      'title',
        change_order_record.title
    );
  end if;

  if (
    change_order_record.approval_expires_at
      is not null
    and change_order_record.approval_expires_at
      < now()
  ) then
    return jsonb_build_object(
      'expired', true,
      'change_order_number',
        change_order_record.change_order_number,
      'title',
        change_order_record.title
    );
  end if;

  select *
  into project_record
  from public.projects
  where id =
    change_order_record.project_id;

  if (
    change_order_record.approval_opened_at
      is null
    and change_order_record.status =
      'pending_customer'
  ) then
    update public.project_change_orders
    set
      approval_opened_at =
        now(),

      updated_at =
        now()

    where id =
      change_order_record.id

    returning *
    into change_order_record;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id',
          item.id,

        'description',
          item.description,

        'quantity',
          item.quantity,

        'unit',
          item.unit,

        'unit_price',
          item.unit_price,

        'sales_total',
          round(
            item.quantity *
            item.unit_price,
            2
          )
      )
      order by
        item.sort_order,
        item.created_at
    ),
    '[]'::jsonb
  )
  into line_items
  from public.project_change_order_items item
  where item.change_order_id =
    change_order_record.id;

  return jsonb_build_object(
    'id',
      change_order_record.id,

    'change_order_number',
      change_order_record.change_order_number,

    'title',
      change_order_record.title,

    'description',
      change_order_record.description,

    'reason',
      change_order_record.reason,

    'status',
      change_order_record.status,

    'amount',
      change_order_record.amount,

    'schedule_impact_days',
      change_order_record.schedule_impact_days,

    'customer_notes',
      change_order_record.customer_notes,

    'approved_by_name',
      change_order_record.approved_by_name,

    'approved_at',
      change_order_record.approved_at,

    'declined_at',
      change_order_record.declined_at,

    'customer_response_notes',
      change_order_record.customer_response_notes,

    'customer_acknowledged_terms',
      change_order_record.customer_acknowledged_terms,

    'customer_agreement_text',
      change_order_record.customer_agreement_text,

    'approval_sent_at',
      change_order_record.approval_sent_at,

    'approval_opened_at',
      change_order_record.approval_opened_at,

    'approval_expires_at',
      change_order_record.approval_expires_at,

    'line_items',
      line_items,

    'project',
      jsonb_build_object(
        'id',
          project_record.id,

        'name',
          coalesce(
            to_jsonb(project_record)->>'name',
            to_jsonb(project_record)->>'project_name',
            to_jsonb(project_record)->>'title',
            'Project'
          ),

        'address',
          coalesce(
            to_jsonb(project_record)->>'address',
            to_jsonb(project_record)->>'project_address',
            to_jsonb(project_record)->>'job_address',
            ''
          )
      )
  );
end;
$$;
ALTER FUNCTION "public"."get_change_order_by_token"("requested_token" "uuid") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."get_change_order_vendor_request_by_token"("requested_token" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  request_record public.change_order_vendor_requests;
  change_order_record public.project_change_orders;
  project_record public.projects;
begin
  select *
  into request_record
  from public.change_order_vendor_requests
  where request_token =
    requested_token
  limit 1;

  if request_record.id is null then
    return null;
  end if;

  if request_record.request_status in (
    'cancelled',
    'expired'
  ) then
    return jsonb_build_object(
      'unavailable', true,
      'status',
        request_record.request_status,
      'recipient_name',
        request_record.recipient_name
    );
  end if;

  if (
    request_record.expires_at is not null
    and request_record.expires_at < now()
  ) then
    update public.change_order_vendor_requests
    set
      request_status = 'expired',
      updated_at = now()
    where id =
      request_record.id;

    return jsonb_build_object(
      'unavailable', true,
      'status',
        'expired',
      'recipient_name',
        request_record.recipient_name
    );
  end if;

  if request_record.opened_at is null then
    update public.change_order_vendor_requests
    set
      opened_at = now(),

      request_status =
        case
          when request_status = 'sent'
            then 'opened'
          else request_status
        end,

      updated_at = now()

    where id =
      request_record.id

    returning *
    into request_record;
  end if;

  select *
  into change_order_record
  from public.project_change_orders
  where id =
    request_record.change_order_id
  limit 1;

  select *
  into project_record
  from public.projects
  where id =
    request_record.project_id
  limit 1;

  return jsonb_build_object(
    'id',
      request_record.id,

    'request_status',
      request_record.request_status,

    'recipient_type',
      request_record.recipient_type,

    'recipient_name',
      request_record.recipient_name,

    'recipient_company',
      request_record.recipient_company,

    'requested_scope',
      request_record.requested_scope,

    'requested_cost',
      request_record.requested_cost,

    'requested_schedule',
      request_record.requested_schedule,

    'requested_lead_time',
      request_record.requested_lead_time,

    'requested_expiration_date',
      request_record.requested_expiration_date,

    'requested_notes',
      request_record.requested_notes,

    'due_at',
      request_record.due_at,

    'expires_at',
      request_record.expires_at,

    'change_order',
      jsonb_build_object(
        'id',
          change_order_record.id,

        'change_order_number',
          change_order_record.change_order_number,

        'title',
          change_order_record.title,

        'description',
          change_order_record.description,

        'amount',
          change_order_record.amount,

        'schedule_impact_days',
          change_order_record.schedule_impact_days
      ),

    'project',
      jsonb_build_object(
        'id',
          project_record.id,

        'name',
          coalesce(
            to_jsonb(project_record)->>'name',
            to_jsonb(project_record)->>'project_name',
            to_jsonb(project_record)->>'title',
            'Project'
          ),

        'address',
          coalesce(
            to_jsonb(project_record)->>'address',
            to_jsonb(project_record)->>'project_address',
            to_jsonb(project_record)->>'job_address',
            ''
          )
      )
  );
end;
$$;
ALTER FUNCTION "public"."get_change_order_vendor_request_by_token"("requested_token" "uuid") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."get_company_change_order_billing_summary"("requested_auth_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
declare
  effective_access jsonb;
  company_count integer;
  tenant_column_count integer;
  result jsonb;
begin
  if requested_auth_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.app_users as app_user
    inner join public.team_members as team_member
      on team_member.id = app_user.team_member_id
      or team_member.auth_user_id = app_user.auth_user_id
    where app_user.auth_user_id = requested_auth_user_id
      and app_user.is_active = true
      and team_member.status = 'active'
  ) then
    raise exception 'An active employee account is required.' using errcode = '42501';
  end if;

  effective_access := to_jsonb(
    public.get_effective_user_access(requested_auth_user_id)
  );

  if jsonb_typeof(effective_access -> 'portal_access' -> 'operations')
      is distinct from 'boolean'
    or effective_access -> 'portal_access' -> 'operations'
      is distinct from 'true'::jsonb then
    raise exception 'Operations workspace access is required.' using errcode = '42501';
  end if;

  if coalesce(effective_access ->> 'role', '') not in (
      'owner',
      'administrator'
    )
    and (
      jsonb_typeof(effective_access -> 'permissions' -> 'view_costs')
        is distinct from 'boolean'
      or effective_access -> 'permissions' -> 'view_costs'
        is distinct from 'true'::jsonb
    ) then
    raise exception
      'Owner, administrator, or view_costs permission is required for financial reporting.'
      using errcode = '42501';
  end if;

  select count(*)
  into company_count
  from public.company_settings;

  if company_count <> 1 then
    raise exception
      'Change-order company reporting requires exactly one company_settings row; tenant ownership columns are required before enabling multiple companies.'
      using errcode = '55000';
  end if;

  select count(*)
  into tenant_column_count
  from information_schema.columns
  where table_schema = 'public'
    and table_name in (
      'app_users',
      'team_members',
      'customers',
      'projects',
      'project_change_orders',
      'project_change_order_payments'
    )
    and column_name in (
      'company_id',
      'tenant_id',
      'workspace_id',
      'organization_id'
    );

  if tenant_column_count <> 0 then
    raise exception
      'Tenant ownership columns now exist; replace singleton company reporting before using this function.'
      using errcode = '55000';
  end if;

  with payment_totals as (
    select
      payment.change_order_id,
      coalesce(sum(payment.amount), 0) as amount_paid
    from public.project_change_order_payments as payment
    group by payment.change_order_id
  ), eligible_change_orders as (
    select
      change_order.amount,
      coalesce(payment_total.amount_paid, 0) as amount_paid,
      change_order.invoice_due_date,
      change_order.invoiced_at is not null as is_billed
    from public.project_change_orders as change_order
    left join payment_totals as payment_total
      on payment_total.change_order_id = change_order.id
    where change_order.superseded_by_change_order_id is null
      and change_order.status in ('approved', 'in_progress', 'completed')
      and change_order.billing_status is distinct from 'void'
  ), normalized as (
    select
      greatest(coalesce(amount, 0), 0) as amount,
      greatest(coalesce(amount_paid, 0), 0) as amount_paid,
      greatest(coalesce(amount, 0) - coalesce(amount_paid, 0), 0) as balance_due,
      invoice_due_date,
      is_billed
    from eligible_change_orders
  )
  select jsonb_build_object(
    'approved_amount', coalesce(sum(amount), 0),
    'invoiced_amount', coalesce(sum(amount) filter (where is_billed), 0),
    'collected_amount', coalesce(sum(amount_paid) filter (where is_billed), 0),
    'balance_due', coalesce(sum(balance_due) filter (where is_billed), 0),
    'not_billed_amount', coalesce(sum(amount) filter (where not is_billed), 0),
    'overdue_amount', coalesce(sum(balance_due) filter (
      where is_billed
        and balance_due > 0
        and invoice_due_date < current_date
    ), 0),
    'invoice_count', count(*) filter (where is_billed),
    'unpaid_invoice_count', count(*) filter (where is_billed and balance_due > 0),
    'paid_invoice_count', count(*) filter (where is_billed and balance_due = 0),
    'overdue_invoice_count', count(*) filter (
      where is_billed
        and balance_due > 0
        and invoice_due_date < current_date
    ),
    'not_billed_count', count(*) filter (where not is_billed),
    'collection_percent', case
      when coalesce(sum(amount) filter (where is_billed), 0) > 0
      then round(
        coalesce(sum(amount_paid) filter (where is_billed), 0)
        / (sum(amount) filter (where is_billed))
        * 100,
        1
      )
      else 0
    end
  )
  into result
  from normalized;

  return result;
end;
$$;
ALTER FUNCTION "public"."get_company_change_order_billing_summary"("requested_auth_user_id" "uuid") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."get_company_change_order_receivables"("requested_auth_user_id" "uuid") RETURNS TABLE("change_order_id" "uuid", "project_id" "uuid", "change_order_number" integer, "title" "text", "status" "text", "billing_status" "text", "invoice_number" "text", "invoiced_at" timestamp with time zone, "invoice_due_date" "date", "amount" numeric, "amount_paid" numeric, "balance_due" numeric, "is_overdue" boolean, "days_overdue" integer)
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
declare
  effective_access jsonb;
  company_count integer;
  tenant_column_count integer;
begin
  if requested_auth_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.app_users as app_user
    inner join public.team_members as team_member
      on team_member.id = app_user.team_member_id
      or team_member.auth_user_id = app_user.auth_user_id
    where app_user.auth_user_id = requested_auth_user_id
      and app_user.is_active = true
      and team_member.status = 'active'
  ) then
    raise exception 'An active employee account is required.' using errcode = '42501';
  end if;

  effective_access := to_jsonb(
    public.get_effective_user_access(requested_auth_user_id)
  );

  if jsonb_typeof(effective_access -> 'portal_access' -> 'operations')
      is distinct from 'boolean'
    or effective_access -> 'portal_access' -> 'operations'
      is distinct from 'true'::jsonb then
    raise exception 'Operations workspace access is required.' using errcode = '42501';
  end if;

  if coalesce(effective_access ->> 'role', '') not in (
      'owner',
      'administrator'
    )
    and (
      jsonb_typeof(effective_access -> 'permissions' -> 'view_costs')
        is distinct from 'boolean'
      or effective_access -> 'permissions' -> 'view_costs'
        is distinct from 'true'::jsonb
    ) then
    raise exception
      'Owner, administrator, or view_costs permission is required for financial reporting.'
      using errcode = '42501';
  end if;

  select count(*)
  into company_count
  from public.company_settings;

  if company_count <> 1 then
    raise exception
      'Change-order company reporting requires exactly one company_settings row; tenant ownership columns are required before enabling multiple companies.'
      using errcode = '55000';
  end if;

  select count(*)
  into tenant_column_count
  from information_schema.columns
  where table_schema = 'public'
    and table_name in (
      'app_users',
      'team_members',
      'customers',
      'projects',
      'project_change_orders',
      'project_change_order_payments'
    )
    and column_name in (
      'company_id',
      'tenant_id',
      'workspace_id',
      'organization_id'
    );

  if tenant_column_count <> 0 then
    raise exception
      'Tenant ownership columns now exist; replace singleton company reporting before using this function.'
      using errcode = '55000';
  end if;

  return query
  with payment_totals as (
    select
      payment.change_order_id,
      coalesce(sum(payment.amount), 0) as amount_paid
    from public.project_change_order_payments as payment
    group by payment.change_order_id
  )
  select
    change_order.id,
    change_order.project_id,
    change_order.change_order_number,
    change_order.title,
    change_order.status,
    change_order.billing_status,
    change_order.invoice_number,
    change_order.invoiced_at,
    change_order.invoice_due_date,
    greatest(coalesce(change_order.amount, 0), 0),
    greatest(coalesce(payment_total.amount_paid, 0), 0),
    greatest(
      coalesce(change_order.amount, 0) - coalesce(payment_total.amount_paid, 0),
      0
    ),
    coalesce(change_order.invoice_due_date < current_date, false),
    case
      when change_order.invoice_due_date < current_date
      then current_date - change_order.invoice_due_date
      else null
    end
  from public.project_change_orders as change_order
  left join payment_totals as payment_total
    on payment_total.change_order_id = change_order.id
  where change_order.superseded_by_change_order_id is null
    and change_order.status in ('approved', 'in_progress', 'completed')
    and change_order.billing_status is distinct from 'void'
    and change_order.invoiced_at is not null
    and greatest(
      coalesce(change_order.amount, 0) - coalesce(payment_total.amount_paid, 0),
      0
    ) > 0
  order by
    change_order.invoice_due_date asc nulls last,
    change_order.invoiced_at asc nulls last,
    change_order.change_order_number asc;
end;
$$;
ALTER FUNCTION "public"."get_company_change_order_receivables"("requested_auth_user_id" "uuid") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."get_company_change_order_summary"() RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select jsonb_build_object(
    'total_count',
      count(*),

    'draft_count',
      count(*) filter (
        where status = 'draft'
      ),

    'pending_count',
      count(*) filter (
        where status = 'pending_customer'
      ),

    'approved_count',
      count(*) filter (
        where status in (
          'approved',
          'in_progress',
          'completed'
        )
      ),

    'declined_count',
      count(*) filter (
        where status = 'declined'
      ),

    'draft_amount',
      coalesce(
        sum(amount) filter (
          where status = 'draft'
        ),
        0
      ),

    'pending_amount',
      coalesce(
        sum(amount) filter (
          where status = 'pending_customer'
        ),
        0
      ),

    'approved_amount',
      coalesce(
        sum(amount) filter (
          where status in (
            'approved',
            'in_progress',
            'completed'
          )
        ),
        0
      ),

    'approved_cost',
      coalesce(
        sum(cost_amount) filter (
          where status in (
            'approved',
            'in_progress',
            'completed'
          )
        ),
        0
      ),

    'approved_profit',
      coalesce(
        sum(
          amount - cost_amount
        ) filter (
          where status in (
            'approved',
            'in_progress',
            'completed'
          )
        ),
        0
      ),

    'approved_margin_percent',
      case
        when coalesce(
          sum(amount) filter (
            where status in (
              'approved',
              'in_progress',
              'completed'
            )
          ),
          0
        ) = 0
        then 0
        else round(
          (
            coalesce(
              sum(
                amount - cost_amount
              ) filter (
                where status in (
                  'approved',
                  'in_progress',
                  'completed'
                )
              ),
              0
            )
            /
            coalesce(
              sum(amount) filter (
                where status in (
                  'approved',
                  'in_progress',
                  'completed'
                )
              ),
              1
            )
          ) * 100,
          2
        )
      end,

    'approved_schedule_impact_days',
      coalesce(
        sum(schedule_impact_days) filter (
          where status in (
            'approved',
            'in_progress',
            'completed'
          )
        ),
        0
      ),

    'awaiting_customer_count',
      count(*) filter (
        where
          status = 'pending_customer'
          and approval_token is not null
      ),

    'unopened_approval_count',
      count(*) filter (
        where
          status = 'pending_customer'
          and approval_token is not null
          and approval_opened_at is null
      ),

    'expired_approval_count',
      count(*) filter (
        where
          status = 'pending_customer'
          and approval_expires_at is not null
          and approval_expires_at < now()
      )
  )
  from public.active_project_change_orders;
$$;
ALTER FUNCTION "public"."get_company_change_order_summary"() OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."get_effective_feature_map"("requested_scope_type" "text" DEFAULT 'global'::"text", "requested_scope_id" "text" DEFAULT 'default'::"text") RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  with effective_settings as (
    select *
    from public.get_feature_settings(
      requested_scope_type,
      requested_scope_id
    )
  ),

  feature_values as (
    select
      feature_key,

      case
        when feature_key = 'change_orders'
        then is_enabled

        when feature_key like 'change_order_%'
        then
          is_enabled
          and coalesce(
            (
              select parent.is_enabled
              from effective_settings parent
              where parent.feature_key =
                'change_orders'
              limit 1
            ),
            true
          )

        else is_enabled
      end as effective_enabled

    from effective_settings
  )

  select coalesce(
    jsonb_object_agg(
      feature_key,
      effective_enabled
    ),
    '{}'::jsonb
  )

  from feature_values;
$$;
ALTER FUNCTION "public"."get_effective_feature_map"("requested_scope_type" "text", "requested_scope_id" "text") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."get_effective_user_access"("requested_auth_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  user_record public.app_users;
  role_record public.role_permission_defaults;
begin
  select *
  into user_record
  from public.app_users
  where auth_user_id = requested_auth_user_id
    and is_active = true;

  if user_record.id is null then
    return null;
  end if;

  select *
  into role_record
  from public.role_permission_defaults
  where role = user_record.role;

  return jsonb_build_object(
    'user_id', user_record.id,
    'auth_user_id', user_record.auth_user_id,
    'team_member_id', user_record.team_member_id,
    'display_name', user_record.display_name,
    'email', user_record.email,
    'phone', user_record.phone,
    'role', user_record.role,
    'default_portal', user_record.default_portal,
    'preferred_language', user_record.preferred_language,
    'portal_access',
      coalesce(role_record.portal_access, '{}'::jsonb),
    'permissions',
      coalesce(role_record.permissions, '{}'::jsonb)
      || coalesce(user_record.permissions, '{}'::jsonb)
  );
end;
$$;
ALTER FUNCTION "public"."get_effective_user_access"("requested_auth_user_id" "uuid") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."get_feature_settings"("requested_scope_type" "text" DEFAULT 'global'::"text", "requested_scope_id" "text" DEFAULT 'default'::"text") RETURNS TABLE("feature_key" "text", "display_name" "text", "description" "text", "category" "text", "sort_order" integer, "is_enabled" boolean, "is_overridden" boolean)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  with global_settings as (
    select *
    from public.feature_settings
    where
      scope_type = 'global'
      and scope_id = 'default'
  ),

  scoped_settings as (
    select *
    from public.feature_settings
    where
      scope_type =
        requested_scope_type

      and scope_id =
        requested_scope_id
  )

  select
    global_setting.feature_key,

    global_setting.display_name,

    global_setting.description,

    global_setting.category,

    global_setting.sort_order,

    coalesce(
      scoped_setting.is_enabled,
      global_setting.is_enabled
    ) as is_enabled,

    scoped_setting.id is not null
      as is_overridden

  from global_settings global_setting

  left join scoped_settings scoped_setting
    on scoped_setting.feature_key =
      global_setting.feature_key

  order by
    global_setting.category,
    global_setting.sort_order,
    global_setting.display_name;
$$;
ALTER FUNCTION "public"."get_feature_settings"("requested_scope_type" "text", "requested_scope_id" "text") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."get_material_review_by_token"("requested_token" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  review_record public.subcontractor_material_reviews;
  project_record public.projects;
  subcontractor_record public.team_members;
  review_items jsonb;
  review_issues jsonb;
begin
  select *
  into review_record
  from public.subcontractor_material_reviews
  where secure_token = requested_token
  limit 1;

  if review_record.id is null then
    return null;
  end if;

  if (
    review_record.expires_at is not null
    and review_record.expires_at < now()
  ) then
    update public.subcontractor_material_reviews
    set status = 'expired'
    where id = review_record.id
      and status not in (
        'submitted',
        'cancelled'
      );

    return jsonb_build_object(
      'expired',
      true
    );
  end if;

  select *
  into project_record
  from public.projects
  where id = review_record.project_id;

  select *
  into subcontractor_record
  from public.team_members
  where id = review_record.subcontractor_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', item.id,
        'material_phase_id',
          item.material_phase_id,
        'material_catalog_id',
          item.material_catalog_id,
        'item_name',
          item.item_name,
        'description',
          item.description,
        'quantity',
          item.quantity,
        'unit',
          item.unit,
        'display_order',
          item.display_order
      )
      order by item.display_order
    ),
    '[]'::jsonb
  )
  into review_items
  from public.subcontractor_material_review_items item
  where item.review_id = review_record.id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', issue.id,
        'review_item_id',
          issue.review_item_id,
        'issue_type',
          issue.issue_type,
        'notes_original',
          issue.notes_original,
        'notes_language',
          issue.notes_language,
        'notes_english_translation',
          issue.notes_english_translation,
        'reported_quantity',
          issue.reported_quantity,
        'photo_url',
          issue.photo_url,
        'status',
          issue.status
      )
      order by issue.created_at
    ),
    '[]'::jsonb
  )
  into review_issues
  from public.subcontractor_material_issues issue
  where issue.review_id = review_record.id;

  if review_record.opened_at is null then
    update public.subcontractor_material_reviews
    set
      opened_at = now(),
      status = case
        when status = 'pending'
          then 'opened'
        else status
      end
    where id = review_record.id;
  end if;

  return jsonb_build_object(
    'id', review_record.id,
    'token', review_record.secure_token,
    'status', review_record.status,
    'language', review_record.language,
    'review_result',
      review_record.review_result,
    'notes_original',
      review_record.notes_original,
    'submitted_at',
      review_record.submitted_at,
    'project',
      jsonb_build_object(
        'id', project_record.id,
        'name',
          coalesce(
            to_jsonb(project_record)->>'name',
            to_jsonb(project_record)->>'project_name',
            'Assigned project'
          ),
        'address',
          coalesce(
            to_jsonb(project_record)->>'address',
            to_jsonb(project_record)->>'project_address',
            ''
          )
      ),
    'subcontractor',
      jsonb_build_object(
        'id', subcontractor_record.id,
        'name',
          coalesce(
            to_jsonb(subcontractor_record)->>'name',
            'Subcontractor'
          )
      ),
    'items', review_items,
    'issues', review_issues
  );
end;
$$;
ALTER FUNCTION "public"."get_material_review_by_token"("requested_token" "uuid") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."get_project_change_order_summary"("requested_project_id" "uuid") RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select jsonb_build_object(
    'total_count',
      count(*),

    'draft_count',
      count(*) filter (
        where status = 'draft'
      ),

    'pending_count',
      count(*) filter (
        where status = 'pending_customer'
      ),

    'approved_count',
      count(*) filter (
        where status in (
          'approved',
          'in_progress',
          'completed'
        )
      ),

    'declined_count',
      count(*) filter (
        where status = 'declined'
      ),

    'draft_amount',
      coalesce(
        sum(amount) filter (
          where status = 'draft'
        ),
        0
      ),

    'pending_amount',
      coalesce(
        sum(amount) filter (
          where status = 'pending_customer'
        ),
        0
      ),

    'approved_amount',
      coalesce(
        sum(amount) filter (
          where status in (
            'approved',
            'in_progress',
            'completed'
          )
        ),
        0
      ),

    'approved_cost',
      coalesce(
        sum(cost_amount) filter (
          where status in (
            'approved',
            'in_progress',
            'completed'
          )
        ),
        0
      ),

    'approved_profit',
      coalesce(
        sum(
          amount - cost_amount
        ) filter (
          where status in (
            'approved',
            'in_progress',
            'completed'
          )
        ),
        0
      ),

    'approved_margin_percent',
      case
        when coalesce(
          sum(amount) filter (
            where status in (
              'approved',
              'in_progress',
              'completed'
            )
          ),
          0
        ) = 0
        then 0
        else round(
          (
            coalesce(
              sum(
                amount - cost_amount
              ) filter (
                where status in (
                  'approved',
                  'in_progress',
                  'completed'
                )
              ),
              0
            )
            /
            coalesce(
              sum(amount) filter (
                where status in (
                  'approved',
                  'in_progress',
                  'completed'
                )
              ),
              1
            )
          ) * 100,
          2
        )
      end,

    'approved_schedule_impact_days',
      coalesce(
        sum(schedule_impact_days) filter (
          where status in (
            'approved',
            'in_progress',
            'completed'
          )
        ),
        0
      ),

    'awaiting_customer_count',
      count(*) filter (
        where
          status = 'pending_customer'
          and approval_token is not null
      ),

    'unopened_approval_count',
      count(*) filter (
        where
          status = 'pending_customer'
          and approval_token is not null
          and approval_opened_at is null
      ),

    'expired_approval_count',
      count(*) filter (
        where
          status = 'pending_customer'
          and approval_expires_at is not null
          and approval_expires_at < now()
      )
  )
  from public.active_project_change_orders
  where project_id =
    requested_project_id;
$$;
ALTER FUNCTION "public"."get_project_change_order_summary"("requested_project_id" "uuid") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."get_project_inspection_correction_summary"("requested_project_id" "uuid") RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select jsonb_build_object(
    'total_count',
      count(*),

    'open_count',
      count(*) filter (
        where correction_status in (
          'open',
          'reopened'
        )
      ),

    'assigned_count',
      count(*) filter (
        where correction_status =
          'assigned'
      ),

    'in_progress_count',
      count(*) filter (
        where correction_status =
          'in_progress'
      ),

    'ready_for_verification_count',
      count(*) filter (
        where correction_status =
          'ready_for_verification'
      ),

    'verified_count',
      count(*) filter (
        where correction_status =
          'verified'
      ),

    'overdue_count',
      count(*) filter (
        where due_date < current_date

        and correction_status not in (
          'verified',
          'cancelled'
        )
      ),

    'reinspection_required_count',
      count(*) filter (
        where reinspection_required

        and correction_status =
          'verified'

        and reinspection_inspection_id
          is null
      )
  )

  from public.project_inspection_corrections

  where project_id =
    requested_project_id;
$$;
ALTER FUNCTION "public"."get_project_inspection_correction_summary"("requested_project_id" "uuid") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."get_project_inspection_dependencies"("requested_project_id" "uuid") RETURNS TABLE("dependency_id" "uuid", "inspection_id" "uuid", "inspection_name" "text", "inspection_status" "text", "inspection_area_id" "uuid", "inspection_area_name" "text", "task_id" "uuid", "dependency_type" "text", "is_blocking" boolean, "released_at" timestamp with time zone, "blocked_reason" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    dependency.id,
    dependency.inspection_id,
    inspection.inspection_name,
    inspection.inspection_status,
    dependency.inspection_area_id,
    area.area_name,
    dependency.task_id,
    dependency.dependency_type,
    dependency.is_blocking,
    dependency.released_at,

    case
      when not dependency.is_blocking
      then null

      when dependency.dependency_type =
        'must_pass_before_start'
      then inspection.inspection_name ||
        ' must pass before this task can begin.'

      when dependency.dependency_type =
        'must_be_scheduled_before_start'
      then inspection.inspection_name ||
        ' must be scheduled before this task can begin.'

      when dependency.dependency_type =
        'area_release_required'
      then coalesce(
        area.area_name,
        'The required project area'
      ) ||
        ' must be released before this task can begin.'

      else
        'This task is blocked by an inspection requirement.'
    end

  from public.project_inspection_task_dependencies dependency

  join public.project_inspections inspection
    on inspection.id =
      dependency.inspection_id

  left join public.project_inspection_areas area
    on area.id =
      dependency.inspection_area_id

  where dependency.project_id =
    requested_project_id

  order by
    dependency.is_blocking desc,
    inspection.sort_order,
    inspection.inspection_name;
$$;
ALTER FUNCTION "public"."get_project_inspection_dependencies"("requested_project_id" "uuid") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."get_project_inspection_summary"("requested_project_id" "uuid") RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select jsonb_build_object(
    'total_count',
    count(*),

    'not_scheduled_count',
    count(*) filter (
      where inspection_status =
        'not_scheduled'
    ),

    'requested_count',
    count(*) filter (
      where inspection_status =
        'requested'
    ),

    'scheduled_count',
    count(*) filter (
      where inspection_status in (
        'scheduled',
        'rescheduled'
      )
    ),

    'passed_count',
    count(*) filter (
      where inspection_status =
        'passed'
    ),

    'partial_pass_count',
    count(*) filter (
      where inspection_status =
        'partial_pass'
    ),

    'failed_count',
    count(*) filter (
      where inspection_status =
        'failed'
    ),

    'cancelled_count',
    count(*) filter (
      where inspection_status =
        'cancelled'
    ),

    'not_required_count',
    count(*) filter (
      where inspection_status =
        'not_required'
    ),

    'reinspection_count',
    count(*) filter (
      where reinspection_required
    ),

    'unverified_result_count',
    count(*) filter (
      where inspection_status in (
        'passed',
        'partial_pass',
        'failed'
      )

      and contractor_result_verified_at
        is null
    ),

    'blocked_area_count',
    (
      select count(*)
      from public.project_inspection_areas area
      where area.project_id =
        requested_project_id

        and not area.work_may_continue

        and area.result_status not in (
          'not_applicable',
          'passed'
        )
    ),

    'released_area_count',
    (
      select count(*)
      from public.project_inspection_areas area
      where area.project_id =
        requested_project_id

        and area.work_may_continue
    ),

    'active_blocking_dependency_count',
    (
      select count(*)
      from public.project_inspection_task_dependencies dependency
      where dependency.project_id =
        requested_project_id

        and dependency.is_blocking

        and dependency.released_at
          is null
    )
  )

  from public.project_inspections inspection

  where inspection.project_id =
    requested_project_id;
$$;
ALTER FUNCTION "public"."get_project_inspection_summary"("requested_project_id" "uuid") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."get_schedule_request_by_token"("requested_token" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  request_record public.subcontractor_schedule_requests;
  project_record public.projects;
  subcontractor_record public.team_members;
begin
  select *
  into request_record
  from public.subcontractor_schedule_requests
  where secure_token = requested_token
  limit 1;

  if request_record.id is null then
    return null;
  end if;

  if (
    request_record.expires_at is not null
    and request_record.expires_at < now()
  ) then
    update public.subcontractor_schedule_requests
    set status = 'expired'
    where id = request_record.id
      and status not in (
        'submitted',
        'cancelled'
      );

    return jsonb_build_object(
      'expired',
      true
    );
  end if;

  select *
  into project_record
  from public.projects
  where id = request_record.project_id;

  select *
  into subcontractor_record
  from public.team_members
  where id = request_record.subcontractor_id;

  if request_record.opened_at is null then
    update public.subcontractor_schedule_requests
    set
      opened_at = now(),
      status = case
        when status = 'pending'
          then 'opened'
        else status
      end
    where id = request_record.id;
  end if;

  return jsonb_build_object(
    'id', request_record.id,
    'token', request_record.secure_token,
    'status', request_record.status,
    'language', request_record.language,
    'earliest_demo_start',
      request_record.earliest_demo_start,
    'earliest_construction_start',
      request_record.earliest_construction_start,
    'demo_duration_days',
      request_record.demo_duration_days,
    'total_duration_days',
      request_record.total_duration_days,
    'notes_original',
      request_record.notes_original,
    'submitted_at',
      request_record.submitted_at,
    'project',
      jsonb_build_object(
        'id', project_record.id,
        'name',
          coalesce(
            to_jsonb(project_record)->>'name',
            to_jsonb(project_record)->>'project_name',
            'Assigned project'
          ),
        'address',
          coalesce(
            to_jsonb(project_record)->>'address',
            to_jsonb(project_record)->>'project_address',
            ''
          )
      ),
    'subcontractor',
      jsonb_build_object(
        'id', subcontractor_record.id,
        'name',
          coalesce(
            to_jsonb(subcontractor_record)->>'name',
            'Subcontractor'
          )
      )
  );
end;
$$;
ALTER FUNCTION "public"."get_schedule_request_by_token"("requested_token" "uuid") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."initialize_project_material_phases"("requested_project_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.project_material_phases (
    project_id,
    phase_key,
    phase_name,
    phase_order,
    required_for_start,
    delivery_buffer_workdays
  )
  values
    (
      requested_project_id,
      'demo',
      'Demo',
      1,
      false,
      0
    ),
    (
      requested_project_id,
      'footings_framing',
      'Footings and Framing',
      2,
      true,
      1
    ),
    (
      requested_project_id,
      'decking',
      'Decking',
      3,
      false,
      1
    ),
    (
      requested_project_id,
      'railing',
      'Railing',
      4,
      false,
      1
    ),
    (
      requested_project_id,
      'punch_list',
      'Punch List',
      5,
      false,
      0
    )
  on conflict (
    project_id,
    phase_key
  ) do nothing;

  return jsonb_build_object(
    'success', true,
    'project_id', requested_project_id
  );
end;
$$;
ALTER FUNCTION "public"."initialize_project_material_phases"("requested_project_id" "uuid") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."is_feature_enabled"("requested_feature_key" "text", "requested_scope_type" "text" DEFAULT 'global'::"text", "requested_scope_id" "text" DEFAULT 'default'::"text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select coalesce(
    (
      select setting.is_enabled
      from public.feature_settings setting
      where
        setting.scope_type =
          requested_scope_type

        and setting.scope_id =
          requested_scope_id

        and setting.feature_key =
          requested_feature_key
      limit 1
    ),
    (
      select setting.is_enabled
      from public.feature_settings setting
      where
        setting.scope_type =
          'global'

        and setting.scope_id =
          'default'

        and setting.feature_key =
          requested_feature_key
      limit 1
    ),
    true
  );
$$;
ALTER FUNCTION "public"."is_feature_enabled"("requested_feature_key" "text", "requested_scope_type" "text", "requested_scope_id" "text") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."is_project_task_blocked_by_inspection"("requested_project_id" "uuid", "requested_task_id" "uuid") RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select jsonb_build_object(
    'is_blocked',
      exists (
        select 1
        from public.project_inspection_task_dependencies dependency
        where dependency.project_id =
          requested_project_id

          and dependency.task_id =
            requested_task_id

          and dependency.is_blocking

          and dependency.released_at
            is null
      ),

    'blocking_dependencies',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'dependency_id',
                dependency.id,

              'inspection_id',
                dependency.inspection_id,

              'inspection_name',
                inspection.inspection_name,

              'inspection_status',
                inspection.inspection_status,

              'inspection_area_id',
                dependency.inspection_area_id,

              'inspection_area_name',
                area.area_name,

              'dependency_type',
                dependency.dependency_type
            )
          )

          from public.project_inspection_task_dependencies dependency

          join public.project_inspections inspection
            on inspection.id =
              dependency.inspection_id

          left join public.project_inspection_areas area
            on area.id =
              dependency.inspection_area_id

          where dependency.project_id =
            requested_project_id

            and dependency.task_id =
              requested_task_id

            and dependency.is_blocking

            and dependency.released_at
              is null
        ),
        '[]'::jsonb
      )
  );
$$;
ALTER FUNCTION "public"."is_project_task_blocked_by_inspection"("requested_project_id" "uuid", "requested_task_id" "uuid") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."log_change_order_activity"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  activity_type_value text;
  activity_title text;
begin
  if tg_op = 'INSERT' then
    activity_type_value :=
      'change_order_created';

    activity_title :=
      'Change order created';
  elsif (
    old.status is distinct from new.status
  ) then
    activity_type_value :=
      case new.status
        when 'approved'
          then 'change_order_approved'
        when 'declined'
          then 'change_order_declined'
        when 'completed'
          then 'change_order_completed'
        else 'change_order_updated'
      end;

    activity_title :=
      case new.status
        when 'pending_customer'
          then 'Change order sent for customer approval'
        when 'approved'
          then 'Change order approved'
        when 'declined'
          then 'Change order declined'
        when 'in_progress'
          then 'Change order work started'
        when 'completed'
          then 'Change order completed'
        when 'cancelled'
          then 'Change order cancelled'
        else 'Change order updated'
      end;
  else
    activity_type_value :=
      'change_order_updated';

    activity_title :=
      'Change order updated';
  end if;

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
  )
  values (
    new.project_id,
    activity_type_value,
    activity_title,
    new.description,
    'office',
    new.created_by,
    'project_change_orders',
    case
      when tg_op = 'INSERT'
        then new.id
      else gen_random_uuid()
    end,
    jsonb_build_object(
      'change_order_id',
        new.id,
      'change_order_number',
        new.change_order_number,
      'change_order_title',
        new.title,
      'status',
        new.status,
      'amount',
        new.amount,
      'cost_amount',
        new.cost_amount,
      'schedule_impact_days',
        new.schedule_impact_days,
      'approved_by_name',
        new.approved_by_name,
      'approved_at',
        new.approved_at
    ),
    coalesce(
      new.approved_at,
      new.declined_at,
      new.completed_at,
      new.updated_at,
      now()
    )
  )
  on conflict do nothing;

  return new;
end;
$$;
ALTER FUNCTION "public"."log_change_order_activity"() OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."log_change_order_approval_activity"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if (
    new.approval_sent_at is not null
    and (
      old.approval_sent_at is null
      or new.approval_sent_at
        is distinct from
        old.approval_sent_at
      or new.approval_token
        is distinct from
        old.approval_token
    )
  ) then
    insert into public.project_activity (
      project_id,
      activity_type,
      title,
      actor_type,
      source_table,
      source_id,
      metadata,
      occurred_at
    )
    values (
      new.project_id,
      'change_order_approval_sent',
      case
        when old.approval_token is not null
          and new.approval_token
            is distinct from
            old.approval_token
        then
          'Change-order approval link replaced'
        else
          'Change order sent for customer approval'
      end,
      'office',
      'project_change_orders',
      gen_random_uuid(),
      jsonb_build_object(
        'change_order_id',
          new.id,
        'change_order_number',
          new.change_order_number,
        'approval_sent_at',
          new.approval_sent_at,
        'approval_expires_at',
          new.approval_expires_at,
        'link_replaced',
          (
            old.approval_token is not null
            and new.approval_token
              is distinct from
              old.approval_token
          )
      ),
      new.approval_sent_at
    );
  end if;

  if (
    new.approval_opened_at is not null
    and old.approval_opened_at is null
  ) then
    insert into public.project_activity (
      project_id,
      activity_type,
      title,
      actor_type,
      source_table,
      source_id,
      metadata,
      occurred_at
    )
    values (
      new.project_id,
      'change_order_approval_opened',
      'Customer opened change-order approval',
      'customer',
      'project_change_orders',
      gen_random_uuid(),
      jsonb_build_object(
        'change_order_id',
          new.id,
        'change_order_number',
          new.change_order_number,
        'approval_opened_at',
          new.approval_opened_at
      ),
      new.approval_opened_at
    );
  end if;

  return new;
end;
$$;
ALTER FUNCTION "public"."log_change_order_approval_activity"() OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."log_change_order_payment_activity"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  change_order_record public.project_change_orders;
  activity_name text;
  activity_title text;
  payment_record public.project_change_order_payments;
begin
  payment_record :=
    case
      when tg_op = 'DELETE'
      then old
      else new
    end;

  select *
  into change_order_record
  from public.project_change_orders
  where id =
    payment_record.change_order_id
  limit 1;

  if change_order_record.id is null then
    return payment_record;
  end if;

  activity_name :=
    case tg_op
      when 'INSERT'
      then 'change_order_payment_recorded'

      when 'UPDATE'
      then 'change_order_payment_updated'

      else 'change_order_payment_deleted'
    end;

  activity_title :=
    case tg_op
      when 'INSERT'
      then 'Change-order payment recorded'

      when 'UPDATE'
      then 'Change-order payment updated'

      else 'Change-order payment deleted'
    end;

  insert into public.project_activity (
    project_id,
    activity_type,
    title,
    actor_type,
    actor_app_user_id,
    source_table,
    source_id,
    metadata,
    occurred_at
  )
  values (
    change_order_record.project_id,
    activity_name,
    activity_title,
    'office',
    payment_record.created_by,
    'project_change_order_payments',
    payment_record.id,
    jsonb_build_object(
      'change_order_id',
        change_order_record.id,

      'change_order_number',
        change_order_record.change_order_number,

      'amount',
        payment_record.amount,

      'payment_date',
        payment_record.payment_date,

      'payment_method',
        payment_record.payment_method,

      'reference_number',
        payment_record.reference_number,

      'operation',
        lower(tg_op)
    ),
    now()
  );

  return payment_record;
end;
$$;
ALTER FUNCTION "public"."log_change_order_payment_activity"() OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."log_change_order_vendor_request_activity"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  activity_name text;
  activity_title text;
begin
  if tg_op = 'INSERT' then
    activity_name :=
      'change_order_vendor_request_created';

    activity_title :=
      'Vendor schedule and cost request created';

  elsif new.request_status is distinct from
    old.request_status
  then
    activity_name :=
      case new.request_status
        when 'sent'
          then 'change_order_vendor_request_sent'

        when 'opened'
          then 'change_order_vendor_request_opened'

        when 'cancelled'
          then 'change_order_vendor_request_cancelled'

        else null
      end;

    activity_title :=
      case new.request_status
        when 'sent'
          then 'Vendor schedule and cost request sent'

        when 'opened'
          then 'Vendor schedule and cost request opened'

        when 'cancelled'
          then 'Vendor schedule and cost request cancelled'

        else null
      end;

  elsif new.reminder_count >
    old.reminder_count
  then
    activity_name :=
      'change_order_vendor_request_reminder';

    activity_title :=
      'Vendor schedule and cost reminder sent';
  end if;

  if activity_name is not null then
    insert into public.project_activity (
      project_id,
      activity_type,
      title,
      actor_type,
      actor_app_user_id,
      source_table,
      source_id,
      metadata,
      occurred_at
    )
    values (
      new.project_id,
      activity_name,
      activity_title,
      'office',
      new.created_by,
      'change_order_vendor_requests',
      new.id,
      jsonb_build_object(
        'change_order_id',
          new.change_order_id,

        'vendor_request_id',
          new.id,

        'recipient_type',
          new.recipient_type,

        'recipient_name',
          new.recipient_name,

        'recipient_company',
          new.recipient_company,

        'request_status',
          new.request_status,

        'reminder_count',
          new.reminder_count
      ),
      now()
    );
  end if;

  return new;
end;
$$;
ALTER FUNCTION "public"."log_change_order_vendor_request_activity"() OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."log_material_issue_activity"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  review_record
    public.subcontractor_material_reviews;
begin
  select *
  into review_record
  from public.subcontractor_material_reviews
  where id = new.review_id;

  if review_record.id is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    insert into public.project_activity (
      project_id,
      activity_type,
      title,
      description,
      actor_type,
      subcontractor_id,
      source_table,
      source_id,
      metadata,
      occurred_at
    )
    values (
      review_record.project_id,
      'material_issue_reported',
      'Installer reported a material issue',
      new.notes_original,
      'subcontractor',
      review_record.subcontractor_id,
      'subcontractor_material_issues',
      new.id,
      jsonb_build_object(
        'review_id',
          new.review_id,
        'review_item_id',
          new.review_item_id,
        'issue_type',
          new.issue_type,
        'reported_quantity',
          new.reported_quantity,
        'status',
          new.status
      ),
      coalesce(
        new.created_at,
        now()
      )
    )
    on conflict do nothing;
  elsif (
    old.status
      is distinct from new.status
  ) then
    insert into public.project_activity (
      project_id,
      activity_type,
      title,
      description,
      actor_type,
      subcontractor_id,
      source_table,
      source_id,
      metadata,
      occurred_at
    )
    values (
      review_record.project_id,
      'material_issue_updated',
      'Material issue status updated',
      new.notes_original,
      'office',
      review_record.subcontractor_id,
      'subcontractor_material_issues',
      new.id,
      jsonb_build_object(
        'review_id',
          new.review_id,
        'issue_type',
          new.issue_type,
        'previous_status',
          old.status,
        'status',
          new.status,
        'resolved_at',
          new.resolved_at
      ),
      now()
    )
    on conflict (
      activity_type,
      source_table,
      source_id
    )
    where source_id is not null
    do update set
      description =
        excluded.description,
      metadata =
        excluded.metadata,
      occurred_at =
        excluded.occurred_at;
  end if;

  return new;
end;
$$;
ALTER FUNCTION "public"."log_material_issue_activity"() OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."log_material_review_activity"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if tg_op = 'INSERT' then
    insert into public.project_activity (
      project_id,
      activity_type,
      title,
      actor_type,
      actor_app_user_id,
      subcontractor_id,
      source_table,
      source_id,
      metadata,
      occurred_at
    )
    values (
      new.project_id,
      'material_review_created',
      'Installer material review created',
      'office',
      new.created_by,
      new.subcontractor_id,
      'subcontractor_material_reviews',
      new.id,
      jsonb_build_object(
        'status', new.status,
        'language', new.language,
        'expires_at', new.expires_at
      ),
      coalesce(
        new.sent_at,
        new.created_at,
        now()
      )
    )
    on conflict do nothing;
  end if;

  if (
    new.opened_at is not null
    and (
      tg_op = 'INSERT'
      or old.opened_at
        is distinct from new.opened_at
    )
  ) then
    insert into public.project_activity (
      project_id,
      activity_type,
      title,
      actor_type,
      subcontractor_id,
      source_table,
      source_id,
      occurred_at
    )
    values (
      new.project_id,
      'material_review_opened',
      'Installer opened material review',
      'subcontractor',
      new.subcontractor_id,
      'subcontractor_material_reviews',
      new.id,
      new.opened_at
    )
    on conflict (
      activity_type,
      source_table,
      source_id
    )
    where source_id is not null
    do update set
      occurred_at =
        excluded.occurred_at;
  end if;

  if (
    new.status = 'submitted'
    and new.submitted_at is not null
    and (
      tg_op = 'INSERT'
      or old.status is distinct from new.status
      or old.submitted_at
        is distinct from new.submitted_at
    )
  ) then
    insert into public.project_activity (
      project_id,
      activity_type,
      title,
      description,
      actor_type,
      subcontractor_id,
      source_table,
      source_id,
      metadata,
      occurred_at
    )
    values (
      new.project_id,
      'material_review_submitted',
      case
        when new.review_result = 'approved'
          then 'Installer approved material list'
        else 'Installer reported material issues'
      end,
      new.notes_original,
      'subcontractor',
      new.subcontractor_id,
      'subcontractor_material_reviews',
      new.id,
      jsonb_build_object(
        'review_result',
          new.review_result,
        'language',
          new.language,
        'translation_status',
          new.translation_status
      ),
      new.submitted_at
    )
    on conflict (
      activity_type,
      source_table,
      source_id
    )
    where source_id is not null
    do update set
      title =
        excluded.title,
      description =
        excluded.description,
      metadata =
        excluded.metadata,
      occurred_at =
        excluded.occurred_at;
  end if;

  if (
    new.reviewed_at is not null
    and (
      tg_op = 'INSERT'
      or old.reviewed_at
        is distinct from new.reviewed_at
    )
  ) then
    insert into public.project_activity (
      project_id,
      activity_type,
      title,
      actor_type,
      actor_app_user_id,
      subcontractor_id,
      source_table,
      source_id,
      metadata,
      occurred_at
    )
    values (
      new.project_id,
      'material_review_reviewed',
      'Material review marked complete',
      'office',
      new.reviewed_by,
      new.subcontractor_id,
      'subcontractor_material_reviews',
      new.id,
      jsonb_build_object(
        'review_result',
          new.review_result,
        'reviewed_at',
          new.reviewed_at
      ),
      new.reviewed_at
    )
    on conflict (
      activity_type,
      source_table,
      source_id
    )
    where source_id is not null
    do update set
      actor_app_user_id =
        excluded.actor_app_user_id,
      metadata =
        excluded.metadata,
      occurred_at =
        excluded.occurred_at;
  end if;

  return new;
end;
$$;
ALTER FUNCTION "public"."log_material_review_activity"() OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."log_project_message_activity"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.project_activity (
    project_id,
    activity_type,
    title,
    description,
    actor_type,
    actor_app_user_id,
    subcontractor_id,
    source_table,
    source_id,
    metadata,
    occurred_at
  )
  values (
    new.project_id,
    'message_created',

    case
      when new.sender_type = 'subcontractor'
        then 'Installer sent a message'
      when new.sender_type = 'office'
        then 'Office sent an installer message'
      else 'Project message created'
    end,

    new.original_text,

    case
      when new.sender_type = 'subcontractor'
        then 'subcontractor'
      when new.sender_type = 'office'
        then 'office'
      else 'system'
    end,

    new.sender_app_user_id,
    new.subcontractor_id,
    'project_messages',
    new.id,

    jsonb_build_object(
      'thread_id',
        new.thread_id,

      'direction',
        new.direction,

      'original_language',
        new.original_language,

      'recipient_language',
        new.recipient_language,

      'translated_text',
        new.translated_text,

      'translation_status',
        new.translation_status,

      'delivery_channel',
        new.delivery_channel,

      'delivery_status',
        new.delivery_status
    ),

    coalesce(
      new.sent_at,
      new.created_at,
      now()
    )
  )
  on conflict (
    activity_type,
    source_table,
    source_id
  )
  where source_id is not null
  do update set
    title =
      excluded.title,

    description =
      excluded.description,

    actor_type =
      excluded.actor_type,

    actor_app_user_id =
      excluded.actor_app_user_id,

    subcontractor_id =
      excluded.subcontractor_id,

    metadata =
      excluded.metadata,

    occurred_at =
      excluded.occurred_at;

  return new;
end;
$$;
ALTER FUNCTION "public"."log_project_message_activity"() OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."log_project_update_activity"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  old_data jsonb;
  new_data jsonb;
  changed_fields jsonb := '{}'::jsonb;
  field_name text;
  previous_value jsonb;
  current_value jsonb;
  activity_title text;
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  old_data :=
    to_jsonb(old)
    - 'updated_at'
    - 'created_at';

  new_data :=
    to_jsonb(new)
    - 'updated_at'
    - 'created_at';

  for field_name in
    select key
    from (
      select jsonb_object_keys(old_data) as key

      union

      select jsonb_object_keys(new_data) as key
    ) fields
  loop
    previous_value :=
      old_data -> field_name;

    current_value :=
      new_data -> field_name;

    if previous_value
      is distinct from current_value
    then
      changed_fields :=
        changed_fields ||
        jsonb_build_object(
          field_name,
          jsonb_build_object(
            'previous',
              previous_value,
            'current',
              current_value
          )
        );
    end if;
  end loop;

  if changed_fields = '{}'::jsonb then
    return new;
  end if;

  activity_title :=
    case
      when changed_fields ? 'status'
        then 'Project status updated'

      when changed_fields ? 'stage'
        then 'Project stage updated'

      when changed_fields ? 'project_status'
        then 'Project status updated'

      when changed_fields ? 'scheduled_start_date'
        or changed_fields ? 'start_date'
        or changed_fields ? 'estimated_start_date'
        then 'Project start date updated'

      when changed_fields ? 'scheduled_completion_date'
        or changed_fields ? 'completion_date'
        or changed_fields ? 'estimated_completion_date'
        then 'Project completion date updated'

      when changed_fields ? 'address'
        or changed_fields ? 'project_address'
        or changed_fields ? 'job_address'
        then 'Project address updated'

      when changed_fields ? 'name'
        or changed_fields ? 'project_name'
        or changed_fields ? 'title'
        then 'Project name updated'

      else 'Project details updated'
    end;

  insert into public.project_activity (
    project_id,
    activity_type,
    title,
    actor_type,
    source_table,
    source_id,
    metadata,
    occurred_at
  )
  values (
    new.id,
    'project_updated',
    activity_title,
    'system',
    'projects',
    gen_random_uuid(),
    jsonb_build_object(
      'changed_fields',
        changed_fields
    ),
    now()
  );

  return new;
end;
$$;
ALTER FUNCTION "public"."log_project_update_activity"() OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."log_schedule_request_activity"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if tg_op = 'INSERT' then
    insert into public.project_activity (
      project_id,
      activity_type,
      title,
      actor_type,
      subcontractor_id,
      source_table,
      source_id,
      metadata,
      occurred_at
    )
    values (
      new.project_id,
      'schedule_request_created',
      'Installer schedule request created',
      'office',
      new.subcontractor_id,
      'subcontractor_schedule_requests',
      new.id,
      jsonb_build_object(
        'status', new.status,
        'language', new.language
      ),
      coalesce(
        new.created_at,
        now()
      )
    )
    on conflict do nothing;
  end if;

  if (
    new.status = 'submitted'
    and new.submitted_at is not null
    and (
      tg_op = 'INSERT'
      or old.status is distinct from new.status
      or old.submitted_at
        is distinct from new.submitted_at
    )
  ) then
    insert into public.project_activity (
      project_id,
      activity_type,
      title,
      description,
      actor_type,
      subcontractor_id,
      source_table,
      source_id,
      metadata,
      occurred_at
    )
    values (
      new.project_id,
      'schedule_response_submitted',
      'Installer submitted schedule availability',
      coalesce(
        new.notes,
        to_jsonb(new)->>'notes_original'
      ),
      'subcontractor',
      new.subcontractor_id,
      'subcontractor_schedule_requests',
      new.id,
      jsonb_build_object(
        'earliest_demo_start',
          new.earliest_demo_start,
        'earliest_construction_start',
          new.earliest_construction_start,
        'demo_duration_days',
          new.demo_duration_days,
        'total_duration_days',
          new.total_duration_days
      ),
      new.submitted_at
    )
    on conflict (
      activity_type,
      source_table,
      source_id
    )
    where source_id is not null
    do update set
      description =
        excluded.description,
      metadata =
        excluded.metadata,
      occurred_at =
        excluded.occurred_at;
  end if;

  if (
    new.reviewed_at is not null
    and (
      tg_op = 'INSERT'
      or old.reviewed_at
        is distinct from new.reviewed_at
    )
  ) then
    insert into public.project_activity (
      project_id,
      activity_type,
      title,
      actor_type,
      actor_app_user_id,
      subcontractor_id,
      source_table,
      source_id,
      metadata,
      occurred_at
    )
    values (
      new.project_id,
      'schedule_response_reviewed',
      'Schedule response marked reviewed',
      'office',
      new.reviewed_by,
      new.subcontractor_id,
      'subcontractor_schedule_requests',
      new.id,
      jsonb_build_object(
        'reviewed_at',
          new.reviewed_at
      ),
      new.reviewed_at
    )
    on conflict (
      activity_type,
      source_table,
      source_id
    )
    where source_id is not null
    do update set
      actor_app_user_id =
        excluded.actor_app_user_id,
      metadata =
        excluded.metadata,
      occurred_at =
        excluded.occurred_at;
  end if;

  return new;
end;
$$;
ALTER FUNCTION "public"."log_schedule_request_activity"() OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."mark_change_order_response_reviewed"("requested_change_order_id" "uuid", "requested_auth_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  app_user_record public.app_users;
  change_order_record public.project_change_orders;
begin
  select *
  into app_user_record
  from public.app_users
  where auth_user_id =
    requested_auth_user_id
  limit 1;

  if app_user_record.id is null then
    raise exception
      'Authenticated application user not found.';
  end if;

  update public.project_change_orders
  set
    response_reviewed_at = now(),
    response_reviewed_by =
      app_user_record.id,
    updated_at = now()
  where id =
    requested_change_order_id
    and status in (
      'approved',
      'declined'
    )
  returning *
  into change_order_record;

  if change_order_record.id is null then
    raise exception
      'Approved or declined change order not found.';
  end if;

  insert into public.project_activity (
    project_id,
    activity_type,
    title,
    actor_type,
    actor_app_user_id,
    source_table,
    source_id,
    metadata,
    occurred_at
  )
  values (
    change_order_record.project_id,
    'change_order_response_reviewed',
    'Customer change-order response reviewed',
    'office',
    app_user_record.id,
    'project_change_orders',
    gen_random_uuid(),
    jsonb_build_object(
      'change_order_id',
        change_order_record.id,
      'change_order_number',
        change_order_record.change_order_number,
      'status',
        change_order_record.status,
      'response_reviewed_at',
        change_order_record.response_reviewed_at
    ),
    change_order_record.response_reviewed_at
  );

  return jsonb_build_object(
    'success', true,
    'change_order_id',
      change_order_record.id,
    'response_reviewed_at',
      change_order_record.response_reviewed_at,
    'response_reviewed_by',
      change_order_record.response_reviewed_by
  );
end;
$$;
ALTER FUNCTION "public"."mark_change_order_response_reviewed"("requested_change_order_id" "uuid", "requested_auth_user_id" "uuid") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."mark_material_review_reviewed"("requested_material_review_id" "uuid", "requested_auth_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  app_user_record public.app_users;
  material_review_record
    public.subcontractor_material_reviews;
  unresolved_issue_count integer;
begin
  select *
  into app_user_record
  from public.app_users
  where auth_user_id =
    requested_auth_user_id
  limit 1;

  if app_user_record.id is null then
    raise exception
      'Authenticated application user not found.';
  end if;

  select count(*)
  into unresolved_issue_count
  from public.subcontractor_material_issues
  where review_id =
    requested_material_review_id
    and status in (
      'open',
      'reviewing'
    );

  if unresolved_issue_count > 0 then
    raise exception
      'Resolve or dismiss all material issues before marking the review complete.';
  end if;

  update public.subcontractor_material_reviews
  set
    reviewed_at = now(),
    reviewed_by = app_user_record.id,
    updated_at = now()
  where id =
    requested_material_review_id
    and status = 'submitted'
  returning *
  into material_review_record;

  if material_review_record.id is null then
    raise exception
      'Submitted material review not found.';
  end if;

  return jsonb_build_object(
    'success', true,
    'material_review_id',
      material_review_record.id,
    'reviewed_at',
      material_review_record.reviewed_at,
    'reviewed_by',
      material_review_record.reviewed_by
  );
end;
$$;
ALTER FUNCTION "public"."mark_material_review_reviewed"("requested_material_review_id" "uuid", "requested_auth_user_id" "uuid") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."mark_schedule_request_reviewed"("requested_schedule_request_id" "uuid", "requested_auth_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  app_user_record public.app_users;
  schedule_request_record
    public.subcontractor_schedule_requests;
begin
  select *
  into app_user_record
  from public.app_users
  where auth_user_id =
    requested_auth_user_id
  limit 1;

  if app_user_record.id is null then
    raise exception
      'Authenticated application user not found.';
  end if;

  update public.subcontractor_schedule_requests
  set
    reviewed_at = now(),
    reviewed_by = app_user_record.id,
    updated_at = now()
  where id =
    requested_schedule_request_id
    and status = 'submitted'
  returning *
  into schedule_request_record;

  if schedule_request_record.id is null then
    raise exception
      'Submitted schedule request not found.';
  end if;

  return jsonb_build_object(
    'success', true,
    'schedule_request_id',
      schedule_request_record.id,
    'reviewed_at',
      schedule_request_record.reviewed_at,
    'reviewed_by',
      schedule_request_record.reviewed_by
  );
end;
$$;
ALTER FUNCTION "public"."mark_schedule_request_reviewed"("requested_schedule_request_id" "uuid", "requested_auth_user_id" "uuid") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."prevent_locked_change_order_item_changes"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  target_change_order_id uuid;
  change_order_status text;
begin
  target_change_order_id :=
    case
      when tg_op = 'DELETE'
        then old.change_order_id
      else new.change_order_id
    end;

  select status
  into change_order_status
  from public.project_change_orders
  where id = target_change_order_id
  limit 1;

  if change_order_status is null then
    raise exception
      'Change order not found.';
  end if;

  if change_order_status <> 'draft' then
    raise exception
      'Change-order line items are locked unless the change order is in Draft status. Revoke or replace the customer approval before editing.';
  end if;

  return case
    when tg_op = 'DELETE'
      then old
    else new
  end;
end;
$$;
ALTER FUNCTION "public"."prevent_locked_change_order_item_changes"() OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."prevent_locked_change_order_scope_changes"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if old.status <> 'draft' then
    if
      new.title is distinct from old.title
      or new.description is distinct from old.description
      or new.reason is distinct from old.reason
      or new.amount is distinct from old.amount
      or new.cost_amount is distinct from old.cost_amount
      or new.schedule_impact_days is distinct from old.schedule_impact_days
      or new.customer_notes is distinct from old.customer_notes
    then
      raise exception
        'Customer-visible change-order details are locked unless the change order is in Draft status.';
    end if;
  end if;

  return new;
end;
$$;
ALTER FUNCTION "public"."prevent_locked_change_order_scope_changes"() OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."prevent_schedule_response_overwrite"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  if old.status = 'submitted' then
    if (
      new.project_id
        is distinct from old.project_id
      or new.subcontractor_id
        is distinct from old.subcontractor_id
      or new.earliest_demo_start
        is distinct from old.earliest_demo_start
      or new.earliest_construction_start
        is distinct from old.earliest_construction_start
      or new.demo_duration_days
        is distinct from old.demo_duration_days
      or new.total_duration_days
        is distinct from old.total_duration_days
      or new.notes
        is distinct from old.notes
      or new.submitted_at
        is distinct from old.submitted_at
      or new.status
        is distinct from old.status
    ) then
      raise exception
        'This installer schedule response has already been submitted and cannot be changed.';
    end if;
  end if;

  return new;
end;
$$;
ALTER FUNCTION "public"."prevent_schedule_response_overwrite"() OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."recalculate_change_order_payment_status"("requested_change_order_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  change_order_record public.project_change_orders;
  total_paid numeric(12, 2);
  calculated_status text;
  calculated_paid_at timestamptz;
begin
  select *
  into change_order_record
  from public.project_change_orders
  where id =
    requested_change_order_id
  limit 1
  for update;

  if change_order_record.id is null then
    return;
  end if;

  select coalesce(
    sum(payment.amount),
    0
  )
  into total_paid
  from public.project_change_order_payments payment
  where payment.change_order_id =
    requested_change_order_id;

  calculated_status :=
    case
      when change_order_record.billing_status =
        'void'
      then
        'void'

      when total_paid >=
        change_order_record.amount
        and change_order_record.amount > 0
      then
        'paid'

      when total_paid > 0
      then
        'partially_paid'

      when change_order_record.invoiced_at
        is not null
        or nullif(
          btrim(
            change_order_record.invoice_number
          ),
          ''
        ) is not null
      then
        'invoiced'

      else
        'not_billed'
    end;

  calculated_paid_at :=
    case
      when calculated_status = 'paid'
      then coalesce(
        change_order_record.paid_at,
        now()
      )
      else null
    end;

  update public.project_change_orders
  set
    amount_paid =
      total_paid,

    billing_status =
      calculated_status,

    paid_at =
      calculated_paid_at,

    updated_at =
      now()

  where id =
    requested_change_order_id;
end;
$$;
ALTER FUNCTION "public"."recalculate_change_order_payment_status"("requested_change_order_id" "uuid") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."recalculate_change_order_totals"("requested_change_order_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  sales_total numeric(12, 2);
  cost_total numeric(12, 2);
  change_order_record public.project_change_orders;
begin
  select
    coalesce(
      sum(quantity * unit_price),
      0
    ),
    coalesce(
      sum(quantity * unit_cost),
      0
    )
  into
    sales_total,
    cost_total
  from public.project_change_order_items
  where change_order_id =
    requested_change_order_id;

  update public.project_change_orders
  set
    amount =
      round(sales_total, 2),

    cost_amount =
      round(cost_total, 2),

    updated_at =
      now()

  where id =
    requested_change_order_id

  returning *
  into change_order_record;

  if change_order_record.id is null then
    raise exception
      'Change order not found.';
  end if;

  return jsonb_build_object(
    'success', true,

    'change_order_id',
      change_order_record.id,

    'amount',
      change_order_record.amount,

    'cost_amount',
      change_order_record.cost_amount,

    'profit',
      change_order_record.amount -
      coalesce(
        change_order_record.cost_amount,
        0
      )
  );
end;
$$;
ALTER FUNCTION "public"."recalculate_change_order_totals"("requested_change_order_id" "uuid") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."recalculate_project_schedule"("requested_project_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  readiness_record public.project_schedule_readiness;

  required_phase_count integer := 0;
  confirmed_required_phase_count integer := 0;

  material_safe_date date;
  demo_start_date date;
  construction_start_date date;
  readiness_status text;
begin
  insert into public.project_schedule_readiness (
    project_id
  )
  values (
    requested_project_id
  )
  on conflict (project_id) do nothing;

  perform public.initialize_project_material_phases(
    requested_project_id
  );

  select *
  into readiness_record
  from public.project_schedule_readiness
  where project_id = requested_project_id;

  select
    count(*) filter (
      where required_for_start = true
        and delivery_status <> 'cancelled'
    ),
    count(*) filter (
      where required_for_start = true
        and delivery_status <> 'cancelled'
        and confirmed_delivery_date is not null
    )
  into
    required_phase_count,
    confirmed_required_phase_count
  from public.project_material_phases
  where project_id = requested_project_id;

  if (
    required_phase_count > 0
    and confirmed_required_phase_count =
      required_phase_count
  ) then
    select max(
      public.add_workdays(
        confirmed_delivery_date,
        delivery_buffer_workdays
      )
    )
    into material_safe_date
    from public.project_material_phases
    where project_id = requested_project_id
      and required_for_start = true
      and delivery_status <> 'cancelled';
  else
    material_safe_date := null;
  end if;

  if (
    required_phase_count = 0
    and readiness_record
      .confirmed_material_delivery_date
      is not null
  ) then
    material_safe_date :=
      public.add_workdays(
        readiness_record
          .confirmed_material_delivery_date,
        readiness_record
          .delivery_buffer_workdays
      );
  end if;

  if readiness_record.has_demo then
    demo_start_date :=
      readiness_record
        .installer_earliest_demo_start;

    if (
      readiness_record.customer_ready
      and readiness_record.site_access_ready
      and readiness_record.dumpster_ready
    ) is not true then
      demo_start_date := null;
    end if;
  else
    demo_start_date := null;
  end if;

  if (
    readiness_record
      .installer_earliest_construction_start
      is not null
    and material_safe_date is not null
  ) then
    construction_start_date :=
      greatest(
        readiness_record
          .installer_earliest_construction_start,
        material_safe_date
      );
  else
    construction_start_date := null;
  end if;

  if (
    readiness_record.permit_ready is not true
    or readiness_record.customer_ready is not true
    or readiness_record.site_access_ready is not true
  ) then
    construction_start_date := null;
  end if;

  readiness_status :=
    case
      when readiness_record.customer_ready
        is not true
        then 'waiting_on_customer'

      when readiness_record.permit_ready
        is not true
        then 'waiting_on_permit'

      when readiness_record
        .installer_earliest_construction_start
        is null
        then 'waiting_on_installer'

      when material_safe_date is null
        then 'waiting_on_materials'

      when construction_start_date is not null
        then 'ready_to_confirm'

      else 'planning'
    end;

  update public.project_material_phases
  set calculated_ready_date =
    case
      when confirmed_delivery_date is null
        then null
      else public.add_workdays(
        confirmed_delivery_date,
        delivery_buffer_workdays
      )
    end
  where project_id = requested_project_id;

  update public.project_schedule_readiness
  set
    calculated_material_safe_start =
      material_safe_date,

    calculated_demo_start =
      demo_start_date,

    calculated_construction_start =
      construction_start_date,

    schedule_status =
      case
        when schedule_status in (
          'confirmed',
          'in_progress',
          'completed',
          'on_hold'
        )
          then schedule_status
        else readiness_status
      end
  where project_id = requested_project_id;

  return jsonb_build_object(
    'success', true,
    'project_id', requested_project_id,
    'required_phase_count',
      required_phase_count,
    'confirmed_required_phase_count',
      confirmed_required_phase_count,
    'material_safe_start',
      material_safe_date,
    'demo_start',
      demo_start_date,
    'construction_start',
      construction_start_date,
    'schedule_status',
      readiness_status
  );
end;
$$;
ALTER FUNCTION "public"."recalculate_project_schedule"("requested_project_id" "uuid") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."record_change_order_approval_reminder"("requested_change_order_id" "uuid", "requested_auth_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  app_user_record public.app_users;
  change_order_record public.project_change_orders;
begin
  select *
  into app_user_record
  from public.app_users
  where auth_user_id =
    requested_auth_user_id
  limit 1;

  if app_user_record.id is null then
    raise exception
      'Authenticated application user not found.';
  end if;

  update public.project_change_orders
  set
    approval_reminder_sent_at =
      now(),

    approval_reminder_count =
      approval_reminder_count + 1,

    updated_at = now()

  where id =
    requested_change_order_id

    and status =
      'pending_customer'

    and approval_token is not null

  returning *
  into change_order_record;

  if change_order_record.id is null then
    raise exception
      'Pending customer change order not found.';
  end if;

  insert into public.project_activity (
    project_id,
    activity_type,
    title,
    actor_type,
    actor_app_user_id,
    source_table,
    source_id,
    metadata,
    occurred_at
  )
  values (
    change_order_record.project_id,
    'change_order_approval_reminder',
    'Change-order approval reminder sent',
    'office',
    app_user_record.id,
    'project_change_orders',
    gen_random_uuid(),
    jsonb_build_object(
      'change_order_id',
        change_order_record.id,

      'change_order_number',
        change_order_record.change_order_number,

      'approval_reminder_count',
        change_order_record.approval_reminder_count,

      'approval_reminder_sent_at',
        change_order_record.approval_reminder_sent_at
    ),
    change_order_record.approval_reminder_sent_at
  );

  return jsonb_build_object(
    'success', true,

    'change_order_id',
      change_order_record.id,

    'approval_reminder_sent_at',
      change_order_record.approval_reminder_sent_at,

    'approval_reminder_count',
      change_order_record.approval_reminder_count
  );
end;
$$;
ALTER FUNCTION "public"."record_change_order_approval_reminder"("requested_change_order_id" "uuid", "requested_auth_user_id" "uuid") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."record_project_inspection_result"("requested_inspection_id" "uuid", "requested_result_status" "text", "requested_result_summary" "text", "requested_correction_summary" "text", "requested_inspector_name" "text", "requested_inspector_department" "text", "requested_inspection_number" "text", "requested_completed_at" timestamp with time zone, "requested_reinspection_required" boolean, "requested_reinspection_due_date" "date", "requested_result_document_urls" "jsonb", "requested_result_photo_urls" "jsonb", "requested_extracted_result" "jsonb", "requested_extraction_status" "text", "requested_areas" "jsonb", "requested_auth_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  app_user_record public.app_users;
  inspection_record public.project_inspections;
  settings_record public.project_inspection_settings;
  history_record public.project_inspection_result_history;
  area_record record;
  area_count integer := 0;
begin
  if requested_result_status not in (
    'passed',
    'partial_pass',
    'failed'
  ) then
    raise exception
      'Inspection result must be passed, partial pass, or failed.';
  end if;

  if requested_extraction_status not in (
    'not_started',
    'processing',
    'review_required',
    'confirmed',
    'failed'
  ) then
    raise exception
      'Invalid extraction status.';
  end if;

  select *
  into app_user_record
  from public.app_users
  where auth_user_id =
    requested_auth_user_id
  limit 1;

  if app_user_record.id is null then
    raise exception
      'Authenticated application user not found.';
  end if;

  select *
  into inspection_record
  from public.project_inspections
  where id =
    requested_inspection_id
  limit 1
  for update;

  if inspection_record.id is null then
    raise exception
      'Inspection not found.';
  end if;

  select *
  into settings_record
  from public.project_inspection_settings
  where project_id =
    inspection_record.project_id
  limit 1;

  if settings_record.id is null
    or not settings_record.inspections_enabled
  then
    raise exception
      'Inspections are disabled for this project.';
  end if;

  if requested_result_status =
      'partial_pass'
    and not settings_record.partial_pass_enabled
  then
    raise exception
      'Partial inspection results are disabled for this project.';
  end if;

  if requested_result_status =
      'partial_pass'
    and (
      requested_areas is null
      or jsonb_typeof(requested_areas) <>
        'array'
      or jsonb_array_length(
        requested_areas
      ) = 0
    )
  then
    raise exception
      'At least one inspected area is required for a partial pass.';
  end if;

  insert into public.project_inspection_result_history (
    inspection_id,
    project_id,
    result_status,
    result_summary,
    correction_summary,
    inspector_name,
    inspector_department,
    inspection_number,
    completed_at,
    reinspection_required,
    reinspection_due_date,
    result_document_urls,
    result_photo_urls,
    extracted_result,
    extraction_status,
    contractor_confirmed,
    created_by
  )
  values (
    inspection_record.id,
    inspection_record.project_id,
    requested_result_status,
    nullif(
      btrim(
        coalesce(
          requested_result_summary,
          ''
        )
      ),
      ''
    ),
    nullif(
      btrim(
        coalesce(
          requested_correction_summary,
          ''
        )
      ),
      ''
    ),
    nullif(
      btrim(
        coalesce(
          requested_inspector_name,
          ''
        )
      ),
      ''
    ),
    nullif(
      btrim(
        coalesce(
          requested_inspector_department,
          ''
        )
      ),
      ''
    ),
    nullif(
      btrim(
        coalesce(
          requested_inspection_number,
          ''
        )
      ),
      ''
    ),
    coalesce(
      requested_completed_at,
      now()
    ),
    coalesce(
      requested_reinspection_required,
      false
    ),
    requested_reinspection_due_date,
    coalesce(
      requested_result_document_urls,
      '[]'::jsonb
    ),
    coalesce(
      requested_result_photo_urls,
      '[]'::jsonb
    ),
    coalesce(
      requested_extracted_result,
      '{}'::jsonb
    ),
    requested_extraction_status,
    false,
    app_user_record.id
  )
  returning *
  into history_record;

  update public.project_inspections
  set
    inspector_name =
      history_record.inspector_name,

    inspector_department =
      history_record.inspector_department,

    inspection_number =
      history_record.inspection_number,

    completed_at =
      history_record.completed_at,

    result_summary =
      history_record.result_summary,

    correction_summary =
      history_record.correction_summary,

    reinspection_required =
      history_record.reinspection_required,

    reinspection_due_date =
      history_record.reinspection_due_date,

    result_document_urls =
      history_record.result_document_urls,

    result_photo_urls =
      history_record.result_photo_urls,

    extracted_result =
      history_record.extracted_result,

    extraction_status =
      case
        when history_record.extraction_status =
          'not_started'
        then 'review_required'
        else history_record.extraction_status
      end,

    contractor_result_verified_at =
      null,

    contractor_result_verified_by =
      null,

    contractor_result_verification_notes =
      null,

    updated_at =
      now()

  where id =
    inspection_record.id;

  delete from public.project_inspection_areas
  where inspection_id =
    inspection_record.id;

  if requested_areas is not null
    and jsonb_typeof(requested_areas) =
      'array'
  then
    for area_record in
      select *
      from jsonb_to_recordset(
        requested_areas
      ) as area_data (
        area_name text,
        area_code text,
        result_status text,
        work_may_continue boolean,
        blocked_reason text,
        correction_notes text,
        reinspection_required boolean
      )
    loop
      if nullif(
        btrim(
          coalesce(
            area_record.area_name,
            ''
          )
        ),
        ''
      ) is null
      then
        raise exception
          'Every inspection area must have a name.';
      end if;

      if area_record.result_status not in (
        'passed',
        'failed',
        'partial_pass',
        'not_inspected',
        'not_applicable'
      ) then
        raise exception
          'Invalid result status for inspection area %.',
          area_record.area_name;
      end if;

      insert into public.project_inspection_areas (
        inspection_id,
        project_id,
        area_name,
        area_code,
        result_status,
        work_may_continue,
        blocked_reason,
        correction_notes,
        reinspection_required,
        released_at,
        released_by
      )
      values (
        inspection_record.id,
        inspection_record.project_id,
        btrim(
          area_record.area_name
        ),
        nullif(
          btrim(
            coalesce(
              area_record.area_code,
              ''
            )
          ),
          ''
        ),
        area_record.result_status,
        coalesce(
          area_record.work_may_continue,
          false
        ),
        nullif(
          btrim(
            coalesce(
              area_record.blocked_reason,
              ''
            )
          ),
          ''
        ),
        nullif(
          btrim(
            coalesce(
              area_record.correction_notes,
              ''
            )
          ),
          ''
        ),
        coalesce(
          area_record.reinspection_required,
          false
        ),
        case
          when coalesce(
            area_record.work_may_continue,
            false
          )
          then now()
          else null
        end,
        case
          when coalesce(
            area_record.work_may_continue,
            false
          )
          then app_user_record.id
          else null
        end
      );

      insert into public.project_inspection_result_area_history (
        result_history_id,
        inspection_id,
        project_id,
        area_name,
        area_code,
        result_status,
        work_may_continue,
        blocked_reason,
        correction_notes,
        reinspection_required
      )
      values (
        history_record.id,
        inspection_record.id,
        inspection_record.project_id,
        btrim(
          area_record.area_name
        ),
        nullif(
          btrim(
            coalesce(
              area_record.area_code,
              ''
            )
          ),
          ''
        ),
        area_record.result_status,
        coalesce(
          area_record.work_may_continue,
          false
        ),
        nullif(
          btrim(
            coalesce(
              area_record.blocked_reason,
              ''
            )
          ),
          ''
        ),
        nullif(
          btrim(
            coalesce(
              area_record.correction_notes,
              ''
            )
          ),
          ''
        ),
        coalesce(
          area_record.reinspection_required,
          false
        )
      );

      area_count :=
        area_count + 1;
    end loop;
  end if;

  insert into public.project_activity (
    project_id,
    activity_type,
    title,
    actor_type,
    actor_app_user_id,
    source_table,
    source_id,
    metadata,
    occurred_at
  )
  values (
    inspection_record.project_id,
    'inspection_result_uploaded',
    'Inspection result uploaded for contractor review',
    'office',
    app_user_record.id,
    'project_inspection_result_history',
    history_record.id,
    jsonb_build_object(
      'inspection_id',
        inspection_record.id,

      'inspection_name',
        inspection_record.inspection_name,

      'detected_result_status',
        requested_result_status,

      'area_count',
        area_count,

      'reinspection_required',
        requested_reinspection_required,

      'extraction_status',
        requested_extraction_status
    ),
    now()
  );

  return jsonb_build_object(
    'success',
      true,

    'inspection_id',
      inspection_record.id,

    'result_history_id',
      history_record.id,

    'result_status',
      requested_result_status,

    'area_count',
      area_count,

    'requires_contractor_confirmation',
      true
  );
end;
$$;
ALTER FUNCTION "public"."record_project_inspection_result"("requested_inspection_id" "uuid", "requested_result_status" "text", "requested_result_summary" "text", "requested_correction_summary" "text", "requested_inspector_name" "text", "requested_inspector_department" "text", "requested_inspection_number" "text", "requested_completed_at" timestamp with time zone, "requested_reinspection_required" boolean, "requested_reinspection_due_date" "date", "requested_result_document_urls" "jsonb", "requested_result_photo_urls" "jsonb", "requested_extracted_result" "jsonb", "requested_extraction_status" "text", "requested_areas" "jsonb", "requested_auth_user_id" "uuid") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."refresh_project_inspection_dependencies"("requested_project_id" "uuid", "requested_auth_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  app_user_record public.app_users;
  dependency_record record;
  new_blocking_status boolean;
  released_count integer := 0;
  blocked_count integer := 0;
begin
  select *
  into app_user_record
  from public.app_users
  where auth_user_id =
    requested_auth_user_id
  limit 1;

  if app_user_record.id is null then
    raise exception
      'Authenticated application user not found.';
  end if;

  for dependency_record in
    select
      dependency.id,
      dependency.inspection_id,
      dependency.inspection_area_id,
      dependency.task_id,
      dependency.dependency_type,
      dependency.is_blocking,
      inspection.inspection_name,
      inspection.inspection_status,
      area.area_name,
      area.work_may_continue

    from public.project_inspection_task_dependencies dependency

    join public.project_inspections inspection
      on inspection.id =
        dependency.inspection_id

    left join public.project_inspection_areas area
      on area.id =
        dependency.inspection_area_id

    where dependency.project_id =
      requested_project_id
  loop
    new_blocking_status :=
      case
        when dependency_record.dependency_type =
          'must_pass_before_start'
        then
          dependency_record.inspection_status <>
          'passed'

        when dependency_record.dependency_type =
          'must_be_scheduled_before_start'
        then
          dependency_record.inspection_status not in (
            'scheduled',
            'rescheduled',
            'passed',
            'partial_pass'
          )

        when dependency_record.dependency_type =
          'area_release_required'
        then
          not coalesce(
            dependency_record.work_may_continue,
            false
          )

        else true
      end;

    if dependency_record.is_blocking
      and not new_blocking_status
    then
      update public.project_inspection_task_dependencies
      set
        is_blocking =
          false,

        released_at =
          now(),

        released_by =
          app_user_record.id

      where id =
        dependency_record.id;

      released_count :=
        released_count + 1;

      insert into public.project_activity (
        project_id,
        activity_type,
        title,
        actor_type,
        actor_app_user_id,
        source_table,
        source_id,
        metadata,
        occurred_at
      )
      values (
        requested_project_id,
        'inspection_dependency_released',
        'Inspection schedule hold released',
        'system',
        app_user_record.id,
        'project_inspection_task_dependencies',
        dependency_record.id,

        jsonb_build_object(
          'inspection_id',
            dependency_record.inspection_id,

          'inspection_name',
            dependency_record.inspection_name,

          'inspection_area_id',
            dependency_record.inspection_area_id,

          'area_name',
            dependency_record.area_name,

          'task_id',
            dependency_record.task_id,

          'dependency_type',
            dependency_record.dependency_type
        ),

        now()
      );

    elsif not dependency_record.is_blocking
      and new_blocking_status
    then
      update public.project_inspection_task_dependencies
      set
        is_blocking =
          true,

        released_at =
          null,

        released_by =
          null

      where id =
        dependency_record.id;

      blocked_count :=
        blocked_count + 1;

      insert into public.project_activity (
        project_id,
        activity_type,
        title,
        actor_type,
        actor_app_user_id,
        source_table,
        source_id,
        metadata,
        occurred_at
      )
      values (
        requested_project_id,
        'inspection_dependency_blocked',
        'Inspection schedule hold restored',
        'system',
        app_user_record.id,
        'project_inspection_task_dependencies',
        dependency_record.id,

        jsonb_build_object(
          'inspection_id',
            dependency_record.inspection_id,

          'inspection_name',
            dependency_record.inspection_name,

          'inspection_area_id',
            dependency_record.inspection_area_id,

          'area_name',
            dependency_record.area_name,

          'task_id',
            dependency_record.task_id,

          'dependency_type',
            dependency_record.dependency_type
        ),

        now()
      );
    end if;
  end loop;

  return jsonb_build_object(
    'success',
      true,

    'project_id',
      requested_project_id,

    'released_dependency_count',
      released_count,

    'blocked_dependency_count',
      blocked_count
  );
end;
$$;
ALTER FUNCTION "public"."refresh_project_inspection_dependencies"("requested_project_id" "uuid", "requested_auth_user_id" "uuid") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."remove_project_inspection_task_dependency"("requested_dependency_id" "uuid", "requested_project_id" "uuid", "requested_reason" "text", "requested_auth_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  app_user_record public.app_users;
  dependency_record public.project_inspection_task_dependencies;
begin
  select *
  into app_user_record
  from public.app_users
  where auth_user_id =
    requested_auth_user_id
  limit 1;

  if app_user_record.id is null then
    raise exception
      'Authenticated application user not found.';
  end if;

  select *
  into dependency_record
  from public.project_inspection_task_dependencies
  where id =
    requested_dependency_id

    and project_id =
      requested_project_id
  limit 1;

  if dependency_record.id is null then
    raise exception
      'Inspection task dependency not found.';
  end if;

  delete from public.project_inspection_task_dependencies
  where id =
    dependency_record.id;

  insert into public.project_activity (
    project_id,
    activity_type,
    title,
    actor_type,
    actor_app_user_id,
    source_table,
    source_id,
    metadata,
    occurred_at
  )
  values (
    requested_project_id,
    'inspection_dependency_removed',
    'Inspection schedule dependency removed',
    'office',
    app_user_record.id,
    'project_inspection_task_dependencies',
    dependency_record.id,

    jsonb_build_object(
      'inspection_id',
        dependency_record.inspection_id,

      'inspection_area_id',
        dependency_record.inspection_area_id,

      'task_id',
        dependency_record.task_id,

      'dependency_type',
        dependency_record.dependency_type,

      'reason',
        nullif(
          btrim(
            coalesce(
              requested_reason,
              ''
            )
          ),
          ''
        )
    ),

    now()
  );

  return jsonb_build_object(
    'success',
      true,

    'dependency_id',
      dependency_record.id,

    'removed',
      true
  );
end;
$$;
ALTER FUNCTION "public"."remove_project_inspection_task_dependency"("requested_dependency_id" "uuid", "requested_project_id" "uuid", "requested_reason" "text", "requested_auth_user_id" "uuid") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."reopen_project_inspection_checklist"("requested_project_id" "uuid", "requested_reason" "text", "requested_auth_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  app_user_record public.app_users;
  settings_record public.project_inspection_settings;
  recorded_result_count integer;
begin
  select *
  into app_user_record
  from public.app_users
  where auth_user_id =
    requested_auth_user_id
  limit 1;

  if app_user_record.id is null then
    raise exception
      'Authenticated application user not found.';
  end if;

  if nullif(
    btrim(requested_reason),
    ''
  ) is null then
    raise exception
      'A reason is required to reopen the inspection checklist.';
  end if;

  select *
  into settings_record
  from public.project_inspection_settings
  where project_id =
    requested_project_id
  limit 1
  for update;

  if settings_record.id is null then
    raise exception
      'Project inspection settings not found.';
  end if;

  select count(*)
  into recorded_result_count
  from public.project_inspections inspection
  where inspection.project_id =
    requested_project_id

    and inspection.inspection_status in (
      'passed',
      'partial_pass',
      'failed'
    );

  if recorded_result_count > 0 then
    raise exception
      'The checklist cannot be reopened after inspection results have been recorded.';
  end if;

  delete from public.project_inspections inspection
  where inspection.project_id =
    requested_project_id

    and inspection.inspection_status in (
      'not_scheduled',
      'requested',
      'scheduled',
      'cancelled',
      'rescheduled',
      'not_required'
    );

  update public.project_inspection_settings
  set
    contractor_verified_at =
      null,

    contractor_verified_by =
      null,

    contractor_verification_text =
      null,

    checklist_locked_at =
      null,

    workflow_activated_at =
      null,

    workflow_activated_by =
      null,

    updated_at =
      now()

  where id =
    settings_record.id;

  insert into public.project_activity (
    project_id,
    activity_type,
    title,
    actor_type,
    actor_app_user_id,
    source_table,
    source_id,
    metadata,
    occurred_at
  )
  values (
    requested_project_id,
    'inspection_settings_updated',
    'Inspection checklist reopened',
    'office',
    app_user_record.id,
    'project_inspection_settings',
    settings_record.id,
    jsonb_build_object(
      'reason',
      btrim(requested_reason)
    ),
    now()
  );

  return jsonb_build_object(
    'success',
    true,
    'project_id',
    requested_project_id,
    'checklist_reopened',
    true
  );
end;
$$;
ALTER FUNCTION "public"."reopen_project_inspection_checklist"("requested_project_id" "uuid", "requested_reason" "text", "requested_auth_user_id" "uuid") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."require_feature_enabled"("requested_feature_key" "text", "requested_scope_type" "text" DEFAULT 'global'::"text", "requested_scope_id" "text" DEFAULT 'default'::"text") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  feature_map jsonb;
  feature_enabled boolean;
begin
  feature_map :=
    public.get_effective_feature_map(
      requested_scope_type,
      requested_scope_id
    );

  if not (
    feature_map ?
      requested_feature_key
  ) then
    raise exception
      'Unknown feature key: %',
      requested_feature_key;
  end if;

  feature_enabled :=
    coalesce(
      (
        feature_map ->
          requested_feature_key
      )::boolean,
      false
    );

  if not feature_enabled then
    raise exception
      'Feature disabled: %',
      requested_feature_key;
  end if;

  return true;
end;
$$;
ALTER FUNCTION "public"."require_feature_enabled"("requested_feature_key" "text", "requested_scope_type" "text", "requested_scope_id" "text") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."review_project_inspection_document_finding"("requested_finding_id" "uuid", "requested_project_id" "uuid", "requested_review_status" "text", "requested_review_notes" "text", "requested_modified_value" "text", "requested_modified_data" "jsonb", "requested_auth_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  app_user_record public.app_users;
  finding_record public.project_inspection_document_findings;
begin
  if requested_review_status not in (
    'accepted',
    'modified',
    'rejected',
    'needs_verification'
  ) then
    raise exception
      'Invalid document finding review status.';
  end if;

  select *
  into app_user_record
  from public.app_users
  where auth_user_id =
    requested_auth_user_id
  limit 1;

  if app_user_record.id is null then
    raise exception
      'Authenticated application user not found.';
  end if;

  select *
  into finding_record
  from public.project_inspection_document_findings
  where id =
    requested_finding_id

    and project_id =
      requested_project_id
  limit 1
  for update;

  if finding_record.id is null then
    raise exception
      'Inspection document finding not found.';
  end if;

  update public.project_inspection_document_findings
  set
    contractor_review_status =
      requested_review_status,

    contractor_review_notes =
      nullif(
        btrim(
          coalesce(
            requested_review_notes,
            ''
          )
        ),
        ''
      ),

    modified_value =
      case
        when requested_review_status =
          'modified'
        then nullif(
          btrim(
            coalesce(
              requested_modified_value,
              ''
            )
          ),
          ''
        )
        else modified_value
      end,

    modified_data =
      case
        when requested_review_status =
          'modified'
        then coalesce(
          requested_modified_data,
          '{}'::jsonb
        )
        else modified_data
      end,

    reviewed_at =
      now(),

    reviewed_by =
      app_user_record.id

  where id =
    finding_record.id

  returning *
  into finding_record;

  return jsonb_build_object(
    'success',
      true,

    'finding_id',
      finding_record.id,

    'review_status',
      finding_record.contractor_review_status
  );
end;
$$;
ALTER FUNCTION "public"."review_project_inspection_document_finding"("requested_finding_id" "uuid", "requested_project_id" "uuid", "requested_review_status" "text", "requested_review_notes" "text", "requested_modified_value" "text", "requested_modified_data" "jsonb", "requested_auth_user_id" "uuid") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."review_project_inspection_research_finding"("requested_finding_id" "uuid", "requested_project_id" "uuid", "requested_review_status" "text", "requested_review_notes" "text", "requested_modified_title" "text", "requested_modified_description" "text", "requested_modified_requirement_status" "text", "requested_auth_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  app_user_record public.app_users;
  finding_record public.project_inspection_research_findings;
begin
  if requested_review_status not in (
    'accepted',
    'rejected',
    'needs_verification',
    'modified'
  ) then
    raise exception
      'Invalid research finding review status.';
  end if;

  if requested_modified_requirement_status is not null
    and requested_modified_requirement_status not in (
      'required',
      'suggested',
      'not_required',
      'conditional',
      'unknown'
    )
  then
    raise exception
      'Invalid modified requirement status.';
  end if;

  select *
  into app_user_record
  from public.app_users
  where auth_user_id =
    requested_auth_user_id
  limit 1;

  if app_user_record.id is null then
    raise exception
      'Authenticated application user not found.';
  end if;

  select *
  into finding_record
  from public.project_inspection_research_findings
  where id =
    requested_finding_id

    and project_id =
      requested_project_id
  limit 1
  for update;

  if finding_record.id is null then
    raise exception
      'Inspection research finding not found.';
  end if;

  update public.project_inspection_research_findings
  set
    contractor_review_status =
      requested_review_status,

    contractor_review_notes =
      nullif(
        btrim(
          coalesce(
            requested_review_notes,
            ''
          )
        ),
        ''
      ),

    finding_title =
      case
        when requested_review_status =
          'modified'
        then coalesce(
          nullif(
            btrim(
              coalesce(
                requested_modified_title,
                ''
              )
            ),
            ''
          ),
          finding_title
        )
        else finding_title
      end,

    finding_description =
      case
        when requested_review_status =
          'modified'
        then coalesce(
          nullif(
            btrim(
              coalesce(
                requested_modified_description,
                ''
              )
            ),
            ''
          ),
          finding_description
        )
        else finding_description
      end,

    requirement_status =
      case
        when requested_review_status =
          'modified'
        then coalesce(
          requested_modified_requirement_status,
          requirement_status
        )
        else requirement_status
      end,

    reviewed_at =
      now(),

    reviewed_by =
      app_user_record.id

  where id =
    finding_record.id

  returning *
  into finding_record;

  insert into public.project_activity (
    project_id,
    activity_type,
    title,
    actor_type,
    actor_app_user_id,
    source_table,
    source_id,
    metadata,
    occurred_at
  )
  values (
    requested_project_id,
    'inspection_research_reviewed',
    'Inspection research finding reviewed',
    'office',
    app_user_record.id,
    'project_inspection_research_findings',
    finding_record.id,
    jsonb_build_object(
      'finding_title',
        finding_record.finding_title,

      'review_status',
        finding_record.contractor_review_status,

      'requirement_status',
        finding_record.requirement_status
    ),
    now()
  );

  return jsonb_build_object(
    'success',
      true,

    'finding_id',
      finding_record.id,

    'review_status',
      finding_record.contractor_review_status,

    'requirement_status',
      finding_record.requirement_status
  );
end;
$$;
ALTER FUNCTION "public"."review_project_inspection_research_finding"("requested_finding_id" "uuid", "requested_project_id" "uuid", "requested_review_status" "text", "requested_review_notes" "text", "requested_modified_title" "text", "requested_modified_description" "text", "requested_modified_requirement_status" "text", "requested_auth_user_id" "uuid") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."revoke_change_order_approval"("requested_change_order_id" "uuid", "requested_auth_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  app_user_record public.app_users;
  change_order_record public.project_change_orders;
  previous_token uuid;
  previous_status text;
begin
  select *
  into app_user_record
  from public.app_users
  where auth_user_id =
    requested_auth_user_id
  limit 1;

  if app_user_record.id is null then
    raise exception
      'Authenticated application user not found.';
  end if;

  select *
  into change_order_record
  from public.project_change_orders
  where id =
    requested_change_order_id
  limit 1
  for update;

  if change_order_record.id is null then
    raise exception
      'Change order not found.';
  end if;

  if change_order_record.status <> 'pending_customer' then
    raise exception
      'Only change orders waiting on the customer can be revoked.';
  end if;

  if change_order_record.approval_token is null then
    raise exception
      'This change order does not have an active approval link.';
  end if;

  previous_token :=
    change_order_record.approval_token;

  previous_status :=
    change_order_record.status;

  update public.project_change_orders
  set
    status = 'draft',

    approval_token = null,

    approval_sent_at = null,

    approval_opened_at = null,

    approval_expires_at = null,

    approval_reminder_sent_at = null,

    approval_reminder_count = 0,

    updated_at = now()

  where id =
    requested_change_order_id

  returning *
  into change_order_record;

  insert into public.project_activity (
    project_id,
    activity_type,
    title,
    actor_type,
    actor_app_user_id,
    source_table,
    source_id,
    metadata,
    occurred_at
  )
  values (
    change_order_record.project_id,
    'change_order_approval_revoked',
    'Change-order approval link revoked',
    'office',
    app_user_record.id,
    'project_change_orders',
    gen_random_uuid(),
    jsonb_build_object(
      'change_order_id',
        change_order_record.id,

      'change_order_number',
        change_order_record.change_order_number,

      'previous_status',
        previous_status,

      'current_status',
        change_order_record.status,

      'approval_link_revoked',
        true,

      'previous_token_existed',
        previous_token is not null
    ),
    now()
  );

  return jsonb_build_object(
    'success', true,

    'change_order_id',
      change_order_record.id,

    'status',
      change_order_record.status,

    'approval_token',
      change_order_record.approval_token
  );
end;
$$;
ALTER FUNCTION "public"."revoke_change_order_approval"("requested_change_order_id" "uuid", "requested_auth_user_id" "uuid") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."set_change_order_invoice_due_date_20260801"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
declare
  payment_terms_days integer;
begin
  if new.invoice_due_date is not null then
    return new;
  end if;

  if new.invoiced_at is null then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.invoiced_at is not null then
    return new;
  end if;

  select company.default_invoice_payment_terms_days
  into strict payment_terms_days
  from public.company_settings as company;

  new.invoice_due_date := new.invoiced_at::date + payment_terms_days;
  return new;
exception
  when no_data_found or too_many_rows then
    raise exception
      'Exactly one company_settings row is required to default an invoice due date.'
      using errcode = '55000';
end;
$$;
ALTER FUNCTION "public"."set_change_order_invoice_due_date_20260801"() OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."set_change_order_item_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at := now();
  return new;
end;
$$;
ALTER FUNCTION "public"."set_change_order_item_updated_at"() OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."set_crm_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;
ALTER FUNCTION "public"."set_crm_updated_at"() OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."set_customer_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;
ALTER FUNCTION "public"."set_customer_updated_at"() OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."set_feature_setting"("requested_scope_type" "text", "requested_scope_id" "text", "requested_feature_key" "text", "requested_is_enabled" boolean, "requested_auth_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  app_user_record public.app_users;
  global_setting public.feature_settings;
  saved_setting public.feature_settings;
begin
  if requested_scope_type not in (
    'global',
    'company',
    'workspace'
  ) then
    raise exception
      'Invalid feature-setting scope.';
  end if;

  if nullif(
    btrim(requested_scope_id),
    ''
  ) is null then
    raise exception
      'Feature-setting scope ID is required.';
  end if;

  select *
  into app_user_record
  from public.app_users
  where auth_user_id =
    requested_auth_user_id
  limit 1;

  if app_user_record.id is null then
    raise exception
      'Authenticated application user not found.';
  end if;

  select *
  into global_setting
  from public.feature_settings
  where
    scope_type = 'global'

    and scope_id = 'default'

    and feature_key =
      requested_feature_key
  limit 1;

  if global_setting.id is null then
    raise exception
      'Unknown feature key.';
  end if;

  if (
    requested_feature_key =
      'change_orders'

    and requested_is_enabled =
      false
  ) then
    insert into public.feature_settings (
      scope_type,
      scope_id,
      feature_key,
      is_enabled,
      display_name,
      description,
      category,
      sort_order,
      updated_by
    )

    select
      requested_scope_type,
      btrim(requested_scope_id),
      child.feature_key,
      false,
      child.display_name,
      child.description,
      child.category,
      child.sort_order,
      app_user_record.id

    from public.feature_settings child

    where
      child.scope_type =
        'global'

      and child.scope_id =
        'default'

      and child.feature_key like
        'change_order_%'

      and child.feature_key <>
        'change_orders'

    on conflict (
      scope_type,
      scope_id,
      feature_key
    )
    do update set
      is_enabled =
        false,

      updated_by =
        excluded.updated_by,

      updated_at =
        now();
  end if;

  insert into public.feature_settings (
    scope_type,
    scope_id,
    feature_key,
    is_enabled,
    display_name,
    description,
    category,
    sort_order,
    updated_by
  )
  values (
    requested_scope_type,
    btrim(requested_scope_id),
    requested_feature_key,
    requested_is_enabled,
    global_setting.display_name,
    global_setting.description,
    global_setting.category,
    global_setting.sort_order,
    app_user_record.id
  )
  on conflict (
    scope_type,
    scope_id,
    feature_key
  )
  do update set
    is_enabled =
      excluded.is_enabled,

    display_name =
      excluded.display_name,

    description =
      excluded.description,

    category =
      excluded.category,

    sort_order =
      excluded.sort_order,

    updated_by =
      excluded.updated_by,

    updated_at =
      now()

  returning *
  into saved_setting;

  return jsonb_build_object(
    'success', true,

    'scope_type',
      saved_setting.scope_type,

    'scope_id',
      saved_setting.scope_id,

    'feature_key',
      saved_setting.feature_key,

    'is_enabled',
      saved_setting.is_enabled,

    'effective_features',
      public.get_effective_feature_map(
        saved_setting.scope_type,
        saved_setting.scope_id
      )
  );
end;
$$;
ALTER FUNCTION "public"."set_feature_setting"("requested_scope_type" "text", "requested_scope_id" "text", "requested_feature_key" "text", "requested_is_enabled" boolean, "requested_auth_user_id" "uuid") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."set_inspection_research_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  new.updated_at := now();
  return new;
end;
$$;
ALTER FUNCTION "public"."set_inspection_research_updated_at"() OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."set_project_costs_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;
ALTER FUNCTION "public"."set_project_costs_updated_at"() OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."set_project_inspection_correction_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  new.updated_at := now();
  return new;
end;
$$;
ALTER FUNCTION "public"."set_project_inspection_correction_updated_at"() OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."set_project_inspection_document_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  new.updated_at := now();
  return new;
end;
$$;
ALTER FUNCTION "public"."set_project_inspection_document_updated_at"() OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."set_project_inspection_task_dependency"("requested_project_id" "uuid", "requested_inspection_id" "uuid", "requested_inspection_area_id" "uuid", "requested_task_id" "uuid", "requested_dependency_type" "text", "requested_auth_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  app_user_record public.app_users;
  settings_record public.project_inspection_settings;
  inspection_record public.project_inspections;
  area_record public.project_inspection_areas;
  dependency_record public.project_inspection_task_dependencies;
  should_block boolean := true;
  release_time timestamptz := null;
begin
  if requested_dependency_type not in (
    'must_pass_before_start',
    'must_be_scheduled_before_start',
    'area_release_required'
  ) then
    raise exception
      'Invalid inspection dependency type.';
  end if;

  if requested_task_id is null then
    raise exception
      'Task ID is required.';
  end if;

  select *
  into app_user_record
  from public.app_users
  where auth_user_id =
    requested_auth_user_id
  limit 1;

  if app_user_record.id is null then
    raise exception
      'Authenticated application user not found.';
  end if;

  select *
  into settings_record
  from public.project_inspection_settings
  where project_id =
    requested_project_id
  limit 1;

  if settings_record.id is null then
    raise exception
      'Project inspection settings not found.';
  end if;

  if not settings_record.inspections_enabled then
    raise exception
      'Inspections are disabled for this project.';
  end if;

  if not settings_record.schedule_dependencies_enabled then
    raise exception
      'Inspection schedule dependencies are disabled for this project.';
  end if;

  select *
  into inspection_record
  from public.project_inspections
  where id =
    requested_inspection_id

    and project_id =
      requested_project_id
  limit 1;

  if inspection_record.id is null then
    raise exception
      'Inspection not found for this project.';
  end if;

  if requested_inspection_area_id is not null then
    select *
    into area_record
    from public.project_inspection_areas
    where id =
      requested_inspection_area_id

      and inspection_id =
        requested_inspection_id

      and project_id =
        requested_project_id
    limit 1;

    if area_record.id is null then
      raise exception
        'Inspection area not found.';
    end if;
  end if;

  if requested_dependency_type =
    'must_pass_before_start'
  then
    should_block :=
      inspection_record.inspection_status <>
      'passed';

  elsif requested_dependency_type =
    'must_be_scheduled_before_start'
  then
    should_block :=
      inspection_record.inspection_status not in (
        'scheduled',
        'rescheduled',
        'passed',
        'partial_pass'
      );

  elsif requested_dependency_type =
    'area_release_required'
  then
    if requested_inspection_area_id is null then
      raise exception
        'An inspection area is required for an area-release dependency.';
    end if;

    should_block :=
      not area_record.work_may_continue;
  end if;

  if not should_block then
    release_time := now();
  end if;

  insert into public.project_inspection_task_dependencies (
    inspection_id,
    inspection_area_id,
    project_id,
    task_id,
    dependency_type,
    is_blocking,
    released_at,
    released_by
  )
  values (
    requested_inspection_id,
    requested_inspection_area_id,
    requested_project_id,
    requested_task_id,
    requested_dependency_type,
    should_block,
    release_time,
    case
      when should_block
      then null
      else app_user_record.id
    end
  )
  on conflict (
    inspection_id,
    coalesce(
      inspection_area_id,
      '00000000-0000-0000-0000-000000000000'::uuid
    ),
    task_id,
    dependency_type
  )
  do update set
    is_blocking =
      excluded.is_blocking,

    released_at =
      excluded.released_at,

    released_by =
      excluded.released_by

  returning *
  into dependency_record;

  insert into public.project_activity (
    project_id,
    activity_type,
    title,
    actor_type,
    actor_app_user_id,
    source_table,
    source_id,
    metadata,
    occurred_at
  )
  values (
    requested_project_id,
    'inspection_dependency_added',

    case
      when should_block
      then 'Inspection schedule dependency added'
      else 'Satisfied inspection dependency added'
    end,

    'office',
    app_user_record.id,
    'project_inspection_task_dependencies',
    dependency_record.id,

    jsonb_build_object(
      'inspection_id',
        requested_inspection_id,

      'inspection_name',
        inspection_record.inspection_name,

      'inspection_area_id',
        requested_inspection_area_id,

      'area_name',
        area_record.area_name,

      'task_id',
        requested_task_id,

      'dependency_type',
        requested_dependency_type,

      'is_blocking',
        should_block
    ),

    now()
  );

  return jsonb_build_object(
    'success',
      true,

    'dependency_id',
      dependency_record.id,

    'project_id',
      dependency_record.project_id,

    'inspection_id',
      dependency_record.inspection_id,

    'inspection_area_id',
      dependency_record.inspection_area_id,

    'task_id',
      dependency_record.task_id,

    'dependency_type',
      dependency_record.dependency_type,

    'is_blocking',
      dependency_record.is_blocking,

    'released_at',
      dependency_record.released_at
  );
end;
$$;
ALTER FUNCTION "public"."set_project_inspection_task_dependency"("requested_project_id" "uuid", "requested_inspection_id" "uuid", "requested_inspection_area_id" "uuid", "requested_task_id" "uuid", "requested_dependency_type" "text", "requested_auth_user_id" "uuid") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;
ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."snapshot_change_order_response_items"("requested_response_id" "uuid", "requested_change_order_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  inserted_count integer;
begin
  insert into public.project_change_order_response_items (
    response_id,
    change_order_item_id,
    description,
    quantity,
    unit,
    unit_price,
    unit_cost,
    sales_total,
    cost_total,
    sort_order
  )
  select
    requested_response_id,
    item.id,
    item.description,
    item.quantity,
    item.unit,
    item.unit_price,
    item.unit_cost,
    round(
      item.quantity *
      item.unit_price,
      2
    ),
    round(
      item.quantity *
      item.unit_cost,
      2
    ),
    item.sort_order
  from public.project_change_order_items item
  where item.change_order_id =
    requested_change_order_id
  order by
    item.sort_order,
    item.created_at;

  get diagnostics inserted_count =
    row_count;

  return inserted_count;
end;
$$;
ALTER FUNCTION "public"."snapshot_change_order_response_items"("requested_response_id" "uuid", "requested_change_order_id" "uuid") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."start_project_inspection_document_extraction"("requested_document_id" "uuid", "requested_project_id" "uuid", "requested_auth_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  app_user_record public.app_users;
  document_record public.project_inspection_documents;
  settings_record public.project_inspection_settings;
begin
  select *
  into app_user_record
  from public.app_users
  where auth_user_id =
    requested_auth_user_id
  limit 1;

  if app_user_record.id is null then
    raise exception
      'Authenticated application user not found.';
  end if;

  select *
  into settings_record
  from public.project_inspection_settings
  where project_id =
    requested_project_id
  limit 1;

  if settings_record.id is null
    or not settings_record.document_extraction_enabled
  then
    raise exception
      'Inspection document extraction is disabled for this project.';
  end if;

  select *
  into document_record
  from public.project_inspection_documents
  where id =
    requested_document_id

    and project_id =
      requested_project_id
  limit 1
  for update;

  if document_record.id is null then
    raise exception
      'Inspection document not found.';
  end if;

  update public.project_inspection_documents
  set
    extraction_status =
      'processing',

    extraction_attempt_count =
      extraction_attempt_count + 1,

    extraction_started_at =
      now(),

    extraction_completed_at =
      null,

    extraction_failed_at =
      null,

    extraction_error =
      null

  where id =
    document_record.id;

  insert into public.project_activity (
    project_id,
    activity_type,
    title,
    actor_type,
    actor_app_user_id,
    source_table,
    source_id,
    metadata,
    occurred_at
  )
  values (
    requested_project_id,
    'inspection_document_extraction_started',
    'Inspection document extraction started',
    'office',
    app_user_record.id,
    'project_inspection_documents',
    document_record.id,
    jsonb_build_object(
      'file_name',
        document_record.file_name,

      'attempt_number',
        document_record.extraction_attempt_count + 1
    ),
    now()
  );

  return jsonb_build_object(
    'success',
      true,

    'document_id',
      document_record.id,

    'extraction_status',
      'processing'
  );
end;
$$;
ALTER FUNCTION "public"."start_project_inspection_document_extraction"("requested_document_id" "uuid", "requested_project_id" "uuid", "requested_auth_user_id" "uuid") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."submit_change_order_response"("requested_token" "uuid", "requested_response" "text", "requested_customer_name" "text", "requested_notes" "text" DEFAULT NULL::"text", "requested_ip" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  change_order_record public.project_change_orders;
  clean_customer_name text;
  clean_notes text;
begin
  clean_customer_name :=
    nullif(
      btrim(requested_customer_name),
      ''
    );

  clean_notes :=
    nullif(
      btrim(requested_notes),
      ''
    );

  if requested_response not in (
    'approved',
    'declined'
  ) then
    raise exception
      'Invalid change-order response.';
  end if;

  if clean_customer_name is null then
    raise exception
      'Customer name is required.';
  end if;

  select *
  into change_order_record
  from public.project_change_orders
  where approval_token = requested_token
  limit 1
  for update;

  if change_order_record.id is null then
    raise exception
      'Change order not found.';
  end if;

  if (
    change_order_record.approval_expires_at is not null
    and change_order_record.approval_expires_at < now()
  ) then
    raise exception
      'This change-order approval link has expired.';
  end if;

  if change_order_record.status in (
    'approved',
    'declined',
    'completed',
    'cancelled'
  ) then
    return jsonb_build_object(
      'success', false,
      'already_submitted', true,
      'status', change_order_record.status,
      'approved_by_name',
        change_order_record.approved_by_name,
      'approved_at',
        change_order_record.approved_at,
      'declined_at',
        change_order_record.declined_at
    );
  end if;

  update public.project_change_orders
  set
    status = requested_response,

    approved_by_name =
      case
        when requested_response = 'approved'
          then clean_customer_name
        else approved_by_name
      end,

    approved_at =
      case
        when requested_response = 'approved'
          then now()
        else null
      end,

    declined_at =
      case
        when requested_response = 'declined'
          then now()
        else null
      end,

    customer_response_notes =
      clean_notes,

    customer_response_ip =
      requested_ip,

    updated_at = now()

  where id = change_order_record.id

  returning *
  into change_order_record;

  return jsonb_build_object(
    'success', true,
    'change_order_id',
      change_order_record.id,
    'status',
      change_order_record.status,
    'approved_by_name',
      change_order_record.approved_by_name,
    'approved_at',
      change_order_record.approved_at,
    'declined_at',
      change_order_record.declined_at
  );
end;
$$;
ALTER FUNCTION "public"."submit_change_order_response"("requested_token" "uuid", "requested_response" "text", "requested_customer_name" "text", "requested_notes" "text", "requested_ip" "text") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."submit_change_order_response_v2"("requested_token" "uuid", "requested_response" "text", "requested_customer_name" "text", "requested_notes" "text" DEFAULT NULL::"text", "requested_ip" "text" DEFAULT NULL::"text", "requested_user_agent" "text" DEFAULT NULL::"text", "requested_acknowledged_terms" boolean DEFAULT false) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  change_order_record public.project_change_orders;
  response_record public.project_change_order_responses;
  clean_customer_name text;
  clean_notes text;
  agreement_text text;
  response_time timestamptz;
  item_count integer;
begin
  clean_customer_name :=
    nullif(
      btrim(requested_customer_name),
      ''
    );

  clean_notes :=
    nullif(
      btrim(requested_notes),
      ''
    );

  if requested_response not in (
    'approved',
    'declined'
  ) then
    raise exception
      'Invalid change-order response.';
  end if;

  if clean_customer_name is null then
    raise exception
      'Customer name is required.';
  end if;

  if requested_acknowledged_terms is not true then
    raise exception
      'Customer acknowledgement is required.';
  end if;

  select *
  into change_order_record
  from public.project_change_orders
  where approval_token =
    requested_token
  limit 1
  for update;

  if change_order_record.id is null then
    raise exception
      'Change order not found.';
  end if;

  if (
    change_order_record
      .superseded_by_change_order_id
    is not null
  ) then
    raise exception
      'This change order has been replaced by a newer revision.';
  end if;

  if (
    change_order_record.approval_expires_at
      is not null
    and change_order_record.approval_expires_at
      < now()
  ) then
    raise exception
      'This change-order approval link has expired.';
  end if;

  if change_order_record.status in (
    'approved',
    'declined',
    'completed',
    'cancelled'
  ) then
    return jsonb_build_object(
      'success', false,
      'already_submitted', true,
      'status',
        change_order_record.status,
      'approved_by_name',
        change_order_record.approved_by_name,
      'approved_at',
        change_order_record.approved_at,
      'declined_at',
        change_order_record.declined_at
    );
  end if;

  agreement_text :=
    case
      when requested_response =
        'approved'
      then
        'I approve this change order, including the stated price and schedule impact, and authorize McKenzie Construction to proceed with the described work.'
      else
        'I decline this change order and understand that McKenzie Construction is not authorized to proceed with the described additional work.'
    end;

  response_time := now();

  insert into public.project_change_order_responses (
    change_order_id,
    project_id,
    response,
    customer_name,
    customer_notes,
    agreement_text,
    acknowledged_terms,
    submitted_at,
    submitted_ip,
    submitted_user_agent,
    approval_token,
    change_order_number,
    title,
    description,
    reason,
    amount,
    schedule_impact_days,
    customer_notes_snapshot
  )
  values (
    change_order_record.id,
    change_order_record.project_id,
    requested_response,
    clean_customer_name,
    clean_notes,
    agreement_text,
    true,
    response_time,
    requested_ip,
    requested_user_agent,
    change_order_record.approval_token,
    change_order_record.change_order_number,
    change_order_record.title,
    change_order_record.description,
    change_order_record.reason,
    change_order_record.amount,
    change_order_record.schedule_impact_days,
    change_order_record.customer_notes
  )
  returning *
  into response_record;

  item_count :=
    public.snapshot_change_order_response_items(
      response_record.id,
      change_order_record.id
    );

  update public.project_change_orders
  set
    status =
      requested_response,

    approved_by_name =
      clean_customer_name,

    approved_at =
      case
        when requested_response =
          'approved'
        then response_time
        else null
      end,

    declined_at =
      case
        when requested_response =
          'declined'
        then response_time
        else null
      end,

    customer_response_notes =
      clean_notes,

    customer_response_ip =
      requested_ip,

    customer_response_user_agent =
      requested_user_agent,

    customer_acknowledged_terms =
      true,

    customer_agreement_text =
      agreement_text,

    response_reviewed_at =
      null,

    response_reviewed_by =
      null,

    updated_at =
      response_time

  where id =
    change_order_record.id

  returning *
  into change_order_record;

  return jsonb_build_object(
    'success', true,

    'change_order_id',
      change_order_record.id,

    'response_id',
      response_record.id,

    'line_item_count',
      item_count,

    'status',
      change_order_record.status,

    'approved_by_name',
      change_order_record.approved_by_name,

    'approved_at',
      change_order_record.approved_at,

    'declined_at',
      change_order_record.declined_at,

    'customer_acknowledged_terms',
      change_order_record.customer_acknowledged_terms,

    'customer_agreement_text',
      change_order_record.customer_agreement_text
  );
end;
$$;
ALTER FUNCTION "public"."submit_change_order_response_v2"("requested_token" "uuid", "requested_response" "text", "requested_customer_name" "text", "requested_notes" "text", "requested_ip" "text", "requested_user_agent" "text", "requested_acknowledged_terms" boolean) OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."submit_change_order_vendor_response"("requested_token" "uuid", "requested_response_status" "text", "requested_responder_name" "text", "requested_responder_email" "text" DEFAULT NULL::"text", "requested_responder_phone" "text" DEFAULT NULL::"text", "requested_quoted_cost" numeric DEFAULT NULL::numeric, "requested_earliest_start_date" "date" DEFAULT NULL::"date", "requested_expected_delivery_date" "date" DEFAULT NULL::"date", "requested_duration_days" integer DEFAULT NULL::integer, "requested_lead_time_days" integer DEFAULT NULL::integer, "requested_quote_expiration_date" "date" DEFAULT NULL::"date", "requested_notes" "text" DEFAULT NULL::"text", "requested_exclusions" "text" DEFAULT NULL::"text", "requested_attachment_urls" "jsonb" DEFAULT '[]'::"jsonb", "requested_ip" "text" DEFAULT NULL::"text", "requested_user_agent" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  request_record public.change_order_vendor_requests;
  response_record public.change_order_vendor_responses;
  clean_name text;
begin
  clean_name :=
    nullif(
      btrim(requested_responder_name),
      ''
    );

  if clean_name is null then
    raise exception
      'Responder name is required.';
  end if;

  if requested_response_status not in (
    'submitted',
    'declined'
  ) then
    raise exception
      'Invalid response status.';
  end if;

  select *
  into request_record
  from public.change_order_vendor_requests
  where request_token =
    requested_token
  limit 1
  for update;

  if request_record.id is null then
    raise exception
      'Request not found.';
  end if;

  if request_record.request_status in (
    'submitted',
    'declined',
    'cancelled',
    'expired'
  ) then
    raise exception
      'This request is no longer available.';
  end if;

  if (
    request_record.expires_at is not null
    and request_record.expires_at < now()
  ) then
    update public.change_order_vendor_requests
    set
      request_status = 'expired',
      updated_at = now()
    where id =
      request_record.id;

    raise exception
      'This request has expired.';
  end if;

  insert into public.change_order_vendor_responses (
    request_id,
    change_order_id,
    project_id,
    response_status,
    responder_name,
    responder_email,
    responder_phone,
    quoted_cost,
    earliest_start_date,
    expected_delivery_date,
    duration_days,
    lead_time_days,
    quote_expiration_date,
    notes,
    exclusions,
    attachment_urls,
    submitted_ip,
    submitted_user_agent
  )
  values (
    request_record.id,
    request_record.change_order_id,
    request_record.project_id,
    requested_response_status,
    clean_name,
    nullif(
      btrim(requested_responder_email),
      ''
    ),
    nullif(
      btrim(requested_responder_phone),
      ''
    ),
    requested_quoted_cost,
    requested_earliest_start_date,
    requested_expected_delivery_date,
    requested_duration_days,
    requested_lead_time_days,
    requested_quote_expiration_date,
    nullif(
      btrim(requested_notes),
      ''
    ),
    nullif(
      btrim(requested_exclusions),
      ''
    ),
    coalesce(
      requested_attachment_urls,
      '[]'::jsonb
    ),
    requested_ip,
    requested_user_agent
  )
  returning *
  into response_record;

  update public.change_order_vendor_requests
  set
    request_status =
      requested_response_status,

    submitted_at =
      case
        when requested_response_status =
          'submitted'
        then now()
        else null
      end,

    declined_at =
      case
        when requested_response_status =
          'declined'
        then now()
        else null
      end,

    updated_at = now()

  where id =
    request_record.id;

  insert into public.project_activity (
    project_id,
    activity_type,
    title,
    actor_type,
    source_table,
    source_id,
    metadata,
    occurred_at
  )
  values (
    request_record.project_id,

    case
      when requested_response_status =
        'submitted'
      then
        'change_order_vendor_response_submitted'
      else
        'change_order_vendor_response_declined'
    end,

    case
      when requested_response_status =
        'submitted'
      then
        'Vendor schedule and cost response submitted'
      else
        'Vendor schedule and cost request declined'
    end,

    request_record.recipient_type,

    'change_order_vendor_responses',

    response_record.id,

    jsonb_build_object(
      'change_order_id',
        request_record.change_order_id,

      'vendor_request_id',
        request_record.id,

      'vendor_response_id',
        response_record.id,

      'recipient_type',
        request_record.recipient_type,

      'recipient_name',
        request_record.recipient_name,

      'responder_name',
        response_record.responder_name,

      'quoted_cost',
        response_record.quoted_cost,

      'earliest_start_date',
        response_record.earliest_start_date,

      'expected_delivery_date',
        response_record.expected_delivery_date,

      'duration_days',
        response_record.duration_days,

      'lead_time_days',
        response_record.lead_time_days
    ),

    now()
  );

  return jsonb_build_object(
    'success', true,

    'request_id',
      request_record.id,

    'response_id',
      response_record.id,

    'response_status',
      requested_response_status
  );
end;
$$;
ALTER FUNCTION "public"."submit_change_order_vendor_response"("requested_token" "uuid", "requested_response_status" "text", "requested_responder_name" "text", "requested_responder_email" "text", "requested_responder_phone" "text", "requested_quoted_cost" numeric, "requested_earliest_start_date" "date", "requested_expected_delivery_date" "date", "requested_duration_days" integer, "requested_lead_time_days" integer, "requested_quote_expiration_date" "date", "requested_notes" "text", "requested_exclusions" "text", "requested_attachment_urls" "jsonb", "requested_ip" "text", "requested_user_agent" "text") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."submit_schedule_request_by_token"("requested_token" "uuid", "requested_language" "text", "requested_earliest_demo_start" "date", "requested_earliest_construction_start" "date", "requested_demo_duration_days" integer, "requested_total_duration_days" integer, "requested_notes" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  request_record public.subcontractor_schedule_requests;
begin
  select *
  into request_record
  from public.subcontractor_schedule_requests
  where secure_token = requested_token
  for update;

  if request_record.id is null then
    return jsonb_build_object('success', false);
  end if;

  if request_record.status = 'submitted'
    or request_record.submitted_at is not null
  then
    return jsonb_build_object(
      'success', false,
      'already_submitted', true
    );
  end if;

  if request_record.status in ('cancelled', 'expired')
    or (
      request_record.expires_at is not null
      and request_record.expires_at < now()
    )
  then
    return jsonb_build_object('success', false);
  end if;

  if requested_language not in ('en', 'es')
    or requested_earliest_demo_start is null
    or requested_earliest_construction_start is null
    or requested_demo_duration_days not between 1 and 365
    or requested_total_duration_days not between requested_demo_duration_days and 730
    or length(coalesce(requested_notes, '')) > 4000
  then
    return jsonb_build_object('success', false);
  end if;

  update public.subcontractor_schedule_requests
  set
    language = requested_language,
    earliest_demo_start = requested_earliest_demo_start,
    earliest_construction_start = requested_earliest_construction_start,
    demo_duration_days = requested_demo_duration_days,
    total_duration_days = requested_total_duration_days,
    notes_original = nullif(btrim(requested_notes), ''),
    notes_language = case
      when nullif(btrim(requested_notes), '') is null then null
      else requested_language
    end,
    translation_status = case
      when requested_language = 'es'
        and nullif(btrim(requested_notes), '') is not null
      then 'pending'
      else 'not_requested'
    end,
    submitted_at = now(),
    status = 'submitted'
  where id = request_record.id;

  return jsonb_build_object('success', true);
end;
$$;
ALTER FUNCTION "public"."submit_schedule_request_by_token"("requested_token" "uuid", "requested_language" "text", "requested_earliest_demo_start" "date", "requested_earliest_construction_start" "date", "requested_demo_duration_days" integer, "requested_total_duration_days" integer, "requested_notes" "text") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."sync_change_order_invoice_status"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if new.billing_status = 'void' then
    new.paid_at := null;
    return new;
  end if;

  if (
    new.invoice_number is distinct from
      old.invoice_number

    or new.invoiced_at is distinct from
      old.invoiced_at

    or new.amount is distinct from
      old.amount
  ) then
    if (
      new.invoiced_at is null
      and nullif(
        btrim(new.invoice_number),
        ''
      ) is null
      and new.amount_paid = 0
    ) then
      new.billing_status :=
        'not_billed';

    elsif new.amount_paid >= new.amount
      and new.amount > 0
    then
      new.billing_status :=
        'paid';

      new.paid_at :=
        coalesce(
          new.paid_at,
          now()
        );

    elsif new.amount_paid > 0 then
      new.billing_status :=
        'partially_paid';

      new.paid_at := null;

    else
      new.billing_status :=
        'invoiced';

      new.invoiced_at :=
        coalesce(
          new.invoiced_at,
          now()
        );

      new.paid_at := null;
    end if;
  end if;

  return new;
end;
$$;
ALTER FUNCTION "public"."sync_change_order_invoice_status"() OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."sync_change_order_item_totals"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  target_change_order_id uuid;
begin
  target_change_order_id :=
    coalesce(
      new.change_order_id,
      old.change_order_id
    );

  perform public.recalculate_change_order_totals(
    target_change_order_id
  );

  if (
    tg_op = 'UPDATE'
    and old.change_order_id
      is distinct from
      new.change_order_id
  ) then
    perform public.recalculate_change_order_totals(
      old.change_order_id
    );
  end if;

  return coalesce(new, old);
end;
$$;
ALTER FUNCTION "public"."sync_change_order_item_totals"() OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."sync_change_order_payment_status"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  target_change_order_id uuid;
begin
  target_change_order_id :=
    case
      when tg_op = 'DELETE'
      then old.change_order_id
      else new.change_order_id
    end;

  perform public.recalculate_change_order_payment_status(
    target_change_order_id
  );

  if (
    tg_op = 'UPDATE'
    and old.change_order_id <>
      new.change_order_id
  ) then
    perform public.recalculate_change_order_payment_status(
      old.change_order_id
    );
  end if;

  return case
    when tg_op = 'DELETE'
    then old
    else new
  end;
end;
$$;
ALTER FUNCTION "public"."sync_change_order_payment_status"() OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."sync_existing_installer_schedule_responses"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  request_record record;
  synced_count integer := 0;
begin
  for request_record in
    select *
    from public.subcontractor_schedule_requests
    where status = 'submitted'
      and submitted_at is not null
  loop
    insert into public.project_schedule_readiness (
      project_id,
      installer_earliest_demo_start,
      installer_earliest_construction_start,
      expected_demo_duration_days,
      expected_total_duration_days,
      schedule_status
    )
    values (
      request_record.project_id,
      request_record.earliest_demo_start,
      request_record.earliest_construction_start,
      request_record.demo_duration_days,
      request_record.total_duration_days,
      'planning'
    )
    on conflict (project_id) do update
    set
      installer_earliest_demo_start =
        excluded.installer_earliest_demo_start,

      installer_earliest_construction_start =
        excluded.installer_earliest_construction_start,

      expected_demo_duration_days =
        excluded.expected_demo_duration_days,

      expected_total_duration_days =
        excluded.expected_total_duration_days,

      updated_at = now();

    perform public.recalculate_project_schedule(
      request_record.project_id
    );

    synced_count := synced_count + 1;
  end loop;

  return jsonb_build_object(
    'success', true,
    'synced_count', synced_count
  );
end;
$$;
ALTER FUNCTION "public"."sync_existing_installer_schedule_responses"() OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."touch_project_message_thread"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  update public.project_message_threads
  set last_message_at =
    coalesce(
      new.sent_at,
      new.created_at,
      now()
    )
  where id = new.thread_id;

  return new;
end;
$$;
ALTER FUNCTION "public"."touch_project_message_thread"() OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."update_project_inspection_correction"("requested_correction_id" "uuid", "requested_project_id" "uuid", "requested_action" "text", "requested_assigned_app_user_id" "uuid", "requested_assigned_subcontractor_id" "uuid", "requested_assigned_name" "text", "requested_assigned_company" "text", "requested_assigned_email" "text", "requested_assigned_phone" "text", "requested_due_date" "date", "requested_completion_notes" "text", "requested_completion_photo_urls" "jsonb", "requested_completion_document_urls" "jsonb", "requested_verification_notes" "text", "requested_auth_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  app_user_record public.app_users;
  correction_record public.project_inspection_corrections;
  new_status text;
  activity_type_value text;
  activity_title text;
begin
  if requested_action not in (
    'assign',
    'start',
    'complete',
    'verify',
    'reopen',
    'cancel',
    'request_reinspection',
    'schedule_reinspection'
  ) then
    raise exception
      'Invalid correction action.';
  end if;

  select *
  into app_user_record
  from public.app_users
  where auth_user_id =
    requested_auth_user_id
  limit 1;

  if app_user_record.id is null then
    raise exception
      'Authenticated application user not found.';
  end if;

  select *
  into correction_record
  from public.project_inspection_corrections
  where id =
    requested_correction_id

    and project_id =
      requested_project_id
  limit 1
  for update;

  if correction_record.id is null then
    raise exception
      'Inspection correction not found.';
  end if;

  if requested_action = 'assign' then
    new_status := 'assigned';
    activity_type_value :=
      'inspection_correction_assigned';
    activity_title :=
      'Inspection correction assigned';

    update public.project_inspection_corrections
    set
      correction_status =
        new_status,

      assigned_app_user_id =
        requested_assigned_app_user_id,

      assigned_subcontractor_id =
        requested_assigned_subcontractor_id,

      assigned_name =
        nullif(
          btrim(
            coalesce(
              requested_assigned_name,
              ''
            )
          ),
          ''
        ),

      assigned_company =
        nullif(
          btrim(
            coalesce(
              requested_assigned_company,
              ''
            )
          ),
          ''
        ),

      assigned_email =
        nullif(
          btrim(
            coalesce(
              requested_assigned_email,
              ''
            )
          ),
          ''
        ),

      assigned_phone =
        nullif(
          btrim(
            coalesce(
              requested_assigned_phone,
              ''
            )
          ),
          ''
        ),

      due_date =
        requested_due_date

    where id =
      correction_record.id;

  elsif requested_action = 'start' then
    new_status := 'in_progress';
    activity_type_value :=
      'inspection_correction_started';
    activity_title :=
      'Inspection correction started';

    update public.project_inspection_corrections
    set
      correction_status =
        new_status,

      work_started_at =
        coalesce(
          work_started_at,
          now()
        )

    where id =
      correction_record.id;

  elsif requested_action = 'complete' then
    new_status :=
      'ready_for_verification';

    activity_type_value :=
      'inspection_correction_completed';

    activity_title :=
      'Inspection correction marked complete';

    update public.project_inspection_corrections
    set
      correction_status =
        new_status,

      work_started_at =
        coalesce(
          work_started_at,
          now()
        ),

      work_completed_at =
        now(),

      completion_notes =
        nullif(
          btrim(
            coalesce(
              requested_completion_notes,
              ''
            )
          ),
          ''
        ),

      completion_photo_urls =
        coalesce(
          requested_completion_photo_urls,
          '[]'::jsonb
        ),

      completion_document_urls =
        coalesce(
          requested_completion_document_urls,
          '[]'::jsonb
        )

    where id =
      correction_record.id;

  elsif requested_action = 'verify' then
    if correction_record.correction_status <>
      'ready_for_verification'
    then
      raise exception
        'The correction must be completed before it can be verified.';
    end if;

    new_status := 'verified';

    activity_type_value :=
      'inspection_correction_verified';

    activity_title :=
      'Inspection correction verified';

    update public.project_inspection_corrections
    set
      correction_status =
        new_status,

      verified_at =
        now(),

      verified_by =
        app_user_record.id,

      verification_notes =
        nullif(
          btrim(
            coalesce(
              requested_verification_notes,
              ''
            )
          ),
          ''
        )

    where id =
      correction_record.id;

  elsif requested_action = 'reopen' then
    new_status := 'reopened';

    activity_type_value :=
      'inspection_correction_reopened';

    activity_title :=
      'Inspection correction reopened';

    update public.project_inspection_corrections
    set
      correction_status =
        new_status,

      verified_at =
        null,

      verified_by =
        null,

      verification_notes =
        null,

      work_completed_at =
        null

    where id =
      correction_record.id;

  elsif requested_action = 'cancel' then
    new_status := 'cancelled';

    activity_type_value :=
      'inspection_settings_updated';

    activity_title :=
      'Inspection correction cancelled';

    update public.project_inspection_corrections
    set
      correction_status =
        new_status

    where id =
      correction_record.id;

  elsif requested_action =
    'request_reinspection'
  then
    if correction_record.correction_status <>
      'verified'
    then
      raise exception
        'The correction must be verified before requesting reinspection.';
    end if;

    new_status :=
      correction_record.correction_status;

    activity_type_value :=
      'inspection_reinspection_requested';

    activity_title :=
      'Reinspection requested';

    update public.project_inspection_corrections
    set
      reinspection_required =
        true,

      reinspection_requested_at =
        now()

    where id =
      correction_record.id;

  else
    if correction_record.reinspection_requested_at
      is null
    then
      raise exception
        'Reinspection must be requested before it can be scheduled.';
    end if;

    new_status :=
      correction_record.correction_status;

    activity_type_value :=
      'inspection_reinspection_scheduled';

    activity_title :=
      'Reinspection scheduled';

    update public.project_inspection_corrections
    set
      reinspection_scheduled_at =
        now()

    where id =
      correction_record.id;
  end if;

  select *
  into correction_record
  from public.project_inspection_corrections
  where id =
    requested_correction_id;

  insert into public.project_activity (
    project_id,
    activity_type,
    title,
    actor_type,
    actor_app_user_id,
    source_table,
    source_id,
    metadata,
    occurred_at
  )
  values (
    requested_project_id,
    activity_type_value,
    activity_title || ': ' ||
      correction_record.title,
    'office',
    app_user_record.id,
    'project_inspection_corrections',
    correction_record.id,
    jsonb_build_object(
      'inspection_id',
        correction_record.inspection_id,

      'inspection_area_id',
        correction_record.inspection_area_id,

      'correction_number',
        correction_record.correction_number,

      'correction_status',
        correction_record.correction_status,

      'assigned_app_user_id',
        correction_record.assigned_app_user_id,

      'assigned_subcontractor_id',
        correction_record.assigned_subcontractor_id,

      'assigned_name',
        correction_record.assigned_name,

      'due_date',
        correction_record.due_date,

      'work_completed_at',
        correction_record.work_completed_at,

      'verified_at',
        correction_record.verified_at,

      'reinspection_requested_at',
        correction_record.reinspection_requested_at,

      'reinspection_scheduled_at',
        correction_record.reinspection_scheduled_at
    ),
    now()
  );

  return jsonb_build_object(
    'success',
      true,

    'correction_id',
      correction_record.id,

    'correction_status',
      correction_record.correction_status,

    'work_started_at',
      correction_record.work_started_at,

    'work_completed_at',
      correction_record.work_completed_at,

    'verified_at',
      correction_record.verified_at,

    'reinspection_requested_at',
      correction_record.reinspection_requested_at,

    'reinspection_scheduled_at',
      correction_record.reinspection_scheduled_at
  );
end;
$$;
ALTER FUNCTION "public"."update_project_inspection_correction"("requested_correction_id" "uuid", "requested_project_id" "uuid", "requested_action" "text", "requested_assigned_app_user_id" "uuid", "requested_assigned_subcontractor_id" "uuid", "requested_assigned_name" "text", "requested_assigned_company" "text", "requested_assigned_email" "text", "requested_assigned_phone" "text", "requested_due_date" "date", "requested_completion_notes" "text", "requested_completion_photo_urls" "jsonb", "requested_completion_document_urls" "jsonb", "requested_verification_notes" "text", "requested_auth_user_id" "uuid") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."validate_change_order_supersession"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
declare
  replacement_record public.project_change_orders;
begin
  if new.superseded_by_change_order_id
    is null
  then
    return new;
  end if;

  if new.superseded_by_change_order_id =
    new.id
  then
    raise exception
      'A change order cannot supersede itself.';
  end if;

  select *
  into replacement_record
  from public.project_change_orders
  where id =
    new.superseded_by_change_order_id
  limit 1;

  if replacement_record.id is null then
    raise exception
      'Replacement change order not found.';
  end if;

  if replacement_record.project_id <>
    new.project_id
  then
    raise exception
      'A replacement revision must belong to the same project.';
  end if;

  if replacement_record.revision_number <=
    new.revision_number
  then
    raise exception
      'A replacement revision must have a higher revision number.';
  end if;

  return new;
end;
$$;
ALTER FUNCTION "public"."validate_change_order_supersession"() OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."verify_project_inspection_checklist"("requested_project_id" "uuid", "requested_verification_text" "text", "requested_auth_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  app_user_record public.app_users;
  settings_record public.project_inspection_settings;
  unresolved_count integer;
  required_count integer;
begin
  select *
  into app_user_record
  from public.app_users
  where auth_user_id =
    requested_auth_user_id
  limit 1;

  if app_user_record.id is null then
    raise exception
      'Authenticated application user not found.';
  end if;

  select *
  into settings_record
  from public.project_inspection_settings
  where project_id =
    requested_project_id
  limit 1
  for update;

  if settings_record.id is null then
    raise exception
      'Project inspection settings not found.';
  end if;

  if not settings_record.inspections_enabled then
    raise exception
      'Inspections are disabled for this project.';
  end if;

  select count(*)
  into unresolved_count
  from public.project_inspection_requirements
  where project_id =
    requested_project_id

    and contractor_decision in (
      'unreviewed',
      'verify_with_authority'
    );

  if unresolved_count > 0 then
    raise exception
      'Every inspection requirement must be confirmed as required or not required before the checklist can be verified.';
  end if;

  select count(*)
  into required_count
  from public.project_inspection_requirements
  where project_id =
    requested_project_id

    and contractor_decision =
      'required';

  update public.project_inspection_settings
  set
    contractor_verified_at =
      now(),

    contractor_verified_by =
      app_user_record.id,

    contractor_verification_text =
      nullif(
        btrim(
          requested_verification_text
        ),
        ''
      ),

    checklist_locked_at =
      now(),

    updated_at =
      now()

  where id =
    settings_record.id;

  insert into public.project_activity (
    project_id,
    activity_type,
    title,
    actor_type,
    actor_app_user_id,
    source_table,
    source_id,
    metadata,
    occurred_at
  )
  values (
    requested_project_id,
    'inspection_checklist_verified',
    'Inspection checklist verified by contractor',
    'office',
    app_user_record.id,
    'project_inspection_settings',
    settings_record.id,
    jsonb_build_object(
      'required_inspection_count',
      required_count,
      'verification_text',
      requested_verification_text
    ),
    now()
  );

  return jsonb_build_object(
    'success',
    true,
    'project_id',
    requested_project_id,
    'required_inspection_count',
    required_count,
    'verified_at',
    now()
  );
end;
$$;
ALTER FUNCTION "public"."verify_project_inspection_checklist"("requested_project_id" "uuid", "requested_verification_text" "text", "requested_auth_user_id" "uuid") OWNER TO "postgres";
SET default_tablespace = '';
SET default_table_access_method = "heap";
CREATE TABLE IF NOT EXISTS "public"."project_change_orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "change_order_number" integer NOT NULL,
    "title" "text" NOT NULL,
    "description" "text" NOT NULL,
    "reason" "text",
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "cost_amount" numeric(12,2),
    "schedule_impact_days" integer DEFAULT 0 NOT NULL,
    "customer_notes" "text",
    "internal_notes" "text",
    "requested_by" "text",
    "created_by" "uuid",
    "approved_by_name" "text",
    "approved_at" timestamp with time zone,
    "declined_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "cancelled_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "approval_token" "uuid" DEFAULT "gen_random_uuid"(),
    "approval_sent_at" timestamp with time zone,
    "approval_opened_at" timestamp with time zone,
    "customer_response_notes" "text",
    "customer_response_ip" "text",
    "approval_expires_at" timestamp with time zone,
    "response_reviewed_at" timestamp with time zone,
    "response_reviewed_by" "uuid",
    "approval_reminder_sent_at" timestamp with time zone,
    "approval_reminder_count" integer DEFAULT 0 NOT NULL,
    "customer_acknowledged_terms" boolean DEFAULT false NOT NULL,
    "customer_agreement_text" "text",
    "customer_response_user_agent" "text",
    "revised_from_change_order_id" "uuid",
    "revision_number" integer DEFAULT 0 NOT NULL,
    "superseded_by_change_order_id" "uuid",
    "superseded_at" timestamp with time zone,
    "billing_status" "text" DEFAULT 'not_billed'::"text" NOT NULL,
    "invoice_number" "text",
    "invoiced_at" timestamp with time zone,
    "amount_paid" numeric(12,2) DEFAULT 0 NOT NULL,
    "paid_at" timestamp with time zone,
    "invoice_due_date" "date",
    CONSTRAINT "mckenzie_20260801_change_order_billing_status_check" CHECK (("billing_status" = ANY (ARRAY['not_billed'::"text", 'invoiced'::"text", 'partially_paid'::"text", 'paid'::"text", 'void'::"text"]))),
    CONSTRAINT "project_change_orders_amount_check" CHECK (("amount" >= (0)::numeric)),
    CONSTRAINT "project_change_orders_amount_paid_check" CHECK (("amount_paid" >= (0)::numeric)),
    CONSTRAINT "project_change_orders_approval_reminder_count_check" CHECK (("approval_reminder_count" >= 0)),
    CONSTRAINT "project_change_orders_billing_status_check" CHECK (("billing_status" = ANY (ARRAY['not_billed'::"text", 'invoiced'::"text", 'partially_paid'::"text", 'paid'::"text", 'void'::"text"]))),
    CONSTRAINT "project_change_orders_cost_check" CHECK ((("cost_amount" IS NULL) OR ("cost_amount" >= (0)::numeric))),
    CONSTRAINT "project_change_orders_revision_number_check" CHECK (("revision_number" >= 0)),
    CONSTRAINT "project_change_orders_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'pending_customer'::"text", 'approved'::"text", 'declined'::"text", 'in_progress'::"text", 'completed'::"text", 'cancelled'::"text"])))
);
ALTER TABLE "public"."project_change_orders" OWNER TO "postgres";
COMMENT ON COLUMN "public"."project_change_orders"."invoice_due_date" IS 'Optional contractual due date. A null value means overdue state is unknown and must not be inferred.';
CREATE OR REPLACE VIEW "public"."active_change_order_billing" WITH ("security_invoker"='true') AS
 SELECT "id",
    "project_id",
    "change_order_number",
    "title",
    "description",
    "reason",
    "status",
    "amount",
    "cost_amount",
    "schedule_impact_days",
    "customer_notes",
    "internal_notes",
    "requested_by",
    "created_by",
    "approved_by_name",
    "approved_at",
    "declined_at",
    "completed_at",
    "cancelled_at",
    "created_at",
    "updated_at",
    "approval_token",
    "approval_sent_at",
    "approval_opened_at",
    "customer_response_notes",
    "customer_response_ip",
    "approval_expires_at",
    "response_reviewed_at",
    "response_reviewed_by",
    "approval_reminder_sent_at",
    "approval_reminder_count",
    "customer_acknowledged_terms",
    "customer_agreement_text",
    "customer_response_user_agent",
    "revised_from_change_order_id",
    "revision_number",
    "superseded_by_change_order_id",
    "superseded_at",
    "billing_status",
    "invoice_number",
    "invoiced_at",
    "amount_paid",
    "paid_at",
    GREATEST(("amount" - "amount_paid"), (0)::numeric) AS "balance_due"
   FROM "public"."project_change_orders" "change_order"
  WHERE ("superseded_by_change_order_id" IS NULL);
ALTER VIEW "public"."active_change_order_billing" OWNER TO "postgres";
CREATE OR REPLACE VIEW "public"."active_project_change_orders" WITH ("security_invoker"='true') AS
 SELECT "id",
    "project_id",
    "change_order_number",
    "title",
    "description",
    "reason",
    "status",
    "amount",
    "cost_amount",
    "schedule_impact_days",
    "customer_notes",
    "internal_notes",
    "requested_by",
    "created_by",
    "approved_by_name",
    "approved_at",
    "declined_at",
    "completed_at",
    "cancelled_at",
    "created_at",
    "updated_at",
    "approval_token",
    "approval_sent_at",
    "approval_opened_at",
    "customer_response_notes",
    "customer_response_ip",
    "approval_expires_at",
    "response_reviewed_at",
    "response_reviewed_by",
    "approval_reminder_sent_at",
    "approval_reminder_count",
    "customer_acknowledged_terms",
    "customer_agreement_text",
    "customer_response_user_agent",
    "revised_from_change_order_id",
    "revision_number",
    "superseded_by_change_order_id",
    "superseded_at"
   FROM "public"."project_change_orders" "change_order"
  WHERE ("superseded_by_change_order_id" IS NULL);
ALTER VIEW "public"."active_project_change_orders" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."app_users" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "auth_user_id" "uuid" NOT NULL,
    "team_member_id" "uuid",
    "display_name" "text",
    "email" "text",
    "phone" "text",
    "role" "text" DEFAULT 'field_employee'::"text" NOT NULL,
    "default_portal" "text" DEFAULT 'operations'::"text" NOT NULL,
    "preferred_language" "text" DEFAULT 'en'::"text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "permissions" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "app_users_default_portal_check" CHECK (("default_portal" = ANY (ARRAY['sales'::"text", 'operations'::"text", 'admin'::"text", 'subcontractor'::"text"]))),
    CONSTRAINT "app_users_language_check" CHECK (("preferred_language" = ANY (ARRAY['en'::"text", 'es'::"text"]))),
    CONSTRAINT "app_users_role_check" CHECK (("role" = ANY (ARRAY['owner'::"text", 'administrator'::"text", 'salesperson'::"text", 'estimator'::"text", 'project_manager'::"text", 'field_employee'::"text", 'bookkeeper'::"text", 'subcontractor'::"text"])))
);
ALTER TABLE "public"."app_users" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."change_order_vendor_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "change_order_id" "uuid" NOT NULL,
    "project_id" "uuid" NOT NULL,
    "recipient_type" "text" NOT NULL,
    "recipient_id" "uuid",
    "recipient_name" "text" NOT NULL,
    "recipient_company" "text",
    "recipient_email" "text",
    "recipient_phone" "text",
    "request_status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "request_token" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "requested_scope" "text",
    "requested_cost" boolean DEFAULT true NOT NULL,
    "requested_schedule" boolean DEFAULT true NOT NULL,
    "requested_lead_time" boolean DEFAULT true NOT NULL,
    "requested_expiration_date" boolean DEFAULT true NOT NULL,
    "requested_notes" boolean DEFAULT true NOT NULL,
    "due_at" timestamp with time zone,
    "expires_at" timestamp with time zone,
    "sent_at" timestamp with time zone,
    "opened_at" timestamp with time zone,
    "submitted_at" timestamp with time zone,
    "declined_at" timestamp with time zone,
    "cancelled_at" timestamp with time zone,
    "reminder_sent_at" timestamp with time zone,
    "reminder_count" integer DEFAULT 0 NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "change_order_vendor_requests_recipient_type_check" CHECK (("recipient_type" = ANY (ARRAY['subcontractor'::"text", 'supplier'::"text"]))),
    CONSTRAINT "change_order_vendor_requests_reminder_count_check" CHECK (("reminder_count" >= 0)),
    CONSTRAINT "change_order_vendor_requests_request_status_check" CHECK (("request_status" = ANY (ARRAY['draft'::"text", 'sent'::"text", 'opened'::"text", 'submitted'::"text", 'declined'::"text", 'expired'::"text", 'cancelled'::"text"])))
);
ALTER TABLE "public"."change_order_vendor_requests" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."change_order_vendor_responses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "request_id" "uuid" NOT NULL,
    "change_order_id" "uuid" NOT NULL,
    "project_id" "uuid" NOT NULL,
    "response_status" "text" DEFAULT 'submitted'::"text" NOT NULL,
    "responder_name" "text" NOT NULL,
    "responder_email" "text",
    "responder_phone" "text",
    "quoted_cost" numeric(12,2),
    "earliest_start_date" "date",
    "expected_delivery_date" "date",
    "duration_days" integer,
    "lead_time_days" integer,
    "quote_expiration_date" "date",
    "notes" "text",
    "exclusions" "text",
    "attachment_urls" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "submitted_ip" "text",
    "submitted_user_agent" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "change_order_vendor_responses_duration_days_check" CHECK ((("duration_days" IS NULL) OR ("duration_days" >= 0))),
    CONSTRAINT "change_order_vendor_responses_lead_time_days_check" CHECK ((("lead_time_days" IS NULL) OR ("lead_time_days" >= 0))),
    CONSTRAINT "change_order_vendor_responses_quoted_cost_check" CHECK ((("quoted_cost" IS NULL) OR ("quoted_cost" >= (0)::numeric))),
    CONSTRAINT "change_order_vendor_responses_response_status_check" CHECK (("response_status" = ANY (ARRAY['submitted'::"text", 'declined'::"text"])))
);
ALTER TABLE "public"."change_order_vendor_responses" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."company_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_name" "text" DEFAULT 'McKenzie Construction'::"text" NOT NULL,
    "company_phone" "text",
    "company_email" "text",
    "website_url" "text",
    "time_zone" "text" DEFAULT 'America/New_York'::"text" NOT NULL,
    "require_responsible_person" boolean DEFAULT false NOT NULL,
    "require_task_assignee" boolean DEFAULT false NOT NULL,
    "require_project_manager" boolean DEFAULT false NOT NULL,
    "allow_unassigned_leads" boolean DEFAULT true NOT NULL,
    "allow_unassigned_tasks" boolean DEFAULT true NOT NULL,
    "automatically_assign_new_leads" boolean DEFAULT true NOT NULL,
    "automatically_assign_new_tasks" boolean DEFAULT true NOT NULL,
    "automatically_assign_converted_projects" boolean DEFAULT true NOT NULL,
    "default_lead_owner_id" "uuid",
    "default_estimator_id" "uuid",
    "default_project_manager_id" "uuid",
    "default_estimate_follow_up_business_days" integer DEFAULT 2 NOT NULL,
    "default_customer_review_follow_up_business_days" integer DEFAULT 3 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "manual_task_due_mode" "text" DEFAULT 'business_days'::"text" NOT NULL,
    "manual_task_due_offset" integer DEFAULT 1 NOT NULL,
    "end_of_business_time" time without time zone DEFAULT '17:00:00'::time without time zone NOT NULL,
    "default_invoice_payment_terms_days" integer DEFAULT 15 NOT NULL,
    CONSTRAINT "company_settings_manual_task_due_mode_check" CHECK (("manual_task_due_mode" = ANY (ARRAY['same_day'::"text", 'business_days'::"text", 'calendar_days'::"text", 'no_due_date'::"text"]))),
    CONSTRAINT "company_settings_manual_task_due_offset_check" CHECK ((("manual_task_due_offset" >= 0) AND ("manual_task_due_offset" <= 365))),
    CONSTRAINT "mckenzie_20260801_invoice_payment_terms_days_check" CHECK ((("default_invoice_payment_terms_days" >= 0) AND ("default_invoice_payment_terms_days" <= 365)))
);
ALTER TABLE "public"."company_settings" OWNER TO "postgres";
COMMENT ON COLUMN "public"."company_settings"."default_invoice_payment_terms_days" IS 'Calendar days after invoiced_at used when an issued invoice has no explicit due-date override.';
CREATE TABLE IF NOT EXISTS "public"."customers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "source_lead_id" "uuid",
    "customer_name" "text" NOT NULL,
    "first_name" "text",
    "last_name" "text",
    "email" "text",
    "phone" "text",
    "address_line_1" "text",
    "address_line_2" "text",
    "city" "text",
    "state" "text",
    "postal_code" "text",
    "project_type" "text",
    "notes" "text",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "assigned_to" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "customers_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'inactive'::"text", 'past_customer'::"text"])))
);
ALTER TABLE "public"."customers" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."email_drafts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "lead_id" "text" NOT NULL,
    "template_key" "text",
    "to_email" "text" NOT NULL,
    "cc_email" "text",
    "subject" "text" NOT NULL,
    "body" "text" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "approved_at" timestamp with time zone,
    "sent_at" timestamp with time zone,
    "canceled_at" timestamp with time zone,
    "external_message_id" "text",
    "error_message" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "email_drafts_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'approved'::"text", 'sent'::"text", 'canceled'::"text", 'failed'::"text"])))
);
ALTER TABLE "public"."email_drafts" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."estimate_line_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "estimate_id" "uuid" NOT NULL,
    "estimate_option_id" "uuid",
    "line_type" "text" NOT NULL,
    "category" "text" NOT NULL,
    "description" "text" NOT NULL,
    "material_catalog_id" "uuid",
    "labor_catalog_id" "uuid",
    "quantity" numeric(14,4) DEFAULT 1 NOT NULL,
    "unit" "text" NOT NULL,
    "base_unit_cost" numeric(12,4) DEFAULT 0 NOT NULL,
    "waste_percent" numeric(7,3) DEFAULT 0 NOT NULL,
    "adjusted_quantity" numeric(14,4) DEFAULT 1 NOT NULL,
    "estimated_cost" numeric(12,2) DEFAULT 0 NOT NULL,
    "pricing_method" "text" DEFAULT 'markup'::"text" NOT NULL,
    "markup_percent" numeric(7,3),
    "target_margin_percent" numeric(7,3),
    "fixed_price" numeric(12,2),
    "unit_price" numeric(12,4) DEFAULT 0 NOT NULL,
    "total_price" numeric(12,2) DEFAULT 0 NOT NULL,
    "estimated_profit" numeric(12,2) DEFAULT 0 NOT NULL,
    "estimated_margin" numeric(7,3),
    "is_optional" boolean DEFAULT false NOT NULL,
    "is_included" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "notes" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "estimate_line_items_adjusted_quantity_nonnegative" CHECK (("adjusted_quantity" >= (0)::numeric)),
    CONSTRAINT "estimate_line_items_base_cost_nonnegative" CHECK (("base_unit_cost" >= (0)::numeric)),
    CONSTRAINT "estimate_line_items_estimated_cost_nonnegative" CHECK (("estimated_cost" >= (0)::numeric)),
    CONSTRAINT "estimate_line_items_pricing_method_check" CHECK (("pricing_method" = ANY (ARRAY['markup'::"text", 'target_margin'::"text", 'fixed_price'::"text", 'cost'::"text"]))),
    CONSTRAINT "estimate_line_items_quantity_nonnegative" CHECK (("quantity" >= (0)::numeric)),
    CONSTRAINT "estimate_line_items_total_price_nonnegative" CHECK (("total_price" >= (0)::numeric)),
    CONSTRAINT "estimate_line_items_type_check" CHECK (("line_type" = ANY (ARRAY['material'::"text", 'labor'::"text", 'subcontractor'::"text", 'equipment'::"text", 'permit'::"text", 'dumpster'::"text", 'delivery'::"text", 'overhead'::"text", 'allowance'::"text", 'contingency'::"text", 'discount'::"text", 'other'::"text"]))),
    CONSTRAINT "estimate_line_items_unit_price_nonnegative" CHECK (("unit_price" >= (0)::numeric)),
    CONSTRAINT "estimate_line_items_waste_range" CHECK ((("waste_percent" >= (0)::numeric) AND ("waste_percent" <= (100)::numeric)))
);
ALTER TABLE "public"."estimate_line_items" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."estimate_material_price_snapshots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "estimate_id" "uuid" NOT NULL,
    "estimate_option_id" "uuid",
    "estimate_line_item_id" "uuid",
    "material_catalog_id" "uuid",
    "supplier_id" "uuid",
    "supplier_location_id" "uuid",
    "supplier_name" "text",
    "supplier_location_name" "text",
    "supplier_sku" "text",
    "quantity" numeric(14,4) DEFAULT 0 NOT NULL,
    "unit" "text" NOT NULL,
    "unit_cost" numeric(12,4) DEFAULT 0 NOT NULL,
    "extended_cost" numeric(12,2) DEFAULT 0 NOT NULL,
    "source_type" "text" DEFAULT 'manual'::"text" NOT NULL,
    "source_reference" "text",
    "price_checked_at" timestamp with time zone,
    "price_expires_at" timestamp with time zone,
    "was_manual_override" boolean DEFAULT false NOT NULL,
    "confidence" "text" DEFAULT 'confirmed'::"text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "estimate_price_snapshot_cost_nonnegative" CHECK ((("unit_cost" >= (0)::numeric) AND ("extended_cost" >= (0)::numeric))),
    CONSTRAINT "estimate_price_snapshot_quantity_nonnegative" CHECK (("quantity" >= (0)::numeric))
);
ALTER TABLE "public"."estimate_material_price_snapshots" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."estimate_options" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "estimate_id" "uuid" NOT NULL,
    "option_name" "text" NOT NULL,
    "option_label" "text",
    "description" "text",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "is_recommended" boolean DEFAULT false NOT NULL,
    "is_selected" boolean DEFAULT false NOT NULL,
    "subtotal_cost" numeric(12,2) DEFAULT 0 NOT NULL,
    "subtotal_price" numeric(12,2) DEFAULT 0 NOT NULL,
    "contingency_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "discount_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "tax_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "total_price" numeric(12,2) DEFAULT 0 NOT NULL,
    "estimated_profit" numeric(12,2) DEFAULT 0 NOT NULL,
    "estimated_margin" numeric(7,3),
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "estimate_options_subtotal_cost_nonnegative" CHECK (("subtotal_cost" >= (0)::numeric)),
    CONSTRAINT "estimate_options_subtotal_price_nonnegative" CHECK (("subtotal_price" >= (0)::numeric)),
    CONSTRAINT "estimate_options_total_price_nonnegative" CHECK (("total_price" >= (0)::numeric))
);
ALTER TABLE "public"."estimate_options" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."estimates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "lead_id" "uuid",
    "customer_id" "uuid",
    "project_id" "uuid",
    "estimate_number" "text",
    "title" "text" NOT NULL,
    "description" "text",
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "property_address" "text",
    "valid_until" "date",
    "selected_option_id" "uuid",
    "subtotal_cost" numeric(12,2) DEFAULT 0 NOT NULL,
    "subtotal_price" numeric(12,2) DEFAULT 0 NOT NULL,
    "contingency_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "discount_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "tax_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "total_price" numeric(12,2) DEFAULT 0 NOT NULL,
    "estimated_profit" numeric(12,2) DEFAULT 0 NOT NULL,
    "estimated_margin" numeric(7,3),
    "price_confidence" "text" DEFAULT 'preliminary'::"text" NOT NULL,
    "internal_notes" "text",
    "customer_notes" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_by_auth_user_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "estimates_contingency_nonnegative" CHECK (("contingency_amount" >= (0)::numeric)),
    CONSTRAINT "estimates_discount_nonnegative" CHECK (("discount_amount" >= (0)::numeric)),
    CONSTRAINT "estimates_price_confidence_check" CHECK (("price_confidence" = ANY (ARRAY['preliminary'::"text", 'budget'::"text", 'high'::"text", 'firm'::"text"]))),
    CONSTRAINT "estimates_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'reviewing'::"text", 'sent'::"text", 'viewed'::"text", 'accepted'::"text", 'declined'::"text", 'expired'::"text", 'converted'::"text", 'void'::"text"]))),
    CONSTRAINT "estimates_subtotal_cost_nonnegative" CHECK (("subtotal_cost" >= (0)::numeric)),
    CONSTRAINT "estimates_subtotal_price_nonnegative" CHECK (("subtotal_price" >= (0)::numeric)),
    CONSTRAINT "estimates_tax_nonnegative" CHECK (("tax_amount" >= (0)::numeric)),
    CONSTRAINT "estimates_total_price_nonnegative" CHECK (("total_price" >= (0)::numeric))
);
ALTER TABLE "public"."estimates" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."feature_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "scope_type" "text" DEFAULT 'global'::"text" NOT NULL,
    "scope_id" "text" DEFAULT 'default'::"text" NOT NULL,
    "feature_key" "text" NOT NULL,
    "is_enabled" boolean DEFAULT true NOT NULL,
    "display_name" "text" NOT NULL,
    "description" "text",
    "category" "text" DEFAULT 'general'::"text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "updated_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "feature_settings_scope_type_check" CHECK (("scope_type" = ANY (ARRAY['global'::"text", 'company'::"text", 'workspace'::"text"])))
);
ALTER TABLE "public"."feature_settings" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."labor_catalog" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "category" "text" NOT NULL,
    "description" "text" NOT NULL,
    "unit" "text" NOT NULL,
    "unit_cost" numeric(12,2) DEFAULT 0 NOT NULL,
    "crew_size" numeric(8,2),
    "production_rate" numeric(12,4),
    "is_active" boolean DEFAULT true NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "labor_catalog_crew_size_nonnegative" CHECK ((("crew_size" IS NULL) OR ("crew_size" >= (0)::numeric))),
    CONSTRAINT "labor_catalog_production_rate_nonnegative" CHECK ((("production_rate" IS NULL) OR ("production_rate" >= (0)::numeric))),
    CONSTRAINT "labor_catalog_unit_cost_nonnegative" CHECK (("unit_cost" >= (0)::numeric))
);
ALTER TABLE "public"."labor_catalog" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."lead_activities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "lead_id" "text" NOT NULL,
    "activity_type" "text" NOT NULL,
    "channel" "text" DEFAULT 'system'::"text" NOT NULL,
    "direction" "text" DEFAULT 'internal'::"text" NOT NULL,
    "summary" "text" NOT NULL,
    "details" "text",
    "external_id" "text",
    "occurred_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "lead_activities_channel_check" CHECK (("channel" = ANY (ARRAY['system'::"text", 'call'::"text", 'sms'::"text", 'email'::"text", 'note'::"text", 'status'::"text", 'task'::"text", 'consultation'::"text", 'estimate'::"text"]))),
    CONSTRAINT "lead_activities_direction_check" CHECK (("direction" = ANY (ARRAY['inbound'::"text", 'outbound'::"text", 'internal'::"text"])))
);
ALTER TABLE "public"."lead_activities" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."lead_tasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "lead_id" "text" NOT NULL,
    "task_type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "priority" "text" DEFAULT 'normal'::"text" NOT NULL,
    "due_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "canceled_at" timestamp with time zone,
    "completion_note" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "assigned_to_id" "uuid",
    "assigned_at" timestamp with time zone,
    CONSTRAINT "lead_tasks_priority_check" CHECK (("priority" = ANY (ARRAY['low'::"text", 'normal'::"text", 'high'::"text", 'urgent'::"text"]))),
    CONSTRAINT "lead_tasks_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'in_progress'::"text", 'completed'::"text", 'canceled'::"text"])))
);
ALTER TABLE "public"."lead_tasks" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."leads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "name" "text" NOT NULL,
    "phone" "text" NOT NULL,
    "email" "text",
    "project_type" "text",
    "description" "text" NOT NULL,
    "source" "text" DEFAULT 'Website'::"text",
    "status" "text" DEFAULT 'new'::"text" NOT NULL,
    "next_follow_up" timestamp with time zone,
    "notes" "text",
    "property_address" "text",
    "estimated_budget" "text",
    "desired_timeline" "text",
    "preferred_contact_method" "text",
    "requested_date" "date",
    "requested_time" "text",
    "alternate_date" "date",
    "alternate_time" "text",
    "consultation_status" "text" DEFAULT 'pending'::"text",
    "lead_status" "text" DEFAULT 'new'::"text",
    "lead_source" "text" DEFAULT 'website'::"text",
    "follow_up_at" timestamp with time zone,
    "photo_urls" "text"[] DEFAULT '{}'::"text"[],
    "responsible_person_id" "uuid",
    "assigned_at" timestamp with time zone,
    "assigned_by_id" "uuid",
    "estimated_project_value" numeric(12,2),
    "expected_close_date" "date",
    "win_probability" numeric(5,2),
    CONSTRAINT "leads_estimated_project_value_nonnegative" CHECK ((("estimated_project_value" IS NULL) OR ("estimated_project_value" >= (0)::numeric))),
    CONSTRAINT "leads_status_check" CHECK (("status" = ANY (ARRAY['new'::"text", 'contacted'::"text", 'appointment'::"text", 'estimate'::"text", 'follow_up'::"text", 'sold'::"text", 'lost'::"text"]))),
    CONSTRAINT "leads_win_probability_valid" CHECK ((("win_probability" IS NULL) OR (("win_probability" >= (0)::numeric) AND ("win_probability" <= (100)::numeric))))
);
ALTER TABLE "public"."leads" OWNER TO "postgres";
COMMENT ON COLUMN "public"."leads"."estimated_project_value" IS 'Estimated total value of the potential project before conversion to a confirmed project.';
COMMENT ON COLUMN "public"."leads"."expected_close_date" IS 'Expected date the lead or proposal may convert into confirmed work.';
COMMENT ON COLUMN "public"."leads"."win_probability" IS 'Optional probability from 0 to 100 used for weighted opportunity reporting.';
CREATE TABLE IF NOT EXISTS "public"."material_catalog" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sku" "text",
    "category" "text" NOT NULL,
    "description" "text" NOT NULL,
    "brand" "text",
    "product_line" "text",
    "unit" "text" NOT NULL,
    "unit_cost" numeric(12,2) DEFAULT 0 NOT NULL,
    "supplier_name" "text",
    "supplier_item_number" "text",
    "waste_percent" numeric(6,2) DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "material_catalog_unit_cost_nonnegative" CHECK (("unit_cost" >= (0)::numeric)),
    CONSTRAINT "material_catalog_waste_percent_range" CHECK ((("waste_percent" >= (0)::numeric) AND ("waste_percent" <= (100)::numeric)))
);
ALTER TABLE "public"."material_catalog" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."material_price_imports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "supplier_id" "uuid",
    "supplier_location_id" "uuid",
    "import_type" "text" NOT NULL,
    "original_filename" "text",
    "storage_path" "text",
    "quote_number" "text",
    "quote_date" "date",
    "expiration_date" "date",
    "status" "text" DEFAULT 'processing'::"text" NOT NULL,
    "total_rows" integer DEFAULT 0 NOT NULL,
    "imported_rows" integer DEFAULT 0 NOT NULL,
    "skipped_rows" integer DEFAULT 0 NOT NULL,
    "review_rows" integer DEFAULT 0 NOT NULL,
    "extraction_data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "errors" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "created_by_auth_user_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "material_price_imports_status_check" CHECK (("status" = ANY (ARRAY['processing'::"text", 'ready_for_review'::"text", 'completed'::"text", 'completed_with_errors'::"text", 'failed'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "material_price_imports_type_check" CHECK (("import_type" = ANY (ARRAY['csv'::"text", 'spreadsheet'::"text", 'pdf'::"text", 'image'::"text", 'email_attachment'::"text", 'manual'::"text"])))
);
ALTER TABLE "public"."material_price_imports" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."material_supplier_prices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "material_catalog_id" "uuid" NOT NULL,
    "supplier_id" "uuid" NOT NULL,
    "supplier_location_id" "uuid",
    "supplier_sku" "text",
    "manufacturer_sku" "text",
    "unit" "text" NOT NULL,
    "unit_cost" numeric(12,4) DEFAULT 0 NOT NULL,
    "quantity_available" numeric(14,4),
    "minimum_order_quantity" numeric(14,4),
    "delivery_cost" numeric(12,2),
    "delivery_minimum" numeric(12,2),
    "price_type" "text" DEFAULT 'retail'::"text" NOT NULL,
    "effective_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone,
    "last_checked_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "source_type" "text" DEFAULT 'manual'::"text" NOT NULL,
    "source_reference" "text",
    "confidence" "text" DEFAULT 'confirmed'::"text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "material_supplier_prices_confidence_check" CHECK (("confidence" = ANY (ARRAY['verified'::"text", 'confirmed'::"text", 'probable'::"text", 'unverified'::"text"]))),
    CONSTRAINT "material_supplier_prices_cost_nonnegative" CHECK (("unit_cost" >= (0)::numeric)),
    CONSTRAINT "material_supplier_prices_delivery_nonnegative" CHECK ((("delivery_cost" IS NULL) OR ("delivery_cost" >= (0)::numeric))),
    CONSTRAINT "material_supplier_prices_minimum_nonnegative" CHECK ((("minimum_order_quantity" IS NULL) OR ("minimum_order_quantity" >= (0)::numeric))),
    CONSTRAINT "material_supplier_prices_price_type_check" CHECK (("price_type" = ANY (ARRAY['retail'::"text", 'contract'::"text", 'quoted'::"text", 'promotional'::"text", 'estimated'::"text"]))),
    CONSTRAINT "material_supplier_prices_quantity_nonnegative" CHECK ((("quantity_available" IS NULL) OR ("quantity_available" >= (0)::numeric))),
    CONSTRAINT "material_supplier_prices_source_type_check" CHECK (("source_type" = ANY (ARRAY['manual'::"text", 'csv'::"text", 'supplier_quote'::"text", 'api'::"text", 'web_lookup'::"text", 'estimate_snapshot'::"text"])))
);
ALTER TABLE "public"."material_supplier_prices" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."pricing_rules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "category" "text" NOT NULL,
    "pricing_method" "text" DEFAULT 'markup'::"text" NOT NULL,
    "markup_percent" numeric(7,3),
    "target_margin_percent" numeric(7,3),
    "fixed_amount" numeric(12,2),
    "is_default" boolean DEFAULT false NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "pricing_rules_fixed_amount_nonnegative" CHECK ((("fixed_amount" IS NULL) OR ("fixed_amount" >= (0)::numeric))),
    CONSTRAINT "pricing_rules_margin_range" CHECK ((("target_margin_percent" IS NULL) OR (("target_margin_percent" >= (0)::numeric) AND ("target_margin_percent" < (100)::numeric)))),
    CONSTRAINT "pricing_rules_markup_range" CHECK ((("markup_percent" IS NULL) OR ("markup_percent" >= (0)::numeric))),
    CONSTRAINT "pricing_rules_method_check" CHECK (("pricing_method" = ANY (ARRAY['markup'::"text", 'target_margin'::"text", 'fixed_amount'::"text", 'cost'::"text"])))
);
ALTER TABLE "public"."pricing_rules" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."procurement_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_name" "text" DEFAULT 'McKenzie Construction'::"text" NOT NULL,
    "default_pricing_strategy" "text" DEFAULT 'best_available'::"text" NOT NULL,
    "preferred_supplier_id" "uuid",
    "preferred_supplier_location_id" "uuid",
    "lowes_supplier_id" "uuid",
    "lowes_fallback_location_id" "uuid",
    "allow_lowes_fallback" boolean DEFAULT true NOT NULL,
    "allow_web_lookup" boolean DEFAULT true NOT NULL,
    "allow_nearby_store_substitution" boolean DEFAULT false NOT NULL,
    "nearby_store_radius_miles" numeric(8,2) DEFAULT 25 NOT NULL,
    "maximum_price_age_days" integer DEFAULT 30 NOT NULL,
    "line_discrepancy_threshold" numeric(12,2) DEFAULT 50 NOT NULL,
    "quote_discrepancy_threshold" numeric(12,2) DEFAULT 250 NOT NULL,
    "always_flag_short_quantity" boolean DEFAULT true NOT NULL,
    "always_flag_product_mismatch" boolean DEFAULT true NOT NULL,
    "always_flag_missing_item" boolean DEFAULT true NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "procurement_settings_line_threshold_nonnegative" CHECK (("line_discrepancy_threshold" >= (0)::numeric)),
    CONSTRAINT "procurement_settings_price_age_positive" CHECK (("maximum_price_age_days" > 0)),
    CONSTRAINT "procurement_settings_quote_threshold_nonnegative" CHECK (("quote_discrepancy_threshold" >= (0)::numeric)),
    CONSTRAINT "procurement_settings_radius_nonnegative" CHECK (("nearby_store_radius_miles" >= (0)::numeric)),
    CONSTRAINT "procurement_settings_strategy_check" CHECK (("default_pricing_strategy" = ANY (ARRAY['preferred_supplier'::"text", 'best_available'::"text", 'lowes_fallback'::"text", 'manual'::"text"])))
);
ALTER TABLE "public"."procurement_settings" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."project_activity" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "activity_type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "actor_type" "text" DEFAULT 'system'::"text" NOT NULL,
    "actor_app_user_id" "uuid",
    "subcontractor_id" "uuid",
    "source_table" "text",
    "source_id" "uuid",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "occurred_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "project_activity_actor_type_check" CHECK (("actor_type" = ANY (ARRAY['office'::"text", 'subcontractor'::"text", 'system'::"text"]))),
    CONSTRAINT "project_activity_type_check" CHECK (("activity_type" = ANY (ARRAY['schedule_request_created'::"text", 'schedule_response_submitted'::"text", 'schedule_response_reviewed'::"text", 'material_review_created'::"text", 'material_review_opened'::"text", 'material_review_submitted'::"text", 'material_review_reviewed'::"text", 'material_issue_reported'::"text", 'material_issue_updated'::"text", 'message_created'::"text", 'project_updated'::"text", 'project_note'::"text", 'change_order_created'::"text", 'change_order_updated'::"text", 'change_order_approved'::"text", 'change_order_declined'::"text", 'change_order_completed'::"text", 'change_order_response_reviewed'::"text", 'change_order_approval_sent'::"text", 'change_order_approval_opened'::"text", 'change_order_approval_reminder'::"text", 'change_order_approval_expired'::"text", 'change_order_approval_revoked'::"text", 'change_order_response_archived'::"text", 'change_order_revision_created'::"text", 'change_order_invoiced'::"text", 'change_order_payment_recorded'::"text", 'change_order_payment_updated'::"text", 'change_order_payment_deleted'::"text", 'change_order_paid'::"text", 'change_order_vendor_request_created'::"text", 'change_order_vendor_request_sent'::"text", 'change_order_vendor_request_opened'::"text", 'change_order_vendor_request_reminder'::"text", 'change_order_vendor_response_submitted'::"text", 'change_order_vendor_response_declined'::"text", 'change_order_vendor_request_cancelled'::"text", 'inspection_settings_updated'::"text", 'inspection_research_started'::"text", 'inspection_research_completed'::"text", 'inspection_research_failed'::"text", 'inspection_research_reviewed'::"text", 'inspection_research_applied'::"text", 'inspection_checklist_verified'::"text", 'inspection_created'::"text", 'inspection_requested'::"text", 'inspection_scheduled'::"text", 'inspection_rescheduled'::"text", 'inspection_cancelled'::"text", 'inspection_result_uploaded'::"text", 'inspection_result_confirmed'::"text", 'inspection_passed'::"text", 'inspection_partial_pass'::"text", 'inspection_failed'::"text", 'inspection_reinspection_required'::"text", 'inspection_area_released'::"text", 'inspection_area_blocked'::"text", 'inspection_checklist_reopened'::"text", 'inspection_workflow_activated'::"text", 'inspection_dependency_added'::"text", 'inspection_dependency_removed'::"text", 'inspection_dependency_released'::"text", 'inspection_dependency_blocked'::"text", 'inspection_correction_created'::"text", 'inspection_correction_assigned'::"text", 'inspection_correction_started'::"text", 'inspection_correction_completed'::"text", 'inspection_correction_verified'::"text", 'inspection_correction_reopened'::"text", 'inspection_reinspection_requested'::"text", 'inspection_reinspection_scheduled'::"text", 'inspection_document_uploaded'::"text", 'inspection_document_extraction_started'::"text", 'inspection_document_extraction_completed'::"text", 'inspection_document_extraction_failed'::"text", 'inspection_document_extraction_reviewed'::"text", 'inspection_document_extraction_applied'::"text", 'system'::"text"])))
);
ALTER TABLE "public"."project_activity" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."project_change_order_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "change_order_id" "uuid" NOT NULL,
    "description" "text" NOT NULL,
    "quantity" numeric(12,3) DEFAULT 1 NOT NULL,
    "unit" "text" DEFAULT 'each'::"text" NOT NULL,
    "unit_price" numeric(12,2) DEFAULT 0 NOT NULL,
    "unit_cost" numeric(12,2) DEFAULT 0 NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "project_change_order_items_quantity_check" CHECK (("quantity" > (0)::numeric)),
    CONSTRAINT "project_change_order_items_unit_cost_check" CHECK (("unit_cost" >= (0)::numeric)),
    CONSTRAINT "project_change_order_items_unit_price_check" CHECK (("unit_price" >= (0)::numeric))
);
ALTER TABLE "public"."project_change_order_items" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."project_change_order_payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "change_order_id" "uuid" NOT NULL,
    "amount" numeric(12,2) NOT NULL,
    "payment_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "payment_method" "text",
    "reference_number" "text",
    "notes" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "project_change_order_payments_amount_check" CHECK (("amount" > (0)::numeric))
);
ALTER TABLE "public"."project_change_order_payments" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."project_change_order_response_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "response_id" "uuid" NOT NULL,
    "change_order_item_id" "uuid",
    "description" "text" NOT NULL,
    "quantity" numeric(12,3) DEFAULT 1 NOT NULL,
    "unit" "text" DEFAULT 'each'::"text" NOT NULL,
    "unit_price" numeric(12,2) DEFAULT 0 NOT NULL,
    "unit_cost" numeric(12,2) DEFAULT 0 NOT NULL,
    "sales_total" numeric(12,2) DEFAULT 0 NOT NULL,
    "cost_total" numeric(12,2) DEFAULT 0 NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);
ALTER TABLE "public"."project_change_order_response_items" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."project_change_order_responses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "change_order_id" "uuid" NOT NULL,
    "project_id" "uuid" NOT NULL,
    "response" "text" NOT NULL,
    "customer_name" "text" NOT NULL,
    "customer_notes" "text",
    "agreement_text" "text" NOT NULL,
    "acknowledged_terms" boolean DEFAULT false NOT NULL,
    "submitted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "submitted_ip" "text",
    "submitted_user_agent" "text",
    "approval_token" "uuid",
    "change_order_number" integer NOT NULL,
    "title" "text" NOT NULL,
    "description" "text" NOT NULL,
    "reason" "text",
    "amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "schedule_impact_days" integer DEFAULT 0 NOT NULL,
    "customer_notes_snapshot" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "project_change_order_responses_response_check" CHECK (("response" = ANY (ARRAY['approved'::"text", 'declined'::"text"])))
);
ALTER TABLE "public"."project_change_order_responses" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."project_costs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "cost_type" "text" DEFAULT 'other'::"text" NOT NULL,
    "description" "text" NOT NULL,
    "vendor_name" "text",
    "amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "cost_date" "date",
    "payment_status" "text" DEFAULT 'unpaid'::"text" NOT NULL,
    "payment_method" "text",
    "reference_number" "text",
    "notes" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "estimated_amount" numeric(12,2) NOT NULL,
    "final_amount" numeric(12,2),
    "amount_paid" numeric(12,2) DEFAULT 0 NOT NULL,
    CONSTRAINT "project_costs_amount_nonnegative" CHECK (("amount" >= (0)::numeric)),
    CONSTRAINT "project_costs_amount_paid_nonnegative" CHECK (("amount_paid" >= (0)::numeric)),
    CONSTRAINT "project_costs_cost_type_valid" CHECK (("cost_type" = ANY (ARRAY['materials'::"text", 'labor'::"text", 'subcontractor'::"text", 'equipment'::"text", 'dumpster'::"text", 'permit'::"text", 'delivery'::"text", 'change_order'::"text", 'refund'::"text", 'overhead'::"text", 'other'::"text"]))),
    CONSTRAINT "project_costs_estimated_amount_nonnegative" CHECK (("estimated_amount" >= (0)::numeric)),
    CONSTRAINT "project_costs_final_amount_nonnegative" CHECK ((("final_amount" IS NULL) OR ("final_amount" >= (0)::numeric))),
    CONSTRAINT "project_costs_payment_status_valid" CHECK (("payment_status" = ANY (ARRAY['unpaid'::"text", 'partially_paid'::"text", 'paid'::"text", 'reimbursed'::"text", 'void'::"text"])))
);
ALTER TABLE "public"."project_costs" OWNER TO "postgres";
COMMENT ON TABLE "public"."project_costs" IS 'Actual expenses and credits recorded against construction projects.';
COMMENT ON COLUMN "public"."project_costs"."cost_type" IS 'Classification used for project cost and profit reporting.';
COMMENT ON COLUMN "public"."project_costs"."amount" IS 'Positive dollar amount. Refund and credit behavior is determined by cost_type.';
COMMENT ON COLUMN "public"."project_costs"."payment_status" IS 'Tracks whether the expense has been paid, reimbursed, or voided.';
CREATE TABLE IF NOT EXISTS "public"."project_inspection_areas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "inspection_id" "uuid" NOT NULL,
    "project_id" "uuid" NOT NULL,
    "area_name" "text" NOT NULL,
    "area_code" "text",
    "result_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "work_may_continue" boolean DEFAULT false NOT NULL,
    "blocked_reason" "text",
    "correction_notes" "text",
    "reinspection_required" boolean DEFAULT false NOT NULL,
    "released_at" timestamp with time zone,
    "released_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "project_inspection_areas_result_status_check" CHECK (("result_status" = ANY (ARRAY['pending'::"text", 'passed'::"text", 'failed'::"text", 'partial_pass'::"text", 'not_inspected'::"text", 'not_applicable'::"text"])))
);
ALTER TABLE "public"."project_inspection_areas" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."project_inspection_corrections" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "inspection_id" "uuid" NOT NULL,
    "result_history_id" "uuid",
    "inspection_area_id" "uuid",
    "correction_number" integer NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "correction_status" "text" DEFAULT 'open'::"text" NOT NULL,
    "priority" "text" DEFAULT 'normal'::"text" NOT NULL,
    "assigned_app_user_id" "uuid",
    "assigned_subcontractor_id" "uuid",
    "assigned_name" "text",
    "assigned_company" "text",
    "assigned_email" "text",
    "assigned_phone" "text",
    "due_date" "date",
    "work_started_at" timestamp with time zone,
    "work_completed_at" timestamp with time zone,
    "completion_notes" "text",
    "completion_photo_urls" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "completion_document_urls" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "verified_at" timestamp with time zone,
    "verified_by" "uuid",
    "verification_notes" "text",
    "reinspection_required" boolean DEFAULT true NOT NULL,
    "reinspection_requested_at" timestamp with time zone,
    "reinspection_scheduled_at" timestamp with time zone,
    "reinspection_inspection_id" "uuid",
    "source_type" "text" DEFAULT 'contractor'::"text" NOT NULL,
    "source_excerpt" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "project_inspection_corrections_correction_status_check" CHECK (("correction_status" = ANY (ARRAY['open'::"text", 'assigned'::"text", 'in_progress'::"text", 'ready_for_verification'::"text", 'verified'::"text", 'reopened'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "project_inspection_corrections_priority_check" CHECK (("priority" = ANY (ARRAY['low'::"text", 'normal'::"text", 'high'::"text", 'urgent'::"text"]))),
    CONSTRAINT "project_inspection_corrections_source_type_check" CHECK (("source_type" = ANY (ARRAY['inspection_report'::"text", 'document_extraction'::"text", 'contractor'::"text", 'inspector'::"text", 'custom'::"text"])))
);
ALTER TABLE "public"."project_inspection_corrections" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."project_inspection_document_findings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "document_id" "uuid" NOT NULL,
    "project_id" "uuid" NOT NULL,
    "inspection_id" "uuid",
    "finding_type" "text" NOT NULL,
    "finding_key" "text",
    "finding_title" "text" NOT NULL,
    "finding_value" "text",
    "finding_description" "text",
    "detected_status" "text",
    "detected_date" "date",
    "detected_boolean" boolean,
    "detected_number" numeric,
    "detected_data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "confidence_level" "text" DEFAULT 'medium'::"text" NOT NULL,
    "source_excerpt" "text",
    "page_number" integer,
    "contractor_review_status" "text" DEFAULT 'unreviewed'::"text" NOT NULL,
    "contractor_review_notes" "text",
    "modified_value" "text",
    "modified_data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "reviewed_at" timestamp with time zone,
    "reviewed_by" "uuid",
    "applied_at" timestamp with time zone,
    "applied_reference_type" "text",
    "applied_reference_id" "uuid",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "project_inspection_document_find_contractor_review_status_check" CHECK (("contractor_review_status" = ANY (ARRAY['unreviewed'::"text", 'accepted'::"text", 'modified'::"text", 'rejected'::"text", 'needs_verification'::"text"]))),
    CONSTRAINT "project_inspection_document_findings_confidence_level_check" CHECK (("confidence_level" = ANY (ARRAY['low'::"text", 'medium'::"text", 'high'::"text"]))),
    CONSTRAINT "project_inspection_document_findings_finding_type_check" CHECK (("finding_type" = ANY (ARRAY['inspection_result'::"text", 'inspection_area'::"text", 'correction'::"text", 'reinspection_requirement'::"text", 'inspection_number'::"text", 'inspector'::"text", 'inspection_date'::"text", 'permit_number'::"text", 'general_note'::"text", 'uncertainty'::"text"])))
);
ALTER TABLE "public"."project_inspection_document_findings" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."project_inspection_documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "inspection_id" "uuid",
    "result_history_id" "uuid",
    "document_type" "text" DEFAULT 'inspection_report'::"text" NOT NULL,
    "file_name" "text" NOT NULL,
    "file_url" "text" NOT NULL,
    "storage_bucket" "text",
    "storage_path" "text",
    "mime_type" "text",
    "file_size_bytes" bigint,
    "document_date" "date",
    "source_name" "text",
    "source_reference" "text",
    "notes" "text",
    "extraction_status" "text" DEFAULT 'not_started'::"text" NOT NULL,
    "extraction_attempt_count" integer DEFAULT 0 NOT NULL,
    "extraction_started_at" timestamp with time zone,
    "extraction_completed_at" timestamp with time zone,
    "extraction_failed_at" timestamp with time zone,
    "extraction_error" "text",
    "extracted_text" "text",
    "extracted_data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "extraction_confidence" "text",
    "extraction_confidence_notes" "text",
    "contractor_review_status" "text" DEFAULT 'unreviewed'::"text" NOT NULL,
    "contractor_review_notes" "text",
    "reviewed_at" timestamp with time zone,
    "reviewed_by" "uuid",
    "applied_at" timestamp with time zone,
    "applied_by" "uuid",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "project_inspection_documents_contractor_review_status_check" CHECK (("contractor_review_status" = ANY (ARRAY['unreviewed'::"text", 'accepted'::"text", 'modified'::"text", 'rejected'::"text", 'needs_verification'::"text"]))),
    CONSTRAINT "project_inspection_documents_document_type_check" CHECK (("document_type" = ANY (ARRAY['inspection_report'::"text", 'inspection_photo'::"text", 'permit'::"text", 'correction_notice'::"text", 'reinspection_report'::"text", 'municipality_document'::"text", 'other'::"text"]))),
    CONSTRAINT "project_inspection_documents_extraction_confidence_check" CHECK ((("extraction_confidence" IS NULL) OR ("extraction_confidence" = ANY (ARRAY['low'::"text", 'medium'::"text", 'high'::"text"])))),
    CONSTRAINT "project_inspection_documents_extraction_status_check" CHECK (("extraction_status" = ANY (ARRAY['not_started'::"text", 'queued'::"text", 'processing'::"text", 'review_required'::"text", 'confirmed'::"text", 'failed'::"text", 'cancelled'::"text"])))
);
ALTER TABLE "public"."project_inspection_documents" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."project_inspection_requirements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "inspection_settings_id" "uuid" NOT NULL,
    "inspection_key" "text",
    "inspection_name" "text" NOT NULL,
    "inspection_category" "text" DEFAULT 'general'::"text" NOT NULL,
    "description" "text",
    "source_type" "text" DEFAULT 'research'::"text" NOT NULL,
    "researched_requirement_status" "text" DEFAULT 'suggested'::"text" NOT NULL,
    "contractor_decision" "text" DEFAULT 'unreviewed'::"text" NOT NULL,
    "contractor_notes" "text",
    "source_title" "text",
    "source_url" "text",
    "source_excerpt" "text",
    "source_last_verified_at" timestamp with time zone,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "is_custom" boolean DEFAULT false NOT NULL,
    "created_by" "uuid",
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "project_inspection_requireme_researched_requirement_statu_check" CHECK (("researched_requirement_status" = ANY (ARRAY['required'::"text", 'suggested'::"text", 'not_required'::"text", 'unknown'::"text"]))),
    CONSTRAINT "project_inspection_requirements_contractor_decision_check" CHECK (("contractor_decision" = ANY (ARRAY['unreviewed'::"text", 'required'::"text", 'not_required'::"text", 'verify_with_authority'::"text"]))),
    CONSTRAINT "project_inspection_requirements_source_type_check" CHECK (("source_type" = ANY (ARRAY['research'::"text", 'contractor'::"text", 'municipality'::"text", 'permit_document'::"text", 'custom'::"text"])))
);
ALTER TABLE "public"."project_inspection_requirements" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."project_inspection_research_findings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "research_run_id" "uuid" NOT NULL,
    "project_id" "uuid" NOT NULL,
    "source_id" "uuid",
    "finding_type" "text" DEFAULT 'inspection_requirement'::"text" NOT NULL,
    "finding_key" "text",
    "finding_title" "text" NOT NULL,
    "finding_description" "text",
    "requirement_status" "text" DEFAULT 'suggested'::"text" NOT NULL,
    "inspection_category" "text",
    "inspection_sequence" integer,
    "prerequisite_summary" "text",
    "scheduling_notes" "text",
    "contact_name" "text",
    "contact_phone" "text",
    "contact_email" "text",
    "confidence_level" "text" DEFAULT 'medium'::"text" NOT NULL,
    "contractor_review_status" "text" DEFAULT 'unreviewed'::"text" NOT NULL,
    "contractor_review_notes" "text",
    "reviewed_at" timestamp with time zone,
    "reviewed_by" "uuid",
    "applied_requirement_id" "uuid",
    "applied_at" timestamp with time zone,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "project_inspection_research_find_contractor_review_status_check" CHECK (("contractor_review_status" = ANY (ARRAY['unreviewed'::"text", 'accepted'::"text", 'rejected'::"text", 'needs_verification'::"text", 'modified'::"text"]))),
    CONSTRAINT "project_inspection_research_findings_confidence_level_check" CHECK (("confidence_level" = ANY (ARRAY['low'::"text", 'medium'::"text", 'high'::"text"]))),
    CONSTRAINT "project_inspection_research_findings_finding_type_check" CHECK (("finding_type" = ANY (ARRAY['inspection_requirement'::"text", 'permit_requirement'::"text", 'scheduling_requirement'::"text", 'submission_requirement'::"text", 'fee_requirement'::"text", 'contact_information'::"text", 'special_condition'::"text", 'uncertainty'::"text"]))),
    CONSTRAINT "project_inspection_research_findings_requirement_status_check" CHECK (("requirement_status" = ANY (ARRAY['required'::"text", 'suggested'::"text", 'not_required'::"text", 'conditional'::"text", 'unknown'::"text"])))
);
ALTER TABLE "public"."project_inspection_research_findings" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."project_inspection_research_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "inspection_settings_id" "uuid" NOT NULL,
    "research_status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "requested_address" "text",
    "requested_city" "text",
    "requested_county" "text",
    "requested_state_code" "text",
    "requested_postal_code" "text",
    "requested_municipality" "text",
    "requested_authority_name" "text",
    "requested_authority_type" "text",
    "requested_project_type" "text",
    "requested_permit_type" "text",
    "requested_scope_summary" "text",
    "detected_municipality" "text",
    "detected_county" "text",
    "detected_state_code" "text",
    "detected_authority_name" "text",
    "detected_authority_type" "text",
    "confidence_level" "text",
    "confidence_notes" "text",
    "research_summary" "text",
    "legal_disclaimer" "text" DEFAULT 'Research findings are guidance only. The contractor must verify all required permits and inspections with the governing authority before relying on the checklist.'::"text" NOT NULL,
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "failed_at" timestamp with time zone,
    "failure_message" "text",
    "reviewed_at" timestamp with time zone,
    "reviewed_by" "uuid",
    "review_notes" "text",
    "applied_at" timestamp with time zone,
    "applied_by" "uuid",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "project_inspection_research_runs_confidence_level_check" CHECK ((("confidence_level" IS NULL) OR ("confidence_level" = ANY (ARRAY['low'::"text", 'medium'::"text", 'high'::"text"])))),
    CONSTRAINT "project_inspection_research_runs_research_status_check" CHECK (("research_status" = ANY (ARRAY['draft'::"text", 'queued'::"text", 'researching'::"text", 'review_required'::"text", 'completed'::"text", 'failed'::"text", 'cancelled'::"text"])))
);
ALTER TABLE "public"."project_inspection_research_runs" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."project_inspection_research_sources" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "research_run_id" "uuid" NOT NULL,
    "project_id" "uuid" NOT NULL,
    "source_type" "text" DEFAULT 'municipality_website'::"text" NOT NULL,
    "source_title" "text" NOT NULL,
    "source_url" "text",
    "source_authority_name" "text",
    "source_published_at" timestamp with time zone,
    "source_last_updated_at" timestamp with time zone,
    "source_accessed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "source_excerpt" "text",
    "source_notes" "text",
    "is_primary_authority_source" boolean DEFAULT false NOT NULL,
    "is_current" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "project_inspection_research_sources_source_type_check" CHECK (("source_type" = ANY (ARRAY['municipality_website'::"text", 'county_website'::"text", 'state_website'::"text", 'permit_portal'::"text", 'inspection_document'::"text", 'code_document'::"text", 'phone_confirmation'::"text", 'email_confirmation'::"text", 'contractor_note'::"text", 'other'::"text"])))
);
ALTER TABLE "public"."project_inspection_research_sources" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."project_inspection_result_area_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "result_history_id" "uuid" NOT NULL,
    "inspection_id" "uuid" NOT NULL,
    "project_id" "uuid" NOT NULL,
    "area_name" "text" NOT NULL,
    "area_code" "text",
    "result_status" "text" NOT NULL,
    "work_may_continue" boolean DEFAULT false NOT NULL,
    "blocked_reason" "text",
    "correction_notes" "text",
    "reinspection_required" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "project_inspection_result_area_history_result_status_check" CHECK (("result_status" = ANY (ARRAY['passed'::"text", 'failed'::"text", 'partial_pass'::"text", 'not_inspected'::"text", 'not_applicable'::"text"])))
);
ALTER TABLE "public"."project_inspection_result_area_history" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."project_inspection_result_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "inspection_id" "uuid" NOT NULL,
    "project_id" "uuid" NOT NULL,
    "result_status" "text" NOT NULL,
    "result_summary" "text",
    "correction_summary" "text",
    "inspector_name" "text",
    "inspector_department" "text",
    "inspection_number" "text",
    "completed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "reinspection_required" boolean DEFAULT false NOT NULL,
    "reinspection_due_date" "date",
    "result_document_urls" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "result_photo_urls" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "extracted_result" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "extraction_status" "text" DEFAULT 'not_started'::"text" NOT NULL,
    "contractor_confirmed" boolean DEFAULT false NOT NULL,
    "contractor_confirmed_at" timestamp with time zone,
    "contractor_confirmed_by" "uuid",
    "contractor_confirmation_notes" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "project_inspection_result_history_extraction_status_check" CHECK (("extraction_status" = ANY (ARRAY['not_started'::"text", 'processing'::"text", 'review_required'::"text", 'confirmed'::"text", 'failed'::"text"]))),
    CONSTRAINT "project_inspection_result_history_result_status_check" CHECK (("result_status" = ANY (ARRAY['passed'::"text", 'partial_pass'::"text", 'failed'::"text"])))
);
ALTER TABLE "public"."project_inspection_result_history" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."project_inspection_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "inspection_mode" "text" DEFAULT 'determine'::"text" NOT NULL,
    "inspections_enabled" boolean DEFAULT true NOT NULL,
    "municipality_research_enabled" boolean DEFAULT true NOT NULL,
    "schedule_dependencies_enabled" boolean DEFAULT true NOT NULL,
    "document_extraction_enabled" boolean DEFAULT true NOT NULL,
    "partial_pass_enabled" boolean DEFAULT true NOT NULL,
    "governing_authority_name" "text",
    "governing_authority_type" "text",
    "municipality" "text",
    "county" "text",
    "state_code" "text",
    "permit_number" "text",
    "permit_type" "text",
    "project_type" "text",
    "project_scope_summary" "text",
    "researched_at" timestamp with time zone,
    "researched_by" "uuid",
    "research_source_summary" "text",
    "research_sources" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "contractor_verified_at" timestamp with time zone,
    "contractor_verified_by" "uuid",
    "contractor_verification_text" "text",
    "checklist_locked_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "workflow_activated_at" timestamp with time zone,
    "workflow_activated_by" "uuid",
    CONSTRAINT "project_inspection_settings_governing_authority_type_check" CHECK ((("governing_authority_type" IS NULL) OR ("governing_authority_type" = ANY (ARRAY['city'::"text", 'county'::"text", 'state'::"text", 'special_district'::"text", 'other'::"text"])))),
    CONSTRAINT "project_inspection_settings_inspection_mode_check" CHECK (("inspection_mode" = ANY (ARRAY['required'::"text", 'not_required'::"text", 'determine'::"text"])))
);
ALTER TABLE "public"."project_inspection_settings" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."project_inspection_task_dependencies" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "inspection_id" "uuid" NOT NULL,
    "inspection_area_id" "uuid",
    "project_id" "uuid" NOT NULL,
    "task_id" "uuid" NOT NULL,
    "dependency_type" "text" DEFAULT 'must_pass_before_start'::"text" NOT NULL,
    "is_blocking" boolean DEFAULT true NOT NULL,
    "released_at" timestamp with time zone,
    "released_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "project_inspection_task_dependencies_dependency_type_check" CHECK (("dependency_type" = ANY (ARRAY['must_pass_before_start'::"text", 'must_be_scheduled_before_start'::"text", 'area_release_required'::"text"])))
);
ALTER TABLE "public"."project_inspection_task_dependencies" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."project_inspections" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "requirement_id" "uuid",
    "inspection_name" "text" NOT NULL,
    "inspection_category" "text" DEFAULT 'general'::"text" NOT NULL,
    "inspection_status" "text" DEFAULT 'not_scheduled'::"text" NOT NULL,
    "requested_at" timestamp with time zone,
    "scheduled_start_at" timestamp with time zone,
    "scheduled_end_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "inspector_name" "text",
    "inspector_department" "text",
    "inspection_number" "text",
    "permit_number" "text",
    "result_summary" "text",
    "correction_summary" "text",
    "reinspection_required" boolean DEFAULT false NOT NULL,
    "reinspection_due_date" "date",
    "contractor_result_verified_at" timestamp with time zone,
    "contractor_result_verified_by" "uuid",
    "contractor_result_verification_notes" "text",
    "result_document_urls" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "result_photo_urls" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "extraction_status" "text" DEFAULT 'not_started'::"text" NOT NULL,
    "extracted_result" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "schedule_blocking_enabled" boolean DEFAULT true NOT NULL,
    CONSTRAINT "project_inspections_extraction_status_check" CHECK (("extraction_status" = ANY (ARRAY['not_started'::"text", 'processing'::"text", 'review_required'::"text", 'confirmed'::"text", 'failed'::"text"]))),
    CONSTRAINT "project_inspections_inspection_status_check" CHECK (("inspection_status" = ANY (ARRAY['not_scheduled'::"text", 'requested'::"text", 'scheduled'::"text", 'passed'::"text", 'partial_pass'::"text", 'failed'::"text", 'cancelled'::"text", 'rescheduled'::"text", 'not_required'::"text"])))
);
ALTER TABLE "public"."project_inspections" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."project_material_phases" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "phase_key" "text" NOT NULL,
    "phase_name" "text" NOT NULL,
    "phase_order" integer DEFAULT 1 NOT NULL,
    "required_for_start" boolean DEFAULT false NOT NULL,
    "supplier_name" "text",
    "delivery_status" "text" DEFAULT 'not_sent'::"text" NOT NULL,
    "estimated_delivery_date" "date",
    "confirmed_delivery_date" "date",
    "delivery_buffer_workdays" integer DEFAULT 1 NOT NULL,
    "calculated_ready_date" "date",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "project_material_phases_buffer_check" CHECK ((("delivery_buffer_workdays" >= 0) AND ("delivery_buffer_workdays" <= 10))),
    CONSTRAINT "project_material_phases_status_check" CHECK (("delivery_status" = ANY (ARRAY['not_sent'::"text", 'sent_for_quote'::"text", 'quoted'::"text", 'ordered'::"text", 'scheduled'::"text", 'delivered'::"text", 'delayed'::"text", 'cancelled'::"text"])))
);
ALTER TABLE "public"."project_material_phases" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."project_message_threads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "subcontractor_id" "uuid" NOT NULL,
    "preferred_language" "text" DEFAULT 'en'::"text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "last_message_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "project_message_threads_language_check" CHECK (("preferred_language" = ANY (ARRAY['en'::"text", 'es'::"text"]))),
    CONSTRAINT "project_message_threads_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'archived'::"text", 'closed'::"text"])))
);
ALTER TABLE "public"."project_message_threads" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."project_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "thread_id" "uuid" NOT NULL,
    "project_id" "uuid" NOT NULL,
    "subcontractor_id" "uuid" NOT NULL,
    "sender_type" "text" NOT NULL,
    "sender_app_user_id" "uuid",
    "direction" "text" NOT NULL,
    "original_language" "text" DEFAULT 'en'::"text" NOT NULL,
    "recipient_language" "text" DEFAULT 'en'::"text" NOT NULL,
    "original_text" "text" NOT NULL,
    "translated_text" "text",
    "translation_status" "text" DEFAULT 'not_requested'::"text" NOT NULL,
    "translation_provider" "text",
    "translation_confidence" numeric(5,4),
    "delivery_channel" "text" DEFAULT 'in_app'::"text" NOT NULL,
    "external_message_id" "text",
    "delivery_status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "sent_at" timestamp with time zone,
    "delivered_at" timestamp with time zone,
    "read_at" timestamp with time zone,
    "failed_at" timestamp with time zone,
    "failure_reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "project_messages_delivery_channel_check" CHECK (("delivery_channel" = ANY (ARRAY['in_app'::"text", 'sms'::"text"]))),
    CONSTRAINT "project_messages_delivery_status_check" CHECK (("delivery_status" = ANY (ARRAY['draft'::"text", 'queued'::"text", 'sent'::"text", 'delivered'::"text", 'read'::"text", 'failed'::"text"]))),
    CONSTRAINT "project_messages_direction_check" CHECK (("direction" = ANY (ARRAY['outbound'::"text", 'inbound'::"text", 'internal'::"text"]))),
    CONSTRAINT "project_messages_original_language_check" CHECK (("original_language" = ANY (ARRAY['en'::"text", 'es'::"text", 'unknown'::"text"]))),
    CONSTRAINT "project_messages_recipient_language_check" CHECK (("recipient_language" = ANY (ARRAY['en'::"text", 'es'::"text"]))),
    CONSTRAINT "project_messages_sender_type_check" CHECK (("sender_type" = ANY (ARRAY['office'::"text", 'subcontractor'::"text", 'system'::"text"]))),
    CONSTRAINT "project_messages_translation_confidence_check" CHECK ((("translation_confidence" IS NULL) OR (("translation_confidence" >= (0)::numeric) AND ("translation_confidence" <= (1)::numeric)))),
    CONSTRAINT "project_messages_translation_status_check" CHECK (("translation_status" = ANY (ARRAY['not_requested'::"text", 'pending'::"text", 'completed'::"text", 'failed'::"text", 'review_required'::"text"])))
);
ALTER TABLE "public"."project_messages" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."project_procurement_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "pricing_strategy" "text" DEFAULT 'company_default'::"text" NOT NULL,
    "preferred_supplier_id" "uuid",
    "preferred_supplier_location_id" "uuid",
    "allow_lowes_fallback" boolean DEFAULT true NOT NULL,
    "notes" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "project_procurement_settings_strategy_check" CHECK (("pricing_strategy" = ANY (ARRAY['company_default'::"text", 'preferred_supplier'::"text", 'best_available'::"text", 'lowes_fallback'::"text", 'manual'::"text"])))
);
ALTER TABLE "public"."project_procurement_settings" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."project_schedule_readiness" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "has_demo" boolean DEFAULT false NOT NULL,
    "customer_ready" boolean DEFAULT false NOT NULL,
    "permit_ready" boolean DEFAULT false NOT NULL,
    "dumpster_ready" boolean DEFAULT false NOT NULL,
    "site_access_ready" boolean DEFAULT false NOT NULL,
    "installer_earliest_demo_start" "date",
    "installer_earliest_construction_start" "date",
    "expected_demo_duration_days" integer,
    "expected_total_duration_days" integer,
    "confirmed_material_delivery_date" "date",
    "delivery_buffer_workdays" integer DEFAULT 1 NOT NULL,
    "calculated_material_safe_start" "date",
    "calculated_demo_start" "date",
    "calculated_construction_start" "date",
    "confirmed_demo_start" "date",
    "confirmed_construction_start" "date",
    "schedule_status" "text" DEFAULT 'planning'::"text" NOT NULL,
    "scheduling_notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "project_schedule_readiness_buffer_check" CHECK ((("delivery_buffer_workdays" >= 0) AND ("delivery_buffer_workdays" <= 10))),
    CONSTRAINT "project_schedule_readiness_demo_duration_check" CHECK ((("expected_demo_duration_days" IS NULL) OR (("expected_demo_duration_days" >= 0) AND ("expected_demo_duration_days" <= 30)))),
    CONSTRAINT "project_schedule_readiness_status_check" CHECK (("schedule_status" = ANY (ARRAY['planning'::"text", 'waiting_on_installer'::"text", 'waiting_on_materials'::"text", 'waiting_on_permit'::"text", 'waiting_on_customer'::"text", 'ready_to_confirm'::"text", 'confirmed'::"text", 'in_progress'::"text", 'completed'::"text", 'on_hold'::"text"]))),
    CONSTRAINT "project_schedule_readiness_total_duration_check" CHECK ((("expected_total_duration_days" IS NULL) OR (("expected_total_duration_days" >= 1) AND ("expected_total_duration_days" <= 120))))
);
ALTER TABLE "public"."project_schedule_readiness" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."projects" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "project_name" "text" NOT NULL,
    "project_type" "text",
    "description" "text",
    "property_address" "text",
    "status" "text" DEFAULT 'planning'::"text" NOT NULL,
    "project_manager_id" "uuid",
    "estimated_value" numeric(12,2),
    "contract_value" numeric(12,2),
    "start_date" "date",
    "target_completion_date" "date",
    "completed_at" timestamp with time zone,
    "notes" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "projects_completed_status_check" CHECK ((("completed_at" IS NULL) OR ("status" = 'completed'::"text"))),
    CONSTRAINT "projects_completion_date_check" CHECK ((("target_completion_date" IS NULL) OR ("start_date" IS NULL) OR ("target_completion_date" >= "start_date"))),
    CONSTRAINT "projects_contract_value_check" CHECK ((("contract_value" IS NULL) OR ("contract_value" >= (0)::numeric))),
    CONSTRAINT "projects_estimated_value_check" CHECK ((("estimated_value" IS NULL) OR ("estimated_value" >= (0)::numeric))),
    CONSTRAINT "projects_status_check" CHECK (("status" = ANY (ARRAY['planning'::"text", 'scheduled'::"text", 'in_progress'::"text", 'on_hold'::"text", 'completed'::"text", 'canceled'::"text"])))
);
ALTER TABLE "public"."projects" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."push_subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "endpoint" "text" NOT NULL,
    "p256dh" "text" NOT NULL,
    "auth" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);
ALTER TABLE "public"."push_subscriptions" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."role_permission_defaults" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "role" "text" NOT NULL,
    "default_portal" "text" NOT NULL,
    "portal_access" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "permissions" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "role_permission_defaults_portal_check" CHECK (("default_portal" = ANY (ARRAY['sales'::"text", 'operations'::"text", 'admin'::"text", 'subcontractor'::"text"]))),
    CONSTRAINT "role_permission_defaults_role_check" CHECK (("role" = ANY (ARRAY['owner'::"text", 'administrator'::"text", 'salesperson'::"text", 'estimator'::"text", 'project_manager'::"text", 'field_employee'::"text", 'bookkeeper'::"text", 'subcontractor'::"text"])))
);
ALTER TABLE "public"."role_permission_defaults" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."subcontractor_material_issues" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "review_id" "uuid" NOT NULL,
    "review_item_id" "uuid",
    "issue_type" "text" NOT NULL,
    "notes_original" "text",
    "notes_language" "text",
    "notes_english_translation" "text",
    "translation_status" "text" DEFAULT 'not_requested'::"text" NOT NULL,
    "reported_quantity" numeric(12,3),
    "photo_url" "text",
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "resolved_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "subcontractor_material_issues_language_check" CHECK ((("notes_language" IS NULL) OR ("notes_language" = ANY (ARRAY['en'::"text", 'es'::"text", 'unknown'::"text"])))),
    CONSTRAINT "subcontractor_material_issues_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'reviewing'::"text", 'resolved'::"text", 'dismissed'::"text"]))),
    CONSTRAINT "subcontractor_material_issues_translation_status_check" CHECK (("translation_status" = ANY (ARRAY['not_requested'::"text", 'pending'::"text", 'completed'::"text", 'failed'::"text", 'review_required'::"text"]))),
    CONSTRAINT "subcontractor_material_issues_type_check" CHECK (("issue_type" = ANY (ARRAY['missing_material'::"text", 'wrong_quantity'::"text", 'wrong_material'::"text", 'duplicate_material'::"text", 'other'::"text"])))
);
ALTER TABLE "public"."subcontractor_material_issues" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."subcontractor_material_review_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "review_id" "uuid" NOT NULL,
    "material_phase_id" "uuid",
    "material_catalog_id" "uuid",
    "item_name" "text" NOT NULL,
    "description" "text",
    "quantity" numeric(12,3) DEFAULT 0 NOT NULL,
    "unit" "text",
    "display_order" integer DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "subcontractor_material_review_items_quantity_check" CHECK (("quantity" >= (0)::numeric))
);
ALTER TABLE "public"."subcontractor_material_review_items" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."subcontractor_material_reviews" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "subcontractor_id" "uuid" NOT NULL,
    "schedule_request_id" "uuid",
    "secure_token" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "language" "text" DEFAULT 'en'::"text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "review_result" "text",
    "notes_original" "text",
    "notes_language" "text",
    "notes_english_translation" "text",
    "translation_status" "text" DEFAULT 'not_requested'::"text" NOT NULL,
    "sent_at" timestamp with time zone,
    "opened_at" timestamp with time zone,
    "submitted_at" timestamp with time zone,
    "expires_at" timestamp with time zone,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "reviewed_at" timestamp with time zone,
    "reviewed_by" "uuid",
    CONSTRAINT "subcontractor_material_reviews_language_check" CHECK (("language" = ANY (ARRAY['en'::"text", 'es'::"text"]))),
    CONSTRAINT "subcontractor_material_reviews_notes_language_check" CHECK ((("notes_language" IS NULL) OR ("notes_language" = ANY (ARRAY['en'::"text", 'es'::"text", 'unknown'::"text"])))),
    CONSTRAINT "subcontractor_material_reviews_result_check" CHECK ((("review_result" IS NULL) OR ("review_result" = ANY (ARRAY['approved'::"text", 'issues_reported'::"text"])))),
    CONSTRAINT "subcontractor_material_reviews_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'pending'::"text", 'opened'::"text", 'submitted'::"text", 'cancelled'::"text", 'expired'::"text"]))),
    CONSTRAINT "subcontractor_material_reviews_translation_status_check" CHECK (("translation_status" = ANY (ARRAY['not_requested'::"text", 'pending'::"text", 'completed'::"text", 'failed'::"text", 'review_required'::"text"])))
);
ALTER TABLE "public"."subcontractor_material_reviews" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."subcontractor_schedule_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "subcontractor_id" "uuid" NOT NULL,
    "secure_token" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "language" "text" DEFAULT 'en'::"text" NOT NULL,
    "earliest_demo_start" "date",
    "earliest_construction_start" "date",
    "demo_duration_days" integer,
    "total_duration_days" integer,
    "notes_original" "text",
    "notes_language" "text",
    "notes_english_translation" "text",
    "translation_status" "text" DEFAULT 'not_requested'::"text" NOT NULL,
    "sent_at" timestamp with time zone,
    "opened_at" timestamp with time zone,
    "submitted_at" timestamp with time zone,
    "expires_at" timestamp with time zone,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "reviewed_at" timestamp with time zone,
    "reviewed_by" "uuid",
    CONSTRAINT "subcontractor_schedule_requests_demo_duration_check" CHECK ((("demo_duration_days" IS NULL) OR (("demo_duration_days" >= 0) AND ("demo_duration_days" <= 30)))),
    CONSTRAINT "subcontractor_schedule_requests_language_check" CHECK (("language" = ANY (ARRAY['en'::"text", 'es'::"text"]))),
    CONSTRAINT "subcontractor_schedule_requests_notes_language_check" CHECK ((("notes_language" IS NULL) OR ("notes_language" = ANY (ARRAY['en'::"text", 'es'::"text", 'unknown'::"text"])))),
    CONSTRAINT "subcontractor_schedule_requests_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'pending'::"text", 'opened'::"text", 'submitted'::"text", 'cancelled'::"text", 'expired'::"text"]))),
    CONSTRAINT "subcontractor_schedule_requests_total_duration_check" CHECK ((("total_duration_days" IS NULL) OR (("total_duration_days" >= 1) AND ("total_duration_days" <= 120)))),
    CONSTRAINT "subcontractor_schedule_requests_translation_status_check" CHECK (("translation_status" = ANY (ARRAY['not_requested'::"text", 'pending'::"text", 'completed'::"text", 'failed'::"text", 'review_required'::"text"])))
);
ALTER TABLE "public"."subcontractor_schedule_requests" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."supplier_locations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "supplier_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "store_number" "text",
    "address_line_1" "text",
    "address_line_2" "text",
    "city" "text",
    "state" "text",
    "postal_code" "text",
    "phone" "text",
    "email" "text",
    "contact_name" "text",
    "contact_phone" "text",
    "contact_email" "text",
    "is_default" boolean DEFAULT false NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);
ALTER TABLE "public"."supplier_locations" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."suppliers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "supplier_type" "text" DEFAULT 'local_supplier'::"text" NOT NULL,
    "website_url" "text",
    "account_number" "text",
    "supports_csv_import" boolean DEFAULT true NOT NULL,
    "supports_quote_import" boolean DEFAULT true NOT NULL,
    "supports_live_lookup" boolean DEFAULT false NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "suppliers_type_check" CHECK (("supplier_type" = ANY (ARRAY['local_supplier'::"text", 'national_supplier'::"text", 'retailer'::"text", 'manufacturer'::"text", 'other'::"text"])))
);
ALTER TABLE "public"."suppliers" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."task_types" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "task_key" "text" NOT NULL,
    "description" "text",
    "category" "text" DEFAULT 'administrative'::"text" NOT NULL,
    "default_priority" "text" DEFAULT 'normal'::"text" NOT NULL,
    "due_mode" "text" DEFAULT 'business_days'::"text" NOT NULL,
    "due_offset" integer DEFAULT 1 NOT NULL,
    "assignment_strategy" "text" DEFAULT 'lead_owner'::"text" NOT NULL,
    "default_assignee_id" "uuid",
    "is_system_type" boolean DEFAULT false NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "task_types_assignment_strategy_check" CHECK (("assignment_strategy" = ANY (ARRAY['lead_owner'::"text", 'default_lead_owner'::"text", 'default_estimator'::"text", 'default_project_manager'::"text", 'specific_employee'::"text", 'unassigned'::"text"]))),
    CONSTRAINT "task_types_category_check" CHECK (("category" = ANY (ARRAY['sales'::"text", 'project'::"text", 'marketing'::"text", 'accounting'::"text", 'operations'::"text", 'customer_service'::"text", 'administrative'::"text", 'owner'::"text"]))),
    CONSTRAINT "task_types_default_priority_check" CHECK (("default_priority" = ANY (ARRAY['low'::"text", 'normal'::"text", 'high'::"text", 'urgent'::"text"]))),
    CONSTRAINT "task_types_due_mode_check" CHECK (("due_mode" = ANY (ARRAY['same_day'::"text", 'business_days'::"text", 'calendar_days'::"text", 'no_due_date'::"text"]))),
    CONSTRAINT "task_types_due_offset_check" CHECK ((("due_offset" >= 0) AND ("due_offset" <= 365))),
    CONSTRAINT "task_types_specific_employee_requires_assignee" CHECK ((("assignment_strategy" <> 'specific_employee'::"text") OR ("default_assignee_id" IS NOT NULL)))
);
ALTER TABLE "public"."task_types" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."tasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "category" "text" DEFAULT 'administrative'::"text" NOT NULL,
    "task_type" "text",
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "priority" "text" DEFAULT 'normal'::"text" NOT NULL,
    "due_at" timestamp with time zone,
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "canceled_at" timestamp with time zone,
    "completion_note" "text",
    "assigned_to_id" "uuid",
    "assigned_at" timestamp with time zone,
    "lead_id" "text",
    "project_id" "uuid",
    "customer_id" "text",
    "recurrence_rule" "text",
    "recurrence_parent_id" "uuid",
    "source_type" "text",
    "legacy_lead_task_id" "uuid",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "task_type_id" "uuid",
    CONSTRAINT "tasks_category_check" CHECK (("category" = ANY (ARRAY['sales'::"text", 'project'::"text", 'marketing'::"text", 'accounting'::"text", 'operations'::"text", 'customer_service'::"text", 'administrative'::"text", 'owner'::"text"]))),
    CONSTRAINT "tasks_priority_check" CHECK (("priority" = ANY (ARRAY['low'::"text", 'normal'::"text", 'high'::"text", 'urgent'::"text"]))),
    CONSTRAINT "tasks_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'in_progress'::"text", 'completed'::"text", 'canceled'::"text"])))
);
ALTER TABLE "public"."tasks" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."team_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "email" "text",
    "phone" "text",
    "job_title" "text",
    "roles" "text"[] DEFAULT ARRAY[]::"text"[] NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "is_default_lead_owner" boolean DEFAULT false NOT NULL,
    "is_default_estimator" boolean DEFAULT false NOT NULL,
    "is_default_project_manager" boolean DEFAULT false NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "auth_user_id" "uuid",
    CONSTRAINT "team_members_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'inactive'::"text", 'invited'::"text"])))
);
ALTER TABLE "public"."team_members" OWNER TO "postgres";
ALTER TABLE ONLY "public"."app_users"
    ADD CONSTRAINT "app_users_auth_user_id_key" UNIQUE ("auth_user_id");
ALTER TABLE ONLY "public"."app_users"
    ADD CONSTRAINT "app_users_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."change_order_vendor_requests"
    ADD CONSTRAINT "change_order_vendor_requests_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."change_order_vendor_requests"
    ADD CONSTRAINT "change_order_vendor_requests_request_token_key" UNIQUE ("request_token");
ALTER TABLE ONLY "public"."change_order_vendor_responses"
    ADD CONSTRAINT "change_order_vendor_responses_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."company_settings"
    ADD CONSTRAINT "company_settings_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_source_lead_id_key" UNIQUE ("source_lead_id");
ALTER TABLE ONLY "public"."email_drafts"
    ADD CONSTRAINT "email_drafts_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."estimate_line_items"
    ADD CONSTRAINT "estimate_line_items_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."estimate_material_price_snapshots"
    ADD CONSTRAINT "estimate_material_price_snapshots_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."estimate_options"
    ADD CONSTRAINT "estimate_options_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."estimates"
    ADD CONSTRAINT "estimates_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."feature_settings"
    ADD CONSTRAINT "feature_settings_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."feature_settings"
    ADD CONSTRAINT "feature_settings_scope_type_scope_id_feature_key_key" UNIQUE ("scope_type", "scope_id", "feature_key");
ALTER TABLE ONLY "public"."labor_catalog"
    ADD CONSTRAINT "labor_catalog_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."lead_activities"
    ADD CONSTRAINT "lead_activities_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."lead_tasks"
    ADD CONSTRAINT "lead_tasks_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."leads"
    ADD CONSTRAINT "leads_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."material_catalog"
    ADD CONSTRAINT "material_catalog_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."material_price_imports"
    ADD CONSTRAINT "material_price_imports_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."material_supplier_prices"
    ADD CONSTRAINT "material_supplier_prices_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."pricing_rules"
    ADD CONSTRAINT "pricing_rules_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."procurement_settings"
    ADD CONSTRAINT "procurement_settings_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."project_activity"
    ADD CONSTRAINT "project_activity_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."project_change_order_items"
    ADD CONSTRAINT "project_change_order_items_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."project_change_order_payments"
    ADD CONSTRAINT "project_change_order_payments_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."project_change_order_response_items"
    ADD CONSTRAINT "project_change_order_response_items_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."project_change_order_responses"
    ADD CONSTRAINT "project_change_order_responses_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."project_change_orders"
    ADD CONSTRAINT "project_change_orders_number_unique" UNIQUE ("project_id", "change_order_number");
ALTER TABLE ONLY "public"."project_change_orders"
    ADD CONSTRAINT "project_change_orders_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."project_costs"
    ADD CONSTRAINT "project_costs_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."project_inspection_areas"
    ADD CONSTRAINT "project_inspection_areas_inspection_id_area_name_key" UNIQUE ("inspection_id", "area_name");
ALTER TABLE ONLY "public"."project_inspection_areas"
    ADD CONSTRAINT "project_inspection_areas_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."project_inspection_corrections"
    ADD CONSTRAINT "project_inspection_correction_inspection_id_correction_numb_key" UNIQUE ("inspection_id", "correction_number");
ALTER TABLE ONLY "public"."project_inspection_corrections"
    ADD CONSTRAINT "project_inspection_corrections_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."project_inspection_document_findings"
    ADD CONSTRAINT "project_inspection_document_finding_document_id_finding_key_key" UNIQUE ("document_id", "finding_key");
ALTER TABLE ONLY "public"."project_inspection_document_findings"
    ADD CONSTRAINT "project_inspection_document_findings_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."project_inspection_documents"
    ADD CONSTRAINT "project_inspection_documents_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."project_inspection_requirements"
    ADD CONSTRAINT "project_inspection_requirements_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."project_inspection_requirements"
    ADD CONSTRAINT "project_inspection_requirements_project_id_inspection_key_key" UNIQUE ("project_id", "inspection_key");
ALTER TABLE ONLY "public"."project_inspection_research_findings"
    ADD CONSTRAINT "project_inspection_research_fin_research_run_id_finding_key_key" UNIQUE ("research_run_id", "finding_key");
ALTER TABLE ONLY "public"."project_inspection_research_findings"
    ADD CONSTRAINT "project_inspection_research_findings_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."project_inspection_research_runs"
    ADD CONSTRAINT "project_inspection_research_runs_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."project_inspection_research_sources"
    ADD CONSTRAINT "project_inspection_research_sources_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."project_inspection_result_area_history"
    ADD CONSTRAINT "project_inspection_result_area_history_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."project_inspection_result_history"
    ADD CONSTRAINT "project_inspection_result_history_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."project_inspection_settings"
    ADD CONSTRAINT "project_inspection_settings_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."project_inspection_settings"
    ADD CONSTRAINT "project_inspection_settings_project_id_key" UNIQUE ("project_id");
ALTER TABLE ONLY "public"."project_inspection_task_dependencies"
    ADD CONSTRAINT "project_inspection_task_dependencies_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."project_inspections"
    ADD CONSTRAINT "project_inspections_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."project_material_phases"
    ADD CONSTRAINT "project_material_phases_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."project_material_phases"
    ADD CONSTRAINT "project_material_phases_unique" UNIQUE ("project_id", "phase_key");
ALTER TABLE ONLY "public"."project_message_threads"
    ADD CONSTRAINT "project_message_threads_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."project_message_threads"
    ADD CONSTRAINT "project_message_threads_unique" UNIQUE ("project_id", "subcontractor_id");
ALTER TABLE ONLY "public"."project_messages"
    ADD CONSTRAINT "project_messages_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."project_procurement_settings"
    ADD CONSTRAINT "project_procurement_settings_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."project_procurement_settings"
    ADD CONSTRAINT "project_procurement_settings_project_id_key" UNIQUE ("project_id");
ALTER TABLE ONLY "public"."project_schedule_readiness"
    ADD CONSTRAINT "project_schedule_readiness_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."project_schedule_readiness"
    ADD CONSTRAINT "project_schedule_readiness_project_id_key" UNIQUE ("project_id");
ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_endpoint_key" UNIQUE ("endpoint");
ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."role_permission_defaults"
    ADD CONSTRAINT "role_permission_defaults_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."role_permission_defaults"
    ADD CONSTRAINT "role_permission_defaults_role_key" UNIQUE ("role");
ALTER TABLE ONLY "public"."subcontractor_material_issues"
    ADD CONSTRAINT "subcontractor_material_issues_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."subcontractor_material_review_items"
    ADD CONSTRAINT "subcontractor_material_review_items_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."subcontractor_material_reviews"
    ADD CONSTRAINT "subcontractor_material_reviews_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."subcontractor_material_reviews"
    ADD CONSTRAINT "subcontractor_material_reviews_secure_token_key" UNIQUE ("secure_token");
ALTER TABLE ONLY "public"."subcontractor_material_reviews"
    ADD CONSTRAINT "subcontractor_material_reviews_unique" UNIQUE ("project_id", "subcontractor_id");
ALTER TABLE ONLY "public"."subcontractor_schedule_requests"
    ADD CONSTRAINT "subcontractor_schedule_requests_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."subcontractor_schedule_requests"
    ADD CONSTRAINT "subcontractor_schedule_requests_secure_token_key" UNIQUE ("secure_token");
ALTER TABLE ONLY "public"."supplier_locations"
    ADD CONSTRAINT "supplier_locations_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."suppliers"
    ADD CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."suppliers"
    ADD CONSTRAINT "suppliers_slug_key" UNIQUE ("slug");
ALTER TABLE ONLY "public"."task_types"
    ADD CONSTRAINT "task_types_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_legacy_lead_task_id_key" UNIQUE ("legacy_lead_task_id");
ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."team_members"
    ADD CONSTRAINT "team_members_pkey" PRIMARY KEY ("id");
CREATE INDEX "app_users_active_idx" ON "public"."app_users" USING "btree" ("is_active");
CREATE INDEX "app_users_auth_user_id_idx" ON "public"."app_users" USING "btree" ("auth_user_id");
CREATE INDEX "app_users_role_idx" ON "public"."app_users" USING "btree" ("role");
CREATE INDEX "app_users_team_member_id_idx" ON "public"."app_users" USING "btree" ("team_member_id");
CREATE INDEX "change_order_vendor_requests_change_order_idx" ON "public"."change_order_vendor_requests" USING "btree" ("change_order_id", "request_status", "created_at" DESC);
CREATE INDEX "change_order_vendor_requests_project_idx" ON "public"."change_order_vendor_requests" USING "btree" ("project_id", "request_status", "due_at");
CREATE INDEX "change_order_vendor_requests_recipient_idx" ON "public"."change_order_vendor_requests" USING "btree" ("recipient_type", "recipient_id", "created_at" DESC);
CREATE INDEX "change_order_vendor_responses_change_order_idx" ON "public"."change_order_vendor_responses" USING "btree" ("change_order_id", "created_at" DESC);
CREATE UNIQUE INDEX "change_order_vendor_responses_latest_unique" ON "public"."change_order_vendor_responses" USING "btree" ("request_id");
CREATE INDEX "change_order_vendor_responses_request_idx" ON "public"."change_order_vendor_responses" USING "btree" ("request_id", "created_at" DESC);
CREATE UNIQUE INDEX "company_settings_single_row" ON "public"."company_settings" USING "btree" ((true));
CREATE INDEX "customers_assigned_to_idx" ON "public"."customers" USING "btree" ("assigned_to");
CREATE INDEX "customers_email_idx" ON "public"."customers" USING "btree" ("email");
CREATE INDEX "customers_phone_idx" ON "public"."customers" USING "btree" ("phone");
CREATE INDEX "customers_source_lead_id_idx" ON "public"."customers" USING "btree" ("source_lead_id");
CREATE INDEX "customers_status_idx" ON "public"."customers" USING "btree" ("status");
CREATE INDEX "email_drafts_created_at_idx" ON "public"."email_drafts" USING "btree" ("created_at" DESC);
CREATE INDEX "email_drafts_lead_id_idx" ON "public"."email_drafts" USING "btree" ("lead_id");
CREATE INDEX "email_drafts_status_idx" ON "public"."email_drafts" USING "btree" ("status");
CREATE INDEX "estimate_line_items_category_idx" ON "public"."estimate_line_items" USING "btree" ("category");
CREATE INDEX "estimate_line_items_estimate_id_idx" ON "public"."estimate_line_items" USING "btree" ("estimate_id");
CREATE INDEX "estimate_line_items_option_id_idx" ON "public"."estimate_line_items" USING "btree" ("estimate_option_id");
CREATE INDEX "estimate_material_price_snapshots_estimate_idx" ON "public"."estimate_material_price_snapshots" USING "btree" ("estimate_id");
CREATE INDEX "estimate_material_price_snapshots_line_idx" ON "public"."estimate_material_price_snapshots" USING "btree" ("estimate_line_item_id");
CREATE INDEX "estimate_options_estimate_id_idx" ON "public"."estimate_options" USING "btree" ("estimate_id");
CREATE INDEX "estimates_created_at_idx" ON "public"."estimates" USING "btree" ("created_at" DESC);
CREATE INDEX "estimates_customer_id_idx" ON "public"."estimates" USING "btree" ("customer_id");
CREATE INDEX "estimates_lead_id_idx" ON "public"."estimates" USING "btree" ("lead_id");
CREATE INDEX "estimates_project_id_idx" ON "public"."estimates" USING "btree" ("project_id");
CREATE INDEX "estimates_status_idx" ON "public"."estimates" USING "btree" ("status");
CREATE INDEX "feature_settings_scope_idx" ON "public"."feature_settings" USING "btree" ("scope_type", "scope_id", "category", "sort_order");
CREATE INDEX "labor_catalog_active_idx" ON "public"."labor_catalog" USING "btree" ("is_active");
CREATE INDEX "labor_catalog_category_idx" ON "public"."labor_catalog" USING "btree" ("category");
CREATE INDEX "lead_activities_channel_idx" ON "public"."lead_activities" USING "btree" ("channel");
CREATE INDEX "lead_activities_external_id_idx" ON "public"."lead_activities" USING "btree" ("external_id") WHERE ("external_id" IS NOT NULL);
CREATE INDEX "lead_activities_lead_id_idx" ON "public"."lead_activities" USING "btree" ("lead_id");
CREATE INDEX "lead_activities_occurred_at_idx" ON "public"."lead_activities" USING "btree" ("occurred_at" DESC);
CREATE INDEX "lead_tasks_assigned_to_index" ON "public"."lead_tasks" USING "btree" ("assigned_to_id");
CREATE INDEX "lead_tasks_due_at_idx" ON "public"."lead_tasks" USING "btree" ("due_at");
CREATE INDEX "lead_tasks_lead_id_idx" ON "public"."lead_tasks" USING "btree" ("lead_id");
CREATE INDEX "lead_tasks_open_due_idx" ON "public"."lead_tasks" USING "btree" ("status", "due_at") WHERE ("status" = ANY (ARRAY['open'::"text", 'in_progress'::"text"]));
CREATE INDEX "lead_tasks_status_idx" ON "public"."lead_tasks" USING "btree" ("status");
CREATE INDEX "leads_consultation_status_idx" ON "public"."leads" USING "btree" ("consultation_status");
CREATE INDEX "leads_created_at_idx" ON "public"."leads" USING "btree" ("created_at" DESC);
CREATE INDEX "leads_estimated_project_value_idx" ON "public"."leads" USING "btree" ("estimated_project_value");
CREATE INDEX "leads_expected_close_date_idx" ON "public"."leads" USING "btree" ("expected_close_date");
CREATE INDEX "leads_responsible_person_index" ON "public"."leads" USING "btree" ("responsible_person_id");
CREATE INDEX "leads_status_idx" ON "public"."leads" USING "btree" ("lead_status");
CREATE INDEX "material_catalog_active_idx" ON "public"."material_catalog" USING "btree" ("is_active");
CREATE INDEX "material_catalog_category_idx" ON "public"."material_catalog" USING "btree" ("category");
CREATE INDEX "material_catalog_sku_idx" ON "public"."material_catalog" USING "btree" ("sku");
CREATE INDEX "material_price_imports_status_idx" ON "public"."material_price_imports" USING "btree" ("status");
CREATE INDEX "material_price_imports_supplier_idx" ON "public"."material_price_imports" USING "btree" ("supplier_id");
CREATE INDEX "material_supplier_prices_active_idx" ON "public"."material_supplier_prices" USING "btree" ("is_active");
CREATE INDEX "material_supplier_prices_checked_idx" ON "public"."material_supplier_prices" USING "btree" ("last_checked_at" DESC);
CREATE INDEX "material_supplier_prices_location_idx" ON "public"."material_supplier_prices" USING "btree" ("supplier_location_id");
CREATE INDEX "material_supplier_prices_material_idx" ON "public"."material_supplier_prices" USING "btree" ("material_catalog_id");
CREATE INDEX "material_supplier_prices_supplier_idx" ON "public"."material_supplier_prices" USING "btree" ("supplier_id");
CREATE INDEX "material_supplier_prices_supplier_sku_idx" ON "public"."material_supplier_prices" USING "btree" ("supplier_sku");
CREATE INDEX "pricing_rules_category_idx" ON "public"."pricing_rules" USING "btree" ("category");
CREATE INDEX "project_activity_project_idx" ON "public"."project_activity" USING "btree" ("project_id", "occurred_at" DESC);
CREATE UNIQUE INDEX "project_activity_source_unique_idx" ON "public"."project_activity" USING "btree" ("activity_type", "source_table", "source_id") WHERE ("source_id" IS NOT NULL);
CREATE INDEX "project_activity_type_idx" ON "public"."project_activity" USING "btree" ("activity_type", "occurred_at" DESC);
CREATE INDEX "project_change_order_items_order_idx" ON "public"."project_change_order_items" USING "btree" ("change_order_id", "sort_order", "created_at");
CREATE INDEX "project_change_order_payments_change_order_idx" ON "public"."project_change_order_payments" USING "btree" ("change_order_id", "payment_date" DESC, "created_at" DESC);
CREATE INDEX "project_change_order_response_items_response_idx" ON "public"."project_change_order_response_items" USING "btree" ("response_id", "sort_order", "created_at");
CREATE INDEX "project_change_order_responses_change_order_idx" ON "public"."project_change_order_responses" USING "btree" ("change_order_id", "submitted_at" DESC);
CREATE INDEX "project_change_order_responses_project_idx" ON "public"."project_change_order_responses" USING "btree" ("project_id", "submitted_at" DESC);
CREATE UNIQUE INDEX "project_change_orders_approval_token_idx" ON "public"."project_change_orders" USING "btree" ("approval_token");
CREATE INDEX "project_change_orders_project_idx" ON "public"."project_change_orders" USING "btree" ("project_id", "created_at" DESC);
CREATE INDEX "project_change_orders_response_reviewed_idx" ON "public"."project_change_orders" USING "btree" ("response_reviewed_at");
CREATE INDEX "project_change_orders_revision_source_idx" ON "public"."project_change_orders" USING "btree" ("revised_from_change_order_id", "revision_number");
CREATE INDEX "project_change_orders_status_idx" ON "public"."project_change_orders" USING "btree" ("status", "created_at" DESC);
CREATE INDEX "project_change_orders_superseded_by_idx" ON "public"."project_change_orders" USING "btree" ("superseded_by_change_order_id");
CREATE INDEX "project_costs_cost_date_idx" ON "public"."project_costs" USING "btree" ("cost_date");
CREATE INDEX "project_costs_cost_type_idx" ON "public"."project_costs" USING "btree" ("cost_type");
CREATE INDEX "project_costs_payment_status_idx" ON "public"."project_costs" USING "btree" ("payment_status");
CREATE INDEX "project_costs_project_final_amount_idx" ON "public"."project_costs" USING "btree" ("project_id", "final_amount");
CREATE INDEX "project_costs_project_id_idx" ON "public"."project_costs" USING "btree" ("project_id");
CREATE INDEX "project_inspection_areas_project_idx" ON "public"."project_inspection_areas" USING "btree" ("project_id", "work_may_continue", "result_status");
CREATE INDEX "project_inspection_corrections_assignee_idx" ON "public"."project_inspection_corrections" USING "btree" ("assigned_app_user_id", "correction_status", "due_date");
CREATE INDEX "project_inspection_corrections_inspection_idx" ON "public"."project_inspection_corrections" USING "btree" ("inspection_id", "correction_status", "correction_number");
CREATE INDEX "project_inspection_corrections_project_idx" ON "public"."project_inspection_corrections" USING "btree" ("project_id", "correction_status", "due_date");
CREATE INDEX "project_inspection_document_findings_document_idx" ON "public"."project_inspection_document_findings" USING "btree" ("document_id", "contractor_review_status", "sort_order");
CREATE INDEX "project_inspection_document_findings_project_idx" ON "public"."project_inspection_document_findings" USING "btree" ("project_id", "finding_type", "created_at" DESC);
CREATE INDEX "project_inspection_documents_extraction_idx" ON "public"."project_inspection_documents" USING "btree" ("extraction_status", "created_at");
CREATE INDEX "project_inspection_documents_inspection_idx" ON "public"."project_inspection_documents" USING "btree" ("inspection_id", "created_at" DESC);
CREATE INDEX "project_inspection_documents_project_idx" ON "public"."project_inspection_documents" USING "btree" ("project_id", "created_at" DESC);
CREATE INDEX "project_inspection_requirements_project_idx" ON "public"."project_inspection_requirements" USING "btree" ("project_id", "contractor_decision", "sort_order");
CREATE INDEX "project_inspection_research_findings_project_idx" ON "public"."project_inspection_research_findings" USING "btree" ("project_id", "finding_type", "requirement_status");
CREATE INDEX "project_inspection_research_findings_run_idx" ON "public"."project_inspection_research_findings" USING "btree" ("research_run_id", "contractor_review_status", "sort_order");
CREATE INDEX "project_inspection_research_runs_project_idx" ON "public"."project_inspection_research_runs" USING "btree" ("project_id", "created_at" DESC);
CREATE INDEX "project_inspection_research_runs_status_idx" ON "public"."project_inspection_research_runs" USING "btree" ("research_status", "created_at");
CREATE INDEX "project_inspection_research_sources_run_idx" ON "public"."project_inspection_research_sources" USING "btree" ("research_run_id", "is_primary_authority_source" DESC, "created_at");
CREATE INDEX "project_inspection_result_area_history_result_idx" ON "public"."project_inspection_result_area_history" USING "btree" ("result_history_id", "area_name");
CREATE INDEX "project_inspection_result_history_inspection_idx" ON "public"."project_inspection_result_history" USING "btree" ("inspection_id", "created_at" DESC);
CREATE INDEX "project_inspection_result_history_project_idx" ON "public"."project_inspection_result_history" USING "btree" ("project_id", "created_at" DESC);
CREATE INDEX "project_inspection_task_dependencies_task_idx" ON "public"."project_inspection_task_dependencies" USING "btree" ("task_id", "is_blocking", "released_at");
CREATE UNIQUE INDEX "project_inspection_task_dependency_unique" ON "public"."project_inspection_task_dependencies" USING "btree" ("inspection_id", COALESCE("inspection_area_id", '00000000-0000-0000-0000-000000000000'::"uuid"), "task_id", "dependency_type");
CREATE INDEX "project_inspections_project_status_idx" ON "public"."project_inspections" USING "btree" ("project_id", "inspection_status", "scheduled_start_at");
CREATE UNIQUE INDEX "project_inspections_requirement_unique" ON "public"."project_inspections" USING "btree" ("requirement_id") WHERE ("requirement_id" IS NOT NULL);
CREATE INDEX "project_material_phases_order_idx" ON "public"."project_material_phases" USING "btree" ("project_id", "phase_order");
CREATE INDEX "project_material_phases_project_idx" ON "public"."project_material_phases" USING "btree" ("project_id");
CREATE INDEX "project_message_threads_last_message_idx" ON "public"."project_message_threads" USING "btree" ("last_message_at" DESC);
CREATE INDEX "project_message_threads_project_idx" ON "public"."project_message_threads" USING "btree" ("project_id");
CREATE INDEX "project_message_threads_subcontractor_idx" ON "public"."project_message_threads" USING "btree" ("subcontractor_id");
CREATE INDEX "project_messages_delivery_status_idx" ON "public"."project_messages" USING "btree" ("delivery_status");
CREATE INDEX "project_messages_external_message_idx" ON "public"."project_messages" USING "btree" ("external_message_id") WHERE ("external_message_id" IS NOT NULL);
CREATE INDEX "project_messages_project_idx" ON "public"."project_messages" USING "btree" ("project_id");
CREATE INDEX "project_messages_thread_idx" ON "public"."project_messages" USING "btree" ("thread_id", "created_at");
CREATE INDEX "project_schedule_readiness_project_idx" ON "public"."project_schedule_readiness" USING "btree" ("project_id");
CREATE INDEX "project_schedule_readiness_status_idx" ON "public"."project_schedule_readiness" USING "btree" ("schedule_status");
CREATE INDEX "projects_created_at_idx" ON "public"."projects" USING "btree" ("created_at" DESC);
CREATE INDEX "projects_customer_id_idx" ON "public"."projects" USING "btree" ("customer_id");
CREATE INDEX "projects_project_manager_id_idx" ON "public"."projects" USING "btree" ("project_manager_id");
CREATE INDEX "projects_start_date_idx" ON "public"."projects" USING "btree" ("start_date");
CREATE INDEX "projects_status_idx" ON "public"."projects" USING "btree" ("status");
CREATE INDEX "projects_status_start_date_idx" ON "public"."projects" USING "btree" ("status", "start_date");
CREATE INDEX "projects_target_completion_date_idx" ON "public"."projects" USING "btree" ("target_completion_date");
CREATE INDEX "subcontractor_material_issues_review_idx" ON "public"."subcontractor_material_issues" USING "btree" ("review_id", "status");
CREATE INDEX "subcontractor_material_review_items_review_idx" ON "public"."subcontractor_material_review_items" USING "btree" ("review_id", "display_order");
CREATE INDEX "subcontractor_material_reviews_project_idx" ON "public"."subcontractor_material_reviews" USING "btree" ("project_id");
CREATE INDEX "subcontractor_material_reviews_reviewed_idx" ON "public"."subcontractor_material_reviews" USING "btree" ("reviewed_at");
CREATE INDEX "subcontractor_material_reviews_status_idx" ON "public"."subcontractor_material_reviews" USING "btree" ("status");
CREATE INDEX "subcontractor_material_reviews_subcontractor_idx" ON "public"."subcontractor_material_reviews" USING "btree" ("subcontractor_id");
CREATE INDEX "subcontractor_material_reviews_token_idx" ON "public"."subcontractor_material_reviews" USING "btree" ("secure_token");
CREATE INDEX "subcontractor_schedule_requests_project_idx" ON "public"."subcontractor_schedule_requests" USING "btree" ("project_id");
CREATE INDEX "subcontractor_schedule_requests_reviewed_idx" ON "public"."subcontractor_schedule_requests" USING "btree" ("reviewed_at");
CREATE INDEX "subcontractor_schedule_requests_status_idx" ON "public"."subcontractor_schedule_requests" USING "btree" ("status");
CREATE INDEX "subcontractor_schedule_requests_subcontractor_idx" ON "public"."subcontractor_schedule_requests" USING "btree" ("subcontractor_id");
CREATE INDEX "subcontractor_schedule_requests_token_idx" ON "public"."subcontractor_schedule_requests" USING "btree" ("secure_token");
CREATE INDEX "supplier_locations_supplier_id_idx" ON "public"."supplier_locations" USING "btree" ("supplier_id");
CREATE INDEX "task_types_active_index" ON "public"."task_types" USING "btree" ("is_active");
CREATE INDEX "task_types_category_index" ON "public"."task_types" USING "btree" ("category");
CREATE INDEX "task_types_default_assignee_index" ON "public"."task_types" USING "btree" ("default_assignee_id");
CREATE UNIQUE INDEX "task_types_name_unique" ON "public"."task_types" USING "btree" ("lower"("name"));
CREATE UNIQUE INDEX "task_types_task_key_unique" ON "public"."task_types" USING "btree" ("lower"("task_key"));
CREATE INDEX "tasks_assigned_to_index" ON "public"."tasks" USING "btree" ("assigned_to_id");
CREATE INDEX "tasks_assignee_open_due_index" ON "public"."tasks" USING "btree" ("assigned_to_id", "due_at") WHERE ("status" = ANY (ARRAY['open'::"text", 'in_progress'::"text"]));
CREATE INDEX "tasks_category_index" ON "public"."tasks" USING "btree" ("category");
CREATE INDEX "tasks_customer_id_index" ON "public"."tasks" USING "btree" ("customer_id");
CREATE INDEX "tasks_due_at_index" ON "public"."tasks" USING "btree" ("due_at");
CREATE INDEX "tasks_lead_id_index" ON "public"."tasks" USING "btree" ("lead_id");
CREATE INDEX "tasks_open_due_index" ON "public"."tasks" USING "btree" ("due_at") WHERE ("status" = ANY (ARRAY['open'::"text", 'in_progress'::"text"]));
CREATE INDEX "tasks_project_id_idx" ON "public"."tasks" USING "btree" ("project_id");
CREATE INDEX "tasks_project_id_index" ON "public"."tasks" USING "btree" ("project_id");
CREATE INDEX "tasks_status_index" ON "public"."tasks" USING "btree" ("status");
CREATE INDEX "tasks_task_type_id_index" ON "public"."tasks" USING "btree" ("task_type_id");
CREATE UNIQUE INDEX "team_members_auth_user_id_unique" ON "public"."team_members" USING "btree" ("auth_user_id") WHERE ("auth_user_id" IS NOT NULL);
CREATE UNIQUE INDEX "team_members_email_unique" ON "public"."team_members" USING "btree" ("lower"("email")) WHERE ("email" IS NOT NULL);
CREATE INDEX "team_members_status_index" ON "public"."team_members" USING "btree" ("status");
CREATE OR REPLACE TRIGGER "apply_installer_schedule_response_after_update" AFTER UPDATE ON "public"."subcontractor_schedule_requests" FOR EACH ROW EXECUTE FUNCTION "public"."apply_installer_schedule_response"();
CREATE OR REPLACE TRIGGER "assign_project_change_order_number_trigger" BEFORE INSERT ON "public"."project_change_orders" FOR EACH ROW EXECUTE FUNCTION "public"."assign_project_change_order_number"();
CREATE OR REPLACE TRIGGER "assign_project_inspection_correction_number" BEFORE INSERT ON "public"."project_inspection_corrections" FOR EACH ROW EXECUTE FUNCTION "public"."assign_project_inspection_correction_number"();
CREATE OR REPLACE TRIGGER "log_change_order_activity_trigger" AFTER INSERT OR UPDATE ON "public"."project_change_orders" FOR EACH ROW EXECUTE FUNCTION "public"."log_change_order_activity"();
CREATE OR REPLACE TRIGGER "log_change_order_payment_activity_trigger" AFTER INSERT OR DELETE OR UPDATE ON "public"."project_change_order_payments" FOR EACH ROW EXECUTE FUNCTION "public"."log_change_order_payment_activity"();
CREATE OR REPLACE TRIGGER "log_change_order_vendor_request_activity_trigger" AFTER INSERT OR UPDATE ON "public"."change_order_vendor_requests" FOR EACH ROW EXECUTE FUNCTION "public"."log_change_order_vendor_request_activity"();
CREATE OR REPLACE TRIGGER "log_material_issue_activity_trigger" AFTER INSERT OR UPDATE ON "public"."subcontractor_material_issues" FOR EACH ROW EXECUTE FUNCTION "public"."log_material_issue_activity"();
CREATE OR REPLACE TRIGGER "log_material_review_activity_trigger" AFTER INSERT OR UPDATE ON "public"."subcontractor_material_reviews" FOR EACH ROW EXECUTE FUNCTION "public"."log_material_review_activity"();
CREATE OR REPLACE TRIGGER "log_project_message_activity_trigger" AFTER INSERT OR UPDATE OF "translated_text", "translation_status", "delivery_status", "sent_at", "delivered_at", "read_at" ON "public"."project_messages" FOR EACH ROW EXECUTE FUNCTION "public"."log_project_message_activity"();
CREATE OR REPLACE TRIGGER "log_project_update_activity_trigger" AFTER UPDATE ON "public"."projects" FOR EACH ROW EXECUTE FUNCTION "public"."log_project_update_activity"();
CREATE OR REPLACE TRIGGER "log_schedule_request_activity_trigger" AFTER INSERT OR UPDATE ON "public"."subcontractor_schedule_requests" FOR EACH ROW EXECUTE FUNCTION "public"."log_schedule_request_activity"();
CREATE OR REPLACE TRIGGER "prevent_locked_change_order_item_changes_trigger" BEFORE INSERT OR DELETE OR UPDATE ON "public"."project_change_order_items" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_locked_change_order_item_changes"();
CREATE OR REPLACE TRIGGER "prevent_locked_change_order_scope_changes_trigger" BEFORE UPDATE ON "public"."project_change_orders" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_locked_change_order_scope_changes"();
CREATE OR REPLACE TRIGGER "prevent_schedule_response_overwrite_trigger" BEFORE UPDATE ON "public"."subcontractor_schedule_requests" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_schedule_response_overwrite"();
CREATE OR REPLACE TRIGGER "project_change_order_approval_activity_trigger" AFTER UPDATE OF "approval_token", "approval_sent_at", "approval_opened_at" ON "public"."project_change_orders" FOR EACH ROW EXECUTE FUNCTION "public"."log_change_order_approval_activity"();
CREATE OR REPLACE TRIGGER "project_change_order_items_totals_trigger" AFTER INSERT OR DELETE OR UPDATE ON "public"."project_change_order_items" FOR EACH ROW EXECUTE FUNCTION "public"."sync_change_order_item_totals"();
CREATE OR REPLACE TRIGGER "project_change_order_items_updated_at_trigger" BEFORE UPDATE ON "public"."project_change_order_items" FOR EACH ROW EXECUTE FUNCTION "public"."set_change_order_item_updated_at"();
CREATE OR REPLACE TRIGGER "projects_set_updated_at" BEFORE UPDATE ON "public"."projects" FOR EACH ROW EXECUTE FUNCTION "public"."set_crm_updated_at"();
CREATE OR REPLACE TRIGGER "set_app_users_updated_at" BEFORE UPDATE ON "public"."app_users" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();
CREATE OR REPLACE TRIGGER "set_change_order_invoice_due_date_20260801" BEFORE INSERT OR UPDATE OF "invoiced_at", "invoice_due_date" ON "public"."project_change_orders" FOR EACH ROW EXECUTE FUNCTION "public"."set_change_order_invoice_due_date_20260801"();
CREATE OR REPLACE TRIGGER "set_change_order_vendor_requests_updated_at" BEFORE UPDATE ON "public"."change_order_vendor_requests" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();
CREATE OR REPLACE TRIGGER "set_customers_updated_at" BEFORE UPDATE ON "public"."customers" FOR EACH ROW EXECUTE FUNCTION "public"."set_customer_updated_at"();
CREATE OR REPLACE TRIGGER "set_email_drafts_updated_at" BEFORE UPDATE ON "public"."email_drafts" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();
CREATE OR REPLACE TRIGGER "set_estimate_line_items_updated_at" BEFORE UPDATE ON "public"."estimate_line_items" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();
CREATE OR REPLACE TRIGGER "set_estimate_options_updated_at" BEFORE UPDATE ON "public"."estimate_options" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();
CREATE OR REPLACE TRIGGER "set_estimates_updated_at" BEFORE UPDATE ON "public"."estimates" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();
CREATE OR REPLACE TRIGGER "set_feature_settings_updated_at" BEFORE UPDATE ON "public"."feature_settings" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();
CREATE OR REPLACE TRIGGER "set_labor_catalog_updated_at" BEFORE UPDATE ON "public"."labor_catalog" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();
CREATE OR REPLACE TRIGGER "set_lead_tasks_updated_at" BEFORE UPDATE ON "public"."lead_tasks" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();
CREATE OR REPLACE TRIGGER "set_leads_updated_at" BEFORE UPDATE ON "public"."leads" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();
CREATE OR REPLACE TRIGGER "set_material_catalog_updated_at" BEFORE UPDATE ON "public"."material_catalog" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();
CREATE OR REPLACE TRIGGER "set_material_price_imports_updated_at" BEFORE UPDATE ON "public"."material_price_imports" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();
CREATE OR REPLACE TRIGGER "set_material_supplier_prices_updated_at" BEFORE UPDATE ON "public"."material_supplier_prices" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();
CREATE OR REPLACE TRIGGER "set_pricing_rules_updated_at" BEFORE UPDATE ON "public"."pricing_rules" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();
CREATE OR REPLACE TRIGGER "set_procurement_settings_updated_at" BEFORE UPDATE ON "public"."procurement_settings" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();
CREATE OR REPLACE TRIGGER "set_project_change_order_payments_updated_at" BEFORE UPDATE ON "public"."project_change_order_payments" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();
CREATE OR REPLACE TRIGGER "set_project_change_orders_updated_at" BEFORE UPDATE ON "public"."project_change_orders" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();
CREATE OR REPLACE TRIGGER "set_project_costs_updated_at" BEFORE UPDATE ON "public"."project_costs" FOR EACH ROW EXECUTE FUNCTION "public"."set_project_costs_updated_at"();
CREATE OR REPLACE TRIGGER "set_project_inspection_correction_updated_at" BEFORE UPDATE ON "public"."project_inspection_corrections" FOR EACH ROW EXECUTE FUNCTION "public"."set_project_inspection_correction_updated_at"();
CREATE OR REPLACE TRIGGER "set_project_inspection_document_findings_updated_at" BEFORE UPDATE ON "public"."project_inspection_document_findings" FOR EACH ROW EXECUTE FUNCTION "public"."set_project_inspection_document_updated_at"();
CREATE OR REPLACE TRIGGER "set_project_inspection_documents_updated_at" BEFORE UPDATE ON "public"."project_inspection_documents" FOR EACH ROW EXECUTE FUNCTION "public"."set_project_inspection_document_updated_at"();
CREATE OR REPLACE TRIGGER "set_project_inspection_research_findings_updated_at" BEFORE UPDATE ON "public"."project_inspection_research_findings" FOR EACH ROW EXECUTE FUNCTION "public"."set_inspection_research_updated_at"();
CREATE OR REPLACE TRIGGER "set_project_inspection_research_runs_updated_at" BEFORE UPDATE ON "public"."project_inspection_research_runs" FOR EACH ROW EXECUTE FUNCTION "public"."set_inspection_research_updated_at"();
CREATE OR REPLACE TRIGGER "set_project_material_phases_updated_at" BEFORE UPDATE ON "public"."project_material_phases" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();
CREATE OR REPLACE TRIGGER "set_project_message_threads_updated_at" BEFORE UPDATE ON "public"."project_message_threads" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();
CREATE OR REPLACE TRIGGER "set_project_messages_updated_at" BEFORE UPDATE ON "public"."project_messages" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();
CREATE OR REPLACE TRIGGER "set_project_procurement_settings_updated_at" BEFORE UPDATE ON "public"."project_procurement_settings" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();
CREATE OR REPLACE TRIGGER "set_project_schedule_readiness_updated_at" BEFORE UPDATE ON "public"."project_schedule_readiness" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();
CREATE OR REPLACE TRIGGER "set_role_permission_defaults_updated_at" BEFORE UPDATE ON "public"."role_permission_defaults" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();
CREATE OR REPLACE TRIGGER "set_subcontractor_material_issues_updated_at" BEFORE UPDATE ON "public"."subcontractor_material_issues" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();
CREATE OR REPLACE TRIGGER "set_subcontractor_material_review_items_updated_at" BEFORE UPDATE ON "public"."subcontractor_material_review_items" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();
CREATE OR REPLACE TRIGGER "set_subcontractor_material_reviews_updated_at" BEFORE UPDATE ON "public"."subcontractor_material_reviews" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();
CREATE OR REPLACE TRIGGER "set_subcontractor_schedule_requests_updated_at" BEFORE UPDATE ON "public"."subcontractor_schedule_requests" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();
CREATE OR REPLACE TRIGGER "set_supplier_locations_updated_at" BEFORE UPDATE ON "public"."supplier_locations" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();
CREATE OR REPLACE TRIGGER "set_suppliers_updated_at" BEFORE UPDATE ON "public"."suppliers" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();
CREATE OR REPLACE TRIGGER "sync_change_order_invoice_status_trigger" BEFORE UPDATE OF "invoice_number", "invoiced_at", "amount" ON "public"."project_change_orders" FOR EACH ROW EXECUTE FUNCTION "public"."sync_change_order_invoice_status"();
CREATE OR REPLACE TRIGGER "sync_change_order_payment_status_trigger" AFTER INSERT OR DELETE OR UPDATE ON "public"."project_change_order_payments" FOR EACH ROW EXECUTE FUNCTION "public"."sync_change_order_payment_status"();
CREATE OR REPLACE TRIGGER "touch_project_message_thread_after_message" AFTER INSERT OR UPDATE OF "sent_at" ON "public"."project_messages" FOR EACH ROW EXECUTE FUNCTION "public"."touch_project_message_thread"();
CREATE OR REPLACE TRIGGER "validate_change_order_supersession_trigger" BEFORE INSERT OR UPDATE OF "superseded_by_change_order_id" ON "public"."project_change_orders" FOR EACH ROW EXECUTE FUNCTION "public"."validate_change_order_supersession"();
ALTER TABLE ONLY "public"."app_users"
    ADD CONSTRAINT "app_users_auth_user_id_fkey" FOREIGN KEY ("auth_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."app_users"
    ADD CONSTRAINT "app_users_team_member_id_fkey" FOREIGN KEY ("team_member_id") REFERENCES "public"."team_members"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."change_order_vendor_requests"
    ADD CONSTRAINT "change_order_vendor_requests_change_order_id_fkey" FOREIGN KEY ("change_order_id") REFERENCES "public"."project_change_orders"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."change_order_vendor_requests"
    ADD CONSTRAINT "change_order_vendor_requests_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."app_users"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."change_order_vendor_requests"
    ADD CONSTRAINT "change_order_vendor_requests_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."change_order_vendor_responses"
    ADD CONSTRAINT "change_order_vendor_responses_change_order_id_fkey" FOREIGN KEY ("change_order_id") REFERENCES "public"."project_change_orders"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."change_order_vendor_responses"
    ADD CONSTRAINT "change_order_vendor_responses_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."change_order_vendor_responses"
    ADD CONSTRAINT "change_order_vendor_responses_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "public"."change_order_vendor_requests"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."company_settings"
    ADD CONSTRAINT "company_settings_default_estimator_id_fkey" FOREIGN KEY ("default_estimator_id") REFERENCES "public"."team_members"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."company_settings"
    ADD CONSTRAINT "company_settings_default_lead_owner_id_fkey" FOREIGN KEY ("default_lead_owner_id") REFERENCES "public"."team_members"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."company_settings"
    ADD CONSTRAINT "company_settings_default_project_manager_id_fkey" FOREIGN KEY ("default_project_manager_id") REFERENCES "public"."team_members"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "public"."team_members"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_source_lead_id_fkey" FOREIGN KEY ("source_lead_id") REFERENCES "public"."leads"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."estimate_line_items"
    ADD CONSTRAINT "estimate_line_items_estimate_id_fkey" FOREIGN KEY ("estimate_id") REFERENCES "public"."estimates"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."estimate_line_items"
    ADD CONSTRAINT "estimate_line_items_estimate_option_id_fkey" FOREIGN KEY ("estimate_option_id") REFERENCES "public"."estimate_options"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."estimate_line_items"
    ADD CONSTRAINT "estimate_line_items_labor_catalog_id_fkey" FOREIGN KEY ("labor_catalog_id") REFERENCES "public"."labor_catalog"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."estimate_line_items"
    ADD CONSTRAINT "estimate_line_items_material_catalog_id_fkey" FOREIGN KEY ("material_catalog_id") REFERENCES "public"."material_catalog"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."estimate_material_price_snapshots"
    ADD CONSTRAINT "estimate_material_price_snapshots_estimate_id_fkey" FOREIGN KEY ("estimate_id") REFERENCES "public"."estimates"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."estimate_material_price_snapshots"
    ADD CONSTRAINT "estimate_material_price_snapshots_estimate_line_item_id_fkey" FOREIGN KEY ("estimate_line_item_id") REFERENCES "public"."estimate_line_items"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."estimate_material_price_snapshots"
    ADD CONSTRAINT "estimate_material_price_snapshots_estimate_option_id_fkey" FOREIGN KEY ("estimate_option_id") REFERENCES "public"."estimate_options"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."estimate_material_price_snapshots"
    ADD CONSTRAINT "estimate_material_price_snapshots_material_catalog_id_fkey" FOREIGN KEY ("material_catalog_id") REFERENCES "public"."material_catalog"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."estimate_material_price_snapshots"
    ADD CONSTRAINT "estimate_material_price_snapshots_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."estimate_material_price_snapshots"
    ADD CONSTRAINT "estimate_material_price_snapshots_supplier_location_id_fkey" FOREIGN KEY ("supplier_location_id") REFERENCES "public"."supplier_locations"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."estimate_options"
    ADD CONSTRAINT "estimate_options_estimate_id_fkey" FOREIGN KEY ("estimate_id") REFERENCES "public"."estimates"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."estimates"
    ADD CONSTRAINT "estimates_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."estimates"
    ADD CONSTRAINT "estimates_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."estimates"
    ADD CONSTRAINT "estimates_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."estimates"
    ADD CONSTRAINT "estimates_selected_option_id_fkey" FOREIGN KEY ("selected_option_id") REFERENCES "public"."estimate_options"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."feature_settings"
    ADD CONSTRAINT "feature_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."app_users"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."lead_tasks"
    ADD CONSTRAINT "lead_tasks_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "public"."team_members"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."leads"
    ADD CONSTRAINT "leads_assigned_by_id_fkey" FOREIGN KEY ("assigned_by_id") REFERENCES "public"."team_members"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."leads"
    ADD CONSTRAINT "leads_responsible_person_id_fkey" FOREIGN KEY ("responsible_person_id") REFERENCES "public"."team_members"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."material_price_imports"
    ADD CONSTRAINT "material_price_imports_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."material_price_imports"
    ADD CONSTRAINT "material_price_imports_supplier_location_id_fkey" FOREIGN KEY ("supplier_location_id") REFERENCES "public"."supplier_locations"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."material_supplier_prices"
    ADD CONSTRAINT "material_supplier_prices_material_catalog_id_fkey" FOREIGN KEY ("material_catalog_id") REFERENCES "public"."material_catalog"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."material_supplier_prices"
    ADD CONSTRAINT "material_supplier_prices_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."material_supplier_prices"
    ADD CONSTRAINT "material_supplier_prices_supplier_location_id_fkey" FOREIGN KEY ("supplier_location_id") REFERENCES "public"."supplier_locations"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."procurement_settings"
    ADD CONSTRAINT "procurement_settings_lowes_fallback_location_id_fkey" FOREIGN KEY ("lowes_fallback_location_id") REFERENCES "public"."supplier_locations"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."procurement_settings"
    ADD CONSTRAINT "procurement_settings_lowes_supplier_id_fkey" FOREIGN KEY ("lowes_supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."procurement_settings"
    ADD CONSTRAINT "procurement_settings_preferred_supplier_id_fkey" FOREIGN KEY ("preferred_supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."procurement_settings"
    ADD CONSTRAINT "procurement_settings_preferred_supplier_location_id_fkey" FOREIGN KEY ("preferred_supplier_location_id") REFERENCES "public"."supplier_locations"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."project_activity"
    ADD CONSTRAINT "project_activity_actor_app_user_id_fkey" FOREIGN KEY ("actor_app_user_id") REFERENCES "public"."app_users"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."project_activity"
    ADD CONSTRAINT "project_activity_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."project_activity"
    ADD CONSTRAINT "project_activity_subcontractor_id_fkey" FOREIGN KEY ("subcontractor_id") REFERENCES "public"."team_members"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."project_change_order_items"
    ADD CONSTRAINT "project_change_order_items_change_order_id_fkey" FOREIGN KEY ("change_order_id") REFERENCES "public"."project_change_orders"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."project_change_order_payments"
    ADD CONSTRAINT "project_change_order_payments_change_order_id_fkey" FOREIGN KEY ("change_order_id") REFERENCES "public"."project_change_orders"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."project_change_order_payments"
    ADD CONSTRAINT "project_change_order_payments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."app_users"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."project_change_order_response_items"
    ADD CONSTRAINT "project_change_order_response_items_response_id_fkey" FOREIGN KEY ("response_id") REFERENCES "public"."project_change_order_responses"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."project_change_order_responses"
    ADD CONSTRAINT "project_change_order_responses_change_order_id_fkey" FOREIGN KEY ("change_order_id") REFERENCES "public"."project_change_orders"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."project_change_order_responses"
    ADD CONSTRAINT "project_change_order_responses_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."project_change_orders"
    ADD CONSTRAINT "project_change_orders_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."app_users"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."project_change_orders"
    ADD CONSTRAINT "project_change_orders_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."project_change_orders"
    ADD CONSTRAINT "project_change_orders_response_reviewed_by_fkey" FOREIGN KEY ("response_reviewed_by") REFERENCES "public"."app_users"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."project_change_orders"
    ADD CONSTRAINT "project_change_orders_revised_from_change_order_id_fkey" FOREIGN KEY ("revised_from_change_order_id") REFERENCES "public"."project_change_orders"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."project_change_orders"
    ADD CONSTRAINT "project_change_orders_superseded_by_change_order_id_fkey" FOREIGN KEY ("superseded_by_change_order_id") REFERENCES "public"."project_change_orders"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."project_costs"
    ADD CONSTRAINT "project_costs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."project_inspection_areas"
    ADD CONSTRAINT "project_inspection_areas_inspection_id_fkey" FOREIGN KEY ("inspection_id") REFERENCES "public"."project_inspections"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."project_inspection_areas"
    ADD CONSTRAINT "project_inspection_areas_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."project_inspection_areas"
    ADD CONSTRAINT "project_inspection_areas_released_by_fkey" FOREIGN KEY ("released_by") REFERENCES "public"."app_users"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."project_inspection_corrections"
    ADD CONSTRAINT "project_inspection_corrections_assigned_app_user_id_fkey" FOREIGN KEY ("assigned_app_user_id") REFERENCES "public"."app_users"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."project_inspection_corrections"
    ADD CONSTRAINT "project_inspection_corrections_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."app_users"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."project_inspection_corrections"
    ADD CONSTRAINT "project_inspection_corrections_inspection_area_id_fkey" FOREIGN KEY ("inspection_area_id") REFERENCES "public"."project_inspection_areas"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."project_inspection_corrections"
    ADD CONSTRAINT "project_inspection_corrections_inspection_id_fkey" FOREIGN KEY ("inspection_id") REFERENCES "public"."project_inspections"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."project_inspection_corrections"
    ADD CONSTRAINT "project_inspection_corrections_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."project_inspection_corrections"
    ADD CONSTRAINT "project_inspection_corrections_reinspection_inspection_id_fkey" FOREIGN KEY ("reinspection_inspection_id") REFERENCES "public"."project_inspections"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."project_inspection_corrections"
    ADD CONSTRAINT "project_inspection_corrections_result_history_id_fkey" FOREIGN KEY ("result_history_id") REFERENCES "public"."project_inspection_result_history"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."project_inspection_corrections"
    ADD CONSTRAINT "project_inspection_corrections_verified_by_fkey" FOREIGN KEY ("verified_by") REFERENCES "public"."app_users"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."project_inspection_document_findings"
    ADD CONSTRAINT "project_inspection_document_findings_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "public"."project_inspection_documents"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."project_inspection_document_findings"
    ADD CONSTRAINT "project_inspection_document_findings_inspection_id_fkey" FOREIGN KEY ("inspection_id") REFERENCES "public"."project_inspections"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."project_inspection_document_findings"
    ADD CONSTRAINT "project_inspection_document_findings_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."project_inspection_document_findings"
    ADD CONSTRAINT "project_inspection_document_findings_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."app_users"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."project_inspection_documents"
    ADD CONSTRAINT "project_inspection_documents_applied_by_fkey" FOREIGN KEY ("applied_by") REFERENCES "public"."app_users"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."project_inspection_documents"
    ADD CONSTRAINT "project_inspection_documents_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."app_users"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."project_inspection_documents"
    ADD CONSTRAINT "project_inspection_documents_inspection_id_fkey" FOREIGN KEY ("inspection_id") REFERENCES "public"."project_inspections"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."project_inspection_documents"
    ADD CONSTRAINT "project_inspection_documents_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."project_inspection_documents"
    ADD CONSTRAINT "project_inspection_documents_result_history_id_fkey" FOREIGN KEY ("result_history_id") REFERENCES "public"."project_inspection_result_history"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."project_inspection_documents"
    ADD CONSTRAINT "project_inspection_documents_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."app_users"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."project_inspection_requirements"
    ADD CONSTRAINT "project_inspection_requirements_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."app_users"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."project_inspection_requirements"
    ADD CONSTRAINT "project_inspection_requirements_inspection_settings_id_fkey" FOREIGN KEY ("inspection_settings_id") REFERENCES "public"."project_inspection_settings"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."project_inspection_requirements"
    ADD CONSTRAINT "project_inspection_requirements_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."project_inspection_requirements"
    ADD CONSTRAINT "project_inspection_requirements_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."app_users"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."project_inspection_research_findings"
    ADD CONSTRAINT "project_inspection_research_finding_applied_requirement_id_fkey" FOREIGN KEY ("applied_requirement_id") REFERENCES "public"."project_inspection_requirements"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."project_inspection_research_findings"
    ADD CONSTRAINT "project_inspection_research_findings_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."project_inspection_research_findings"
    ADD CONSTRAINT "project_inspection_research_findings_research_run_id_fkey" FOREIGN KEY ("research_run_id") REFERENCES "public"."project_inspection_research_runs"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."project_inspection_research_findings"
    ADD CONSTRAINT "project_inspection_research_findings_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."app_users"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."project_inspection_research_findings"
    ADD CONSTRAINT "project_inspection_research_findings_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "public"."project_inspection_research_sources"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."project_inspection_research_runs"
    ADD CONSTRAINT "project_inspection_research_runs_applied_by_fkey" FOREIGN KEY ("applied_by") REFERENCES "public"."app_users"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."project_inspection_research_runs"
    ADD CONSTRAINT "project_inspection_research_runs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."app_users"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."project_inspection_research_runs"
    ADD CONSTRAINT "project_inspection_research_runs_inspection_settings_id_fkey" FOREIGN KEY ("inspection_settings_id") REFERENCES "public"."project_inspection_settings"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."project_inspection_research_runs"
    ADD CONSTRAINT "project_inspection_research_runs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."project_inspection_research_runs"
    ADD CONSTRAINT "project_inspection_research_runs_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."app_users"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."project_inspection_research_sources"
    ADD CONSTRAINT "project_inspection_research_sources_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."project_inspection_research_sources"
    ADD CONSTRAINT "project_inspection_research_sources_research_run_id_fkey" FOREIGN KEY ("research_run_id") REFERENCES "public"."project_inspection_research_runs"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."project_inspection_result_area_history"
    ADD CONSTRAINT "project_inspection_result_area_history_inspection_id_fkey" FOREIGN KEY ("inspection_id") REFERENCES "public"."project_inspections"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."project_inspection_result_area_history"
    ADD CONSTRAINT "project_inspection_result_area_history_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."project_inspection_result_area_history"
    ADD CONSTRAINT "project_inspection_result_area_history_result_history_id_fkey" FOREIGN KEY ("result_history_id") REFERENCES "public"."project_inspection_result_history"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."project_inspection_result_history"
    ADD CONSTRAINT "project_inspection_result_history_contractor_confirmed_by_fkey" FOREIGN KEY ("contractor_confirmed_by") REFERENCES "public"."app_users"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."project_inspection_result_history"
    ADD CONSTRAINT "project_inspection_result_history_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."app_users"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."project_inspection_result_history"
    ADD CONSTRAINT "project_inspection_result_history_inspection_id_fkey" FOREIGN KEY ("inspection_id") REFERENCES "public"."project_inspections"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."project_inspection_result_history"
    ADD CONSTRAINT "project_inspection_result_history_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."project_inspection_settings"
    ADD CONSTRAINT "project_inspection_settings_contractor_verified_by_fkey" FOREIGN KEY ("contractor_verified_by") REFERENCES "public"."app_users"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."project_inspection_settings"
    ADD CONSTRAINT "project_inspection_settings_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."project_inspection_settings"
    ADD CONSTRAINT "project_inspection_settings_researched_by_fkey" FOREIGN KEY ("researched_by") REFERENCES "public"."app_users"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."project_inspection_settings"
    ADD CONSTRAINT "project_inspection_settings_workflow_activated_by_fkey" FOREIGN KEY ("workflow_activated_by") REFERENCES "public"."app_users"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."project_inspection_task_dependencies"
    ADD CONSTRAINT "project_inspection_task_dependencies_inspection_area_id_fkey" FOREIGN KEY ("inspection_area_id") REFERENCES "public"."project_inspection_areas"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."project_inspection_task_dependencies"
    ADD CONSTRAINT "project_inspection_task_dependencies_inspection_id_fkey" FOREIGN KEY ("inspection_id") REFERENCES "public"."project_inspections"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."project_inspection_task_dependencies"
    ADD CONSTRAINT "project_inspection_task_dependencies_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."project_inspection_task_dependencies"
    ADD CONSTRAINT "project_inspection_task_dependencies_released_by_fkey" FOREIGN KEY ("released_by") REFERENCES "public"."app_users"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."project_inspections"
    ADD CONSTRAINT "project_inspections_contractor_result_verified_by_fkey" FOREIGN KEY ("contractor_result_verified_by") REFERENCES "public"."app_users"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."project_inspections"
    ADD CONSTRAINT "project_inspections_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."app_users"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."project_inspections"
    ADD CONSTRAINT "project_inspections_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."project_inspections"
    ADD CONSTRAINT "project_inspections_requirement_id_fkey" FOREIGN KEY ("requirement_id") REFERENCES "public"."project_inspection_requirements"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."project_material_phases"
    ADD CONSTRAINT "project_material_phases_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."project_message_threads"
    ADD CONSTRAINT "project_message_threads_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."project_message_threads"
    ADD CONSTRAINT "project_message_threads_subcontractor_id_fkey" FOREIGN KEY ("subcontractor_id") REFERENCES "public"."team_members"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."project_messages"
    ADD CONSTRAINT "project_messages_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."project_messages"
    ADD CONSTRAINT "project_messages_sender_app_user_id_fkey" FOREIGN KEY ("sender_app_user_id") REFERENCES "public"."app_users"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."project_messages"
    ADD CONSTRAINT "project_messages_subcontractor_id_fkey" FOREIGN KEY ("subcontractor_id") REFERENCES "public"."team_members"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."project_messages"
    ADD CONSTRAINT "project_messages_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "public"."project_message_threads"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."project_procurement_settings"
    ADD CONSTRAINT "project_procurement_settings_preferred_supplier_id_fkey" FOREIGN KEY ("preferred_supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."project_procurement_settings"
    ADD CONSTRAINT "project_procurement_settings_preferred_supplier_location_i_fkey" FOREIGN KEY ("preferred_supplier_location_id") REFERENCES "public"."supplier_locations"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."project_procurement_settings"
    ADD CONSTRAINT "project_procurement_settings_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."project_schedule_readiness"
    ADD CONSTRAINT "project_schedule_readiness_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_project_manager_id_fkey" FOREIGN KEY ("project_manager_id") REFERENCES "public"."team_members"("id") ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."subcontractor_material_issues"
    ADD CONSTRAINT "subcontractor_material_issues_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "public"."subcontractor_material_reviews"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."subcontractor_material_issues"
    ADD CONSTRAINT "subcontractor_material_issues_review_item_id_fkey" FOREIGN KEY ("review_item_id") REFERENCES "public"."subcontractor_material_review_items"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."subcontractor_material_review_items"
    ADD CONSTRAINT "subcontractor_material_review_items_material_catalog_id_fkey" FOREIGN KEY ("material_catalog_id") REFERENCES "public"."material_catalog"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."subcontractor_material_review_items"
    ADD CONSTRAINT "subcontractor_material_review_items_material_phase_id_fkey" FOREIGN KEY ("material_phase_id") REFERENCES "public"."project_material_phases"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."subcontractor_material_review_items"
    ADD CONSTRAINT "subcontractor_material_review_items_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "public"."subcontractor_material_reviews"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."subcontractor_material_reviews"
    ADD CONSTRAINT "subcontractor_material_reviews_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."app_users"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."subcontractor_material_reviews"
    ADD CONSTRAINT "subcontractor_material_reviews_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."subcontractor_material_reviews"
    ADD CONSTRAINT "subcontractor_material_reviews_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."app_users"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."subcontractor_material_reviews"
    ADD CONSTRAINT "subcontractor_material_reviews_schedule_request_id_fkey" FOREIGN KEY ("schedule_request_id") REFERENCES "public"."subcontractor_schedule_requests"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."subcontractor_material_reviews"
    ADD CONSTRAINT "subcontractor_material_reviews_subcontractor_id_fkey" FOREIGN KEY ("subcontractor_id") REFERENCES "public"."team_members"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."subcontractor_schedule_requests"
    ADD CONSTRAINT "subcontractor_schedule_requests_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."app_users"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."subcontractor_schedule_requests"
    ADD CONSTRAINT "subcontractor_schedule_requests_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."subcontractor_schedule_requests"
    ADD CONSTRAINT "subcontractor_schedule_requests_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."app_users"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."subcontractor_schedule_requests"
    ADD CONSTRAINT "subcontractor_schedule_requests_subcontractor_id_fkey" FOREIGN KEY ("subcontractor_id") REFERENCES "public"."team_members"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."supplier_locations"
    ADD CONSTRAINT "supplier_locations_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."task_types"
    ADD CONSTRAINT "task_types_default_assignee_id_fkey" FOREIGN KEY ("default_assignee_id") REFERENCES "public"."team_members"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "public"."team_members"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_recurrence_parent_id_fkey" FOREIGN KEY ("recurrence_parent_id") REFERENCES "public"."tasks"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_task_type_id_fkey" FOREIGN KEY ("task_type_id") REFERENCES "public"."task_types"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."team_members"
    ADD CONSTRAINT "team_members_auth_user_id_fkey" FOREIGN KEY ("auth_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;
CREATE POLICY "Allow public customer deletes" ON "public"."customers" FOR DELETE USING (true);
CREATE POLICY "Allow public customer inserts" ON "public"."customers" FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public customer reads" ON "public"."customers" FOR SELECT USING (true);
CREATE POLICY "Allow public customer updates" ON "public"."customers" FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete leads" ON "public"."leads" FOR DELETE TO "authenticated" USING (true);
CREATE POLICY "Authenticated users can update leads" ON "public"."leads" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can view leads" ON "public"."leads" FOR SELECT TO "authenticated" USING (true);
CREATE POLICY "Public can submit leads" ON "public"."leads" FOR INSERT TO "anon" WITH CHECK (true);
ALTER TABLE "public"."app_users" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated can read leads" ON "public"."leads" FOR SELECT TO "authenticated" USING (true);
CREATE POLICY "authenticated can update leads" ON "public"."leads" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);
ALTER TABLE "public"."change_order_vendor_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."change_order_vendor_responses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."company_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."customers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."email_drafts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."estimate_line_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."estimate_material_price_snapshots" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."estimate_options" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."estimates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."feature_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."labor_catalog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."lead_activities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."lead_tasks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."leads" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."material_catalog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."material_price_imports" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."material_supplier_prices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."pricing_rules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."procurement_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."project_activity" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."project_change_order_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."project_change_order_payments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."project_change_order_response_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."project_change_order_responses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."project_change_orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."project_costs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."project_inspection_areas" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."project_inspection_corrections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."project_inspection_document_findings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."project_inspection_documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."project_inspection_requirements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."project_inspection_research_findings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."project_inspection_research_runs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."project_inspection_research_sources" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."project_inspection_result_area_history" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."project_inspection_result_history" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."project_inspection_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."project_inspection_task_dependencies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."project_inspections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."project_material_phases" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."project_message_threads" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."project_messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."project_procurement_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."project_schedule_readiness" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."projects" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public can submit leads" ON "public"."leads" FOR INSERT TO "anon" WITH CHECK (true);
ALTER TABLE "public"."push_subscriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."role_permission_defaults" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."subcontractor_material_issues" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."subcontractor_material_review_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."subcontractor_material_reviews" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."subcontractor_schedule_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."supplier_locations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."suppliers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."task_types" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."tasks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."team_members" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users manage own subscriptions" ON "public"."push_subscriptions" TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));
GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";
REVOKE ALL ON FUNCTION "public"."activate_project_inspection_workflow"("requested_project_id" "uuid", "requested_auth_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."activate_project_inspection_workflow"("requested_project_id" "uuid", "requested_auth_user_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."add_project_activity_note"("requested_project_id" "uuid", "requested_auth_user_id" "uuid", "requested_title" "text", "requested_description" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."add_project_activity_note"("requested_project_id" "uuid", "requested_auth_user_id" "uuid", "requested_title" "text", "requested_description" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."add_project_activity_note"("requested_project_id" "uuid", "requested_auth_user_id" "uuid", "requested_title" "text", "requested_description" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."add_workdays"("starting_date" "date", "workdays_to_add" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."add_workdays"("starting_date" "date", "workdays_to_add" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."add_workdays"("starting_date" "date", "workdays_to_add" integer) TO "service_role";
REVOKE ALL ON FUNCTION "public"."apply_installer_schedule_response"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."apply_installer_schedule_response"() TO "service_role";
REVOKE ALL ON FUNCTION "public"."apply_project_inspection_research"("requested_research_run_id" "uuid", "requested_project_id" "uuid", "requested_auth_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."apply_project_inspection_research"("requested_research_run_id" "uuid", "requested_project_id" "uuid", "requested_auth_user_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."archive_change_order_response"("requested_change_order_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."archive_change_order_response"("requested_change_order_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."archive_change_order_response"("requested_change_order_id" "uuid") TO "service_role";
REVOKE ALL ON FUNCTION "public"."assign_project_change_order_number"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."assign_project_change_order_number"() TO "service_role";
REVOKE ALL ON FUNCTION "public"."assign_project_inspection_correction_number"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."complete_project_inspection_document_extraction"("requested_document_id" "uuid", "requested_project_id" "uuid", "requested_extracted_text" "text", "requested_extracted_data" "jsonb", "requested_confidence_level" "text", "requested_confidence_notes" "text", "requested_findings" "jsonb", "requested_auth_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."complete_project_inspection_document_extraction"("requested_document_id" "uuid", "requested_project_id" "uuid", "requested_extracted_text" "text", "requested_extracted_data" "jsonb", "requested_confidence_level" "text", "requested_confidence_notes" "text", "requested_findings" "jsonb", "requested_auth_user_id" "uuid") TO "service_role";
REVOKE ALL ON FUNCTION "public"."confirm_project_inspection_result"("requested_inspection_id" "uuid", "requested_result_history_id" "uuid", "requested_confirmed_result_status" "text", "requested_confirmation_notes" "text", "requested_auth_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."confirm_project_inspection_result"("requested_inspection_id" "uuid", "requested_result_history_id" "uuid", "requested_confirmed_result_status" "text", "requested_confirmation_notes" "text", "requested_auth_user_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."create_change_order_revision"("requested_source_change_order_id" "uuid", "requested_auth_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."create_change_order_revision"("requested_source_change_order_id" "uuid", "requested_auth_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_change_order_revision"("requested_source_change_order_id" "uuid", "requested_auth_user_id" "uuid") TO "service_role";
REVOKE ALL ON FUNCTION "public"."create_project_inspection_correction"("requested_project_id" "uuid", "requested_inspection_id" "uuid", "requested_result_history_id" "uuid", "requested_inspection_area_id" "uuid", "requested_title" "text", "requested_description" "text", "requested_priority" "text", "requested_due_date" "date", "requested_reinspection_required" boolean, "requested_source_type" "text", "requested_source_excerpt" "text", "requested_auth_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_project_inspection_correction"("requested_project_id" "uuid", "requested_inspection_id" "uuid", "requested_result_history_id" "uuid", "requested_inspection_area_id" "uuid", "requested_title" "text", "requested_description" "text", "requested_priority" "text", "requested_due_date" "date", "requested_reinspection_required" boolean, "requested_source_type" "text", "requested_source_excerpt" "text", "requested_auth_user_id" "uuid") TO "service_role";
REVOKE ALL ON FUNCTION "public"."create_project_inspection_document"("requested_project_id" "uuid", "requested_inspection_id" "uuid", "requested_result_history_id" "uuid", "requested_document_type" "text", "requested_file_name" "text", "requested_file_url" "text", "requested_storage_bucket" "text", "requested_storage_path" "text", "requested_mime_type" "text", "requested_file_size_bytes" bigint, "requested_document_date" "date", "requested_source_name" "text", "requested_source_reference" "text", "requested_notes" "text", "requested_auth_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_project_inspection_document"("requested_project_id" "uuid", "requested_inspection_id" "uuid", "requested_result_history_id" "uuid", "requested_document_type" "text", "requested_file_name" "text", "requested_file_url" "text", "requested_storage_bucket" "text", "requested_storage_path" "text", "requested_mime_type" "text", "requested_file_size_bytes" bigint, "requested_document_date" "date", "requested_source_name" "text", "requested_source_reference" "text", "requested_notes" "text", "requested_auth_user_id" "uuid") TO "service_role";
REVOKE ALL ON FUNCTION "public"."create_project_inspection_reinspection"("requested_correction_id" "uuid", "requested_project_id" "uuid", "requested_scheduled_start_at" timestamp with time zone, "requested_scheduled_end_at" timestamp with time zone, "requested_inspector_name" "text", "requested_inspector_department" "text", "requested_inspection_number" "text", "requested_auth_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_project_inspection_reinspection"("requested_correction_id" "uuid", "requested_project_id" "uuid", "requested_scheduled_start_at" timestamp with time zone, "requested_scheduled_end_at" timestamp with time zone, "requested_inspector_name" "text", "requested_inspector_department" "text", "requested_inspection_number" "text", "requested_auth_user_id" "uuid") TO "service_role";
REVOKE ALL ON FUNCTION "public"."create_project_inspection_research_run"("requested_project_id" "uuid", "requested_address" "text", "requested_city" "text", "requested_county" "text", "requested_state_code" "text", "requested_postal_code" "text", "requested_municipality" "text", "requested_authority_name" "text", "requested_authority_type" "text", "requested_project_type" "text", "requested_permit_type" "text", "requested_scope_summary" "text", "requested_auth_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_project_inspection_research_run"("requested_project_id" "uuid", "requested_address" "text", "requested_city" "text", "requested_county" "text", "requested_state_code" "text", "requested_postal_code" "text", "requested_municipality" "text", "requested_authority_name" "text", "requested_authority_type" "text", "requested_project_type" "text", "requested_permit_type" "text", "requested_scope_summary" "text", "requested_auth_user_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."expire_change_order_approvals"() TO "anon";
GRANT ALL ON FUNCTION "public"."expire_change_order_approvals"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."expire_change_order_approvals"() TO "service_role";
REVOKE ALL ON FUNCTION "public"."fail_project_inspection_document_extraction"("requested_document_id" "uuid", "requested_project_id" "uuid", "requested_error_message" "text", "requested_auth_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fail_project_inspection_document_extraction"("requested_document_id" "uuid", "requested_project_id" "uuid", "requested_error_message" "text", "requested_auth_user_id" "uuid") TO "service_role";
REVOKE ALL ON FUNCTION "public"."get_change_order_by_token"("requested_token" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_change_order_by_token"("requested_token" "uuid") TO "service_role";
REVOKE ALL ON FUNCTION "public"."get_change_order_vendor_request_by_token"("requested_token" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_change_order_vendor_request_by_token"("requested_token" "uuid") TO "service_role";
REVOKE ALL ON FUNCTION "public"."get_company_change_order_billing_summary"("requested_auth_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_company_change_order_billing_summary"("requested_auth_user_id" "uuid") TO "service_role";
REVOKE ALL ON FUNCTION "public"."get_company_change_order_receivables"("requested_auth_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_company_change_order_receivables"("requested_auth_user_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."get_company_change_order_summary"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_company_change_order_summary"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_company_change_order_summary"() TO "service_role";
GRANT ALL ON FUNCTION "public"."get_effective_feature_map"("requested_scope_type" "text", "requested_scope_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_effective_feature_map"("requested_scope_type" "text", "requested_scope_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_effective_feature_map"("requested_scope_type" "text", "requested_scope_id" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."get_effective_user_access"("requested_auth_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_effective_user_access"("requested_auth_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_effective_user_access"("requested_auth_user_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."get_feature_settings"("requested_scope_type" "text", "requested_scope_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_feature_settings"("requested_scope_type" "text", "requested_scope_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_feature_settings"("requested_scope_type" "text", "requested_scope_id" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."get_material_review_by_token"("requested_token" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_material_review_by_token"("requested_token" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."get_project_change_order_summary"("requested_project_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_project_change_order_summary"("requested_project_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_project_change_order_summary"("requested_project_id" "uuid") TO "service_role";
REVOKE ALL ON FUNCTION "public"."get_project_inspection_correction_summary"("requested_project_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_project_inspection_correction_summary"("requested_project_id" "uuid") TO "service_role";
REVOKE ALL ON FUNCTION "public"."get_project_inspection_dependencies"("requested_project_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_project_inspection_dependencies"("requested_project_id" "uuid") TO "service_role";
REVOKE ALL ON FUNCTION "public"."get_project_inspection_summary"("requested_project_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_project_inspection_summary"("requested_project_id" "uuid") TO "service_role";
REVOKE ALL ON FUNCTION "public"."get_schedule_request_by_token"("requested_token" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_schedule_request_by_token"("requested_token" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."initialize_project_material_phases"("requested_project_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."initialize_project_material_phases"("requested_project_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."initialize_project_material_phases"("requested_project_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."is_feature_enabled"("requested_feature_key" "text", "requested_scope_type" "text", "requested_scope_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."is_feature_enabled"("requested_feature_key" "text", "requested_scope_type" "text", "requested_scope_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_feature_enabled"("requested_feature_key" "text", "requested_scope_type" "text", "requested_scope_id" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."is_project_task_blocked_by_inspection"("requested_project_id" "uuid", "requested_task_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_project_task_blocked_by_inspection"("requested_project_id" "uuid", "requested_task_id" "uuid") TO "service_role";
REVOKE ALL ON FUNCTION "public"."log_change_order_activity"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."log_change_order_activity"() TO "service_role";
REVOKE ALL ON FUNCTION "public"."log_change_order_approval_activity"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."log_change_order_approval_activity"() TO "service_role";
REVOKE ALL ON FUNCTION "public"."log_change_order_payment_activity"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."log_change_order_payment_activity"() TO "service_role";
REVOKE ALL ON FUNCTION "public"."log_change_order_vendor_request_activity"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."log_change_order_vendor_request_activity"() TO "service_role";
REVOKE ALL ON FUNCTION "public"."log_material_issue_activity"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."log_material_issue_activity"() TO "service_role";
REVOKE ALL ON FUNCTION "public"."log_material_review_activity"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."log_material_review_activity"() TO "service_role";
REVOKE ALL ON FUNCTION "public"."log_project_message_activity"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."log_project_message_activity"() TO "service_role";
REVOKE ALL ON FUNCTION "public"."log_project_update_activity"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."log_project_update_activity"() TO "service_role";
REVOKE ALL ON FUNCTION "public"."log_schedule_request_activity"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."log_schedule_request_activity"() TO "service_role";
GRANT ALL ON FUNCTION "public"."mark_change_order_response_reviewed"("requested_change_order_id" "uuid", "requested_auth_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."mark_change_order_response_reviewed"("requested_change_order_id" "uuid", "requested_auth_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_change_order_response_reviewed"("requested_change_order_id" "uuid", "requested_auth_user_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."mark_material_review_reviewed"("requested_material_review_id" "uuid", "requested_auth_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."mark_material_review_reviewed"("requested_material_review_id" "uuid", "requested_auth_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_material_review_reviewed"("requested_material_review_id" "uuid", "requested_auth_user_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."mark_schedule_request_reviewed"("requested_schedule_request_id" "uuid", "requested_auth_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."mark_schedule_request_reviewed"("requested_schedule_request_id" "uuid", "requested_auth_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_schedule_request_reviewed"("requested_schedule_request_id" "uuid", "requested_auth_user_id" "uuid") TO "service_role";
REVOKE ALL ON FUNCTION "public"."prevent_locked_change_order_item_changes"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."prevent_locked_change_order_item_changes"() TO "service_role";
REVOKE ALL ON FUNCTION "public"."prevent_locked_change_order_scope_changes"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."prevent_locked_change_order_scope_changes"() TO "service_role";
REVOKE ALL ON FUNCTION "public"."prevent_schedule_response_overwrite"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."prevent_schedule_response_overwrite"() TO "service_role";
GRANT ALL ON FUNCTION "public"."recalculate_change_order_payment_status"("requested_change_order_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."recalculate_change_order_payment_status"("requested_change_order_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."recalculate_change_order_payment_status"("requested_change_order_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."recalculate_change_order_totals"("requested_change_order_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."recalculate_change_order_totals"("requested_change_order_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."recalculate_change_order_totals"("requested_change_order_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."recalculate_project_schedule"("requested_project_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."recalculate_project_schedule"("requested_project_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."recalculate_project_schedule"("requested_project_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."record_change_order_approval_reminder"("requested_change_order_id" "uuid", "requested_auth_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."record_change_order_approval_reminder"("requested_change_order_id" "uuid", "requested_auth_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_change_order_approval_reminder"("requested_change_order_id" "uuid", "requested_auth_user_id" "uuid") TO "service_role";
REVOKE ALL ON FUNCTION "public"."record_project_inspection_result"("requested_inspection_id" "uuid", "requested_result_status" "text", "requested_result_summary" "text", "requested_correction_summary" "text", "requested_inspector_name" "text", "requested_inspector_department" "text", "requested_inspection_number" "text", "requested_completed_at" timestamp with time zone, "requested_reinspection_required" boolean, "requested_reinspection_due_date" "date", "requested_result_document_urls" "jsonb", "requested_result_photo_urls" "jsonb", "requested_extracted_result" "jsonb", "requested_extraction_status" "text", "requested_areas" "jsonb", "requested_auth_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_project_inspection_result"("requested_inspection_id" "uuid", "requested_result_status" "text", "requested_result_summary" "text", "requested_correction_summary" "text", "requested_inspector_name" "text", "requested_inspector_department" "text", "requested_inspection_number" "text", "requested_completed_at" timestamp with time zone, "requested_reinspection_required" boolean, "requested_reinspection_due_date" "date", "requested_result_document_urls" "jsonb", "requested_result_photo_urls" "jsonb", "requested_extracted_result" "jsonb", "requested_extraction_status" "text", "requested_areas" "jsonb", "requested_auth_user_id" "uuid") TO "service_role";
REVOKE ALL ON FUNCTION "public"."refresh_project_inspection_dependencies"("requested_project_id" "uuid", "requested_auth_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."refresh_project_inspection_dependencies"("requested_project_id" "uuid", "requested_auth_user_id" "uuid") TO "service_role";
REVOKE ALL ON FUNCTION "public"."remove_project_inspection_task_dependency"("requested_dependency_id" "uuid", "requested_project_id" "uuid", "requested_reason" "text", "requested_auth_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."remove_project_inspection_task_dependency"("requested_dependency_id" "uuid", "requested_project_id" "uuid", "requested_reason" "text", "requested_auth_user_id" "uuid") TO "service_role";
REVOKE ALL ON FUNCTION "public"."reopen_project_inspection_checklist"("requested_project_id" "uuid", "requested_reason" "text", "requested_auth_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reopen_project_inspection_checklist"("requested_project_id" "uuid", "requested_reason" "text", "requested_auth_user_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."require_feature_enabled"("requested_feature_key" "text", "requested_scope_type" "text", "requested_scope_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."require_feature_enabled"("requested_feature_key" "text", "requested_scope_type" "text", "requested_scope_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."require_feature_enabled"("requested_feature_key" "text", "requested_scope_type" "text", "requested_scope_id" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."review_project_inspection_document_finding"("requested_finding_id" "uuid", "requested_project_id" "uuid", "requested_review_status" "text", "requested_review_notes" "text", "requested_modified_value" "text", "requested_modified_data" "jsonb", "requested_auth_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."review_project_inspection_document_finding"("requested_finding_id" "uuid", "requested_project_id" "uuid", "requested_review_status" "text", "requested_review_notes" "text", "requested_modified_value" "text", "requested_modified_data" "jsonb", "requested_auth_user_id" "uuid") TO "service_role";
REVOKE ALL ON FUNCTION "public"."review_project_inspection_research_finding"("requested_finding_id" "uuid", "requested_project_id" "uuid", "requested_review_status" "text", "requested_review_notes" "text", "requested_modified_title" "text", "requested_modified_description" "text", "requested_modified_requirement_status" "text", "requested_auth_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."review_project_inspection_research_finding"("requested_finding_id" "uuid", "requested_project_id" "uuid", "requested_review_status" "text", "requested_review_notes" "text", "requested_modified_title" "text", "requested_modified_description" "text", "requested_modified_requirement_status" "text", "requested_auth_user_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."revoke_change_order_approval"("requested_change_order_id" "uuid", "requested_auth_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."revoke_change_order_approval"("requested_change_order_id" "uuid", "requested_auth_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."revoke_change_order_approval"("requested_change_order_id" "uuid", "requested_auth_user_id" "uuid") TO "service_role";
REVOKE ALL ON FUNCTION "public"."set_change_order_invoice_due_date_20260801"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_change_order_invoice_due_date_20260801"() TO "service_role";
REVOKE ALL ON FUNCTION "public"."set_change_order_item_updated_at"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_change_order_item_updated_at"() TO "service_role";
REVOKE ALL ON FUNCTION "public"."set_crm_updated_at"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_crm_updated_at"() TO "service_role";
REVOKE ALL ON FUNCTION "public"."set_customer_updated_at"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_customer_updated_at"() TO "service_role";
GRANT ALL ON FUNCTION "public"."set_feature_setting"("requested_scope_type" "text", "requested_scope_id" "text", "requested_feature_key" "text", "requested_is_enabled" boolean, "requested_auth_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."set_feature_setting"("requested_scope_type" "text", "requested_scope_id" "text", "requested_feature_key" "text", "requested_is_enabled" boolean, "requested_auth_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_feature_setting"("requested_scope_type" "text", "requested_scope_id" "text", "requested_feature_key" "text", "requested_is_enabled" boolean, "requested_auth_user_id" "uuid") TO "service_role";
REVOKE ALL ON FUNCTION "public"."set_inspection_research_updated_at"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."set_project_costs_updated_at"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_project_costs_updated_at"() TO "service_role";
REVOKE ALL ON FUNCTION "public"."set_project_inspection_correction_updated_at"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."set_project_inspection_document_updated_at"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."set_project_inspection_task_dependency"("requested_project_id" "uuid", "requested_inspection_id" "uuid", "requested_inspection_area_id" "uuid", "requested_task_id" "uuid", "requested_dependency_type" "text", "requested_auth_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_project_inspection_task_dependency"("requested_project_id" "uuid", "requested_inspection_id" "uuid", "requested_inspection_area_id" "uuid", "requested_task_id" "uuid", "requested_dependency_type" "text", "requested_auth_user_id" "uuid") TO "service_role";
REVOKE ALL ON FUNCTION "public"."set_updated_at"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";
GRANT ALL ON FUNCTION "public"."snapshot_change_order_response_items"("requested_response_id" "uuid", "requested_change_order_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."snapshot_change_order_response_items"("requested_response_id" "uuid", "requested_change_order_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."snapshot_change_order_response_items"("requested_response_id" "uuid", "requested_change_order_id" "uuid") TO "service_role";
REVOKE ALL ON FUNCTION "public"."start_project_inspection_document_extraction"("requested_document_id" "uuid", "requested_project_id" "uuid", "requested_auth_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."start_project_inspection_document_extraction"("requested_document_id" "uuid", "requested_project_id" "uuid", "requested_auth_user_id" "uuid") TO "service_role";
REVOKE ALL ON FUNCTION "public"."submit_change_order_response"("requested_token" "uuid", "requested_response" "text", "requested_customer_name" "text", "requested_notes" "text", "requested_ip" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."submit_change_order_response"("requested_token" "uuid", "requested_response" "text", "requested_customer_name" "text", "requested_notes" "text", "requested_ip" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."submit_change_order_response_v2"("requested_token" "uuid", "requested_response" "text", "requested_customer_name" "text", "requested_notes" "text", "requested_ip" "text", "requested_user_agent" "text", "requested_acknowledged_terms" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."submit_change_order_response_v2"("requested_token" "uuid", "requested_response" "text", "requested_customer_name" "text", "requested_notes" "text", "requested_ip" "text", "requested_user_agent" "text", "requested_acknowledged_terms" boolean) TO "service_role";
REVOKE ALL ON FUNCTION "public"."submit_change_order_vendor_response"("requested_token" "uuid", "requested_response_status" "text", "requested_responder_name" "text", "requested_responder_email" "text", "requested_responder_phone" "text", "requested_quoted_cost" numeric, "requested_earliest_start_date" "date", "requested_expected_delivery_date" "date", "requested_duration_days" integer, "requested_lead_time_days" integer, "requested_quote_expiration_date" "date", "requested_notes" "text", "requested_exclusions" "text", "requested_attachment_urls" "jsonb", "requested_ip" "text", "requested_user_agent" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."submit_change_order_vendor_response"("requested_token" "uuid", "requested_response_status" "text", "requested_responder_name" "text", "requested_responder_email" "text", "requested_responder_phone" "text", "requested_quoted_cost" numeric, "requested_earliest_start_date" "date", "requested_expected_delivery_date" "date", "requested_duration_days" integer, "requested_lead_time_days" integer, "requested_quote_expiration_date" "date", "requested_notes" "text", "requested_exclusions" "text", "requested_attachment_urls" "jsonb", "requested_ip" "text", "requested_user_agent" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."submit_schedule_request_by_token"("requested_token" "uuid", "requested_language" "text", "requested_earliest_demo_start" "date", "requested_earliest_construction_start" "date", "requested_demo_duration_days" integer, "requested_total_duration_days" integer, "requested_notes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."submit_schedule_request_by_token"("requested_token" "uuid", "requested_language" "text", "requested_earliest_demo_start" "date", "requested_earliest_construction_start" "date", "requested_demo_duration_days" integer, "requested_total_duration_days" integer, "requested_notes" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."sync_change_order_invoice_status"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sync_change_order_invoice_status"() TO "service_role";
REVOKE ALL ON FUNCTION "public"."sync_change_order_item_totals"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sync_change_order_item_totals"() TO "service_role";
REVOKE ALL ON FUNCTION "public"."sync_change_order_payment_status"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sync_change_order_payment_status"() TO "service_role";
GRANT ALL ON FUNCTION "public"."sync_existing_installer_schedule_responses"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_existing_installer_schedule_responses"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_existing_installer_schedule_responses"() TO "service_role";
REVOKE ALL ON FUNCTION "public"."touch_project_message_thread"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."touch_project_message_thread"() TO "service_role";
REVOKE ALL ON FUNCTION "public"."update_project_inspection_correction"("requested_correction_id" "uuid", "requested_project_id" "uuid", "requested_action" "text", "requested_assigned_app_user_id" "uuid", "requested_assigned_subcontractor_id" "uuid", "requested_assigned_name" "text", "requested_assigned_company" "text", "requested_assigned_email" "text", "requested_assigned_phone" "text", "requested_due_date" "date", "requested_completion_notes" "text", "requested_completion_photo_urls" "jsonb", "requested_completion_document_urls" "jsonb", "requested_verification_notes" "text", "requested_auth_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_project_inspection_correction"("requested_correction_id" "uuid", "requested_project_id" "uuid", "requested_action" "text", "requested_assigned_app_user_id" "uuid", "requested_assigned_subcontractor_id" "uuid", "requested_assigned_name" "text", "requested_assigned_company" "text", "requested_assigned_email" "text", "requested_assigned_phone" "text", "requested_due_date" "date", "requested_completion_notes" "text", "requested_completion_photo_urls" "jsonb", "requested_completion_document_urls" "jsonb", "requested_verification_notes" "text", "requested_auth_user_id" "uuid") TO "service_role";
REVOKE ALL ON FUNCTION "public"."validate_change_order_supersession"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."validate_change_order_supersession"() TO "service_role";
REVOKE ALL ON FUNCTION "public"."verify_project_inspection_checklist"("requested_project_id" "uuid", "requested_verification_text" "text", "requested_auth_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."verify_project_inspection_checklist"("requested_project_id" "uuid", "requested_verification_text" "text", "requested_auth_user_id" "uuid") TO "service_role";
GRANT ALL ON TABLE "public"."project_change_orders" TO "anon";
GRANT ALL ON TABLE "public"."project_change_orders" TO "authenticated";
GRANT ALL ON TABLE "public"."project_change_orders" TO "service_role";
GRANT ALL ON TABLE "public"."active_change_order_billing" TO "anon";
GRANT ALL ON TABLE "public"."active_change_order_billing" TO "authenticated";
GRANT ALL ON TABLE "public"."active_change_order_billing" TO "service_role";
GRANT ALL ON TABLE "public"."active_project_change_orders" TO "anon";
GRANT ALL ON TABLE "public"."active_project_change_orders" TO "authenticated";
GRANT ALL ON TABLE "public"."active_project_change_orders" TO "service_role";
GRANT ALL ON TABLE "public"."app_users" TO "anon";
GRANT ALL ON TABLE "public"."app_users" TO "authenticated";
GRANT ALL ON TABLE "public"."app_users" TO "service_role";
GRANT ALL ON TABLE "public"."change_order_vendor_requests" TO "anon";
GRANT ALL ON TABLE "public"."change_order_vendor_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."change_order_vendor_requests" TO "service_role";
GRANT ALL ON TABLE "public"."change_order_vendor_responses" TO "anon";
GRANT ALL ON TABLE "public"."change_order_vendor_responses" TO "authenticated";
GRANT ALL ON TABLE "public"."change_order_vendor_responses" TO "service_role";
GRANT ALL ON TABLE "public"."company_settings" TO "anon";
GRANT ALL ON TABLE "public"."company_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."company_settings" TO "service_role";
GRANT ALL ON TABLE "public"."customers" TO "anon";
GRANT ALL ON TABLE "public"."customers" TO "authenticated";
GRANT ALL ON TABLE "public"."customers" TO "service_role";
GRANT ALL ON TABLE "public"."email_drafts" TO "anon";
GRANT ALL ON TABLE "public"."email_drafts" TO "authenticated";
GRANT ALL ON TABLE "public"."email_drafts" TO "service_role";
GRANT ALL ON TABLE "public"."estimate_line_items" TO "anon";
GRANT ALL ON TABLE "public"."estimate_line_items" TO "authenticated";
GRANT ALL ON TABLE "public"."estimate_line_items" TO "service_role";
GRANT ALL ON TABLE "public"."estimate_material_price_snapshots" TO "anon";
GRANT ALL ON TABLE "public"."estimate_material_price_snapshots" TO "authenticated";
GRANT ALL ON TABLE "public"."estimate_material_price_snapshots" TO "service_role";
GRANT ALL ON TABLE "public"."estimate_options" TO "anon";
GRANT ALL ON TABLE "public"."estimate_options" TO "authenticated";
GRANT ALL ON TABLE "public"."estimate_options" TO "service_role";
GRANT ALL ON TABLE "public"."estimates" TO "anon";
GRANT ALL ON TABLE "public"."estimates" TO "authenticated";
GRANT ALL ON TABLE "public"."estimates" TO "service_role";
GRANT ALL ON TABLE "public"."feature_settings" TO "anon";
GRANT ALL ON TABLE "public"."feature_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."feature_settings" TO "service_role";
GRANT ALL ON TABLE "public"."labor_catalog" TO "anon";
GRANT ALL ON TABLE "public"."labor_catalog" TO "authenticated";
GRANT ALL ON TABLE "public"."labor_catalog" TO "service_role";
GRANT ALL ON TABLE "public"."lead_activities" TO "anon";
GRANT ALL ON TABLE "public"."lead_activities" TO "authenticated";
GRANT ALL ON TABLE "public"."lead_activities" TO "service_role";
GRANT ALL ON TABLE "public"."lead_tasks" TO "anon";
GRANT ALL ON TABLE "public"."lead_tasks" TO "authenticated";
GRANT ALL ON TABLE "public"."lead_tasks" TO "service_role";
GRANT ALL ON TABLE "public"."leads" TO "anon";
GRANT ALL ON TABLE "public"."leads" TO "authenticated";
GRANT ALL ON TABLE "public"."leads" TO "service_role";
GRANT ALL ON TABLE "public"."material_catalog" TO "anon";
GRANT ALL ON TABLE "public"."material_catalog" TO "authenticated";
GRANT ALL ON TABLE "public"."material_catalog" TO "service_role";
GRANT ALL ON TABLE "public"."material_price_imports" TO "anon";
GRANT ALL ON TABLE "public"."material_price_imports" TO "authenticated";
GRANT ALL ON TABLE "public"."material_price_imports" TO "service_role";
GRANT ALL ON TABLE "public"."material_supplier_prices" TO "anon";
GRANT ALL ON TABLE "public"."material_supplier_prices" TO "authenticated";
GRANT ALL ON TABLE "public"."material_supplier_prices" TO "service_role";
GRANT ALL ON TABLE "public"."pricing_rules" TO "anon";
GRANT ALL ON TABLE "public"."pricing_rules" TO "authenticated";
GRANT ALL ON TABLE "public"."pricing_rules" TO "service_role";
GRANT ALL ON TABLE "public"."procurement_settings" TO "anon";
GRANT ALL ON TABLE "public"."procurement_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."procurement_settings" TO "service_role";
GRANT ALL ON TABLE "public"."project_activity" TO "anon";
GRANT ALL ON TABLE "public"."project_activity" TO "authenticated";
GRANT ALL ON TABLE "public"."project_activity" TO "service_role";
GRANT ALL ON TABLE "public"."project_change_order_items" TO "anon";
GRANT ALL ON TABLE "public"."project_change_order_items" TO "authenticated";
GRANT ALL ON TABLE "public"."project_change_order_items" TO "service_role";
GRANT ALL ON TABLE "public"."project_change_order_payments" TO "anon";
GRANT ALL ON TABLE "public"."project_change_order_payments" TO "authenticated";
GRANT ALL ON TABLE "public"."project_change_order_payments" TO "service_role";
GRANT ALL ON TABLE "public"."project_change_order_response_items" TO "anon";
GRANT ALL ON TABLE "public"."project_change_order_response_items" TO "authenticated";
GRANT ALL ON TABLE "public"."project_change_order_response_items" TO "service_role";
GRANT ALL ON TABLE "public"."project_change_order_responses" TO "anon";
GRANT ALL ON TABLE "public"."project_change_order_responses" TO "authenticated";
GRANT ALL ON TABLE "public"."project_change_order_responses" TO "service_role";
GRANT ALL ON TABLE "public"."project_costs" TO "anon";
GRANT ALL ON TABLE "public"."project_costs" TO "authenticated";
GRANT ALL ON TABLE "public"."project_costs" TO "service_role";
GRANT ALL ON TABLE "public"."project_inspection_areas" TO "anon";
GRANT ALL ON TABLE "public"."project_inspection_areas" TO "authenticated";
GRANT ALL ON TABLE "public"."project_inspection_areas" TO "service_role";
GRANT ALL ON TABLE "public"."project_inspection_corrections" TO "anon";
GRANT ALL ON TABLE "public"."project_inspection_corrections" TO "authenticated";
GRANT ALL ON TABLE "public"."project_inspection_corrections" TO "service_role";
GRANT ALL ON TABLE "public"."project_inspection_document_findings" TO "anon";
GRANT ALL ON TABLE "public"."project_inspection_document_findings" TO "authenticated";
GRANT ALL ON TABLE "public"."project_inspection_document_findings" TO "service_role";
GRANT ALL ON TABLE "public"."project_inspection_documents" TO "anon";
GRANT ALL ON TABLE "public"."project_inspection_documents" TO "authenticated";
GRANT ALL ON TABLE "public"."project_inspection_documents" TO "service_role";
GRANT ALL ON TABLE "public"."project_inspection_requirements" TO "anon";
GRANT ALL ON TABLE "public"."project_inspection_requirements" TO "authenticated";
GRANT ALL ON TABLE "public"."project_inspection_requirements" TO "service_role";
GRANT ALL ON TABLE "public"."project_inspection_research_findings" TO "anon";
GRANT ALL ON TABLE "public"."project_inspection_research_findings" TO "authenticated";
GRANT ALL ON TABLE "public"."project_inspection_research_findings" TO "service_role";
GRANT ALL ON TABLE "public"."project_inspection_research_runs" TO "anon";
GRANT ALL ON TABLE "public"."project_inspection_research_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."project_inspection_research_runs" TO "service_role";
GRANT ALL ON TABLE "public"."project_inspection_research_sources" TO "anon";
GRANT ALL ON TABLE "public"."project_inspection_research_sources" TO "authenticated";
GRANT ALL ON TABLE "public"."project_inspection_research_sources" TO "service_role";
GRANT ALL ON TABLE "public"."project_inspection_result_area_history" TO "anon";
GRANT ALL ON TABLE "public"."project_inspection_result_area_history" TO "authenticated";
GRANT ALL ON TABLE "public"."project_inspection_result_area_history" TO "service_role";
GRANT ALL ON TABLE "public"."project_inspection_result_history" TO "anon";
GRANT ALL ON TABLE "public"."project_inspection_result_history" TO "authenticated";
GRANT ALL ON TABLE "public"."project_inspection_result_history" TO "service_role";
GRANT ALL ON TABLE "public"."project_inspection_settings" TO "anon";
GRANT ALL ON TABLE "public"."project_inspection_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."project_inspection_settings" TO "service_role";
GRANT ALL ON TABLE "public"."project_inspection_task_dependencies" TO "anon";
GRANT ALL ON TABLE "public"."project_inspection_task_dependencies" TO "authenticated";
GRANT ALL ON TABLE "public"."project_inspection_task_dependencies" TO "service_role";
GRANT ALL ON TABLE "public"."project_inspections" TO "anon";
GRANT ALL ON TABLE "public"."project_inspections" TO "authenticated";
GRANT ALL ON TABLE "public"."project_inspections" TO "service_role";
GRANT ALL ON TABLE "public"."project_material_phases" TO "anon";
GRANT ALL ON TABLE "public"."project_material_phases" TO "authenticated";
GRANT ALL ON TABLE "public"."project_material_phases" TO "service_role";
GRANT ALL ON TABLE "public"."project_message_threads" TO "anon";
GRANT ALL ON TABLE "public"."project_message_threads" TO "authenticated";
GRANT ALL ON TABLE "public"."project_message_threads" TO "service_role";
GRANT ALL ON TABLE "public"."project_messages" TO "anon";
GRANT ALL ON TABLE "public"."project_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."project_messages" TO "service_role";
GRANT ALL ON TABLE "public"."project_procurement_settings" TO "anon";
GRANT ALL ON TABLE "public"."project_procurement_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."project_procurement_settings" TO "service_role";
GRANT ALL ON TABLE "public"."project_schedule_readiness" TO "anon";
GRANT ALL ON TABLE "public"."project_schedule_readiness" TO "authenticated";
GRANT ALL ON TABLE "public"."project_schedule_readiness" TO "service_role";
GRANT ALL ON TABLE "public"."projects" TO "anon";
GRANT ALL ON TABLE "public"."projects" TO "authenticated";
GRANT ALL ON TABLE "public"."projects" TO "service_role";
GRANT ALL ON TABLE "public"."push_subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."push_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."push_subscriptions" TO "service_role";
GRANT ALL ON TABLE "public"."role_permission_defaults" TO "anon";
GRANT ALL ON TABLE "public"."role_permission_defaults" TO "authenticated";
GRANT ALL ON TABLE "public"."role_permission_defaults" TO "service_role";
GRANT ALL ON TABLE "public"."subcontractor_material_issues" TO "anon";
GRANT ALL ON TABLE "public"."subcontractor_material_issues" TO "authenticated";
GRANT ALL ON TABLE "public"."subcontractor_material_issues" TO "service_role";
GRANT ALL ON TABLE "public"."subcontractor_material_review_items" TO "anon";
GRANT ALL ON TABLE "public"."subcontractor_material_review_items" TO "authenticated";
GRANT ALL ON TABLE "public"."subcontractor_material_review_items" TO "service_role";
GRANT ALL ON TABLE "public"."subcontractor_material_reviews" TO "anon";
GRANT ALL ON TABLE "public"."subcontractor_material_reviews" TO "authenticated";
GRANT ALL ON TABLE "public"."subcontractor_material_reviews" TO "service_role";
GRANT ALL ON TABLE "public"."subcontractor_schedule_requests" TO "anon";
GRANT ALL ON TABLE "public"."subcontractor_schedule_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."subcontractor_schedule_requests" TO "service_role";
GRANT ALL ON TABLE "public"."supplier_locations" TO "anon";
GRANT ALL ON TABLE "public"."supplier_locations" TO "authenticated";
GRANT ALL ON TABLE "public"."supplier_locations" TO "service_role";
GRANT ALL ON TABLE "public"."suppliers" TO "anon";
GRANT ALL ON TABLE "public"."suppliers" TO "authenticated";
GRANT ALL ON TABLE "public"."suppliers" TO "service_role";
GRANT ALL ON TABLE "public"."task_types" TO "anon";
GRANT ALL ON TABLE "public"."task_types" TO "authenticated";
GRANT ALL ON TABLE "public"."task_types" TO "service_role";
GRANT ALL ON TABLE "public"."tasks" TO "anon";
GRANT ALL ON TABLE "public"."tasks" TO "authenticated";
GRANT ALL ON TABLE "public"."tasks" TO "service_role";
GRANT ALL ON TABLE "public"."team_members" TO "anon";
GRANT ALL ON TABLE "public"."team_members" TO "authenticated";
GRANT ALL ON TABLE "public"."team_members" TO "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";
