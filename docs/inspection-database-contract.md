# Inspection database contract audit

Audit date: 2026-08-01

This document versions the live inspection contract. It is based on application queries, read-only PostgREST metadata, and a schema-only `pg_dump` of the linked database. No production rows were read.

## Task and scheduling model

- `tasks` is the operational task table. Its primary key is `id`; `project_id` links a task to `projects.id`; status timestamps include `started_at`, `completed_at`, and `canceled_at`.
- `project_tasks` does not exist in repository code, repository history, migrations, or the exposed schema metadata.
- `project_schedule_readiness` and `project_material_phases` hold project-level scheduling inputs. They are not task tables.
- `project_inspection_task_dependencies.task_id` is a required UUID. Live metadata does not identify it as a foreign key. The application now treats it as `tasks.id` and validates `tasks.project_id` before dependency creation.

## Inspection tables verified through schema metadata

All inspection child tables listed below contain a required `project_id` foreign key to `projects.id` unless noted otherwise.

| Table | Key relationships and application purpose |
| --- | --- |
| `project_inspection_settings` | Primary key `id`; unique-per-project behavior is assumed by `.maybeSingle()` calls; enables workflow, research, dependencies, extraction, and partial pass. |
| `project_inspection_requirements` | Requirements used to generate or configure inspections; queried and mutated by the requirements API. |
| `project_inspections` | Primary key `id`; optional `requirement_id` FK; status, schedule, result, verification, and `schedule_blocking_enabled` state. |
| `project_inspection_areas` | `inspection_id` FK to `project_inspections`; area result and `work_may_continue` state. |
| `project_inspection_result_history` | `inspection_id` FK; immutable-style inspection result history and contractor confirmation fields. |
| `project_inspection_result_area_history` | FKs to result history and inspection; area snapshot for a recorded result. |
| `project_inspection_task_dependencies` | FKs to inspection, optional inspection area, and project; required `task_id` has no advertised FK; dependency type, blocking, and release state. |
| `project_inspection_corrections` | FKs to inspection, optional result history/area/reinspection inspection; correction workflow. |
| `project_inspection_documents` | Project/inspection/result references plus extraction and review state. |
| `project_inspection_document_findings` | Extracted findings reviewed before application. |
| `project_inspection_research_runs` | FK to inspection settings; research request, detection, review, and application state. |
| `project_inspection_research_sources` | FK to research run; source metadata. |
| `project_inspection_research_findings` | FKs to research run/source and optional applied requirement. |

Related non-inspection tables used by these routes are `projects`, `tasks`, `app_users`, and `project_activity`.

## Dependency columns verified

`project_inspection_task_dependencies` exposes:

- `id uuid` primary key, required
- `inspection_id uuid` required, FK to `project_inspections.id`
- `inspection_area_id uuid` nullable, FK to `project_inspection_areas.id`
- `project_id uuid` required, FK to `projects.id`
- `task_id uuid` required, no advertised FK
- `dependency_type text` required
- `is_blocking boolean` required
- `released_at timestamptz` nullable
- `released_by uuid` nullable, FK to `app_users.id`
- `created_at timestamptz` required

The live dependency-type check permits `must_pass_before_start`, `must_be_scheduled_before_start`, and `area_release_required`.

The live unique expression index `project_inspection_task_dependency_unique` covers inspection, coalesced inspection area, task, and dependency type. The setter RPC uses that same expression as an upsert conflict target. Duplicate rows are therefore prevented, although the RPC treats a duplicate request as an update rather than an error.

## Inspection RPCs exposed by the current schema

Dependency and workflow RPCs:

- `get_project_inspection_dependencies(requested_project_id)`
- `set_project_inspection_task_dependency(requested_project_id, requested_inspection_id, requested_inspection_area_id, requested_task_id, requested_dependency_type, requested_auth_user_id)`
- `remove_project_inspection_task_dependency(requested_dependency_id, requested_project_id, requested_reason, requested_auth_user_id)`
- `refresh_project_inspection_dependencies(requested_project_id, requested_auth_user_id)`
- `is_project_task_blocked_by_inspection(requested_project_id, requested_task_id)`
- `get_project_inspection_summary(requested_project_id)`
- `activate_project_inspection_workflow(requested_project_id, requested_auth_user_id)`
- `verify_project_inspection_checklist(...)`
- `reopen_project_inspection_checklist(...)`
- `record_project_inspection_result(...)`
- `confirm_project_inspection_result(...)`

Correction RPCs:

- `get_project_inspection_correction_summary`
- `create_project_inspection_correction`
- `update_project_inspection_correction`
- `create_project_inspection_reinspection`

Research and document RPCs:

- `create_project_inspection_research_run`
- `review_project_inspection_research_finding`
- `apply_project_inspection_research`
- `create_project_inspection_document`
- `start_project_inspection_document_extraction`
- `complete_project_inspection_document_extraction`
- `fail_project_inspection_document_extraction`
- `review_project_inspection_document_finding`

The application does not call `is_project_task_blocked_by_inspection` when a task transitions to `in_progress` or `completed`.

## Application contract comparison

- Dependency response fields used by TypeScript match the RPC-facing names: dependency, inspection, area, task, type, block/release, and reason fields.
- Inspection, area, result-history, correction, document, and research columns queried by the routes are present in exposed metadata.
- The prior UI phrase “project schedule task” and raw UUID entry were misleading. Project-linked rows in `tasks` are the only proven task source.
- Inspection routes use the service-role client after application authentication. Service-role access bypasses table RLS, so URL-level project authorization is mandatory.
- The dependency API now authorizes owner/admin roles or the assigned `projects.project_manager_id` before reading settings, inspections, dependencies, or tasks.
- Missing and unauthorized projects return the same 403 response. Missing and cross-project tasks return the same 404 response after project authorization.
- Duplicate dependency creation is checked before the RPC and returns 409. This is not race-safe without a database uniqueness constraint.

## Constraints, indexes, triggers, grants, and RLS

Verified:

- Primary and foreign-key annotations listed above are published by live schema metadata.
- No foreign-key annotation exists for dependency `task_id`.
- Inspection RPC signatures listed above are exposed to the service-role schema client.
- All inspection tables and `tasks` have RLS enabled.
- The schema contains no policies on the inspection tables or `tasks`; direct access is therefore denied under RLS for ordinary roles despite broad table grants.
- Inspection tables are granted `ALL` to `anon`, `authenticated`, and `service_role`.
- Inspection RPCs, including trigger helpers, are granted `ALL` to `anon`, `authenticated`, and `service_role`.
- Inspection business RPCs are `SECURITY DEFINER` with `search_path` set to `public`.
- Read RPCs such as `get_project_inspection_dependencies`, `get_project_inspection_summary`, and `is_project_task_blocked_by_inspection` do not authenticate the caller.
- Mutation RPCs look up the supplied `requested_auth_user_id`, but do not bind it to `auth.uid()` or independently enforce project authorization.
- The dependency setter validates inspection and area project ownership but does not validate `task_id` against `tasks`.
- The unique dependency index prevents duplicates; the setter performs an upsert.
- Dependency refresh is only performed by the explicit refresh RPC. No live trigger automatically refreshes dependencies after inspection status/area changes.
- Live inspection triggers are limited to correction numbering and updated-at maintenance for corrections, documents/findings, and research objects.

The broad function grants combined with `SECURITY DEFINER` are the primary database authorization gap. A corrective migration should revoke inspection business RPC execution from `anon`, restrict direct execution to `service_role`, and add database-side identity/project checks before authenticated direct RPC access is reconsidered.

## Recommended task-transition enforcement

Use both layers, with the database as the authority:

1. A database trigger or dedicated task-transition RPC should reject transitions into work-started states when `is_project_task_blocked_by_inspection(project_id, task_id)` reports a hold. This protects every writer, not only this Next.js route.
2. The task API should call the same RPC before attempting the update so it can return a clear 409 response and avoid relying on a raw trigger exception for normal user feedback.
3. Task completion should not be blocked automatically unless the business rule explicitly applies dependencies to completion; the current dependency names describe “before start.”
4. Inspection schedule/result mutations should refresh dependency state transactionally in the database, but only after current function and trigger bodies are captured and reviewed.

The unapplied migration
`20260807000000_inspection_task_dependency_fk.sql` adds a composite foreign key
from `(task_id, project_id)` to `tasks(id, project_id)`. It first rejects any
existing orphaned or cross-project references and uses restrictive update and
delete behavior so dependencies must be removed explicitly. This migration has
not been applied to Staging or Production.

No task-transition blocking change is included in this repair.
