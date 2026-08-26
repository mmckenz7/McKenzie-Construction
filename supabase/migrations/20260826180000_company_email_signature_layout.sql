begin;

alter table public.company_settings
  add column if not exists email_signature_layout text not null default 'off';

alter table public.company_settings
  drop constraint if exists company_settings_email_signature_layout_check,
  add constraint company_settings_email_signature_layout_check
    check (email_signature_layout in ('off', 'compact', 'branded'));

comment on column public.company_settings.email_signature_layout is
  'Company-authoritative layout for employee signatures on manually composed email. Employee facts remain authoritative in team_members.';

commit;
