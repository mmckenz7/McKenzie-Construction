begin;

do $audit$
begin
  if to_regclass('public.material_catalog') is null
    or to_regclass('public.company_settings') is null
    or to_regclass('public.app_users') is null
    or to_regprocedure('public.get_effective_user_access(uuid)') is null then
    raise exception 'Estimating assembly prerequisites are missing.';
  end if;
end
$audit$;

create table public.estimating_assemblies (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company_settings(id) on delete restrict,
  assembly_key text not null,
  name text not null,
  trade_code text not null,
  description text,
  status text not null default 'draft'
    check (status in ('draft', 'active', 'retired')),
  row_revision integer not null default 1 check (row_revision >= 1),
  created_by uuid not null references public.app_users(id) on delete restrict,
  updated_by uuid not null references public.app_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, company_id),
  unique (company_id, assembly_key),
  check (assembly_key ~ '^[a-z0-9][a-z0-9_-]{1,63}$'),
  check (char_length(btrim(name)) between 2 and 120),
  check (char_length(btrim(trade_code)) between 2 and 40),
  check (description is null or char_length(btrim(description)) between 1 and 1000)
);

create table public.estimating_assembly_components (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company_settings(id) on delete restrict,
  assembly_id uuid not null,
  component_key text not null,
  label text not null,
  cost_type text not null
    check (cost_type in ('material', 'labor', 'subcontractor', 'equipment', 'other')),
  material_catalog_id uuid references public.material_catalog(id) on delete restrict,
  quantity_basis text not null
    check (quantity_basis in ('fixed_each', 'per_linear_foot', 'per_square_foot', 'per_count', 'manual_review')),
  quantity_factor numeric(14,6),
  unit text not null,
  waste_percent numeric(7,4) not null default 0
    check (waste_percent between 0 and 100),
  required boolean not null default true,
  compatibility_group text,
  source_notes text,
  sort_order integer not null default 0 check (sort_order between 0 and 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (assembly_id, component_key),
  foreign key (assembly_id, company_id)
    references public.estimating_assemblies(id, company_id) on delete cascade,
  check (component_key ~ '^[a-z0-9][a-z0-9_-]{1,63}$'),
  check (char_length(btrim(label)) between 2 and 160),
  check (char_length(btrim(unit)) between 1 and 40),
  check (compatibility_group is null or char_length(btrim(compatibility_group)) between 1 and 80),
  check (source_notes is null or char_length(btrim(source_notes)) between 1 and 1000),
  check (
    (quantity_basis = 'manual_review' and quantity_factor is null)
    or (quantity_basis <> 'manual_review' and quantity_factor > 0 and quantity_factor <= 1000000)
  ),
  check (
    (cost_type = 'material' and material_catalog_id is not null)
    or (cost_type <> 'material' and material_catalog_id is null)
  )
);

create index estimating_assemblies_company_status_idx
  on public.estimating_assemblies(company_id, status, name);
create index estimating_assembly_components_assembly_idx
  on public.estimating_assembly_components(company_id, assembly_id, sort_order);
create index estimating_assembly_components_material_idx
  on public.estimating_assembly_components(material_catalog_id)
  where material_catalog_id is not null;

alter table public.estimating_assemblies enable row level security;
alter table public.estimating_assembly_components enable row level security;

revoke all on table public.estimating_assemblies from public, anon, authenticated;
revoke all on table public.estimating_assembly_components from public, anon, authenticated;
grant select, insert, update, delete on table public.estimating_assemblies to service_role;
grant select, insert, update, delete on table public.estimating_assembly_components to service_role;

create or replace function public.save_estimating_assembly(
  requested_auth_user_id uuid,
  requested_company_id uuid,
  requested_assembly_id uuid,
  requested_expected_revision integer,
  requested_assembly_key text,
  requested_name text,
  requested_trade_code text,
  requested_description text,
  requested_status text,
  requested_components jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  effective_access jsonb;
  actor_user_id uuid;
  assembly_record public.estimating_assemblies;
  component_value jsonb;
  component_count integer;
  material_id uuid;
begin
  select public.get_effective_user_access(requested_auth_user_id)
  into effective_access;
  if effective_access is null
    or effective_access ->> 'auth_user_id' is distinct from requested_auth_user_id::text
    or effective_access ->> 'company_id' is distinct from requested_company_id::text
    or coalesce((effective_access -> 'permissions' ->> 'edit_prices')::boolean, false) is not true
    or coalesce((effective_access -> 'permissions' ->> 'manage_suppliers')::boolean, false) is not true then
    raise exception 'Assembly stewardship access was denied.';
  end if;
  actor_user_id := (effective_access ->> 'user_id')::uuid;

  if not exists (select 1 from public.company_settings where id = requested_company_id)
    or requested_assembly_key !~ '^[a-z0-9][a-z0-9_-]{1,63}$'
    or char_length(btrim(requested_name)) not between 2 and 120
    or char_length(btrim(requested_trade_code)) not between 2 and 40
    or requested_status not in ('draft', 'active', 'retired')
    or (requested_description is not null and char_length(btrim(requested_description)) not between 1 and 1000)
    or jsonb_typeof(requested_components) <> 'array' then
    raise exception 'Invalid estimating assembly.';
  end if;
  component_count := jsonb_array_length(requested_components);
  if component_count < 1 or component_count > 50 then
    raise exception 'An assembly must contain between 1 and 50 components.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    requested_company_id::text || ':estimating-assembly:' || requested_assembly_key, 0
  ));

  if requested_assembly_id is null then
    if requested_expected_revision is not null then
      raise exception 'A new assembly cannot have an expected revision.';
    end if;
    insert into public.estimating_assemblies (
      company_id, assembly_key, name, trade_code, description, status,
      created_by, updated_by
    ) values (
      requested_company_id, requested_assembly_key, btrim(requested_name),
      btrim(requested_trade_code), nullif(btrim(requested_description), ''),
      requested_status, actor_user_id, actor_user_id
    ) returning * into assembly_record;
  else
    select * into assembly_record
    from public.estimating_assemblies
    where id = requested_assembly_id and company_id = requested_company_id
    for update;
    if not found or requested_expected_revision is null
      or assembly_record.row_revision <> requested_expected_revision then
      raise exception 'The assembly changed. Reload it before saving.';
    end if;
    update public.estimating_assemblies
    set assembly_key = requested_assembly_key,
        name = btrim(requested_name),
        trade_code = btrim(requested_trade_code),
        description = nullif(btrim(requested_description), ''),
        status = requested_status,
        row_revision = row_revision + 1,
        updated_by = actor_user_id,
        updated_at = now()
    where id = assembly_record.id and company_id = requested_company_id
    returning * into assembly_record;
    delete from public.estimating_assembly_components
    where assembly_id = assembly_record.id and company_id = requested_company_id;
  end if;

  for component_value in select value from jsonb_array_elements(requested_components)
  loop
    if jsonb_typeof(component_value) <> 'object'
      or component_value ->> 'componentKey' !~ '^[a-z0-9][a-z0-9_-]{1,63}$'
      or char_length(btrim(component_value ->> 'label')) not between 2 and 160
      or component_value ->> 'costType' not in ('material', 'labor', 'subcontractor', 'equipment', 'other')
      or component_value ->> 'quantityBasis' not in ('fixed_each', 'per_linear_foot', 'per_square_foot', 'per_count', 'manual_review')
      or char_length(btrim(component_value ->> 'unit')) not between 1 and 40
      or coalesce((component_value ->> 'wastePercent')::numeric, -1) not between 0 and 100
      or coalesce((component_value ->> 'sortOrder')::integer, -1) not between 0 and 10000 then
      raise exception 'Invalid assembly component.';
    end if;
    if component_value ->> 'quantityBasis' = 'manual_review' then
      if component_value -> 'quantityFactor' <> 'null'::jsonb then
        raise exception 'Manual-review components cannot have a quantity factor.';
      end if;
    elsif coalesce((component_value ->> 'quantityFactor')::numeric, 0) <= 0
      or (component_value ->> 'quantityFactor')::numeric > 1000000 then
      raise exception 'Invalid component quantity factor.';
    end if;

    material_id := nullif(component_value ->> 'materialCatalogId', '')::uuid;
    if component_value ->> 'costType' = 'material' then
      if material_id is null or not exists (
        select 1 from public.material_catalog
        where id = material_id and is_active = true
      ) then raise exception 'The selected material is unavailable.'; end if;
    elsif material_id is not null then
      raise exception 'Only material components can reference catalog products.';
    end if;

    insert into public.estimating_assembly_components (
      company_id, assembly_id, component_key, label, cost_type,
      material_catalog_id, quantity_basis, quantity_factor, unit,
      waste_percent, required, compatibility_group, source_notes, sort_order
    ) values (
      requested_company_id, assembly_record.id,
      component_value ->> 'componentKey', btrim(component_value ->> 'label'),
      component_value ->> 'costType', material_id,
      component_value ->> 'quantityBasis',
      nullif(component_value ->> 'quantityFactor', '')::numeric,
      btrim(component_value ->> 'unit'),
      (component_value ->> 'wastePercent')::numeric,
      coalesce((component_value ->> 'required')::boolean, true),
      nullif(btrim(component_value ->> 'compatibilityGroup'), ''),
      nullif(btrim(component_value ->> 'sourceNotes'), ''),
      (component_value ->> 'sortOrder')::integer
    );
  end loop;

  return jsonb_build_object(
    'id', assembly_record.id,
    'rowRevision', assembly_record.row_revision,
    'status', assembly_record.status
  );
end
$function$;

revoke all on function public.save_estimating_assembly(
  uuid, uuid, uuid, integer, text, text, text, text, text, jsonb
) from public, anon, authenticated;
grant execute on function public.save_estimating_assembly(
  uuid, uuid, uuid, integer, text, text, text, text, text, jsonb
) to service_role;

comment on table public.estimating_assemblies is
  'Company-owned reusable estimating assemblies. Products remain authoritative in material_catalog.';
comment on table public.estimating_assembly_components is
  'Quantity and cost rules for one estimating assembly; material rows reference the existing catalog.';

commit;
