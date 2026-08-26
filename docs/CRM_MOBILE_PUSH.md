# CRM mobile text notifications

## Purpose

Provide the internal `info@mckenzie-builds.com` account with an installable
Company Inbox web app and an encrypted generic alert after a new inbound Twilio
text is stored successfully.

## Privacy boundary

The Web Push payload contains only:

- `New customer text`
- `A new text arrived in Company Inbox.`

It contains no customer name, phone number, message body, provider message ID,
thread ID, lead/customer ID, or internal route identifier. Tapping the alert
opens the Text-only Company Inbox. The application limits subscription and test
routes to the authenticated `info@mckenzie-builds.com` account with Sales access.

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

- Twilio signature validation and message persistence remain authoritative.
- Duplicate provider deliveries do not create a second notification because the
  existing message insert must return a newly inserted row before scheduling.
- Notification delivery runs after the Twilio response and cannot roll back or
  block message storage.
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
7. Tap **Send test notification** and confirm the generic alert arrives.
8. Send one authorized inbound SMS from a separate phone and verify one alert,
   one Inbox thread update, Eastern time, and no customer data on the lock screen.

## Release gates

Preview beta requires exact approval for VAPID generation/storage, branch-scoped
environment configuration, code integration onto the provider-configured CRM
branch, and one live test. Production remains excluded until independently
approved.
