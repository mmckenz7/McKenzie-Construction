begin;

do $$
declare
  settings_id uuid;
begin
  select id into settings_id
  from public.company_settings
  limit 1;

  if settings_id is null then
    raise exception 'Expected one company_settings row.';
  end if;

  if (select email_signature_layout from public.company_settings where id = settings_id) not in ('off', 'compact', 'branded') then
    raise exception 'Existing company settings did not receive a valid signature layout.';
  end if;

  update public.company_settings set email_signature_layout = 'compact' where id = settings_id;
  update public.company_settings set email_signature_layout = 'branded' where id = settings_id;
  update public.company_settings set email_signature_layout = 'off' where id = settings_id;

  begin
    update public.company_settings set email_signature_layout = 'custom-html' where id = settings_id;
    raise exception 'Invalid signature layout was accepted.';
  exception
    when check_violation then null;
  end;

  begin
    update public.company_settings set email_signature_layout = null where id = settings_id;
    raise exception 'Null signature layout was accepted.';
  exception
    when not_null_violation then null;
  end;
end
$$;

rollback;
