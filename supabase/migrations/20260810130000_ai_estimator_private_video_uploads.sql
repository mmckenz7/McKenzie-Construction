begin;

do $$
begin
  if to_regclass('public.ai_estimator_assets') is null then
    raise exception 'AI Estimator private uploads require public.ai_estimator_assets.';
  end if;
end
$$;

alter table public.ai_estimator_assets
  add column declared_byte_size bigint,
  add column declared_sha256 text,
  add column storage_reported_mime_type text;

alter table public.ai_estimator_assets
  add constraint ai_estimator_assets_declared_byte_size_check check (
    declared_byte_size is null
    or declared_byte_size between 1 and 52428800
  ),
  add constraint ai_estimator_assets_declared_sha256_check check (
    declared_sha256 is null
    or declared_sha256 ~ '^[0-9a-f]{64}$'
  ),
  add constraint ai_estimator_assets_user_upload_declaration_check check (
    origin <> 'user_upload'
    or (declared_byte_size is not null and declared_sha256 is not null)
  ),
  add constraint ai_estimator_assets_storage_mime_check check (
    storage_reported_mime_type is null
    or length(btrim(storage_reported_mime_type)) between 1 and 200
  );

comment on column public.ai_estimator_assets.declared_byte_size is
  'Uploader-declared bytes for user uploads. byte_size remains null until Storage metadata verification.';
comment on column public.ai_estimator_assets.declared_sha256 is
  'Uploader-declared SHA-256 for user uploads. sha256 remains null until an isolated worker hashes the stored object.';
comment on column public.ai_estimator_assets.storage_reported_mime_type is
  'Storage Content-Type metadata only; it is not signature-detected media type.';

create unique index ai_estimator_one_active_v0_video_per_case_uidx
  on public.ai_estimator_assets (company_id, case_id)
  where asset_kind = 'video'
    and origin = 'user_upload'
    and status in ('upload_pending', 'quarantined', 'available');

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'ai-estimator-private',
  'ai-estimator-private',
  false,
  52428800,
  array['video/mp4', 'video/quicktime', 'video/webm']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

commit;
