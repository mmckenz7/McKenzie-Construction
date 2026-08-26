# Company email signatures

## Authority and scope

- `company_settings.email_signature_layout` is the company-wide layout authority: `off`, `compact`, or `branded`.
- Existing `company_settings` branding and contact fields remain authoritative for company name, phone, email, website, colors, and logo.
- `team_members`, resolved by the authenticated user's `auth_user_id`, remains authoritative for employee name, title, phone, and email.
- Employee facts are never copied into company settings.
- Automatic signatures apply only to manually composed Company Inbox email and replies. SMS, voice, and automated email drafts are unchanged.

## Rendering and storage

- The server reloads authoritative facts immediately before inserting the outbox record and contacting the email provider.
- The browser preview is informational and never submits signature text or HTML.
- The renderer accepts only the three fixed layouts and never accepts arbitrary HTML.
- Every message and profile field is HTML-escaped. Email and telephone links are generated from validated values.
- A logo renders only for the Branded layout and only when the saved company logo reference is HTTPS. Local paths, HTTP, data URLs, and script URLs are omitted.
- The final signed plain-text body is stored in the outbox and `communication_messages` as the durable historical snapshot.
- Resend receives matching text and escaped HTML. Queue retries use the already-signed stored body and do not append a second signature.
- Non-secret metadata records only the layout and renderer version when a signature is active.

## Fallbacks

- Migration default: `off`; existing messages are unchanged and no signature appears until management deliberately chooses a layout.
- Missing employee name: no signature is generated.
- Missing title, phone, email, company contact, website, or logo: that line or image is omitted without an empty separator.
- Missing migration during a code-only Preview: reads fail safely to `off`, and the settings UI disables saving the new layout.

## Release order

1. Keep staging Inbox and sync disabled while the outstanding historical auth-mail cleanup is reviewed separately.
2. Review and apply `20260826180000_company_email_signature_layout.sql` to staging only in an approved migration window.
3. Confirm the new column defaults to `off` and the exact CHECK accepts only `off`, `compact`, and `branded`.
4. Deploy the already validated code commit.
5. Verify signed-in settings and compose/reply previews without sending.
6. Management deliberately selects Compact or Branded.
7. Send one sandbox-allowlisted, non-Production verification email only under a separate controlled QA approval.

Production migration, configuration, and sends remain separately gated.

## Rollback

Set the staging layout back to `off` through the management settings UI. Do not remove the column or rewrite historical messages: stored signed bodies are intentional delivery snapshots.
