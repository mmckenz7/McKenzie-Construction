begin;

do $audit$
declare
  expected record;
  actual_definition text;
  expected_set_updated_at_definition text := $definition$CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
$definition$;
begin
  foreach actual_definition in array array[
    'estimates',
    'estimate_line_items',
    'estimate_options',
    'estimate_material_price_snapshots',
    'material_catalog'
  ]::text[] loop
    if to_regclass('public.' || actual_definition) is null then
      raise exception 'Required audited table public.% is missing.', actual_definition;
    end if;
  end loop;

  for expected in
    select * from (values
      ('estimates','id','gen_random_uuid()'), ('estimates','status','''draft''::text'),
      ('estimates','subtotal_cost','0'), ('estimates','subtotal_price','0'),
      ('estimates','contingency_amount','0'), ('estimates','discount_amount','0'),
      ('estimates','tax_amount','0'), ('estimates','total_price','0'),
      ('estimates','estimated_profit','0'), ('estimates','price_confidence','''preliminary''::text'),
      ('estimates','metadata','''{}''::jsonb'), ('estimates','created_at','now()'), ('estimates','updated_at','now()'),
      ('estimate_line_items','id','gen_random_uuid()'), ('estimate_line_items','quantity','1'),
      ('estimate_line_items','base_unit_cost','0'), ('estimate_line_items','waste_percent','0'),
      ('estimate_line_items','adjusted_quantity','1'), ('estimate_line_items','estimated_cost','0'),
      ('estimate_line_items','pricing_method','''markup''::text'), ('estimate_line_items','unit_price','0'),
      ('estimate_line_items','total_price','0'), ('estimate_line_items','estimated_profit','0'),
      ('estimate_line_items','is_optional','false'), ('estimate_line_items','is_included','true'),
      ('estimate_line_items','sort_order','0'), ('estimate_line_items','metadata','''{}''::jsonb'),
      ('estimate_line_items','created_at','now()'), ('estimate_line_items','updated_at','now()'),
      ('estimate_options','id','gen_random_uuid()'), ('estimate_options','sort_order','0'),
      ('estimate_options','is_recommended','false'), ('estimate_options','is_selected','false'),
      ('estimate_options','subtotal_cost','0'), ('estimate_options','subtotal_price','0'),
      ('estimate_options','contingency_amount','0'), ('estimate_options','discount_amount','0'),
      ('estimate_options','tax_amount','0'), ('estimate_options','total_price','0'),
      ('estimate_options','estimated_profit','0'), ('estimate_options','metadata','''{}''::jsonb'),
      ('estimate_options','created_at','now()'), ('estimate_options','updated_at','now()'),
      ('estimate_material_price_snapshots','id','gen_random_uuid()'),
      ('estimate_material_price_snapshots','quantity','0'), ('estimate_material_price_snapshots','unit_cost','0'),
      ('estimate_material_price_snapshots','extended_cost','0'), ('estimate_material_price_snapshots','source_type','''manual''::text'),
      ('estimate_material_price_snapshots','was_manual_override','false'), ('estimate_material_price_snapshots','confidence','''confirmed''::text'),
      ('estimate_material_price_snapshots','metadata','''{}''::jsonb'), ('estimate_material_price_snapshots','created_at','now()'),
      ('material_catalog','id','gen_random_uuid()'), ('material_catalog','unit_cost','0'),
      ('material_catalog','waste_percent','0'), ('material_catalog','is_active','true'),
      ('material_catalog','metadata','''{}''::jsonb'), ('material_catalog','created_at','now()'), ('material_catalog','updated_at','now()')
    ) as defaults(table_name,column_name,default_definition)
  loop
    select pg_get_expr(d.adbin,d.adrelid) into actual_definition
    from pg_attrdef d join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
    where d.adrelid = ('public.' || expected.table_name)::regclass and a.attname = expected.column_name;
    if actual_definition is null or regexp_replace(actual_definition,'\s+',' ','g') is distinct from expected.default_definition then
      raise exception 'Audited default for public.%.% differs from required contract.', expected.table_name, expected.column_name;
    end if;
  end loop;

  for expected in
    select * from (values
      ('estimates','id','uuid',true), ('estimates','lead_id','uuid',false),
      ('estimates','customer_id','uuid',false), ('estimates','project_id','uuid',false),
      ('estimates','estimate_number','text',false), ('estimates','title','text',true),
      ('estimates','description','text',false), ('estimates','status','text',true),
      ('estimates','property_address','text',false), ('estimates','valid_until','date',false),
      ('estimates','selected_option_id','uuid',false), ('estimates','subtotal_cost','numeric(12,2)',true),
      ('estimates','subtotal_price','numeric(12,2)',true), ('estimates','contingency_amount','numeric(12,2)',true),
      ('estimates','discount_amount','numeric(12,2)',true), ('estimates','tax_amount','numeric(12,2)',true),
      ('estimates','total_price','numeric(12,2)',true), ('estimates','estimated_profit','numeric(12,2)',true),
      ('estimates','estimated_margin','numeric(7,3)',false), ('estimates','price_confidence','text',true),
      ('estimates','internal_notes','text',false), ('estimates','customer_notes','text',false),
      ('estimates','metadata','jsonb',true), ('estimates','created_by_auth_user_id','uuid',false),
      ('estimates','created_at','timestamp with time zone',true), ('estimates','updated_at','timestamp with time zone',true),

      ('estimate_line_items','id','uuid',true), ('estimate_line_items','estimate_id','uuid',true),
      ('estimate_line_items','estimate_option_id','uuid',false), ('estimate_line_items','line_type','text',true),
      ('estimate_line_items','category','text',true), ('estimate_line_items','description','text',true),
      ('estimate_line_items','material_catalog_id','uuid',false), ('estimate_line_items','labor_catalog_id','uuid',false),
      ('estimate_line_items','quantity','numeric(14,4)',true), ('estimate_line_items','unit','text',true),
      ('estimate_line_items','base_unit_cost','numeric(12,4)',true), ('estimate_line_items','waste_percent','numeric(7,3)',true),
      ('estimate_line_items','adjusted_quantity','numeric(14,4)',true), ('estimate_line_items','estimated_cost','numeric(12,2)',true),
      ('estimate_line_items','pricing_method','text',true), ('estimate_line_items','markup_percent','numeric(7,3)',false),
      ('estimate_line_items','target_margin_percent','numeric(7,3)',false), ('estimate_line_items','fixed_price','numeric(12,2)',false),
      ('estimate_line_items','unit_price','numeric(12,4)',true), ('estimate_line_items','total_price','numeric(12,2)',true),
      ('estimate_line_items','estimated_profit','numeric(12,2)',true), ('estimate_line_items','estimated_margin','numeric(7,3)',false),
      ('estimate_line_items','is_optional','boolean',true), ('estimate_line_items','is_included','boolean',true),
      ('estimate_line_items','sort_order','integer',true), ('estimate_line_items','notes','text',false),
      ('estimate_line_items','metadata','jsonb',true), ('estimate_line_items','created_at','timestamp with time zone',true),
      ('estimate_line_items','updated_at','timestamp with time zone',true),

      ('estimate_options','id','uuid',true), ('estimate_options','estimate_id','uuid',true),
      ('estimate_options','option_name','text',true), ('estimate_options','option_label','text',false),
      ('estimate_options','description','text',false), ('estimate_options','sort_order','integer',true),
      ('estimate_options','is_recommended','boolean',true), ('estimate_options','is_selected','boolean',true),
      ('estimate_options','subtotal_cost','numeric(12,2)',true), ('estimate_options','subtotal_price','numeric(12,2)',true),
      ('estimate_options','contingency_amount','numeric(12,2)',true), ('estimate_options','discount_amount','numeric(12,2)',true),
      ('estimate_options','tax_amount','numeric(12,2)',true), ('estimate_options','total_price','numeric(12,2)',true),
      ('estimate_options','estimated_profit','numeric(12,2)',true), ('estimate_options','estimated_margin','numeric(7,3)',false),
      ('estimate_options','metadata','jsonb',true), ('estimate_options','created_at','timestamp with time zone',true),
      ('estimate_options','updated_at','timestamp with time zone',true),

      ('estimate_material_price_snapshots','id','uuid',true), ('estimate_material_price_snapshots','estimate_id','uuid',true),
      ('estimate_material_price_snapshots','estimate_option_id','uuid',false), ('estimate_material_price_snapshots','estimate_line_item_id','uuid',false),
      ('estimate_material_price_snapshots','material_catalog_id','uuid',false), ('estimate_material_price_snapshots','supplier_id','uuid',false),
      ('estimate_material_price_snapshots','supplier_location_id','uuid',false), ('estimate_material_price_snapshots','supplier_name','text',false),
      ('estimate_material_price_snapshots','supplier_location_name','text',false), ('estimate_material_price_snapshots','supplier_sku','text',false),
      ('estimate_material_price_snapshots','quantity','numeric(14,4)',true), ('estimate_material_price_snapshots','unit','text',true),
      ('estimate_material_price_snapshots','unit_cost','numeric(12,4)',true), ('estimate_material_price_snapshots','extended_cost','numeric(12,2)',true),
      ('estimate_material_price_snapshots','source_type','text',true), ('estimate_material_price_snapshots','source_reference','text',false),
      ('estimate_material_price_snapshots','price_checked_at','timestamp with time zone',false), ('estimate_material_price_snapshots','price_expires_at','timestamp with time zone',false),
      ('estimate_material_price_snapshots','was_manual_override','boolean',true), ('estimate_material_price_snapshots','confidence','text',true),
      ('estimate_material_price_snapshots','metadata','jsonb',true), ('estimate_material_price_snapshots','created_at','timestamp with time zone',true),

      ('material_catalog','id','uuid',true), ('material_catalog','sku','text',false),
      ('material_catalog','category','text',true), ('material_catalog','description','text',true),
      ('material_catalog','brand','text',false), ('material_catalog','product_line','text',false),
      ('material_catalog','unit','text',true), ('material_catalog','unit_cost','numeric(12,2)',true),
      ('material_catalog','supplier_name','text',false), ('material_catalog','supplier_item_number','text',false),
      ('material_catalog','waste_percent','numeric(6,2)',true), ('material_catalog','is_active','boolean',true),
      ('material_catalog','metadata','jsonb',true), ('material_catalog','created_at','timestamp with time zone',true),
      ('material_catalog','updated_at','timestamp with time zone',true)
    ) as contract(table_name,column_name,sql_type,is_not_null)
  loop
    if not exists (
      select 1 from pg_attribute a
      join pg_class c on c.oid = a.attrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = expected.table_name
        and a.attname = expected.column_name and a.attnum > 0 and not a.attisdropped
        and format_type(a.atttypid,a.atttypmod) = expected.sql_type
        and a.attnotnull = expected.is_not_null
    ) then
      raise exception 'Audited column public.%.% differs from required type/nullability contract.', expected.table_name, expected.column_name;
    end if;
  end loop;

  for expected in
    select * from (values
      ('estimates',26), ('estimate_line_items',29), ('estimate_options',19),
      ('estimate_material_price_snapshots',22), ('material_catalog',15)
    ) as counts(table_name,column_count)
  loop
    if (select count(*) from pg_attribute a where a.attrelid = ('public.' || expected.table_name)::regclass and a.attnum > 0 and not a.attisdropped) <> expected.column_count then
      raise exception 'Audited table public.% has an unexpected column set.', expected.table_name;
    end if;
  end loop;

  for expected in
    select * from (values
      ('estimates','estimates_pkey','PRIMARY KEY (id)'),
      ('estimate_line_items','estimate_line_items_pkey','PRIMARY KEY (id)'),
      ('estimate_options','estimate_options_pkey','PRIMARY KEY (id)'),
      ('estimate_material_price_snapshots','estimate_material_price_snapshots_pkey','PRIMARY KEY (id)'),
      ('material_catalog','material_catalog_pkey','PRIMARY KEY (id)'),
      ('estimates','estimates_lead_id_fkey','FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE SET NULL'),
      ('estimates','estimates_customer_id_fkey','FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE SET NULL'),
      ('estimates','estimates_project_id_fkey','FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL'),
      ('estimates','estimates_selected_option_id_fkey','FOREIGN KEY (selected_option_id) REFERENCES public.estimate_options(id) ON DELETE SET NULL'),
      ('estimate_line_items','estimate_line_items_estimate_id_fkey','FOREIGN KEY (estimate_id) REFERENCES public.estimates(id) ON DELETE CASCADE'),
      ('estimate_line_items','estimate_line_items_estimate_option_id_fkey','FOREIGN KEY (estimate_option_id) REFERENCES public.estimate_options(id) ON DELETE CASCADE'),
      ('estimate_line_items','estimate_line_items_material_catalog_id_fkey','FOREIGN KEY (material_catalog_id) REFERENCES public.material_catalog(id) ON DELETE SET NULL'),
      ('estimate_line_items','estimate_line_items_labor_catalog_id_fkey','FOREIGN KEY (labor_catalog_id) REFERENCES public.labor_catalog(id) ON DELETE SET NULL'),
      ('estimate_options','estimate_options_estimate_id_fkey','FOREIGN KEY (estimate_id) REFERENCES public.estimates(id) ON DELETE CASCADE'),
      ('estimate_material_price_snapshots','estimate_material_price_snapshots_estimate_id_fkey','FOREIGN KEY (estimate_id) REFERENCES public.estimates(id) ON DELETE CASCADE'),
      ('estimate_material_price_snapshots','estimate_material_price_snapshots_estimate_line_item_id_fkey','FOREIGN KEY (estimate_line_item_id) REFERENCES public.estimate_line_items(id) ON DELETE CASCADE'),
      ('estimate_material_price_snapshots','estimate_material_price_snapshots_estimate_option_id_fkey','FOREIGN KEY (estimate_option_id) REFERENCES public.estimate_options(id) ON DELETE CASCADE'),
      ('estimate_material_price_snapshots','estimate_material_price_snapshots_material_catalog_id_fkey','FOREIGN KEY (material_catalog_id) REFERENCES public.material_catalog(id) ON DELETE SET NULL'),
      ('estimate_material_price_snapshots','estimate_material_price_snapshots_supplier_id_fkey','FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE SET NULL'),
      ('estimate_material_price_snapshots','estimate_material_price_snapshots_supplier_location_id_fkey','FOREIGN KEY (supplier_location_id) REFERENCES public.supplier_locations(id) ON DELETE SET NULL'),
      ('estimates','estimates_status_check','CHECK ((status = ANY (ARRAY[''draft''::text, ''reviewing''::text, ''sent''::text, ''viewed''::text, ''accepted''::text, ''declined''::text, ''expired''::text, ''converted''::text, ''void''::text])))'),
      ('estimates','estimates_price_confidence_check','CHECK ((price_confidence = ANY (ARRAY[''preliminary''::text, ''budget''::text, ''high''::text, ''firm''::text])))'),
      ('estimates','estimates_subtotal_cost_nonnegative','CHECK ((subtotal_cost >= (0)::numeric))'),
      ('estimates','estimates_subtotal_price_nonnegative','CHECK ((subtotal_price >= (0)::numeric))'),
      ('estimates','estimates_contingency_nonnegative','CHECK ((contingency_amount >= (0)::numeric))'),
      ('estimates','estimates_discount_nonnegative','CHECK ((discount_amount >= (0)::numeric))'),
      ('estimates','estimates_tax_nonnegative','CHECK ((tax_amount >= (0)::numeric))'),
      ('estimates','estimates_total_price_nonnegative','CHECK ((total_price >= (0)::numeric))'),
      ('estimate_line_items','estimate_line_items_pricing_method_check','CHECK ((pricing_method = ANY (ARRAY[''markup''::text, ''target_margin''::text, ''fixed_price''::text, ''cost''::text])))'),
      ('estimate_line_items','estimate_line_items_type_check','CHECK ((line_type = ANY (ARRAY[''material''::text, ''labor''::text, ''subcontractor''::text, ''equipment''::text, ''permit''::text, ''dumpster''::text, ''delivery''::text, ''overhead''::text, ''allowance''::text, ''contingency''::text, ''discount''::text, ''other''::text])))'),
      ('estimate_line_items','estimate_line_items_quantity_nonnegative','CHECK ((quantity >= (0)::numeric))'),
      ('estimate_line_items','estimate_line_items_adjusted_quantity_nonnegative','CHECK ((adjusted_quantity >= (0)::numeric))'),
      ('estimate_line_items','estimate_line_items_base_cost_nonnegative','CHECK ((base_unit_cost >= (0)::numeric))'),
      ('estimate_line_items','estimate_line_items_estimated_cost_nonnegative','CHECK ((estimated_cost >= (0)::numeric))'),
      ('estimate_line_items','estimate_line_items_unit_price_nonnegative','CHECK ((unit_price >= (0)::numeric))'),
      ('estimate_line_items','estimate_line_items_total_price_nonnegative','CHECK ((total_price >= (0)::numeric))'),
      ('estimate_line_items','estimate_line_items_waste_range','CHECK (((waste_percent >= (0)::numeric) AND (waste_percent <= (100)::numeric)))'),
      ('estimate_options','estimate_options_subtotal_cost_nonnegative','CHECK ((subtotal_cost >= (0)::numeric))'),
      ('estimate_options','estimate_options_subtotal_price_nonnegative','CHECK ((subtotal_price >= (0)::numeric))'),
      ('estimate_options','estimate_options_total_price_nonnegative','CHECK ((total_price >= (0)::numeric))'),
      ('estimate_material_price_snapshots','estimate_price_snapshot_cost_nonnegative','CHECK (((unit_cost >= (0)::numeric) AND (extended_cost >= (0)::numeric)))'),
      ('estimate_material_price_snapshots','estimate_price_snapshot_quantity_nonnegative','CHECK ((quantity >= (0)::numeric))'),
      ('material_catalog','material_catalog_unit_cost_nonnegative','CHECK ((unit_cost >= (0)::numeric))'),
      ('material_catalog','material_catalog_waste_percent_range','CHECK (((waste_percent >= (0)::numeric) AND (waste_percent <= (100)::numeric)))')
    ) as definitions(table_name,constraint_name,constraint_definition)
  loop
    select pg_get_constraintdef(pc.oid) into actual_definition
    from pg_constraint pc
    where pc.conrelid = ('public.' || expected.table_name)::regclass
      and pc.conname = expected.constraint_name;
    if actual_definition is null or regexp_replace(actual_definition,'\s+',' ','g') is distinct from regexp_replace(expected.constraint_definition,'\s+',' ','g') then
      raise exception 'Complete definition for public.%.% differs from audited contract.', expected.table_name, expected.constraint_name;
    end if;
  end loop;

  foreach actual_definition in array array['estimates','estimate_line_items','estimate_options','estimate_material_price_snapshots','material_catalog']::text[] loop
    if not (select relrowsecurity from pg_class where oid = ('public.' || actual_definition)::regclass) then
      raise exception 'RLS is not enabled on audited table public.%.', actual_definition;
    end if;
  end loop;

  if to_regprocedure('public.set_updated_at()') is null then
    raise exception 'Audited public.set_updated_at() helper is missing.';
  end if;
  if not exists (
    select 1 from pg_proc p
    where p.oid = 'public.set_updated_at()'::regprocedure
      and p.prorettype = 'trigger'::regtype
      and p.pronargs = 0
      and p.prosecdef = false
  ) then
    raise exception 'Audited public.set_updated_at() signature or security contract changed.';
  end if;
  select pg_get_functiondef('public.set_updated_at()'::regprocedure)
    into actual_definition;
  if regexp_replace(btrim(actual_definition), '\s+', ' ', 'g')
      is distinct from regexp_replace(btrim(expected_set_updated_at_definition), '\s+', ' ', 'g') then
    raise exception 'Complete definition for audited public.set_updated_at() differs from required contract.';
  end if;
  for expected in select * from (values
    ('estimates','set_estimates_updated_at'),
    ('estimate_line_items','set_estimate_line_items_updated_at'),
    ('estimate_options','set_estimate_options_updated_at'),
    ('material_catalog','set_material_catalog_updated_at')
  ) as triggers(table_name,trigger_name)
  loop
    if not exists (
      select 1 from pg_trigger t
      where t.tgrelid = ('public.' || expected.table_name)::regclass
        and t.tgname = expected.trigger_name and not t.tgisinternal
        and t.tgfoid = 'public.set_updated_at()'::regprocedure
        and t.tgtype = 19 and t.tgenabled = 'O'
        and pg_get_triggerdef(t.oid) ilike '%before update%for each row%execute function%set_updated_at()%'
    ) then
      raise exception 'Audited updated-at trigger % on public.% is missing or changed.', expected.trigger_name, expected.table_name;
    end if;
  end loop;
end
$audit$;

create table public.estimate_sections (
  id uuid primary key default gen_random_uuid(),
  estimate_id uuid not null references public.estimates(id) on delete cascade,
  name text not null,
  customer_description text,
  internal_notes text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint estimate_sections_name_nonempty check (btrim(name) <> ''),
  constraint estimate_sections_sort_order_nonnegative check (sort_order >= 0)
);

create unique index estimate_sections_id_estimate_uidx on public.estimate_sections(id, estimate_id);
create index estimate_sections_estimate_order_idx on public.estimate_sections(estimate_id, sort_order, id);
create trigger set_estimate_sections_updated_at before update on public.estimate_sections
for each row execute function public.set_updated_at();

alter table public.estimate_sections enable row level security;
revoke all on table public.estimate_sections from public, anon, authenticated;
grant select, insert, update, delete on table public.estimate_sections to service_role;

alter table public.estimates
  add column overhead_percent numeric(7,3) default 0,
  add column profit_markup_percent numeric(7,3) default 0,
  add column tax_rate_percent numeric(7,3) default 0,
  add column discount_type text default 'fixed_amount',
  add column discount_value numeric(12,2) default 0,
  add column scope_notes text,
  add column exclusions text,
  add column calculation_policy_version text,
  add column calculation_revision integer default 0,
  add column costs_complete boolean,
  add column prices_complete boolean,
  add column item_markup_amount numeric(12,2),
  add column overhead_amount numeric(12,2),
  add column pre_profit_subtotal numeric(12,2),
  add column profit_markup_amount numeric(12,2),
  add column pre_discount_subtotal numeric(12,2),
  add column post_discount_subtotal numeric(12,2),
  add column taxable_item_price_subtotal numeric(12,2),
  add column taxable_overhead_amount numeric(12,2),
  add column taxable_profit_amount numeric(12,2),
  add column taxable_discount_amount numeric(12,2),
  add column taxable_subtotal numeric(12,2);

alter table public.estimates
  add constraint estimates_structured_overhead_range check (overhead_percent is null or overhead_percent between 0 and 1000) not valid,
  add constraint estimates_structured_profit_markup_range check (profit_markup_percent is null or profit_markup_percent between 0 and 1000) not valid,
  add constraint estimates_structured_tax_range check (tax_rate_percent is null or tax_rate_percent between 0 and 100) not valid,
  add constraint estimates_structured_discount_type check (discount_type is null or discount_type = 'fixed_amount') not valid,
  add constraint estimates_structured_discount_nonnegative check (discount_value is null or discount_value >= 0) not valid,
  add constraint estimates_structured_revision_nonnegative check (calculation_revision is null or calculation_revision >= 0) not valid,
  add constraint estimates_structured_policy_version check (calculation_policy_version is null or calculation_policy_version = 'structured-estimate-v1') not valid,
  add constraint estimates_structured_contract check (
    calculation_policy_version is distinct from 'structured-estimate-v1' or (
      overhead_percent is not null and profit_markup_percent is not null
      and tax_rate_percent is not null and discount_type = 'fixed_amount'
      and discount_value is not null and calculation_revision is not null
      and costs_complete is not null and prices_complete is not null
    )
  ) not valid;

comment on column public.estimates.calculation_policy_version is 'Null identifies legacy estimates. B2 explicitly sets structured-estimate-v1 to activate the structured contract.';
comment on column public.estimates.subtotal_cost is 'Compatibility total: structured direct cost when costs_complete is true; zero is only a sentinel when incomplete.';
comment on column public.estimates.subtotal_price is 'Compatibility total: structured item-price subtotal when prices_complete is true.';
comment on column public.estimates.contingency_amount is 'Compatibility total; structured-estimate-v1 persists zero because contingency is deferred.';
comment on column public.estimates.discount_amount is 'Compatibility output containing the server-calculated fixed discount.';
comment on column public.estimates.tax_amount is 'Compatibility output containing server-calculated tax.';
comment on column public.estimates.total_price is 'Compatibility output containing customer total when prices_complete is true.';
comment on column public.estimates.estimated_profit is 'Compatibility output containing gross profit when costs_complete and prices_complete are true.';
comment on column public.estimates.estimated_margin is 'Compatibility output containing gross margin when costs_complete and prices_complete are true.';

alter table public.estimate_line_items
  add column section_id uuid,
  add column item_type text,
  add column internal_description text,
  add column customer_description text,
  add column material_unit_cost numeric(12,4),
  add column labor_unit_cost numeric(12,4),
  add column subcontractor_unit_cost numeric(12,4),
  add column equipment_unit_cost numeric(12,4),
  add column other_direct_unit_cost numeric(12,4),
  add column material_waste_percent numeric(7,3),
  add column item_markup_percent numeric(7,3),
  add column taxable boolean,
  add column costs_complete boolean,
  add column prices_complete boolean,
  add column fixed_customer_price numeric(12,2),
  add column material_cost_amount numeric(12,2),
  add column labor_cost_amount numeric(12,2),
  add column subcontractor_cost_amount numeric(12,2),
  add column equipment_cost_amount numeric(12,2),
  add column other_direct_cost_amount numeric(12,2),
  add column item_markup_amount numeric(12,2);

alter table public.estimate_line_items
  add constraint estimate_line_items_structured_item_type check (item_type is null or item_type in ('standard','allowance')) not valid,
  add constraint estimate_line_items_structured_required check (item_type is null or (
    section_id is not null and customer_description is not null and btrim(customer_description) <> ''
    and taxable is not null and costs_complete is not null and prices_complete is not null
  )) not valid,
  add constraint estimate_line_items_structured_component_costs check (
    (material_unit_cost is null or material_unit_cost >= 0)
    and (labor_unit_cost is null or labor_unit_cost >= 0)
    and (subcontractor_unit_cost is null or subcontractor_unit_cost >= 0)
    and (equipment_unit_cost is null or equipment_unit_cost >= 0)
    and (other_direct_unit_cost is null or other_direct_unit_cost >= 0)
  ) not valid,
  add constraint estimate_line_items_structured_waste_range check (material_waste_percent is null or material_waste_percent between 0 and 100) not valid,
  add constraint estimate_line_items_structured_markup_range check (item_markup_percent is null or item_markup_percent between 0 and 1000) not valid,
  add constraint estimate_line_items_structured_fixed_price_nonnegative check (fixed_customer_price is null or fixed_customer_price >= 0) not valid,
  add constraint estimate_line_items_structured_cost_completeness check (item_type is null or costs_complete = (
    material_unit_cost is not null and labor_unit_cost is not null
    and subcontractor_unit_cost is not null and equipment_unit_cost is not null
    and other_direct_unit_cost is not null
  )) not valid,
  add constraint estimate_line_items_structured_kind_contract check (item_type is null or (
    item_type = 'standard' and fixed_customer_price is null
      and item_markup_percent is not null and prices_complete = costs_complete
  ) or (
    item_type = 'allowance' and fixed_customer_price is not null
      and item_markup_percent is null and prices_complete = true
  )) not valid;

comment on column public.estimate_line_items.item_type is 'Canonical structured type: standard or allowance. Null preserves legacy rows.';
comment on column public.estimate_line_items.costs_complete is 'For structured standard items, null component costs mean unknown. costs_complete may be true only when all five component unit costs are non-null. A known non-applicable component must be stored explicitly as 0.0000; zero is a known zero cost, not a missing value.';
comment on column public.estimate_line_items.base_unit_cost is 'Legacy compatibility mirror; structured component unit costs are canonical.';
comment on column public.estimate_line_items.waste_percent is 'Legacy compatibility mirror of material_waste_percent.';
comment on column public.estimate_line_items.markup_percent is 'Legacy compatibility mirror of item_markup_percent.';
comment on column public.estimate_line_items.pricing_method is 'Legacy compatibility mirror; target-margin is not active in structured-estimate-v1.';
comment on column public.estimate_line_items.estimated_cost is 'Compatibility output for direct cost, qualified by costs_complete.';
comment on column public.estimate_line_items.total_price is 'Compatibility output for customer item price, qualified by prices_complete.';
comment on column public.estimate_line_items.unit_price is 'Legacy compatibility output derived from structured customer item price and quantity.';
comment on column public.estimate_line_items.estimated_profit is 'Legacy compatibility output for item price less direct cost when complete.';
comment on column public.estimate_line_items.estimated_margin is 'Legacy compatibility output for item gross margin when complete.';

comment on column public.estimate_line_items.estimate_option_id is 'Estimate options remain inactive in B1. Consistency under later line-option reassignment must be addressed before estimate options are activated.';

create unique index estimate_options_id_estimate_uidx on public.estimate_options(id, estimate_id);
create unique index estimate_line_items_id_estimate_uidx on public.estimate_line_items(id, estimate_id);

alter table public.estimate_line_items
  add constraint estimate_line_items_section_estimate_fkey foreign key (section_id, estimate_id)
    references public.estimate_sections(id, estimate_id) on delete cascade not valid,
  add constraint estimate_line_items_option_estimate_fkey foreign key (estimate_option_id, estimate_id)
    references public.estimate_options(id, estimate_id) on delete cascade not valid;

alter table public.estimate_material_price_snapshots
  add constraint estimate_snapshots_line_estimate_fkey foreign key (estimate_line_item_id, estimate_id)
    references public.estimate_line_items(id, estimate_id) on delete cascade not valid,
  add constraint estimate_snapshots_option_estimate_fkey foreign key (estimate_option_id, estimate_id)
    references public.estimate_options(id, estimate_id) on delete cascade not valid;

create or replace function public.enforce_estimate_snapshot_consistency()
returns trigger
language plpgsql
set search_path = public
as $function$
declare
  line_estimate_id uuid;
  line_option_id uuid;
begin
  if new.estimate_line_item_id is not null then
    select estimate_id, estimate_option_id into line_estimate_id, line_option_id
    from public.estimate_line_items where id = new.estimate_line_item_id;
    if not found or line_estimate_id is distinct from new.estimate_id then
      raise exception 'Estimate snapshot line-item linkage is invalid.';
    end if;
    if line_option_id is distinct from new.estimate_option_id then
      raise exception 'Estimate snapshot option must match its line item.';
    end if;
  elsif new.estimate_option_id is not null and not exists (
    select 1 from public.estimate_options
    where id = new.estimate_option_id and estimate_id = new.estimate_id
  ) then
    raise exception 'Estimate snapshot option linkage is invalid.';
  end if;
  return new;
end
$function$;

revoke all on function public.enforce_estimate_snapshot_consistency() from public, anon, authenticated;
grant execute on function public.enforce_estimate_snapshot_consistency() to service_role;

create trigger enforce_estimate_snapshot_consistency
before insert or update on public.estimate_material_price_snapshots
for each row execute function public.enforce_estimate_snapshot_consistency();

alter table public.estimates enable row level security;
alter table public.estimate_line_items enable row level security;
alter table public.estimate_options enable row level security;
alter table public.estimate_material_price_snapshots enable row level security;

revoke all on table public.estimates, public.estimate_sections, public.estimate_line_items,
  public.estimate_options, public.estimate_material_price_snapshots from public, anon, authenticated;
grant select, insert, update, delete on table public.estimates, public.estimate_sections,
  public.estimate_line_items, public.estimate_options, public.estimate_material_price_snapshots to service_role;

comment on table public.estimate_sections is 'Ordered sections for structured estimates. Browser roles have no direct access.';
comment on table public.estimate_material_price_snapshots is 'Historical material price evidence. B1 does not require a line ID or limit snapshots per line.';

commit;
