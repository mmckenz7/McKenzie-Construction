# Legacy trigger-function ACL audit

Audit date: 2026-08-01

This audit uses a schema-only dump of the linked database plus a repository-wide
caller search. No production business rows were read or changed. The four
inspection trigger helpers are outside this inventory because they were handled
in the preceding repair group.

## Common ACL and ownership findings

All 24 functions are owned by `postgres`, return `trigger`, and have explicit
`ALL` grants to `anon`, `authenticated`, and `service_role`. Because their ACLs
do not revoke PostgreSQL's default function privilege from `PUBLIC`, they are
also effectively executable by `PUBLIC`. None is referenced by application
source or called by another SQL function. Each is bound to at least one live
trigger, so every function is classified **trigger-only**.

The proposed migrations revoke only `EXECUTE` from `PUBLIC`, `anon`, and
`authenticated`. They leave ownership, `service_role`, function bodies, trigger
bindings, tables, and rows unchanged. PostgreSQL trigger execution does not
require the row-changing role to have direct `EXECUTE` on the trigger function.

## Inventory and classification

| Subsystem | Function | Security | `search_path` | Live trigger binding(s) |
| --- | --- | --- | --- | --- |
| synchronization | `apply_installer_schedule_response()` | definer | `public` | `apply_installer_schedule_response_after_update`, after update on `subcontractor_schedule_requests` |
| validation | `assign_project_change_order_number()` | definer | `public` | `assign_project_change_order_number_trigger`, before insert on `project_change_orders` |
| activity | `log_change_order_activity()` | definer | `public` | `log_change_order_activity_trigger`, after insert/update on `project_change_orders` |
| activity | `log_change_order_approval_activity()` | definer | `public` | `project_change_order_approval_activity_trigger`, after approval-field update on `project_change_orders` |
| activity | `log_change_order_payment_activity()` | definer | `public` | `log_change_order_payment_activity_trigger`, after insert/delete/update on `project_change_order_payments` |
| activity | `log_change_order_vendor_request_activity()` | definer | `public` | `log_change_order_vendor_request_activity_trigger`, after insert/update on `change_order_vendor_requests` |
| activity | `log_material_issue_activity()` | definer | `public` | `log_material_issue_activity_trigger`, after insert/update on `subcontractor_material_issues` |
| activity | `log_material_review_activity()` | definer | `public` | `log_material_review_activity_trigger`, after insert/update on `subcontractor_material_reviews` |
| activity | `log_project_message_activity()` | definer | `public` | `log_project_message_activity_trigger`, after selected-field update on `project_messages` |
| activity | `log_project_update_activity()` | definer | `public` | `log_project_update_activity_trigger`, after update on `projects` |
| activity | `log_schedule_request_activity()` | definer | `public` | `log_schedule_request_activity_trigger`, after insert/update on `subcontractor_schedule_requests` |
| validation | `prevent_locked_change_order_item_changes()` | definer | `public` | `prevent_locked_change_order_item_changes_trigger`, before insert/delete/update on `project_change_order_items` |
| validation | `prevent_locked_change_order_scope_changes()` | definer | `public` | `prevent_locked_change_order_scope_changes_trigger`, before update on `project_change_orders` |
| validation | `prevent_schedule_response_overwrite()` | invoker | `public` | `prevent_schedule_response_overwrite_trigger`, before update on `subcontractor_schedule_requests` |
| timestamp | `set_change_order_item_updated_at()` | invoker | default | `project_change_order_items_updated_at_trigger`, before update on `project_change_order_items` |
| timestamp | `set_crm_updated_at()` | invoker | default | `projects_set_updated_at`, before update on `projects` |
| timestamp | `set_customer_updated_at()` | invoker | default | `set_customers_updated_at`, before update on `customers` |
| timestamp | `set_project_costs_updated_at()` | invoker | default | `set_project_costs_updated_at`, before update on `project_costs` |
| timestamp | `set_updated_at()` | invoker | default | 29 before-update triggers; detailed below |
| synchronization | `sync_change_order_invoice_status()` | definer | `public` | `sync_change_order_invoice_status_trigger`, before invoice-field update on `project_change_orders` |
| synchronization | `sync_change_order_item_totals()` | definer | `public` | `project_change_order_items_totals_trigger`, after insert/delete/update on `project_change_order_items` |
| synchronization | `sync_change_order_payment_status()` | definer | `public` | `sync_change_order_payment_status_trigger`, after insert/delete/update on `project_change_order_payments` |
| synchronization | `touch_project_message_thread()` | definer | `public` | `touch_project_message_thread_after_message`, after insert/sent update on `project_messages` |
| validation | `validate_change_order_supersession()` | invoker | `public` | `validate_change_order_supersession_trigger`, before supersession-field insert/update on `project_change_orders` |

Every row above has classification `trigger-only`, owner `postgres`, application
callers `none`, and internal SQL callers `none`.

`set_updated_at()` is bound to `app_users`, `change_order_vendor_requests`,
`email_drafts`, `estimate_line_items`, `estimate_options`, `estimates`,
`feature_settings`, `labor_catalog`, `lead_tasks`, `leads`, `material_catalog`,
`material_price_imports`, `material_supplier_prices`, `pricing_rules`,
`procurement_settings`, `project_change_order_payments`, `project_change_orders`,
`project_material_phases`, `project_message_threads`, `project_messages`,
`project_procurement_settings`, `project_schedule_readiness`,
`role_permission_defaults`, `subcontractor_material_issues`,
`subcontractor_material_review_items`, `subcontractor_material_reviews`,
`subcontractor_schedule_requests`, `supplier_locations`, and `suppliers`.

## Grants before and proposed after

| Functions | Before (effective direct execution) | Proposed after |
| --- | --- | --- |
| all 24 above | `PUBLIC`, `anon`, `authenticated`, `service_role`, owner `postgres` | `service_role`, owner `postgres` |

## Intentionally exposed RPCs held unchanged

The grants-only migrations do not reference the public token workflows
`get_change_order_by_token`, `get_change_order_vendor_request_by_token`,
`get_material_review_by_token`, `get_schedule_request_by_token`,
`submit_change_order_response`, `submit_change_order_response_v2`,
`submit_change_order_vendor_response`, or `submit_schedule_request_by_token`.
Their ACLs remain unchanged for separate authorization review.

## Safety conclusion

Each of the four migrations is safe to apply independently in timestamp order:
it contains transaction control and `REVOKE EXECUTE` statements only. Trigger
invocation and owner execution are preserved. The migrations have not been
applied.
