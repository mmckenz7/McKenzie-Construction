-- Microsoft 365 inbox foundation.
-- OAuth client secrets remain in server environment variables. This migration stores
-- non-secret tenant configuration, mailbox sync state, conversation metadata, and messages.

alter table public.company_settings
  add column if not exists microsoft_365_inbox_enabled boolean not null default false,
  add column if not exists microsoft_365_tenant_id text,
  add column if not exists microsoft_365_client_id text;

create table if not exists public.communication_mailboxes (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'microsoft_graph',
  address text not null,
  display_name text,
  department text not null default 'general',
  graph_user_id text,
  is_active boolean not null default true,
  sync_enabled boolean not null default false,
  inbox_delta_link text,
  last_sync_at timestamptz,
  last_sync_status text not null default 'not_configured',
  last_sync_error text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint communication_mailboxes_provider_check
    check (provider in ('microsoft_graph')),
  constraint communication_mailboxes_department_check
    check (department in ('general', 'sales', 'estimating', 'operations', 'billing')),
  constraint communication_mailboxes_sync_status_check
    check (last_sync_status in ('not_configured', 'ready', 'syncing', 'succeeded', 'failed'))
);

create unique index if not exists communication_mailboxes_provider_address_uidx
  on public.communication_mailboxes(provider, address);

create table if not exists public.communication_threads (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_thread_id text not null,
  subject text,
  department text not null default 'general',
  status text not null default 'open',
  lead_id text,
  customer_id uuid references public.customers(id) on delete set null,
  assigned_to_id uuid references public.team_members(id) on delete set null,
  participant_addresses text[] not null default '{}',
  unread_count integer not null default 0,
  last_message_at timestamptz not null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint communication_threads_status_check
    check (status in ('open', 'waiting', 'closed', 'archived')),
  constraint communication_threads_department_check
    check (department in ('general', 'sales', 'estimating', 'operations', 'billing')),
  constraint communication_threads_unread_count_check check (unread_count >= 0)
);

create unique index if not exists communication_threads_provider_uidx
  on public.communication_threads(provider, provider_thread_id);
create index if not exists communication_threads_inbox_idx
  on public.communication_threads(status, unread_count desc, last_message_at desc);
create index if not exists communication_threads_lead_idx
  on public.communication_threads(lead_id, last_message_at desc);

alter table public.communication_messages
  add column if not exists mailbox_id uuid references public.communication_mailboxes(id) on delete set null,
  add column if not exists thread_id uuid references public.communication_threads(id) on delete set null,
  add column if not exists provider_conversation_id text,
  add column if not exists internet_message_id text,
  add column if not exists in_reply_to text,
  add column if not exists is_read boolean not null default true,
  add column if not exists has_attachments boolean not null default false,
  add column if not exists department text not null default 'general';

alter table public.communication_messages
  drop constraint if exists communication_messages_department_check,
  add constraint communication_messages_department_check
    check (department in ('general', 'sales', 'estimating', 'operations', 'billing'));

create index if not exists communication_messages_thread_idx
  on public.communication_messages(thread_id, coalesce(received_at, sent_at, created_at));
create index if not exists communication_messages_unread_idx
  on public.communication_messages(direction, is_read, coalesce(received_at, created_at) desc);

alter table public.communication_mailboxes enable row level security;
alter table public.communication_threads enable row level security;

revoke all on table public.communication_mailboxes from public, anon, authenticated;
revoke all on table public.communication_threads from public, anon, authenticated;
grant all on table public.communication_mailboxes to service_role;
grant all on table public.communication_threads to service_role;

drop trigger if exists set_communication_mailboxes_updated_at on public.communication_mailboxes;
create trigger set_communication_mailboxes_updated_at
  before update on public.communication_mailboxes
  for each row execute function public.set_updated_at();

drop trigger if exists set_communication_threads_updated_at on public.communication_threads;
create trigger set_communication_threads_updated_at
  before update on public.communication_threads
  for each row execute function public.set_updated_at();
