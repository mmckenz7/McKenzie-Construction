begin;

-- Repository caller audit, 2026-08-01: all eight token RPCs are invoked only
-- by Next.js API routes using the server-only service-role client. The public
-- web workflows remain available through those routes; direct PostgREST RPC
-- execution is unnecessary and bypasses application validation and controls.
revoke all on function public.get_change_order_by_token(uuid)
  from public, anon, authenticated;
revoke all on function public.get_change_order_vendor_request_by_token(uuid)
  from public, anon, authenticated;
revoke all on function public.get_material_review_by_token(uuid)
  from public, anon, authenticated;
revoke all on function public.get_schedule_request_by_token(uuid)
  from public, anon, authenticated;
revoke all on function public.submit_change_order_response(uuid, text, text, text, text)
  from public, anon, authenticated;
revoke all on function public.submit_change_order_response_v2(uuid, text, text, text, text, text, boolean)
  from public, anon, authenticated;
revoke all on function public.submit_change_order_vendor_response(uuid, text, text, text, text, numeric, date, date, integer, integer, date, text, text, jsonb, text, text)
  from public, anon, authenticated;
revoke all on function public.submit_schedule_request_by_token(uuid, text, date, date, integer, integer, text)
  from public, anon, authenticated;

grant execute on function public.get_change_order_by_token(uuid)
  to service_role;
grant execute on function public.get_change_order_vendor_request_by_token(uuid)
  to service_role;
grant execute on function public.get_material_review_by_token(uuid)
  to service_role;
grant execute on function public.get_schedule_request_by_token(uuid)
  to service_role;
grant execute on function public.submit_change_order_response(uuid, text, text, text, text)
  to service_role;
grant execute on function public.submit_change_order_response_v2(uuid, text, text, text, text, text, boolean)
  to service_role;
grant execute on function public.submit_change_order_vendor_response(uuid, text, text, text, text, numeric, date, date, integer, integer, date, text, text, jsonb, text, text)
  to service_role;
grant execute on function public.submit_schedule_request_by_token(uuid, text, date, date, integer, integer, text)
  to service_role;

commit;
