begin;

alter function public.approve_guided_deck_shape_revision_v2(
  uuid,uuid,integer,text,text,text,jsonb,boolean,jsonb,jsonb
) security definer;

revoke all on function public.approve_guided_deck_shape_revision_v2(
  uuid,uuid,integer,text,text,text,jsonb,boolean,jsonb,jsonb
) from public,anon,authenticated;

grant execute on function public.approve_guided_deck_shape_revision_v2(
  uuid,uuid,integer,text,text,text,jsonb,boolean,jsonb,jsonb
) to service_role;

comment on function public.approve_guided_deck_shape_revision_v2(
  uuid,uuid,integer,text,text,text,jsonb,boolean,jsonb,jsonb
) is 'Service-only shape approval boundary. The function validates the authenticated actor company, completed visit, editable estimate, exact revision, immutable replay binding, outline, stairs, and grade heights before inserting an append-only revision.';

commit;
