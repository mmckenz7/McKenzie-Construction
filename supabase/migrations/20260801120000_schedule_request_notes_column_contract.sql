begin;

create or replace function public.log_schedule_request_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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
        new.notes_original,
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

create or replace function public.prevent_schedule_response_overwrite()
returns trigger
language plpgsql
set search_path = public
as $$
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
      or new.notes_original
        is distinct from old.notes_original
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

commit;
