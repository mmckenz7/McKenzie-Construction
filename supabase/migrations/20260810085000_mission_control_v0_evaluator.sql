begin;

do $$
begin
  if to_regprocedure('public.evaluate_mission_control_proposal_signals(timestamptz)') is null
    or to_regprocedure('public.evaluate_mission_control_proposal_follow_up_signals(timestamptz)') is null
    or to_regprocedure('public.evaluate_mission_control_communication_signals(timestamptz)') is null
  then
    raise exception 'All Mission Control V0 deterministic evaluators must be applied first.';
  end if;
end
$$;

create or replace function public.evaluate_mission_control_v0(
  requested_as_of timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  proposal_expiry_result jsonb;
  proposal_follow_up_result jsonb;
  communication_result jsonb;
begin
  if requested_as_of is null or requested_as_of > now() + interval '5 minutes' then
    raise exception 'Invalid Mission Control V0 evaluation time.';
  end if;

  -- One transaction-scoped lock prevents concurrent sweeps from racing signal
  -- lifecycle updates. It does not block independent domain writes.
  if not pg_try_advisory_xact_lock(hashtextextended('mission_control_v0_evaluator', 0)) then
    return jsonb_build_object(
      'as_of', requested_as_of,
      'evaluated', false,
      'reason', 'evaluation_already_running'
    );
  end if;

  proposal_expiry_result :=
    public.evaluate_mission_control_proposal_signals(requested_as_of);
  proposal_follow_up_result :=
    public.evaluate_mission_control_proposal_follow_up_signals(requested_as_of);
  communication_result :=
    public.evaluate_mission_control_communication_signals(requested_as_of);

  return jsonb_build_object(
    'as_of', requested_as_of,
    'evaluated', true,
    'rules', jsonb_build_object(
      'proposal_expiry', proposal_expiry_result,
      'proposal_follow_up', proposal_follow_up_result,
      'communication', communication_result
    )
  );
end;
$$;

revoke all on function public.evaluate_mission_control_v0(timestamptz)
  from public, anon, authenticated;
grant execute on function public.evaluate_mission_control_v0(timestamptz)
  to service_role;

comment on function public.evaluate_mission_control_v0(timestamptz) is
  'Runs the complete deterministic Mission Control V0 sweep atomically at one caller-supplied time. Scheduling remains an external deployment concern.';

commit;
