begin;

create or replace function public.log_change_order_activity()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  activity_type_value text;
  activity_title text;
  is_public_customer_response boolean := false;
begin
  if tg_op = 'INSERT' then
    activity_type_value :=
      'change_order_created';

    activity_title :=
      'Change order created';
  elsif (
    old.status is distinct from new.status
  ) then
    activity_type_value :=
      case new.status
        when 'approved'
          then 'change_order_approved'
        when 'declined'
          then 'change_order_declined'
        when 'completed'
          then 'change_order_completed'
        else 'change_order_updated'
      end;

    activity_title :=
      case new.status
        when 'pending_customer'
          then 'Change order sent for customer approval'
        when 'approved'
          then 'Change order approved'
        when 'declined'
          then 'Change order declined'
        when 'in_progress'
          then 'Change order work started'
        when 'completed'
          then 'Change order completed'
        when 'cancelled'
          then 'Change order cancelled'
        else 'Change order updated'
      end;

    if new.status in ('approved', 'declined') then
      select exists (
        select 1
        from public.project_change_order_responses as response
        where response.change_order_id = new.id
          and response.project_id = new.project_id
          and response.response = new.status
          and response.customer_name = new.approved_by_name
          and response.approval_token = new.approval_token
          and response.acknowledged_terms is true
          and response.submitted_at = case new.status
            when 'approved' then new.approved_at
            when 'declined' then new.declined_at
          end
      )
      into is_public_customer_response;
    end if;
  else
    activity_type_value :=
      'change_order_updated';

    activity_title :=
      'Change order updated';
  end if;

  insert into public.project_activity (
    project_id,
    activity_type,
    title,
    description,
    actor_type,
    actor_app_user_id,
    source_table,
    source_id,
    metadata,
    occurred_at
  )
  values (
    new.project_id,
    activity_type_value,
    activity_title,
    new.description,
    case
      when is_public_customer_response then 'customer'
      else 'office'
    end,
    case
      when is_public_customer_response then null
      else new.created_by
    end,
    'project_change_orders',
    case
      when tg_op = 'INSERT'
        then new.id
      else gen_random_uuid()
    end,
    jsonb_build_object(
      'change_order_id',
        new.id,
      'change_order_number',
        new.change_order_number,
      'change_order_title',
        new.title,
      'status',
        new.status,
      'amount',
        new.amount,
      'cost_amount',
        new.cost_amount,
      'schedule_impact_days',
        new.schedule_impact_days,
      'approved_by_name',
        new.approved_by_name,
      'approved_at',
        new.approved_at
    ),
    coalesce(
      new.approved_at,
      new.declined_at,
      new.completed_at,
      new.updated_at,
      now()
    )
  )
  on conflict do nothing;

  return new;
end;
$function$;

commit;
