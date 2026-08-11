begin;

-- Expiration pauses the customer-facing proposal and sends the estimate back for
-- internal pricing review. It does not close or deactivate the associated lead.
create or replace function public.get_estimate_proposal_by_token(requested_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  proposal_record public.estimate_proposals;
  lead_record public.leads;
begin
  select * into proposal_record
  from public.estimate_proposals
  where public_token = requested_token
  for update;

  if proposal_record.id is null or proposal_record.status = 'revoked' then
    return null;
  end if;

  if proposal_record.status in ('issued', 'viewed') and proposal_record.expires_at <= now() then
    update public.estimate_proposals
    set status = 'expired', updated_at = now()
    where id = proposal_record.id
    returning * into proposal_record;

    update public.estimates
    set status = 'reviewing', updated_at = now()
    where id = proposal_record.estimate_id
      and status in ('sent', 'viewed');

    if proposal_record.lead_id is not null then
      select * into lead_record
      from public.leads
      where id = proposal_record.lead_id;

      if lead_record.id is not null
        and lead_record.is_active is true
        and lead_record.lead_status is distinct from 'lost'
      then
        insert into public.lead_tasks (
          lead_id,
          task_type,
          title,
          description,
          status,
          priority,
          due_at,
          assigned_to_id,
          assigned_at,
          metadata
        )
        select
          proposal_record.lead_id::text,
          'estimate_pricing_review',
          'Review expired estimate pricing',
          'Review current labor, material, subcontractor, tax, and markup pricing before reissuing the estimate.',
          'open',
          'high',
          now(),
          lead_record.responsible_person_id,
          case when lead_record.responsible_person_id is null then null else now() end,
          jsonb_build_object(
            'estimate_id', proposal_record.estimate_id,
            'estimate_proposal_id', proposal_record.id,
            'expired_at', now(),
            'reason', 'estimate_expired'
          )
        where not exists (
          select 1
          from public.lead_tasks existing_task
          where existing_task.lead_id = proposal_record.lead_id::text
            and existing_task.task_type = 'estimate_pricing_review'
            and existing_task.status in ('open', 'in_progress')
            and existing_task.metadata @> jsonb_build_object(
              'estimate_id', proposal_record.estimate_id
            )
        );

        insert into public.lead_activities (
          lead_id, activity_type, channel, direction, summary, details, metadata
        ) values (
          proposal_record.lead_id::text,
          'estimate_expired',
          'estimate',
          'internal',
          'Estimate expired; pricing review required',
          'The customer link expired without closing the lead. Review current pricing before revising or reissuing the estimate.',
          jsonb_build_object(
            'estimate_id', proposal_record.estimate_id,
            'estimate_proposal_id', proposal_record.id,
            'lead_remains_active', true,
            'pricing_review_required', true
          )
        );
      end if;
    end if;

    return jsonb_build_object('expired', true);
  end if;

  if proposal_record.status = 'issued' then
    update public.estimate_proposals
    set status = 'viewed', opened_at = coalesce(opened_at, now()), updated_at = now()
    where id = proposal_record.id
    returning * into proposal_record;
    update public.estimates set status = 'viewed', updated_at = now()
    where id = proposal_record.estimate_id and status = 'sent';
  end if;

  return jsonb_build_object(
    'status', proposal_record.status,
    'expires_at', proposal_record.expires_at,
    'opened_at', proposal_record.opened_at,
    'responded_at', proposal_record.responded_at,
    'response', proposal_record.response,
    'response_name', proposal_record.response_name,
    'response_notes', proposal_record.response_notes,
    'acknowledged_nonbinding', proposal_record.acknowledged_nonbinding,
    'snapshot', proposal_record.snapshot
  );
end;
$$;

create or replace function public.revoke_estimate_proposal(
  requested_estimate_id uuid,
  requested_app_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  proposal_record public.estimate_proposals;
begin
  if not exists (
    select 1 from public.app_users where id = requested_app_user_id and is_active
  ) then
    raise exception 'Invalid estimate proposal revocation.';
  end if;

  select * into proposal_record
  from public.estimate_proposals
  where estimate_id = requested_estimate_id
  for update;

  if proposal_record.id is null
    or proposal_record.status not in ('issued', 'viewed', 'expired')
  then
    raise exception 'No reviewable estimate proposal is available to revoke.';
  end if;

  update public.estimate_proposals
  set status = 'revoked', revoked_at = now(), updated_at = now()
  where id = proposal_record.id;

  update public.estimates
  set status = 'draft', updated_at = now()
  where id = requested_estimate_id
    and status in ('sent', 'viewed', 'reviewing', 'expired');

  return jsonb_build_object(
    'status', 'revoked',
    'estimate_status', 'draft',
    'pricing_review_required', proposal_record.status = 'expired'
  );
end;
$$;

create or replace function public.complete_estimate_pricing_review_on_reissue()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'issued' and old.status in ('expired', 'revoked') then
    update public.lead_tasks
    set
      status = 'completed',
      completed_at = now(),
      completion_note = 'Estimate pricing review completed by reissuing the customer proposal.',
      updated_at = now()
    where lead_id = new.lead_id::text
      and task_type = 'estimate_pricing_review'
      and status in ('open', 'in_progress')
      and metadata @> jsonb_build_object('estimate_id', new.estimate_id);
  end if;

  return new;
end;
$$;

drop trigger if exists complete_estimate_pricing_review_on_reissue
  on public.estimate_proposals;
create trigger complete_estimate_pricing_review_on_reissue
  after update of status on public.estimate_proposals
  for each row execute function public.complete_estimate_pricing_review_on_reissue();

revoke all on function public.get_estimate_proposal_by_token(uuid)
  from public, anon, authenticated;
revoke all on function public.revoke_estimate_proposal(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.complete_estimate_pricing_review_on_reissue()
  from public, anon, authenticated, service_role;
grant execute on function public.get_estimate_proposal_by_token(uuid)
  to service_role;
grant execute on function public.revoke_estimate_proposal(uuid, uuid)
  to service_role;

comment on function public.get_estimate_proposal_by_token(uuid) is
  'Returns a customer-safe proposal and moves expired proposals into internal pricing review without closing the lead.';
comment on function public.revoke_estimate_proposal(uuid, uuid) is
  'Revokes active or expired proposal links and reopens the estimate for editing. Lead disposition is unchanged.';
comment on function public.complete_estimate_pricing_review_on_reissue() is
  'Trigger-only helper that completes an estimate pricing-review task after reissue.';

commit;
