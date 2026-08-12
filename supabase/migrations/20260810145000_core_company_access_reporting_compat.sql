begin;

do $audit$
declare
  company_count bigint;
  access_definition text;
  billing_summary_definition text;
  receivables_definition text;
begin
  if to_regclass('public.app_users') is null
    or to_regclass('public.company_settings') is null
    or to_regclass('public.team_members') is null
    or to_regclass('public.customers') is null
    or to_regclass('public.projects') is null
    or to_regclass('public.project_change_orders') is null
    or to_regclass('public.project_change_order_payments') is null then
    raise exception 'Core company access requires the audited user, company, and change-order reporting tables.';
  end if;

  if exists (
    select 1
    from pg_attribute
    where attrelid = 'public.app_users'::regclass
      and attname = 'company_id'
      and not attisdropped
  ) then
    raise exception 'Core company access expected app_users.company_id to be absent.';
  end if;

  if to_regprocedure('public.get_effective_user_access(uuid)') is null
    or to_regprocedure('public.get_company_change_order_billing_summary(uuid)') is null
    or to_regprocedure('public.get_company_change_order_receivables(uuid)') is null then
    raise exception 'Core company access requires the audited access and reporting functions.';
  end if;

  select pg_get_functiondef('public.get_effective_user_access(uuid)'::regprocedure)
  into access_definition;

  if access_definition not like '%SECURITY DEFINER%'
    or access_definition not like '%user_record public.app_users%'
    or access_definition not like '%' || quote_literal('permissions') || '%'
    or access_definition like '%' || quote_literal('company_id') || '%' then
    raise exception 'get_effective_user_access does not match the audited pre-company contract.';
  end if;

  select pg_get_functiondef(
    'public.get_company_change_order_billing_summary(uuid)'::regprocedure
  )
  into billing_summary_definition;

  select pg_get_functiondef(
    'public.get_company_change_order_receivables(uuid)'::regprocedure
  )
  into receivables_definition;

  if billing_summary_definition not like '%tenant_column_count%'
    or billing_summary_definition not like '%' || quote_literal('app_users') || '%'
    or billing_summary_definition not like '%get_effective_user_access%'
    or billing_summary_definition not like '%' || quote_literal('view_costs') || '%'
    or billing_summary_definition not like '%project_change_order_payments%'
    or billing_summary_definition not like '%superseded_by_change_order_id is null%' then
    raise exception 'Change-order billing summary does not match the audited singleton reporting contract.';
  end if;

  if receivables_definition not like '%tenant_column_count%'
    or receivables_definition not like '%' || quote_literal('app_users') || '%'
    or receivables_definition not like '%get_effective_user_access%'
    or receivables_definition not like '%' || quote_literal('view_costs') || '%'
    or receivables_definition not like '%project_change_order_payments%'
    or receivables_definition not like '%superseded_by_change_order_id is null%'
    or receivables_definition not like '%invoice_due_date asc nulls last%' then
    raise exception 'Change-order receivables does not match the audited singleton reporting contract.';
  end if;

  select count(*)
  into company_count
  from public.company_settings;

  if company_count <> 1 then
    raise exception
      'Core company access backfill requires exactly one company_settings row; found %.',
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
  'Authoritative company tenant for server-side access resolution. V0 supports exactly one company and does not provide multi-company membership.';

revoke insert, update, delete on table public.app_users
from public, anon, authenticated;

create or replace function public.get_effective_user_access(
  requested_auth_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
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

create or replace function public.assert_single_company_change_order_reporting_scope()
returns uuid
language plpgsql
security invoker
set search_path = pg_catalog, public
as $function$
declare
  resolved_company_id uuid;
  company_count integer;
  app_user_alias_column_count integer;
  domain_tenant_column_count integer;
begin
  select count(*)
  into company_count
  from public.company_settings;

  if company_count <> 1 then
    raise exception
      'Change-order company reporting requires exactly one company_settings row.'
      using errcode = '55000';
  end if;

  select id
  into resolved_company_id
  from public.company_settings;

  if resolved_company_id is null
    or exists (
      select 1
      from public.app_users
      where company_id is distinct from resolved_company_id
    ) then
    raise exception
      'Change-order company reporting requires every application user to match the singleton company.'
      using errcode = '55000';
  end if;

  select count(*)
  into app_user_alias_column_count
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'app_users'
    and column_name in (
      'tenant_id',
      'workspace_id',
      'organization_id'
    );

  if app_user_alias_column_count <> 0 then
    raise exception
      'app_users.company_id is the only approved transitional company ownership field.'
      using errcode = '55000';
  end if;

  select count(*)
  into domain_tenant_column_count
  from information_schema.columns
  where table_schema = 'public'
    and table_name in (
      'team_members',
      'customers',
      'projects',
      'project_change_orders',
      'project_change_order_payments'
    )
    and column_name in (
      'company_id',
      'tenant_id',
      'workspace_id',
      'organization_id'
    );

  if domain_tenant_column_count <> 0 then
    raise exception
      'Change-order reporting domain ownership has changed; replace singleton reporting before using this function.'
      using errcode = '55000';
  end if;

  return resolved_company_id;
end;
$function$;

revoke all on function public.assert_single_company_change_order_reporting_scope()
from public, anon, authenticated;
grant execute on function public.assert_single_company_change_order_reporting_scope()
to service_role;

comment on function public.assert_single_company_change_order_reporting_scope() is
  'Fail-closed V0 assertion only. It permits app_users.company_id but does not make unscoped change-order reports tenant-filtered or multi-company safe.';

create or replace function public.get_company_change_order_billing_summary(
  requested_auth_user_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $function$
declare
  effective_access jsonb;
  resolved_company_id uuid;
  result jsonb;
begin
  if requested_auth_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.app_users as app_user
    inner join public.team_members as team_member
      on team_member.id = app_user.team_member_id
      or team_member.auth_user_id = app_user.auth_user_id
    where app_user.auth_user_id = requested_auth_user_id
      and app_user.is_active = true
      and team_member.status = 'active'
  ) then
    raise exception 'An active employee account is required.' using errcode = '42501';
  end if;

  effective_access := to_jsonb(
    public.get_effective_user_access(requested_auth_user_id)
  );

  if jsonb_typeof(effective_access -> 'portal_access' -> 'operations')
      is distinct from 'boolean'
    or effective_access -> 'portal_access' -> 'operations'
      is distinct from 'true'::jsonb then
    raise exception 'Operations workspace access is required.' using errcode = '42501';
  end if;

  if coalesce(effective_access ->> 'role', '') not in (
      'owner',
      'administrator'
    )
    and (
      jsonb_typeof(effective_access -> 'permissions' -> 'view_costs')
        is distinct from 'boolean'
      or effective_access -> 'permissions' -> 'view_costs'
        is distinct from 'true'::jsonb
    ) then
    raise exception
      'Owner, administrator, or view_costs permission is required for financial reporting.'
      using errcode = '42501';
  end if;

  resolved_company_id :=
    public.assert_single_company_change_order_reporting_scope();

  if effective_access ->> 'company_id'
      is distinct from resolved_company_id::text then
    raise exception
      'Application user company access does not match the singleton reporting scope.'
      using errcode = '55000';
  end if;

  with payment_totals as (
    select
      payment.change_order_id,
      coalesce(sum(payment.amount), 0) as amount_paid
    from public.project_change_order_payments as payment
    group by payment.change_order_id
  ), eligible_change_orders as (
    select
      change_order.amount,
      coalesce(payment_total.amount_paid, 0) as amount_paid,
      change_order.invoice_due_date,
      change_order.invoiced_at is not null as is_billed
    from public.project_change_orders as change_order
    left join payment_totals as payment_total
      on payment_total.change_order_id = change_order.id
    where change_order.superseded_by_change_order_id is null
      and change_order.status in ('approved', 'in_progress', 'completed')
      and change_order.billing_status is distinct from 'void'
  ), normalized as (
    select
      greatest(coalesce(amount, 0), 0) as amount,
      greatest(coalesce(amount_paid, 0), 0) as amount_paid,
      greatest(coalesce(amount, 0) - coalesce(amount_paid, 0), 0) as balance_due,
      invoice_due_date,
      is_billed
    from eligible_change_orders
  )
  select jsonb_build_object(
    'approved_amount', coalesce(sum(amount), 0),
    'invoiced_amount', coalesce(sum(amount) filter (where is_billed), 0),
    'collected_amount', coalesce(sum(amount_paid) filter (where is_billed), 0),
    'balance_due', coalesce(sum(balance_due) filter (where is_billed), 0),
    'not_billed_amount', coalesce(sum(amount) filter (where not is_billed), 0),
    'overdue_amount', coalesce(sum(balance_due) filter (
      where is_billed
        and balance_due > 0
        and invoice_due_date < current_date
    ), 0),
    'invoice_count', count(*) filter (where is_billed),
    'unpaid_invoice_count', count(*) filter (where is_billed and balance_due > 0),
    'paid_invoice_count', count(*) filter (where is_billed and balance_due = 0),
    'overdue_invoice_count', count(*) filter (
      where is_billed
        and balance_due > 0
        and invoice_due_date < current_date
    ),
    'not_billed_count', count(*) filter (where not is_billed),
    'collection_percent', case
      when coalesce(sum(amount) filter (where is_billed), 0) > 0
      then round(
        coalesce(sum(amount_paid) filter (where is_billed), 0)
        / (sum(amount) filter (where is_billed))
        * 100,
        1
      )
      else 0
    end
  )
  into result
  from normalized;

  return result;
end;
$function$;

create or replace function public.get_company_change_order_receivables(
  requested_auth_user_id uuid
)
returns table (
  change_order_id uuid,
  project_id uuid,
  change_order_number integer,
  title text,
  status text,
  billing_status text,
  invoice_number text,
  invoiced_at timestamptz,
  invoice_due_date date,
  amount numeric,
  amount_paid numeric,
  balance_due numeric,
  is_overdue boolean,
  days_overdue integer
)
language plpgsql
security invoker
set search_path = pg_catalog, public
as $function$
declare
  effective_access jsonb;
  resolved_company_id uuid;
begin
  if requested_auth_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.app_users as app_user
    inner join public.team_members as team_member
      on team_member.id = app_user.team_member_id
      or team_member.auth_user_id = app_user.auth_user_id
    where app_user.auth_user_id = requested_auth_user_id
      and app_user.is_active = true
      and team_member.status = 'active'
  ) then
    raise exception 'An active employee account is required.' using errcode = '42501';
  end if;

  effective_access := to_jsonb(
    public.get_effective_user_access(requested_auth_user_id)
  );

  if jsonb_typeof(effective_access -> 'portal_access' -> 'operations')
      is distinct from 'boolean'
    or effective_access -> 'portal_access' -> 'operations'
      is distinct from 'true'::jsonb then
    raise exception 'Operations workspace access is required.' using errcode = '42501';
  end if;

  if coalesce(effective_access ->> 'role', '') not in (
      'owner',
      'administrator'
    )
    and (
      jsonb_typeof(effective_access -> 'permissions' -> 'view_costs')
        is distinct from 'boolean'
      or effective_access -> 'permissions' -> 'view_costs'
        is distinct from 'true'::jsonb
    ) then
    raise exception
      'Owner, administrator, or view_costs permission is required for financial reporting.'
      using errcode = '42501';
  end if;

  resolved_company_id :=
    public.assert_single_company_change_order_reporting_scope();

  if effective_access ->> 'company_id'
      is distinct from resolved_company_id::text then
    raise exception
      'Application user company access does not match the singleton reporting scope.'
      using errcode = '55000';
  end if;

  return query
  with payment_totals as (
    select
      payment.change_order_id,
      coalesce(sum(payment.amount), 0) as amount_paid
    from public.project_change_order_payments as payment
    group by payment.change_order_id
  )
  select
    change_order.id,
    change_order.project_id,
    change_order.change_order_number,
    change_order.title,
    change_order.status,
    change_order.billing_status,
    change_order.invoice_number,
    change_order.invoiced_at,
    change_order.invoice_due_date,
    greatest(coalesce(change_order.amount, 0), 0),
    greatest(coalesce(payment_total.amount_paid, 0), 0),
    greatest(
      coalesce(change_order.amount, 0) - coalesce(payment_total.amount_paid, 0),
      0
    ),
    coalesce(change_order.invoice_due_date < current_date, false),
    case
      when change_order.invoice_due_date < current_date
      then current_date - change_order.invoice_due_date
      else null
    end
  from public.project_change_orders as change_order
  left join payment_totals as payment_total
    on payment_total.change_order_id = change_order.id
  where change_order.superseded_by_change_order_id is null
    and change_order.status in ('approved', 'in_progress', 'completed')
    and change_order.billing_status is distinct from 'void'
    and change_order.invoiced_at is not null
    and greatest(
      coalesce(change_order.amount, 0) - coalesce(payment_total.amount_paid, 0),
      0
    ) > 0
  order by
    change_order.invoice_due_date asc nulls last,
    change_order.invoiced_at asc nulls last,
    change_order.change_order_number asc;
end;
$function$;

revoke all on function public.get_company_change_order_billing_summary(uuid)
  from public, anon, authenticated;
revoke all on function public.get_company_change_order_receivables(uuid)
  from public, anon, authenticated;

grant execute on function public.get_company_change_order_billing_summary(uuid)
  to service_role;
grant execute on function public.get_company_change_order_receivables(uuid)
  to service_role;

comment on function public.get_company_change_order_billing_summary(uuid) is
  'Singleton-company V0 report. It is intentionally unscoped and must fail closed when company or domain ownership assumptions change.';
comment on function public.get_company_change_order_receivables(uuid) is
  'Singleton-company V0 report. It is intentionally unscoped and must fail closed when company or domain ownership assumptions change.';

commit;
