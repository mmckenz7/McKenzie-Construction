begin;

do $audit$
declare
  invalid_dependency_count integer;
begin
  if to_regclass('public.tasks') is null
    or to_regclass('public.project_inspection_task_dependencies') is null then
    raise exception
      'Required inspection task dependency tables are missing.';
  end if;

  select count(*)
  into invalid_dependency_count
  from public.project_inspection_task_dependencies dependency
  left join public.tasks task
    on task.id = dependency.task_id
  where task.id is null
    or task.project_id is distinct from dependency.project_id;

  if invalid_dependency_count > 0 then
    raise exception
      'Inspection task dependency integrity check failed for % row(s). Resolve orphaned or cross-project task references before applying this migration.',
      invalid_dependency_count
      using errcode = '23503';
  end if;
end
$audit$;

do $constraints$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conname = 'tasks_id_project_id_key'
      and conrelid = 'public.tasks'::regclass
  ) then
    alter table public.tasks
      add constraint tasks_id_project_id_key
      unique (id, project_id);
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conname = 'project_inspection_task_dependencies_task_project_fkey'
      and conrelid = 'public.project_inspection_task_dependencies'::regclass
  ) then
    alter table public.project_inspection_task_dependencies
      add constraint project_inspection_task_dependencies_task_project_fkey
      foreign key (task_id, project_id)
      references public.tasks (id, project_id)
      on update restrict
      on delete restrict;
  end if;
end
$constraints$;

comment on constraint project_inspection_task_dependencies_task_project_fkey
  on public.project_inspection_task_dependencies is
  'Requires every inspection dependency to reference a task belonging to the same project.';

commit;
