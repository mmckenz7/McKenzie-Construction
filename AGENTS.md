# Agent Instructions

Read CODEX_HANDOFF.md before editing.
Inspect before changing files.
Do not add features until the repository builds and existing workflows are audited.
Do not create fake data.
Do not commit or push unless explicitly requested.

## Approval policy

Run routine local and read-only checks without requesting approval when the sandbox allows them.

Batch related read-only checks into fewer commands.

Avoid asking for separate approval for every harmless inspection command when the same read-only work can be safely grouped.

Always request explicit approval before:

- git commit
- git push
- git merge
- git rebase
- git tag creation or deletion
- branch deletion
- Vercel deploy or redeploy
- Vercel promotion to Production
- Vercel environment-variable creation, editing, deletion, or reveal
- Supabase db push without --dry-run
- Supabase migration repair
- remote SQL writes
- remote DDL
- remote GRANT or REVOKE
- secret or API-key retrieval, reveal, creation, storage, rotation, or deletion
- destructive commands outside known disposable /tmp paths
- any Production modification

Production Supabase ref:

jjvxtwqewpiddhoedwkn

Staging Supabase ref:

iiofljulghibantfzlim

Production access must remain read-only unless the user explicitly approves the exact modifying command.

Commands that are normally safe to batch or run without asking, when the sandbox allows:

- git status
- git diff
- git log
- git branch --show-current
- git ls-remote
- file reads and searches
- repository tests
- TypeScript checks
- builds
- lint
- Vercel list
- Vercel inspect
- Vercel logs
- Supabase project listing
- Supabase help commands
- Supabase db push with --dry-run
- read-only catalog SELECT queries
- local Docker inspection
- initialization or removal of known disposable /tmp workdirs

Do not grant blanket approval to broad command prefixes such as:

- git
- npx supabase
- npx vercel
- docker
- bash
- curl
- rm

Request approval based on the actual risk of the specific command.

## Preview bypass-secret retention

When `/tmp/vercel-bypass-secret.txt` is provided for a Preview testing cycle, retain it through the complete testing cycle.

Do not delete it during partial cleanup, intermediate cleanup, failure cleanup, or diagnostic cleanup.

Delete it only after the complete Preview testing cycle and only when the user explicitly authorizes its deletion.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
