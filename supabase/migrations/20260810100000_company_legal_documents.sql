-- Company-scoped legal document library. Files are private and accessed only
-- through management-authorized server routes.

create table if not exists public.company_legal_documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company_settings(id) on delete restrict,
  document_type text not null,
  title text not null,
  version_label text not null default '1.0',
  source_kind text not null,
  boilerplate_body text,
  storage_bucket text,
  storage_path text,
  original_file_name text,
  mime_type text,
  file_size_bytes bigint,
  status text not null default 'draft',
  legal_review_status text not null default 'not_reviewed',
  is_default boolean not null default false,
  notes text,
  created_by_app_user_id uuid references public.app_users(id) on delete set null,
  reviewed_by_app_user_id uuid references public.app_users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_legal_documents_type_check
    check (document_type in ('construction_contract', 'change_order_terms', 'warranty', 'privacy', 'subcontractor_agreement', 'other')),
  constraint company_legal_documents_source_check check (source_kind in ('uploaded', 'boilerplate')),
  constraint company_legal_documents_status_check check (status in ('draft', 'active', 'archived')),
  constraint company_legal_documents_review_check check (legal_review_status in ('not_reviewed', 'beta_test_only', 'attorney_reviewed')),
  constraint company_legal_documents_title_check check (length(btrim(title)) between 1 and 240),
  constraint company_legal_documents_version_check check (length(btrim(version_label)) between 1 and 80),
  constraint company_legal_documents_source_payload_check check (
    (source_kind = 'boilerplate' and boilerplate_body is not null and storage_bucket is null and storage_path is null)
    or (source_kind = 'uploaded' and boilerplate_body is null and storage_bucket is not null and storage_path is not null and original_file_name is not null)
  ),
  constraint company_legal_documents_review_attribution_check check (
    (legal_review_status = 'not_reviewed' and reviewed_at is null and reviewed_by_app_user_id is null)
    or (legal_review_status in ('beta_test_only', 'attorney_reviewed') and reviewed_at is not null and reviewed_by_app_user_id is not null)
  )
);

create unique index if not exists company_legal_documents_default_type_uidx
  on public.company_legal_documents(company_id, document_type)
  where is_default and status <> 'archived';
create index if not exists company_legal_documents_company_idx
  on public.company_legal_documents(company_id, document_type, status, updated_at desc);

alter table public.company_legal_documents enable row level security;
revoke all on table public.company_legal_documents from public, anon, authenticated;
grant select, insert, update on table public.company_legal_documents to service_role;

drop trigger if exists set_company_legal_documents_updated_at on public.company_legal_documents;
create trigger set_company_legal_documents_updated_at
  before update on public.company_legal_documents
  for each row execute function public.set_updated_at();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'company-legal-documents',
  'company-legal-documents',
  false,
  10485760,
  array['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

insert into public.company_legal_documents (
  company_id, document_type, title, version_label, source_kind,
  boilerplate_body, status, legal_review_status, is_default, notes
)
select
  settings.id,
  'construction_contract',
  'Beta Construction Agreement Boilerplate',
  'beta-1',
  'boilerplate',
  $boilerplate$
BETA TEST CONSTRUCTION AGREEMENT — NOT ATTORNEY REVIEWED

This document is a workflow-testing placeholder only. It is not approved for live customer use and does not authorize work.

Owner: {{customer_name}}
Property: {{project_address}}
Contractor: {{company_legal_name}}
Project: {{estimate_title}}
Contract Sum: {{contract_total}}

Scope of Work
The scope, allowances, exclusions, and customer-facing pricing are contained in the attached accepted estimate snapshot.

Payment Schedule
To be replaced with company-approved payment terms before live use.

Schedule and Changes
Project timing, change authorization, delays, site conditions, warranties, dispute terms, cancellation rights, notices, and all legally required disclosures must be supplied in an attorney-reviewed replacement.

OWNER SIGNATURE: ____________________  DATE: __________
CONTRACTOR SIGNATURE: ______________  DATE: __________
$boilerplate$,
  'active',
  'not_reviewed',
  true,
  'Sandbox workflow placeholder. Live DocuSign sending remains blocked.'
from public.company_settings settings
where not exists (
  select 1 from public.company_legal_documents documents
  where documents.company_id = settings.id
    and documents.document_type = 'construction_contract'
    and documents.source_kind = 'boilerplate'
);

create or replace function public.set_company_legal_document_default(
  requested_document_id uuid,
  requested_app_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare selected public.company_legal_documents%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required.'; end if;
  if requested_app_user_id is null or not exists (select 1 from public.app_users where id = requested_app_user_id) then
    raise exception 'A valid application user is required.';
  end if;
  select * into selected from public.company_legal_documents where id = requested_document_id for update;
  if not found or selected.status = 'archived' then raise exception 'Legal document is unavailable.'; end if;
  update public.company_legal_documents set is_default = false
    where company_id = selected.company_id and document_type = selected.document_type and is_default;
  update public.company_legal_documents set is_default = true, status = 'active' where id = selected.id;
end;
$$;

revoke all on function public.set_company_legal_document_default(uuid, uuid) from public, anon, authenticated;
grant execute on function public.set_company_legal_document_default(uuid, uuid) to service_role;

comment on table public.company_legal_documents is
  'Company-scoped, versioned legal document library. not_reviewed and beta_test_only records are prohibited from live signature sending.';
