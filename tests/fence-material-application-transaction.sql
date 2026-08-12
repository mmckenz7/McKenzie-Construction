begin;

do $test$
declare
  company_id uuid;
  auth_id uuid := '72000000-0000-4000-8000-000000000001';
  app_user_id uuid;
  fixture_estimate_id uuid := '72000000-0000-4000-8000-000000000002';
  fixture_draft_id uuid := '72000000-0000-4000-8000-000000000003';
  fixture_section_id uuid := '72000000-0000-4000-8000-000000000004';
  fixture_item_id uuid := '72000000-0000-4000-8000-000000000005';
  fixture_application_id uuid := '72000000-0000-4000-8000-000000000006';
  outcome record;
  new_items jsonb;
  item_calculations jsonb;
  estimate_calculation jsonb;
  evidence jsonb;
begin
  select id into strict company_id from public.company_settings;
  insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
  values(auth_id,'authenticated','authenticated','fence-application@example.invalid','{}','{}',now(),now());
  insert into public.app_users(auth_user_id,company_id,display_name,email,role,default_portal,preferred_language,is_active,permissions,metadata)
  values(auth_id,company_id,'Fence application','fence-application@example.invalid','owner','sales','en',true,
    '{"edit_prices":true,"view_costs":true,"view_profit":true}'::jsonb,'{}'::jsonb)
  returning id into app_user_id;
  insert into public.estimates(id,title,status,calculation_policy_version,calculation_revision,
    overhead_percent,profit_markup_percent,tax_rate_percent,discount_type,discount_value,costs_complete,prices_complete,
    scope_notes,presentation_detail_level,presentation_ohp_mode)
  values(fixture_estimate_id,'Fence transaction','draft','structured-estimate-v2-material-tax',0,
    0,0,0,'fixed_amount',0,true,true,'preserve scope','itemized','separate_line_item');
  insert into public.fence_estimate_drafts(id,company_id,estimate_id,revision,run_lengths_inches,total_length_inches,
    needs_gate,context_system,context_measurement_basis,context_terrain,context_frost_depth_inches,context_conditions,created_by,updated_by)
  values(fixture_draft_id,company_id,fixture_estimate_id,1,array[99],99,false,'emblem_6x8_white','post_centers','level',12,'none',app_user_id,app_user_id);

  new_items := jsonb_build_array(jsonb_build_object(
    'id',fixture_item_id,'section_id',fixture_section_id,'item_type','standard','quantity','1','unit','ea',
    'customer_description','Reviewed panel','internal_description','Lowe''s item 667016 · model 73014714',
    'material_unit_cost','10.00','labor_unit_cost','0','subcontractor_unit_cost','0','equipment_unit_cost','0',
    'other_direct_unit_cost','0','material_waste_percent','0','item_markup_percent','0','taxable',false,
    'is_included',true,'fixed_customer_price',null,'sort_order',0));
  item_calculations := jsonb_build_array((new_items->0) || jsonb_build_object(
    'costs_complete',true,'prices_complete',true,'material_cost_amount','10.00','labor_cost_amount','0.00',
    'subcontractor_cost_amount','0.00','equipment_cost_amount','0.00','other_direct_cost_amount','0.00',
    'item_markup_amount','0.00','line_type','other','category','structured','description','Reviewed panel',
    'base_unit_cost','10.0000','waste_percent','0','pricing_method','markup','markup_percent','0',
    'target_margin_percent',null,'fixed_price',null,'adjusted_quantity','1.0000','estimated_cost','10.00',
    'unit_price','10.0000','total_price','10.00','estimated_profit','0.00','estimated_margin','0.000',
    'is_optional',false,'notes','Lowe''s item 667016 · model 73014714','estimate_option_id',null,
    'material_catalog_id',null,'labor_catalog_id',null,'metadata','{}'::jsonb));
  estimate_calculation := jsonb_build_object(
    'calculation_policy_version','structured-estimate-v2-material-tax','costs_complete',true,'prices_complete',true,
    'subtotal_cost','10.00','subtotal_price','10.00','contingency_amount','0.00','discount_amount','0.00',
    'tax_amount','0.00','total_price','10.00','estimated_profit','0.00','estimated_margin','0.000',
    'item_markup_amount','0.00','overhead_amount','0.00','pre_profit_subtotal','10.00',
    'profit_markup_amount','0.00','pre_discount_subtotal','10.00','post_discount_subtotal','10.00',
    'taxable_item_price_subtotal','0.00','taxable_overhead_amount','0.00','taxable_profit_amount','0.00',
    'taxable_discount_amount','0.00','taxable_subtotal','0.00');
  evidence := jsonb_build_object('version','fence-reviewed-material-application-v1','fenceRevision',1,
    'previewBinding','binding-1','evidenceManifestSha256','sha','evidenceVersion','evidence-v1',
    'lines',jsonb_build_array(jsonb_build_object('estimateLineItemId',fixture_item_id,'demandKey','panel',
      'customerDescription','Reviewed panel','internalDescription','Lowe''s item 667016 · model 73014714',
      'quantity','1','materialUnitCost','10.00','itemNumber','667016','modelNumber','73014714',
      'identitySourceReference','https://www.lowes.com/pd/item/1','priceSourceReference','https://www.lowes.com/pd/item/1',
      'availabilityStatus','unknown')));

  select * into outcome from public.apply_reviewed_fence_materials(auth_id,fixture_estimate_id,fixture_application_id,
    '72000000-0000-4000-8000-000000000007',1,0,'fence-reviewed-material-application-v1','binding-1',
    fixture_section_id,'{}'::jsonb,item_calculations,estimate_calculation,evidence);
  if outcome.result_code <> 'invalid_application' then raise exception 'Malformed new-item object was not rejected.'; end if;

  select * into outcome from public.apply_reviewed_fence_materials(auth_id,fixture_estimate_id,fixture_application_id,
    '72000000-0000-4000-8000-000000000007',1,0,'fence-reviewed-material-application-v1','binding-1',
    fixture_section_id,new_items,item_calculations,estimate_calculation,evidence || jsonb_build_object('lines','{}'::jsonb));
  if outcome.result_code <> 'invalid_application' then raise exception 'Malformed evidence lines object was not rejected.'; end if;

  select * into outcome from public.apply_reviewed_fence_materials(auth_id,fixture_estimate_id,fixture_application_id,
    '72000000-0000-4000-8000-000000000007',1,0,'fence-reviewed-material-application-v1','binding-1',
    fixture_section_id,jsonb_build_array((new_items->0) || jsonb_build_object('quantity','not-numeric')),
    item_calculations,estimate_calculation,evidence);
  if outcome.result_code <> 'invalid_application' then raise exception 'Non-numeric item quantity was not rejected.'; end if;

  if (select calculation_revision from public.estimates where id=fixture_estimate_id) <> 0
    or exists(select 1 from public.estimate_sections where id=fixture_section_id)
    or exists(select 1 from public.fence_estimate_material_applications where id=fixture_application_id) then
    raise exception 'Malformed inputs changed section, application, or revision state.';
  end if;

  select * into outcome from public.apply_reviewed_fence_materials(auth_id,fixture_estimate_id,fixture_application_id,
    '72000000-0000-4000-8000-000000000007',1,0,'fence-reviewed-material-application-v1','binding-1',
    fixture_section_id,new_items || jsonb_build_array((new_items->0) || jsonb_build_object('id','72000000-0000-4000-8000-000000000008')),
    item_calculations,estimate_calculation,evidence);
  if outcome.result_code <> 'invalid_application'
    or (select calculation_revision from public.estimates where id=fixture_estimate_id) <> 0
    or exists(select 1 from public.estimate_sections where id=fixture_section_id)
    or exists(select 1 from public.fence_estimate_material_applications where id=fixture_application_id) then
    raise exception 'Tampered partial application was not rejected atomically.';
  end if;

  select * into outcome from public.apply_reviewed_fence_materials(auth_id,fixture_estimate_id,fixture_application_id,
    '72000000-0000-4000-8000-000000000007',1,0,'fence-reviewed-material-application-v1','binding-1',
    fixture_section_id,new_items,item_calculations,estimate_calculation,evidence);
  if outcome.result_code <> 'ok' or outcome.next_calculation_revision <> 1 then raise exception 'Atomic application failed.'; end if;
  if (select calculation_revision from public.estimates where id=fixture_estimate_id) <> 1
    or (select count(*) from public.estimate_line_items line where line.estimate_id=fixture_estimate_id) <> 1
    or (select count(*) from public.fence_estimate_material_application_lines line where line.application_id=fixture_application_id) <> 1
    or (select scope_notes from public.estimates where id=fixture_estimate_id) <> 'preserve scope'
    or (select presentation_detail_level from public.estimates where id=fixture_estimate_id) <> 'itemized'
    or (select presentation_ohp_mode from public.estimates where id=fixture_estimate_id) <> 'separate_line_item'
    or (select overhead_percent from public.estimates where id=fixture_estimate_id) <> 0
    or (select profit_markup_percent from public.estimates where id=fixture_estimate_id) <> 0
    or (select discount_value from public.estimates where id=fixture_estimate_id) <> 0
    or (select material_catalog_id from public.estimate_line_items where id=fixture_item_id) is not null then
    raise exception 'Application did not preserve the estimate or evidence contract.';
  end if;

  select * into outcome from public.apply_reviewed_fence_materials(auth_id,fixture_estimate_id,fixture_application_id,
    '72000000-0000-4000-8000-000000000007',1,0,'fence-reviewed-material-application-v1','binding-1',
    fixture_section_id,new_items,item_calculations,estimate_calculation,evidence);
  if outcome.result_code <> 'replayed_application' then raise exception 'Replay was not explicitly rejected: %.', outcome.result_code; end if;
  if (select calculation_revision from public.estimates where id=fixture_estimate_id) <> 1
    or (select count(*) from public.estimate_line_items line where line.estimate_id=fixture_estimate_id) <> 1 then
    raise exception 'Replay reapplied or overwrote data.';
  end if;
end
$test$;

rollback;
