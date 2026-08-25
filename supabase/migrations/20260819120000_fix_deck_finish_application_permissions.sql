begin;

alter function public.apply_reviewed_deck_finish_materials(
  uuid,uuid,uuid,uuid,uuid,text,integer,integer,text,text,uuid,jsonb,jsonb,jsonb,jsonb
) security definer;

revoke all on function public.apply_reviewed_deck_finish_materials(
  uuid,uuid,uuid,uuid,uuid,text,integer,integer,text,text,uuid,jsonb,jsonb,jsonb,jsonb
) from public,anon,authenticated;

grant execute on function public.apply_reviewed_deck_finish_materials(
  uuid,uuid,uuid,uuid,uuid,text,integer,integer,text,text,uuid,jsonb,jsonb,jsonb,jsonb
) to service_role;

comment on function public.apply_reviewed_deck_finish_materials(
  uuid,uuid,uuid,uuid,uuid,text,integer,integer,text,text,uuid,jsonb,jsonb,jsonb,jsonb
) is 'Service-only Deck finish-cost application boundary. The function validates effective Sales price-edit access, actor and company scope, completed visit, latest immutable finish selection, exact estimate revision, preview binding, and idempotency before persisting calculated estimate outputs.';

commit;
