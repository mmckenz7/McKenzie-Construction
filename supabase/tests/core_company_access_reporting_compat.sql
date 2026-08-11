begin;

-- Run only against the disposable local Supabase database after the complete
-- migration chain. Every fixture and schema mutation is rolled back.
do $test$
declare
  singleton_company_id uuid;
  owner_auth_user_id uuid := 'a1000000-0000-4000-8000-000000000001';
  denied_auth_user_id uuid := 'a1000000-0000-4000-8000-000000000002';
  owner_team_member_id uuid := 'a2000000-0000-4000-8000-000000000001';
  denied_team_member_id uuid := 'a2000000-0000-4000-8000-000000000002';
  customer_id uuid := 'a3000000-0000-4000-8000-000000000001';
  project_id uuid := 'a4000000-0000-4000-8000-000000000001';
  invoiced_change_order_id uuid := 'a5000000-0000-4000-8000-000000000001';
  unbilled_change_order_id uuid := 'a5000000-0000-4000-8000-000000000002';
  second_company_id uuid := 'a6000000-0000-4000-8000-000000000001';
  summary_result jsonb;
  receivable_record record;
begin
  select id
  into singleton_company_id
  from public.company_settings;

  if singleton_company_id is null
    or (select count(*) from public.company_settings) <> 1 then
    raise exception 'Core company access regression requires the disposable singleton company.';
  end if;

  if exists (select 1 from public.project_change_orders)
    or exists (select 1 from public.project_change_order_payments) then
    raise exception 'Core company access regression requires an empty disposable reporting fixture set.';
  end if;

  insert into auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  )
  values
    (
      owner_auth_user_id, 'authenticated', 'authenticated',
      'core-owner-fixture@example.test', '', now(),
      '{}'::jsonb, '{}'::jsonb, now(), now()
    ),
    (
      denied_auth_user_id, 'authenticated', 'authenticated',
      'core-denied-fixture@example.test', '', now(),
      '{}'::jsonb, '{}'::jsonb, now(), now()
    );

  insert into public.team_members (
    id, auth_user_id, name, email, roles, status
  )
  values
    (
      owner_team_member_id, owner_auth_user_id,
      'Disposable reporting owner', 'core-owner-fixture@example.test',
      array['owner'], 'active'
    ),
    (
      denied_team_member_id, denied_auth_user_id,
      'Disposable reporting field employee', 'core-denied-fixture@example.test',
      array['field_employee'], 'active'
    );

  insert into public.app_users (
    auth_user_id, company_id, team_member_id, display_name, email,
    role, default_portal, is_active, permissions, metadata
  )
  values
    (
      owner_auth_user_id, singleton_company_id, owner_team_member_id,
      'Disposable reporting owner', 'core-owner-fixture@example.test',
      'owner', 'admin', true, '{}'::jsonb,
      '{"disposable_test_fixture":true}'::jsonb
    ),
    (
      denied_auth_user_id, singleton_company_id, denied_team_member_id,
      'Disposable reporting field employee', 'core-denied-fixture@example.test',
      'field_employee', 'operations', true, '{}'::jsonb,
      '{"disposable_test_fixture":true}'::jsonb
    );

  insert into public.customers (
    id, customer_name, status
  ) values (
    customer_id, 'Disposable reporting customer', 'active'
  );

  insert into public.projects (
    id, customer_id, project_name, status
  ) values (
    project_id, customer_id, 'Disposable reporting project', 'planning'
  );

  insert into public.project_change_orders (
    id, project_id, change_order_number, title, description, status,
    amount, billing_status, invoice_number, invoiced_at, invoice_due_date
  )
  values
    (
      invoiced_change_order_id, project_id, 1, 'Invoiced fixture',
      'Exact reporting regression fixture', 'approved',
      1000.00, 'partially_paid', 'TEST-1', now(), current_date - 1
    ),
    (
      unbilled_change_order_id, project_id, 2, 'Unbilled fixture',
      'Exact reporting regression fixture', 'approved',
      500.00, 'not_billed', null, null, null
    );

  insert into public.project_change_order_payments (
    change_order_id, amount, payment_date
  ) values (
    invoiced_change_order_id, 250.00, current_date
  );

  summary_result :=
    public.get_company_change_order_billing_summary(owner_auth_user_id);

  if summary_result is distinct from jsonb_build_object(
    'approved_amount', 1500.00,
    'invoiced_amount', 1000.00,
    'collected_amount', 250.00,
    'balance_due', 750.00,
    'not_billed_amount', 500.00,
    'overdue_amount', 750.00,
    'invoice_count', 1,
    'unpaid_invoice_count', 1,
    'paid_invoice_count', 0,
    'overdue_invoice_count', 1,
    'not_billed_count', 1,
    'collection_percent', 25.0
  ) then
    raise exception 'Billing summary did not match exact fixture totals: %.', summary_result;
  end if;

  select *
  into receivable_record
  from public.get_company_change_order_receivables(owner_auth_user_id);

  if receivable_record.change_order_id is distinct from invoiced_change_order_id
    or receivable_record.project_id is distinct from project_id
    or receivable_record.change_order_number is distinct from 1
    or receivable_record.amount is distinct from 1000.00
    or receivable_record.amount_paid is distinct from 250.00
    or receivable_record.balance_due is distinct from 750.00
    or receivable_record.is_overdue is distinct from true
    or receivable_record.days_overdue is distinct from 1 then
    raise exception 'Receivable did not match exact fixture values.';
  end if;

  if (
    select count(*)
    from public.get_company_change_order_receivables(owner_auth_user_id)
  ) <> 1 then
    raise exception 'Receivables must contain exactly one fixture row.';
  end if;

  begin
    perform public.get_company_change_order_billing_summary(denied_auth_user_id);
    raise exception 'No-view-costs billing summary must be denied.';
  exception
    when sqlstate '42501' then
      null;
  end;

  begin
    perform *
    from public.get_company_change_order_receivables(denied_auth_user_id);
    raise exception 'No-view-costs receivables must be denied.';
  exception
    when sqlstate '42501' then
      null;
  end;

  -- The current schema structurally enforces one company. Temporarily remove
  -- that disposable-database constraint to simulate future schema drift and
  -- prove both reports retain an independent fail-closed runtime guard.
  drop index public.company_settings_single_row;

  insert into public.company_settings (id, company_name)
  values (second_company_id, 'Disposable second-company guard fixture');

  begin
    perform public.get_company_change_order_billing_summary(owner_auth_user_id);
    raise exception 'Second company must fail closed for billing summary.';
  exception
    when sqlstate '55000' then
      null;
  end;

  begin
    perform *
    from public.get_company_change_order_receivables(owner_auth_user_id);
    raise exception 'Second company must fail closed for receivables.';
  exception
    when sqlstate '55000' then
      null;
  end;

  delete from public.company_settings
  where id = second_company_id;

  create unique index company_settings_single_row
    on public.company_settings ((true));

  -- Mismatched membership is structurally prevented before a reporting call:
  -- NOT NULL rejects no company and the FK rejects an unknown company.
  begin
    update public.app_users
    set company_id = null
    where auth_user_id = owner_auth_user_id;
    raise exception 'NOT NULL must reject missing app_user company.';
  exception
    when not_null_violation then
      null;
  end;

  begin
    update public.app_users
    set company_id = gen_random_uuid()
    where auth_user_id = owner_auth_user_id;
    raise exception 'Foreign key must reject mismatched app_user company.';
  exception
    when foreign_key_violation then
      null;
  end;

  alter table public.projects
    add column company_id uuid;

  begin
    perform public.get_company_change_order_billing_summary(owner_auth_user_id);
    raise exception 'Unexpected reporting domain ownership must fail closed for billing summary.';
  exception
    when sqlstate '55000' then
      null;
  end;

  begin
    perform *
    from public.get_company_change_order_receivables(owner_auth_user_id);
    raise exception 'Unexpected reporting domain ownership must fail closed for receivables.';
  exception
    when sqlstate '55000' then
      null;
  end;
end
$test$;

do $privileges$
declare
  function_signature text;
begin
  foreach function_signature in array array[
    'public.get_effective_user_access(uuid)',
    'public.assert_single_company_change_order_reporting_scope()',
    'public.get_company_change_order_billing_summary(uuid)',
    'public.get_company_change_order_receivables(uuid)'
  ]
  loop
    if not has_function_privilege('service_role', function_signature, 'EXECUTE') then
      raise exception 'service_role requires execute on %.', function_signature;
    end if;

    if has_function_privilege('authenticated', function_signature, 'EXECUTE')
      or has_function_privilege('anon', function_signature, 'EXECUTE')
      or has_function_privilege('public', function_signature, 'EXECUTE') then
      raise exception 'Browser and PUBLIC roles must not execute %.', function_signature;
    end if;
  end loop;

  if not exists (
    select 1
    from pg_proc
    where oid = 'public.get_effective_user_access(uuid)'::regprocedure
      and prosecdef
      and pg_get_userbyid(proowner) = 'postgres'
      and array_to_string(proconfig, ',') = 'search_path=pg_catalog, public'
  ) then
    raise exception 'Effective access must be postgres-owned SECURITY DEFINER with a fixed path.';
  end if;

  if exists (
    select 1
    from pg_proc
    where oid in (
      'public.assert_single_company_change_order_reporting_scope()'::regprocedure,
      'public.get_company_change_order_billing_summary(uuid)'::regprocedure,
      'public.get_company_change_order_receivables(uuid)'::regprocedure
    )
      and (
        prosecdef
        or pg_get_userbyid(proowner) <> 'postgres'
        or array_to_string(proconfig, ',') <> 'search_path=pg_catalog, public'
      )
  ) then
    raise exception 'Reporting functions must be postgres-owned SECURITY INVOKER with a fixed path.';
  end if;

  if has_table_privilege('authenticated', 'public.app_users', 'INSERT')
    or has_table_privilege('authenticated', 'public.app_users', 'UPDATE')
    or has_table_privilege('authenticated', 'public.app_users', 'DELETE')
    or has_table_privilege('anon', 'public.app_users', 'INSERT')
    or has_table_privilege('anon', 'public.app_users', 'UPDATE')
    or has_table_privilege('anon', 'public.app_users', 'DELETE') then
    raise exception 'Browser roles must not mutate app_users or company membership.';
  end if;

  if not has_table_privilege('service_role', 'public.app_users', 'UPDATE') then
    raise exception 'service_role must retain app_user provisioning authority.';
  end if;
end
$privileges$;

rollback;
