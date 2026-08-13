begin;

create table public.internal_deck_intakes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company_settings(id) on delete restrict,
  idempotency_key text not null,
  request_fingerprint text not null,
  lead_id uuid not null references public.leads(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete restrict,
  estimate_id uuid not null references public.estimates(id) on delete restrict,
  created_by_auth_user_id uuid not null,
  created_at timestamptz not null default now(),
  unique (company_id, idempotency_key),
  check (length(idempotency_key) between 1 and 200 and idempotency_key = btrim(idempotency_key)),
  check (length(request_fingerprint) = 32)
);

alter table public.internal_deck_intakes enable row level security;
revoke all on table public.internal_deck_intakes from public, anon, authenticated, service_role;

create or replace function public.prevent_internal_deck_intake_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $function$
begin
  raise exception 'Internal Deck intake provenance is immutable.' using errcode = '55000';
end
$function$;

create trigger prevent_internal_deck_intake_mutation
before update or delete on public.internal_deck_intakes
for each row execute function public.prevent_internal_deck_intake_mutation();

create or replace function public.create_internal_deck_intake(
  requested_auth_user_id uuid,
  requested_idempotency_key text,
  requested_customer_name text,
  requested_phone text,
  requested_email text,
  requested_property_address text,
  requested_notes text
)
returns table(
  result_code text,
  lead_id uuid,
  customer_id uuid,
  estimate_id uuid,
  idempotent_replay boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  effective_access jsonb;
  effective_features jsonb;
  resolved_company_id uuid;
  clean_name text := nullif(btrim(coalesce(requested_customer_name, '')), '');
  clean_phone text := nullif(btrim(coalesce(requested_phone, '')), '');
  clean_email text := nullif(lower(btrim(coalesce(requested_email, ''))), '');
  clean_address text := nullif(btrim(coalesce(requested_property_address, '')), '');
  clean_notes text := nullif(btrim(coalesce(requested_notes, '')), '');
  fingerprint text;
  existing_intake public.internal_deck_intakes;
  settings public.company_settings;
  created_lead_id uuid;
  created_customer_id uuid;
  created_estimate_id uuid;
  owner_id uuid;
begin
  if requested_auth_user_id is null
    or nullif(btrim(coalesce(requested_idempotency_key, '')), '') is null
    or length(btrim(requested_idempotency_key)) > 200
    or clean_name is null or length(clean_name) > 240
    or clean_phone is null or length(clean_phone) > 100
    or (clean_email is not null and (length(clean_email) > 320 or clean_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'))
    or (clean_address is not null and length(clean_address) > 500)
    or (clean_notes is not null and length(clean_notes) > 4000) then
    return query select 'invalid_request', null::uuid, null::uuid, null::uuid, false;
    return;
  end if;

  select public.get_effective_user_access(requested_auth_user_id)
  into effective_access;
  select public.get_effective_feature_map('global', 'default')
  into effective_features;

  if effective_access is null
    or effective_access -> 'portal_access' ->> 'sales' is distinct from 'true'
    or effective_access -> 'permissions' ->> 'edit_prices' is distinct from 'true'
    or effective_access -> 'permissions' ->> 'capture_site_visits' is distinct from 'true'
    or effective_access ->> 'role' not in ('owner', 'administrator', 'estimator')
    or effective_features ->> 'estimates' is distinct from 'true'
    or effective_features ->> 'ai_estimator' is distinct from 'true'
    or effective_features ->> 'guided_site_visits' is distinct from 'true' then
    return query select 'forbidden', null::uuid, null::uuid, null::uuid, false;
    return;
  end if;

  resolved_company_id := public.assert_single_company_fence_estimate_scope();
  if effective_access ->> 'company_id' is distinct from resolved_company_id::text then
    return query select 'forbidden', null::uuid, null::uuid, null::uuid, false;
    return;
  end if;

  select * into settings from public.company_settings where id = resolved_company_id;
  select team_member_id into owner_id
  from public.app_users
  where auth_user_id = requested_auth_user_id
    and company_id = resolved_company_id
    and is_active = true;

  fingerprint := md5(concat_ws(chr(31), clean_name, clean_phone, coalesce(clean_email, ''), coalesce(clean_address, ''), coalesce(clean_notes, '')));
  select * into existing_intake
  from public.internal_deck_intakes
  where company_id = resolved_company_id
    and idempotency_key = btrim(requested_idempotency_key);

  if existing_intake.id is not null then
    if existing_intake.request_fingerprint is distinct from fingerprint
      or existing_intake.created_by_auth_user_id is distinct from requested_auth_user_id then
      return query select 'idempotency_conflict', null::uuid, null::uuid, null::uuid, false;
    else
      return query select 'ok', existing_intake.lead_id, existing_intake.customer_id, existing_intake.estimate_id, true;
    end if;
    return;
  end if;

  insert into public.leads(
    name, phone, email, project_type, description, source, status,
    notes, property_address, preferred_contact_method, consultation_status,
    lead_status, lead_source, responsible_person_id, assigned_at
  ) values (
    clean_name, clean_phone, clean_email, 'Deck',
    coalesce(clean_notes, 'Created internally during an onsite Deck visit.'),
    'Internal onsite', 'estimate', clean_notes, clean_address,
    case when clean_email is null then 'phone' else 'no_preference' end,
    'not_requested', 'estimate_in_progress', 'internal_onsite', owner_id, now()
  ) returning id into created_lead_id;

  insert into public.customers(
    source_lead_id, customer_name, first_name, last_name, email, phone,
    address_line_1, project_type, notes, status, assigned_to
  ) values (
    created_lead_id, clean_name,
    split_part(clean_name, ' ', 1),
    nullif(btrim(substr(clean_name, length(split_part(clean_name, ' ', 1)) + 1)), ''),
    clean_email, clean_phone, clean_address, 'Deck', clean_notes, 'active', owner_id
  ) returning id into created_customer_id;

  insert into public.estimates(
    lead_id, customer_id, title, description, status, property_address,
    valid_until, overhead_percent, profit_markup_percent, tax_rate_percent,
    discount_type, discount_value, calculation_policy_version,
    calculation_revision, costs_complete, prices_complete, subtotal_cost,
    subtotal_price, contingency_amount, discount_amount, tax_amount,
    total_price, estimated_profit, item_markup_amount, overhead_amount,
    pre_profit_subtotal, profit_markup_amount, pre_discount_subtotal,
    post_discount_subtotal, taxable_item_price_subtotal,
    taxable_overhead_amount, taxable_profit_amount, taxable_discount_amount,
    taxable_subtotal, presentation_version, presentation_detail_level,
    presentation_ohp_mode, presentation_lump_sum_label,
    created_by_auth_user_id
  ) values (
    created_lead_id, created_customer_id, clean_name || ' Deck Estimate',
    clean_notes, 'draft', clean_address, (current_date + 30),
    0, 0, 0, 'fixed_amount', 0, 'structured-estimate-v2-material-tax',
    0, true, true, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    'estimate-presentation-v1', settings.default_estimate_detail_level,
    case when settings.default_estimate_detail_level = 'lump_sum' then 'distributed' else settings.default_estimate_ohp_mode end,
    settings.default_estimate_lump_sum_label, requested_auth_user_id
  ) returning id into created_estimate_id;

  insert into public.internal_deck_intakes(
    company_id, idempotency_key, request_fingerprint, lead_id,
    customer_id, estimate_id, created_by_auth_user_id
  ) values (
    resolved_company_id, btrim(requested_idempotency_key), fingerprint,
    created_lead_id, created_customer_id, created_estimate_id,
    requested_auth_user_id
  );

  return query select 'ok', created_lead_id, created_customer_id, created_estimate_id, false;
exception when unique_violation then
  select * into existing_intake
  from public.internal_deck_intakes
  where company_id = resolved_company_id
    and idempotency_key = btrim(requested_idempotency_key);
  if existing_intake.id is null
    or existing_intake.request_fingerprint is distinct from fingerprint
    or existing_intake.created_by_auth_user_id is distinct from requested_auth_user_id then
    return query select 'idempotency_conflict', null::uuid, null::uuid, null::uuid, false;
  end if;
  return query select 'ok', existing_intake.lead_id, existing_intake.customer_id, existing_intake.estimate_id, true;
end
$function$;

revoke all on function public.create_internal_deck_intake(uuid,text,text,text,text,text,text)
from public, anon, authenticated;
grant execute on function public.create_internal_deck_intake(uuid,text,text,text,text,text,text)
to service_role;

revoke all on function public.prevent_internal_deck_intake_mutation()
from public, anon, authenticated, service_role;

commit;
