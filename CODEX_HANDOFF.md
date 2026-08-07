# McKenzie Construction CRM Handoff

Next.js 16 and Supabase construction CRM.

First audit the repository and stabilize existing work. Do not add features yet.

Run: git status --short, git branch --show-current, git log -5 --oneline, node --version, npm --version, cat package.json, npm install, and npm run build.

Inspect build errors, invalid imports, duplicate routes, Supabase tables, columns, RPC signatures, feature keys, authentication, permissions, company isolation, project isolation, storage, and deployment configuration.

High-risk areas: inspections, change orders, vendor responses, project_activity constraints, feature flags, and inspection task dependencies.

The inspection dependency task_id has no foreign key because project_tasks did not exist. Find the real schedule-task table before changing it.

Known feature keys: inspections, inspection_municipality_research, inspection_schedule_dependencies, inspection_document_extraction, inspection_partial_pass, inspection_corrections.

Report the branch, repository state, build result, top five blockers, database/API mismatches, authorization risks, and recommended first repair group.

Then begin the first non-destructive repair group. Do not commit or push.
