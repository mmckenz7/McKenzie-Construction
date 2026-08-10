-- Provider-neutral communication history and SMS consent state.
-- Secrets remain in server environment variables; these tables contain audit data only.

alter table public.company_settings
  add column if not exists communication_sandbox_mode boolean not null default true,
  add column if not exists communication_test_recipients text[] not null default '{}';

create table if not exists public.communication_messages (
  id uuid primary key default gen_random_uuid(),
  channel text not null,
  direction text not null,
  sender text not null,
  recipient text not null,
  subject text,
  body text not null,
  status text not null,
  provider text not null,
  provider_message_id text not null,
  lead_id text,
  outbox_id uuid references public.communication_outbox(id) on delete set null,
  opt_out_type text,
  received_at timestamptz,
  sent_at timestamptz,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint communication_messages_channel_check check (channel in ('email', 'sms', 'voice')),
  constraint communication_messages_direction_check check (direction in ('inbound', 'outbound')),
  constraint communication_messages_status_check check (status in ('received', 'queued', 'sent', 'delivered', 'undelivered', 'failed')),
  constraint communication_messages_opt_out_check check (opt_out_type is null or opt_out_type in ('START', 'STOP', 'HELP'))
);

create unique index if not exists communication_messages_provider_uidx
  on public.communication_messages(provider, provider_message_id, direction);
create index if not exists communication_messages_timeline_idx
  on public.communication_messages(coalesce(received_at, sent_at, created_at) desc);
create index if not exists communication_messages_lead_idx
  on public.communication_messages(lead_id, coalesce(received_at, sent_at, created_at) desc);

create table if not exists public.communication_preferences (
  id uuid primary key default gen_random_uuid(),
  channel text not null,
  address text not null,
  status text not null,
  source text not null,
  provider text,
  effective_at timestamptz not null default now(),
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint communication_preferences_channel_check check (channel in ('email', 'sms', 'voice')),
  constraint communication_preferences_status_check check (status in ('unknown', 'subscribed', 'unsubscribed'))
);

create unique index if not exists communication_preferences_address_uidx
  on public.communication_preferences(channel, address);

alter table public.communication_messages enable row level security;
alter table public.communication_preferences enable row level security;

revoke all on table public.communication_messages from public, anon, authenticated;
revoke all on table public.communication_preferences from public, anon, authenticated;
grant all on table public.communication_messages to service_role;
grant all on table public.communication_preferences to service_role;

drop trigger if exists set_communication_messages_updated_at on public.communication_messages;
create trigger set_communication_messages_updated_at
  before update on public.communication_messages
  for each row execute function public.set_updated_at();

drop trigger if exists set_communication_preferences_updated_at on public.communication_preferences;
create trigger set_communication_preferences_updated_at
  before update on public.communication_preferences
  for each row execute function public.set_updated_at();
