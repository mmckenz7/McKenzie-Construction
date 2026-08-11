begin;

do $$
declare
  required_table text;
  settings_count bigint;
begin
  foreach required_table in array array[
    'company_settings', 'leads', 'customers', 'projects', 'estimates', 'app_users'
  ]::text[] loop
    if to_regclass('public.' || required_table) is null then
      raise exception 'AI Estimator requires public.%.', required_table;
    end if;
  end loop;

  select count(*) into settings_count from public.company_settings;
  if settings_count <> 1 then
    raise exception
      'AI Estimator V0 requires exactly one company_settings row; found %.',
      settings_count;
  end if;
end
$$;

create table public.ai_estimator_cases (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company_settings(id) on delete restrict,
  lead_id uuid not null references public.leads(id) on delete restrict,
  customer_id uuid references public.customers(id) on delete restrict,
  project_id uuid references public.projects(id) on delete restrict,
  target_estimate_id uuid references public.estimates(id) on delete restrict,
  status text not null default 'intake',
  title text not null,
  retention_policy_version text not null,
  created_by_auth_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_estimator_cases_status_check check (status in (
    'intake', 'processing', 'review_ready', 'in_review', 'approved',
    'applied', 'archived', 'cancelled'
  )),
  constraint ai_estimator_cases_title_check check (length(btrim(title)) between 1 and 500),
  constraint ai_estimator_cases_retention_check
    check (length(btrim(retention_policy_version)) between 1 and 100),
  constraint ai_estimator_cases_id_company_unique unique (id, company_id)
);

comment on table public.ai_estimator_cases is
  'Private AI interpretation workspace. Case state has no automatic effect on lead, estimate, contract, or project lifecycle.';
comment on column public.ai_estimator_cases.company_id is
  'Temporary V0 company anchor to the required singleton company_settings row.';

create table public.ai_estimator_assets (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company_settings(id) on delete restrict,
  case_id uuid not null,
  parent_asset_id uuid,
  asset_kind text not null,
  origin text not null,
  storage_bucket text,
  storage_path text,
  external_reference text,
  original_filename text not null,
  mime_type text not null,
  byte_size bigint,
  sha256 text,
  captured_at timestamptz,
  duration_ms bigint,
  page_count integer,
  pixel_width integer,
  pixel_height integer,
  spatial_metadata jsonb not null default '{}'::jsonb,
  status text not null default 'upload_pending',
  retention_deadline timestamptz,
  deleted_at timestamptz,
  created_by_auth_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_estimator_assets_case_company_fkey
    foreign key (case_id, company_id)
    references public.ai_estimator_cases(id, company_id) on delete restrict,
  constraint ai_estimator_assets_id_case_company_unique
    unique (id, case_id, company_id),
  constraint ai_estimator_assets_parent_case_fkey
    foreign key (parent_asset_id, case_id, company_id)
    references public.ai_estimator_assets(id, case_id, company_id) on delete restrict,
  constraint ai_estimator_assets_kind_check check (asset_kind in (
    'video', 'audio', 'photo', 'drawing_pdf', 'drawing_page',
    'lidar_capture', 'matterport_model', 'point_cloud', 'other'
  )),
  constraint ai_estimator_assets_origin_check check (origin in (
    'user_upload', 'derived', 'external_reference'
  )),
  constraint ai_estimator_assets_status_check check (status in (
    'upload_pending', 'available', 'quarantined', 'deletion_pending',
    'deleted', 'failed_validation'
  )),
  constraint ai_estimator_assets_location_check check (
    (origin = 'external_reference'
      and nullif(btrim(external_reference), '') is not null
      and storage_bucket is null and storage_path is null)
    or
    (origin <> 'external_reference'
      and nullif(btrim(storage_bucket), '') is not null
      and nullif(btrim(storage_path), '') is not null
      and external_reference is null)
  ),
  constraint ai_estimator_assets_filename_check
    check (length(btrim(original_filename)) between 1 and 500),
  constraint ai_estimator_assets_mime_check
    check (length(btrim(mime_type)) between 1 and 200),
  constraint ai_estimator_assets_byte_size_check check (byte_size is null or byte_size > 0),
  constraint ai_estimator_assets_sha256_check
    check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  constraint ai_estimator_assets_duration_check check (duration_ms is null or duration_ms > 0),
  constraint ai_estimator_assets_page_count_check check (page_count is null or page_count > 0),
  constraint ai_estimator_assets_pixel_size_check check (
    (pixel_width is null and pixel_height is null)
    or (pixel_width > 0 and pixel_height > 0)
  ),
  constraint ai_estimator_assets_spatial_metadata_check
    check (jsonb_typeof(spatial_metadata) = 'object'
      and octet_length(spatial_metadata::text) <= 65536),
  constraint ai_estimator_assets_deleted_state_check check (
    (status = 'deleted' and deleted_at is not null)
    or (status <> 'deleted' and deleted_at is null)
  )
);

create table public.ai_estimator_processing_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company_settings(id) on delete restrict,
  case_id uuid not null,
  run_number integer not null,
  status text not null default 'queued',
  stage text not null default 'queued',
  idempotency_key text not null,
  pipeline_version text not null,
  schema_version text not null,
  prompt_version text not null,
  selected_asset_ids jsonb not null,
  lease_owner text,
  lease_expires_at timestamptz,
  attempt_count integer not null default 0,
  failure_code text,
  queued_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_by_auth_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_estimator_runs_case_company_fkey
    foreign key (case_id, company_id)
    references public.ai_estimator_cases(id, company_id) on delete restrict,
  constraint ai_estimator_runs_id_case_company_unique
    unique (id, case_id, company_id),
  constraint ai_estimator_runs_case_number_unique unique (case_id, run_number),
  constraint ai_estimator_runs_case_idempotency_unique unique (case_id, idempotency_key),
  constraint ai_estimator_runs_number_check check (run_number > 0),
  constraint ai_estimator_runs_attempt_check check (attempt_count >= 0),
  constraint ai_estimator_runs_status_check check (status in (
    'queued', 'processing', 'completed', 'failed', 'cancelled'
  )),
  constraint ai_estimator_runs_stage_check check (stage in (
    'queued', 'preparing', 'transcribing', 'extracting', 'validating',
    'completed', 'failed', 'cancelled'
  )),
  constraint ai_estimator_runs_idempotency_check
    check (length(btrim(idempotency_key)) between 1 and 512),
  constraint ai_estimator_runs_versions_check check (
    nullif(btrim(pipeline_version), '') is not null
    and schema_version = 'ai-estimator-extraction-v0'
    and nullif(btrim(prompt_version), '') is not null
  ),
  constraint ai_estimator_runs_assets_check check (
    jsonb_typeof(selected_asset_ids) = 'array'
    and jsonb_array_length(selected_asset_ids) between 1 and 32
    and octet_length(selected_asset_ids::text) <= 4096
  ),
  constraint ai_estimator_runs_lease_check check (
    (lease_owner is null and lease_expires_at is null)
    or (nullif(btrim(lease_owner), '') is not null and lease_expires_at is not null)
  ),
  constraint ai_estimator_runs_terminal_time_check check (
    (status = 'completed' and completed_at is not null and cancelled_at is null)
    or (status = 'cancelled' and cancelled_at is not null and completed_at is null)
    or (status not in ('completed', 'cancelled') and completed_at is null and cancelled_at is null)
  )
);

create table public.ai_estimator_model_calls (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company_settings(id) on delete restrict,
  case_id uuid not null,
  processing_run_id uuid not null,
  purpose text not null,
  provider text not null,
  model_alias text not null,
  model_snapshot text,
  region text,
  adapter_version text not null,
  request_hash text not null,
  response_hash text,
  provider_request_id text,
  prompt_version text,
  schema_version text,
  status text not null,
  finish_reason text,
  latency_ms bigint,
  retry_number integer not null default 0,
  input_tokens bigint,
  cached_input_tokens bigint,
  output_tokens bigint,
  audio_seconds numeric(14,3),
  video_seconds numeric(14,3),
  image_count integer,
  page_count integer,
  provider_reported_cost_usd numeric(14,6),
  estimated_cost_usd numeric(14,6),
  retention_mode text not null,
  provider_file_deleted_at timestamptz,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint ai_estimator_calls_run_case_company_fkey
    foreign key (processing_run_id, case_id, company_id)
    references public.ai_estimator_processing_runs(id, case_id, company_id) on delete restrict,
  constraint ai_estimator_calls_purpose_check check (purpose in (
    'transcription', 'structured_extraction', 'image_understanding',
    'video_understanding', 'pdf_understanding', 'embedding'
  )),
  constraint ai_estimator_calls_status_check check (status in (
    'started', 'completed', 'failed', 'cancelled'
  )),
  constraint ai_estimator_calls_retention_check check (retention_mode in (
    'provider_default', 'zero_data_retention', 'regional_processing'
  )),
  constraint ai_estimator_calls_hash_check check (
    request_hash ~ '^[0-9a-f]{64}$'
    and (response_hash is null or response_hash ~ '^[0-9a-f]{64}$')
  ),
  constraint ai_estimator_calls_usage_check check (
    coalesce(latency_ms, 0) >= 0 and retry_number >= 0
    and coalesce(input_tokens, 0) >= 0 and coalesce(cached_input_tokens, 0) >= 0
    and coalesce(output_tokens, 0) >= 0 and coalesce(audio_seconds, 0) >= 0
    and coalesce(video_seconds, 0) >= 0 and coalesce(image_count, 0) >= 0
    and coalesce(page_count, 0) >= 0 and coalesce(provider_reported_cost_usd, 0) >= 0
    and coalesce(estimated_cost_usd, 0) >= 0
  )
);

create table public.ai_estimator_transcripts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company_settings(id) on delete restrict,
  case_id uuid not null,
  processing_run_id uuid not null,
  source_asset_id uuid not null,
  version integer not null,
  language text,
  normalized_text text not null,
  duration_ms bigint not null,
  provider text not null,
  model_snapshot text,
  provider_metadata jsonb not null default '{}'::jsonb,
  content_hash text not null,
  created_at timestamptz not null default now(),
  constraint ai_estimator_transcripts_run_case_company_fkey
    foreign key (processing_run_id, case_id, company_id)
    references public.ai_estimator_processing_runs(id, case_id, company_id) on delete restrict,
  constraint ai_estimator_transcripts_asset_case_company_fkey
    foreign key (source_asset_id, case_id, company_id)
    references public.ai_estimator_assets(id, case_id, company_id) on delete restrict,
  constraint ai_estimator_transcripts_case_version_unique unique (case_id, source_asset_id, version),
  constraint ai_estimator_transcripts_version_check check (version > 0),
  constraint ai_estimator_transcripts_text_check check (
    length(normalized_text) between 1 and 2000000
  ),
  constraint ai_estimator_transcripts_duration_check check (duration_ms > 0),
  constraint ai_estimator_transcripts_hash_check check (content_hash ~ '^[0-9a-f]{64}$'),
  constraint ai_estimator_transcripts_metadata_check check (
    jsonb_typeof(provider_metadata) = 'object'
    and octet_length(provider_metadata::text) <= 65536
  ),
  constraint ai_estimator_transcripts_identity_unique
    unique (id, source_asset_id, case_id, company_id)
);

create table public.ai_estimator_transcript_segments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company_settings(id) on delete restrict,
  case_id uuid not null,
  transcript_id uuid not null,
  source_asset_id uuid not null,
  ordinal integer not null,
  start_ms bigint not null,
  end_ms bigint not null,
  speaker_label text,
  segment_text text not null,
  language text,
  confidence numeric(6,5),
  provider_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint ai_estimator_segments_transcript_context_fkey
    foreign key (transcript_id, source_asset_id, case_id, company_id)
    references public.ai_estimator_transcripts(
      id, source_asset_id, case_id, company_id
    ) on delete restrict,
  constraint ai_estimator_segments_transcript_ordinal_unique unique (transcript_id, ordinal),
  constraint ai_estimator_segments_ordinal_check check (ordinal >= 0),
  constraint ai_estimator_segments_time_check check (start_ms >= 0 and end_ms > start_ms),
  constraint ai_estimator_segments_text_check check (length(segment_text) between 1 and 10000),
  constraint ai_estimator_segments_confidence_check
    check (confidence is null or confidence between 0 and 1),
  constraint ai_estimator_segments_metadata_check check (
    jsonb_typeof(provider_metadata) = 'object'
    and octet_length(provider_metadata::text) <= 16384
  )
);

create table public.ai_estimator_draft_revisions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company_settings(id) on delete restrict,
  case_id uuid not null,
  processing_run_id uuid not null,
  schema_version text not null,
  extraction jsonb not null,
  content_hash text not null,
  fact_count integer not null,
  section_count integer not null,
  item_count integer not null,
  unknown_count integer not null,
  question_count integer not null,
  created_at timestamptz not null default now(),
  constraint ai_estimator_drafts_run_case_company_fkey
    foreign key (processing_run_id, case_id, company_id)
    references public.ai_estimator_processing_runs(id, case_id, company_id) on delete restrict,
  constraint ai_estimator_drafts_run_unique unique (processing_run_id),
  constraint ai_estimator_drafts_context_unique
    unique (id, processing_run_id, case_id, company_id),
  constraint ai_estimator_drafts_schema_check
    check (schema_version = 'ai-estimator-extraction-v0'),
  constraint ai_estimator_drafts_extraction_check check (
    jsonb_typeof(extraction) = 'object'
    and octet_length(extraction::text) <= 4000000
    and extraction->>'schemaVersion' = schema_version
  ),
  constraint ai_estimator_drafts_hash_check check (content_hash ~ '^[0-9a-f]{64}$'),
  constraint ai_estimator_drafts_counts_check check (
    fact_count >= 0 and section_count >= 0 and item_count >= 0
    and unknown_count >= 0 and question_count >= 0
  )
);

create table public.ai_estimator_facts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company_settings(id) on delete restrict,
  case_id uuid not null,
  processing_run_id uuid not null,
  draft_revision_id uuid not null,
  run_local_fact_id text not null,
  fact_kind text not null,
  semantic_key text not null,
  label text not null,
  original_value jsonb not null,
  unit text,
  dimension text not null,
  source_type text not null,
  verification_state text not null,
  confidence numeric(6,5) not null,
  evidence jsonb not null,
  contradiction_group_id text,
  blocking boolean not null default false,
  derivation jsonb,
  created_at timestamptz not null default now(),
  constraint ai_estimator_facts_draft_run_context_fkey
    foreign key (draft_revision_id, processing_run_id, case_id, company_id)
    references public.ai_estimator_draft_revisions(
      id, processing_run_id, case_id, company_id
    ) on delete restrict,
  constraint ai_estimator_facts_draft_local_unique unique (draft_revision_id, run_local_fact_id),
  constraint ai_estimator_facts_id_case_company_unique unique (id, case_id, company_id),
  constraint ai_estimator_facts_kind_check check (fact_kind in (
    'measurement', 'scope', 'condition', 'material', 'exclusion',
    'assumption', 'other'
  )),
  constraint ai_estimator_facts_semantic_key_check
    check (semantic_key ~ '^[A-Za-z0-9_.-]{1,200}$'),
  constraint ai_estimator_facts_label_check check (length(btrim(label)) between 1 and 500),
  constraint ai_estimator_facts_value_check
    check (jsonb_typeof(original_value) in ('string', 'boolean', 'null')),
  constraint ai_estimator_facts_dimension_check check (dimension in (
    'count', 'length', 'area', 'volume', 'weight', 'angle',
    'duration', 'rate', 'other'
  )),
  constraint ai_estimator_facts_source_check check (source_type in (
    'spoken', 'drawing', 'LiDAR', 'Matterport', 'visual_estimate', 'derived'
  )),
  constraint ai_estimator_facts_verification_check
    check (verification_state in ('high_confidence', 'estimated', 'unverified')),
  constraint ai_estimator_facts_confidence_check check (confidence between 0 and 1),
  constraint ai_estimator_facts_evidence_check check (
    jsonb_typeof(evidence) = 'array'
    and octet_length(evidence::text) <= 262144
  ),
  constraint ai_estimator_facts_derivation_check check (
    (source_type = 'derived' and jsonb_typeof(derivation) = 'object')
    or (source_type <> 'derived' and derivation is null and jsonb_array_length(evidence) > 0)
  )
);

create table public.ai_estimator_fact_values (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company_settings(id) on delete restrict,
  case_id uuid not null,
  fact_id uuid not null,
  value_stage text not null,
  value jsonb not null,
  unit text,
  verification_state text not null,
  source_type text not null,
  source_reference text,
  processing_run_id uuid,
  actor_auth_user_id uuid,
  supersedes_value_id uuid,
  reason text,
  created_at timestamptz not null default now(),
  constraint ai_estimator_values_fact_case_company_fkey
    foreign key (fact_id, case_id, company_id)
    references public.ai_estimator_facts(id, case_id, company_id) on delete restrict,
  constraint ai_estimator_values_run_case_company_fkey
    foreign key (processing_run_id, case_id, company_id)
    references public.ai_estimator_processing_runs(id, case_id, company_id) on delete restrict,
  constraint ai_estimator_values_id_case_company_unique unique (id, case_id, company_id),
  constraint ai_estimator_values_id_fact_case_company_unique
    unique (id, fact_id, case_id, company_id),
  constraint ai_estimator_values_supersedes_same_fact_fkey
    foreign key (supersedes_value_id, fact_id, case_id, company_id)
    references public.ai_estimator_fact_values(id, fact_id, case_id, company_id) on delete restrict,
  constraint ai_estimator_values_stage_check check (value_stage in (
    'ai_original', 'human_corrected', 'final_estimate', 'final_actual'
  )),
  constraint ai_estimator_values_value_check
    check (jsonb_typeof(value) in ('string', 'boolean', 'null')),
  constraint ai_estimator_values_verification_check check (verification_state in (
    'verified', 'high_confidence', 'estimated', 'unverified'
  )),
  constraint ai_estimator_values_source_check check (source_type in (
    'manual', 'spoken', 'drawing', 'LiDAR', 'Matterport',
    'visual_estimate', 'derived', 'final_estimate', 'final_actual'
  )),
  constraint ai_estimator_values_stage_actor_check check (
    (value_stage = 'ai_original'
      and processing_run_id is not null
      and actor_auth_user_id is null
      and verification_state <> 'verified')
    or (value_stage <> 'ai_original' and actor_auth_user_id is not null)
  )
);

create unique index ai_estimator_values_one_original_idx
  on public.ai_estimator_fact_values(fact_id)
  where value_stage = 'ai_original';

create table public.ai_estimator_review_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company_settings(id) on delete restrict,
  case_id uuid not null,
  review_session_id uuid not null,
  action text not null,
  target_type text not null,
  target_id text not null,
  old_value_id uuid,
  new_value_id uuid,
  reason text,
  actor_auth_user_id uuid not null,
  created_at timestamptz not null default now(),
  constraint ai_estimator_reviews_case_company_fkey
    foreign key (case_id, company_id)
    references public.ai_estimator_cases(id, company_id) on delete restrict,
  constraint ai_estimator_reviews_old_value_context_fkey
    foreign key (old_value_id, case_id, company_id)
    references public.ai_estimator_fact_values(id, case_id, company_id) on delete restrict,
  constraint ai_estimator_reviews_new_value_context_fkey
    foreign key (new_value_id, case_id, company_id)
    references public.ai_estimator_fact_values(id, case_id, company_id) on delete restrict,
  constraint ai_estimator_reviews_action_check check (action in (
    'fact_accepted', 'fact_modified', 'fact_rejected', 'question_answered',
    'question_waived', 'section_approved', 'item_approved', 'item_merged',
    'item_split', 'item_reordered', 'draft_approved', 'import_previewed',
    'draft_applied'
  )),
  constraint ai_estimator_reviews_target_check
    check (target_type in ('fact', 'question', 'section', 'item', 'draft', 'application')),
  constraint ai_estimator_reviews_target_id_check
    check (length(btrim(target_id)) between 1 and 200),
  constraint ai_estimator_reviews_reason_check
    check (reason is null or length(reason) between 1 and 5000)
);

create table public.ai_estimator_applications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company_settings(id) on delete restrict,
  case_id uuid not null,
  target_estimate_id uuid not null references public.estimates(id) on delete restrict,
  idempotency_key text not null,
  approved_review_hash text not null,
  preview_hash text not null,
  expected_calculation_revision integer not null,
  resulting_calculation_revision integer,
  status text not null default 'previewed',
  failure_code text,
  canonical_mapping jsonb not null default '{}'::jsonb,
  actor_auth_user_id uuid not null,
  previewed_at timestamptz not null default now(),
  applied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_estimator_apps_case_company_fkey
    foreign key (case_id, company_id)
    references public.ai_estimator_cases(id, company_id) on delete restrict,
  constraint ai_estimator_apps_case_idempotency_unique unique (case_id, idempotency_key),
  constraint ai_estimator_apps_status_check check (status in (
    'previewed', 'applying', 'applied', 'failed', 'cancelled'
  )),
  constraint ai_estimator_apps_hash_check check (
    approved_review_hash ~ '^[0-9a-f]{64}$' and preview_hash ~ '^[0-9a-f]{64}$'
  ),
  constraint ai_estimator_apps_revision_check check (
    expected_calculation_revision >= 0
    and (resulting_calculation_revision is null or resulting_calculation_revision > expected_calculation_revision)
  ),
  constraint ai_estimator_apps_mapping_check check (
    jsonb_typeof(canonical_mapping) = 'object'
    and octet_length(canonical_mapping::text) <= 1048576
  ),
  constraint ai_estimator_apps_applied_state_check check (
    (status = 'applied' and applied_at is not null and resulting_calculation_revision is not null)
    or (status <> 'applied' and applied_at is null)
  )
);

create or replace function public.enforce_ai_estimator_case_context()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  singleton_company_id uuid;
  settings_count bigint;
  related_customer_id uuid;
  related_lead_id uuid;
  estimate_record public.estimates;
begin
  select
    (select id from public.company_settings limit 1),
    (select count(*) from public.company_settings)
  into singleton_company_id, settings_count;

  if settings_count <> 1 or new.company_id is distinct from singleton_company_id then
    raise exception 'AI Estimator case company context is invalid.';
  end if;

  if new.customer_id is not null then
    select source_lead_id into related_lead_id
    from public.customers where id = new.customer_id;
    if not found or related_lead_id is distinct from new.lead_id then
      raise exception 'AI Estimator customer does not belong to the case lead.';
    end if;
  end if;

  if new.project_id is not null then
    select customer_id into related_customer_id
    from public.projects where id = new.project_id;
    if not found then
      raise exception 'AI Estimator project context is invalid.';
    end if;
    if new.customer_id is not null and related_customer_id is distinct from new.customer_id then
      raise exception 'AI Estimator project does not belong to the case customer.';
    end if;
    select source_lead_id into related_lead_id
    from public.customers where id = related_customer_id;
    if related_lead_id is distinct from new.lead_id then
      raise exception 'AI Estimator project does not belong to the case lead.';
    end if;
  end if;

  if new.target_estimate_id is not null then
    select * into estimate_record from public.estimates where id = new.target_estimate_id;
    if estimate_record.id is null then
      raise exception 'AI Estimator target estimate context is invalid.';
    end if;
    if estimate_record.lead_id is distinct from new.lead_id then
      if estimate_record.customer_id is null then
        raise exception 'AI Estimator target estimate does not belong to the case lead.';
      end if;
      select source_lead_id into related_lead_id
      from public.customers where id = estimate_record.customer_id;
      if related_lead_id is distinct from new.lead_id then
        raise exception 'AI Estimator target estimate does not belong to the case lead.';
      end if;
    end if;
    if new.customer_id is not null
      and estimate_record.customer_id is not null
      and estimate_record.customer_id is distinct from new.customer_id then
      raise exception 'AI Estimator target estimate customer is inconsistent.';
    end if;
    if new.project_id is not null
      and estimate_record.project_id is not null
      and estimate_record.project_id is distinct from new.project_id then
      raise exception 'AI Estimator target estimate project is inconsistent.';
    end if;
  end if;

  if new.status = 'applied' and not exists (
    select 1 from public.ai_estimator_applications
    where case_id = new.id and status = 'applied'
  ) then
    raise exception 'AI Estimator case cannot be applied without a successful application.';
  end if;

  return new;
end;
$$;

create trigger enforce_ai_estimator_case_context
  before insert or update on public.ai_estimator_cases
  for each row execute function public.enforce_ai_estimator_case_context();

create or replace function public.enforce_ai_estimator_application_context()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  case_target_estimate_id uuid;
  estimate_status text;
  estimate_policy text;
begin
  select target_estimate_id
  into case_target_estimate_id
  from public.ai_estimator_cases
  where id = new.case_id
    and company_id = new.company_id;

  if not found
    or case_target_estimate_id is null
    or case_target_estimate_id is distinct from new.target_estimate_id then
    raise exception 'AI Estimator application target does not match its case.';
  end if;

  select status, calculation_policy_version
  into estimate_status, estimate_policy
  from public.estimates
  where id = new.target_estimate_id;

  if estimate_status is distinct from 'draft'
    or estimate_policy is distinct from 'structured-estimate-v1' then
    raise exception 'AI Estimator applications require a structured draft estimate.';
  end if;

  return new;
end;
$$;

create trigger enforce_ai_estimator_application_context
  before insert or update on public.ai_estimator_applications
  for each row execute function public.enforce_ai_estimator_application_context();

create or replace function public.prevent_ai_estimator_immutable_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception using
    errcode = '55000',
    message = 'AI Estimator evidence and review history are append-only';
end;
$$;

create trigger prevent_ai_estimator_transcript_mutation
  before update or delete on public.ai_estimator_transcripts
  for each row execute function public.prevent_ai_estimator_immutable_mutation();
create trigger prevent_ai_estimator_segment_mutation
  before update or delete on public.ai_estimator_transcript_segments
  for each row execute function public.prevent_ai_estimator_immutable_mutation();
create trigger prevent_ai_estimator_draft_mutation
  before update or delete on public.ai_estimator_draft_revisions
  for each row execute function public.prevent_ai_estimator_immutable_mutation();
create trigger prevent_ai_estimator_fact_mutation
  before update or delete on public.ai_estimator_facts
  for each row execute function public.prevent_ai_estimator_immutable_mutation();
create trigger prevent_ai_estimator_value_mutation
  before update or delete on public.ai_estimator_fact_values
  for each row execute function public.prevent_ai_estimator_immutable_mutation();
create trigger prevent_ai_estimator_review_mutation
  before update or delete on public.ai_estimator_review_events
  for each row execute function public.prevent_ai_estimator_immutable_mutation();

create trigger set_ai_estimator_cases_updated_at
  before update on public.ai_estimator_cases
  for each row execute function public.set_updated_at();
create trigger set_ai_estimator_assets_updated_at
  before update on public.ai_estimator_assets
  for each row execute function public.set_updated_at();
create trigger set_ai_estimator_runs_updated_at
  before update on public.ai_estimator_processing_runs
  for each row execute function public.set_updated_at();
create trigger set_ai_estimator_apps_updated_at
  before update on public.ai_estimator_applications
  for each row execute function public.set_updated_at();

create index ai_estimator_cases_company_created_idx
  on public.ai_estimator_cases(company_id, created_at desc, id);
create index ai_estimator_cases_lead_created_idx
  on public.ai_estimator_cases(company_id, lead_id, created_at desc, id);
create index ai_estimator_assets_case_created_idx
  on public.ai_estimator_assets(company_id, case_id, created_at, id);
create index ai_estimator_runs_case_created_idx
  on public.ai_estimator_processing_runs(company_id, case_id, created_at desc, id);
create index ai_estimator_runs_lease_idx
  on public.ai_estimator_processing_runs(status, lease_expires_at, queued_at)
  where status in ('queued', 'processing');
create index ai_estimator_calls_run_created_idx
  on public.ai_estimator_model_calls(company_id, processing_run_id, created_at, id);
create index ai_estimator_segments_transcript_time_idx
  on public.ai_estimator_transcript_segments(transcript_id, start_ms, end_ms, id);
create index ai_estimator_facts_case_semantic_idx
  on public.ai_estimator_facts(company_id, case_id, semantic_key, created_at, id);
create index ai_estimator_values_fact_created_idx
  on public.ai_estimator_fact_values(company_id, fact_id, created_at, id);
create index ai_estimator_reviews_case_created_idx
  on public.ai_estimator_review_events(company_id, case_id, created_at, id);
create index ai_estimator_apps_case_created_idx
  on public.ai_estimator_applications(company_id, case_id, created_at desc, id);

create or replace function public.claim_ai_estimator_processing_run(
  requested_worker_id text,
  requested_lease_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  run_record public.ai_estimator_processing_runs;
begin
  if nullif(btrim(coalesce(requested_worker_id, '')), '') is null
    or length(requested_worker_id) > 200
    or requested_lease_seconds not between 30 and 900 then
    raise exception 'Invalid AI Estimator worker lease request.';
  end if;

  select * into run_record
  from public.ai_estimator_processing_runs
  where status = 'queued'
    or (
      status = 'processing'
      and lease_expires_at is not null
      and lease_expires_at <= now()
    )
  order by queued_at, id
  for update skip locked
  limit 1;

  if run_record.id is null then
    return null;
  end if;

  update public.ai_estimator_processing_runs
  set status = 'processing',
      stage = case when status = 'queued' then 'preparing' else stage end,
      lease_owner = btrim(requested_worker_id),
      lease_expires_at = now() + make_interval(secs => requested_lease_seconds),
      attempt_count = attempt_count + 1,
      started_at = coalesce(started_at, now()),
      failure_code = null
  where id = run_record.id
  returning * into run_record;

  return jsonb_build_object(
    'id', run_record.id,
    'company_id', run_record.company_id,
    'case_id', run_record.case_id,
    'run_number', run_record.run_number,
    'pipeline_version', run_record.pipeline_version,
    'schema_version', run_record.schema_version,
    'prompt_version', run_record.prompt_version,
    'selected_asset_ids', run_record.selected_asset_ids,
    'lease_owner', run_record.lease_owner,
    'lease_expires_at', run_record.lease_expires_at,
    'attempt_count', run_record.attempt_count
  );
end;
$$;

create or replace function public.heartbeat_ai_estimator_processing_run(
  requested_run_id uuid,
  requested_worker_id text,
  requested_lease_seconds integer,
  requested_stage text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_count integer;
begin
  if requested_run_id is null
    or nullif(btrim(coalesce(requested_worker_id, '')), '') is null
    or length(requested_worker_id) > 200
    or requested_lease_seconds not between 30 and 900
    or requested_stage not in (
      'preparing', 'transcribing', 'extracting', 'validating'
    ) then
    raise exception 'Invalid AI Estimator worker heartbeat.';
  end if;

  update public.ai_estimator_processing_runs
  set stage = requested_stage,
      lease_expires_at = now() + make_interval(secs => requested_lease_seconds)
  where id = requested_run_id
    and status = 'processing'
    and lease_owner = btrim(requested_worker_id)
    and lease_expires_at > now();

  get diagnostics updated_count = row_count;
  return updated_count = 1;
end;
$$;

create or replace function public.fail_ai_estimator_processing_run(
  requested_run_id uuid,
  requested_worker_id text,
  requested_failure_code text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_count integer;
begin
  if requested_run_id is null
    or nullif(btrim(coalesce(requested_worker_id, '')), '') is null
    or requested_failure_code is null
    or requested_failure_code !~ '^[a-z][a-z0-9_]{0,99}$' then
    raise exception 'Invalid AI Estimator worker failure.';
  end if;

  update public.ai_estimator_processing_runs
  set status = 'failed',
      stage = 'failed',
      failure_code = requested_failure_code,
      lease_owner = null,
      lease_expires_at = null
  where id = requested_run_id
    and status = 'processing'
    and lease_owner = btrim(requested_worker_id)
    and lease_expires_at > now();

  get diagnostics updated_count = row_count;
  return updated_count = 1;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'ai_estimator_cases', 'ai_estimator_assets', 'ai_estimator_processing_runs',
    'ai_estimator_model_calls', 'ai_estimator_transcripts',
    'ai_estimator_transcript_segments', 'ai_estimator_draft_revisions',
    'ai_estimator_facts', 'ai_estimator_fact_values',
    'ai_estimator_review_events', 'ai_estimator_applications'
  ]::text[] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
    execute format(
      'revoke all on table public.%I from public, anon, authenticated, service_role',
      table_name
    );
  end loop;
end
$$;

grant select, insert, update on table
  public.ai_estimator_cases,
  public.ai_estimator_assets,
  public.ai_estimator_processing_runs,
  public.ai_estimator_model_calls,
  public.ai_estimator_applications
to service_role;

grant select, insert on table
  public.ai_estimator_transcripts,
  public.ai_estimator_transcript_segments,
  public.ai_estimator_draft_revisions,
  public.ai_estimator_facts,
  public.ai_estimator_fact_values,
  public.ai_estimator_review_events
to service_role;

revoke all on function public.enforce_ai_estimator_case_context()
  from public, anon, authenticated, service_role;
revoke all on function public.enforce_ai_estimator_application_context()
  from public, anon, authenticated, service_role;
revoke all on function public.prevent_ai_estimator_immutable_mutation()
  from public, anon, authenticated, service_role;
revoke all on function public.claim_ai_estimator_processing_run(text, integer)
  from public, anon, authenticated;
revoke all on function public.heartbeat_ai_estimator_processing_run(uuid, text, integer, text)
  from public, anon, authenticated;
revoke all on function public.fail_ai_estimator_processing_run(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.claim_ai_estimator_processing_run(text, integer)
  to service_role;
grant execute on function public.heartbeat_ai_estimator_processing_run(uuid, text, integer, text)
  to service_role;
grant execute on function public.fail_ai_estimator_processing_run(uuid, text, text)
  to service_role;

comment on table public.ai_estimator_draft_revisions is
  'Immutable validated provider extraction. It is shadow data and never a customer estimate.';
comment on table public.ai_estimator_fact_values is
  'Append-only AI, human-corrected, final-estimate, and final-actual value lineage.';
comment on table public.ai_estimator_applications is
  'Audit record for explicit previewed canonical imports. This migration creates no import RPC.';

commit;
