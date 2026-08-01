begin;

-- Live schema audit, 2026-08-01:
-- These four functions return trigger and have no direct application or
-- function callers. PostgreSQL invokes them through the existing trigger
-- bindings below without requiring the row-changing role to hold EXECUTE on
-- the trigger function. Keep the functions owner-only for direct execution.
--
-- Existing trigger bindings (unchanged by this grants-only migration):
-- trigger: assign_project_inspection_correction_number before insert on public.project_inspection_corrections -> public.assign_project_inspection_correction_number()
-- trigger: set_project_inspection_correction_updated_at before update on public.project_inspection_corrections -> public.set_project_inspection_correction_updated_at()
-- trigger: set_project_inspection_document_findings_updated_at before update on public.project_inspection_document_findings -> public.set_project_inspection_document_updated_at()
-- trigger: set_project_inspection_documents_updated_at before update on public.project_inspection_documents -> public.set_project_inspection_document_updated_at()
-- trigger: set_project_inspection_research_findings_updated_at before update on public.project_inspection_research_findings -> public.set_inspection_research_updated_at()
-- trigger: set_project_inspection_research_runs_updated_at before update on public.project_inspection_research_runs -> public.set_inspection_research_updated_at()

revoke all on function public.assign_project_inspection_correction_number()
  from public, anon, authenticated, service_role;
revoke all on function public.set_inspection_research_updated_at()
  from public, anon, authenticated, service_role;
revoke all on function public.set_project_inspection_correction_updated_at()
  from public, anon, authenticated, service_role;
revoke all on function public.set_project_inspection_document_updated_at()
  from public, anon, authenticated, service_role;

commit;
