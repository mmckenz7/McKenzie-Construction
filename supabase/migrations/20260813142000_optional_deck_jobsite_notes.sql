-- Access and utility observations are useful context, but they must not block
-- a Deck site visit when there is nothing noteworthy to document.

create or replace function public.complete_optional_guided_site_visit_item(
  requested_auth_user_id uuid,
  requested_visit_id uuid,
  requested_item_id uuid,
  requested_expected_revision integer,
  requested_notes text
)
returns table(result_code text,next_revision integer)
language plpgsql security invoker set search_path=pg_catalog,public as $function$
declare
  company uuid;
  visit public.guided_site_visits;
  item public.guided_site_visit_items;
  next_value integer;
  clean_notes text;
begin
  company:=public.guided_site_visit_actor_company(requested_auth_user_id);
  if company is null then return query select 'forbidden',null::integer;return;end if;
  select * into visit from public.guided_site_visits
    where id=requested_visit_id and company_id=company for update;
  if visit.id is null then return query select 'not_found',null::integer;return;end if;
  if visit.status<>'in_progress' then return query select 'not_editable',visit.revision;return;end if;
  if visit.revision<>requested_expected_revision then return query select 'stale_revision',visit.revision;return;end if;
  select * into item from public.guided_site_visit_items
    where id=requested_item_id and visit_id=visit.id and company_id=company;
  if item.id is null then return query select 'not_found',visit.revision;return;end if;
  if item.item_key not in ('access_demolition','utilities_obstructions')
    then return query select 'not_optional',visit.revision;return;end if;
  clean_notes:=nullif(btrim(coalesce(requested_notes,'')),'');
  if length(coalesce(clean_notes,''))>2000
    then return query select 'invalid_item',visit.revision;return;end if;
  update public.guided_site_visit_items set
    state='confirmed',
    observation=case when clean_notes is null then '{}'::jsonb else jsonb_build_object('notes',clean_notes) end,
    follow_up_reason_code=null,
    follow_up_notes=null,
    confirmed_by_auth_user_id=requested_auth_user_id,
    confirmed_at=now()
  where id=item.id;
  next_value:=visit.revision+1;
  update public.guided_site_visits set revision=next_value,updated_at=now() where id=visit.id;
  return query select 'ok',next_value;
end $function$;

revoke all on function public.complete_optional_guided_site_visit_item(uuid,uuid,uuid,integer,text)
  from public,anon,authenticated;
grant execute on function public.complete_optional_guided_site_visit_item(uuid,uuid,uuid,integer,text)
  to service_role;
