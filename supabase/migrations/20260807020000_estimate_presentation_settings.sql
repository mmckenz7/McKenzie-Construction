alter table public.company_settings
  add column if not exists default_estimate_detail_level text not null default 'lump_sum',
  add column if not exists default_estimate_ohp_mode text not null default 'distributed',
  add column if not exists default_estimate_lump_sum_label text not null default 'Work described in this estimate';

alter table public.estimates
  add column if not exists presentation_version text,
  add column if not exists presentation_detail_level text,
  add column if not exists presentation_ohp_mode text,
  add column if not exists presentation_lump_sum_label text;

alter table public.company_settings
  add constraint company_settings_estimate_detail_level_check
    check (default_estimate_detail_level in ('lump_sum', 'section_summary', 'itemized')) not valid,
  add constraint company_settings_estimate_ohp_mode_check
    check (default_estimate_ohp_mode in ('distributed', 'separate_line_item')) not valid,
  add constraint company_settings_estimate_lump_sum_label_check
    check (length(btrim(default_estimate_lump_sum_label)) between 1 and 240) not valid,
  add constraint company_settings_lump_sum_ohp_check
    check (default_estimate_detail_level <> 'lump_sum' or default_estimate_ohp_mode = 'distributed') not valid;

alter table public.estimates
  add constraint estimates_presentation_version_check
    check (presentation_version is null or presentation_version = 'estimate-presentation-v1') not valid,
  add constraint estimates_presentation_detail_level_check
    check (presentation_detail_level is null or presentation_detail_level in ('lump_sum', 'section_summary', 'itemized')) not valid,
  add constraint estimates_presentation_ohp_mode_check
    check (presentation_ohp_mode is null or presentation_ohp_mode in ('distributed', 'separate_line_item')) not valid,
  add constraint estimates_presentation_lump_sum_label_check
    check (presentation_lump_sum_label is null or length(btrim(presentation_lump_sum_label)) between 1 and 240) not valid,
  add constraint estimates_lump_sum_ohp_check
    check (presentation_detail_level <> 'lump_sum' or presentation_ohp_mode = 'distributed') not valid;

do $$
declare
  settings_count integer;
begin
  select count(*) into settings_count from public.company_settings;
  if settings_count <> 1 then
    raise exception 'Exactly one company_settings row is required; found %.', settings_count;
  end if;

  update public.estimates as estimate
  set presentation_version = 'estimate-presentation-v1',
      presentation_detail_level = settings.default_estimate_detail_level,
      presentation_ohp_mode = case
        when settings.default_estimate_detail_level = 'lump_sum' then 'distributed'
        else settings.default_estimate_ohp_mode
      end,
      presentation_lump_sum_label = settings.default_estimate_lump_sum_label
  from public.company_settings as settings
  where estimate.calculation_policy_version = 'structured-estimate-v1'
    and estimate.presentation_version is null;
end $$;

alter table public.company_settings
  validate constraint company_settings_estimate_detail_level_check,
  validate constraint company_settings_estimate_ohp_mode_check,
  validate constraint company_settings_estimate_lump_sum_label_check,
  validate constraint company_settings_lump_sum_ohp_check;

alter table public.estimates
  validate constraint estimates_presentation_version_check,
  validate constraint estimates_presentation_detail_level_check,
  validate constraint estimates_presentation_ohp_mode_check,
  validate constraint estimates_presentation_lump_sum_label_check,
  validate constraint estimates_lump_sum_ohp_check;

comment on column public.company_settings.default_estimate_detail_level is
  'Default customer-facing estimate detail level copied to new structured estimates.';
comment on column public.company_settings.default_estimate_ohp_mode is
  'Default customer-facing OH&P presentation copied to new non-lump-sum structured estimates.';
comment on column public.estimates.presentation_detail_level is
  'Per-estimate customer presentation snapshot; independent from the private cost sheet.';
comment on column public.estimates.presentation_ohp_mode is
  'Per-estimate choice to distribute OH&P into prices or show it as a separate adjustment.';
