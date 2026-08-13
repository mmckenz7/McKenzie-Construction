begin;

alter function public.update_guided_site_visit_item(uuid,uuid,uuid,integer,text,jsonb,text,text)
  rename to update_guided_site_visit_item_photo_required;

revoke all on function public.update_guided_site_visit_item_photo_required(uuid,uuid,uuid,integer,text,jsonb,text,text)
  from public,anon,authenticated,service_role;

create function public.update_guided_site_visit_item(
  requested_auth_user_id uuid,requested_visit_id uuid,requested_item_id uuid,
  requested_expected_revision integer,requested_action text,requested_observation jsonb,
  requested_follow_up_reason_code text,requested_follow_up_notes text
)
returns table(result_code text,next_revision integer)
language plpgsql security definer set search_path=pg_catalog,public as $function$
declare company uuid; visit public.guided_site_visits; item public.guided_site_visit_items; nextv integer;
begin
  company:=public.guided_site_visit_actor_company(requested_auth_user_id);
  if company is null then return query select 'forbidden',null::integer; return; end if;
  if requested_action='confirm' and requested_observation->>'conditionStatus'='not_applicable' then
    select * into visit from public.guided_site_visits
      where id=requested_visit_id and company_id=company for update;
    if visit.id is null then return query select 'not_found',null::integer; return; end if;
    if visit.status<>'in_progress' then return query select 'not_editable',visit.revision; return; end if;
    if visit.revision<>requested_expected_revision then return query select 'stale_revision',visit.revision; return; end if;
    select * into item from public.guided_site_visit_items
      where id=requested_item_id and visit_id=visit.id and company_id=company and state='pending' for update;
    if item.id is null then return query select 'not_editable',visit.revision; return; end if;
    if item.requirement->>'mode'<>'conditional'
      or public.is_valid_guided_site_visit_observation(item.requirement,requested_observation) is distinct from true
    then return query select 'requirements_incomplete',visit.revision; return; end if;
    nextv:=visit.revision+1;
    update public.guided_site_visit_items set state='confirmed',observation=requested_observation,
      follow_up_reason_code=null,follow_up_notes=null,confirmed_by_auth_user_id=requested_auth_user_id,
      confirmed_at=now() where id=item.id and state='pending';
    if not found then return query select 'not_editable',visit.revision; return; end if;
    update public.guided_site_visits set revision=nextv,updated_at=now() where id=visit.id;
    return query select 'ok',nextv; return;
  end if;
  return query select * from public.update_guided_site_visit_item_photo_required(
    requested_auth_user_id,requested_visit_id,requested_item_id,requested_expected_revision,
    requested_action,requested_observation,requested_follow_up_reason_code,requested_follow_up_notes
  );
end;
$function$;

revoke all on function public.update_guided_site_visit_item(uuid,uuid,uuid,integer,text,jsonb,text,text)
  from public,anon,authenticated;
grant execute on function public.update_guided_site_visit_item(uuid,uuid,uuid,integer,text,jsonb,text,text)
  to service_role;

comment on function public.update_guided_site_visit_item(uuid,uuid,uuid,integer,text,jsonb,text,text) is
  'Service-only guided visit item update; permits validated conditional not-applicable confirmation without photo evidence and delegates every other action to the original photo-required implementation.';

commit;
