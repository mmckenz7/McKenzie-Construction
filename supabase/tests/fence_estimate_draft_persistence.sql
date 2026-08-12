begin;

-- Run only against the disposable local Supabase database after the complete
-- migration chain. Every fixture and schema mutation is rolled back.
do $test$
declare
  fixture_company_id uuid;
  editor_auth_id uuid := 'f1000000-0000-4000-8000-000000000001';
  reader_auth_id uuid := 'f1000000-0000-4000-8000-000000000002';
  denied_auth_id uuid := 'f1000000-0000-4000-8000-000000000003';
  editor_team_id uuid := 'f2000000-0000-4000-8000-000000000001';
  reader_team_id uuid := 'f2000000-0000-4000-8000-000000000002';
  denied_team_id uuid := 'f2000000-0000-4000-8000-000000000003';
  fixture_estimate_id uuid := 'f3000000-0000-4000-8000-000000000001';
  legacy_estimate_id uuid := 'f3000000-0000-4000-8000-000000000002';
  second_company_id uuid := 'f4000000-0000-4000-8000-000000000001';
  result record;
  draft_id uuid;
  original_calculation_revision integer;
begin
  select id into fixture_company_id from public.company_settings;
  if fixture_company_id is null or (select count(*) from public.company_settings) <> 1 then
    raise exception 'Fence persistence regression requires the disposable singleton company.';
  end if;

  insert into auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) values
    (editor_auth_id, 'authenticated', 'authenticated', 'fence-editor@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (reader_auth_id, 'authenticated', 'authenticated', 'fence-reader@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (denied_auth_id, 'authenticated', 'authenticated', 'fence-denied@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

  insert into public.team_members (id, auth_user_id, name, email, roles, status)
  values
    (editor_team_id, editor_auth_id, 'Fence editor fixture', 'fence-editor@example.test', array['estimator'], 'active'),
    (reader_team_id, reader_auth_id, 'Fence reader fixture', 'fence-reader@example.test', array['salesperson'], 'active'),
    (denied_team_id, denied_auth_id, 'Fence denied fixture', 'fence-denied@example.test', array['field_employee'], 'active');

  insert into public.app_users (
    auth_user_id, company_id, team_member_id, display_name, email,
    role, default_portal, is_active, permissions, metadata
  ) values
    (editor_auth_id, fixture_company_id, editor_team_id, 'Fence editor fixture', 'fence-editor@example.test', 'estimator', 'sales', true, '{}'::jsonb, '{"disposable_test_fixture":true}'::jsonb),
    (reader_auth_id, fixture_company_id, reader_team_id, 'Fence reader fixture', 'fence-reader@example.test', 'salesperson', 'sales', true, '{}'::jsonb, '{"disposable_test_fixture":true}'::jsonb),
    (denied_auth_id, fixture_company_id, denied_team_id, 'Fence denied fixture', 'fence-denied@example.test', 'field_employee', 'operations', true, '{}'::jsonb, '{"disposable_test_fixture":true}'::jsonb);

  insert into public.estimates (
    id, title, status, calculation_policy_version, calculation_revision,
    costs_complete, prices_complete
  ) values
    (fixture_estimate_id, 'Fence persistence fixture', 'draft', 'structured-estimate-v1', 7, false, false),
    (legacy_estimate_id, 'Legacy estimate fixture', 'draft', null, null, null, null);

  original_calculation_revision := (
    select calculation_revision from public.estimates where id = fixture_estimate_id
  );

  select * into result from public.save_fence_estimate_draft(
    editor_auth_id, fixture_estimate_id, 0, 'fence-layout-v1', array[125, 247], true
  );
  if result.result_code <> 'ok' or result.next_revision <> 1 or result.resource_id is null then
    raise exception 'Valid gate-requested Fence draft did not create revision 1.';
  end if;
  draft_id := result.resource_id;

  if not exists (
    select 1 from public.fence_estimate_drafts as fence_draft
    where fence_draft.id = draft_id
      and fence_draft.company_id = fixture_company_id
      and fence_draft.estimate_id = fixture_estimate_id
      and revision = 1 and run_lengths_inches = array[125, 247]
      and total_length_inches = 372 and needs_gate = true
  ) then
    raise exception 'Current Fence draft does not preserve the exact created snapshot.';
  end if;
  if not exists (
    select 1 from public.fence_estimate_draft_revisions
    where fence_draft_id = draft_id and revision = 1 and event_kind = 'created'
      and run_lengths_inches = array[125, 247] and total_length_inches = 372
      and needs_gate = true
  ) then
    raise exception 'Created Fence revision evidence is incomplete.';
  end if;

  select * into result from public.save_fence_estimate_draft(
    editor_auth_id, fixture_estimate_id, 1, 'fence-layout-v1', array[126, 247, 12], false
  );
  if result.result_code <> 'ok' or result.next_revision <> 2 then
    raise exception 'Valid Fence update did not create revision 2.';
  end if;
  if (select count(*) from public.fence_estimate_draft_revisions where fence_draft_id = draft_id) <> 2 then
    raise exception 'A valid update must append exactly one complete revision.';
  end if;

  select * into result from public.save_fence_estimate_draft(
    editor_auth_id, fixture_estimate_id, 2, 'fence-layout-v1',
    array[126, 247, 12], false, 'fence-context-v1',
    'emblem_6x8_white', null, null, null, null, null
  );
  if result.result_code <> 'ok' or result.next_revision <> 3 then
    raise exception 'First typed context answer must append Fence revision 3.';
  end if;
  select * into result from public.save_fence_estimate_draft(
    editor_auth_id, fixture_estimate_id, 3, 'fence-layout-v1',
    array[126, 247, 12], false, 'fence-context-v1',
    'emblem_6x8_white', 'post_centers', 'level', 'exact_90', 36, 'none'
  );
  if result.result_code <> 'ok' or result.next_revision <> 4 then
    raise exception 'Complete typed context must append Fence revision 4.';
  end if;
  if not exists (
    select 1 from public.fence_estimate_draft_revisions
    where fence_draft_id = draft_id and revision = 4
      and context_system = 'emblem_6x8_white'
      and context_measurement_basis = 'post_centers'
      and context_terrain = 'level' and context_corners = 'exact_90'
      and context_frost_depth_inches = 36 and context_conditions = 'none'
  ) then
    raise exception 'Fence revision must preserve the complete typed context snapshot.';
  end if;
  select * into result from public.save_fence_estimate_draft(
    editor_auth_id, fixture_estimate_id, 4, 'fence-layout-v1',
    array[126, 247, 12], false, 'fence-context-v1',
    null, null, null, null, null, null
  );
  if result.result_code <> 'ok' or result.next_revision <> 5
    or (select count(*) from public.fence_estimate_draft_revisions where fence_draft_id = draft_id) <> 5 then
    raise exception 'Starting answers over must append an empty-context revision without deleting history.';
  end if;
  select * into result from public.save_fence_estimate_draft(
    editor_auth_id, fixture_estimate_id, 5, 'fence-layout-v1',
    array[126, 247, 12], false, 'fence-context-v1',
    null, 'post_centers', null, null, null, null
  );
  if result.result_code <> 'invalid_context' then
    raise exception 'Out-of-order Fence context must fail closed.';
  end if;

  select * into result from public.save_fence_estimate_draft(
    editor_auth_id, fixture_estimate_id, 1, 'fence-layout-v1', array[999], false
  );
  if result.result_code <> 'stale_fence_revision' or result.next_revision <> 5 then
    raise exception 'A stale save must return the authoritative Fence revision.';
  end if;
  if (select run_lengths_inches from public.fence_estimate_drafts where id = draft_id) <> array[126, 247, 12]
    or (select count(*) from public.fence_estimate_draft_revisions where fence_draft_id = draft_id) <> 5 then
    raise exception 'A stale save changed the current draft or its immutable history.';
  end if;

  if (select calculation_revision from public.estimates where id = fixture_estimate_id) <> original_calculation_revision then
    raise exception 'Fence saves must not increment estimate calculation_revision.';
  end if;

  select * into result from public.save_fence_estimate_draft(
    editor_auth_id, fixture_estimate_id, 2, 'wrong-version', array[12], false
  );
  if result.result_code <> 'invalid_draft' then raise exception 'Unknown schema version must be rejected.'; end if;
  select * into result from public.save_fence_estimate_draft(
    editor_auth_id, fixture_estimate_id, 2, 'fence-layout-v1', array[]::integer[], false
  );
  if result.result_code <> 'invalid_draft' then raise exception 'Empty layouts must be rejected.'; end if;
  select * into result from public.save_fence_estimate_draft(
    editor_auth_id, fixture_estimate_id, 2, 'fence-layout-v1', array[0], false
  );
  if result.result_code <> 'invalid_draft' then raise exception 'Zero-length runs must be rejected.'; end if;
  select * into result from public.save_fence_estimate_draft(
    editor_auth_id, fixture_estimate_id, 2, 'fence-layout-v1', array[12001], false
  );
  if result.result_code <> 'invalid_draft' then raise exception 'Oversized runs must be rejected.'; end if;
  select * into result from public.save_fence_estimate_draft(
    editor_auth_id, fixture_estimate_id, 2, 'fence-layout-v1', array_fill(12000, array[6]), false
  );
  if result.result_code <> 'invalid_draft' then raise exception 'Oversized totals must be rejected.'; end if;
  select * into result from public.save_fence_estimate_draft(
    editor_auth_id, fixture_estimate_id, 2, 'fence-layout-v1', array_fill(12, array[51]), false
  );
  if result.result_code <> 'invalid_draft' then raise exception 'More than 50 runs must be rejected.'; end if;

  select * into result from public.save_fence_estimate_draft(
    reader_auth_id, fixture_estimate_id, 2, 'fence-layout-v1', array[12], false
  );
  if result.result_code <> 'forbidden' then raise exception 'Sales users without edit_prices must not save.'; end if;
  select * into result from public.get_fence_estimate_draft(denied_auth_id, fixture_estimate_id);
  if result.result_code <> 'forbidden' then raise exception 'Users without Sales portal access must not read.'; end if;

  update public.estimates set status = 'sent' where id = fixture_estimate_id;
  select * into result from public.save_fence_estimate_draft(
    editor_auth_id, fixture_estimate_id, 2, 'fence-layout-v1', array[12], false
  );
  if result.result_code <> 'non_draft' then raise exception 'Non-draft estimates must reject Fence saves.'; end if;
  update public.estimates set status = 'draft' where id = fixture_estimate_id;

  select * into result from public.save_fence_estimate_draft(
    editor_auth_id, legacy_estimate_id, 0, 'fence-layout-v1', array[12], false
  );
  if result.result_code <> 'not_found' then raise exception 'Legacy estimates must reject Fence persistence.'; end if;

  -- The historical local estimate constraint still permits only V1 even though
  -- the current builder also recognizes V2. Relax it only inside this rollback
  -- test to prove the Fence RPC itself accepts the supported V2 policy.
  alter table public.estimates drop constraint estimates_structured_policy_version;
  update public.estimates
  set calculation_policy_version = 'structured-estimate-v2-material-tax',
    calculation_revision = 0,
    costs_complete = false,
    prices_complete = false
  where id = legacy_estimate_id;
  select * into result from public.save_fence_estimate_draft(
    editor_auth_id, legacy_estimate_id, 0, 'fence-layout-v1', array[12], false
  );
  if result.result_code <> 'ok' or result.next_revision <> 1 then
    raise exception 'Supported structured-estimate-v2-material-tax must accept Fence persistence.';
  end if;

  begin
    update public.fence_estimate_draft_revisions
    set total_length_inches = 1
    where fence_draft_id = draft_id and revision = 1;
    raise exception 'Revision UPDATE must be prevented.';
  exception when sqlstate '55000' then null;
  end;
  begin
    delete from public.fence_estimate_draft_revisions
    where fence_draft_id = draft_id and revision = 1;
    raise exception 'Revision DELETE must be prevented.';
  exception when sqlstate '55000' then null;
  end;

  begin
    delete from public.estimates where id = fixture_estimate_id;
    raise exception 'Estimate deletion must not erase Fence evidence.';
  exception when foreign_key_violation then null;
  end;

  drop index public.company_settings_single_row;
  insert into public.company_settings (id, company_name)
  values (second_company_id, 'Disposable second-company Fence fixture');
  begin
    perform * from public.get_fence_estimate_draft(editor_auth_id, fixture_estimate_id);
    raise exception 'A second company must fail closed for Fence reads.';
  exception when sqlstate '55000' then null;
  end;
  begin
    perform * from public.save_fence_estimate_draft(
      editor_auth_id, fixture_estimate_id, 2, 'fence-layout-v1', array[12], false
    );
    raise exception 'A second company must fail closed for Fence saves.';
  exception when sqlstate '55000' then null;
  end;
end
$test$;

do $privileges$
declare
  function_signature text;
  table_name text;
begin
  foreach function_signature in array array[
    'public.is_valid_fence_layout_snapshot(integer[],integer)',
    'public.assert_single_company_fence_estimate_scope()',
    'public.get_fence_estimate_draft(uuid,uuid)',
    'public.save_fence_estimate_draft(uuid,uuid,integer,text,integer[],boolean,text,text,text,text,text,integer,text)'
  ] loop
    if not has_function_privilege('service_role', function_signature, 'EXECUTE') then
      raise exception 'service_role requires execute on %.', function_signature;
    end if;
    if has_function_privilege('authenticated', function_signature, 'EXECUTE')
      or has_function_privilege('anon', function_signature, 'EXECUTE')
      or has_function_privilege('public', function_signature, 'EXECUTE') then
      raise exception 'Browser and PUBLIC roles must not execute %.', function_signature;
    end if;
  end loop;

  foreach table_name in array array[
    'public.fence_estimate_drafts',
    'public.fence_estimate_draft_revisions'
  ] loop
    if has_table_privilege('authenticated', table_name, 'SELECT')
      or has_table_privilege('anon', table_name, 'SELECT') then
      raise exception 'Browser roles must not read %.', table_name;
    end if;
    if not exists (
      select 1 from pg_class where oid = table_name::regclass and relrowsecurity
    ) then
      raise exception '% must have RLS enabled.', table_name;
    end if;
    if exists (
      select 1 from pg_policy where polrelid = table_name::regclass
    ) then
      raise exception '% must not expose a browser RLS policy.', table_name;
    end if;
  end loop;

  if has_table_privilege('service_role', 'public.fence_estimate_draft_revisions', 'UPDATE')
    or has_table_privilege('service_role', 'public.fence_estimate_draft_revisions', 'DELETE') then
    raise exception 'service_role must not update or delete Fence revisions.';
  end if;
end
$privileges$;

rollback;
