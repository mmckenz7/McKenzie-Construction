begin;

do $audit$
declare
  expected record;
begin
  if to_regclass('public.estimates') is null or not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'estimates'
      and c.relkind = 'r'
  ) then
    raise exception 'Required audited table public.estimates is missing or is not an ordinary table.';
  end if;

  for expected in
    select * from (values
      ('lead_id', 'uuid', false),
      ('status', 'text', true),
      ('calculation_policy_version', 'text', false)
    ) as contract(column_name, sql_type, is_not_null)
  loop
    if not exists (
      select 1
      from pg_attribute a
      where a.attrelid = 'public.estimates'::regclass
        and a.attname = expected.column_name
        and a.attnum > 0
        and not a.attisdropped
        and format_type(a.atttypid, a.atttypmod) = expected.sql_type
        and a.attnotnull = expected.is_not_null
    ) then
      raise exception 'Audited column public.estimates.% differs from required type/nullability contract.', expected.column_name;
    end if;
  end loop;

  if exists (
    select 1
    from public.estimates
    where lead_id is not null
      and status = 'draft'
      and calculation_policy_version = 'structured-estimate-v1'
    group by lead_id
    having count(*) > 1
  ) then
    raise exception 'Cannot enforce structured lead draft uniqueness because duplicate drafts already exist.';
  end if;
end
$audit$;

create unique index estimates_one_structured_draft_per_lead_uidx
  on public.estimates (lead_id)
  where lead_id is not null
    and status = 'draft'
    and calculation_policy_version = 'structured-estimate-v1';

commit;
