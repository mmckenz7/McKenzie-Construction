# Communications webhook gateway

This is a Preview-only public boundary for signed Twilio and Resend webhooks. It verifies the provider signature before forwarding one of three fixed paths into the protected CRM Preview. The project-wide Vercel bypass is stored only as a private gateway environment variable and is never embedded in provider URLs.

Required environment variables:

- `GATEWAY_PUBLIC_BASE_URL`
- `GATEWAY_TARGET_BASE_URL`
- `GATEWAY_VERCEL_BYPASS_SECRET`
- `TWILIO_AUTH_TOKEN`
- `RESEND_WEBHOOK_SECRET`

Public routes:

- `POST /api/communications/webhooks/twilio`
- `POST /api/communications/webhooks/twilio/voice`
- `POST /api/communications/webhooks/resend`
- `GET /health`

This service has no database credentials, UI session, Supabase access, or generic proxy route.
