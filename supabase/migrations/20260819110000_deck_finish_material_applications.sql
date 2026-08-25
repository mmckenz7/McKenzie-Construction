begin;

alter table public.guided_deck_finish_selection_revisions
  drop constraint guided_deck_finish_selection_revisions_snapshot_version_check;
alter table public.guided_deck_finish_selection_revisions
  add constraint guided_deck_finish_selection_revisions_snapshot_version_check
  check (snapshot_version in ('custom-deck-finish-draft-v1','custom-deck-finish-draft-v2'));

create or replace function public.is_valid_guided_deck_finish_selection(requested jsonb)
returns boolean
language plpgsql immutable
set search_path=pg_catalog,public
as $function$
declare
  line jsonb;
  expected_line_count integer;
begin
  expected_line_count := case requested->>'version'
    when 'custom-deck-finish-draft-v1' then 2
    when 'custom-deck-finish-draft-v2' then 3
    else 0 end;
  if jsonb_typeof(requested)<>'object'
    or expected_line_count=0
    or (select count(*) from jsonb_object_keys(requested))<>8
    or exists(select 1 from jsonb_object_keys(requested) key where key not in (
      'version','deckingFamily','compositeColor','railingFamily','stairRailSides',
      'woodRailingRate','board','lines'
    ))
    or requested->>'deckingFamily' not in ('wood','composite')
    or (requested->'compositeColor'<>'null'::jsonb and requested->>'compositeColor' not in ('brown','gray','cedar','redwood','coastal'))
    or requested->>'railingFamily' not in ('wood','metal','cable','none')
    or jsonb_typeof(requested->'stairRailSides')<>'number'
    or (requested->>'stairRailSides')::integer not in (1,2)
    or (requested->'woodRailingRate'<>'null'::jsonb and (
      jsonb_typeof(requested->'woodRailingRate')<>'number'
      or (requested->>'woodRailingRate')::numeric<0
      or (requested->>'woodRailingRate')::numeric>100000
    ))
    or jsonb_typeof(requested->'board')<>'object'
    or (select count(*) from jsonb_object_keys(requested->'board'))<>4
    or exists(select 1 from jsonb_object_keys(requested->'board') key where key not in (
      'actualWidthInches','gapInches','stockLengthFeet','wastePercent'
    ))
    or jsonb_typeof(requested->'board'->'actualWidthInches')<>'number'
    or (requested->'board'->>'actualWidthInches')::numeric<=0
    or (requested->'board'->>'actualWidthInches')::numeric>100
    or jsonb_typeof(requested->'board'->'gapInches')<>'number'
    or (requested->'board'->>'gapInches')::numeric<0
    or (requested->'board'->>'gapInches')::numeric>12
    or (requested->'board'->'stockLengthFeet'<>'null'::jsonb and (
      jsonb_typeof(requested->'board'->'stockLengthFeet')<>'number'
      or (requested->'board'->>'stockLengthFeet')::numeric<0
      or (requested->'board'->>'stockLengthFeet')::numeric>1000
    ))
    or jsonb_typeof(requested->'board'->'wastePercent')<>'number'
    or (requested->'board'->>'wastePercent')::numeric<0
    or (requested->'board'->>'wastePercent')::numeric>100
    or jsonb_typeof(requested->'lines')<>'array'
    or jsonb_array_length(requested->'lines')<>expected_line_count then return false; end if;

  for line in select value from jsonb_array_elements(requested->'lines') loop
    if jsonb_typeof(line)<>'object'
      or (select count(*) from jsonb_object_keys(line))<>7
      or exists(select 1 from jsonb_object_keys(line) key where key not in (
        'key','description','quantity','unit','unitCost','sourceReference','catalogMaterialId'
      ))
      or line->>'key' not in ('custom_decking','custom_decking_square_edge','custom_railing')
      or (requested->>'version'='custom-deck-finish-draft-v1' and line->>'key'='custom_decking_square_edge')
      or jsonb_typeof(line->'description')<>'string'
      or length(line->>'description')>2000
      or jsonb_typeof(line->'unit')<>'string'
      or length(line->>'unit')>40
      or jsonb_typeof(line->'sourceReference')<>'string'
      or length(line->>'sourceReference')>1000
      or (line->'quantity'<>'null'::jsonb and (
        jsonb_typeof(line->'quantity')<>'number'
        or (line->>'quantity')::numeric<0
        or (line->>'quantity')::numeric>1000000
      ))
      or (line->'unitCost'<>'null'::jsonb and (
        jsonb_typeof(line->'unitCost')<>'number'
        or (line->>'unitCost')::numeric<0
        or (line->>'unitCost')::numeric>1000000
      ))
      or (line->'catalogMaterialId'<>'null'::jsonb and (
        jsonb_typeof(line->'catalogMaterialId')<>'string'
        or (line->>'catalogMaterialId') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      )) then return false; end if;
  end loop;
  if (select count(distinct value->>'key') from jsonb_array_elements(requested->'lines'))<>expected_line_count
    or not exists(select 1 from jsonb_array_elements(requested->'lines') value where value->>'key'='custom_decking')
    or not exists(select 1 from jsonb_array_elements(requested->'lines') value where value->>'key'='custom_railing')
    or (requested->>'version'='custom-deck-finish-draft-v2' and not exists(
      select 1 from jsonb_array_elements(requested->'lines') value where value->>'key'='custom_decking_square_edge'
    )) then return false; end if;
  return true;
exception when others then return false;
end
$function$;

create or replace function public.create_guided_deck_finish_selection_revision(
  requested_auth_user_id uuid,
  requested_visit_id uuid,
  requested_expected_selection_revision integer,
  requested_shape_revision_id uuid,
  requested_shape_revision integer,
  requested_shape_digest text,
  requested_structural_plan_revision_id uuid,
  requested_idempotency_key text,
  requested_request_sha256 text,
  requested_selection_snapshot jsonb
)
returns table(result_code text,finish_selection_revision_id uuid,next_selection_revision integer,idempotent_replay boolean)
language plpgsql security definer
set search_path=pg_catalog,public
as $function$
declare
  company uuid;
  visit public.guided_site_visits;
  estimate_record public.estimates;
  shape public.guided_deck_shape_revisions;
  structural_plan public.guided_deck_structural_plan_revisions;
  existing public.guided_deck_finish_selection_revisions;
  prior public.guided_deck_finish_selection_revisions;
  current_revision integer;
  created_id uuid;
begin
  company := public.guided_site_visit_actor_company(requested_auth_user_id);
  if company is null then return query select 'forbidden',null::uuid,null::integer,false; return; end if;
  if requested_expected_selection_revision<0
    or requested_shape_digest !~ '^[0-9a-f]{64}$'
    or requested_request_sha256 !~ '^[0-9a-f]{64}$'
    or nullif(btrim(coalesce(requested_idempotency_key,'')),'') is null
    or length(requested_idempotency_key)>200
    or not public.is_valid_guided_deck_finish_selection(requested_selection_snapshot) then
    return query select 'invalid_selection',null::uuid,null::integer,false; return;
  end if;
  select * into existing from public.guided_deck_finish_selection_revisions
  where company_id=company and idempotency_key=requested_idempotency_key;
  if existing.id is not null then
    if existing.visit_id=requested_visit_id
      and existing.selection_revision=requested_expected_selection_revision+1
      and existing.shape_revision_id=requested_shape_revision_id
      and existing.shape_revision=requested_shape_revision
      and existing.shape_digest=requested_shape_digest
      and existing.structural_plan_revision_id=requested_structural_plan_revision_id
      and existing.request_sha256=requested_request_sha256
      and existing.selection_snapshot=requested_selection_snapshot
      and existing.saved_by_auth_user_id=requested_auth_user_id then
      return query select 'ok',existing.id,existing.selection_revision,true;
    else
      return query select 'idempotency_conflict',existing.id,existing.selection_revision,false;
    end if;
    return;
  end if;
  select * into visit from public.guided_site_visits
  where id=requested_visit_id and company_id=company for share;
  if visit.id is null then return query select 'not_found',null::uuid,null::integer,false; return; end if;
  if visit.status<>'completed' then return query select 'visit_incomplete',null::uuid,null::integer,false; return; end if;
  select * into estimate_record from public.estimates
  where id=visit.target_estimate_id and status='draft' for share;
  if estimate_record.id is null then return query select 'not_editable',null::uuid,null::integer,false; return; end if;

  perform pg_advisory_xact_lock(hashtextextended(company::text||':'||visit.id::text||':finish-selection',0));
  select * into shape from public.guided_deck_shape_revisions
  where company_id=company and visit_id=visit.id order by shape_revision desc limit 1;
  select * into structural_plan from public.guided_deck_structural_plan_revisions
  where company_id=company and visit_id=visit.id order by plan_revision desc limit 1;
  if shape.id is null or structural_plan.id is null
    or shape.id<>requested_shape_revision_id
    or shape.shape_revision<>requested_shape_revision
    or shape.request_sha256<>requested_shape_digest
    or structural_plan.id<>requested_structural_plan_revision_id
    or structural_plan.shape_revision_id<>shape.id
    or structural_plan.shape_revision<>shape.shape_revision
    or structural_plan.shape_digest<>shape.request_sha256 then
    return query select 'stale_design',null::uuid,null::integer,false; return;
  end if;
  select * into prior from public.guided_deck_finish_selection_revisions
  where company_id=company and visit_id=visit.id order by selection_revision desc limit 1;
  current_revision:=coalesce(prior.selection_revision,0);
  if current_revision<>requested_expected_selection_revision then
    return query select 'stale_selection_revision',prior.id,current_revision,false; return;
  end if;
  insert into public.guided_deck_finish_selection_revisions(
    company_id,visit_id,target_estimate_id,selection_revision,shape_revision_id,
    shape_revision,shape_digest,structural_plan_revision_id,snapshot_version,
    selection_snapshot,supersedes_selection_revision_id,idempotency_key,
    request_sha256,saved_by_auth_user_id
  ) values(
    company,visit.id,visit.target_estimate_id,current_revision+1,shape.id,
    shape.shape_revision,shape.request_sha256,structural_plan.id,
    requested_selection_snapshot->>'version',requested_selection_snapshot,prior.id,
    requested_idempotency_key,requested_request_sha256,requested_auth_user_id
  ) returning id into created_id;
  return query select 'ok',created_id,current_revision+1,false;
end
$function$;

create table public.deck_estimate_finish_material_applications (
  id uuid primary key,
  company_id uuid not null references public.company_settings(id) on delete restrict,
  estimate_id uuid not null references public.estimates(id) on delete restrict,
  visit_id uuid not null,
  finish_selection_revision_id uuid not null,
  finish_selection_revision integer not null check(finish_selection_revision>0),
  expected_calculation_revision integer not null check(expected_calculation_revision>=0),
  resulting_calculation_revision integer not null,
  application_version text not null check(application_version='deck-finish-material-application-v1'),
  idempotency_key text not null check(idempotency_key ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  preview_binding text not null check(preview_binding ~ '^[0-9a-f]{64}$'),
  evidence_snapshot jsonb not null check(jsonb_typeof(evidence_snapshot)='object'),
  section_id uuid not null references public.estimate_sections(id) on delete restrict,
  applied_by uuid not null references public.app_users(id) on delete restrict,
  applied_at timestamptz not null default now(),
  unique(estimate_id,visit_id),
  unique(company_id,idempotency_key),
  foreign key(visit_id,company_id) references public.guided_site_visits(id,company_id) on delete restrict,
  foreign key(finish_selection_revision_id,visit_id,company_id)
    references public.guided_deck_finish_selection_revisions(id,visit_id,company_id) on delete restrict,
  check(resulting_calculation_revision=expected_calculation_revision+1)
);

create table public.deck_estimate_finish_material_application_lines (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.deck_estimate_finish_material_applications(id) on delete restrict,
  estimate_line_item_id uuid not null unique references public.estimate_line_items(id) on delete restrict,
  ordinal integer not null check(ordinal>=0),
  line_key text not null check(line_key in ('custom_decking','custom_decking_square_edge','custom_railing')),
  source_reference text not null check(length(source_reference) between 1 and 1000),
  formula text not null check(length(formula) between 1 and 2000),
  raw_quantity numeric not null check(raw_quantity>0),
  raw_unit_cost numeric not null check(raw_unit_cost>0),
  evidence_line_snapshot jsonb not null check(jsonb_typeof(evidence_line_snapshot)='object'),
  unique(application_id,ordinal),
  unique(application_id,line_key)
);

create trigger prevent_deck_finish_material_application_mutation
before update or delete on public.deck_estimate_finish_material_applications
for each row execute function public.prevent_deck_takeoff_application_mutation();
create trigger prevent_deck_finish_material_application_line_mutation
before update or delete on public.deck_estimate_finish_material_application_lines
for each row execute function public.prevent_deck_takeoff_application_mutation();

alter table public.deck_estimate_finish_material_applications enable row level security;
alter table public.deck_estimate_finish_material_application_lines enable row level security;
revoke all on table public.deck_estimate_finish_material_applications,
  public.deck_estimate_finish_material_application_lines from public,anon,authenticated,service_role;
grant select,insert on table public.deck_estimate_finish_material_applications,
  public.deck_estimate_finish_material_application_lines to service_role;

create function public.apply_reviewed_deck_finish_materials(
  requested_auth_user_id uuid,
  requested_estimate_id uuid,
  requested_visit_id uuid,
  requested_finish_selection_revision_id uuid,
  requested_application_id uuid,
  requested_idempotency_key text,
  requested_expected_finish_selection_revision integer,
  requested_expected_calculation_revision integer,
  requested_application_version text,
  requested_preview_binding text,
  requested_section_id uuid,
  requested_new_items jsonb,
  requested_item_calculations jsonb,
  requested_estimate_calculation jsonb,
  requested_evidence_snapshot jsonb
)
returns table(result_code text,next_calculation_revision integer,resource_id uuid)
language plpgsql security invoker set search_path=pg_catalog,public
as $function$
declare
  access jsonb;
  company uuid;
  actor public.app_users;
  estimate_record public.estimates;
  visit public.guided_site_visits;
  finish public.guided_deck_finish_selection_revisions;
  latest_finish public.guided_deck_finish_selection_revisions;
  prior public.deck_estimate_finish_material_applications;
  item_count integer;
begin
  select public.get_effective_user_access(requested_auth_user_id) into access;
  if access is null
    or access->'portal_access'->>'sales' is distinct from 'true'
    or access->'permissions'->>'edit_prices' is distinct from 'true' then
    return query select 'forbidden',null::integer,null::uuid; return;
  end if;
  select * into actor from public.app_users
  where auth_user_id=requested_auth_user_id
    and id=(access->>'user_id')::uuid
    and company_id=(access->>'company_id')::uuid and is_active=true;
  company:=public.assert_single_company_fence_estimate_scope();
  if actor.id is null or actor.company_id is distinct from company then
    return query select 'forbidden',null::integer,null::uuid; return;
  end if;
  if requested_application_version<>'deck-finish-material-application-v1'
    or requested_expected_finish_selection_revision<1
    or requested_expected_calculation_revision<0
    or requested_idempotency_key !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or requested_preview_binding !~ '^[0-9a-f]{64}$'
    or jsonb_typeof(requested_new_items)<>'array'
    or jsonb_typeof(requested_item_calculations)<>'array'
    or jsonb_typeof(requested_estimate_calculation)<>'object'
    or jsonb_typeof(requested_evidence_snapshot)<>'object' then
    return query select 'invalid_application',null::integer,null::uuid; return;
  end if;
  select * into estimate_record from public.estimates
  where id=requested_estimate_id for update;
  if estimate_record.id is null or estimate_record.calculation_policy_version<>'structured-estimate-v2-material-tax' then
    return query select 'not_found',null::integer,null::uuid; return;
  end if;
  if estimate_record.status<>'draft' then
    return query select 'non_draft',estimate_record.calculation_revision,null::uuid; return;
  end if;
  select * into visit from public.guided_site_visits
  where id=requested_visit_id and company_id=company and target_estimate_id=requested_estimate_id for share;
  if visit.id is null or visit.status<>'completed' then
    return query select 'not_found',estimate_record.calculation_revision,null::uuid; return;
  end if;
  select * into finish from public.guided_deck_finish_selection_revisions
  where id=requested_finish_selection_revision_id and company_id=company
    and visit_id=requested_visit_id and target_estimate_id=requested_estimate_id for share;
  select * into latest_finish from public.guided_deck_finish_selection_revisions
  where company_id=company and visit_id=requested_visit_id order by selection_revision desc limit 1;
  if finish.id is null or latest_finish.id<>finish.id
    or finish.selection_revision<>requested_expected_finish_selection_revision then
    return query select 'stale_selection_revision',estimate_record.calculation_revision,null::uuid; return;
  end if;
  select * into prior from public.deck_estimate_finish_material_applications
  where id=requested_application_id
    or (company_id=company and idempotency_key=requested_idempotency_key)
    or (estimate_id=requested_estimate_id and visit_id=requested_visit_id)
  order by applied_at limit 1;
  if prior.id is not null then
    if prior.id=requested_application_id and prior.company_id=company
      and prior.finish_selection_revision_id=requested_finish_selection_revision_id
      and prior.idempotency_key=requested_idempotency_key
      and prior.preview_binding=requested_preview_binding then
      return query select 'replayed_application',estimate_record.calculation_revision,prior.id;
    else
      return query select 'already_applied',estimate_record.calculation_revision,prior.id;
    end if;
    return;
  end if;
  if estimate_record.calculation_revision<>requested_expected_calculation_revision then
    return query select 'stale_calculation_revision',estimate_record.calculation_revision,null::uuid; return;
  end if;
  item_count:=jsonb_array_length(requested_new_items);
  if item_count not between 1 and 3
    or jsonb_typeof(requested_evidence_snapshot->'lines')<>'array'
    or jsonb_array_length(requested_evidence_snapshot->'lines')<>item_count
    or requested_evidence_snapshot->>'version'<>requested_application_version
    or requested_evidence_snapshot->>'previewBinding'<>requested_preview_binding
    or (requested_evidence_snapshot->>'finishSelectionRevisionId')::uuid<>requested_finish_selection_revision_id
    or (requested_evidence_snapshot->>'finishSelectionRevision')::integer<>requested_expected_finish_selection_revision
    or requested_evidence_snapshot->'selection'<>finish.selection_snapshot
    or (select count(distinct item->>'id') from jsonb_array_elements(requested_new_items) item)<>item_count
    or (select count(distinct evidence->>'key') from jsonb_array_elements(requested_evidence_snapshot->'lines') evidence)<>item_count
    or exists(select 1 from jsonb_array_elements(requested_new_items) item where jsonb_typeof(item)<>'object')
    or exists(select 1 from jsonb_array_elements(requested_evidence_snapshot->'lines') evidence where jsonb_typeof(evidence)<>'object')
    or exists(select 1 from jsonb_array_elements(requested_new_items) item
      where exists(select 1 from public.estimate_line_items existing where existing.id=(item->>'id')::uuid))
    or exists(select 1 from jsonb_array_elements(requested_new_items) item where
      (item->>'section_id')::uuid<>requested_section_id
      or item->>'item_type'<>'standard'
      or (item->>'quantity')::numeric<=0
      or (item->>'material_unit_cost')::numeric<=0
      or (item->>'labor_unit_cost')::numeric<>0
      or (item->>'subcontractor_unit_cost')::numeric<>0
      or (item->>'equipment_unit_cost')::numeric<>0
      or (item->>'other_direct_unit_cost')::numeric<>0
      or (item->>'material_waste_percent')::numeric<>0
      or (item->>'item_markup_percent')::numeric<>0
      or (item->>'taxable')::boolean<>false
      or (item->>'is_included')::boolean<>true
      or item->'fixed_customer_price'<>'null'::jsonb)
    or exists(select 1 from jsonb_array_elements(requested_evidence_snapshot->'lines') evidence where
      evidence->>'key' not in ('custom_decking','custom_decking_square_edge','custom_railing')
      or (evidence->>'quantity')::numeric<=0
      or (evidence->>'unitCost')::numeric<=0
      or length(evidence->>'sourceReference') not between 1 and 1000
      or length(evidence->>'formula') not between 1 and 2000)
    or exists(
      select 1
      from jsonb_array_elements(requested_new_items) with ordinality ni(item,ordinality)
      join jsonb_array_elements(requested_evidence_snapshot->'lines') with ordinality el(evidence,ordinality) using(ordinality)
      where (evidence->>'estimateLineItemId')::uuid<>(item->>'id')::uuid
        or evidence->>'customerDescription'<>item->>'customer_description'
        or evidence->>'quantity'<>item->>'quantity'
        or evidence->>'unit'<>item->>'unit'
        or evidence->>'unitCost'<>item->>'material_unit_cost'
    ) then
    return query select 'invalid_application',estimate_record.calculation_revision,null::uuid; return;
  end if;
  if exists(select 1 from public.estimate_sections where id=requested_section_id) then
    return query select 'application_identity_conflict',estimate_record.calculation_revision,null::uuid; return;
  end if;
  begin
    insert into public.estimate_sections(id,estimate_id,name,customer_description,internal_notes,sort_order)
    values(requested_section_id,requested_estimate_id,'Deck finish materials','Decking and railing finish materials',
      'Bound to an immutable reviewed Deck finish selection and estimating-price evidence.',
      coalesce((select max(sort_order)+1 from public.estimate_sections where estimate_id=requested_estimate_id),0));
    insert into public.estimate_line_items(
      id,estimate_id,section_id,item_type,quantity,unit,customer_description,internal_description,
      material_unit_cost,labor_unit_cost,subcontractor_unit_cost,equipment_unit_cost,other_direct_unit_cost,
      material_waste_percent,item_markup_percent,taxable,is_included,fixed_customer_price,sort_order,
      costs_complete,prices_complete,line_type,category,description,base_unit_cost,waste_percent,pricing_method,
      adjusted_quantity,estimated_cost,unit_price,total_price,estimated_profit,is_optional,
      material_catalog_id,labor_catalog_id,estimate_option_id,metadata
    ) select (item->>'id')::uuid,requested_estimate_id,requested_section_id,'standard',(item->>'quantity')::numeric,item->>'unit',
      item->>'customer_description',item->>'internal_description',(item->>'material_unit_cost')::numeric,0,0,0,0,0,0,false,true,null,
      (item->>'sort_order')::integer,true,true,'other','structured',item->>'customer_description',(item->>'material_unit_cost')::numeric,
      0,'markup',(item->>'quantity')::numeric,0,0,0,0,false,nullif(evidence->>'catalogMaterialId','')::uuid,null,null,'{}'::jsonb
    from jsonb_array_elements(requested_new_items) with ordinality ni(item,ordinality)
    join jsonb_array_elements(requested_evidence_snapshot->'lines') with ordinality el(evidence,ordinality) using(ordinality);
    insert into public.deck_estimate_finish_material_applications(
      id,company_id,estimate_id,visit_id,finish_selection_revision_id,finish_selection_revision,
      expected_calculation_revision,resulting_calculation_revision,application_version,idempotency_key,
      preview_binding,evidence_snapshot,section_id,applied_by
    ) values(requested_application_id,company,requested_estimate_id,requested_visit_id,finish.id,finish.selection_revision,
      requested_expected_calculation_revision,requested_expected_calculation_revision+1,requested_application_version,
      requested_idempotency_key,requested_preview_binding,requested_evidence_snapshot,requested_section_id,actor.id);
    insert into public.deck_estimate_finish_material_application_lines(
      application_id,estimate_line_item_id,ordinal,line_key,source_reference,formula,raw_quantity,raw_unit_cost,evidence_line_snapshot
    ) select requested_application_id,(evidence->>'estimateLineItemId')::uuid,ordinality-1,evidence->>'key',
      evidence->>'sourceReference',evidence->>'formula',(evidence->>'quantity')::numeric,(evidence->>'unitCost')::numeric,evidence
    from jsonb_array_elements(requested_evidence_snapshot->'lines') with ordinality source(evidence,ordinality);
    perform public.persist_structured_estimate_outputs(requested_estimate_id,requested_expected_calculation_revision,
      requested_item_calculations,requested_estimate_calculation);
  exception when unique_violation or check_violation or not_null_violation or foreign_key_violation
    or invalid_text_representation or numeric_value_out_of_range or sqlstate 'P0001' then
    return query select 'invalid_application',estimate_record.calculation_revision,null::uuid; return;
  end;
  return query select 'ok',requested_expected_calculation_revision+1,requested_application_id;
end
$function$;

revoke all on function public.apply_reviewed_deck_finish_materials(
  uuid,uuid,uuid,uuid,uuid,text,integer,integer,text,text,uuid,jsonb,jsonb,jsonb,jsonb
) from public,anon,authenticated;
grant execute on function public.apply_reviewed_deck_finish_materials(
  uuid,uuid,uuid,uuid,uuid,text,integer,integer,text,text,uuid,jsonb,jsonb,jsonb,jsonb
) to service_role;

comment on table public.deck_estimate_finish_material_applications is
  'One append-only reviewed finish-material cost application per Deck estimate and visit; structural takeoff remains separate.';

commit;
