-- Provider-neutral contract preparation for accepted, nonbinding estimates.
-- This migration does not create signatures, authorize work, or convert projects.

create table if not exists public.estimate_contract_preparations (
  id uuid primary key default gen_random_uuid(),
  estimate_id uuid not null unique references public.estimates(id) on delete restrict,
  lead_id uuid references public.leads(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  status text not null default 'draft',
  snapshot_version text not null default 'estimate-contract-preparation-v1',
  customer_document jsonb not null,
  recipient_name text not null,
  recipient_email text,
  legal_terms_status text not null default 'not_configured',
  signature_provider text,
  signature_envelope_id text,
  sent_for_signature_at timestamptz,
  signed_at timestamptz,
  voided_at timestamptz,
  created_by_app_user_id uuid not null references public.app_users(id) on delete restrict,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint estimate_contract_preparations_status_check
    check (status in ('draft', 'ready_for_signature', 'sent_for_signature', 'signed', 'void')),
  constraint estimate_contract_preparations_snapshot_check
    check (snapshot_version = 'estimate-contract-preparation-v1'),
  constraint estimate_contract_preparations_recipient_name_check
    check (length(btrim(recipient_name)) between 1 and 240),
  constraint estimate_contract_preparations_legal_terms_check
    check (legal_terms_status in ('not_configured', 'draft', 'approved')),
  constraint estimate_contract_preparations_signature_boundary_check
    check (
      (status in ('draft', 'ready_for_signature') and sent_for_signature_at is null and signed_at is null)
      or (status = 'sent_for_signature' and sent_for_signature_at is not null and signed_at is null)
      or (status = 'signed' and sent_for_signature_at is not null and signed_at is not null)
      or status = 'void'
    )
);

create index if not exists estimate_contract_preparations_lead_idx
  on public.estimate_contract_preparations(lead_id, created_at desc);
create index if not exists estimate_contract_preparations_customer_idx
  on public.estimate_contract_preparations(customer_id, created_at desc);

alter table public.estimate_contract_preparations enable row level security;
revoke all on table public.estimate_contract_preparations from public, anon, authenticated;
grant select, insert, update, delete on table public.estimate_contract_preparations to service_role;

drop trigger if exists set_estimate_contract_preparations_updated_at
  on public.estimate_contract_preparations;
create trigger set_estimate_contract_preparations_updated_at
  before update on public.estimate_contract_preparations
  for each row execute function public.set_updated_at();

comment on table public.estimate_contract_preparations is
  'Internal, provider-neutral contract packages created only after nonbinding estimate acceptance. A row does not authorize work or create a project.';
comment on column public.estimate_contract_preparations.customer_document is
  'Frozen customer-safe estimate projection. Raw cost, markup, profit, and internal notes are prohibited by the application boundary.';
comment on column public.estimate_contract_preparations.legal_terms_status is
  'Contract cannot become ready for signature until company-approved legal terms are configured.';
