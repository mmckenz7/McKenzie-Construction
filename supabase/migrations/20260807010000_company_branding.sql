alter table public.company_settings
  add column if not exists brand_logo_url text,
  add column if not exists brand_primary_color text not null default '#3B82F6',
  add column if not exists brand_accent_color text not null default '#D2A679';

alter table public.company_settings
  drop constraint if exists company_settings_brand_primary_color_check,
  add constraint company_settings_brand_primary_color_check
    check (brand_primary_color ~ '^#[0-9A-Fa-f]{6}$') not valid,
  drop constraint if exists company_settings_brand_accent_color_check,
  add constraint company_settings_brand_accent_color_check
    check (brand_accent_color ~ '^#[0-9A-Fa-f]{6}$') not valid,
  drop constraint if exists company_settings_brand_logo_url_check,
  add constraint company_settings_brand_logo_url_check
    check (brand_logo_url is null or brand_logo_url ~ '^(\/|https:\/\/)') not valid;

alter table public.company_settings
  validate constraint company_settings_brand_primary_color_check,
  validate constraint company_settings_brand_accent_color_check,
  validate constraint company_settings_brand_logo_url_check;

comment on column public.company_settings.brand_logo_url is
  'Company-controlled logo URL used by the shared internal application shell.';
comment on column public.company_settings.brand_primary_color is
  'Six-digit hex primary color used by the shared internal application shell.';
comment on column public.company_settings.brand_accent_color is
  'Six-digit hex accent color used by the shared internal application shell.';
