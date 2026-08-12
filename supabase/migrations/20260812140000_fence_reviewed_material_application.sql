begin;

create table public.fence_estimate_material_applications (
  id uuid primary key,
  company_id uuid not null references public.company_settings(id) on delete restrict,
  estimate_id uuid not null references public.estimates(id) on delete restrict,
  fence_draft_id uuid not null references public.fence_estimate_drafts(id) on delete restrict,
  fence_revision integer not null check (fence_revision >= 1),
  expected_calculation_revision integer not null check (expected_calculation_revision >= 0),
  resulting_calculation_revision integer not null,
  application_version text not null check (application_version = 'fence-reviewed-material-application-v1'),
  idempotency_key text not null check (idempotency_key ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  preview_binding text not null check (length(preview_binding) between 1 and 12000),
  evidence_snapshot jsonb not null check (jsonb_typeof(evidence_snapshot) = 'object'),
  section_id uuid not null references public.estimate_sections(id) on delete restrict,
  applied_by uuid not null references public.app_users(id) on delete restrict,
  applied_at timestamp with time zone not null default now(),
  constraint fence_material_application_revision_unique unique (estimate_id, fence_revision),
  constraint fence_material_application_idempotency_unique unique (company_id, idempotency_key),
  constraint fence_material_application_revision_step check (
    resulting_calculation_revision = expected_calculation_revision + 1
  )
);

create index fence_material_applications_estimate_idx
  on public.fence_estimate_material_applications(company_id, estimate_id, applied_at desc);

create table public.fence_estimate_material_application_lines (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.fence_estimate_material_applications(id) on delete restrict,
  estimate_line_item_id uuid not null unique references public.estimate_line_items(id) on delete restrict,
  ordinal integer not null check (ordinal >= 0),
  demand_key text not null,
  item_number text not null,
  model_number text not null,
  identity_source_reference text not null,
  price_source_reference text not null,
  raw_quantity numeric not null check (raw_quantity > 0),
  raw_material_unit_cost numeric not null check (raw_material_unit_cost >= 0),
  availability_status text not null check (availability_status = 'unknown'),
  evidence_line_snapshot jsonb not null check (jsonb_typeof(evidence_line_snapshot) = 'object'),
  constraint fence_material_application_line_ordinal_unique unique (application_id, ordinal),
  constraint fence_material_application_line_demand_unique unique (application_id, demand_key)
);

create or replace function public.prevent_fence_material_application_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $function$
begin
  raise exception 'Fence material applications and evidence are append-only.' using errcode = '55000';
end;
$function$;

create trigger prevent_fence_material_application_mutation
before update or delete on public.fence_estimate_material_applications
for each row execute function public.prevent_fence_material_application_mutation();
create trigger prevent_fence_material_application_line_mutation
before update or delete on public.fence_estimate_material_application_lines
for each row execute function public.prevent_fence_material_application_mutation();

alter table public.fence_estimate_material_applications enable row level security;
alter table public.fence_estimate_material_application_lines enable row level security;

revoke all on table public.fence_estimate_material_applications,
  public.fence_estimate_material_application_lines
from public, anon, authenticated, service_role;
grant select, insert on table public.fence_estimate_material_applications,
  public.fence_estimate_material_application_lines
to service_role;

create function public.apply_reviewed_fence_materials(
  requested_auth_user_id uuid,
  requested_estimate_id uuid,
  requested_application_id uuid,
  requested_idempotency_key text,
  requested_expected_fence_revision integer,
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
language plpgsql
security invoker
set search_path = pg_catalog, public
as $function$
declare
  effective_access jsonb;
  resolved_company_id uuid;
  user_record public.app_users;
  estimate_record public.estimates;
  draft_record public.fence_estimate_drafts;
  prior_application public.fence_estimate_material_applications;
  new_item_count integer;
  evidence_line_count integer;
begin
  if requested_auth_user_id is null or requested_estimate_id is null
    or requested_application_id is null or requested_section_id is null then
    return query select 'forbidden', null::integer, null::uuid;
    return;
  end if;

  select public.get_effective_user_access(requested_auth_user_id) into effective_access;
  if effective_access is null
    or effective_access -> 'portal_access' ->> 'sales' is distinct from 'true'
    or effective_access -> 'permissions' ->> 'edit_prices' is distinct from 'true' then
    return query select 'forbidden', null::integer, null::uuid;
    return;
  end if;

  select * into user_record
  from public.app_users
  where auth_user_id = requested_auth_user_id
    and id = (effective_access ->> 'user_id')::uuid
    and company_id = (effective_access ->> 'company_id')::uuid
    and is_active = true;
  if user_record.id is null then
    return query select 'forbidden', null::integer, null::uuid;
    return;
  end if;

  resolved_company_id := public.assert_single_company_fence_estimate_scope();
  if user_record.company_id is distinct from resolved_company_id then
    return query select 'forbidden', null::integer, null::uuid;
    return;
  end if;

  if requested_expected_fence_revision is null or requested_expected_fence_revision < 1
    or requested_expected_calculation_revision is null or requested_expected_calculation_revision < 0
    or requested_application_version is distinct from 'fence-reviewed-material-application-v1'
    or requested_idempotency_key is null
    or requested_idempotency_key !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or length(coalesce(requested_preview_binding, '')) not between 1 and 12000
    or jsonb_typeof(requested_new_items) is distinct from 'array'
    or jsonb_typeof(requested_item_calculations) is distinct from 'array'
    or jsonb_typeof(requested_estimate_calculation) is distinct from 'object'
    or jsonb_typeof(requested_evidence_snapshot) is distinct from 'object' then
    return query select 'invalid_application', null::integer, null::uuid;
    return;
  end if;

  select * into estimate_record from public.estimates
  where id = requested_estimate_id for update;
  if estimate_record.id is null
    or estimate_record.calculation_policy_version is distinct from 'structured-estimate-v2-material-tax' then
    return query select 'not_found', null::integer, null::uuid;
    return;
  end if;
  if estimate_record.status <> 'draft' then
    return query select 'non_draft', estimate_record.calculation_revision, null::uuid;
    return;
  end if;
  select * into draft_record from public.fence_estimate_drafts
  where estimate_id = requested_estimate_id for update;
  if draft_record.id is null or draft_record.company_id is distinct from resolved_company_id then
    return query select 'not_found', estimate_record.calculation_revision, null::uuid;
    return;
  end if;
  if draft_record.revision <> requested_expected_fence_revision then
    return query select 'stale_fence_revision', estimate_record.calculation_revision, null::uuid;
    return;
  end if;

  select * into prior_application
  from public.fence_estimate_material_applications
  where id = requested_application_id
    or (company_id = resolved_company_id and idempotency_key = requested_idempotency_key)
    or (estimate_id = requested_estimate_id and fence_revision = requested_expected_fence_revision)
  order by applied_at
  limit 1;
  if prior_application.id is not null then
    if prior_application.id = requested_application_id
      and prior_application.company_id = resolved_company_id
      and prior_application.estimate_id = requested_estimate_id
      and prior_application.fence_revision = requested_expected_fence_revision
      and prior_application.idempotency_key = requested_idempotency_key
      and prior_application.preview_binding = requested_preview_binding then
      return query select 'replayed_application', estimate_record.calculation_revision, prior_application.id;
    else
      return query select 'application_identity_conflict', estimate_record.calculation_revision, prior_application.id;
    end if;
    return;
  end if;

  if estimate_record.calculation_revision <> requested_expected_calculation_revision then
    return query select 'stale_calculation_revision', estimate_record.calculation_revision, null::uuid;
    return;
  end if;

  if jsonb_typeof(requested_evidence_snapshot -> 'lines') is distinct from 'array'
    or exists (
      select 1 from jsonb_array_elements(requested_new_items) item
      where jsonb_typeof(item) <> 'object'
    )
    or exists (
      select 1 from jsonb_array_elements(requested_evidence_snapshot -> 'lines') evidence
      where jsonb_typeof(evidence) <> 'object'
    ) then
    return query select 'invalid_application', estimate_record.calculation_revision, null::uuid;
    return;
  end if;

  new_item_count := jsonb_array_length(requested_new_items);
  evidence_line_count := jsonb_array_length(requested_evidence_snapshot -> 'lines');
  if new_item_count not between 1 and 5
    or requested_evidence_snapshot ->> 'version' is distinct from requested_application_version
    or requested_evidence_snapshot ->> 'previewBinding' is distinct from requested_preview_binding
    or requested_evidence_snapshot ->> 'evidenceManifestSha256' is null
    or requested_evidence_snapshot ->> 'evidenceVersion' is null
    or evidence_line_count <> new_item_count then
    return query select 'invalid_application', estimate_record.calculation_revision, null::uuid;
    return;
  end if;

  -- Casts are deliberately isolated after JSON container checks. Only input
  -- representation/range failures are normalized; unexpected SQL errors still surface.
  begin
    if (requested_evidence_snapshot ->> 'fenceRevision')::integer is distinct from requested_expected_fence_revision
      or exists (
        select 1 from jsonb_array_elements(requested_new_items) item
        where (item ->> 'id')::uuid is null
          or (item ->> 'section_id')::uuid is distinct from requested_section_id
          or item ->> 'item_type' is distinct from 'standard'
          or (item ->> 'quantity')::numeric <= 0
          or item ->> 'unit' is distinct from 'ea'
          or (item ->> 'material_unit_cost')::numeric < 0
          or (item ->> 'labor_unit_cost')::numeric <> 0
          or (item ->> 'subcontractor_unit_cost')::numeric <> 0
          or (item ->> 'equipment_unit_cost')::numeric <> 0
          or (item ->> 'other_direct_unit_cost')::numeric <> 0
          or (item ->> 'material_waste_percent')::numeric <> 0
          or (item ->> 'item_markup_percent')::numeric <> 0
          or (item ->> 'taxable')::boolean is distinct from false
          or (item ->> 'is_included')::boolean is distinct from true
          or item -> 'fixed_customer_price' <> 'null'::jsonb
          or (item ->> 'sort_order')::integer < 0
      )
      or exists (
        select 1
        from jsonb_array_elements(requested_evidence_snapshot -> 'lines') evidence
        where (evidence ->> 'estimateLineItemId')::uuid is null
          or (evidence ->> 'quantity')::numeric <= 0
          or (evidence ->> 'materialUnitCost')::numeric < 0
          or not exists (
            select 1 from jsonb_array_elements(requested_new_items) item
            where item ->> 'id' = evidence ->> 'estimateLineItemId'
              and item ->> 'quantity' = evidence ->> 'quantity'
              and item ->> 'material_unit_cost' = evidence ->> 'materialUnitCost'
              and item ->> 'customer_description' = evidence ->> 'customerDescription'
              and item ->> 'internal_description' = evidence ->> 'internalDescription'
          )
      ) then
      return query select 'invalid_application', estimate_record.calculation_revision, null::uuid;
      return;
    end if;
  exception
    when invalid_text_representation or numeric_value_out_of_range or invalid_parameter_value then
      return query select 'invalid_application', estimate_record.calculation_revision, null::uuid;
      return;
  end;

  if exists (select 1 from public.estimate_sections where id = requested_section_id)
    or exists (
      select 1 from jsonb_array_elements(requested_new_items) item
      join public.estimate_line_items line on line.id = (item ->> 'id')::uuid
    )
    or new_item_count <> (
      select count(distinct item ->> 'id') from jsonb_array_elements(requested_new_items) item
    ) then
    return query select 'application_identity_conflict', estimate_record.calculation_revision, null::uuid;
    return;
  end if;

  begin
    insert into public.estimate_sections (
      id, estimate_id, name, customer_description, internal_notes, sort_order
    ) values (
      requested_section_id, requested_estimate_id, 'Reviewed Fence materials',
      'Reviewed Fence materials', 'Bound to immutable Fence application evidence.',
      coalesce((select max(sort_order) + 1 from public.estimate_sections where estimate_id = requested_estimate_id), 0)
    );

    insert into public.estimate_line_items (
      id, estimate_id, section_id, item_type, quantity, unit,
      customer_description, internal_description, material_unit_cost,
      labor_unit_cost, subcontractor_unit_cost, equipment_unit_cost,
      other_direct_unit_cost, material_waste_percent, item_markup_percent,
      taxable, is_included, fixed_customer_price, sort_order,
      costs_complete, prices_complete, line_type, category, description,
      base_unit_cost, waste_percent, pricing_method, adjusted_quantity,
      estimated_cost, unit_price, total_price, estimated_profit, is_optional,
      material_catalog_id, labor_catalog_id, estimate_option_id, metadata
    )
    select
      (item ->> 'id')::uuid, requested_estimate_id, requested_section_id, 'standard',
      (item ->> 'quantity')::numeric, 'ea', item ->> 'customer_description',
      item ->> 'internal_description', (item ->> 'material_unit_cost')::numeric,
      0, 0, 0, 0, 0, 0, false, true, null, (item ->> 'sort_order')::integer,
      true, true, 'other', 'structured', item ->> 'customer_description',
      (item ->> 'material_unit_cost')::numeric, 0, 'markup',
      (item ->> 'quantity')::numeric, 0, 0, 0, 0, false,
      null, null, null, '{}'::jsonb
    from jsonb_array_elements(requested_new_items) item;

    insert into public.fence_estimate_material_applications (
      id, company_id, estimate_id, fence_draft_id, fence_revision,
      expected_calculation_revision, resulting_calculation_revision,
      application_version, idempotency_key, preview_binding, evidence_snapshot,
      section_id, applied_by
    ) values (
      requested_application_id, resolved_company_id, requested_estimate_id,
      draft_record.id, requested_expected_fence_revision,
      requested_expected_calculation_revision, requested_expected_calculation_revision + 1,
      requested_application_version, requested_idempotency_key,
      requested_preview_binding, requested_evidence_snapshot,
      requested_section_id, user_record.id
    );

    insert into public.fence_estimate_material_application_lines (
      application_id, estimate_line_item_id, ordinal, demand_key, item_number,
      model_number, identity_source_reference, price_source_reference,
      raw_quantity, raw_material_unit_cost, availability_status,
      evidence_line_snapshot
    )
    select requested_application_id, (evidence ->> 'estimateLineItemId')::uuid,
      ordinality - 1, evidence ->> 'demandKey', evidence ->> 'itemNumber',
      evidence ->> 'modelNumber', evidence ->> 'identitySourceReference',
      evidence ->> 'priceSourceReference', (evidence ->> 'quantity')::numeric,
      (evidence ->> 'materialUnitCost')::numeric,
      evidence ->> 'availabilityStatus', evidence
    from jsonb_array_elements(requested_evidence_snapshot -> 'lines') with ordinality as source(evidence, ordinality);

    perform public.persist_structured_estimate_outputs(
      requested_estimate_id, requested_expected_calculation_revision,
      requested_item_calculations, requested_estimate_calculation
    );
  exception
    when unique_violation then
      return query select 'application_identity_conflict', estimate_record.calculation_revision, null::uuid;
      return;
    when check_violation or not_null_violation or numeric_value_out_of_range
      or invalid_text_representation or sqlstate 'P0001' then
      return query select 'invalid_application', estimate_record.calculation_revision, null::uuid;
      return;
  end;

  return query select 'ok', requested_expected_calculation_revision + 1, requested_application_id;
end;
$function$;

revoke all on function public.prevent_fence_material_application_mutation()
from public, anon, authenticated, service_role;
revoke all on function public.apply_reviewed_fence_materials(uuid,uuid,uuid,text,integer,integer,text,text,uuid,jsonb,jsonb,jsonb,jsonb)
from public, anon, authenticated;
grant execute on function public.apply_reviewed_fence_materials(uuid,uuid,uuid,text,integer,integer,text,text,uuid,jsonb,jsonb,jsonb,jsonb)
to service_role;

comment on table public.fence_estimate_material_applications is
  'Append-only identity and complete reviewed-evidence snapshot for one atomic Fence material application.';
comment on table public.fence_estimate_material_application_lines is
  'Append-only linkage from each applied estimate line to its raw reviewed Lowe''s identity and price evidence.';

commit;
