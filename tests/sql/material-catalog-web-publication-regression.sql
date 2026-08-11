begin;

do $test$
declare
  fixture_company_id uuid;
  actor_id uuid := gen_random_uuid();
  manifest_sha text := '01c14b6ad3536b100bc308126e88bea19658f3406f7e1d6c14f27c196872c9f1';
  evidence_rows jsonb;
  stage_result jsonb;
  review_result jsonb;
  preview_result jsonb;
  approval_result jsonb;
  import_id uuid;
  preview_id uuid;
  preview_sha text;
begin
  select id into strict fixture_company_id from public.company_settings;
  insert into auth.users (
    id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at
  ) values (
    actor_id, 'authenticated', 'authenticated',
    'material-publication-regression@example.invalid', '{}'::jsonb, '{}'::jsonb,
    now(), now()
  );
  insert into public.app_users (
    auth_user_id, company_id, display_name, email, role, default_portal,
    preferred_language, is_active, permissions, metadata
  ) values (
    actor_id, fixture_company_id, 'Material publication regression',
    'material-publication-regression@example.invalid', 'owner', 'admin', 'en', true,
    '{"view_costs":true,"edit_prices":true,"manage_suppliers":true}'::jsonb,
    '{}'::jsonb
  );
  update public.feature_settings set is_enabled = true
  where scope_type = 'global' and scope_id = 'default'
    and feature_key in ('material_catalog', 'material_catalog_price_publication');

  select jsonb_agg(jsonb_build_object(
    'source_row_number', source_row_number,
    'raw_row', jsonb_build_object(
      'adapterVersion', 'lowes-east-knoxville-public-retail-v1',
      'availabilityStatus', 'unknown', 'brand', brand,
      'canonicalName', product_name, 'categoryCode', category_code,
      'categoryName', category_name, 'canonicalUrl', 'https://www.lowes.com' || source_path,
      'currencyCode', 'USD', 'identitySourceReference', 'https://www.lowes.com' || source_path,
      'itemNumber', item_number, 'legacyCategory', legacy_category,
      'modelNumber', model_number, 'observedAt', observed_at,
      'packageQuantity', package_quantity, 'priceAmount', price_amount,
      'priceEvidenceSurface', 'localized_search_results',
      'priceSourceReference', 'https://www.lowes.com' || price_path,
      'priceType', 'retail', 'priceUnitCode', unit_code,
      'rawRecordSha256', raw_sha, 'sellUnitCode', unit_code,
      'sourceRecordId', 'lowes:item:' || item_number || ':store:1544',
      'storeNumber', '1544', 'taxIncluded', null, 'tradeCode', trade_code
    ),
    'raw_row_sha256', raw_sha,
    'normalized_supplier_sku', item_number,
    'normalized_manufacturer_name', lower(brand),
    'normalized_manufacturer_part_number', upper(regexp_replace(model_number, '[^A-Za-z0-9]', '', 'g')),
    'normalized_description', lower(product_name),
    'normalized_unit_code', unit_code,
    'normalized_row', jsonb_build_object(
      'adapterVersion', 'lowes-east-knoxville-public-retail-v1',
      'availabilityStatus', 'unknown', 'canonicalName', product_name,
      'categoryCode', category_code, 'categoryName', category_name,
      'currencyCode', 'USD', 'itemNumber', item_number,
      'legacyCategory', legacy_category, 'manufacturerName', brand,
      'manufacturerPartNumber', model_number,
      'observedAt', observed_at,
      'packageQuantity', package_quantity, 'priceAmount', price_amount,
      'priceEvidenceSurface', 'localized_search_results',
      'priceSourceReference', 'https://www.lowes.com' || price_path,
      'priceType', 'retail', 'priceUnitCode', unit_code,
      'sellUnitCode', unit_code,
      'sourceRecordId', 'lowes:item:' || item_number || ':store:1544',
      'identitySourceReference', 'https://www.lowes.com' || source_path,
      'storeNumber', '1544', 'taxIncluded', null, 'tradeCode', trade_code
    )
  ) order by source_row_number) into evidence_rows
  from (values
    (1, '202922', '635548', 'Severe Weather', 'Severe Weather 5/8-in x 5-1/2-in x 6-ft pressure-treated Southern yellow pine dog-ear fence picket', 'fence_pickets', 'Fence pickets', 'fencing', 'Fencing', '2.28', 'EA', null::text, '2026-08-11T20:52:58.340Z', '/pd/Severe-Weather-5-8-in-x-5-1-2-in-x-6-ft-Pressure-Treated-Southern-Yellow-Pine-Dog-Ear-Fence-Picket/5013086547', '/search?searchTerm=202922', '8587161a760ae10c57253d59c1b42837ebad1d33b11c98ada3543e4a67b55582'),
    (2, '10385', '110180', 'QUIKRETE', 'QUIKRETE 80-lb high-strength concrete mix bag', 'concrete_mix', 'Concrete mix', 'concrete', 'Concrete', '6.98', 'EA', null::text, '2026-08-11T20:52:58.340Z', '/pd/QUIKRETE-80-lb-High-Strength-Concrete-Mix/3006075', '/search?searchTerm=QUIKRETE%2080-lb%20concrete%20mix', '9c4d520d25a93ba6cb6d193d3eb00d006e3195d009f4ac6021422d42c024311e'),
    (3, '894294', '48419', 'Deck Plus', 'Deck Plus #10 x 3-in ceramic deck screws, 310-count box', 'deck_screws', 'Deck screws', 'fasteners', 'Fasteners', '29.98', 'PACK', '310', '2026-08-11T20:52:58.340Z', '/pd/Deck-Plus-10-x-3-in-Ceramic-Deck-Screws-5-lb/1000318525', '/search?searchTerm=Deck%20Plus%205-lb%203-in%20deck%20screws', 'ef0d643798c2d77802ee873b35a90264bf0071e394cfd3ba3cdf2a3e02e86e4a'),
    (4, '312282', 'OG220408-AG', 'Severe Weather', 'Severe Weather 2-in x 4-in x 8-ft pressure-treated dimensional lumber', 'dimensional_lumber', 'Dimensional lumber', 'framing', 'Lumber', '4.68', 'EA', null::text, '2026-08-11T21:50:36.621Z', '/pd/Severe-Weather-Common-2-in-x-4-in-x-8-ft-Actual-1-5-in-x-3-5-in-x-8-ft-2-Treated-Lumber/4564778', '/search?searchTerm=Severe%20Weather%202-in%20x%204-in%20x%208-ft%20pressure%20treated', 'f5cfd1193c06a950be237a6b8aaa547fc4e831c4f9fdece760b2e50e6bfcb507')
  ) as fixture(source_row_number, item_number, model_number, brand, product_name,
    category_code, category_name, trade_code, legacy_category, price_amount,
    unit_code, package_quantity, observed_at, source_path, price_path, raw_sha);

  stage_result := public.stage_material_catalog_web_lookup_import(
    fixture_company_id, actor_id, manifest_sha,
    'lowes-east-knoxville-public-retail-v1', evidence_rows
  );
  import_id := (stage_result ->> 'importId')::uuid;
  if stage_result ->> 'idempotentReplay' <> 'false' then raise exception 'First stage was not new.'; end if;
  if (public.stage_material_catalog_web_lookup_import(
      fixture_company_id, actor_id, manifest_sha,
      'lowes-east-knoxville-public-retail-v1', evidence_rows) ->> 'idempotentReplay') <> 'true' then
    raise exception 'Stage replay was not idempotent.';
  end if;

  review_result := public.review_material_catalog_web_lookup_import(
    import_id, fixture_company_id, actor_id
  );
  if (review_result ->> 'reviewedRows')::integer <> 4 then raise exception 'Review did not cover four rows.'; end if;
  preview_result := public.preview_material_catalog_web_lookup_import(
    import_id, fixture_company_id, actor_id
  );
  preview_id := (preview_result ->> 'previewId')::uuid;
  preview_sha := preview_result ->> 'previewSha256';
  if (public.preview_material_catalog_web_lookup_import(
      import_id, fixture_company_id, actor_id) ->> 'idempotentReplay') <> 'true' then
    raise exception 'Preview replay was not idempotent.';
  end if;
  approval_result := public.approve_material_catalog_import(
    import_id, preview_id, fixture_company_id, actor_id
  );
  if approval_result ->> 'state' <> 'approved' then raise exception 'Approval failed.'; end if;

end
$test$;

commit;

do $publication$
declare
  fixture_company_id uuid;
  actor_id uuid;
  fixture_import_id uuid;
  fixture_preview_id uuid;
  preview_sha text;
  result_one jsonb;
  result_two jsonb;
begin
  select id into strict fixture_company_id from public.company_settings;
  select auth_user_id into strict actor_id from public.app_users
  where email = 'material-publication-regression@example.invalid';
  select id, approved_preview_sha256 into strict fixture_import_id, preview_sha
  from public.material_catalog_import_batches
  where file_sha256 = '01c14b6ad3536b100bc308126e88bea19658f3406f7e1d6c14f27c196872c9f1';
  select id into strict fixture_preview_id from public.material_import_change_previews
  where import_id = fixture_import_id and content_sha256 = preview_sha;
  result_one := public.publish_material_catalog_import(
    fixture_import_id, fixture_preview_id, preview_sha,
    'regression:' || fixture_import_id::text,
    fixture_company_id, actor_id
  );
  result_two := public.publish_material_catalog_import(
    fixture_import_id, fixture_preview_id, preview_sha,
    'regression:' || fixture_import_id::text,
    fixture_company_id, actor_id
  );
  if result_one ->> 'publicationId' is distinct from result_two ->> 'publicationId'
    or array[result_one ->> 'idempotentReplay', result_two ->> 'idempotentReplay'] @>
      array['false', 'true'] is not true then
    raise exception 'Publication replay did not return the original result.';
  end if;
end
$publication$;

do $verify$
declare
  fixture_company_id uuid;
  actor_id uuid;
  observation_id uuid;
begin
  select id into strict fixture_company_id from public.company_settings;
  select auth_user_id into strict actor_id from public.app_users
  where email = 'material-publication-regression@example.invalid';
  if (select count(*) from public.supplier_offer_observations
      where company_id = fixture_company_id and source_type = 'web_lookup') <> 4 then
    raise exception 'Publication did not append exactly four observations.';
  end if;
  if exists (select 1 from public.supplier_offer_observations
      where company_id = fixture_company_id
        and source_reference not like 'https://www.lowes.com/search?searchTerm=%')
    or exists (select 1 from public.supplier_product_offers
      where source_type = 'web_lookup'
        and source_reference not like 'https://www.lowes.com/pd/%') then
    raise exception 'Price and identity provenance surfaces were conflated.';
  end if;
  select id into strict observation_id from public.supplier_offer_observations
  where company_id = fixture_company_id order by created_at limit 1;
  begin
    insert into public.supplier_offer_observations (
      supplier_product_offer_id, supplier_id, company_id, supplier_location_id,
      observed_at, effective_from, availability_status, source_type,
      source_reference, source_record_id, raw_record_sha256, adapter_version,
      confidence, corrects_observation_id, published_by_auth_user_id
    )
    select supplier_product_offer_id, supplier_id, company_id, supplier_location_id,
      now(), now(), 'unknown', 'web_lookup', source_reference,
      source_record_id || ':duplicate', raw_record_sha256, adapter_version,
      'confirmed', observation_id, actor_id
    from public.supplier_offer_observations where id = observation_id;
    raise exception 'A correction unexpectedly reused the prior evidence hash.';
  exception when unique_violation then null;
  end;
  insert into public.supplier_offer_observations (
    supplier_product_offer_id, supplier_id, company_id, supplier_location_id,
    observed_at, effective_from, availability_status, source_type,
    source_reference, source_record_id, raw_record_sha256, adapter_version,
    confidence, corrects_observation_id, published_by_auth_user_id
  )
  select supplier_product_offer_id, supplier_id, company_id, supplier_location_id,
    now(), now(), 'unknown', 'web_lookup', source_reference,
    source_record_id || ':corrected', repeat('e', 64), adapter_version,
    'confirmed', observation_id, actor_id
  from public.supplier_offer_observations where id = observation_id;
  if not exists (select 1 from public.supplier_offer_observations
      where corrects_observation_id = observation_id and raw_record_sha256 = repeat('e', 64)) then
    raise exception 'A newly hashed correction envelope was not accepted.';
  end if;
  begin
    update public.supplier_offer_observations set confidence = 'verified'
    where id = observation_id;
    raise exception 'Append-only observation unexpectedly allowed mutation.';
  exception when raise_exception then
    if sqlerrm <> 'Published material pricing history is append-only.' then raise; end if;
  end;
end
$verify$;
