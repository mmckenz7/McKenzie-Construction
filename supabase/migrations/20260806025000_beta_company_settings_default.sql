begin;

insert into public.company_settings (
  company_name,
  company_phone,
  company_email,
  website_url
)
select
  'McKenzie Construction',
  '865-263-3811',
  'info@mckenzie-builds.com',
  'https://www.mckenzie-builds.com'
where not exists (
  select 1
  from public.company_settings
);

do $$
declare
  settings_count bigint;
begin
  select count(*)
  into settings_count
  from public.company_settings;

  if settings_count <> 1 then
    raise exception
      'Exactly one company_settings row is required; found %.',
      settings_count;
  end if;
end
$$;

commit;
