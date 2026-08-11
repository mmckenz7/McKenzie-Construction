begin;

do $audit$
declare
  company_count bigint;
  access_definition text;
  feature_definition text;
begin
  if to_regclass('public.app_users') is null
    or to_regclass('public.company_settings') is null
    or to_regclass('public.feature_settings') is null then
    raise exception 'Material Catalog access requires app_users, company_settings, and feature_settings.';
  end if;

  if exists (
    select 1
    from pg_attribute
    where attrelid = 'public.app_users'::regclass
      and attname = 'company_id'
      and not attisdropped
  ) then
    raise exception 'Material Catalog access expected app_users.company_id to be absent.';
  end if;

  if to_regprocedure('public.get_effective_user_access(uuid)') is null
    or to_regprocedure('public.get_effective_feature_map(text,text)') is null then
    raise exception 'Material Catalog access requires the audited access and feature functions.';
  end if;

  select pg_get_functiondef('public.get_effective_user_access(uuid)'::regprocedure)
  into access_definition;
  if access_definition not like '%SECURITY DEFINER%'
    or access_definition not like '%user_record public.app_users%'
    or access_definition not like '%' || quote_literal('permissions') || '%'
    or access_definition like '%' || quote_literal('company_id') || '%' then
    raise exception 'get_effective_user_access does not match the audited pre-company contract.';
  end if;

  select pg_get_functiondef('public.get_effective_feature_map(text,text)'::regprocedure)
  into feature_definition;
  if feature_definition not like '%SECURITY DEFINER%'
    or feature_definition not like '%get_feature_settings%'
    or feature_definition not like '%' || quote_literal('change_order_%') || '%'
    or feature_definition like '%' || quote_literal('material_catalog_%') || '%' then
    raise exception 'get_effective_feature_map does not match the audited pre-catalog contract.';
  end if;

  select count(*) into company_count from public.company_settings;
  if company_count <> 1 then
    raise exception
      'Material Catalog company backfill requires exactly one company_settings row; found %.',
      company_count;
  end if;
end
$audit$;

alter table public.app_users
  add column company_id uuid;

update public.app_users
set company_id = (
  select id
  from public.company_settings
);

alter table public.app_users
  alter column company_id set not null,
  add constraint app_users_company_id_fkey
    foreign key (company_id)
    references public.company_settings(id)
    on delete restrict;

create index app_users_company_id_idx
  on public.app_users(company_id);

comment on column public.app_users.company_id is
  'Authoritative company tenant for server-side access resolution. Never infer tenant scope from request input.';

create or replace function public.get_effective_user_access(
  requested_auth_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  user_record public.app_users;
  role_record public.role_permission_defaults;
begin
  select *
  into user_record
  from public.app_users
  where auth_user_id = requested_auth_user_id
    and is_active = true;

  if user_record.id is null then
    return null;
  end if;

  select *
  into role_record
  from public.role_permission_defaults
  where role = user_record.role;

  return jsonb_build_object(
    'user_id', user_record.id,
    'auth_user_id', user_record.auth_user_id,
    'company_id', user_record.company_id,
    'team_member_id', user_record.team_member_id,
    'display_name', user_record.display_name,
    'email', user_record.email,
    'phone', user_record.phone,
    'role', user_record.role,
    'default_portal', user_record.default_portal,
    'preferred_language', user_record.preferred_language,
    'portal_access',
      coalesce(role_record.portal_access, '{}'::jsonb),
    'permissions',
      coalesce(role_record.permissions, '{}'::jsonb)
      || coalesce(user_record.permissions, '{}'::jsonb)
  );
end;
$$;

revoke all on function public.get_effective_user_access(uuid)
from public, anon, authenticated;
grant execute on function public.get_effective_user_access(uuid)
to service_role;

create or replace function public.get_effective_feature_map(
  requested_scope_type text default 'global'::text,
  requested_scope_id text default 'default'::text
)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
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
