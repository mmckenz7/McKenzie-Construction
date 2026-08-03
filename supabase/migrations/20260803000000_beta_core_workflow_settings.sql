alter table public.company_settings
  add column if not exists consultation_start_time time not null default '08:00:00',
  add column if not exists consultation_end_time time;

update public.company_settings
set consultation_end_time = coalesce(consultation_end_time, end_of_business_time, '17:00:00')
where consultation_end_time is null;

alter table public.company_settings
  alter column consultation_end_time set not null;

alter table public.company_settings
  add constraint company_settings_consultation_hours_valid
  check (consultation_start_time < consultation_end_time) not valid;

alter table public.company_settings
  validate constraint company_settings_consultation_hours_valid;

create table if not exists public.project_parties (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  party_type text not null check (party_type in ('subcontractor', 'vendor')),
  supplier_id uuid references public.suppliers(id) on delete restrict,
  name text not null,
  trade_role text not null,
  contact_name text,
  contact_email text,
  contact_phone text,
  workflow_permissions text[] not null default '{}',
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_parties_workflows_valid check (
    workflow_permissions <@ array['schedule', 'bid', 'material', 'vendor']::text[]
  )
);

create unique index if not exists project_parties_project_supplier_trade_unique
  on public.project_parties(project_id, supplier_id, trade_role)
  where supplier_id is not null and is_active;
create index if not exists project_parties_project_id_idx on public.project_parties(project_id);

alter table public.project_parties enable row level security;
revoke all on table public.project_parties from anon, authenticated;
grant select, insert, update, delete on table public.project_parties to service_role;
