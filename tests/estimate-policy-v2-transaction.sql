begin;

do $test$
declare
  estimate_id uuid := '71000000-0000-4000-8000-000000000001';
  legacy_estimate_id uuid := '71000000-0000-4000-8000-000000000002';
  legacy_section_id uuid := '71000000-0000-4000-8000-000000000003';
  mutation_result record;
  calculation jsonb := jsonb_build_object(
    'calculation_policy_version', 'structured-estimate-v2-material-tax',
    'costs_complete', true,
    'prices_complete', true,
    'subtotal_cost', '0.00',
    'subtotal_price', '0.00',
    'contingency_amount', '0.00',
    'discount_amount', '0.00',
    'tax_amount', '0.00',
    'total_price', '0.00',
    'estimated_profit', '0.00',
    'estimated_margin', null,
    'item_markup_amount', '0.00',
    'overhead_amount', '0.00',
    'pre_profit_subtotal', '0.00',
    'profit_markup_amount', '0.00',
    'pre_discount_subtotal', '0.00',
    'post_discount_subtotal', '0.00',
    'taxable_item_price_subtotal', '0.00',
    'taxable_overhead_amount', '0.00',
    'taxable_profit_amount', '0.00',
    'taxable_discount_amount', '0.00',
    'taxable_subtotal', '0.00'
  );
begin
  insert into public.estimates (
    id, title, status, calculation_policy_version, calculation_revision,
    overhead_percent, profit_markup_percent, tax_rate_percent,
    discount_type, discount_value, costs_complete, prices_complete
  ) values (
    estimate_id, 'Policy transaction fixture', 'draft',
    'structured-estimate-v2-material-tax', 0,
    0, 0, 0, 'fixed_amount', 0, true, true
  );

  perform public.persist_structured_estimate_outputs(
    estimate_id, 0, '[]'::jsonb, calculation
  );
  if (select calculation_revision from public.estimates where id = estimate_id) <> 1 then
    raise exception 'Matching v2 bundle did not advance exactly one revision.';
  end if;

  begin
    perform public.persist_structured_estimate_outputs(
      estimate_id,
      1,
      '[]'::jsonb,
      calculation || jsonb_build_object(
        'calculation_policy_version', 'structured-estimate-v1'
      )
    );
    raise exception 'Mismatched calculation policy was accepted.';
  exception
    when sqlstate 'P0001' then
      if sqlerrm <> 'invalid_calculation' then raise; end if;
  end;

  if (select calculation_revision from public.estimates where id = estimate_id) <> 1 then
    raise exception 'Rejected bundle changed the estimate revision.';
  end if;

  insert into public.estimates (
    id, title, status, calculation_policy_version, calculation_revision
  ) values (
    legacy_estimate_id, 'Legacy NULL-policy fixture', 'draft', null, 0
  );

  select * into mutation_result
  from public.create_structured_estimate_section(
    legacy_estimate_id, 0, legacy_section_id,
    'Rejected section', null, null, 0
  );
  if mutation_result.result_code is distinct from 'not_found'
    or exists (select 1 from public.estimate_sections where id = legacy_section_id)
    or (select calculation_revision from public.estimates where id = legacy_estimate_id) <> 0 then
    raise exception 'NULL-policy section mutation was accepted.';
  end if;

  begin
    perform public.persist_structured_estimate_outputs(
      legacy_estimate_id,
      0,
      '[]'::jsonb,
      calculation || jsonb_build_object(
        'calculation_policy_version', 'structured-estimate-v1'
      )
    );
    raise exception 'NULL-policy calculation persistence was accepted.';
  exception
    when sqlstate 'P0001' then
      if sqlerrm <> 'invalid_calculation' then raise; end if;
  end;

  if (select calculation_revision from public.estimates where id = legacy_estimate_id) <> 0 then
    raise exception 'Rejected NULL-policy bundle changed the estimate revision.';
  end if;
end
$test$;

rollback;
