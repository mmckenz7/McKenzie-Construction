begin;

do $audit$
declare
  function_signature text;
  function_oid oid;
  function_definition text;
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.estimates'::regclass
      and conname = 'estimates_structured_policy_version'
  ) or not exists (
    select 1 from pg_constraint
    where conrelid = 'public.estimates'::regclass
      and conname = 'estimates_structured_contract'
  ) then
    raise exception 'The audited structured estimate policy constraints are missing.';
  end if;

  if to_regclass('public.estimates_one_structured_draft_per_lead_uidx') is null then
    raise exception 'The audited structured lead-draft invariant is missing.';
  end if;

  foreach function_signature in array array[
    'public.create_structured_estimate_section(uuid,integer,uuid,text,text,text,integer)',
    'public.update_structured_estimate_section(uuid,integer,uuid,text,text,text,integer)',
    'public.delete_structured_estimate_section(uuid,integer,uuid)',
    'public.create_structured_estimate_item(uuid,integer,uuid,jsonb,jsonb,jsonb)',
    'public.update_structured_estimate_item(uuid,integer,uuid,jsonb,jsonb,jsonb)',
    'public.delete_structured_estimate_item(uuid,integer,uuid,jsonb,jsonb)'
  ]::text[] loop
    function_oid := to_regprocedure(function_signature);
    if function_oid is null then
      raise exception 'The audited % function signature is missing.', function_signature;
    end if;
    function_definition := pg_get_functiondef(function_oid);

    if function_definition is null
      or function_definition not like '%current_policy is distinct from ''structured-estimate-v1''%'
      or function_definition like '%structured-estimate-v2-material-tax%' then
      raise exception 'The audited % policy guard has changed.', function_signature;
    end if;
  end loop;

  function_oid := to_regprocedure(
    'public.persist_structured_estimate_outputs(uuid,integer,jsonb,jsonb)'
  );
  if function_oid is null then
    raise exception 'The audited estimate calculation persistence helper signature is missing.';
  end if;
  function_definition := pg_get_functiondef(function_oid);

  if function_definition is null
    or function_definition not like '%row_count integer;%'
    or function_definition not like '%begin%if jsonb_typeof(requested_item_calculations)%'
    or function_definition like '%current_policy text;%'
    or function_definition like '%calculation_policy_version%requested_estimate_calculation%' then
    raise exception 'The audited estimate calculation persistence helper has changed.';
  end if;
end
$audit$;

alter table public.estimates
  drop constraint estimates_structured_policy_version,
  drop constraint estimates_structured_contract;

alter table public.estimates
  add constraint estimates_structured_policy_version check (
    calculation_policy_version is null
    or calculation_policy_version in (
      'structured-estimate-v1',
      'structured-estimate-v2-material-tax'
    )
  ) not valid,
  add constraint estimates_structured_contract check (
    calculation_policy_version not in (
      'structured-estimate-v1',
      'structured-estimate-v2-material-tax'
    ) or (
      overhead_percent is not null
      and profit_markup_percent is not null
      and tax_rate_percent is not null
      and discount_type = 'fixed_amount'
      and discount_value is not null
      and calculation_revision is not null
      and costs_complete is not null
      and prices_complete is not null
    )
  ) not valid;

alter table public.estimates
  validate constraint estimates_structured_policy_version,
  validate constraint estimates_structured_contract;

do $draft_invariant$
begin
  if exists (
    select lead_id
    from public.estimates
    where lead_id is not null
      and status = 'draft'
      and calculation_policy_version in (
        'structured-estimate-v1',
        'structured-estimate-v2-material-tax'
      )
    group by lead_id
    having count(*) > 1
  ) then
    raise exception 'Duplicate structured lead drafts block the policy migration.';
  end if;
end
$draft_invariant$;

drop index public.estimates_one_structured_draft_per_lead_uidx;
create unique index estimates_one_structured_draft_per_lead_uidx
  on public.estimates (lead_id)
  where lead_id is not null
    and status = 'draft'
    and calculation_policy_version in (
      'structured-estimate-v1',
      'structured-estimate-v2-material-tax'
    );

do $replace_policy_guards$
declare
  function_signature text;
  function_oid oid;
  function_definition text;
  replaced_definition text;
begin
  foreach function_signature in array array[
    'public.create_structured_estimate_section(uuid,integer,uuid,text,text,text,integer)',
    'public.update_structured_estimate_section(uuid,integer,uuid,text,text,text,integer)',
    'public.delete_structured_estimate_section(uuid,integer,uuid)',
    'public.create_structured_estimate_item(uuid,integer,uuid,jsonb,jsonb,jsonb)',
    'public.update_structured_estimate_item(uuid,integer,uuid,jsonb,jsonb,jsonb)',
    'public.delete_structured_estimate_item(uuid,integer,uuid,jsonb,jsonb)'
  ]::text[] loop
    function_oid := to_regprocedure(function_signature);
    if function_oid is null then
      raise exception 'The % function signature is missing.', function_signature;
    end if;
    function_definition := pg_get_functiondef(function_oid);

    replaced_definition := replace(
      function_definition,
      'current_policy is distinct from ''structured-estimate-v1''',
      '(current_policy is null or current_policy not in (''structured-estimate-v1'', ''structured-estimate-v2-material-tax''))'
    );
    if replaced_definition = function_definition then
      raise exception 'The % policy guard was not replaced.', function_signature;
    end if;
    execute replaced_definition;
  end loop;
end
$replace_policy_guards$;

do $replace_bundle_policy_guard$
declare
  function_oid oid;
  function_definition text;
  replaced_definition text;
begin
  function_oid := to_regprocedure(
    'public.persist_structured_estimate_outputs(uuid,integer,jsonb,jsonb)'
  );
  if function_oid is null then
    raise exception 'The estimate calculation persistence helper signature is missing.';
  end if;
  function_definition := pg_get_functiondef(function_oid);

  replaced_definition := replace(
    function_definition,
    '  row_count integer;',
    E'  row_count integer;\n  current_policy text;'
  );
  replaced_definition := replace(
    replaced_definition,
    E'begin\n  if jsonb_typeof(requested_item_calculations)',
    E'begin\n  select calculation_policy_version into current_policy\n  from public.estimates\n  where id = requested_estimate_id;\n\n  if current_policy is null\n    or current_policy not in (''structured-estimate-v1'', ''structured-estimate-v2-material-tax'')\n    or current_policy is distinct from requested_estimate_calculation ->> ''calculation_policy_version'' then\n    raise exception using errcode = ''P0001'', message = ''invalid_calculation'';\n  end if;\n\n  if jsonb_typeof(requested_item_calculations)'
  );

  if replaced_definition = function_definition
    or replaced_definition not like '%current_policy text;%'
    or replaced_definition not like '%current_policy is distinct from requested_estimate_calculation ->> ''calculation_policy_version''%' then
    raise exception 'The estimate calculation bundle policy guard was not replaced.';
  end if;
  execute replaced_definition;
end
$replace_bundle_policy_guard$;

comment on column public.estimates.calculation_policy_version is
  'Immutable calculation policy identity. structured-estimate-v1 applies customer sales tax; structured-estimate-v2-material-tax applies contractor material tax as direct cost.';
comment on column public.estimates.tax_rate_percent is
  'Policy-qualified tax-rate snapshot: customer sales tax in structured-estimate-v1 and contractor material tax in structured-estimate-v2-material-tax.';
comment on column public.estimates.tax_amount is
  'Policy-qualified calculated tax output: customer sales tax in structured-estimate-v1 and contractor material tax in structured-estimate-v2-material-tax.';

commit;
