alter table public.project_schedule_readiness
  add column if not exists materials_not_required boolean
    not null default false;

comment on column public.project_schedule_readiness.materials_not_required is
  'Explicit scheduling override for projects that can begin construction without waiting for any material delivery. This does not remove materials or costs from the estimate.';

alter table public.project_schedule_readiness
  drop constraint if exists project_schedule_readiness_materials_not_required_delivery_check;

alter table public.project_schedule_readiness
  add constraint project_schedule_readiness_materials_not_required_delivery_check
  check (
    materials_not_required is not true
    or confirmed_material_delivery_date is null
  );

create or replace function public.recalculate_project_schedule(
  requested_project_id uuid
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
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

  if readiness_record.materials_not_required then
    material_safe_date := null;
  elsif (
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
    readiness_record.materials_not_required is not true
    and required_phase_count = 0
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
    and (
      readiness_record.materials_not_required
      or material_safe_date is not null
    )
  ) then
    construction_start_date :=
      case
        when readiness_record.materials_not_required
          then readiness_record
            .installer_earliest_construction_start
        else greatest(
          readiness_record
            .installer_earliest_construction_start,
          material_safe_date
        )
      end;
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

      when readiness_record.materials_not_required
        is not true
        and material_safe_date is null
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
    'materials_not_required',
      readiness_record.materials_not_required,
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
