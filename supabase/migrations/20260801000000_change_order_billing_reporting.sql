begin;

do $diagnostic$
declare
  mismatch_count integer;
begin
  with payment_totals as (
    select
      payment.change_order_id,
      coalesce(sum(payment.amount), 0) as ledger_amount_paid
    from public.project_change_order_payments as payment
    group by payment.change_order_id
  )
  select count(*)
  into mismatch_count
  from public.project_change_orders as change_order
  left join payment_totals as payment_total
    on payment_total.change_order_id = change_order.id
  where coalesce(change_order.amount_paid, 0)
    is distinct from coalesce(payment_total.ledger_amount_paid, 0);

  if mismatch_count > 0 then
    raise exception
      'Payment reconciliation failed for % change order(s). Review cached amount_paid against the payment ledger before applying this migration.',
      mismatch_count
      using errcode = '23514';
  end if;
end;
$diagnostic$;

alter table public.project_change_orders
  add column if not exists invoice_due_date date;

alter table public.company_settings
  add column if not exists default_invoice_payment_terms_days integer
  not null default 15;

do $constraints$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conname = 'mckenzie_20260801_invoice_payment_terms_days_check'
      and conrelid = 'public.company_settings'::regclass
  ) then
    alter table public.company_settings
      add constraint mckenzie_20260801_invoice_payment_terms_days_check
      check (default_invoice_payment_terms_days between 0 and 365);
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conname = 'mckenzie_20260801_change_order_billing_status_check'
      and conrelid = 'public.project_change_orders'::regclass
  ) then
    alter table public.project_change_orders
      add constraint mckenzie_20260801_change_order_billing_status_check
      check (
        billing_status in (
          'not_billed',
          'invoiced',
          'partially_paid',
          'paid',
          'void'
        )
      );
  end if;
end;
$constraints$;

comment on column public.project_change_orders.invoice_due_date is
  'Optional contractual due date. A null value means overdue state is unknown and must not be inferred.';

comment on column public.company_settings.default_invoice_payment_terms_days is
  'Calendar days after invoiced_at used when an issued invoice has no explicit due-date override.';

create or replace function public.set_change_order_invoice_due_date_20260801()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $function$
declare
  payment_terms_days integer;
begin
  if new.invoice_due_date is not null then
    return new;
  end if;

  if new.invoiced_at is null then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.invoiced_at is not null then
    return new;
  end if;

  select company.default_invoice_payment_terms_days
  into strict payment_terms_days
  from public.company_settings as company;

  new.invoice_due_date := new.invoiced_at::date + payment_terms_days;
  return new;
exception
  when no_data_found or too_many_rows then
    raise exception
      'Exactly one company_settings row is required to default an invoice due date.'
      using errcode = '55000';
end;
$function$;

do $trigger$
begin
  if not exists (
    select 1
    from pg_catalog.pg_trigger
    where tgname = 'set_change_order_invoice_due_date_20260801'
      and tgrelid = 'public.project_change_orders'::regclass
      and not tgisinternal
  ) then
    create trigger set_change_order_invoice_due_date_20260801
    before insert or update of invoiced_at, invoice_due_date
    on public.project_change_orders
    for each row
    execute function public.set_change_order_invoice_due_date_20260801();
  end if;
end;
$trigger$;

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
  company_count integer;
  tenant_column_count integer;
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

  select count(*)
  into company_count
  from public.company_settings;

  if company_count <> 1 then
    raise exception
      'Change-order company reporting requires exactly one company_settings row; tenant ownership columns are required before enabling multiple companies.'
      using errcode = '55000';
  end if;

  select count(*)
  into tenant_column_count
  from information_schema.columns
  where table_schema = 'public'
    and table_name in (
      'app_users',
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

  if tenant_column_count <> 0 then
    raise exception
      'Tenant ownership columns now exist; replace singleton company reporting before using this function.'
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
  company_count integer;
  tenant_column_count integer;
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

  select count(*)
  into company_count
  from public.company_settings;

  if company_count <> 1 then
    raise exception
      'Change-order company reporting requires exactly one company_settings row; tenant ownership columns are required before enabling multiple companies.'
      using errcode = '55000';
  end if;

  select count(*)
  into tenant_column_count
  from information_schema.columns
  where table_schema = 'public'
    and table_name in (
      'app_users',
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

  if tenant_column_count <> 0 then
    raise exception
      'Tenant ownership columns now exist; replace singleton company reporting before using this function.'
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

revoke all on function public.set_change_order_invoice_due_date_20260801()
  from public, anon, authenticated;

commit;
