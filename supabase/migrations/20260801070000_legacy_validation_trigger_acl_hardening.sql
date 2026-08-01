begin;

-- Live schema audit, 2026-08-01: these postgres-owned assignment/validation
-- functions are used only by their existing table triggers. Preserve the owner
-- and service_role ACLs; remove direct execution from untrusted roles.
-- Bindings: assign_project_change_order_number_trigger -> assign_project_change_order_number
-- prevent_locked_change_order_item_changes_trigger -> prevent_locked_change_order_item_changes
-- prevent_locked_change_order_scope_changes_trigger -> prevent_locked_change_order_scope_changes
-- prevent_schedule_response_overwrite_trigger -> prevent_schedule_response_overwrite
-- validate_change_order_supersession_trigger -> validate_change_order_supersession
revoke execute on function public.assign_project_change_order_number()
  from public, anon, authenticated;
revoke execute on function public.prevent_locked_change_order_item_changes()
  from public, anon, authenticated;
revoke execute on function public.prevent_locked_change_order_scope_changes()
  from public, anon, authenticated;
revoke execute on function public.prevent_schedule_response_overwrite()
  from public, anon, authenticated;
revoke execute on function public.validate_change_order_supersession()
  from public, anon, authenticated;

commit;
