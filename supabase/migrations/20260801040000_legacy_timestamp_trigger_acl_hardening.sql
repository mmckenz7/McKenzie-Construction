begin;

-- Live schema audit, 2026-08-01: these postgres-owned functions are used only
-- by the existing timestamp triggers listed in the static audit. Preserve the
-- owner and service_role ACLs; remove direct execution from untrusted roles.
-- Bindings: project_change_order_items_updated_at_trigger -> set_change_order_item_updated_at
-- projects_set_updated_at -> set_crm_updated_at
-- set_customers_updated_at -> set_customer_updated_at
-- set_project_costs_updated_at -> set_project_costs_updated_at
-- Binding example: set_app_users_updated_at -> set_updated_at
-- Additional set_updated_at bindings exist on change_order_vendor_requests,
-- email_drafts, estimate_line_items, estimate_options, estimates,
-- feature_settings, labor_catalog, lead_tasks, leads, material_catalog,
-- material_price_imports, material_supplier_prices, pricing_rules,
-- procurement_settings, project_change_order_payments, project_change_orders,
-- project_material_phases, project_message_threads, project_messages,
-- project_procurement_settings, project_schedule_readiness,
-- role_permission_defaults, subcontractor material issue/review tables and
-- schedule requests, supplier_locations, and suppliers.
revoke execute on function public.set_change_order_item_updated_at()
  from public, anon, authenticated;
revoke execute on function public.set_crm_updated_at()
  from public, anon, authenticated;
revoke execute on function public.set_customer_updated_at()
  from public, anon, authenticated;
revoke execute on function public.set_project_costs_updated_at()
  from public, anon, authenticated;
revoke execute on function public.set_updated_at()
  from public, anon, authenticated;

commit;
