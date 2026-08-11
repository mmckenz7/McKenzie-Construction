begin;

do $$
declare
  test_subject_id uuid := gen_random_uuid();
  test_occurred_at timestamptz := now();
  first_result jsonb;
  replay_result jsonb;
  recorded_event_id uuid;
  matching_event_count bigint;
begin
  first_result := public.record_business_event(
    'estimating.proposal_issued',
    1::smallint,
    test_occurred_at,
    'system',
    null,
    null,
    'proposal',
    test_subject_id,
    null,
    null,
    null,
    'test.mission_control',
    'provider-event-1',
    'proposal-issued-1',
    null,
    null,
    jsonb_build_object('proposal_generation', 1),
    'operational'
  );

  if first_result ->> 'created' <> 'true' then
    raise exception 'First event emission was not reported as created.';
  end if;

  replay_result := public.record_business_event(
    'estimating.proposal_issued',
    1::smallint,
    test_occurred_at,
    'system',
    null,
    null,
    'proposal',
    test_subject_id,
    null,
    null,
    null,
    'test.mission_control',
    'provider-event-1',
    'proposal-issued-1',
    null,
    null,
    jsonb_build_object('proposal_generation', 1),
    'operational'
  );

  if replay_result ->> 'created' <> 'false'
    or replay_result ->> 'id' <> first_result ->> 'id'
  then
    raise exception 'Idempotent replay did not return the original event.';
  end if;

  select count(*)
  into matching_event_count
  from public.business_events
  where source = 'test.mission_control'
    and idempotency_key = 'proposal-issued-1';

  if matching_event_count <> 1 then
    raise exception 'Idempotent replay created % events.', matching_event_count;
  end if;

  begin
    perform public.record_business_event(
      'estimating.proposal_issued',
      1::smallint,
      test_occurred_at,
      'system',
      null,
      null,
      'proposal',
      test_subject_id,
      null,
      null,
      null,
      'test.mission_control',
      'provider-event-1',
      'proposal-issued-1',
      null,
      null,
      jsonb_build_object('proposal_generation', 2),
      'operational'
    );

    raise exception 'Expected an immutable-payload idempotency conflict.';
  exception
    when others then
      if sqlerrm not like
        'Business event idempotency key was reused with a different immutable payload.%'
      then
        raise;
      end if;
  end;

  recorded_event_id := (first_result ->> 'id')::uuid;

  begin
    update public.business_events
    set metadata = jsonb_build_object('proposal_generation', 2)
    where id = recorded_event_id;

    raise exception 'Expected append-only mutation prevention.';
  exception
    when sqlstate '55000' then
      null;
  end;
end
$$;

do $$
begin
  if has_table_privilege(
    'service_role',
    'public.business_events',
    'INSERT'
  ) then
    raise exception 'service_role must not insert business events directly.';
  end if;

  if not has_table_privilege(
    'service_role',
    'public.business_events',
    'SELECT'
  ) then
    raise exception 'service_role requires read access to business events.';
  end if;

  if not has_function_privilege(
    'service_role',
    'public.record_business_event(text,smallint,timestamptz,text,uuid,uuid,text,uuid,uuid,uuid,uuid,text,text,text,uuid,uuid,jsonb,text)',
    'EXECUTE'
  ) then
    raise exception 'service_role requires access to the event emitter.';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.record_business_event(text,smallint,timestamptz,text,uuid,uuid,text,uuid,uuid,uuid,uuid,text,text,text,uuid,uuid,jsonb,text)',
    'EXECUTE'
  ) then
    raise exception 'authenticated must not call the event emitter.';
  end if;

  if not exists (
    select 1
    from pg_class
    where oid = 'public.business_events'::regclass
      and relrowsecurity
      and relforcerowsecurity
  ) then
    raise exception 'business_events must enable and force RLS.';
  end if;
end
$$;

rollback;
