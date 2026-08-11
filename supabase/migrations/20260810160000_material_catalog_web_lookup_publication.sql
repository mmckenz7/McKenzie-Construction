begin;

do $audit$
begin
  if to_regclass('public.material_catalog_import_batches') is null
    or to_regclass('public.material_import_change_previews') is null
    or to_regclass('public.material_import_publications') is null
    or to_regclass('public.supplier_offer_observations') is null then
    raise exception 'Material Catalog supplier-pricing foundation is required.';
  end if;

  if to_regprocedure('public.get_effective_user_access(uuid)') is null
    or to_regprocedure('public.get_effective_feature_map(text,text)') is null then
    raise exception 'Material Catalog access foundation is required.';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.material_catalog_import_batches'::regclass
      and conname = 'material_catalog_import_batches_import_type_check'
      and pg_get_constraintdef(oid) like '%csv%xlsx%xls%api%'
  ) then
    raise exception 'Import batch type constraint differs from the audited contract.';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.supplier_product_offers'::regclass
      and conname = 'supplier_product_offers_source_type_check'
      and pg_get_constraintdef(oid) like '%manual%csv%spreadsheet%api%legacy%'
  ) then
    raise exception 'Supplier offer source constraint differs from the audited contract.';
  end if;
end
$audit$;

alter table public.material_catalog_import_batches
  drop constraint material_catalog_import_batches_import_type_check,
  add constraint material_catalog_import_batches_import_type_check
    check (import_type in ('csv', 'xlsx', 'xls', 'api', 'web_lookup'));

alter table public.supplier_product_offers
  drop constraint supplier_product_offers_source_type_check,
  add constraint supplier_product_offers_source_type_check
    check (source_type in ('manual', 'csv', 'spreadsheet', 'api', 'web_lookup', 'legacy'));

create unique index supplier_offer_observation_evidence_uidx
  on public.supplier_offer_observations(company_id, raw_record_sha256)
  where raw_record_sha256 is not null;

comment on index public.supplier_offer_observation_evidence_uidx is
  'Prevents duplicate publication of one normalized evidence envelope per company. A correction must use a newly hashed corrected envelope and reference corrects_observation_id.';

create or replace function public.assert_material_catalog_mutation_access(
  requested_company_id uuid,
  requested_auth_user_id uuid,
  requested_capability text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $function$
declare
  effective_access jsonb;
  feature_map jsonb;
begin
  if requested_capability not in (
    'upload_supplier_imports', 'review_product_mappings',
    'preview_price_changes', 'publish_supplier_prices'
  ) then
    raise exception 'Unsupported Material Catalog mutation capability.';
  end if;

  select public.get_effective_user_access(requested_auth_user_id)
  into effective_access;
  if effective_access is null
    or effective_access ->> 'auth_user_id' is distinct from requested_auth_user_id::text
    or effective_access ->> 'company_id' is distinct from requested_company_id::text then
    raise exception 'Catalog mutation access was denied.';
  end if;

  if (select count(*) from public.company_settings) <> 1
    or not exists (select 1 from public.company_settings where id = requested_company_id) then
    raise exception 'Catalog mutation requires the transitional singleton company scope.';
  end if;

  select public.get_effective_feature_map('global', 'default') into feature_map;
  if coalesce((feature_map ->> 'material_catalog')::boolean, false) is not true then
    raise exception 'Material Catalog is disabled.';
  end if;

  if requested_capability = 'upload_supplier_imports' then
    if coalesce((effective_access -> 'permissions' ->> 'manage_suppliers')::boolean, false) is not true then
      raise exception 'Supplier import access was denied.';
    end if;
  else
    if coalesce((effective_access -> 'permissions' ->> 'edit_prices')::boolean, false) is not true
      or coalesce((effective_access -> 'permissions' ->> 'manage_suppliers')::boolean, false) is not true then
      raise exception 'Catalog stewardship access was denied.';
    end if;
  end if;

  if requested_capability = 'publish_supplier_prices'
    and coalesce((feature_map ->> 'material_catalog_price_publication')::boolean, false) is not true then
    raise exception 'Catalog price publication is disabled.';
  end if;
  return effective_access;
end
$function$;

create or replace function public.stage_material_catalog_web_lookup_import(
  requested_company_id uuid,
  requested_auth_user_id uuid,
  requested_manifest_sha256 text,
  requested_parser_version text,
  requested_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  supplier_record public.suppliers;
  location_record public.supplier_locations;
  batch_record public.material_catalog_import_batches;
  row_value jsonb;
  row_count integer;
begin
  perform public.assert_material_catalog_mutation_access(
    requested_company_id, requested_auth_user_id, 'upload_supplier_imports'
  );
  if requested_manifest_sha256 <> '01c14b6ad3536b100bc308126e88bea19658f3406f7e1d6c14f27c196872c9f1'
    or requested_parser_version <> 'lowes-east-knoxville-public-retail-v1'
    or jsonb_typeof(requested_rows) <> 'array' then
    raise exception 'Invalid bounded web-lookup manifest.';
  end if;
  row_count := jsonb_array_length(requested_rows);
  if row_count <> 4 then raise exception 'The approved pilot requires exactly four rows.'; end if;

  for row_value in select value from jsonb_array_elements(requested_rows)
  loop
    if row_value ->> 'raw_row_sha256' !~ '^[0-9a-f]{64}$'
      or (row_value ->> 'source_row_number')::integer not between 1 and 4
      or jsonb_typeof(row_value -> 'raw_row') <> 'object'
      or jsonb_typeof(row_value -> 'normalized_row') <> 'object'
      or row_value -> 'normalized_row' ->> 'availabilityStatus' <> 'unknown'
      or row_value -> 'normalized_row' ->> 'priceType' <> 'retail'
      or row_value -> 'normalized_row' ->> 'currencyCode' <> 'USD'
      or row_value -> 'normalized_row' ->> 'storeNumber' <> '1544'
      or row_value -> 'normalized_row' ->> 'observedAt' not in (
        '2026-08-11T20:52:58.340Z', '2026-08-11T21:50:36.621Z'
      )
      or row_value -> 'normalized_row' ->> 'identitySourceReference'
        !~ '^https://www\.lowes\.com/pd/[A-Za-z0-9-]+/[0-9]+$' then
      raise exception 'A staged row differs from the approved public-retail evidence contract.';
    end if;
  end loop;

  if (select count(distinct (value ->> 'source_row_number')::integer)
      from jsonb_array_elements(requested_rows)) <> 4
    or (select min((value ->> 'source_row_number')::integer)
        from jsonb_array_elements(requested_rows)) <> 1
    or (select max((value ->> 'source_row_number')::integer)
        from jsonb_array_elements(requested_rows)) <> 4 then
    raise exception 'Pilot source row numbers must cover 1 through 4 exactly once.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(requested_rows) supplied
    left join (values
      (1, '202922', '635548', 'Severe Weather', 'Severe Weather 5/8-in x 5-1/2-in x 6-ft pressure-treated Southern yellow pine dog-ear fence picket', 'fence_pickets', 'Fence pickets', 'fencing', 'Fencing', null::text, '2.28', 'EA', '2026-08-11T20:52:58.340Z', '8587161a760ae10c57253d59c1b42837ebad1d33b11c98ada3543e4a67b55582', 'lowes:item:202922:store:1544', '/pd/Severe-Weather-5-8-in-x-5-1-2-in-x-6-ft-Pressure-Treated-Southern-Yellow-Pine-Dog-Ear-Fence-Picket/5013086547', '/search?searchTerm=202922'),
      (2, '10385', '110180', 'QUIKRETE', 'QUIKRETE 80-lb high-strength concrete mix bag', 'concrete_mix', 'Concrete mix', 'concrete', 'Concrete', null::text, '6.98', 'EA', '2026-08-11T20:52:58.340Z', '9c4d520d25a93ba6cb6d193d3eb00d006e3195d009f4ac6021422d42c024311e', 'lowes:item:10385:store:1544', '/pd/QUIKRETE-80-lb-High-Strength-Concrete-Mix/3006075', '/search?searchTerm=QUIKRETE%2080-lb%20concrete%20mix'),
      (3, '894294', '48419', 'Deck Plus', 'Deck Plus #10 x 3-in ceramic deck screws, 310-count box', 'deck_screws', 'Deck screws', 'fasteners', 'Fasteners', '310', '29.98', 'PACK', '2026-08-11T20:52:58.340Z', 'ef0d643798c2d77802ee873b35a90264bf0071e394cfd3ba3cdf2a3e02e86e4a', 'lowes:item:894294:store:1544', '/pd/Deck-Plus-10-x-3-in-Ceramic-Deck-Screws-5-lb/1000318525', '/search?searchTerm=Deck%20Plus%205-lb%203-in%20deck%20screws'),
      (4, '312282', 'OG220408-AG', 'Severe Weather', 'Severe Weather 2-in x 4-in x 8-ft pressure-treated dimensional lumber', 'dimensional_lumber', 'Dimensional lumber', 'framing', 'Lumber', null::text, '4.68', 'EA', '2026-08-11T21:50:36.621Z', 'f5cfd1193c06a950be237a6b8aaa547fc4e831c4f9fdece760b2e50e6bfcb507', 'lowes:item:312282:store:1544', '/pd/Severe-Weather-Common-2-in-x-4-in-x-8-ft-Actual-1-5-in-x-3-5-in-x-8-ft-2-Treated-Lumber/4564778', '/search?searchTerm=Severe%20Weather%202-in%20x%204-in%20x%208-ft%20pressure%20treated')
    ) expected(row_number, item_number, model_number, brand, canonical_name,
      category_code, category_name, trade_code, legacy_category, package_quantity,
      price_amount, unit_code, observed_at, raw_sha, source_record_id, identity_path, price_path)
      on expected.row_number = (supplied ->> 'source_row_number')::integer
    where expected.row_number is null
      or supplied ->> 'raw_row_sha256' <> expected.raw_sha
      or supplied -> 'raw_row' ->> 'rawRecordSha256' <> expected.raw_sha
      or supplied -> 'normalized_row' ->> 'itemNumber' <> expected.item_number
      or supplied -> 'normalized_row' ->> 'manufacturerPartNumber' <> expected.model_number
      or supplied -> 'normalized_row' ->> 'manufacturerName' <> expected.brand
      or supplied -> 'normalized_row' ->> 'canonicalName' <> expected.canonical_name
      or supplied -> 'normalized_row' ->> 'categoryCode' <> expected.category_code
      or supplied -> 'normalized_row' ->> 'categoryName' <> expected.category_name
      or supplied -> 'normalized_row' ->> 'tradeCode' <> expected.trade_code
      or supplied -> 'normalized_row' ->> 'legacyCategory' <> expected.legacy_category
      or supplied -> 'normalized_row' ->> 'packageQuantity' is distinct from expected.package_quantity
      or supplied -> 'normalized_row' ->> 'priceAmount' <> expected.price_amount
      or supplied -> 'normalized_row' ->> 'sellUnitCode' <> expected.unit_code
      or supplied -> 'normalized_row' ->> 'priceUnitCode' <> expected.unit_code
      or supplied -> 'normalized_row' ->> 'observedAt' <> expected.observed_at
      or supplied -> 'normalized_row' ->> 'sourceRecordId' <> expected.source_record_id
      or supplied -> 'normalized_row' ->> 'identitySourceReference' <>
        ('https://www.lowes.com' || expected.identity_path)
      or supplied -> 'normalized_row' ->> 'priceEvidenceSurface' <> 'localized_search_results'
      or supplied -> 'normalized_row' ->> 'priceSourceReference' <>
        ('https://www.lowes.com' || expected.price_path)
      or not (supplied -> 'normalized_row' ? 'taxIncluded')
      or jsonb_typeof(supplied -> 'normalized_row' -> 'taxIncluded') <> 'null'
      or supplied -> 'raw_row' ->> 'itemNumber' <> expected.item_number
      or supplied -> 'raw_row' ->> 'modelNumber' <> expected.model_number
      or supplied -> 'raw_row' ->> 'brand' <> expected.brand
      or supplied -> 'raw_row' ->> 'canonicalName' <> expected.canonical_name
      or supplied -> 'raw_row' ->> 'categoryCode' <> expected.category_code
      or supplied -> 'raw_row' ->> 'categoryName' <> expected.category_name
      or supplied -> 'raw_row' ->> 'tradeCode' <> expected.trade_code
      or supplied -> 'raw_row' ->> 'legacyCategory' <> expected.legacy_category
      or supplied -> 'raw_row' ->> 'packageQuantity' is distinct from expected.package_quantity
      or supplied -> 'raw_row' ->> 'priceAmount' <> expected.price_amount
      or supplied -> 'raw_row' ->> 'sellUnitCode' <> expected.unit_code
      or supplied -> 'raw_row' ->> 'priceUnitCode' <> expected.unit_code
      or supplied -> 'raw_row' ->> 'sourceRecordId' <> expected.source_record_id
      or supplied -> 'raw_row' ->> 'identitySourceReference' <>
        ('https://www.lowes.com' || expected.identity_path)
      or supplied -> 'raw_row' ->> 'canonicalUrl' <>
        ('https://www.lowes.com' || expected.identity_path)
      or supplied -> 'raw_row' ->> 'priceEvidenceSurface' <> 'localized_search_results'
      or supplied -> 'raw_row' ->> 'priceSourceReference' <>
        ('https://www.lowes.com' || expected.price_path)
      or supplied -> 'raw_row' ->> 'adapterVersion' <> 'lowes-east-knoxville-public-retail-v1'
      or supplied -> 'raw_row' ->> 'availabilityStatus' <> 'unknown'
      or supplied -> 'raw_row' ->> 'currencyCode' <> 'USD'
      or supplied -> 'raw_row' ->> 'observedAt' <> expected.observed_at
      or supplied -> 'raw_row' ->> 'priceType' <> 'retail'
      or supplied -> 'raw_row' ->> 'storeNumber' <> '1544'
      or not (supplied -> 'raw_row' ? 'taxIncluded')
      or jsonb_typeof(supplied -> 'raw_row' -> 'taxIncluded') <> 'null'
  ) then
    raise exception 'The staged rows do not match the four approved Lowe''s observations.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    requested_company_id::text || ':' || requested_manifest_sha256, 0
  ));

  select * into supplier_record from public.suppliers where slug = 'lowes' for update;
  if not found then
    insert into public.suppliers (
      name, slug, supplier_type, website_url, supports_csv_import,
      supports_quote_import, supports_live_lookup, is_active, metadata
    ) values (
      'Lowe''s', 'lowes', 'retailer', 'https://www.lowes.com', false,
      false, false, true, '{"sourceScope":"public_retail"}'::jsonb
    ) returning * into supplier_record;
  elsif supplier_record.name <> 'Lowe''s' or supplier_record.supplier_type <> 'retailer' then
    raise exception 'The Lowe''s supplier identity conflicts with the approved pilot.';
  end if;

  select * into location_record from public.supplier_locations
  where supplier_id = supplier_record.id and store_number = '1544' for update;
  if not found then
    insert into public.supplier_locations (
      supplier_id, name, store_number, address_line_1, city, state,
      postal_code, is_default, is_active, metadata
    ) values (
      supplier_record.id, 'E. Knoxville Lowe''s', '1544', '3100 S Mall Rd NE',
      'Knoxville', 'TN', '37924', false, true,
      '{"sourceScope":"public_store_identity"}'::jsonb
    ) returning * into location_record;
  elsif location_record.address_line_1 <> '3100 S Mall Rd NE'
    or location_record.city <> 'Knoxville' or location_record.state <> 'TN'
    or location_record.postal_code <> '37924' then
    raise exception 'Lowe''s store 1544 conflicts with the approved public location.';
  end if;

  select * into batch_record from public.material_catalog_import_batches
  where company_id = requested_company_id and supplier_id = supplier_record.id
    and file_sha256 = requested_manifest_sha256 and status <> 'cancelled'
  for update;
  if found then
    if batch_record.import_type <> 'web_lookup'
      or batch_record.supplier_location_id <> location_record.id
      or batch_record.parser_version <> requested_parser_version
      or (select count(*) from public.material_price_import_rows
          where import_id = batch_record.id and company_id = requested_company_id) <> 4 then
      raise exception 'The existing manifest batch is incomplete or conflicts with the pilot.';
    end if;
    return jsonb_build_object('importId', batch_record.id, 'state', batch_record.status, 'idempotentReplay', true);
  end if;

  insert into public.material_catalog_import_batches (
    company_id, supplier_id, supplier_location_id, import_type,
    original_filename, file_sha256, parser_version, status, total_rows,
    valid_rows, review_rows, excluded_rows, metadata, created_by_auth_user_id
  ) values (
    requested_company_id, supplier_record.id, location_record.id, 'web_lookup',
    requested_parser_version || '.json', requested_manifest_sha256,
    requested_parser_version, 'review_required', 4, 4, 4, 0,
    '{"sourceScope":"public_retail","locationScope":"store","availabilityCaptured":false}'::jsonb,
    requested_auth_user_id
  ) returning * into batch_record;

  insert into public.material_price_import_rows (
    company_id, import_id, source_row_number, raw_row, raw_row_sha256,
    normalized_row, validation_errors, validation_warnings, row_status,
    normalized_supplier_sku, normalized_manufacturer_name,
    normalized_manufacturer_part_number, normalized_description,
    normalized_unit_code, normalized_currency_code
  )
  select requested_company_id, batch_record.id,
    (value ->> 'source_row_number')::integer, value -> 'raw_row',
    value ->> 'raw_row_sha256', value -> 'normalized_row', '[]'::jsonb,
    '["Availability, delivery, and tax were not captured and must remain unknown."]'::jsonb,
    'unmatched', value ->> 'normalized_supplier_sku',
    value ->> 'normalized_manufacturer_name',
    value ->> 'normalized_manufacturer_part_number',
    value ->> 'normalized_description', value ->> 'normalized_unit_code', 'USD'
  from jsonb_array_elements(requested_rows)
  order by (value ->> 'source_row_number')::integer;

  return jsonb_build_object('importId', batch_record.id, 'state', batch_record.status, 'idempotentReplay', false);
end
$function$;

create or replace function public.review_material_catalog_web_lookup_import(
  requested_import_id uuid,
  requested_company_id uuid,
  requested_auth_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  batch_record public.material_catalog_import_batches;
  row_record public.material_price_import_rows;
  normalized jsonb;
  manufacturer_record public.material_manufacturers;
  category_record public.material_categories;
  product_record public.material_catalog;
  unit_id uuid;
  product_code text;
  fingerprint text;
  active_decision public.material_import_review_decisions;
  reviewed_count integer := 0;
begin
  perform public.assert_material_catalog_mutation_access(
    requested_company_id, requested_auth_user_id, 'review_product_mappings'
  );
  select * into batch_record from public.material_catalog_import_batches
  where id = requested_import_id and company_id = requested_company_id for update;
  if not found or batch_record.import_type <> 'web_lookup'
    or batch_record.parser_version <> 'lowes-east-knoxville-public-retail-v1'
    or batch_record.status not in ('review_required', 'preview_ready') then
    raise exception 'A staged, unpublished Lowe''s pilot batch is required.';
  end if;
  if (select count(*) from public.material_price_import_rows
      where import_id = requested_import_id and company_id = requested_company_id) <> 4 then
    raise exception 'The approved pilot requires exactly four durable rows.';
  end if;

  for row_record in
    select * from public.material_price_import_rows
    where import_id = requested_import_id and company_id = requested_company_id
    order by source_row_number for update
  loop
    normalized := row_record.normalized_row;
    if normalized ->> 'availabilityStatus' <> 'unknown'
      or normalized ->> 'priceType' <> 'retail'
      or normalized ->> 'currencyCode' <> 'USD'
      or normalized ->> 'storeNumber' <> '1544'
      or normalized ->> 'observedAt' <> (case
        when normalized ->> 'itemNumber' = '312282' then '2026-08-11T21:50:36.621Z'
        else '2026-08-11T20:52:58.340Z'
      end)
      or normalized ->> 'itemNumber' is null
      or normalized ->> 'manufacturerName' is null
      or normalized ->> 'manufacturerPartNumber' is null
      or normalized ->> 'canonicalName' is null
      or normalized ->> 'categoryCode' !~ '^[a-z][a-z0-9_]{1,63}$'
      or normalized ->> 'tradeCode' !~ '^[a-z][a-z0-9_]{1,63}$' then
      raise exception 'A reviewed row lacks approved canonical identity evidence.';
    end if;

    select * into manufacturer_record from public.material_manufacturers
    where normalized_name = lower(normalized ->> 'manufacturerName') and status <> 'merged'
    for update;
    if not found then
      insert into public.material_manufacturers (
        canonical_name, normalized_name, status, metadata,
        created_by_auth_user_id, reviewed_by_auth_user_id, reviewed_at
      ) values (
        normalized ->> 'manufacturerName', lower(normalized ->> 'manufacturerName'),
        'active', '{"identityBasis":"reviewed_brand_as_manufacturer_label"}'::jsonb,
        requested_auth_user_id, requested_auth_user_id, now()
      ) returning * into manufacturer_record;
    end if;

    select * into category_record from public.material_categories
    where code = normalized ->> 'categoryCode' for update;
    if not found then
      insert into public.material_categories (
        code, name, trade_code, identity_policy_version, status, metadata
      ) values (
        normalized ->> 'categoryCode', normalized ->> 'categoryName',
        normalized ->> 'tradeCode', 'lowes-public-retail-v1', 'active',
        '{"pilot":"lowes-east-knoxville-public-retail-v1"}'::jsonb
      ) returning * into category_record;
    end if;

    select id into unit_id from public.units_of_measure
    where code = normalized ->> 'sellUnitCode' and is_active;
    if unit_id is null then raise exception 'The reviewed sell unit is unavailable.'; end if;
    product_code := 'MCK-LWS-' || (normalized ->> 'itemNumber');
    fingerprint := encode(extensions.digest(
      lower(normalized ->> 'manufacturerName') || '|' ||
      upper(regexp_replace(normalized ->> 'manufacturerPartNumber', '[^A-Za-z0-9]', '', 'g')) || '|' ||
      (normalized ->> 'categoryCode'), 'sha256'), 'hex');

    select * into product_record from public.material_catalog
    where mckenzie_product_code = product_code for update;
    if not found then
      insert into public.material_catalog (
        sku, category, description, brand, product_line, unit, unit_cost,
        supplier_name, supplier_item_number, waste_percent, is_active, metadata,
        mckenzie_product_code, manufacturer_id,
        manufacturer_part_number_normalized, category_id, canonical_name,
        stocking_unit_id, lifecycle_status, identity_fingerprint, identity_version
      ) values (
        null, normalized ->> 'legacyCategory', normalized ->> 'canonicalName',
        normalized ->> 'manufacturerName', null,
        case when normalized ->> 'sellUnitCode' = 'PACK' then 'box' else 'each' end,
        0, null, null, 0, true,
        '{"compatibilityPrice":"not_catalog_evidence"}'::jsonb,
        product_code, manufacturer_record.id,
        upper(regexp_replace(normalized ->> 'manufacturerPartNumber', '[^A-Za-z0-9]', '', 'g')),
        category_record.id, normalized ->> 'canonicalName', unit_id, 'active',
        fingerprint, 'material-web-review-v1'
      ) returning * into product_record;
    elsif product_record.identity_fingerprint is distinct from fingerprint then
      raise exception 'A Lowe''s pilot product code conflicts with existing identity evidence.';
    end if;

    select * into active_decision from public.material_import_review_decisions
    where import_row_id = row_record.id and invalidated_at is null for update;
    if found then
      if active_decision.decision <> 'create_offer'
        or active_decision.material_catalog_id <> product_record.id
        or active_decision.reviewed_row_revision <> row_record.row_revision then
        raise exception 'A conflicting active review decision already exists.';
      end if;
    else
      update public.material_price_import_rows
      set row_status = 'reviewed', row_revision = row_revision + 1
      where id = row_record.id returning * into row_record;
      insert into public.material_import_review_decisions (
        company_id, import_id, import_row_id, decision, material_catalog_id,
        reviewed_row_revision, algorithm_version, reason_code,
        decided_by_auth_user_id
      ) values (
        requested_company_id, requested_import_id, row_record.id, 'create_offer',
        product_record.id, row_record.row_revision,
        'lowes-east-knoxville-public-retail-v1',
        'controller_verified_public_retail_pilot', requested_auth_user_id
      );
    end if;
    reviewed_count := reviewed_count + 1;
  end loop;
  return jsonb_build_object('importId', requested_import_id, 'state', 'reviewed', 'reviewedRows', reviewed_count);
end
$function$;

create or replace function public.preview_material_catalog_web_lookup_import(
  requested_import_id uuid,
  requested_company_id uuid,
  requested_auth_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  batch_record public.material_catalog_import_batches;
  generated_preview_id uuid;
  preview_content jsonb;
  preview_sha text;
  existing_preview public.material_import_change_previews;
  item_record record;
  after_state jsonb;
begin
  perform public.assert_material_catalog_mutation_access(
    requested_company_id, requested_auth_user_id, 'preview_price_changes'
  );
  perform pg_advisory_xact_lock(hashtextextended(
    requested_company_id::text || ':' || requested_import_id::text || ':preview', 0
  ));
  select * into batch_record from public.material_catalog_import_batches
  where id = requested_import_id and company_id = requested_company_id for update;
  if not found or batch_record.import_type <> 'web_lookup'
    or batch_record.status not in ('review_required', 'preview_ready') then
    raise exception 'A reviewed, unpublished web-lookup batch is required.';
  end if;

  select jsonb_build_object(
    'batchRevision', batch_record.batch_revision,
    'policyVersion', 'material-web-review-v1',
    'items', jsonb_agg(jsonb_build_object(
      'importRowId', import_row.id,
      'materialCatalogId', decision.material_catalog_id,
      'rowRevision', import_row.row_revision,
      'rawRecordSha256', import_row.raw_row_sha256
    ) order by import_row.source_row_number)
  ) into preview_content
  from public.material_price_import_rows import_row
  join public.material_import_review_decisions decision
    on decision.import_row_id = import_row.id and decision.import_id = import_row.import_id
   and decision.company_id = import_row.company_id and decision.invalidated_at is null
  where import_row.import_id = requested_import_id
    and import_row.company_id = requested_company_id
    and import_row.row_status = 'reviewed'
    and decision.decision = 'create_offer'
    and decision.reviewed_row_revision = import_row.row_revision;
  if jsonb_array_length(preview_content -> 'items') <> 4 then
    raise exception 'Every pilot row requires a current reviewed product decision.';
  end if;
  preview_sha := encode(extensions.digest(preview_content::text, 'sha256'), 'hex');

  select * into existing_preview from public.material_import_change_previews
  where import_id = requested_import_id and content_sha256 = preview_sha;
  if found then
    if (select count(*) from public.material_import_change_items
        where material_import_change_items.preview_id = existing_preview.id) <> 4 then
      raise exception 'The existing immutable preview is incomplete.';
    end if;
    return jsonb_build_object('importId', requested_import_id, 'previewId', existing_preview.id,
      'previewSha256', preview_sha, 'idempotentReplay', true);
  end if;

  generated_preview_id := gen_random_uuid();
  insert into public.material_import_change_previews (
    id, company_id, import_id, preview_version, batch_revision,
    policy_version, content_sha256, summary, created_by_auth_user_id
  ) values (
    generated_preview_id, requested_company_id, requested_import_id,
    coalesce((select max(preview_version) + 1 from public.material_import_change_previews
      where import_id = requested_import_id), 1), batch_record.batch_revision,
    'material-web-review-v1', preview_sha,
    '{"source":"Lowe''s public retail","storeNumber":"1544","newOffers":4,"newObservations":4,"excludedRows":0,"availability":"unknown"}'::jsonb,
    requested_auth_user_id
  );

  for item_record in
    select import_row.*, decision.material_catalog_id
    from public.material_price_import_rows import_row
    join public.material_import_review_decisions decision
      on decision.import_row_id = import_row.id and decision.invalidated_at is null
    where import_row.import_id = requested_import_id
      and import_row.company_id = requested_company_id
    order by import_row.source_row_number
  loop
    after_state := jsonb_build_object(
      'adapterVersion', item_record.normalized_row ->> 'adapterVersion',
      'availabilityStatus', 'unknown', 'confidence', 'confirmed',
      'currencyCode', 'USD',
      'effectiveFrom', item_record.normalized_row ->> 'observedAt',
      'materialCatalogId', item_record.material_catalog_id,
      'observedAt', item_record.normalized_row ->> 'observedAt',
      'priceAmount', item_record.normalized_row ->> 'priceAmount',
      'priceQuantity', '1', 'priceType', 'retail',
      'priceUnitCode', item_record.normalized_row ->> 'priceUnitCode',
      'rawRecordSha256', item_record.raw_row_sha256,
      'sellUnitCode', item_record.normalized_row ->> 'sellUnitCode',
      'sourceRecordId', item_record.normalized_row ->> 'sourceRecordId',
      'identitySourceReference', item_record.normalized_row ->> 'identitySourceReference',
      'priceEvidenceSurface', item_record.normalized_row ->> 'priceEvidenceSurface',
      'priceSourceReference', item_record.normalized_row ->> 'priceSourceReference',
      'sourceType', 'web_lookup',
      'supplierDescription', item_record.normalized_row ->> 'canonicalName',
      'supplierManufacturerName', item_record.normalized_row ->> 'manufacturerName',
      'supplierManufacturerPartNumber', item_record.normalized_row ->> 'manufacturerPartNumber',
      'supplierSku', item_record.normalized_row ->> 'itemNumber',
      'taxIncluded', null
    );
    insert into public.material_import_change_items (
      company_id, import_id, preview_id, import_row_id, change_type,
      before_state, after_state, requires_attention, attention_reasons
    ) values (
      requested_company_id, requested_import_id, generated_preview_id, item_record.id,
      'new_offer', null, after_state, false, '[]'::jsonb
    );
  end loop;
  update public.material_catalog_import_batches set status = 'preview_ready'
  where id = requested_import_id and company_id = requested_company_id;
  return jsonb_build_object('importId', requested_import_id, 'previewId', generated_preview_id,
    'previewSha256', preview_sha, 'idempotentReplay', false);
end
$function$;

create or replace function public.approve_material_catalog_import(
  requested_import_id uuid,
  requested_preview_id uuid,
  requested_company_id uuid,
  requested_auth_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  batch_record public.material_catalog_import_batches;
  preview_record public.material_import_change_previews;
begin
  perform public.assert_material_catalog_mutation_access(
    requested_company_id, requested_auth_user_id, 'publish_supplier_prices'
  );
  select * into batch_record from public.material_catalog_import_batches
  where id = requested_import_id and company_id = requested_company_id for update;
  select * into preview_record from public.material_import_change_previews
  where id = requested_preview_id and import_id = requested_import_id
    and company_id = requested_company_id;
  if batch_record.id is null or preview_record.id is null
    or batch_record.status <> 'preview_ready'
    or batch_record.batch_revision <> preview_record.batch_revision
    or (select count(*) from public.material_import_change_items
        where preview_id = requested_preview_id) <> 4 then
    raise exception 'A complete, current preview is required for approval.';
  end if;
  update public.material_catalog_import_batches
  set status = 'approved', approved_preview_sha256 = preview_record.content_sha256,
    approved_at = now(), approved_by_auth_user_id = requested_auth_user_id
  where id = requested_import_id;
  return jsonb_build_object('importId', requested_import_id, 'previewId', requested_preview_id,
    'previewSha256', preview_record.content_sha256, 'state', 'approved');
end
$function$;

create or replace function public.publish_material_catalog_import(
  requested_import_id uuid,
  requested_preview_id uuid,
  requested_preview_sha256 text,
  requested_idempotency_key text,
  requested_company_id uuid,
  requested_auth_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  effective_access jsonb;
  feature_map jsonb;
  batch_record public.material_catalog_import_batches;
  preview_record public.material_import_change_previews;
  prior_publication public.material_import_publications;
  publication_id uuid;
  change_count integer;
  item_record record;
  state jsonb;
  decision_record public.material_import_review_decisions;
  offer_record public.supplier_product_offers;
  sell_unit_id uuid;
  price_unit_id uuid;
  observation_id uuid;
begin
  if requested_preview_sha256 !~ '^[0-9a-f]{64}$'
    or btrim(coalesce(requested_idempotency_key, '')) = '' then
    raise exception 'A valid preview hash and idempotency key are required.';
  end if;

  select public.get_effective_user_access(requested_auth_user_id)
  into effective_access;
  if effective_access is null
    or effective_access ->> 'auth_user_id' is distinct from requested_auth_user_id::text
    or effective_access ->> 'company_id' is distinct from requested_company_id::text
    or coalesce((effective_access -> 'permissions' ->> 'edit_prices')::boolean, false) is not true
    or coalesce((effective_access -> 'permissions' ->> 'manage_suppliers')::boolean, false) is not true then
    raise exception 'Catalog publication access was denied.';
  end if;

  if (select count(*) from public.company_settings) <> 1
    or not exists (select 1 from public.company_settings where id = requested_company_id) then
    raise exception 'Catalog publication requires the transitional singleton company scope.';
  end if;

  select public.get_effective_feature_map('global', 'default') into feature_map;
  if coalesce((feature_map ->> 'material_catalog')::boolean, false) is not true
    or coalesce((feature_map ->> 'material_catalog_price_publication')::boolean, false) is not true then
    raise exception 'Catalog price publication is disabled.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    requested_company_id::text || ':' || requested_import_id::text || ':publish', 0
  ));

  select * into prior_publication
  from public.material_import_publications
  where company_id = requested_company_id
    and idempotency_key = requested_idempotency_key;
  if found then
    if prior_publication.import_id <> requested_import_id
      or prior_publication.preview_id <> requested_preview_id
      or prior_publication.preview_sha256 <> requested_preview_sha256 then
      raise exception 'The idempotency key is already bound to different publication evidence.';
    end if;
    return jsonb_build_object(
      'publicationId', prior_publication.id,
      'publishedObservationCount', prior_publication.published_observation_count,
      'idempotentReplay', true
    );
  end if;

  select * into batch_record
  from public.material_catalog_import_batches
  where id = requested_import_id and company_id = requested_company_id
  for update;
  if not found
    or batch_record.status <> 'approved'
    or batch_record.import_type <> 'web_lookup'
    or batch_record.approved_preview_sha256 is distinct from requested_preview_sha256
    or batch_record.approved_at is null
    or batch_record.approved_by_auth_user_id is null then
    raise exception 'An approved, company-scoped import batch is required.';
  end if;

  select * into preview_record
  from public.material_import_change_previews
  where id = requested_preview_id
    and import_id = requested_import_id
    and company_id = requested_company_id;
  if not found
    or preview_record.content_sha256 <> requested_preview_sha256
    or preview_record.batch_revision <> batch_record.batch_revision then
    raise exception 'The approved preview is stale or does not match the import batch.';
  end if;

  select count(*) into change_count
  from public.material_import_change_items
  where preview_id = requested_preview_id
    and import_id = requested_import_id
    and company_id = requested_company_id
    and change_type in ('new_offer', 'new_observation');
  if change_count < 1 or change_count > 50
    or change_count <> batch_record.valid_rows then
    raise exception 'The bounded publication must contain every valid row and no more than 50 observations.';
  end if;

  publication_id := gen_random_uuid();
  insert into public.material_import_publications (
    id, company_id, import_id, preview_id, preview_sha256, idempotency_key,
    published_observation_count, excluded_row_count, result_summary,
    published_by_auth_user_id
  ) values (
    publication_id, requested_company_id, requested_import_id,
    requested_preview_id, requested_preview_sha256, requested_idempotency_key,
    change_count, 0,
    jsonb_build_object('publicationMode', 'reviewed_append_only', 'observationCount', change_count),
    requested_auth_user_id
  );

  for item_record in
    select change_item.*, import_row.row_revision, import_row.source_row_number
    from public.material_import_change_items change_item
    join public.material_price_import_rows import_row
      on import_row.id = change_item.import_row_id
     and import_row.import_id = change_item.import_id
     and import_row.company_id = change_item.company_id
    where change_item.preview_id = requested_preview_id
      and change_item.import_id = requested_import_id
      and change_item.company_id = requested_company_id
      and change_item.change_type in ('new_offer', 'new_observation')
    order by import_row.source_row_number, import_row.id
  loop
    state := item_record.after_state;
    if state is null
      or state ->> 'sourceType' <> 'web_lookup'
      or state ->> 'availabilityStatus' <> 'unknown'
      or state ->> 'priceType' <> 'retail'
      or state ->> 'currencyCode' <> 'USD'
      or state ->> 'confidence' <> 'confirmed'
      or not state ? 'taxIncluded'
      or jsonb_typeof(state -> 'taxIncluded') <> 'null'
      or state ->> 'rawRecordSha256' !~ '^[0-9a-f]{64}$'
      or state ->> 'priceAmount' !~ '^\d+(\.\d{1,4})?$'
      or state ->> 'priceQuantity' !~ '^\d+(\.\d{1,8})?$'
      or state ->> 'identitySourceReference' !~ '^https://www\.lowes\.com/pd/[A-Za-z0-9-]+/[0-9]+$'
      or state ->> 'priceEvidenceSurface' <> 'localized_search_results'
      or state ->> 'priceSourceReference' !~ '^https://www\.lowes\.com/search\?searchTerm='
      or btrim(coalesce(state ->> 'sourceRecordId', '')) = ''
      or btrim(coalesce(state ->> 'supplierSku', '')) = '' then
      raise exception 'A preview row contains invalid or unsupported public-retail evidence.';
    end if;

    select * into decision_record
    from public.material_import_review_decisions
    where import_row_id = item_record.import_row_id
      and import_id = requested_import_id
      and company_id = requested_company_id
      and invalidated_at is null;
    if not found
      or decision_record.decision not in ('create_offer', 'map_existing_offer')
      or decision_record.reviewed_row_revision <> item_record.row_revision
      or decision_record.material_catalog_id::text is distinct from state ->> 'materialCatalogId' then
      raise exception 'A current reviewed product mapping is required for every published row.';
    end if;

    select id into sell_unit_id from public.units_of_measure
    where code = state ->> 'sellUnitCode' and is_active;
    select id into price_unit_id from public.units_of_measure
    where code = state ->> 'priceUnitCode' and is_active;
    if sell_unit_id is null or price_unit_id is null then
      raise exception 'A reviewed active sell unit and price unit are required.';
    end if;

    if decision_record.decision = 'map_existing_offer' then
      select * into offer_record from public.supplier_product_offers
      where id = decision_record.supplier_product_offer_id
        and supplier_id = batch_record.supplier_id
        and material_catalog_id = decision_record.material_catalog_id
        and supplier_location_id is not distinct from batch_record.supplier_location_id;
      if not found then raise exception 'The reviewed supplier offer is outside the batch scope.'; end if;
    else
      select * into offer_record from public.supplier_product_offers
      where supplier_id = batch_record.supplier_id
        and supplier_location_id is not distinct from batch_record.supplier_location_id
        and supplier_sku_normalized = upper(regexp_replace(state ->> 'supplierSku', '[^A-Za-z0-9]', '', 'g'))
        and mapping_status in ('unverified', 'verified', 'disputed');
      if found and offer_record.material_catalog_id <> decision_record.material_catalog_id then
        raise exception 'The supplier SKU is already mapped to a different canonical product.';
      end if;
      if not found then
        insert into public.supplier_product_offers (
          supplier_id, supplier_location_id, material_catalog_id,
          supplier_sku, supplier_sku_normalized, supplier_description,
          supplier_manufacturer_name, supplier_manufacturer_part_number,
          sell_unit_id, mapping_status, source_type, source_reference,
          verified_at, verified_by_auth_user_id
        ) values (
          batch_record.supplier_id, batch_record.supplier_location_id,
          decision_record.material_catalog_id, state ->> 'supplierSku',
          upper(regexp_replace(state ->> 'supplierSku', '[^A-Za-z0-9]', '', 'g')),
          state ->> 'supplierDescription', state ->> 'supplierManufacturerName',
          state ->> 'supplierManufacturerPartNumber', sell_unit_id, 'verified',
          'web_lookup', state ->> 'identitySourceReference', now(), requested_auth_user_id
        ) returning * into offer_record;
      end if;
    end if;

    insert into public.supplier_offer_observations (
      supplier_product_offer_id, supplier_id, company_id, supplier_location_id,
      observed_at, effective_from, availability_status, source_type,
      source_reference, source_record_id, raw_record_sha256, adapter_version,
      confidence, published_by_auth_user_id
    ) values (
      offer_record.id, batch_record.supplier_id, requested_company_id,
      batch_record.supplier_location_id, (state ->> 'observedAt')::timestamptz,
      (state ->> 'effectiveFrom')::timestamptz, 'unknown', 'web_lookup',
      state ->> 'priceSourceReference', state ->> 'sourceRecordId',
      state ->> 'rawRecordSha256', state ->> 'adapterVersion', 'confirmed',
      requested_auth_user_id
    ) returning id into observation_id;

    insert into public.supplier_offer_observation_prices (
      observation_id, price_type, amount, currency_code, price_quantity,
      price_unit_id, tax_included
    ) values (
      observation_id, 'retail', (state ->> 'priceAmount')::numeric,
      'USD', (state ->> 'priceQuantity')::numeric, price_unit_id, null
    );

    insert into public.material_import_publication_rows (
      company_id, import_id, publication_id, import_row_id, outcome,
      supplier_product_offer_id, supplier_offer_observation_id
    ) values (
      requested_company_id, requested_import_id, publication_id,
      item_record.import_row_id, 'published', offer_record.id, observation_id
    );

    update public.material_price_import_rows
    set row_status = 'published'
    where id = item_record.import_row_id
      and import_id = requested_import_id
      and company_id = requested_company_id;
  end loop;

  update public.material_catalog_import_batches
  set status = 'published', published_at = now()
  where id = requested_import_id and company_id = requested_company_id;

  return jsonb_build_object(
    'publicationId', publication_id,
    'publishedObservationCount', change_count,
    'idempotentReplay', false
  );
end
$function$;

revoke all on function public.assert_material_catalog_mutation_access(uuid,uuid,text),
  public.stage_material_catalog_web_lookup_import(uuid,uuid,text,text,jsonb),
  public.review_material_catalog_web_lookup_import(uuid,uuid,uuid),
  public.preview_material_catalog_web_lookup_import(uuid,uuid,uuid),
  public.approve_material_catalog_import(uuid,uuid,uuid,uuid),
  public.publish_material_catalog_import(uuid,uuid,text,text,uuid,uuid)
from public, anon, authenticated;

grant execute on function
  public.stage_material_catalog_web_lookup_import(uuid,uuid,text,text,jsonb),
  public.review_material_catalog_web_lookup_import(uuid,uuid,uuid),
  public.preview_material_catalog_web_lookup_import(uuid,uuid,uuid),
  public.approve_material_catalog_import(uuid,uuid,uuid,uuid),
  public.publish_material_catalog_import(uuid,uuid,text,text,uuid,uuid)
to service_role;

commit;
