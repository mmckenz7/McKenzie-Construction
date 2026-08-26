# Additional staging authentication-mail cleanup proposal

Status: proposal only. Do not run without separate staging-only owner approval.

## Count-only evidence

- Target staging project: `iiofljulghibantfzlim`
- Additional normal-disposition classified messages: `1`
- Distinct affected threads: `1`
- Message ID: `8fdc46c9-7546-4fa5-aa19-cd3e5346e6e4`
- Thread ID: `4ae6bf68-1add-48de-9419-92b5d633274e`
- Provider: `microsoft_graph`
- Provider message ID: `AAMkADdhZTBhYTE3LWE5MWMtNDZmOS05ZGI2LTMwYTUzNzVlNjM4NgBGAAAAAADJJXYxA04IQ7oZH0U8qKjeBwC3b6ZNaaTnSJNC_h7LgzGCAAAAAAEMAAC3b6ZNaaTnSJNC_h7LgzGCAAAVVs1ZAAA=`
- Existing quarantined messages/threads: `4 / 4`
- Target linkage, assignment, attachment, and outbox-link counts: all `0`
- Target thread message count: exactly `1`
- Existing target business events: `1`; credential-bearing event metadata count: `0`
- Existing quarantine invariant violations: `0`

No body, subject excerpt, URL, token, code, or hash was selected or returned by the audit.

## Required maintenance containment

Before execution, confirm Company Inbox is closed, company/mailbox sync flags are disabled, no mailbox is syncing, automation/process routes are idle, and outbox counts are unchanged. Abort if any condition differs.

## Proposed single transaction

The transaction contains no backup table, returned content, or restoration copy. Any failed assertion aborts the entire transaction. Existing append-only business events remain intact; the disposition boundary removes the quarantined subject from normal projections.

```sql
begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';
set constraints all deferred;

do $$
declare
  expected_message_id constant uuid := '8fdc46c9-7546-4fa5-aa19-cd3e5346e6e4';
  expected_thread_id constant uuid := '4ae6bf68-1add-48de-9419-92b5d633274e';
  expected_provider_message_id constant text := 'AAMkADdhZTBhYTE3LWE5MWMtNDZmOS05ZGI2LTMwYTUzNzVlNjM4NgBGAAAAAADJJXYxA04IQ7oZH0U8qKjeBwC3b6ZNaaTnSJNC_h7LgzGCAAAAAAEMAAC3b6ZNaaTnSJNC_h7LgzGCAAAVVs1ZAAA=';
  matching_messages bigint;
  matching_threads bigint;
begin
  select count(*) into matching_messages
  from public.communication_messages as message
  where message.id = expected_message_id
    and message.thread_id = expected_thread_id
    and message.provider = 'microsoft_graph'
    and message.provider_message_id = expected_provider_message_id
    and message.channel = 'email'
    and message.direction = 'inbound'
    and message.security_disposition = 'normal'
    and message.security_reason_code is null
    and message.security_detector_version is null
    and message.content_redacted_at is null
    and message.lead_id is null
    and message.outbox_id is null
    and message.has_attachments = false
    and not (message.metadata ?| array['lead_id', 'customer_id', 'project_id', 'assigned_to_id'])
    and message.body ~* 'https?://[^[:space:]<>"'']*(auth(/v[0-9]+)?/(verify|callback|confirm)|reset-password|password-reset|recover|recovery|magic-link|magiclink|invite|invitation|verify-email|[.]supabase[.]co/auth/)[^[:space:]<>"'']*(code|token|otp|recovery_token|confirmation_token|token_hash)=[A-Za-z0-9%._~+/=-]{20,}';

  select count(*) into matching_threads
  from public.communication_threads as thread
  where thread.id = expected_thread_id
    and thread.provider = 'microsoft_graph'
    and thread.security_disposition = 'normal'
    and thread.lead_id is null
    and thread.customer_id is null
    and thread.assigned_to_id is null
    and not (thread.metadata ?| array['lead_id', 'customer_id', 'project_id', 'assigned_to_id'])
    and (select count(*) from public.communication_messages as sibling where sibling.thread_id = thread.id) = 1;

  if matching_messages <> 1 or matching_threads <> 1 then
    raise exception 'Authentication-mail cleanup precondition mismatch.';
  end if;

  if (select count(*) from public.business_events as event
      where event.subject_type = 'communication_message'
        and event.subject_id = expected_message_id) <> 1 then
    raise exception 'Authentication-mail cleanup event-count mismatch.';
  end if;

  if exists (
    select 1 from public.business_events as event
    where event.subject_type = 'communication_message'
      and event.subject_id = expected_message_id
      and event.metadata::text ~* '(access_token|confirmation_token|invite_token|invitation_token|magic_link_token|otp|recovery_token|refresh_token|token_hash|[?&#](code|token)=)'
  ) then
    raise exception 'Authentication-mail event metadata requires separate review.';
  end if;
end
$$;

update public.communication_threads
set
  provider_thread_id = 'quarantine:AAMkADdhZTBhYTE3LWE5MWMtNDZmOS05ZGI2LTMwYTUzNzVlNjM4NgBGAAAAAADJJXYxA04IQ7oZH0U8qKjeBwC3b6ZNaaTnSJNC_h7LgzGCAAAAAAEMAAC3b6ZNaaTnSJNC_h7LgzGCAAAVVs1ZAAA=',
  subject = 'Sensitive authentication message quarantined',
  department = 'general',
  status = 'archived',
  lead_id = null,
  customer_id = null,
  assigned_to_id = null,
  participant_addresses = '{}',
  unread_count = 0,
  metadata = '{}'::jsonb,
  security_disposition = 'quarantined'
where id = '4ae6bf68-1add-48de-9419-92b5d633274e'
  and security_disposition = 'normal';

update public.communication_messages
set
  sender = 'quarantined@invalid.local',
  recipient = 'quarantined@invalid.local',
  subject = 'Sensitive authentication message quarantined',
  body = 'This message was quarantined before its content was stored.',
  lead_id = null,
  is_read = true,
  has_attachments = false,
  department = 'general',
  metadata = '{}'::jsonb,
  security_disposition = 'quarantined',
  security_reason_code = 'secret_bearing_authentication_content',
  security_detector_version = 'secret-bearing-auth-mail-v2',
  content_redacted_at = now()
where id = '8fdc46c9-7546-4fa5-aa19-cd3e5346e6e4'
  and thread_id = '4ae6bf68-1add-48de-9419-92b5d633274e'
  and security_disposition = 'normal';

set constraints all immediate;

do $$
begin
  if (select count(*) from public.communication_messages
      where id = '8fdc46c9-7546-4fa5-aa19-cd3e5346e6e4'
        and security_disposition = 'quarantined') <> 1
    or (select count(*) from public.communication_threads
        where id = '4ae6bf68-1add-48de-9419-92b5d633274e'
          and security_disposition = 'quarantined') <> 1
    or exists (
      select 1 from public.communication_messages
      where id = '8fdc46c9-7546-4fa5-aa19-cd3e5346e6e4'
        and security_disposition = 'normal'
    )
  then
    raise exception 'Authentication-mail cleanup postcondition mismatch.';
  end if;
end
$$;

commit;
```

## Post-commit validation

Return counts and IDs only:

- `5` quarantined messages and `5` quarantined threads.
- `0` additional normal-disposition classifier matches.
- `0` target IDs in every normal Inbox/search/detail/contact/project/activity/attachment projection.
- `0` credential-bearing values in the target's current subject/body/metadata fields using boolean/count-only checks.
- `0` new Mission Control events for the target; the one pre-existing non-secret audit event remains.
- Outbox and normal-message/event counts remain unchanged.
- Sync/company/mailbox flags remain disabled.

If any post-commit count differs, stop without re-enabling sync or opening the Inbox. Never restore original content; any correction must preserve the quarantined placeholders.
