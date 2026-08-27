# CRM mobile text notifications

## Purpose

Provide the internal `info@mckenzie-builds.com` account with an installable
Company Inbox web app and an encrypted, typed alert after a normal-disposition
Twilio communication is stored successfully.

## Privacy boundary

The Web Push payload contains only:

- the event kind: new text, incoming call, or missed call;
- the matched CRM customer/lead name when the current singleton-company boundary
  is verified, otherwise only a masked phone number; and
- the exact normal-disposition Company Inbox thread route.

It contains no message body or preview, unmasked phone number, provider message
ID, lead/customer ID, token, or attachment fact by default. Tapping the alert opens the
exact authenticated thread; the detail route independently requires Sales
access and `security_disposition = 'normal'`. The application limits
subscription and test routes to the authenticated `info@mckenzie-builds.com`
account with Sales access.

## Existing storage contract

The canonical schema already contains `push_subscriptions`, an authenticated
user-owned RLS table with an endpoint uniqueness constraint. This slice adds no
migration. Browser endpoint and encryption keys are stored there only after the
signed-in user explicitly enables notifications.

## Runtime configuration

The deployment needs three server environment variables:

- `WEB_PUSH_VAPID_PUBLIC_KEY`
- `WEB_PUSH_VAPID_PRIVATE_KEY`
- `WEB_PUSH_VAPID_SUBJECT` (`mailto:info@mckenzie-builds.com`)

The private key must be Hidden/Sensitive and Preview-only for the beta. Keys must
never be printed, logged, committed, or copied into browser storage. The public
key is returned only to the authenticated notification settings component.

## Delivery behavior

- Twilio signature validation and normal-disposition message persistence remain
  authoritative.
- Duplicate provider deliveries do not create a second notification because the
  existing message insert must return a newly inserted row before scheduling.
- Notification delivery runs after the Twilio response and cannot roll back or
  block message storage.
- Inbound text identity is resolved only after the singleton company boundary is
  verified. A multi-company deployment requires company IDs on communication and
  CRM contact records before names may be projected into alerts.
- Incoming/missed call event delivery remains disconnected until the live Twilio
  number's inbound voice routing is separately inspected and approved.
- A short SMS preview is available only after the receiving subscription records
  an explicit unlocked-preview opt-in. Preview text is whitespace-normalized,
  limited to 72 characters, and suppressed entirely for URLs and credential-like
  code/token patterns. Calls never carry content. The default remains
  identity-only.
- The web app cannot read or enforce the iPhone notification-preview setting.
  The supported device configuration is **Settings → Notifications → McKenzie
  Inbox → Show Previews → When Unlocked**. QA must verify this setting before
  enabling the per-device preview preference. If it cannot be confirmed, leave
  the preference off.
- Expired browser subscriptions returning 404/410 are removed; other failures
  leave the subscription in place for later diagnosis.
- The open Inbox refreshes read-only every 15 seconds and on tab visibility. It
  no longer invokes outbound processing or Microsoft synchronization on a timer.
- Communication timestamps explicitly render in `America/New_York`.

## iPhone beta procedure

1. Open the final stable Preview in Safari and sign in as `info@mckenzie-builds.com`.
2. Open Company Inbox.
3. Tap Share, then **Add to Home Screen**.
4. Open **McKenzie Inbox** from the Home Screen.
5. Expand communication status and tap **Enable notifications**.
6. Allow notifications when iOS asks.
7. Tap **Send test notification** and confirm the McKenzie test alert arrives.
8. Send one authorized inbound SMS from a separate phone and verify one typed
   alert, the expected CRM name or masked number, one exact Inbox thread update,
   Eastern time, and no message content on the lock screen.

## Unlocked SMS preview release boundary

The existing `push_subscriptions` table cannot record whether an individual
device has confirmed **Show Previews: When Unlocked**. A separately reviewed
migration is required before wiring SMS content into delivery:

- add `sms_preview_when_unlocked boolean not null default false`;
- allow the authenticated subscription owner to change only that preference
  through the existing subscription API;
- present an explicit confirmation control containing the exact iPhone setting;
- select the preference per subscription and build identity-only payloads for
  every row where it is false;
- never place raw bodies, preview values, tokens, URLs, or hashes in logs or
  persistent notification metadata.

Until that migration and UI are approved and applied, the inbound Twilio webhook
must not pass message content to `sendCommunicationPush`.

## Release gates

Preview beta requires exact approval for VAPID generation/storage, branch-scoped
environment configuration, code integration onto the provider-configured CRM
branch, and one live test. Production remains excluded until independently
approved.
