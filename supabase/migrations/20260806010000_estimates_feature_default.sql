begin;

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
  'estimates',
  true,
  'Estimates',
  'Structured estimate creation and pricing workflows.',
  'sales',
  100
)
on conflict (scope_type, scope_id, feature_key) do nothing;

commit;
