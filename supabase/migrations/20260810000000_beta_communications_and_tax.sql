-- Beta communication outbox and verified municipality material-tax registry.
-- Provider secrets deliberately remain in server environment variables.

alter table public.company_settings
  add column if not exists email_delivery_provider text not null default 'manual',
  add column if not exists sms_delivery_provider text not null default 'manual',
  add column if not exists auto_send_approved_email boolean not null default false,
  add column if not exists auto_send_sms_followups boolean not null default false,
  add column if not exists communications_from_email text,
  add column if not exists communications_from_phone text;

alter table public.company_settings
  drop constraint if exists company_settings_email_delivery_provider_check,
  add constraint company_settings_email_delivery_provider_check
    check (email_delivery_provider in ('manual', 'resend')),
  drop constraint if exists company_settings_sms_delivery_provider_check,
  add constraint company_settings_sms_delivery_provider_check
    check (sms_delivery_provider in ('manual', 'twilio'));

create table if not exists public.municipality_material_tax_rates (
  id uuid primary key default gen_random_uuid(),
  municipality text not null,
  county text,
  state_code text not null,
  rate_percent numeric(7,3) not null,
  effective_from date not null,
  effective_to date,
  source_url text not null,
  verified_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint municipality_material_tax_rates_state_check check (state_code ~ '^[A-Z]{2}$'),
  constraint municipality_material_tax_rates_rate_check check (rate_percent between 0 and 100),
  constraint municipality_material_tax_rates_dates_check check (effective_to is null or effective_to >= effective_from),
  constraint municipality_material_tax_rates_source_check check (source_url ~ '^https://')
);

create unique index if not exists municipality_material_tax_rates_effective_uidx
  on public.municipality_material_tax_rates (
    lower(municipality),
    lower(coalesce(county, '')),
    state_code,
    effective_from
  );

alter table public.estimates
  add column if not exists material_tax_municipality text,
  add column if not exists material_tax_county text,
  add column if not exists material_tax_state_code text,
  add column if not exists material_tax_rate_id uuid references public.municipality_material_tax_rates(id) on delete set null,
  add column if not exists material_tax_source_url text,
  add column if not exists material_tax_verified_at timestamptz;

comment on column public.estimates.tax_rate_percent is
  'Snapshot of the cost-side material tax percentage. Customer sales tax is not calculated by structured-estimate-v2-material-tax.';
comment on column public.estimates.tax_amount is
  'Compatibility output containing cost-side material tax under structured-estimate-v2-material-tax.';

create table if not exists public.communication_outbox (
  id uuid primary key default gen_random_uuid(),
  channel text not null,
  recipient text not null,
  sender text not null,
  cc_recipients text[] not null default '{}',
  subject text,
  body text not null,
  status text not null default 'queued',
  provider text not null,
  provider_message_id text,
  source_type text not null,
  source_id text not null,
  lead_id text,
  idempotency_key text not null,
  attempt_count integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  processing_started_at timestamptz,
  sent_at timestamptz,
  failed_at timestamptz,
  last_error_code text,
  last_error_message text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint communication_outbox_channel_check check (channel in ('email', 'sms')),
  constraint communication_outbox_status_check check (status in ('queued', 'processing', 'sent', 'failed', 'canceled')),
  constraint communication_outbox_attempt_count_check check (attempt_count >= 0),
  constraint communication_outbox_email_subject_check check (channel <> 'email' or subject is not null)
);

create unique index if not exists communication_outbox_idempotency_uidx
  on public.communication_outbox(idempotency_key);
create index if not exists communication_outbox_delivery_idx
  on public.communication_outbox(status, next_attempt_at, created_at);
create index if not exists communication_outbox_source_idx
  on public.communication_outbox(source_type, source_id);

alter table public.municipality_material_tax_rates enable row level security;
alter table public.communication_outbox enable row level security;

revoke all on table public.municipality_material_tax_rates from public, anon, authenticated;
revoke all on table public.communication_outbox from public, anon, authenticated;
grant all on table public.municipality_material_tax_rates to service_role;
grant all on table public.communication_outbox to service_role;

drop trigger if exists set_municipality_material_tax_rates_updated_at on public.municipality_material_tax_rates;
create trigger set_municipality_material_tax_rates_updated_at
  before update on public.municipality_material_tax_rates
  for each row execute function public.set_updated_at();

drop trigger if exists set_communication_outbox_updated_at on public.communication_outbox;
create trigger set_communication_outbox_updated_at
  before update on public.communication_outbox
  for each row execute function public.set_updated_at();

create or replace function public.get_change_order_by_token(requested_token uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  change_order_record public.project_change_orders;
  project_record public.projects;
  line_items jsonb;
begin
  select * into change_order_record from public.project_change_orders
    where approval_token = requested_token limit 1;
  if change_order_record.id is null then return null; end if;
  if change_order_record.superseded_by_change_order_id is not null then
    return jsonb_build_object('superseded', true, 'change_order_number', change_order_record.change_order_number, 'title', change_order_record.title);
  end if;
  if change_order_record.approval_expires_at is not null and change_order_record.approval_expires_at < now() then
    return jsonb_build_object('expired', true, 'change_order_number', change_order_record.change_order_number, 'title', change_order_record.title);
  end if;
  select * into project_record from public.projects where id = change_order_record.project_id;
  if change_order_record.approval_opened_at is null and change_order_record.status = 'pending_customer' then
    update public.project_change_orders set approval_opened_at = now(), updated_at = now()
      where id = change_order_record.id returning * into change_order_record;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', item.id, 'description', item.description, 'quantity', item.quantity,
    'unit', item.unit, 'unit_price', item.unit_price,
    'sales_total', round(item.quantity * item.unit_price, 2)
  ) order by item.sort_order, item.created_at), '[]'::jsonb)
  into line_items from public.project_change_order_items item
  where item.change_order_id = change_order_record.id;
  return jsonb_build_object(
    'id', change_order_record.id,
    'change_order_number', change_order_record.change_order_number,
    'title', change_order_record.title,
    'description', change_order_record.description,
    'reason', change_order_record.reason,
    'status', change_order_record.status,
    'amount', change_order_record.amount,
    'schedule_impact_days', change_order_record.schedule_impact_days,
    'customer_notes', change_order_record.customer_notes,
    'approved_by_name', change_order_record.approved_by_name,
    'approved_at', change_order_record.approved_at,
    'declined_at', change_order_record.declined_at,
    'customer_response_notes', change_order_record.customer_response_notes,
    'customer_acknowledged_terms', change_order_record.customer_acknowledged_terms,
    'customer_agreement_text', change_order_record.customer_agreement_text,
    'approval_sent_at', change_order_record.approval_sent_at,
    'approval_opened_at', change_order_record.approval_opened_at,
    'approval_expires_at', change_order_record.approval_expires_at,
    'line_items', line_items,
    'project', jsonb_build_object(
      'id', project_record.id,
      'name', coalesce(to_jsonb(project_record)->>'name', to_jsonb(project_record)->>'project_name', to_jsonb(project_record)->>'title', 'Project'),
      'address', coalesce(to_jsonb(project_record)->>'property_address', to_jsonb(project_record)->>'address', to_jsonb(project_record)->>'project_address', to_jsonb(project_record)->>'job_address', '')
    )
  );
end;
$$;

revoke all on function public.get_change_order_by_token(uuid) from public, anon, authenticated;
grant execute on function public.get_change_order_by_token(uuid) to service_role;
