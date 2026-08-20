# Communications webhook gateway

This is a Preview-only public boundary for signed Twilio and Resend webhooks. It accepts only three fixed paths, requires and preserves the provider signature evidence, and forwards the request into the protected CRM Preview. The existing CRM route performs the authoritative provider-signature verification before processing data. The project-wide Vercel bypass is stored only as a private gateway environment variable and is never embedded in provider URLs.

Required environment variables:

- `GATEWAY_TARGET_BASE_URL`
- `GATEWAY_VERCEL_BYPASS_SECRET`

Public routes:

- `POST /api/communications/webhooks/twilio`
- `POST /api/communications/webhooks/twilio/voice`
- `POST /api/communications/webhooks/resend`
- `GET /health`

This service has no provider secrets, database credentials, UI session, Supabase access, or generic proxy route.
