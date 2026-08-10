-- Minimal, service-role-only audit ledger for signed Resend delivery webhooks.
-- Message contents and webhook secrets are never stored here.

create table if not exists public.communication_provider_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_id text not null,
  event_type text not null,
  provider_message_id text not null,
  outbox_id uuid references public.communication_outbox(id) on delete set null,
  message_id uuid references public.communication_messages(id) on delete set null,
  occurred_at timestamptz not null,
  processed_at timestamptz,
  processing_error text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  constraint communication_provider_events_provider_event_unique unique (provider, event_id)
);

create index if not exists communication_provider_events_message_idx
  on public.communication_provider_events(provider, provider_message_id, occurred_at desc);

alter table public.communication_provider_events enable row level security;
revoke all on table public.communication_provider_events from public, anon, authenticated;
grant all on table public.communication_provider_events to service_role;
