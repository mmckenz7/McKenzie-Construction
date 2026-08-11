-- Bind each contract preparation to one immutable legal-document version.
-- This does not send a signature envelope, create a project, or authorize work.

alter table public.company_legal_documents
  add column if not exists content_sha256 text;

alter table public.company_legal_documents
  drop constraint if exists company_legal_documents_content_sha256_check;
alter table public.company_legal_documents
  add constraint company_legal_documents_content_sha256_check
  check (content_sha256 is null or content_sha256 ~ '^[0-9a-f]{64}$');

alter table public.estimate_contract_preparations
  add column if not exists legal_document_id uuid
    references public.company_legal_documents(id) on delete restrict,
  add column if not exists legal_document_snapshot jsonb,
  add column if not exists legal_document_selected_at timestamptz,
  add column if not exists legal_document_selected_by_app_user_id uuid
    references public.app_users(id) on delete restrict;

alter table public.estimate_contract_preparations
  drop constraint if exists estimate_contract_preparations_legal_document_link_check;
alter table public.estimate_contract_preparations
  add constraint estimate_contract_preparations_legal_document_link_check
  check (
    (
      legal_terms_status = 'not_configured'
      and legal_document_id is null
      and legal_document_snapshot is null
      and legal_document_selected_at is null
      and legal_document_selected_by_app_user_id is null
    )
    or (
      legal_terms_status in ('draft', 'approved')
      and legal_document_id is not null
      and legal_document_snapshot is not null
      and jsonb_typeof(legal_document_snapshot) = 'object'
      and legal_document_snapshot ->> 'schemaVersion' = 'company-legal-document-snapshot-v1'
      and legal_document_snapshot ->> 'documentId' = legal_document_id::text
      and legal_document_selected_at is not null
      and legal_document_selected_by_app_user_id is not null
    )
  );

create index if not exists estimate_contract_preparations_legal_document_idx
  on public.estimate_contract_preparations(legal_document_id, created_at desc)
  where legal_document_id is not null;

comment on column public.company_legal_documents.content_sha256 is
  'Lowercase SHA-256 of uploaded bytes. Boilerplate text is hashed when selected for a contract snapshot.';
comment on column public.estimate_contract_preparations.legal_document_snapshot is
  'Immutable identifying snapshot of the exact legal-document version and content digest selected for this contract preparation.';
