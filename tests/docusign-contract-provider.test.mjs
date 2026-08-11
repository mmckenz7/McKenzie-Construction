import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const provider = readFileSync("src/lib/contracts/docusign.ts", "utf8");
const contractRoute = readFileSync("src/app/api/estimates/[estimateId]/contract-preparation/route.ts", "utf8");

test("DocuSign provider remains disabled unless explicitly enabled and fully configured", () => {
  assert.match(provider, /DOCUSIGN_ENABLED/);
  assert.match(provider, /DocuSign sending is disabled/);
  for (const name of [
    "DOCUSIGN_ACCOUNT_ID",
    "DOCUSIGN_ENVIRONMENT",
    "DOCUSIGN_INTEGRATION_KEY",
    "DOCUSIGN_PRIVATE_KEY",
    "DOCUSIGN_SIGNER_ROLE_NAME",
    "DOCUSIGN_TEMPLATE_ID",
    "DOCUSIGN_USER_ID",
  ]) assert.match(provider, new RegExp(name));
});

test("DocuSign envelopes use an approved server template and correlate to a preparation", () => {
  assert.match(provider, /templateId: config\.templateId/);
  assert.match(provider, /templateRoles/);
  assert.match(provider, /contract_preparation_id/);
  assert.match(provider, /status: "sent"/);
  assert.doesNotMatch(provider, /createAdminServerClient|from\("projects"\)|convert-to-customer/);
});

test("DocuSign authentication discovers the account base URI", () => {
  assert.match(provider, /oauth\/userinfo/);
  assert.match(provider, /account_id === config\.accountId/);
  assert.match(provider, /restapi\/v2\.1\/accounts/);
});

test("DocuSign Connect verification uses HMAC SHA-256 and constant-time comparison", () => {
  assert.match(provider, /DOCUSIGN_CONNECT_HMAC_SECRET/);
  assert.match(provider, /createHmac\("sha256"/);
  assert.match(provider, /timingSafeEqual/);
});

test("contract preparation still cannot send or authorize project creation", () => {
  assert.doesNotMatch(contractRoute, /createDocusignEnvelope/);
  assert.doesNotMatch(contractRoute, /from\("projects"\)|convert-to-customer/);
  assert.match(contractRoute, /legal_terms_status: "not_configured"/);
});
