begin;

do $audit$
declare
  company_count bigint;
  singleton_company_id uuid;
  access_definition text;
  reporting_assertion_definition text;
  billing_summary_definition text;
  receivables_definition text;
  feature_definition text;
begin
  if to_regclass('public.app_users') is null
    or to_regclass('public.company_settings') is null
    or to_regclass('public.feature_settings') is null then
    raise exception 'Material Catalog access requires app_users, company_settings, and feature_settings.';
  end if;

  if to_regprocedure('public.get_effective_user_access(uuid)') is null
    or to_regprocedure('public.assert_single_company_change_order_reporting_scope()') is null
    or to_regprocedure('public.get_company_change_order_billing_summary(uuid)') is null
    or to_regprocedure('public.get_company_change_order_receivables(uuid)') is null
    or to_regprocedure('public.get_effective_feature_map(text,text)') is null then
    raise exception 'Material Catalog access requires the audited Core access, reporting, and feature functions.';
  end if;

  if not exists (
    select 1
    from pg_attribute
    where attrelid = 'public.app_users'::regclass
      and attname = 'company_id'
      and not attisdropped
      and atttypid = 'uuid'::regtype
      and attnotnull
  ) then
    raise exception 'Material Catalog access requires Core app_users.company_id as NOT NULL uuid.';
  end if;

  if not exists (
    select 1
    from pg_constraint constraint_record
    inner join pg_attribute source_attribute
      on source_attribute.attrelid = constraint_record.conrelid
      and source_attribute.attnum = constraint_record.conkey[1]
    inner join pg_attribute target_attribute
      on target_attribute.attrelid = constraint_record.confrelid
      and target_attribute.attnum = constraint_record.confkey[1]
    where constraint_record.conname = 'app_users_company_id_fkey'
      and constraint_record.contype = 'f'
      and constraint_record.conrelid = 'public.app_users'::regclass
      and constraint_record.confrelid = 'public.company_settings'::regclass
      and array_length(constraint_record.conkey, 1) = 1
      and array_length(constraint_record.confkey, 1) = 1
      and source_attribute.attname = 'company_id'
      and target_attribute.attname = 'id'
      and constraint_record.confdeltype = 'r'
  ) then
    raise exception 'Material Catalog access requires the Core app_users company foreign key with ON DELETE RESTRICT.';
  end if;

  if to_regclass('public.app_users_company_id_idx') is null
    or not exists (
      select 1
      from pg_index index_record
      where index_record.indexrelid = 'public.app_users_company_id_idx'::regclass
        and index_record.indrelid = 'public.app_users'::regclass
        and index_record.indisvalid
        and index_record.indisready
        and index_record.indnkeyatts = 1
        and pg_get_indexdef(index_record.indexrelid, 1, true) = 'company_id'
    ) then
    raise exception 'Material Catalog access requires the valid Core app_users company index.';
  end if;

  select count(*) into company_count from public.company_settings;
  if company_count <> 1 then
    raise exception
      'Material Catalog access requires exactly one company_settings row; found %.',
      company_count;
  end if;

  select id into singleton_company_id from public.company_settings;
  if singleton_company_id is null
    or exists (
      select 1
      from public.app_users
      where company_id is distinct from singleton_company_id
    ) then
    raise exception 'Material Catalog access requires every app_user to match the singleton company.';
  end if;

  select pg_get_functiondef('public.get_effective_user_access(uuid)'::regprocedure)
  into access_definition;
  if access_definition not like '%' || quote_literal('company_id') || '%user_record.company_id%'
    or not exists (
      select 1
      from pg_proc
      where oid = 'public.get_effective_user_access(uuid)'::regprocedure
        and prosecdef
        and pg_get_userbyid(proowner) = 'postgres'
        and array_to_string(proconfig, ',') = 'search_path=pg_catalog, public'
    )
    or not has_function_privilege(
      'service_role',
      'public.get_effective_user_access(uuid)',
      'EXECUTE'
    )
    or has_function_privilege(
      'authenticated',
      'public.get_effective_user_access(uuid)',
      'EXECUTE'
    )
    or has_function_privilege(
      'anon',
      'public.get_effective_user_access(uuid)',
      'EXECUTE'
    )
    or has_function_privilege(
      'public',
      'public.get_effective_user_access(uuid)',
      'EXECUTE'
    ) then
    raise exception 'Material Catalog access requires the fixed-path, service-only Core effective access contract.';
  end if;

  select pg_get_functiondef(
    'public.assert_single_company_change_order_reporting_scope()'::regprocedure
  ) into reporting_assertion_definition;
  select pg_get_functiondef(
    'public.get_company_change_order_billing_summary(uuid)'::regprocedure
  ) into billing_summary_definition;
  select pg_get_functiondef(
    'public.get_company_change_order_receivables(uuid)'::regprocedure
  ) into receivables_definition;

  if reporting_assertion_definition not like '%app_users%company_id%'
    or reporting_assertion_definition not like '%domain_tenant_column_count%'
    or billing_summary_definition not like '%assert_single_company_change_order_reporting_scope%'
    or billing_summary_definition not like '%effective_access ->> ''company_id''%'
    or receivables_definition not like '%assert_single_company_change_order_reporting_scope%'
    or receivables_definition not like '%effective_access ->> ''company_id''%' then
    raise exception 'Material Catalog access requires the Core-compatible singleton reporting contract.';
  end if;

  select pg_get_functiondef('public.get_effective_feature_map(text,text)'::regprocedure)
  into feature_definition;
  if feature_definition not like '%SECURITY DEFINER%'
    or feature_definition not like '%get_feature_settings%'
    or feature_definition not like '%' || quote_literal('change_order_%') || '%'
    or feature_definition like '%' || quote_literal('material_catalog_%') || '%' then
    raise exception 'get_effective_feature_map does not match the audited pre-catalog contract.';
  end if;

end
$audit$;

create or replace function public.get_effective_feature_map(
  requested_scope_type text default 'global'::text,
  requested_scope_id text default 'default'::text
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  with effective_settings as (
    select *
    from public.get_feature_settings(
      requested_scope_type,
      requested_scope_id
    )
  ),

  feature_values as (
    select
      feature_key,

      case
        when feature_key = 'change_orders'
        then is_enabled

        when feature_key like 'change_order_%'
        then
          is_enabled
          and coalesce(
            (
              select parent.is_enabled
              from effective_settings parent
              where parent.feature_key = 'change_orders'
              limit 1
            ),
            true
          )

        when feature_key = 'material_catalog'
        then is_enabled

        when feature_key like 'material_catalog_%'
        then
          is_enabled
          and coalesce(
            (
              select parent.is_enabled
              from effective_settings parent
              where parent.feature_key = 'material_catalog'
              limit 1
            ),
            false
          )

        else is_enabled
      end as effective_enabled

    from effective_settings
  )

  select coalesce(
    jsonb_object_agg(feature_key, effective_enabled),
    '{}'::jsonb
  )
  from feature_values;
$$;

insert into public.feature_settings (
  scope_type,
  scope_id,
  feature_key,
  is_enabled,
  display_name,
  description,
  category,
  sort_order
)
values
  (
    'global',
    'default',
    'material_catalog',
    false,
    'Universal Material Catalog',
    'Canonical products, supplier offers, and read-only supplier comparisons.',
    'operations',
    120
  ),
  (
    'global',
    'default',
    'material_catalog_price_publication',
    false,
    'Material Price Publication',
    'Human-approved publication of supplier price observations.',
    'operations',
    121
  ),
  (
    'global',
    'default',
    'material_catalog_estimate_pricing',
    false,
    'Estimate Catalog Pricing',
    'Explicit application of reviewed catalog pricing to draft estimates.',
    'sales',
    122
  )
on conflict (scope_type, scope_id, feature_key) do nothing;

commit;
