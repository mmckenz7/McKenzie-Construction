begin;

-- Live schema audit, 2026-08-01: these postgres-owned activity-log functions
-- are used only by their existing table triggers. Preserve the owner and
-- service_role ACLs; remove direct execution from untrusted roles.
-- Bindings: log_change_order_activity_trigger -> log_change_order_activity
-- project_change_order_approval_activity_trigger -> log_change_order_approval_activity
-- log_change_order_payment_activity_trigger -> log_change_order_payment_activity
-- log_change_order_vendor_request_activity_trigger -> log_change_order_vendor_request_activity
-- log_material_issue_activity_trigger -> log_material_issue_activity
-- log_material_review_activity_trigger -> log_material_review_activity
-- log_project_message_activity_trigger -> log_project_message_activity
-- log_project_update_activity_trigger -> log_project_update_activity
-- log_schedule_request_activity_trigger -> log_schedule_request_activity
revoke execute on function public.log_change_order_activity()
  from public, anon, authenticated;
revoke execute on function public.log_change_order_approval_activity()
  from public, anon, authenticated;
revoke execute on function public.log_change_order_payment_activity()
  from public, anon, authenticated;
revoke execute on function public.log_change_order_vendor_request_activity()
  from public, anon, authenticated;
revoke execute on function public.log_material_issue_activity()
  from public, anon, authenticated;
revoke execute on function public.log_material_review_activity()
  from public, anon, authenticated;
revoke execute on function public.log_project_message_activity()
  from public, anon, authenticated;
revoke execute on function public.log_project_update_activity()
  from public, anon, authenticated;
revoke execute on function public.log_schedule_request_activity()
  from public, anon, authenticated;

commit;
