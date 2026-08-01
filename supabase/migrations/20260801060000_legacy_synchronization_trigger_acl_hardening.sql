begin;

-- Live schema audit, 2026-08-01: these postgres-owned synchronization
-- functions are used only by their existing table triggers. Preserve the owner
-- and service_role ACLs; remove direct execution from untrusted roles.
-- Bindings: apply_installer_schedule_response_after_update -> apply_installer_schedule_response
-- sync_change_order_invoice_status_trigger -> sync_change_order_invoice_status
-- project_change_order_items_totals_trigger -> sync_change_order_item_totals
-- sync_change_order_payment_status_trigger -> sync_change_order_payment_status
-- touch_project_message_thread_after_message -> touch_project_message_thread
revoke execute on function public.apply_installer_schedule_response()
  from public, anon, authenticated;
revoke execute on function public.sync_change_order_invoice_status()
  from public, anon, authenticated;
revoke execute on function public.sync_change_order_item_totals()
  from public, anon, authenticated;
revoke execute on function public.sync_change_order_payment_status()
  from public, anon, authenticated;
revoke execute on function public.touch_project_message_thread()
  from public, anon, authenticated;

commit;
