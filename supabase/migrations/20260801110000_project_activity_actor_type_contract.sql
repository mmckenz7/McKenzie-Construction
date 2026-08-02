begin;

do $$
begin
  if exists (
    select 1
    from public.project_activity
    where
      actor_type is null
      or actor_type not in (
        'office',
        'system',
        'subcontractor',
        'customer',
        'supplier'
      )
  ) then
    raise exception using
      errcode = '23514',
      message = 'project_activity contains an actor_type outside the approved contract';
  end if;
end
$$;

alter table public.project_activity
  drop constraint if exists project_activity_actor_type_check;

alter table public.project_activity
  add constraint project_activity_actor_type_check
  check (
    actor_type in (
      'office',
      'system',
      'subcontractor',
      'customer',
      'supplier'
    )
  ) not valid;

alter table public.project_activity
  validate constraint project_activity_actor_type_check;

commit;
