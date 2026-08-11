import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("supabase/migrations/20260810060000_estimate_public_proposals.sql", "utf8");
const internalRoute = readFileSync("src/app/api/estimates/[estimateId]/proposal/route.ts", "utf8");
const publicRoute = readFileSync("src/app/api/estimate-proposals/[token]/route.ts", "utf8");
const publicPage = readFileSync("src/app/estimate/[token]/page.tsx", "utf8");
const proposalCard = readFileSync("src/components/estimates/estimate-proposal-card.tsx", "utf8");
const proposalEmailDraftRoute = readFileSync("src/app/api/estimates/[estimateId]/proposal-email-draft/route.ts", "utf8");
const publicApi = readFileSync("src/lib/public-token-api.ts", "utf8");
const rateLimit = readFileSync("src/lib/public-token-rate-limit-core.ts", "utf8");

test("proposal storage is service-role only and snapshots one customer-safe document", () => {
  assert.match(migration, /create table if not exists public\.estimate_proposals/);
  assert.match(migration, /revoke all on table public\.estimate_proposals from public, anon, authenticated/);
  assert.match(migration, /snapshot_version = 'estimate-public-proposal-v1'/);
  assert.match(internalRoute, /buildEstimateCustomerDocument\(state, calculation\)/);
  assert.match(internalRoute, /canSendProposals/);
  assert.doesNotMatch(internalRoute, /subtotal_cost|estimated_profit|estimated_margin|internal_notes/);
});

test("issuance, opening, response, and revocation are transactional database boundaries", () => {
  for (const name of ["issue_estimate_proposal", "get_estimate_proposal_by_token", "submit_estimate_proposal_response", "revoke_estimate_proposal"]) {
    assert.match(migration, new RegExp(`function public\\.${name}`));
    assert.match(migration, new RegExp(`revoke all on function public\\.${name}`));
    assert.match(migration, new RegExp(`grant execute on function public\\.${name}[\\s\\S]*to service_role`));
  }
  assert.match(migration, /set status = requested_response/);
  assert.match(migration, /where id = proposal_record\.estimate_id and status in \('sent', 'viewed'\)/);
  assert.match(migration, /work_authorized', false/);
  assert.doesNotMatch(migration, /insert into public\.projects|update public\.projects/);
  assert.doesNotMatch(migration, /status = 'converted'/);
});

test("public estimate responses are rate limited, minimized, and explicitly nonbinding", () => {
  assert.match(rateLimit, /"estimate_proposal"/);
  assert.match(migration, /'estimate_proposal'/);
  assert.ok(publicRoute.indexOf("enforcePublicTokenRateLimit") < publicRoute.indexOf("UUID.test(token)"));
  assert.match(publicRoute, /isPublicTokenBodyTooLarge/);
  assert.match(publicRoute, /minimizeEstimateProposalPayload/);
  assert.match(publicApi, /minimizeEstimateProposalPayload/);
  assert.doesNotMatch(publicApi.match(/export function minimizeEstimateProposalPayload[\s\S]*$/)?.[0] ?? "", /public_token|estimate_id|lead_id|customer_id/);
  assert.match(publicPage, /Estimate acceptance is not a construction contract/);
  assert.match(publicPage, /nonbinding intent to proceed/);
  assert.match(publicPage, /No work is authorized/);
});

test("Mission Control can copy or revoke a link but never sends it automatically", () => {
  assert.match(proposalCard, /Create customer link/);
  assert.match(proposalCard, /navigator\.clipboard\.writeText/);
  assert.match(proposalCard, /Revoke and edit/);
  assert.doesNotMatch(proposalCard, /communication_outbox|send-estimate|send email/i);
});

test("an issued estimate can create one reviewable email draft without sending", () => {
  assert.match(proposalCard, /Create email draft/);
  assert.match(proposalCard, /Open customer lead/);
  assert.match(proposalEmailDraftRoute, /canSendProposals/);
  assert.match(proposalEmailDraftRoute, /template_key: TEMPLATE_KEY/);
  assert.match(proposalEmailDraftRoute, /\.contains\("metadata", \{ estimate_proposal_id: proposalId \}\)/);
  assert.match(proposalEmailDraftRoute, /status: "draft"/);
  assert.match(proposalEmailDraftRoute, /expiresAt\.getTime\(\) <= Date\.now\(\)/);
  assert.match(proposalEmailDraftRoute, /next_phone_follow_up_after_send: true/);
  assert.match(proposalEmailDraftRoute, /separate signed construction contract is required before work begins/);
  assert.doesNotMatch(proposalEmailDraftRoute, /enqueueApprovedEmail|communication_outbox|RESEND_API_KEY/);
});

test("customer estimate responses create safe lead activity without authorizing work", () => {
  assert.match(migration, /insert into public\.lead_activities/);
  assert.match(migration, /'estimate_accepted'/);
  assert.match(migration, /'estimate_declined'/);
  assert.match(migration, /'work_authorized', false/);
});
