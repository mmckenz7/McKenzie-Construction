begin;

create table if not exists public.public_token_rate_limit_buckets (
  route_category text not null,
  request_method text not null,
  identifier_kind text not null,
  identifier_hash text not null,
  window_started_at timestamptz not null,
  request_count integer not null default 1,
  primary key (
    route_category,
    request_method,
    identifier_kind,
    identifier_hash,
    window_started_at
  ),
  constraint public_token_rate_limit_method_check
    check (request_method in ('GET', 'POST')),
  constraint public_token_rate_limit_identifier_kind_check
    check (identifier_kind in ('network', 'token')),
  constraint public_token_rate_limit_count_check
    check (request_count > 0)
);

alter table public.public_token_rate_limit_buckets enable row level security;
revoke all on table public.public_token_rate_limit_buckets
  from public, anon, authenticated;
grant select, insert, update, delete on table public.public_token_rate_limit_buckets
  to service_role;

create or replace function public.check_public_token_rate_limit(
  requested_route_category text,
  requested_method text,
  requested_network_key text,
  requested_token_key text,
  requested_window_seconds integer,
  requested_network_limit integer,
  requested_token_limit integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_window timestamptz;
  network_count integer;
  token_count integer;
  retry_after integer;
begin
  if requested_route_category not in (
    'change_order',
    'change_order_vendor',
    'material_review',
    'schedule_request'
  )
    or requested_method not in ('GET', 'POST')
    or length(requested_network_key) <> 64
    or length(requested_token_key) <> 64
    or requested_window_seconds not between 60 and 3600
    or requested_network_limit not between 1 and 1000
    or requested_token_limit not between 1 and requested_network_limit
  then
    raise exception 'Invalid rate limit configuration.';
  end if;

  current_window := to_timestamp(
    floor(extract(epoch from clock_timestamp()) / requested_window_seconds)
      * requested_window_seconds
  );

  insert into public.public_token_rate_limit_buckets (
    route_category,
    request_method,
    identifier_kind,
    identifier_hash,
    window_started_at,
    request_count
  ) values (
    requested_route_category,
    requested_method,
    'network',
    requested_network_key,
    current_window,
    1
  )
  on conflict (
    route_category,
    request_method,
    identifier_kind,
    identifier_hash,
    window_started_at
  ) do update
    set request_count = public.public_token_rate_limit_buckets.request_count + 1
  returning request_count into network_count;

  insert into public.public_token_rate_limit_buckets (
    route_category,
    request_method,
    identifier_kind,
    identifier_hash,
    window_started_at,
    request_count
  ) values (
    requested_route_category,
    requested_method,
    'token',
    requested_token_key,
    current_window,
    1
  )
  on conflict (
    route_category,
    request_method,
    identifier_kind,
    identifier_hash,
    window_started_at
  ) do update
    set request_count = public.public_token_rate_limit_buckets.request_count + 1
  returning request_count into token_count;

  if random() < 0.01 then
    delete from public.public_token_rate_limit_buckets
    where window_started_at < now() - interval '48 hours';
  end if;

  retry_after := greatest(
    1,
    requested_window_seconds - (
      extract(epoch from clock_timestamp())::integer
        % requested_window_seconds
    )
  );

  return jsonb_build_object(
    'allowed',
    network_count <= requested_network_limit
      and token_count <= requested_token_limit,
    'retry_after_seconds', retry_after
  );
end;
$$;

revoke all on function public.check_public_token_rate_limit(
  text, text, text, text, integer, integer, integer
) from public, anon, authenticated;
grant execute on function public.check_public_token_rate_limit(
  text, text, text, text, integer, integer, integer
) to service_role;

commit;
