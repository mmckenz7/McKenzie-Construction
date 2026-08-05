begin;

do $audit$
declare
  expected record;
begin
  for expected in
    select * from (values
      ('estimates','id','uuid',true),
      ('estimates','status','text',true),
      ('estimates','calculation_policy_version','text',false),
      ('estimates','calculation_revision','integer',false),
      ('estimate_sections','id','uuid',true),
      ('estimate_sections','estimate_id','uuid',true),
      ('estimate_sections','name','text',true),
      ('estimate_sections','sort_order','integer',true),
      ('estimate_line_items','id','uuid',true),
      ('estimate_line_items','estimate_id','uuid',true),
      ('estimate_line_items','section_id','uuid',false),
      ('estimate_line_items','item_type','text',false),
      ('estimate_line_items','quantity','numeric(14,4)',true),
      ('estimate_line_items','costs_complete','boolean',false),
      ('estimate_line_items','prices_complete','boolean',false)
    ) as contract(table_name,column_name,sql_type,is_not_null)
  loop
    if to_regclass('public.' || expected.table_name) is null or not exists (
      select 1 from pg_attribute a
      where a.attrelid = ('public.' || expected.table_name)::regclass
        and a.attname = expected.column_name and a.attnum > 0 and not a.attisdropped
        and format_type(a.atttypid,a.atttypmod) = expected.sql_type
        and a.attnotnull = expected.is_not_null
    ) then
      raise exception 'Audited public.%.% contract mismatch.', expected.table_name, expected.column_name;
    end if;
  end loop;

  if to_regclass('public.estimates_one_structured_draft_per_lead_uidx') is null then
    raise exception 'Required B2a structured lead draft invariant is missing.';
  end if;

  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = any (array[
        'create_structured_estimate_section', 'update_structured_estimate_section', 'delete_structured_estimate_section',
        'create_structured_estimate_item', 'update_structured_estimate_item', 'delete_structured_estimate_item',
        'persist_structured_estimate_outputs'
      ])
  ) then
    raise exception 'An obsolete or overloaded structured estimate mutation function already exists.';
  end if;
end
$audit$;

-- TypeScript calculateEstimate is the sole financial formula source. This
-- internal helper performs no financial arithmetic: it verifies that the
-- service-generated bundle exactly describes the locked post-mutation rows,
-- then persists those outputs and increments the shared revision once.
create function public.persist_structured_estimate_outputs(
  requested_estimate_id uuid,
  requested_expected_revision integer,
  requested_item_calculations jsonb,
  requested_estimate_calculation jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  bundle_count integer;
  row_count integer;
begin
  if jsonb_typeof(requested_item_calculations) <> 'array'
    or jsonb_typeof(requested_estimate_calculation) <> 'object' then
    raise exception using errcode = 'P0001', message = 'invalid_calculation';
  end if;

  bundle_count := jsonb_array_length(requested_item_calculations);
  select count(*) into row_count from public.estimate_line_items where estimate_id = requested_estimate_id;
  if not (requested_estimate_calculation ?& array[
    'costs_complete', 'prices_complete', 'subtotal_cost', 'subtotal_price', 'contingency_amount',
    'discount_amount', 'tax_amount', 'total_price', 'estimated_profit', 'estimated_margin',
    'item_markup_amount', 'overhead_amount', 'pre_profit_subtotal', 'profit_markup_amount',
    'pre_discount_subtotal', 'post_discount_subtotal', 'taxable_item_price_subtotal',
    'taxable_overhead_amount', 'taxable_profit_amount', 'taxable_discount_amount', 'taxable_subtotal'
  ]::text[]) or bundle_count <> row_count or exists (
    select 1 from jsonb_array_elements(requested_item_calculations) entry
    where jsonb_typeof(entry) <> 'object' or not (entry ?& array[
      'id', 'section_id', 'item_type', 'quantity', 'unit', 'customer_description', 'internal_description',
      'material_unit_cost', 'labor_unit_cost', 'subcontractor_unit_cost', 'equipment_unit_cost',
      'other_direct_unit_cost', 'material_waste_percent', 'item_markup_percent', 'taxable', 'is_included',
      'fixed_customer_price', 'sort_order', 'costs_complete', 'prices_complete', 'material_cost_amount',
      'labor_cost_amount', 'subcontractor_cost_amount', 'equipment_cost_amount', 'other_direct_cost_amount',
      'item_markup_amount', 'line_type', 'category', 'description', 'base_unit_cost', 'waste_percent',
      'pricing_method', 'markup_percent', 'target_margin_percent', 'fixed_price', 'adjusted_quantity',
      'estimated_cost', 'unit_price', 'total_price', 'estimated_profit', 'estimated_margin', 'is_optional',
      'notes', 'estimate_option_id', 'material_catalog_id', 'labor_catalog_id', 'metadata'
    ]::text[])
  ) or exists (
    select 1 from (
      select (entry->>'id')::uuid id, count(*) count
      from jsonb_array_elements(requested_item_calculations) entry
      group by (entry->>'id')::uuid
    ) duplicates where duplicates.count <> 1
  ) then
    raise exception using errcode = 'P0001', message = 'invalid_calculation';
  end if;

  if exists (
    select 1
    from public.estimate_line_items line
    where line.estimate_id = requested_estimate_id
      and not exists (
        select 1 from jsonb_array_elements(requested_item_calculations) entry
        where (entry->>'id')::uuid = line.id
          and (entry->>'section_id')::uuid = line.section_id
          and entry->>'item_type' = line.item_type
          and (entry->>'quantity')::numeric = line.quantity
          and entry->>'unit' = line.unit
          and entry->>'customer_description' = line.customer_description
          and (entry->>'internal_description') is not distinct from line.internal_description
          and (entry->>'material_unit_cost')::numeric is not distinct from line.material_unit_cost
          and (entry->>'labor_unit_cost')::numeric is not distinct from line.labor_unit_cost
          and (entry->>'subcontractor_unit_cost')::numeric is not distinct from line.subcontractor_unit_cost
          and (entry->>'equipment_unit_cost')::numeric is not distinct from line.equipment_unit_cost
          and (entry->>'other_direct_unit_cost')::numeric is not distinct from line.other_direct_unit_cost
          and (entry->>'material_waste_percent')::numeric = line.material_waste_percent
          and (entry->>'item_markup_percent')::numeric is not distinct from line.item_markup_percent
          and (entry->>'taxable')::boolean = line.taxable
          and (entry->>'is_included')::boolean = line.is_included
          and (entry->>'fixed_customer_price')::numeric is not distinct from line.fixed_customer_price
          and (entry->>'sort_order')::integer = line.sort_order
      )
  ) then
    raise exception using errcode = 'P0001', message = 'invalid_calculation';
  end if;

  update public.estimate_line_items line set
    costs_complete = (entry->>'costs_complete')::boolean,
    prices_complete = (entry->>'prices_complete')::boolean,
    material_cost_amount = (entry->>'material_cost_amount')::numeric,
    labor_cost_amount = (entry->>'labor_cost_amount')::numeric,
    subcontractor_cost_amount = (entry->>'subcontractor_cost_amount')::numeric,
    equipment_cost_amount = (entry->>'equipment_cost_amount')::numeric,
    other_direct_cost_amount = (entry->>'other_direct_cost_amount')::numeric,
    item_markup_amount = (entry->>'item_markup_amount')::numeric,
    line_type = entry->>'line_type', category = entry->>'category',
    description = entry->>'description', base_unit_cost = (entry->>'base_unit_cost')::numeric,
    waste_percent = (entry->>'waste_percent')::numeric, pricing_method = entry->>'pricing_method',
    markup_percent = (entry->>'markup_percent')::numeric,
    target_margin_percent = (entry->>'target_margin_percent')::numeric,
    fixed_price = (entry->>'fixed_price')::numeric,
    adjusted_quantity = (entry->>'adjusted_quantity')::numeric,
    estimated_cost = (entry->>'estimated_cost')::numeric,
    unit_price = (entry->>'unit_price')::numeric,
    total_price = (entry->>'total_price')::numeric,
    estimated_profit = (entry->>'estimated_profit')::numeric,
    estimated_margin = (entry->>'estimated_margin')::numeric,
    is_optional = (entry->>'is_optional')::boolean,
    notes = entry->>'notes', estimate_option_id = null,
    material_catalog_id = null, labor_catalog_id = null, metadata = '{}'::jsonb
  from jsonb_array_elements(requested_item_calculations) entry
  where line.estimate_id = requested_estimate_id and line.id = (entry->>'id')::uuid;

  update public.estimates set
    costs_complete = (requested_estimate_calculation->>'costs_complete')::boolean,
    prices_complete = (requested_estimate_calculation->>'prices_complete')::boolean,
    subtotal_cost = (requested_estimate_calculation->>'subtotal_cost')::numeric,
    subtotal_price = (requested_estimate_calculation->>'subtotal_price')::numeric,
    contingency_amount = (requested_estimate_calculation->>'contingency_amount')::numeric,
    discount_amount = (requested_estimate_calculation->>'discount_amount')::numeric,
    tax_amount = (requested_estimate_calculation->>'tax_amount')::numeric,
    total_price = (requested_estimate_calculation->>'total_price')::numeric,
    estimated_profit = (requested_estimate_calculation->>'estimated_profit')::numeric,
    estimated_margin = (requested_estimate_calculation->>'estimated_margin')::numeric,
    item_markup_amount = (requested_estimate_calculation->>'item_markup_amount')::numeric,
    overhead_amount = (requested_estimate_calculation->>'overhead_amount')::numeric,
    pre_profit_subtotal = (requested_estimate_calculation->>'pre_profit_subtotal')::numeric,
    profit_markup_amount = (requested_estimate_calculation->>'profit_markup_amount')::numeric,
    pre_discount_subtotal = (requested_estimate_calculation->>'pre_discount_subtotal')::numeric,
    post_discount_subtotal = (requested_estimate_calculation->>'post_discount_subtotal')::numeric,
    taxable_item_price_subtotal = (requested_estimate_calculation->>'taxable_item_price_subtotal')::numeric,
    taxable_overhead_amount = (requested_estimate_calculation->>'taxable_overhead_amount')::numeric,
    taxable_profit_amount = (requested_estimate_calculation->>'taxable_profit_amount')::numeric,
    taxable_discount_amount = (requested_estimate_calculation->>'taxable_discount_amount')::numeric,
    taxable_subtotal = (requested_estimate_calculation->>'taxable_subtotal')::numeric,
    calculation_revision = requested_expected_revision + 1
  where id = requested_estimate_id and calculation_revision = requested_expected_revision;
  if not found then
    raise exception using errcode = 'P0001', message = 'invalid_calculation';
  end if;
exception when others then
  if sqlstate = 'P0001' then raise; end if;
  raise exception using errcode = 'P0001', message = 'invalid_calculation';
end
$function$;

revoke all on function public.persist_structured_estimate_outputs(uuid,integer,jsonb,jsonb) from public, anon, authenticated, service_role;

create function public.create_structured_estimate_section(
  requested_estimate_id uuid, requested_expected_revision integer, requested_section_id uuid,
  requested_name text, requested_customer_description text, requested_internal_notes text, requested_sort_order integer
)
returns table(result_code text, next_calculation_revision integer, resource_id uuid)
language plpgsql security definer set search_path = public, pg_temp
as $function$
declare current_status text; current_policy text; current_revision integer;
begin
  select status, calculation_policy_version, calculation_revision into current_status, current_policy, current_revision
  from public.estimates where id = requested_estimate_id for update;
  if not found or current_policy is distinct from 'structured-estimate-v1' then return query select 'not_found', null::integer, requested_section_id; return; end if;
  if current_status <> 'draft' then return query select 'non_draft', current_revision, requested_section_id; return; end if;
  if current_revision <> requested_expected_revision then return query select 'stale_calculation_revision', current_revision, requested_section_id; return; end if;
  if requested_name is null or btrim(requested_name) = '' or requested_sort_order < 0
    or exists (select 1 from public.estimate_sections where id = requested_section_id) then
    return query select 'not_found', current_revision, requested_section_id; return;
  end if;
  insert into public.estimate_sections(id,estimate_id,name,customer_description,internal_notes,sort_order)
  values(requested_section_id,requested_estimate_id,btrim(requested_name),requested_customer_description,requested_internal_notes,requested_sort_order);
  update public.estimates set calculation_revision = requested_expected_revision + 1 where id = requested_estimate_id;
  return query select 'ok', requested_expected_revision + 1, requested_section_id;
end
$function$;

create function public.update_structured_estimate_section(
  requested_estimate_id uuid, requested_expected_revision integer, requested_section_id uuid,
  requested_name text, requested_customer_description text, requested_internal_notes text, requested_sort_order integer
)
returns table(result_code text, next_calculation_revision integer, resource_id uuid)
language plpgsql security definer set search_path = public, pg_temp
as $function$
declare current_status text; current_policy text; current_revision integer;
begin
  select status, calculation_policy_version, calculation_revision into current_status, current_policy, current_revision
  from public.estimates where id = requested_estimate_id for update;
  if not found or current_policy is distinct from 'structured-estimate-v1' then return query select 'not_found', null::integer, requested_section_id; return; end if;
  if current_status <> 'draft' then return query select 'non_draft', current_revision, requested_section_id; return; end if;
  if current_revision <> requested_expected_revision then return query select 'stale_calculation_revision', current_revision, requested_section_id; return; end if;
  if requested_name is null or btrim(requested_name) = '' or requested_sort_order < 0 then return query select 'not_found', current_revision, requested_section_id; return; end if;
  update public.estimate_sections set name=btrim(requested_name), customer_description=requested_customer_description,
    internal_notes=requested_internal_notes, sort_order=requested_sort_order
  where id=requested_section_id and estimate_id=requested_estimate_id;
  if not found then return query select 'not_found', current_revision, requested_section_id; return; end if;
  update public.estimates set calculation_revision=requested_expected_revision+1 where id=requested_estimate_id;
  return query select 'ok', requested_expected_revision+1, requested_section_id;
end
$function$;

create function public.delete_structured_estimate_section(
  requested_estimate_id uuid, requested_expected_revision integer, requested_section_id uuid
)
returns table(result_code text, next_calculation_revision integer, resource_id uuid)
language plpgsql security definer set search_path = public, pg_temp
as $function$
declare current_status text; current_policy text; current_revision integer;
begin
  select status, calculation_policy_version, calculation_revision into current_status, current_policy, current_revision
  from public.estimates where id=requested_estimate_id for update;
  if not found or current_policy is distinct from 'structured-estimate-v1' then return query select 'not_found',null::integer,requested_section_id; return; end if;
  if current_status <> 'draft' then return query select 'non_draft',current_revision,requested_section_id; return; end if;
  if current_revision <> requested_expected_revision then return query select 'stale_calculation_revision',current_revision,requested_section_id; return; end if;
  if not exists(select 1 from public.estimate_sections where id=requested_section_id and estimate_id=requested_estimate_id) then return query select 'not_found',current_revision,requested_section_id; return; end if;
  if exists(select 1 from public.estimate_line_items where estimate_id=requested_estimate_id and section_id=requested_section_id) then return query select 'section_not_empty',current_revision,requested_section_id; return; end if;
  delete from public.estimate_sections where id=requested_section_id and estimate_id=requested_estimate_id;
  update public.estimates set calculation_revision=requested_expected_revision+1 where id=requested_estimate_id;
  return query select 'ok',requested_expected_revision+1,requested_section_id;
end
$function$;

-- Item mutation functions accept only complete server-built canonical state and
-- calculation bundles. The private persistence helper validates correspondence;
-- it never derives costs, prices, tax, profit, margin, or totals.
create function public.create_structured_estimate_item(
  requested_estimate_id uuid, requested_expected_revision integer, requested_item_id uuid,
  requested_item jsonb, requested_item_calculations jsonb, requested_estimate_calculation jsonb
)
returns table(result_code text, next_calculation_revision integer, resource_id uuid)
language plpgsql security definer set search_path = public, pg_temp
as $function$
declare current_status text; current_policy text; current_revision integer; output jsonb;
begin
  select status,calculation_policy_version,calculation_revision into current_status,current_policy,current_revision from public.estimates where id=requested_estimate_id for update;
  if not found or current_policy is distinct from 'structured-estimate-v1' then return query select 'not_found',null::integer,requested_item_id; return; end if;
  if current_status <> 'draft' then return query select 'non_draft',current_revision,requested_item_id; return; end if;
  if current_revision <> requested_expected_revision then return query select 'stale_calculation_revision',current_revision,requested_item_id; return; end if;
  begin
    if jsonb_typeof(requested_item) <> 'object' or (requested_item->>'id')::uuid is distinct from requested_item_id then
      return query select 'invalid_item',current_revision,requested_item_id; return;
    end if;
    if not exists(select 1 from public.estimate_sections where id=(requested_item->>'section_id')::uuid and estimate_id=requested_estimate_id)
      or exists(select 1 from public.estimate_line_items where id=requested_item_id) then
      return query select 'not_found',current_revision,requested_item_id; return;
    end if;
    if jsonb_typeof(requested_item_calculations) <> 'array' then
      return query select 'invalid_calculation',current_revision,requested_item_id; return;
    end if;
    select entry into output from jsonb_array_elements(requested_item_calculations) entry where entry->>'id'=requested_item_id::text limit 1;
    if output is null then return query select 'invalid_calculation',current_revision,requested_item_id; return; end if;
    insert into public.estimate_line_items(
      id,estimate_id,section_id,item_type,quantity,unit,customer_description,internal_description,
      material_unit_cost,labor_unit_cost,subcontractor_unit_cost,equipment_unit_cost,other_direct_unit_cost,
      material_waste_percent,item_markup_percent,taxable,is_included,fixed_customer_price,sort_order,
      costs_complete,prices_complete,line_type,category,description,base_unit_cost,waste_percent,pricing_method,
      adjusted_quantity,estimated_cost,unit_price,total_price,estimated_profit,is_optional,metadata
    ) values (
      requested_item_id,requested_estimate_id,(requested_item->>'section_id')::uuid,requested_item->>'item_type',
      (requested_item->>'quantity')::numeric,requested_item->>'unit',requested_item->>'customer_description',requested_item->>'internal_description',
      (requested_item->>'material_unit_cost')::numeric,(requested_item->>'labor_unit_cost')::numeric,(requested_item->>'subcontractor_unit_cost')::numeric,
      (requested_item->>'equipment_unit_cost')::numeric,(requested_item->>'other_direct_unit_cost')::numeric,(requested_item->>'material_waste_percent')::numeric,
      (requested_item->>'item_markup_percent')::numeric,(requested_item->>'taxable')::boolean,(requested_item->>'is_included')::boolean,
      (requested_item->>'fixed_customer_price')::numeric,(requested_item->>'sort_order')::integer,
      (output->>'costs_complete')::boolean,(output->>'prices_complete')::boolean,output->>'line_type',output->>'category',output->>'description',
      (output->>'base_unit_cost')::numeric,(output->>'waste_percent')::numeric,output->>'pricing_method',
      (output->>'adjusted_quantity')::numeric,(output->>'estimated_cost')::numeric,(output->>'unit_price')::numeric,
      (output->>'total_price')::numeric,(output->>'estimated_profit')::numeric,false,'{}'::jsonb
    );
    perform public.persist_structured_estimate_outputs(requested_estimate_id,requested_expected_revision,requested_item_calculations,requested_estimate_calculation);
  exception
    when sqlstate 'P0001' then return query select 'invalid_calculation',current_revision,requested_item_id; return;
    when check_violation or not_null_violation or numeric_value_out_of_range or invalid_text_representation then
      return query select 'invalid_item',current_revision,requested_item_id; return;
    when unique_violation then return query select 'not_found',current_revision,requested_item_id; return;
  end;
  return query select 'ok',requested_expected_revision+1,requested_item_id;
end
$function$;

create function public.update_structured_estimate_item(
  requested_estimate_id uuid, requested_expected_revision integer, requested_item_id uuid,
  requested_item jsonb, requested_item_calculations jsonb, requested_estimate_calculation jsonb
)
returns table(result_code text, next_calculation_revision integer, resource_id uuid)
language plpgsql security definer set search_path = public, pg_temp
as $function$
declare current_status text; current_policy text; current_revision integer; output jsonb;
begin
  select status,calculation_policy_version,calculation_revision into current_status,current_policy,current_revision from public.estimates where id=requested_estimate_id for update;
  if not found or current_policy is distinct from 'structured-estimate-v1' then return query select 'not_found',null::integer,requested_item_id; return; end if;
  if current_status <> 'draft' then return query select 'non_draft',current_revision,requested_item_id; return; end if;
  if current_revision <> requested_expected_revision then return query select 'stale_calculation_revision',current_revision,requested_item_id; return; end if;
  begin
    if jsonb_typeof(requested_item) <> 'object' or (requested_item->>'id')::uuid is distinct from requested_item_id then
      return query select 'invalid_item',current_revision,requested_item_id; return;
    end if;
    if not exists(select 1 from public.estimate_line_items where id=requested_item_id and estimate_id=requested_estimate_id)
      or not exists(select 1 from public.estimate_sections where id=(requested_item->>'section_id')::uuid and estimate_id=requested_estimate_id) then
      return query select 'not_found',current_revision,requested_item_id; return;
    end if;
    if jsonb_typeof(requested_item_calculations) <> 'array' then
      return query select 'invalid_calculation',current_revision,requested_item_id; return;
    end if;
    select entry into output from jsonb_array_elements(requested_item_calculations) entry where entry->>'id'=requested_item_id::text limit 1;
    if output is null then return query select 'invalid_calculation',current_revision,requested_item_id; return; end if;
    update public.estimate_line_items set
      section_id=(requested_item->>'section_id')::uuid,item_type=requested_item->>'item_type',quantity=(requested_item->>'quantity')::numeric,
      unit=requested_item->>'unit',customer_description=requested_item->>'customer_description',internal_description=requested_item->>'internal_description',
      material_unit_cost=(requested_item->>'material_unit_cost')::numeric,labor_unit_cost=(requested_item->>'labor_unit_cost')::numeric,
      subcontractor_unit_cost=(requested_item->>'subcontractor_unit_cost')::numeric,equipment_unit_cost=(requested_item->>'equipment_unit_cost')::numeric,
      other_direct_unit_cost=(requested_item->>'other_direct_unit_cost')::numeric,material_waste_percent=(requested_item->>'material_waste_percent')::numeric,
      item_markup_percent=(requested_item->>'item_markup_percent')::numeric,taxable=(requested_item->>'taxable')::boolean,
      is_included=(requested_item->>'is_included')::boolean,fixed_customer_price=(requested_item->>'fixed_customer_price')::numeric,
      sort_order=(requested_item->>'sort_order')::integer,costs_complete=(output->>'costs_complete')::boolean,prices_complete=(output->>'prices_complete')::boolean
    where id=requested_item_id and estimate_id=requested_estimate_id;
    perform public.persist_structured_estimate_outputs(requested_estimate_id,requested_expected_revision,requested_item_calculations,requested_estimate_calculation);
  exception
    when sqlstate 'P0001' then return query select 'invalid_calculation',current_revision,requested_item_id; return;
    when check_violation or not_null_violation or numeric_value_out_of_range or invalid_text_representation then
      return query select 'invalid_item',current_revision,requested_item_id; return;
  end;
  return query select 'ok',requested_expected_revision+1,requested_item_id;
end
$function$;

create function public.delete_structured_estimate_item(
  requested_estimate_id uuid, requested_expected_revision integer, requested_item_id uuid,
  requested_item_calculations jsonb, requested_estimate_calculation jsonb
)
returns table(result_code text, next_calculation_revision integer, resource_id uuid)
language plpgsql security definer set search_path = public, pg_temp
as $function$
declare current_status text; current_policy text; current_revision integer;
begin
  select status,calculation_policy_version,calculation_revision into current_status,current_policy,current_revision from public.estimates where id=requested_estimate_id for update;
  if not found or current_policy is distinct from 'structured-estimate-v1' then return query select 'not_found',null::integer,requested_item_id; return; end if;
  if current_status <> 'draft' then return query select 'non_draft',current_revision,requested_item_id; return; end if;
  if current_revision <> requested_expected_revision then return query select 'stale_calculation_revision',current_revision,requested_item_id; return; end if;
  if not exists(select 1 from public.estimate_line_items where id=requested_item_id and estimate_id=requested_estimate_id) then return query select 'not_found',current_revision,requested_item_id; return; end if;
  begin
    delete from public.estimate_line_items where id=requested_item_id and estimate_id=requested_estimate_id;
    perform public.persist_structured_estimate_outputs(requested_estimate_id,requested_expected_revision,requested_item_calculations,requested_estimate_calculation);
  exception when sqlstate 'P0001' then
    return query select 'invalid_calculation',current_revision,requested_item_id; return;
  end;
  return query select 'ok',requested_expected_revision+1,requested_item_id;
end
$function$;

revoke all on function public.create_structured_estimate_section(uuid,integer,uuid,text,text,text,integer) from public, anon, authenticated;
revoke all on function public.update_structured_estimate_section(uuid,integer,uuid,text,text,text,integer) from public, anon, authenticated;
revoke all on function public.delete_structured_estimate_section(uuid,integer,uuid) from public, anon, authenticated;
revoke all on function public.create_structured_estimate_item(uuid,integer,uuid,jsonb,jsonb,jsonb) from public, anon, authenticated;
revoke all on function public.update_structured_estimate_item(uuid,integer,uuid,jsonb,jsonb,jsonb) from public, anon, authenticated;
revoke all on function public.delete_structured_estimate_item(uuid,integer,uuid,jsonb,jsonb) from public, anon, authenticated;

grant execute on function public.create_structured_estimate_section(uuid,integer,uuid,text,text,text,integer) to service_role;
grant execute on function public.update_structured_estimate_section(uuid,integer,uuid,text,text,text,integer) to service_role;
grant execute on function public.delete_structured_estimate_section(uuid,integer,uuid) to service_role;
grant execute on function public.create_structured_estimate_item(uuid,integer,uuid,jsonb,jsonb,jsonb) to service_role;
grant execute on function public.update_structured_estimate_item(uuid,integer,uuid,jsonb,jsonb,jsonb) to service_role;
grant execute on function public.delete_structured_estimate_item(uuid,integer,uuid,jsonb,jsonb) to service_role;

commit;
