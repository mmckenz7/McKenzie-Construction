import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260805000000_change_order_vendor_response_acceptance.sql",
  "utf8",
);
const endpoint = readFileSync(
  "src/app/api/projects/[projectId]/change-orders/[changeOrderId]/vendor-requests/[requestId]/responses/[responseId]/accept/route.ts",
  "utf8",
);
const vendorRequestRoute = readFileSync(
  "src/app/api/projects/[projectId]/change-orders/[changeOrderId]/vendor-requests/route.ts",
  "utf8",
);
const page = readFileSync(
  "src/app/operations/projects/[projectId]/change-orders/[changeOrderId]/vendor-requests/page.tsx",
  "utf8",
);
const accessHelper = readFileSync(
  "src/lib/change-order-access.ts",
  "utf8",
);

test("migration fails closed against the audited schema contract", () => {
  for (const table of [
    "project_change_orders",
    "change_order_vendor_requests",
    "change_order_vendor_responses",
    "app_users",
    "project_activity",
  ]) {
    assert.match(
      migration,
      new RegExp(`'${table}'`),
    );
  }

  assert.match(migration, /to_regclass/);
  assert.match(migration, /format_type/);
  assert.match(
    migration,
    /change_order_vendor_responses_request_id_fkey/,
  );
  assert.match(
    migration,
    /confdeltype[\s\S]*?'c'/,
  );
  assert.match(
    migration,
    /confupdtype[\s\S]*?'a'/,
  );
  assert.match(
    migration,
    /installed_activity_types is distinct from/,
  );
  assert.match(
    migration,
    /select pg_get_constraintdef\(constraint_record\.oid\)[\s\S]*?into installed_activity_definition/,
  );
  assert.match(
    migration,
    /expected_activity_definition[\s\S]*?'CHECK \(\(activity_type = ANY \(ARRAY\['/,
  );
  assert.match(
    migration,
    /regexp_replace\(installed_activity_definition, '\\s\+', '', 'g'\)[\s\S]*?is distinct from[\s\S]*?regexp_replace\(expected_activity_definition, '\\s\+', '', 'g'\)/,
  );
  assert.match(
    migration,
    /raise exception 'The installed project activity types differ from the audited contract\.'/,
  );
  assert.match(
    migration,
    /raise exception 'The complete installed project_activity_type_check definition differs from the audited contract\.'/,
  );
});

test("migration creates exact acceptance keys, table, and scope constraints", () => {
  assert.match(
    migration,
    /create unique index change_order_vendor_acceptance_change_order_scope_uidx[\s\S]*?project_change_orders \(id, project_id\)/i,
  );
  assert.match(
    migration,
    /create unique index change_order_vendor_acceptance_request_scope_uidx[\s\S]*?\(id, change_order_id, project_id\)/i,
  );
  assert.match(
    migration,
    /create unique index change_order_vendor_acceptance_response_scope_uidx[\s\S]*?id,[\s\S]*?request_id,[\s\S]*?change_order_id,[\s\S]*?project_id/i,
  );
  assert.match(
    migration,
    /create table public\.change_order_vendor_response_acceptances/i,
  );
  assert.match(
    migration,
    /check \(source_change_order_id = target_change_order_id\)/,
  );
  assert.match(
    migration,
    /foreign key \(target_change_order_id, project_id\)/,
  );
  assert.match(
    migration,
    /foreign key \(request_id, source_change_order_id, project_id\)/,
  );
  assert.match(
    migration,
    /foreign key \(response_id, request_id, source_change_order_id, project_id\)/,
  );
  assert.match(migration, /unique \(request_id\)/);
  assert.match(migration, /unique \(response_id\)/);
  assert.match(
    migration,
    /references public\.app_users\(id\) on delete restrict/,
  );
});

test("acceptance storage is RLS-protected and RPC is service-role only", () => {
  assert.match(
    migration,
    /enable row level security/,
  );
  assert.match(
    migration,
    /revoke all on table public\.change_order_vendor_response_acceptances from public, anon, authenticated/,
  );
  assert.match(
    migration,
    /create or replace function public\.accept_change_order_vendor_response\(/,
  );
  assert.match(migration, /security definer/);
  assert.match(
    migration,
    /set search_path = public/,
  );
  assert.match(
    migration,
    /revoke all on function public\.accept_change_order_vendor_response\(uuid, uuid, uuid, uuid, uuid\)[\s\S]*?from public, anon, authenticated/,
  );
  assert.match(
    migration,
    /grant execute on function public\.accept_change_order_vendor_response\(uuid, uuid, uuid, uuid, uuid\)[\s\S]*?to service_role/,
  );
});

test("activity type is extended without financial metadata", () => {
  assert.match(
    migration,
    /drop constraint project_activity_type_check/,
  );
  assert.match(
    migration,
    /add constraint project_activity_type_check/,
  );
  assert.match(
    migration,
    /'change_order_vendor_response_accepted'/,
  );
  assert.match(
    migration,
    /'source_table',?[\s\S]*?'change_order_vendor_response_acceptances'/,
  );

  const metadata =
    migration.match(
      /jsonb_build_object\([\s\S]*?'acceptance_id'[\s\S]*?'target_change_order_id'[\s\S]*?\)/,
    )?.[0] ?? "";

  assert.doesNotMatch(metadata, /quoted_cost|cost_amount|amount|schedule_impact/);
});

test("RPC locks and validates draft request and response before one insert", () => {
  assert.match(
    migration,
    /where auth_user_id = requested_auth_user_id[\s\S]*?is_active = true/,
  );
  assert.match(
    migration,
    /from public\.project_change_orders[\s\S]*?for update/,
  );
  assert.match(
    migration,
    /status <> 'draft'[\s\S]*?superseded_by_change_order_id is not null/,
  );
  assert.match(
    migration,
    /from public\.change_order_vendor_requests[\s\S]*?for update/,
  );
  assert.match(
    migration,
    /from public\.change_order_vendor_responses[\s\S]*?for update/,
  );
  assert.match(
    migration,
    /request_record\.request_status <> 'submitted'/,
  );
  assert.match(
    migration,
    /request_record\.expires_at < now\(\)/,
  );
  assert.match(
    migration,
    /response_record\.response_status <> 'submitted'/,
  );
  assert.match(
    migration,
    /response_record\.quote_expiration_date < current_date/,
  );
  assert.equal(
    migration.match(
      /insert into public\.change_order_vendor_response_acceptances/g,
    )?.length,
    1,
  );
  assert.equal(
    migration.match(
      /insert into public\.project_activity/g,
    )?.length,
    1,
  );
});

test("RPC verifies linkage before strict idempotency and lifecycle checks", () => {
  for (const code of [
    "accepted",
    "already_accepted",
    "not_found",
    "revision_required",
    "request_unavailable",
    "request_expired",
    "response_unavailable",
    "quote_expired",
    "acceptance_conflict",
    "inactive_actor",
  ]) {
    assert.match(
      migration,
      new RegExp(`'${code}'`),
    );
  }

  const changeOrderLinkage =
    migration.indexOf(
      "change_order_record.project_id <> requested_project_id",
    );
  const requestLinkage =
    migration.indexOf(
      "request_record.change_order_id <> requested_change_order_id",
    );
  const responseLinkage =
    migration.indexOf(
      "response_record.project_id <> requested_project_id",
    );
  const acceptanceLookup =
    migration.indexOf(
      "select * into existing_acceptance",
    );
  const draftCheck =
    migration.indexOf(
      "change_order_record.status <> 'draft'",
    );
  const requestExpiration =
    migration.indexOf(
      "request_record.expires_at < now()",
    );
  const quoteExpiration =
    migration.indexOf(
      "response_record.quote_expiration_date < current_date",
    );

  assert.ok(changeOrderLinkage < requestLinkage);
  assert.ok(requestLinkage < responseLinkage);
  assert.ok(responseLinkage < acceptanceLookup);
  assert.ok(acceptanceLookup < draftCheck);
  assert.ok(acceptanceLookup < requestExpiration);
  assert.ok(acceptanceLookup < quoteExpiration);
  assert.match(
    migration,
    /existing_acceptance\.request_id = requested_request_id[\s\S]*?existing_acceptance\.response_id = requested_response_id[\s\S]*?existing_acceptance\.project_id = requested_project_id[\s\S]*?existing_acceptance\.source_change_order_id = requested_change_order_id[\s\S]*?existing_acceptance\.target_change_order_id = requested_change_order_id[\s\S]*?'already_accepted'/,
  );
  assert.match(
    migration,
    /return jsonb_build_object\('success', false, 'code', 'acceptance_conflict'\)/,
  );
});

test("RPC records selection without implicit project, response, or item mutation", () => {
  assert.doesNotMatch(
    migration,
    /update\s+public\.project_change_orders/i,
  );
  assert.doesNotMatch(
    migration,
    /insert\s+into\s+public\.project_change_order_items/i,
  );
  assert.doesNotMatch(
    migration,
    /update\s+public\.project_change_order_items/i,
  );
  assert.doesNotMatch(
    migration,
    /update\s+public\.change_order_vendor_responses/i,
  );
  assert.doesNotMatch(
    migration,
    /update\s+public\.change_order_vendor_requests/i,
  );
  assert.doesNotMatch(
    migration,
    /update\s+public\.project_change_order_payments/i,
  );
  assert.doesNotMatch(
    migration,
    /project_change_order_payments|billing_status|invoice_number/i,
  );
});

test("API applies the shared boundary and all acceptance capabilities", () => {
  assert.match(
    endpoint,
    /getAuthenticatedAccess/,
  );
  assert.match(
    endpoint,
    /authorizeChangeOrderProjectRequest/,
  );
  assert.match(
    endpoint,
    /change_order_vendor_requests/,
  );
  assert.match(endpoint, /canViewCosts/);
  assert.match(
    endpoint,
    /canApproveChangeOrders/,
  );
  assert.match(
    endpoint,
    /requested_auth_user_id:\s*authorization\.authUserId/,
  );
  assert.doesNotMatch(
    endpoint,
    /body\.(acceptedBy|actorId|authUserId)/,
  );
  assert.match(
    accessHelper,
    /authUserId:[\s\S]*?options\.access\.user\.id/,
  );
});

test("API maps non-disclosure, revision, and stable conflicts", () => {
  assert.match(
    endpoint,
    /result\.code === "not_found"[\s\S]*?status: 404/,
  );
  assert.match(
    endpoint,
    /result\.code ===[\s\S]*?"revision_required"[\s\S]*?revisionRequired: true[\s\S]*?status: 409/,
  );
  for (const code of [
    "request_unavailable",
    "request_expired",
    "response_unavailable",
    "quote_expired",
    "acceptance_conflict",
  ]) {
    assert.match(endpoint, new RegExp(`${code}:`));
  }
  assert.match(
    endpoint,
    /return conflictResponse\(/,
  );
});

test("vendor-request read contract exposes acceptance and server-derived capability", () => {
  assert.match(
    vendorRequestRoute,
    /change_order_vendor_response_acceptances/,
  );
  assert.match(
    vendorRequestRoute,
    /acceptance:[\s\S]*?responseId:[\s\S]*?acceptedAt:/,
  );
  assert.match(
    vendorRequestRoute,
    /canAcceptVendorResponse:[\s\S]*?canViewCosts[\s\S]*?canApproveChangeOrders/,
  );
  assert.match(
    vendorRequestRoute,
    /authorizeChangeOrderProjectRequest/,
  );
});

test("Operations UI confirms, gates, and displays recorded acceptance", () => {
  assert.match(
    page,
    /Accepting records this vendor response as the selected quote\. It does not change customer price, estimated cost, schedule impact, line items, approval status, or billing\./,
  );
  for (const condition of [
    /canAcceptVendorResponse/,
    /requestRecord\.requestStatus ===[\s\S]*?"submitted"/,
    /responseStatus ===[\s\S]*?"submitted"/,
    /changeOrderStatus ===[\s\S]*?"draft"/,
    /!supersededByChangeOrderId/,
    /requestRecord\.expiresAt/,
    /quoteExpirationDate/,
    /!requestRecord\.response[\s\S]*?\.acceptance/,
  ]) {
    assert.match(page, condition);
  }
  assert.match(page, />\s*Accepted\s*</);
  assert.match(
    page,
    /A draft revision is required before a vendor response can be accepted\./,
  );
  assert.match(
    page,
    /No cost, schedule, line-item, approval, or billing values were changed\./,
  );
  assert.doesNotMatch(
    page,
    /apply(?:ing)? (?:the )?(?:quote|cost|schedule)/i,
  );
});
