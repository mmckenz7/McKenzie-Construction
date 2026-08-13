begin;

create or replace function public.record_guided_site_visit_intake_classification(
  requested_auth_user_id uuid,
  requested_visit_id uuid,
  requested_attempt_id uuid,
  requested_idempotency_key text,
  requested_provider text,
  requested_model_version text,
  requested_prompt_version text,
  requested_schema_version text,
  requested_request_sha256 text,
  requested_response_sha256 text,
  requested_diagnostic_class text,
  requested_issue_codes text[],
  requested_proposals jsonb
)
returns table(result_code text, review_id uuid, idempotent_replay boolean)
language plpgsql
security definer
set search_path=pg_catalog,public
as $f$
declare
  company uuid;
  attempt public.guided_site_visit_intake_attempts;
  existing public.guided_site_visit_intake_classification_reviews;
  created uuid;
begin
  company:=public.guided_site_visit_actor_company(requested_auth_user_id);
  select * into existing
    from public.guided_site_visit_intake_classification_reviews
    where company_id=company and idempotency_key=requested_idempotency_key;
  if existing.id is not null then
    return query select
      case when existing.intake_attempt_id=requested_attempt_id
        and existing.created_by_auth_user_id=requested_auth_user_id
        and existing.diagnostic_class=requested_diagnostic_class
        and existing.issue_codes=requested_issue_codes
        and existing.proposals=requested_proposals
      then 'ok' else 'idempotency_conflict' end,
      existing.id,
      true;
    return;
  end if;

  select * into attempt
    from public.guided_site_visit_intake_attempts
    where id=requested_attempt_id
      and visit_id=requested_visit_id
      and company_id=company
      and state='confirmed';
  if attempt.id is null then
    return query select 'not_found',null::uuid,false;
    return;
  end if;

  if requested_diagnostic_class not in('classified','retake_recommended','review_unavailable','unsupported_media')
    or jsonb_typeof(requested_proposals)<>'array'
    or requested_issue_codes is null
    or requested_diagnostic_class='classified' and cardinality(requested_issue_codes)<>0
    or requested_diagnostic_class<>'classified' and requested_proposals<>'[]'::jsonb
    or exists(
      select 1
      from jsonb_array_elements(requested_proposals) p
      left join public.guided_site_visit_items i
        on i.id=(p->>'visitItemId')::uuid
        and i.visit_id=attempt.visit_id
        and i.company_id=company
      where jsonb_typeof(p)<>'object'
        or i.id is null
        or p->>'criterionKey' !~ '^[a-z][a-z0-9_]{0,63}$'
        or not ((p->>'criterionKey')=any(public.guided_site_visit_visible_fact_keys(i.item_key)))
    )
  then
    return query select 'invalid_proposals',null::uuid,false;
    return;
  end if;

  insert into public.guided_site_visit_intake_classification_reviews(
    company_id,visit_id,batch_id,member_ordinal,intake_attempt_id,asset_id,
    idempotency_key,provider,model_version,prompt_version,schema_version,
    request_sha256,response_sha256,diagnostic_class,issue_codes,proposals,
    created_by_auth_user_id
  ) values (
    company,attempt.visit_id,attempt.batch_id,attempt.member_ordinal,attempt.id,attempt.asset_id,
    requested_idempotency_key,requested_provider,requested_model_version,requested_prompt_version,
    requested_schema_version,requested_request_sha256,requested_response_sha256,
    requested_diagnostic_class,requested_issue_codes,requested_proposals,requested_auth_user_id
  ) returning id into created;
  return query select 'ok',created,false;
end;
$f$;

create or replace function public.decide_guided_site_visit_intake_assignment(
  requested_auth_user_id uuid,
  requested_visit_id uuid,
  requested_attempt_id uuid,
  requested_review_id uuid,
  requested_item_id uuid,
  requested_criterion_key text,
  requested_decision text,
  requested_supersedes_event_id uuid,
  requested_expected_revision integer,
  requested_idempotency_key text
)
returns table(result_code text,event_id uuid,next_revision integer,idempotent_replay boolean)
language plpgsql
security definer
set search_path=pg_catalog,public
as $f$
declare
  company uuid;
  visit public.guided_site_visits;
  attempt public.guided_site_visit_intake_attempts;
  review public.guided_site_visit_intake_classification_reviews;
  item public.guided_site_visit_items;
  existing public.guided_site_visit_intake_assignment_events;
  superseded public.guided_site_visit_intake_assignment_events;
  created uuid;
  nextv integer;
  active_count integer;
begin
  company:=public.guided_site_visit_actor_company(requested_auth_user_id);
  select * into existing
    from public.guided_site_visit_intake_assignment_events
    where company_id=company and idempotency_key=requested_idempotency_key;
  if existing.id is not null then
    if existing.visit_id=requested_visit_id
      and existing.intake_attempt_id=requested_attempt_id
      and existing.classification_review_id is not distinct from requested_review_id
      and existing.visit_item_id is not distinct from requested_item_id
      and existing.criterion_key is not distinct from requested_criterion_key
      and existing.decision=requested_decision
      and existing.supersedes_assignment_event_id is not distinct from requested_supersedes_event_id
      and existing.requested_expected_revision=requested_expected_revision
      and existing.decided_by_auth_user_id=requested_auth_user_id
    then
      return query select 'ok',existing.id,existing.resulting_visit_revision,true;
    else
      return query select 'idempotency_conflict',existing.id,null::integer,false;
    end if;
    return;
  end if;

  select * into visit
    from public.guided_site_visits
    where id=requested_visit_id and company_id=company
    for update;
  if visit.id is null then
    return query select 'not_found',null::uuid,null::integer,false;
    return;
  end if;
  if visit.revision<>requested_expected_revision then
    return query select 'stale_revision',null::uuid,visit.revision,false;
    return;
  end if;

  select * into attempt
    from public.guided_site_visit_intake_attempts
    where id=requested_attempt_id and visit_id=visit.id and company_id=company and state='confirmed';
  select * into review
    from public.guided_site_visit_intake_classification_reviews
    where id=requested_review_id and intake_attempt_id=attempt.id and company_id=company;
  select * into item
    from public.guided_site_visit_items
    where id=requested_item_id and visit_id=visit.id and company_id=company;

  if attempt.id is null
    or review.id is null
    or review.diagnostic_class<>'classified'
    or item.id is null
    or requested_decision not in('accepted','corrected','excluded')
    or not (requested_criterion_key=any(public.guided_site_visit_visible_fact_keys(item.item_key)))
  then
    return query select 'invalid_assignment',null::uuid,visit.revision,false;
    return;
  end if;
  if requested_decision='accepted' and not exists(
    select 1 from jsonb_array_elements(review.proposals) p
    where p->>'visitItemId'=item.id::text and p->>'criterionKey'=requested_criterion_key
  ) then
    return query select 'proposal_mismatch',null::uuid,visit.revision,false;
    return;
  end if;

  if requested_supersedes_event_id is not null then
    select * into superseded
      from public.guided_site_visit_intake_assignment_events
      where id=requested_supersedes_event_id and company_id=company and visit_id=visit.id
      for update;
    if superseded.id is null
      or superseded.intake_attempt_id<>attempt.id
      or superseded.visit_item_id<>item.id
      or superseded.criterion_key<>requested_criterion_key
      or exists(select 1 from public.guided_site_visit_intake_assignment_events where supersedes_assignment_event_id=superseded.id)
    then
      return query select 'invalid_supersession',null::uuid,visit.revision,false;
      return;
    end if;
  end if;

  if requested_decision in('accepted','corrected') then
    select count(distinct asset_id) into active_count
    from (
      select p.asset_id
      from public.guided_site_visit_photo_attempts p
      where p.visit_item_id=item.id and p.state='confirmed'
      union
      select e.asset_id
      from public.guided_site_visit_intake_assignment_events e
      where e.visit_item_id=item.id
        and e.decision in('accepted','corrected')
        and not exists(
          select 1 from public.guided_site_visit_intake_assignment_events later
          where later.supersedes_assignment_event_id=e.id
        )
    ) s;
    if active_count>=5 and not exists(
      select 1
      from public.guided_site_visit_intake_assignment_events e
      where e.visit_item_id=item.id
        and e.asset_id=attempt.asset_id
        and e.decision in('accepted','corrected')
        and not exists(
          select 1 from public.guided_site_visit_intake_assignment_events later
          where later.supersedes_assignment_event_id=e.id
        )
    ) then
      return query select 'active_evidence_limit',null::uuid,visit.revision,false;
      return;
    end if;
  end if;

  nextv:=visit.revision+1;
  insert into public.guided_site_visit_intake_assignment_events(
    company_id,visit_id,batch_id,intake_attempt_id,asset_id,classification_review_id,
    visit_item_id,criterion_key,supersedes_assignment_event_id,decision,idempotency_key,
    requested_expected_revision,resulting_visit_revision,decided_by_auth_user_id
  ) values (
    company,visit.id,attempt.batch_id,attempt.id,attempt.asset_id,review.id,item.id,
    requested_criterion_key,requested_supersedes_event_id,requested_decision,
    requested_idempotency_key,requested_expected_revision,nextv,requested_auth_user_id
  ) returning id into created;
  update public.guided_site_visits set revision=nextv,updated_at=now() where id=visit.id;
  return query select 'ok',created,nextv,false;
end;
$f$;

revoke all on function public.record_guided_site_visit_intake_classification(uuid,uuid,uuid,text,text,text,text,text,text,text,text,text[],jsonb) from public,anon,authenticated;
grant execute on function public.record_guided_site_visit_intake_classification(uuid,uuid,uuid,text,text,text,text,text,text,text,text,text[],jsonb) to service_role;
revoke all on function public.decide_guided_site_visit_intake_assignment(uuid,uuid,uuid,uuid,uuid,text,text,uuid,integer,text) from public,anon,authenticated;
grant execute on function public.decide_guided_site_visit_intake_assignment(uuid,uuid,uuid,uuid,uuid,text,text,uuid,integer,text) to service_role;

commit;
