begin;

-- Live default-privilege and ownership audit, 2026-08-01:
-- All application functions in public are owned by postgres, and postgres is
-- the only creator role with function default privileges for this schema.
-- Supabase migrations and dashboard SQL create application functions through
-- that postgres owner context. Keep future functions owner-only by default;
-- each intentionally exposed RPC must receive an explicit grant after it is
-- created. This changes no existing function ACL or function body.
alter default privileges for role postgres in schema public
  revoke execute on functions
  from public, anon, authenticated, service_role;

commit;
