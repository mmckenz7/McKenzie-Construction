# Local beta sandbox

This sandbox is a disposable Supabase stack on this Mac. It is separate from both the staging and production projects. The guarded seed script refuses any URL except `http://127.0.0.1:54321` (or the equivalent `localhost` URL on port `54321`).

## Prerequisite

Install and start Docker Desktop or another Supabase-compatible container runtime.

## Start and seed

1. Run `npm run sandbox:prepare`. This builds a disposable migration workspace from the full schema baseline plus every later migration. The cloud-oriented historical files are not altered.
2. Run `npm run sandbox:start`.
3. Run `npx supabase --workdir .local-sandbox status -o env` and keep the local values private.
4. Supply the local API URL and local service-role key only to the guarded seeder:

   `LOCAL_SUPABASE_URL=http://127.0.0.1:54321 LOCAL_SUPABASE_SERVICE_ROLE_KEY='<local key>' LOCAL_SANDBOX_PASSWORD='<temporary password>' npm run sandbox:seed`

5. Point a separate local application process at the local Supabase URL and anon key. Do not replace or commit `.env.local`; provide the local values to that shell process only.
6. Sign in as `owner@mckenzie-sandbox.test` with the temporary password supplied to the seed command.

The fixture contains one owner account, eight customers, eight projects in varied states, forty project costs, fourteen leads, and eighteen tasks. All email addresses use reserved test domains and all phone numbers use 555 test ranges.

## Wipe and rebuild

Run `npm run sandbox:reset`, then run `npm run sandbox:seed` again with the local-only variables. Resetting deletes the disposable local database only; it does not contact a linked cloud project.

## Stop

Run `npm run sandbox:stop`. Local container data remains available until the next reset.

## Safety rules

- Never pass a staging or production URL to the seed script; it will refuse it.
- Never copy local keys into source control.
- Never run the seed script with values sourced from the repository's existing `.env.local`.
- Treat the sandbox as destructive and disposable. Use it for breaking workflows, not retaining real business records.
