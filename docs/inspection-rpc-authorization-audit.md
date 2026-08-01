# Inspection RPC authorization audit

Audit date: 2026-08-01

This audit is based on a schema-only dump of the linked database and application caller inspection. No production business rows were read for the RPC audit.

## Existing grants and execution model

The 23 inspection business RPCs listed in the accompanying unapplied migration are `SECURITY DEFINER`, have `search_path` fixed to `public`, and are executable by `anon`, `authenticated`, and `service_role`. PostgreSQL functions are executable by `PUBLIC` by default unless that privilege is revoked, so the effective pre-migration contract also includes `PUBLIC` execution.

All current Next.js inspection RPC callers use `createAdminServerClient`, which authenticates with `SUPABASE_SERVICE_ROLE_KEY`. No inspection route calls a business RPC with the browser/authenticated Supabase client.

## Caller-supplied identity risks

Mutation RPCs generally accept `requested_auth_user_id`, look up an `app_users` row, and use it for activity or audit attribution. They do not prove that the supplied UUID equals `auth.uid()`. With direct execution available to untrusted roles, a caller who learns another auth UUID could attribute a mutation to that user.

The read RPCs `get_project_inspection_dependencies`, `get_project_inspection_summary`, `get_project_inspection_correction_summary`, and `is_project_task_blocked_by_inspection` do not accept or verify caller identity. As `SECURITY DEFINER` functions, they can bypass table RLS and return project-scoped inspection data to any role with execute privilege and a project UUID.

Function validation errors reveal whether application users, projects, settings, inspections, areas, corrections, documents, findings, or dependencies exist. These messages are acceptable only behind the server-side project authorization boundary; they are an enumeration risk when functions are directly executable by untrusted roles.

## Proposed grant contract

The unapplied migration:

- revokes all privileges from `PUBLIC`, `anon`, and `authenticated` for all 23 inspection business RPCs;
- grants `EXECUTE` only to `service_role`;
- does not alter function bodies or signatures;
- preserves every current server-side application call;
- does not change tables, rows, constraints, indexes, triggers, or RLS.

Revoking `PUBLIC` is required. Revoking only the two named API roles would leave inherited public execution available.

## Intended future authenticated contract

If direct authenticated RPC use is introduced later, replace caller-trusted identity with a database-derived identity:

1. Resolve the caller from `auth.uid()` inside the function.
2. Reject a supplied identity when it differs from `auth.uid()`, during a compatibility transition.
3. Resolve the active `app_users` and `team_members` records internally.
4. Authorize owner/admin access or assigned project-manager access against the requested project.
5. Validate every inspection, area, correction, finding, document, dependency, and task belongs to that authorized project.
6. Use stable authorization SQL shared by all inspection functions.
7. Return safe authorization errors without distinguishing missing from inaccessible resources.
8. Re-grant selected functions to `authenticated` only after direct-client integration tests pass.

The current application should retain `requested_auth_user_id` until all callers and activity attribution paths are deliberately migrated.

## Integrity audit

The production dependency table currently contains zero rows. Minimum-column checks therefore found zero orphan tasks, task/project mismatches, orphan inspections or areas, inspection/area project mismatches, duplicate keys, and stale blocking/release states. No affected IDs exist.
