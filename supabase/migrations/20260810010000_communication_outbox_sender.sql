begin;

alter table public.communication_outbox
  add column if not exists sender text;

update public.communication_outbox outbox
set sender = case
  when outbox.channel = 'email' then settings.communications_from_email
  when outbox.channel = 'sms' then settings.communications_from_phone
end
from public.company_settings settings
where outbox.sender is null;

do $$
begin
  if exists (select 1 from public.communication_outbox where sender is null or btrim(sender) = '') then
    raise exception 'Existing communication outbox rows require a sender before this migration can finish.';
  end if;
end
$$;

alter table public.communication_outbox
  alter column sender set not null;

commit;
