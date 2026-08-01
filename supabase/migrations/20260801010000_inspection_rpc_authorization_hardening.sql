begin;

-- Existing live contract audit, 2026-08-01:
-- These SECURITY DEFINER business functions are currently executable by
-- PUBLIC, anon, authenticated, and service_role. Application callers use the
-- server-only service-role client. This migration changes grants only; it does
-- not replace function bodies or remove requested_auth_user_id parameters.

revoke all on function public.activate_project_inspection_workflow(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.apply_project_inspection_research(uuid, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.complete_project_inspection_document_extraction(uuid, uuid, text, jsonb, text, text, jsonb, uuid)
  from public, anon, authenticated;
revoke all on function public.confirm_project_inspection_result(uuid, uuid, text, text, uuid)
  from public, anon, authenticated;
revoke all on function public.create_project_inspection_correction(uuid, uuid, uuid, uuid, text, text, text, date, boolean, text, text, uuid)
  from public, anon, authenticated;
revoke all on function public.create_project_inspection_document(uuid, uuid, uuid, text, text, text, text, text, text, bigint, date, text, text, text, uuid)
  from public, anon, authenticated;
revoke all on function public.create_project_inspection_reinspection(uuid, uuid, timestamptz, timestamptz, text, text, text, uuid)
  from public, anon, authenticated;
revoke all on function public.create_project_inspection_research_run(uuid, text, text, text, text, text, text, text, text, text, text, text, uuid)
  from public, anon, authenticated;
revoke all on function public.fail_project_inspection_document_extraction(uuid, uuid, text, uuid)
  from public, anon, authenticated;
revoke all on function public.get_project_inspection_correction_summary(uuid)
  from public, anon, authenticated;
revoke all on function public.get_project_inspection_dependencies(uuid)
  from public, anon, authenticated;
revoke all on function public.get_project_inspection_summary(uuid)
  from public, anon, authenticated;
revoke all on function public.is_project_task_blocked_by_inspection(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.record_project_inspection_result(uuid, text, text, text, text, text, text, timestamptz, boolean, date, jsonb, jsonb, jsonb, text, jsonb, uuid)
  from public, anon, authenticated;
revoke all on function public.refresh_project_inspection_dependencies(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.remove_project_inspection_task_dependency(uuid, uuid, text, uuid)
  from public, anon, authenticated;
revoke all on function public.reopen_project_inspection_checklist(uuid, text, uuid)
  from public, anon, authenticated;
revoke all on function public.review_project_inspection_document_finding(uuid, uuid, text, text, text, jsonb, uuid)
  from public, anon, authenticated;
revoke all on function public.review_project_inspection_research_finding(uuid, uuid, text, text, text, text, text, uuid)
  from public, anon, authenticated;
revoke all on function public.set_project_inspection_task_dependency(uuid, uuid, uuid, uuid, text, uuid)
  from public, anon, authenticated;
revoke all on function public.start_project_inspection_document_extraction(uuid, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.update_project_inspection_correction(uuid, uuid, text, uuid, uuid, text, text, text, text, date, text, jsonb, jsonb, text, uuid)
  from public, anon, authenticated;
revoke all on function public.verify_project_inspection_checklist(uuid, text, uuid)
  from public, anon, authenticated;

grant execute on function public.activate_project_inspection_workflow(uuid, uuid)
  to service_role;
grant execute on function public.apply_project_inspection_research(uuid, uuid, uuid)
  to service_role;
grant execute on function public.complete_project_inspection_document_extraction(uuid, uuid, text, jsonb, text, text, jsonb, uuid)
  to service_role;
grant execute on function public.confirm_project_inspection_result(uuid, uuid, text, text, uuid)
  to service_role;
grant execute on function public.create_project_inspection_correction(uuid, uuid, uuid, uuid, text, text, text, date, boolean, text, text, uuid)
  to service_role;
grant execute on function public.create_project_inspection_document(uuid, uuid, uuid, text, text, text, text, text, text, bigint, date, text, text, text, uuid)
  to service_role;
grant execute on function public.create_project_inspection_reinspection(uuid, uuid, timestamptz, timestamptz, text, text, text, uuid)
  to service_role;
grant execute on function public.create_project_inspection_research_run(uuid, text, text, text, text, text, text, text, text, text, text, text, uuid)
  to service_role;
grant execute on function public.fail_project_inspection_document_extraction(uuid, uuid, text, uuid)
  to service_role;
grant execute on function public.get_project_inspection_correction_summary(uuid)
  to service_role;
grant execute on function public.get_project_inspection_dependencies(uuid)
  to service_role;
grant execute on function public.get_project_inspection_summary(uuid)
  to service_role;
grant execute on function public.is_project_task_blocked_by_inspection(uuid, uuid)
  to service_role;
grant execute on function public.record_project_inspection_result(uuid, text, text, text, text, text, text, timestamptz, boolean, date, jsonb, jsonb, jsonb, text, jsonb, uuid)
  to service_role;
grant execute on function public.refresh_project_inspection_dependencies(uuid, uuid)
  to service_role;
grant execute on function public.remove_project_inspection_task_dependency(uuid, uuid, text, uuid)
  to service_role;
grant execute on function public.reopen_project_inspection_checklist(uuid, text, uuid)
  to service_role;
grant execute on function public.review_project_inspection_document_finding(uuid, uuid, text, text, text, jsonb, uuid)
  to service_role;
grant execute on function public.review_project_inspection_research_finding(uuid, uuid, text, text, text, text, text, uuid)
  to service_role;
grant execute on function public.set_project_inspection_task_dependency(uuid, uuid, uuid, uuid, text, uuid)
  to service_role;
grant execute on function public.start_project_inspection_document_extraction(uuid, uuid, uuid)
  to service_role;
grant execute on function public.update_project_inspection_correction(uuid, uuid, text, uuid, uuid, text, text, text, text, date, text, jsonb, jsonb, text, uuid)
  to service_role;
grant execute on function public.verify_project_inspection_checklist(uuid, text, uuid)
  to service_role;

commit;
