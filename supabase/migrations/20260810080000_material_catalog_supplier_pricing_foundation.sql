begin;

do $audit$
declare
  expected record;
  actual_type text;
  actual_not_null boolean;
begin
  for expected in
    select *
    from (values
      ('company_settings', 'id', 'uuid', true),
      ('material_catalog', 'id', 'uuid', true),
      ('material_catalog', 'category', 'text', true),
      ('material_catalog', 'description', 'text', true),
      ('material_catalog', 'unit', 'text', true),
      ('material_catalog', 'unit_cost', 'numeric(12,2)', true),
      ('material_price_imports', 'id', 'uuid', true),
      ('suppliers', 'id', 'uuid', true),
      ('supplier_locations', 'id', 'uuid', true),
      ('supplier_locations', 'supplier_id', 'uuid', true)
    ) as contract(table_name, column_name, sql_type, is_not_null)
  loop
    if to_regclass('public.' || expected.table_name) is null then
      raise exception 'Required table public.% is missing.', expected.table_name;
    end if;

    select format_type(attribute.atttypid, attribute.atttypmod), attribute.attnotnull
    into actual_type, actual_not_null
    from pg_attribute attribute
    where attribute.attrelid = to_regclass('public.' || expected.table_name)
      and attribute.attname = expected.column_name
      and attribute.attnum > 0
      and not attribute.attisdropped;

    if not found
      or actual_type is distinct from expected.sql_type
      or actual_not_null is distinct from expected.is_not_null then
      raise exception 'Audited column public.%.% differs from the material-catalog foundation contract.',
        expected.table_name, expected.column_name;
    end if;
  end loop;

  if to_regprocedure('public.set_updated_at()') is null then
    raise exception 'Required trigger function public.set_updated_at() is missing.';
  end if;
end
$audit$;

create table public.material_manufacturers (
  id uuid primary key default gen_random_uuid(),
  canonical_name text not null check (btrim(canonical_name) <> ''),
  normalized_name text not null check (btrim(normalized_name) <> ''),
  website_url text,
  status text not null default 'active'
    check (status in ('active', 'inactive', 'merged')),
  merged_into_id uuid references public.material_manufacturers(id) on delete restrict,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_by_auth_user_id uuid references auth.users(id) on delete set null,
  reviewed_by_auth_user_id uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint material_manufacturers_merge_contract check (
    (status = 'merged' and merged_into_id is not null and merged_into_id <> id)
    or (status <> 'merged' and merged_into_id is null)
  )
);

create unique index material_manufacturers_active_name_uidx
  on public.material_manufacturers(normalized_name)
  where status <> 'merged';

create table public.material_categories (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.material_categories(id) on delete restrict,
  code text not null unique check (code ~ '^[a-z][a-z0-9_]{1,63}$'),
  name text not null check (btrim(name) <> ''),
  trade_code text not null check (trade_code ~ '^[a-z][a-z0-9_]{1,63}$'),
  identity_policy_version text not null check (btrim(identity_policy_version) <> ''),
  status text not null default 'draft'
    check (status in ('draft', 'active', 'retired')),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint material_categories_not_self_parent check (parent_id is null or parent_id <> id)
);

create table public.units_of_measure (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z][A-Z0-9_]{0,15}$'),
  name text not null check (btrim(name) <> ''),
  dimension text not null
    check (dimension in ('count', 'length', 'area', 'volume', 'mass', 'package')),
  base_numerator numeric(24,8),
  base_denominator numeric(24,8),
  decimal_scale smallint not null default 4 check (decimal_scale between 0 and 8),
  allows_fractional_order boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint units_of_measure_factor_contract check (
    (dimension = 'package' and base_numerator is null and base_denominator is null)
    or (dimension <> 'package' and base_numerator > 0 and base_denominator > 0)
  )
);

insert into public.units_of_measure (
  code, name, dimension, base_numerator, base_denominator, decimal_scale, allows_fractional_order
) values
  ('EA', 'Each', 'count', 1, 1, 4, false),
  ('LF', 'Linear foot', 'length', 1, 1, 4, true),
  ('SF', 'Square foot', 'area', 1, 1, 4, true),
  ('PACK', 'Pack', 'package', null, null, 4, false),
  ('BUNDLE', 'Bundle', 'package', null, null, 4, false)
on conflict (code) do nothing;

create table public.unit_aliases (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.units_of_measure(id) on delete cascade,
  alias text not null check (btrim(alias) <> ''),
  normalized_alias text not null unique check (btrim(normalized_alias) <> ''),
  source text not null default 'system' check (source in ('system', 'supplier_profile', 'reviewed')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.unit_aliases (unit_id, alias, normalized_alias)
select unit.id, seed.alias, seed.normalized_alias
from (values
  ('EA', 'each', 'each'),
  ('EA', 'ea', 'ea'),
  ('EA', 'piece', 'piece'),
  ('EA', 'pc', 'pc'),
  ('LF', 'linear foot', 'linear_foot'),
  ('LF', 'linear feet', 'linear_feet'),
  ('LF', 'lf', 'lf'),
  ('SF', 'square foot', 'square_foot'),
  ('SF', 'square feet', 'square_feet'),
  ('SF', 'sf', 'sf'),
  ('PACK', 'pack', 'pack'),
  ('BUNDLE', 'bundle', 'bundle')
) as seed(unit_code, alias, normalized_alias)
join public.units_of_measure unit on unit.code = seed.unit_code
on conflict (normalized_alias) do nothing;

alter table public.material_catalog
  add column mckenzie_product_code text,
  add column manufacturer_id uuid references public.material_manufacturers(id) on delete restrict,
  add column manufacturer_part_number_normalized text,
  add column category_id uuid references public.material_categories(id) on delete restrict,
  add column canonical_name text,
  add column stocking_unit_id uuid references public.units_of_measure(id) on delete restrict,
  add column lifecycle_status text,
  add column superseded_by_product_id uuid references public.material_catalog(id) on delete restrict,
  add column identity_fingerprint text,
  add column identity_version text,
  add column row_revision integer not null default 0;

alter table public.material_catalog
  add constraint material_catalog_product_code_nonblank
    check (mckenzie_product_code is null or btrim(mckenzie_product_code) <> '') not valid,
  add constraint material_catalog_canonical_name_nonblank
    check (canonical_name is null or btrim(canonical_name) <> '') not valid,
  add constraint material_catalog_lifecycle_status_check
    check (lifecycle_status is null or lifecycle_status in ('draft', 'active', 'discontinued', 'superseded', 'archived')) not valid,
  add constraint material_catalog_supersession_contract
    check (
      lifecycle_status is null
      or (lifecycle_status = 'superseded' and superseded_by_product_id is not null and superseded_by_product_id <> id)
      or (lifecycle_status <> 'superseded' and superseded_by_product_id is null)
    ) not valid,
  add constraint material_catalog_identity_pair_contract
    check ((identity_fingerprint is null) = (identity_version is null)) not valid,
  add constraint material_catalog_row_revision_nonnegative
    check (row_revision >= 0) not valid;

create unique index material_catalog_product_code_uidx
  on public.material_catalog(mckenzie_product_code)
  where mckenzie_product_code is not null;

create unique index material_catalog_manufacturer_mpn_uidx
  on public.material_catalog(manufacturer_id, manufacturer_part_number_normalized)
  where manufacturer_id is not null
    and manufacturer_part_number_normalized is not null
    and lifecycle_status in ('draft', 'active', 'discontinued');

create index material_catalog_category_id_idx on public.material_catalog(category_id);
create index material_catalog_identity_fingerprint_idx
  on public.material_catalog(identity_fingerprint)
  where identity_fingerprint is not null;

create table public.product_attribute_definitions (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.material_categories(id) on delete restrict,
  code text not null check (code ~ '^[a-z][a-z0-9_]{1,63}$'),
  label text not null check (btrim(label) <> ''),
  value_type text not null check (value_type in ('text', 'number', 'boolean')),
  dimension text check (dimension is null or dimension in ('count', 'length', 'area', 'volume', 'mass')),
  identity_weight numeric(5,4) not null default 0 check (identity_weight between 0 and 1),
  required_for_identity boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (category_id, code),
  constraint product_attribute_dimension_contract check (
    (value_type = 'number') or dimension is null
  )
);

create table public.product_attribute_values (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.material_catalog(id) on delete cascade,
  definition_id uuid not null references public.product_attribute_definitions(id) on delete restrict,
  text_value text,
  numeric_value numeric(24,8),
  boolean_value boolean,
  unit_id uuid references public.units_of_measure(id) on delete restrict,
  normalized_value text not null check (btrim(normalized_value) <> ''),
  source_type text not null check (source_type in ('manufacturer', 'supplier', 'manual', 'import', 'legacy')),
  source_reference text,
  verified_at timestamptz,
  verified_by_auth_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, definition_id),
  constraint product_attribute_value_exactly_one check (
    num_nonnulls(text_value, numeric_value, boolean_value) = 1
  ),
  constraint product_attribute_value_unit_contract check (
    numeric_value is not null or unit_id is null
  )
);

create table public.product_aliases (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.material_catalog(id) on delete cascade,
  company_id uuid references public.company_settings(id) on delete restrict,
  alias text not null check (btrim(alias) <> ''),
  normalized_alias text not null check (btrim(normalized_alias) <> ''),
  language_code text not null default 'en' check (language_code ~ '^[a-z]{2}(-[A-Z]{2})?$'),
  alias_type text not null
    check (alias_type in ('common_name', 'legacy_sku', 'manufacturer_marketing', 'abbreviation', 'misspelling', 'internal_name')),
  source_type text not null check (source_type in ('manufacturer', 'manual', 'import', 'legacy')),
  source_reference text,
  verified_at timestamptz,
  verified_by_auth_user_id uuid references auth.users(id) on delete set null,
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_alias_dates_ordered check (effective_to is null or effective_to >= effective_from)
);

create unique index product_aliases_global_active_uidx
  on public.product_aliases(normalized_alias, language_code)
  where company_id is null and is_active;

create unique index product_aliases_company_active_uidx
  on public.product_aliases(company_id, normalized_alias, language_code)
  where company_id is not null and is_active;

create table public.product_unit_conversions (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.material_catalog(id) on delete cascade,
  from_unit_id uuid not null references public.units_of_measure(id) on delete restrict,
  to_unit_id uuid not null references public.units_of_measure(id) on delete restrict,
  from_quantity numeric(24,8) not null check (from_quantity > 0),
  to_quantity numeric(24,8) not null check (to_quantity > 0),
  conversion_kind text not null
    check (conversion_kind in ('package_contents', 'length_per_each', 'coverage_per_each', 'coverage_per_package', 'weight_per_each', 'yield')),
  order_increment numeric(24,8) check (order_increment is null or order_increment > 0),
  rounding_mode text not null default 'ceiling'
    check (rounding_mode in ('ceiling', 'nearest', 'exact')),
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  source_type text not null check (source_type in ('manufacturer', 'supplier', 'manual', 'legacy')),
  source_reference text,
  verification_status text not null default 'unverified'
    check (verification_status in ('unverified', 'verified', 'disputed', 'retired')),
  verified_at timestamptz,
  verified_by_auth_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_unit_conversion_distinct_units check (from_unit_id <> to_unit_id),
  constraint product_unit_conversion_dates_ordered check (effective_to is null or effective_to >= effective_from),
  unique (product_id, from_unit_id, to_unit_id, conversion_kind, effective_from)
);

create table public.company_supplier_accounts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company_settings(id) on delete restrict,
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  account_key text not null check (account_key ~ '^[a-z][a-z0-9_-]{1,63}$'),
  account_name text not null check (btrim(account_name) <> ''),
  account_number_masked text,
  credential_reference text,
  currency_code text not null default 'USD' check (currency_code ~ '^[A-Z]{3}$'),
  payment_terms text,
  delivery_terms text,
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  status text not null default 'active' check (status in ('active', 'inactive', 'expired')),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_supplier_account_dates_ordered check (effective_to is null or effective_to >= effective_from),
  unique (company_id, supplier_id, account_key),
  unique (id, company_id, supplier_id)
);

create unique index supplier_locations_id_supplier_uidx
  on public.supplier_locations(id, supplier_id);

create table public.supplier_product_offers (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  supplier_location_id uuid,
  material_catalog_id uuid not null references public.material_catalog(id) on delete restrict,
  supplier_sku text not null check (btrim(supplier_sku) <> ''),
  supplier_sku_normalized text not null check (btrim(supplier_sku_normalized) <> ''),
  supplier_description text,
  supplier_manufacturer_name text,
  supplier_manufacturer_part_number text,
  gtin text,
  sell_unit_id uuid not null references public.units_of_measure(id) on delete restrict,
  product_unit_conversion_id uuid references public.product_unit_conversions(id) on delete restrict,
  minimum_order_quantity numeric(24,8) check (minimum_order_quantity is null or minimum_order_quantity > 0),
  order_increment numeric(24,8) check (order_increment is null or order_increment > 0),
  mapping_status text not null default 'unverified'
    check (mapping_status in ('unverified', 'verified', 'disputed', 'replaced', 'inactive')),
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  source_type text not null check (source_type in ('manual', 'csv', 'spreadsheet', 'api', 'legacy')),
  source_reference text,
  verified_at timestamptz,
  verified_by_auth_user_id uuid references auth.users(id) on delete set null,
  row_revision integer not null default 0 check (row_revision >= 0),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint supplier_product_offer_location_fkey
    foreign key (supplier_location_id, supplier_id)
    references public.supplier_locations(id, supplier_id) on delete restrict,
  constraint supplier_product_offer_dates_ordered check (effective_to is null or effective_to >= effective_from),
  unique (id, supplier_id)
);

create unique index supplier_product_offers_supplier_sku_uidx
  on public.supplier_product_offers(supplier_id, supplier_sku_normalized)
  where supplier_location_id is null and mapping_status in ('unverified', 'verified', 'disputed');

create unique index supplier_product_offers_location_sku_uidx
  on public.supplier_product_offers(supplier_id, supplier_location_id, supplier_sku_normalized)
  where supplier_location_id is not null and mapping_status in ('unverified', 'verified', 'disputed');

create index supplier_product_offers_material_idx
  on public.supplier_product_offers(material_catalog_id, mapping_status);

create table public.supplier_offer_observations (
  id uuid primary key default gen_random_uuid(),
  supplier_product_offer_id uuid not null,
  supplier_id uuid not null,
  company_id uuid not null references public.company_settings(id) on delete restrict,
  company_supplier_account_id uuid,
  supplier_location_id uuid,
  observed_at timestamptz not null,
  effective_from timestamptz not null,
  effective_to timestamptz,
  expires_at timestamptz,
  availability_status text not null default 'unknown'
    check (availability_status in ('in_stock', 'limited', 'backorder', 'special_order', 'discontinued', 'unknown')),
  inventory_quantity numeric(24,8) check (inventory_quantity is null or inventory_quantity >= 0),
  inventory_unit_id uuid references public.units_of_measure(id) on delete restrict,
  lead_time_min numeric(12,3) check (lead_time_min is null or lead_time_min >= 0),
  lead_time_max numeric(12,3) check (lead_time_max is null or lead_time_max >= 0),
  lead_time_unit text check (lead_time_unit is null or lead_time_unit in ('business_day', 'calendar_day', 'week')),
  promised_available_date date,
  delivery_cost numeric(14,4) check (delivery_cost is null or delivery_cost >= 0),
  delivery_currency_code text check (delivery_currency_code is null or delivery_currency_code ~ '^[A-Z]{3}$'),
  delivery_minimum numeric(14,4) check (delivery_minimum is null or delivery_minimum >= 0),
  source_type text not null check (source_type in ('manual', 'csv', 'spreadsheet', 'supplier_quote', 'api', 'web_lookup', 'legacy')),
  source_reference text,
  source_record_id text,
  raw_record_sha256 text check (raw_record_sha256 is null or raw_record_sha256 ~ '^[0-9a-f]{64}$'),
  adapter_version text,
  confidence text not null check (confidence in ('verified', 'confirmed', 'probable', 'unverified')),
  corrects_observation_id uuid,
  published_at timestamptz not null default now(),
  published_by_auth_user_id uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  constraint supplier_offer_observation_offer_fkey
    foreign key (supplier_product_offer_id, supplier_id)
    references public.supplier_product_offers(id, supplier_id) on delete restrict,
  constraint supplier_offer_observation_account_fkey
    foreign key (company_supplier_account_id, company_id, supplier_id)
    references public.company_supplier_accounts(id, company_id, supplier_id) on delete restrict,
  constraint supplier_offer_observation_location_fkey
    foreign key (supplier_location_id, supplier_id)
    references public.supplier_locations(id, supplier_id) on delete restrict,
  constraint supplier_offer_observation_effective_dates check (effective_to is null or effective_to >= effective_from),
  constraint supplier_offer_observation_expiration check (expires_at is null or expires_at >= effective_from),
  constraint supplier_offer_observation_inventory_unit check (inventory_quantity is null or inventory_unit_id is not null),
  constraint supplier_offer_observation_lead_time check (
    (lead_time_min is null and lead_time_max is null and lead_time_unit is null)
    or (lead_time_unit is not null and coalesce(lead_time_min, lead_time_max) is not null and (lead_time_max is null or lead_time_min is null or lead_time_max >= lead_time_min))
  ),
  constraint supplier_offer_observation_delivery_currency check (delivery_cost is null or delivery_currency_code is not null),
  constraint supplier_offer_observation_not_self_correction check (corrects_observation_id is null or corrects_observation_id <> id),
  unique (id, company_id)
);

alter table public.supplier_offer_observations
  add constraint supplier_offer_observation_correction_fkey
    foreign key (corrects_observation_id, company_id)
    references public.supplier_offer_observations(id, company_id) on delete restrict;

create unique index supplier_offer_observation_correction_uidx
  on public.supplier_offer_observations(corrects_observation_id)
  where corrects_observation_id is not null;

create index supplier_offer_observations_current_lookup_idx
  on public.supplier_offer_observations(company_id, supplier_product_offer_id, effective_from desc, observed_at desc);

create table public.supplier_offer_observation_prices (
  id uuid primary key default gen_random_uuid(),
  observation_id uuid not null references public.supplier_offer_observations(id) on delete restrict,
  price_type text not null
    check (price_type in ('list', 'retail', 'contractor', 'negotiated', 'quoted', 'promotional', 'net_cost', 'other')),
  amount numeric(14,4) not null check (amount >= 0),
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  price_quantity numeric(24,8) not null default 1 check (price_quantity > 0),
  price_unit_id uuid not null references public.units_of_measure(id) on delete restrict,
  tier_min_quantity numeric(24,8) check (tier_min_quantity is null or tier_min_quantity >= 0),
  tier_max_quantity numeric(24,8) check (tier_max_quantity is null or tier_max_quantity >= 0),
  tax_included boolean,
  terms_note text,
  created_at timestamptz not null default now(),
  constraint supplier_offer_price_tiers_ordered check (
    tier_max_quantity is null or tier_min_quantity is null or tier_max_quantity >= tier_min_quantity
  ),
  unique (observation_id, price_type, price_unit_id, tier_min_quantity, tier_max_quantity)
);

create table public.supplier_import_profiles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company_settings(id) on delete restrict,
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  name text not null check (btrim(name) <> ''),
  profile_version integer not null default 1 check (profile_version > 0),
  file_type text not null check (file_type in ('csv', 'xlsx', 'xls')),
  sheet_selector jsonb not null default '{}'::jsonb check (jsonb_typeof(sheet_selector) = 'object'),
  column_mapping jsonb not null check (jsonb_typeof(column_mapping) = 'object'),
  normalization_rules jsonb not null default '{}'::jsonb check (jsonb_typeof(normalization_rules) = 'object'),
  status text not null default 'draft' check (status in ('draft', 'active', 'retired')),
  created_by_auth_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, supplier_id, name, profile_version),
  unique (id, company_id, supplier_id)
);

create table public.material_catalog_import_batches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company_settings(id) on delete restrict,
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  supplier_location_id uuid,
  company_supplier_account_id uuid,
  import_profile_id uuid,
  legacy_import_id uuid unique references public.material_price_imports(id) on delete restrict,
  import_type text not null check (import_type in ('csv', 'xlsx', 'xls', 'api')),
  original_filename text,
  storage_bucket text,
  storage_path text,
  file_sha256 text not null check (file_sha256 ~ '^[0-9a-f]{64}$'),
  file_size_bytes bigint check (file_size_bytes is null or file_size_bytes > 0),
  parser_version text,
  status text not null default 'uploaded'
    check (status in ('uploaded', 'mapping_required', 'normalizing', 'matching', 'review_required', 'preview_ready', 'approved', 'publishing', 'published', 'published_with_exclusions', 'failed', 'cancelled')),
  total_rows integer not null default 0 check (total_rows >= 0),
  valid_rows integer not null default 0 check (valid_rows >= 0),
  review_rows integer not null default 0 check (review_rows >= 0),
  excluded_rows integer not null default 0 check (excluded_rows >= 0),
  batch_revision integer not null default 0 check (batch_revision >= 0),
  approved_preview_sha256 text check (approved_preview_sha256 is null or approved_preview_sha256 ~ '^[0-9a-f]{64}$'),
  approved_at timestamptz,
  approved_by_auth_user_id uuid references auth.users(id) on delete set null,
  published_at timestamptz,
  created_by_auth_user_id uuid references auth.users(id) on delete set null,
  error_code text,
  error_summary text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint material_catalog_import_location_fkey
    foreign key (supplier_location_id, supplier_id)
    references public.supplier_locations(id, supplier_id) on delete restrict,
  constraint material_catalog_import_account_fkey
    foreign key (company_supplier_account_id, company_id, supplier_id)
    references public.company_supplier_accounts(id, company_id, supplier_id) on delete restrict,
  constraint material_catalog_import_profile_fkey
    foreign key (import_profile_id, company_id, supplier_id)
    references public.supplier_import_profiles(id, company_id, supplier_id) on delete restrict,
  constraint material_catalog_import_approval_contract check (
    (approved_at is null and approved_by_auth_user_id is null and approved_preview_sha256 is null)
    or (approved_at is not null and approved_by_auth_user_id is not null and approved_preview_sha256 is not null)
  ),
  unique (id, company_id, supplier_id),
  unique (id, company_id)
);

create unique index material_catalog_import_file_uidx
  on public.material_catalog_import_batches(company_id, supplier_id, file_sha256)
  where status <> 'cancelled';

create table public.material_price_import_rows (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company_settings(id) on delete restrict,
  import_id uuid not null,
  sheet_name text,
  sheet_index integer check (sheet_index is null or sheet_index >= 0),
  source_row_number integer not null check (source_row_number > 0),
  raw_row jsonb not null check (jsonb_typeof(raw_row) = 'object'),
  raw_row_sha256 text not null check (raw_row_sha256 ~ '^[0-9a-f]{64}$'),
  normalized_row jsonb not null default '{}'::jsonb check (jsonb_typeof(normalized_row) = 'object'),
  validation_errors jsonb not null default '[]'::jsonb check (jsonb_typeof(validation_errors) = 'array'),
  validation_warnings jsonb not null default '[]'::jsonb check (jsonb_typeof(validation_warnings) = 'array'),
  row_status text not null default 'pending'
    check (row_status in ('pending', 'invalid', 'matching', 'matched', 'ambiguous', 'unmatched', 'conflict', 'reviewed', 'excluded', 'published')),
  normalized_supplier_sku text,
  normalized_manufacturer_name text,
  normalized_manufacturer_part_number text,
  normalized_description text,
  normalized_unit_code text,
  normalized_currency_code text,
  row_revision integer not null default 0 check (row_revision >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint material_price_import_row_batch_fkey
    foreign key (import_id, company_id)
    references public.material_catalog_import_batches(id, company_id) on delete cascade,
  unique (import_id, sheet_index, source_row_number),
  unique (id, import_id, company_id)
);

create index material_price_import_rows_review_idx
  on public.material_price_import_rows(import_id, row_status, source_row_number);

create table public.material_import_match_candidates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company_settings(id) on delete restrict,
  import_id uuid not null references public.material_catalog_import_batches(id) on delete cascade,
  import_row_id uuid not null,
  material_catalog_id uuid references public.material_catalog(id) on delete restrict,
  supplier_product_offer_id uuid references public.supplier_product_offers(id) on delete restrict,
  rank integer not null check (rank > 0),
  confidence_score numeric(6,5) not null check (confidence_score between 0 and 1),
  algorithm_version text not null check (btrim(algorithm_version) <> ''),
  score_components jsonb not null default '{}'::jsonb check (jsonb_typeof(score_components) = 'object'),
  explanation jsonb not null default '{}'::jsonb check (jsonb_typeof(explanation) = 'object'),
  has_hard_conflict boolean not null default false,
  created_at timestamptz not null default now(),
  constraint material_import_candidate_row_fkey
    foreign key (import_row_id, import_id, company_id)
    references public.material_price_import_rows(id, import_id, company_id) on delete cascade,
  constraint material_import_candidate_target check (
    material_catalog_id is not null or supplier_product_offer_id is not null
  ),
  unique (import_row_id, rank)
);

create table public.material_import_review_decisions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company_settings(id) on delete restrict,
  import_id uuid not null references public.material_catalog_import_batches(id) on delete cascade,
  import_row_id uuid not null,
  decision text not null
    check (decision in ('map_existing_offer', 'create_offer', 'propose_product', 'non_product_row', 'defer', 'reject')),
  material_catalog_id uuid references public.material_catalog(id) on delete restrict,
  supplier_product_offer_id uuid references public.supplier_product_offers(id) on delete restrict,
  reviewed_row_revision integer not null check (reviewed_row_revision >= 0),
  algorithm_version text,
  import_profile_version integer check (import_profile_version is null or import_profile_version > 0),
  reason_code text not null check (btrim(reason_code) <> ''),
  notes text,
  decided_by_auth_user_id uuid not null references auth.users(id) on delete restrict,
  decided_at timestamptz not null default now(),
  invalidated_at timestamptz,
  invalidation_reason text,
  constraint material_import_decision_row_fkey
    foreign key (import_row_id, import_id, company_id)
    references public.material_price_import_rows(id, import_id, company_id) on delete cascade,
  constraint material_import_decision_target check (
    (decision = 'map_existing_offer' and supplier_product_offer_id is not null and material_catalog_id is not null)
    or (decision = 'create_offer' and supplier_product_offer_id is null and material_catalog_id is not null)
    or (decision in ('propose_product', 'non_product_row', 'defer', 'reject') and supplier_product_offer_id is null)
  ),
  constraint material_import_decision_invalidation check (
    invalidated_at is null or invalidation_reason is not null
  )
);

create unique index material_import_active_decision_uidx
  on public.material_import_review_decisions(import_row_id)
  where invalidated_at is null;

create table public.material_import_change_previews (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company_settings(id) on delete restrict,
  import_id uuid not null,
  preview_version integer not null check (preview_version > 0),
  batch_revision integer not null check (batch_revision >= 0),
  policy_version text not null check (btrim(policy_version) <> ''),
  content_sha256 text not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
  summary jsonb not null check (jsonb_typeof(summary) = 'object'),
  created_by_auth_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint material_import_preview_batch_fkey
    foreign key (import_id, company_id)
    references public.material_catalog_import_batches(id, company_id) on delete cascade,
  unique (import_id, preview_version),
  unique (id, import_id, company_id),
  unique (import_id, content_sha256)
);

create table public.material_import_change_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company_settings(id) on delete restrict,
  import_id uuid not null references public.material_catalog_import_batches(id) on delete cascade,
  preview_id uuid not null,
  import_row_id uuid not null,
  change_type text not null
    check (change_type in ('new_offer', 'new_observation', 'mapping_change', 'availability_change', 'no_change', 'excluded')),
  before_state jsonb check (before_state is null or jsonb_typeof(before_state) = 'object'),
  after_state jsonb check (after_state is null or jsonb_typeof(after_state) = 'object'),
  absolute_price_delta numeric(14,4),
  percent_price_delta numeric(12,5),
  requires_attention boolean not null default false,
  attention_reasons jsonb not null default '[]'::jsonb check (jsonb_typeof(attention_reasons) = 'array'),
  created_at timestamptz not null default now(),
  constraint material_import_change_preview_fkey
    foreign key (preview_id, import_id, company_id)
    references public.material_import_change_previews(id, import_id, company_id) on delete cascade,
  constraint material_import_change_row_fkey
    foreign key (import_row_id, import_id, company_id)
    references public.material_price_import_rows(id, import_id, company_id) on delete cascade,
  unique (preview_id, import_row_id)
);

create table public.material_import_publications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company_settings(id) on delete restrict,
  import_id uuid not null,
  preview_id uuid not null,
  preview_sha256 text not null check (preview_sha256 ~ '^[0-9a-f]{64}$'),
  idempotency_key text not null check (btrim(idempotency_key) <> ''),
  published_observation_count integer not null default 0 check (published_observation_count >= 0),
  excluded_row_count integer not null default 0 check (excluded_row_count >= 0),
  result_summary jsonb not null check (jsonb_typeof(result_summary) = 'object'),
  published_by_auth_user_id uuid not null references auth.users(id) on delete restrict,
  published_at timestamptz not null default now(),
  constraint material_import_publication_batch_fkey
    foreign key (import_id, company_id)
    references public.material_catalog_import_batches(id, company_id) on delete restrict,
  constraint material_import_publication_preview_fkey
    foreign key (preview_id, import_id, company_id)
    references public.material_import_change_previews(id, import_id, company_id) on delete restrict,
  unique (import_id),
  unique (company_id, idempotency_key),
  unique (id, import_id, company_id)
);

create table public.material_import_publication_rows (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company_settings(id) on delete restrict,
  import_id uuid not null,
  publication_id uuid not null,
  import_row_id uuid not null,
  outcome text not null check (outcome in ('published', 'excluded')),
  supplier_product_offer_id uuid references public.supplier_product_offers(id) on delete restrict,
  supplier_offer_observation_id uuid,
  exclusion_reason_code text,
  created_at timestamptz not null default now(),
  constraint material_import_publication_row_parent_fkey
    foreign key (publication_id, import_id, company_id)
    references public.material_import_publications(id, import_id, company_id) on delete restrict,
  constraint material_import_publication_row_source_fkey
    foreign key (import_row_id, import_id, company_id)
    references public.material_price_import_rows(id, import_id, company_id) on delete restrict,
  constraint material_import_publication_row_observation_fkey
    foreign key (supplier_offer_observation_id, company_id)
    references public.supplier_offer_observations(id, company_id) on delete restrict,
  constraint material_import_publication_row_outcome check (
    (outcome = 'published' and supplier_offer_observation_id is not null and exclusion_reason_code is null)
    or (outcome = 'excluded' and supplier_offer_observation_id is null and exclusion_reason_code is not null)
  ),
  unique (publication_id, import_row_id)
);

create or replace function public.prevent_material_price_history_mutation()
returns trigger
language plpgsql
set search_path = public
as $function$
begin
  raise exception 'Published material pricing history is append-only.';
end
$function$;

revoke all on function public.prevent_material_price_history_mutation() from public, anon, authenticated;
grant execute on function public.prevent_material_price_history_mutation() to service_role;

create trigger prevent_supplier_offer_observation_mutation
before update or delete on public.supplier_offer_observations
for each row execute function public.prevent_material_price_history_mutation();

create trigger prevent_supplier_offer_price_mutation
before update or delete on public.supplier_offer_observation_prices
for each row execute function public.prevent_material_price_history_mutation();

create trigger prevent_material_import_publication_mutation
before update or delete on public.material_import_publications
for each row execute function public.prevent_material_price_history_mutation();

create trigger prevent_material_import_publication_row_mutation
before update or delete on public.material_import_publication_rows
for each row execute function public.prevent_material_price_history_mutation();

create trigger prevent_material_import_preview_mutation
before update or delete on public.material_import_change_previews
for each row execute function public.prevent_material_price_history_mutation();

create trigger prevent_material_import_change_item_mutation
before update or delete on public.material_import_change_items
for each row execute function public.prevent_material_price_history_mutation();

create trigger set_material_manufacturers_updated_at
before update on public.material_manufacturers
for each row execute function public.set_updated_at();

create trigger set_material_categories_updated_at
before update on public.material_categories
for each row execute function public.set_updated_at();

create trigger set_units_of_measure_updated_at
before update on public.units_of_measure
for each row execute function public.set_updated_at();

create trigger set_product_attribute_definitions_updated_at
before update on public.product_attribute_definitions
for each row execute function public.set_updated_at();

create trigger set_product_attribute_values_updated_at
before update on public.product_attribute_values
for each row execute function public.set_updated_at();

create trigger set_product_aliases_updated_at
before update on public.product_aliases
for each row execute function public.set_updated_at();

create trigger set_product_unit_conversions_updated_at
before update on public.product_unit_conversions
for each row execute function public.set_updated_at();

create trigger set_company_supplier_accounts_updated_at
before update on public.company_supplier_accounts
for each row execute function public.set_updated_at();

create trigger set_supplier_product_offers_updated_at
before update on public.supplier_product_offers
for each row execute function public.set_updated_at();

create trigger set_supplier_import_profiles_updated_at
before update on public.supplier_import_profiles
for each row execute function public.set_updated_at();

create trigger set_material_catalog_import_batches_updated_at
before update on public.material_catalog_import_batches
for each row execute function public.set_updated_at();

create trigger set_material_price_import_rows_updated_at
before update on public.material_price_import_rows
for each row execute function public.set_updated_at();

do $security$
declare
  table_name text;
begin
  foreach table_name in array array[
    'material_manufacturers',
    'material_categories',
    'units_of_measure',
    'unit_aliases',
    'product_attribute_definitions',
    'product_attribute_values',
    'product_aliases',
    'product_unit_conversions',
    'company_supplier_accounts',
    'supplier_product_offers',
    'supplier_offer_observations',
    'supplier_offer_observation_prices',
    'supplier_import_profiles',
    'material_catalog_import_batches',
    'material_price_import_rows',
    'material_import_match_candidates',
    'material_import_review_decisions',
    'material_import_change_previews',
    'material_import_change_items',
    'material_import_publications',
    'material_import_publication_rows'
  ]::text[]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from public, anon, authenticated', table_name);
    execute format('grant select, insert, update, delete on table public.%I to service_role', table_name);
  end loop;
end
$security$;

revoke update, delete on table
  public.supplier_offer_observations,
  public.supplier_offer_observation_prices,
  public.material_import_change_previews,
  public.material_import_change_items,
  public.material_import_publications,
  public.material_import_publication_rows
from service_role;

comment on table public.material_manufacturers is 'Supplier-independent manufacturer identity for the universal material catalog.';
comment on table public.material_categories is 'Trade-neutral hierarchical categories with versioned product identity policies.';
comment on table public.units_of_measure is 'Canonical unit dictionary. Package conversions remain product-specific.';
comment on table public.supplier_product_offers is 'Stable supplier SKU mapping to one canonical physical product; pricing history is stored separately.';
comment on table public.supplier_offer_observations is 'Append-only supplier price, availability, lead-time, and delivery evidence.';
comment on table public.material_catalog_import_batches is 'Staged supplier import workflow. No canonical or pricing publication occurs from batch creation alone.';
comment on table public.material_import_publications is 'Immutable evidence that an exact reviewed import preview was published idempotently.';
comment on column public.material_catalog.unit_cost is 'Legacy compatibility fallback. New supplier imports must not update this field.';
comment on column public.material_catalog.sku is 'Legacy catalog identifier. New supplier SKUs belong in supplier_product_offers.';

commit;
