begin;

-- The beta lead lifecycle already distinguishes explicit lost status. Add the
-- orthogonal activity flag required by estimate-expiry review and the future
-- company-configured inactivity policy. Existing leads remain active.
alter table public.leads
  add column if not exists is_active boolean not null default true;

comment on column public.leads.is_active is
  'Operational activity flag. Estimate expiration does not deactivate a lead; only an explicit workflow or approved inactivity policy may set this false.';

commit;
