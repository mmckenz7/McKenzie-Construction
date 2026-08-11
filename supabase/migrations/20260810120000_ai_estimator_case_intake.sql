begin;

do $$
begin
  if to_regclass('public.ai_estimator_cases') is null then
    raise exception 'AI Estimator case intake requires public.ai_estimator_cases.';
  end if;
  if to_regclass('public.feature_settings') is null then
    raise exception 'AI Estimator case intake requires public.feature_settings.';
  end if;
  if exists (select 1 from public.ai_estimator_cases) then
    raise exception
      'AI Estimator case intake requires an empty shadow case table before consent enforcement.';
  end if;
end
$$;

alter table public.ai_estimator_cases
  add column recording_permission_acknowledged_at timestamptz not null,
  add column recording_permission_acknowledged_by_auth_user_id uuid not null;

alter table public.ai_estimator_cases
  add constraint ai_estimator_cases_recording_permission_check check (
    (recording_permission_acknowledged_at is null
      and recording_permission_acknowledged_by_auth_user_id is null)
    or
    (recording_permission_acknowledged_at is not null
      and recording_permission_acknowledged_by_auth_user_id is not null)
  );

comment on column public.ai_estimator_cases.recording_permission_acknowledged_at is
  'When the creating user affirmed that required permission to record was obtained. This records acknowledgment, not a legal determination.';
comment on column public.ai_estimator_cases.recording_permission_acknowledged_by_auth_user_id is
  'Auth user who made the recording-permission acknowledgment.';

insert into public.feature_settings (
  scope_type,
  scope_id,
  feature_key,
  is_enabled,
  display_name,
  description,
  category,
  sort_order
)
values (
  'global',
  'default',
  'ai_estimator',
  false,
  'AI Estimator',
  'Private draft scope extraction and human review for estimating.',
  'sales',
  110
)
on conflict (scope_type, scope_id, feature_key) do nothing;

commit;
