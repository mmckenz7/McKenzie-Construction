# Public-token staging end-to-end test plan

This plan targets a dedicated non-production Supabase project and its matching
Vercel Preview or staging deployment. It must never use production tokens or
production customer, project, vendor, or subcontractor records.

## Fixture controls

- Create a staging-only company and the minimum related records required by
  each existing workflow through approved application/admin paths.
- Use unmistakable `E2E-STAGING-DELETE` labels and generated UUID tokens.
- Record fixture IDs in the test runner's ephemeral state, not source control
  or application logs.
- Provision one active, one expired/revoked/cancelled, and one already-submitted
  record for each applicable workflow.
- Do not copy production rows. Use staging-owned addresses and contact aliases.
- Delete the fixture graph after the run using explicit captured IDs. Retain
  only aggregate pass/fail results and redacted rate-limit telemetry.

No fixture SQL is included in the repository because the live table contract
and required relationships must be sourced from the staging schema at run time.

## Workflow matrix

For change orders, vendor change-order requests, material reviews, and schedule
requests:

1. GET an active token and assert the documented minimized response allowlist.
2. Assert token values, internal IDs, unrelated customer/project fields, and
   audit metadata are absent.
3. Submit one valid response where the workflow supports submission.
4. Repeat the same submission and assert the workflow-specific duplicate/replay
   response, including HTTP 409 where implemented.
5. GET and POST expired, revoked, or cancelled fixtures and assert a safe,
   non-enumerating response.
6. Use a separate synthetic network identity in staging to exercise limits:
   GET permits 60 requests per 10 minutes per network and 30 per token; POST
   permits 12 requests per 15 minutes per network and 6 per token.
7. Assert the first over-limit response is HTTP 429, contains `Retry-After`, and
   contains no token, URL, request body, fixture ID, or business data.
8. Confirm a different staging network/token bucket remains allowed, proving
   isolation between counters.

## Observability review

Inspect staging logs only for `public_token_rate_limit_*` events. Allowed fields
are route category, HTTP method, status class, a 12-character HMAC prefix for
the network identifier, user-agent category, outcome, and timestamp. Reject the
run if logs contain request URLs, tokens, bodies, email/name/address data,
project or customer identifiers, or raw IP addresses.

## Required rollout sequence

1. Set a randomly generated `PUBLIC_TOKEN_RATE_LIMIT_SECRET` in Preview/staging.
2. Apply the rate-limit migration to staging only.
3. Deploy the application to Preview/staging.
4. Run this matrix and inspect database counters and redacted logs.
5. Remove fixtures and confirm no production system was contacted.
6. Only after staging approval, schedule production migration before the code
   deployment; the code fails closed with HTTP 503 if the RPC or secret is absent.
