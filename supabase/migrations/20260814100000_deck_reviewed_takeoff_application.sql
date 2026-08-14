begin;

create table public.deck_estimate_takeoff_applications (
  id uuid primary key,
  company_id uuid not null references public.company_settings(id) on delete restrict,
  estimate_id uuid not null references public.estimates(id) on delete restrict,
  visit_id uuid not null references public.guided_site_visits(id) on delete restrict,
  visit_revision integer not null check (visit_revision >= 1),
  expected_calculation_revision integer not null check (expected_calculation_revision >= 0),
  resulting_calculation_revision integer not null,
  application_version text not null check (application_version = 'deck-reviewed-takeoff-v1'),
  idempotency_key text not null check (idempotency_key ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  preview_binding text not null check (length(preview_binding) between 1 and 12000),
  evidence_snapshot jsonb not null check (jsonb_typeof(evidence_snapshot) = 'object'),
  section_id uuid not null references public.estimate_sections(id) on delete restrict,
  applied_by uuid not null references public.app_users(id) on delete restrict,
  applied_at timestamp with time zone not null default now(),
  constraint deck_takeoff_application_visit_unique unique (estimate_id, visit_id, visit_revision),
  constraint deck_takeoff_application_idempotency_unique unique (company_id, idempotency_key),
  constraint deck_takeoff_application_revision_step check (resulting_calculation_revision = expected_calculation_revision + 1)
);

create table public.deck_estimate_takeoff_application_lines (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.deck_estimate_takeoff_applications(id) on delete restrict,
  estimate_line_item_id uuid not null unique references public.estimate_line_items(id) on delete restrict,
  ordinal integer not null check (ordinal >= 0),
  line_key text not null,
  cost_category text not null check (cost_category in ('material','labor','equipment','other')),
  material_catalog_id uuid references public.material_catalog(id) on delete restrict,
  source_reference text not null check (length(source_reference) between 1 and 1000),
  formula text not null check (length(formula) between 1 and 2000),
  raw_quantity numeric not null check (raw_quantity > 0),
  raw_unit_cost numeric not null check (raw_unit_cost > 0),
  evidence_line_snapshot jsonb not null check (jsonb_typeof(evidence_line_snapshot) = 'object'),
  constraint deck_takeoff_application_line_ordinal_unique unique (application_id, ordinal),
  constraint deck_takeoff_application_line_key_unique unique (application_id, line_key)
);

create index deck_takeoff_applications_estimate_idx
  on public.deck_estimate_takeoff_applications(company_id, estimate_id, applied_at desc);

create or replace function public.prevent_deck_takeoff_application_mutation()
returns trigger language plpgsql set search_path = pg_catalog, public as $f$
begin
  raise exception 'Deck takeoff applications and evidence are append-only.' using errcode = '55000';
end;
$f$;

create trigger prevent_deck_takeoff_application_mutation
before update or delete on public.deck_estimate_takeoff_applications
for each row execute function public.prevent_deck_takeoff_application_mutation();
create trigger prevent_deck_takeoff_application_line_mutation
before update or delete on public.deck_estimate_takeoff_application_lines
for each row execute function public.prevent_deck_takeoff_application_mutation();

alter table public.deck_estimate_takeoff_applications enable row level security;
alter table public.deck_estimate_takeoff_application_lines enable row level security;
revoke all on table public.deck_estimate_takeoff_applications, public.deck_estimate_takeoff_application_lines
from public, anon, authenticated, service_role;
grant select, insert on table public.deck_estimate_takeoff_applications, public.deck_estimate_takeoff_application_lines
to service_role;

create function public.apply_reviewed_deck_takeoff(
  requested_auth_user_id uuid,
  requested_estimate_id uuid,
  requested_visit_id uuid,
  requested_application_id uuid,
  requested_idempotency_key text,
  requested_expected_visit_revision integer,
  requested_expected_calculation_revision integer,
  requested_application_version text,
  requested_preview_binding text,
  requested_section_id uuid,
  requested_new_items jsonb,
  requested_item_calculations jsonb,
  requested_estimate_calculation jsonb,
  requested_evidence_snapshot jsonb
)
returns table(result_code text, next_calculation_revision integer, resource_id uuid)
language plpgsql security invoker set search_path = pg_catalog, public as $f$
declare
  effective_access jsonb;
  resolved_company_id uuid;
  user_record public.app_users;
  estimate_record public.estimates;
  visit_record public.guided_site_visits;
  prior_application public.deck_estimate_takeoff_applications;
  new_item_count integer;
  evidence_line_count integer;
begin
  if requested_auth_user_id is null or requested_estimate_id is null or requested_visit_id is null
    or requested_application_id is null or requested_section_id is null then
    return query select 'forbidden', null::integer, null::uuid; return;
  end if;
  select public.get_effective_user_access(requested_auth_user_id) into effective_access;
  if effective_access is null
    or effective_access -> 'portal_access' ->> 'sales' is distinct from 'true'
    or effective_access -> 'permissions' ->> 'edit_prices' is distinct from 'true' then
    return query select 'forbidden', null::integer, null::uuid; return;
  end if;
  select * into user_record from public.app_users
  where auth_user_id = requested_auth_user_id
    and id = (effective_access ->> 'user_id')::uuid
    and company_id = (effective_access ->> 'company_id')::uuid
    and is_active = true;
  if user_record.id is null then return query select 'forbidden', null::integer, null::uuid; return; end if;
  resolved_company_id := public.assert_single_company_fence_estimate_scope();
  if user_record.company_id is distinct from resolved_company_id then
    return query select 'forbidden', null::integer, null::uuid; return;
  end if;
  if requested_expected_visit_revision is null or requested_expected_visit_revision < 1
    or requested_expected_calculation_revision is null or requested_expected_calculation_revision < 0
    or requested_application_version is distinct from 'deck-reviewed-takeoff-v1'
    or requested_idempotency_key is null
    or requested_idempotency_key !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or length(coalesce(requested_preview_binding, '')) not between 1 and 12000
    or jsonb_typeof(requested_new_items) is distinct from 'array'
    or jsonb_typeof(requested_item_calculations) is distinct from 'array'
    or jsonb_typeof(requested_estimate_calculation) is distinct from 'object'
    or jsonb_typeof(requested_evidence_snapshot) is distinct from 'object' then
    return query select 'invalid_application', null::integer, null::uuid; return;
  end if;

  select * into estimate_record from public.estimates where id = requested_estimate_id for update;
  if estimate_record.id is null or estimate_record.calculation_policy_version is distinct from 'structured-estimate-v2-material-tax' then
    return query select 'not_found', null::integer, null::uuid; return;
  end if;
  if estimate_record.status <> 'draft' then
    return query select 'non_draft', estimate_record.calculation_revision, null::uuid; return;
  end if;
  select * into visit_record from public.guided_site_visits
  where id = requested_visit_id and company_id = resolved_company_id
    and target_estimate_id = requested_estimate_id for update;
  if visit_record.id is null or visit_record.status <> 'completed' then
    return query select 'not_found', estimate_record.calculation_revision, null::uuid; return;
  end if;
  if visit_record.revision <> requested_expected_visit_revision then
    return query select 'stale_visit_revision', estimate_record.calculation_revision, null::uuid; return;
  end if;

  select * into prior_application from public.deck_estimate_takeoff_applications
  where id = requested_application_id
    or (company_id = resolved_company_id and idempotency_key = requested_idempotency_key)
    or (estimate_id = requested_estimate_id and visit_id = requested_visit_id and visit_revision = requested_expected_visit_revision)
  order by applied_at limit 1;
  if prior_application.id is not null then
    if prior_application.id = requested_application_id
      and prior_application.company_id = resolved_company_id
      and prior_application.estimate_id = requested_estimate_id
      and prior_application.visit_id = requested_visit_id
      and prior_application.visit_revision = requested_expected_visit_revision
      and prior_application.idempotency_key = requested_idempotency_key
      and prior_application.preview_binding = requested_preview_binding then
      return query select 'replayed_application', estimate_record.calculation_revision, prior_application.id;
    else
      return query select 'application_identity_conflict', estimate_record.calculation_revision, prior_application.id;
    end if;
    return;
  end if;
  if estimate_record.calculation_revision <> requested_expected_calculation_revision then
    return query select 'stale_calculation_revision', estimate_record.calculation_revision, null::uuid; return;
  end if;

  if jsonb_typeof(requested_evidence_snapshot -> 'lines') is distinct from 'array'
    or exists (select 1 from jsonb_array_elements(requested_new_items) item where jsonb_typeof(item) <> 'object')
    or exists (select 1 from jsonb_array_elements(requested_evidence_snapshot -> 'lines') evidence where jsonb_typeof(evidence) <> 'object') then
    return query select 'invalid_application', estimate_record.calculation_revision, null::uuid; return;
  end if;
  new_item_count := jsonb_array_length(requested_new_items);
  evidence_line_count := jsonb_array_length(requested_evidence_snapshot -> 'lines');
  if new_item_count not between 1 and 20 or evidence_line_count <> new_item_count
    or requested_evidence_snapshot ->> 'version' is distinct from requested_application_version
    or requested_evidence_snapshot ->> 'previewBinding' is distinct from requested_preview_binding
    or (requested_evidence_snapshot ->> 'visitId')::uuid is distinct from requested_visit_id
    or (requested_evidence_snapshot ->> 'visitRevision')::integer is distinct from requested_expected_visit_revision then
    return query select 'invalid_application', estimate_record.calculation_revision, null::uuid; return;
  end if;

  begin
    if exists (
      select 1 from jsonb_array_elements(requested_new_items) item
      where (item ->> 'id')::uuid is null
        or (item ->> 'section_id')::uuid is distinct from requested_section_id
        or item ->> 'item_type' is distinct from 'standard'
        or (item ->> 'quantity')::numeric <= 0
        or (item ->> 'material_unit_cost')::numeric < 0
        or (item ->> 'labor_unit_cost')::numeric < 0
        or (item ->> 'subcontractor_unit_cost')::numeric <> 0
        or (item ->> 'equipment_unit_cost')::numeric < 0
        or (item ->> 'other_direct_unit_cost')::numeric < 0
        or ((item ->> 'material_unit_cost')::numeric + (item ->> 'labor_unit_cost')::numeric
          + (item ->> 'equipment_unit_cost')::numeric + (item ->> 'other_direct_unit_cost')::numeric) <= 0
        or (item ->> 'material_waste_percent')::numeric <> 0
        or (item ->> 'item_markup_percent')::numeric <> 0
        or (item ->> 'taxable')::boolean is distinct from false
        or (item ->> 'is_included')::boolean is distinct from true
        or item -> 'fixed_customer_price' <> 'null'::jsonb
    ) or exists (
      select 1 from jsonb_array_elements(requested_evidence_snapshot -> 'lines') evidence
      where (evidence ->> 'estimateLineItemId')::uuid is null
        or evidence ->> 'category' not in ('material','labor','equipment','other')
        or (evidence ->> 'quantity')::numeric <= 0
        or (evidence ->> 'unitCost')::numeric <= 0
        or length(coalesce(evidence ->> 'sourceReference','')) not between 1 and 1000
        or length(coalesce(evidence ->> 'formula','')) not between 1 and 2000
        or not exists (
          select 1 from jsonb_array_elements(requested_new_items) item
          where item ->> 'id' = evidence ->> 'estimateLineItemId'
            and item ->> 'quantity' = evidence ->> 'quantity'
            and item ->> 'customer_description' = evidence ->> 'customerDescription'
            and case evidence ->> 'category'
              when 'material' then item ->> 'material_unit_cost'
              when 'labor' then item ->> 'labor_unit_cost'
              when 'equipment' then item ->> 'equipment_unit_cost'
              else item ->> 'other_direct_unit_cost' end = evidence ->> 'unitCost'
        )
    ) then
      return query select 'invalid_application', estimate_record.calculation_revision, null::uuid; return;
    end if;
  exception when invalid_text_representation or numeric_value_out_of_range or invalid_parameter_value then
    return query select 'invalid_application', estimate_record.calculation_revision, null::uuid; return;
  end;

  if exists (select 1 from public.estimate_sections where id = requested_section_id)
    or new_item_count <> (select count(distinct item ->> 'id') from jsonb_array_elements(requested_new_items) item)
    or exists (select 1 from jsonb_array_elements(requested_new_items) item join public.estimate_line_items line on line.id = (item ->> 'id')::uuid) then
    return query select 'application_identity_conflict', estimate_record.calculation_revision, null::uuid; return;
  end if;

  begin
    insert into public.estimate_sections(id,estimate_id,name,customer_description,internal_notes,sort_order)
    values(requested_section_id,requested_estimate_id,'Reviewed Deck takeoff','Deck construction','Bound to immutable reviewed Deck field, quantity, and price evidence.',
      coalesce((select max(sort_order)+1 from public.estimate_sections where estimate_id=requested_estimate_id),0));

    insert into public.estimate_line_items(
      id,estimate_id,section_id,item_type,quantity,unit,customer_description,internal_description,
      material_unit_cost,labor_unit_cost,subcontractor_unit_cost,equipment_unit_cost,other_direct_unit_cost,
      material_waste_percent,item_markup_percent,taxable,is_included,fixed_customer_price,sort_order,
      costs_complete,prices_complete,line_type,category,description,base_unit_cost,waste_percent,pricing_method,
      adjusted_quantity,estimated_cost,unit_price,total_price,estimated_profit,is_optional,
      material_catalog_id,labor_catalog_id,estimate_option_id,metadata
    )
    select (item->>'id')::uuid,requested_estimate_id,requested_section_id,'standard',(item->>'quantity')::numeric,item->>'unit',
      item->>'customer_description',item->>'internal_description',(item->>'material_unit_cost')::numeric,(item->>'labor_unit_cost')::numeric,
      0,(item->>'equipment_unit_cost')::numeric,(item->>'other_direct_unit_cost')::numeric,0,0,false,true,null,(item->>'sort_order')::integer,
      true,true,'other','structured',item->>'customer_description',
      (item->>'material_unit_cost')::numeric+(item->>'labor_unit_cost')::numeric+(item->>'equipment_unit_cost')::numeric+(item->>'other_direct_unit_cost')::numeric,
      0,'markup',(item->>'quantity')::numeric,0,0,0,0,false,
      nullif(evidence->>'catalogMaterialId','')::uuid,null,null,'{}'::jsonb
    from jsonb_array_elements(requested_new_items) with ordinality as ni(item,ordinality)
    join jsonb_array_elements(requested_evidence_snapshot->'lines') with ordinality as el(evidence,ordinality) using(ordinality);

    insert into public.deck_estimate_takeoff_applications(
      id,company_id,estimate_id,visit_id,visit_revision,expected_calculation_revision,resulting_calculation_revision,
      application_version,idempotency_key,preview_binding,evidence_snapshot,section_id,applied_by
    ) values(requested_application_id,resolved_company_id,requested_estimate_id,requested_visit_id,requested_expected_visit_revision,
      requested_expected_calculation_revision,requested_expected_calculation_revision+1,requested_application_version,
      requested_idempotency_key,requested_preview_binding,requested_evidence_snapshot,requested_section_id,user_record.id);

    insert into public.deck_estimate_takeoff_application_lines(
      application_id,estimate_line_item_id,ordinal,line_key,cost_category,material_catalog_id,source_reference,formula,
      raw_quantity,raw_unit_cost,evidence_line_snapshot
    ) select requested_application_id,(evidence->>'estimateLineItemId')::uuid,ordinality-1,evidence->>'key',evidence->>'category',
      nullif(evidence->>'catalogMaterialId','')::uuid,evidence->>'sourceReference',evidence->>'formula',
      (evidence->>'quantity')::numeric,(evidence->>'unitCost')::numeric,evidence
    from jsonb_array_elements(requested_evidence_snapshot->'lines') with ordinality as source(evidence,ordinality);

    perform public.persist_structured_estimate_outputs(requested_estimate_id,requested_expected_calculation_revision,
      requested_item_calculations,requested_estimate_calculation);
  exception
    when unique_violation then return query select 'application_identity_conflict',estimate_record.calculation_revision,null::uuid; return;
    when check_violation or not_null_violation or foreign_key_violation or numeric_value_out_of_range
      or invalid_text_representation or sqlstate 'P0001' then
      return query select 'invalid_application',estimate_record.calculation_revision,null::uuid; return;
  end;
  return query select 'ok',requested_expected_calculation_revision+1,requested_application_id;
end;
$f$;

revoke all on function public.prevent_deck_takeoff_application_mutation() from public,anon,authenticated,service_role;
revoke all on function public.apply_reviewed_deck_takeoff(uuid,uuid,uuid,uuid,text,integer,integer,text,text,uuid,jsonb,jsonb,jsonb,jsonb)
from public,anon,authenticated;
grant execute on function public.apply_reviewed_deck_takeoff(uuid,uuid,uuid,uuid,text,integer,integer,text,text,uuid,jsonb,jsonb,jsonb,jsonb)
to service_role;

comment on table public.deck_estimate_takeoff_applications is
  'Append-only reviewed Deck takeoff application binding completed field facts, deterministic formulas, human plan quantities, and price evidence.';
comment on table public.deck_estimate_takeoff_application_lines is
  'Append-only provenance linking each Deck estimate line to its reviewed quantity formula and catalog or manual cost source.';

commit;
