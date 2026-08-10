import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const projectPage = readFileSync("src/app/operations/projects/[projectId]/page.tsx", "utf8");
const legacyProjectPage = readFileSync("src/app/admin/projects/[projectId]/page.tsx", "utf8");
const projectCollection = readFileSync("src/app/operations/projects/page.tsx", "utf8");
const projectApi = readFileSync("src/app/api/projects/route.ts", "utf8");
const conversionApi = readFileSync("src/app/api/leads/[leadId]/convert-to-customer/route.ts", "utf8");
const partyManager = readFileSync("src/components/project-party-manager.tsx", "utf8");
const communicationMigration = readFileSync("supabase/migrations/20260810000000_beta_communications_and_tax.sql", "utf8");
const emailDraftRoute = readFileSync("src/app/api/email-drafts/[draftId]/route.ts", "utf8");
const provider = readFileSync("src/lib/communications/provider.ts", "utf8");
const processor = readFileSync("src/lib/communications/processor.ts", "utf8");
const automationAuth = readFileSync("src/lib/communications/automation-auth.ts", "utf8");
const deliveryWorkflow = readFileSync("src/lib/communications/email-delivery-workflow.ts", "utf8");
const estimateCollection = readFileSync("src/app/api/estimates/route.ts", "utf8");
const estimateDetail = readFileSync("src/app/api/estimates/[estimateId]/route.ts", "utf8");

test("project records use one detail workspace with the cost ledger", () => {
  assert.match(projectPage, /ProjectCostManager projectId=\{projectId\}/);
  assert.match(projectPage, /\.from\("projects"\)[\s\S]*\.eq\("id", projectId\)/);
  assert.doesNotMatch(projectPage, /filteredProjects|Projects Dashboard/);
  assert.match(legacyProjectPage, /redirect\(`\/operations\/projects\/\$\{encodeURIComponent\(projectId\)\}`\)/);
  assert.doesNotMatch(projectCollection, /href=\{`\/admin\/projects\//);
});

test("won estimate identity and accepted price flow into customer and project", () => {
  assert.match(conversionApi, /\.from\("estimates"\)[\s\S]*customer_id: newCustomer\.id/);
  assert.match(projectApi, /\.in\("status", \["accepted", "converted"\]\)/);
  assert.match(projectApi, /project_id: newProject\.id/);
  assert.match(projectApi, /status: "converted"/);
  assert.match(projectApi, /resolvedContractValue/);
});

test("project partner form retains its element across the awaited request", () => {
  assert.match(partyManager, /const formElement = event\.currentTarget/);
  assert.match(partyManager, /formElement\.reset\(\)/);
  assert.doesNotMatch(partyManager, /await fetch[\s\S]*event\.currentTarget\.reset/);
});

test("communication automation is opt-in, audited, and keeps secrets outside SQL", () => {
  assert.match(communicationMigration, /auto_send_approved_email boolean not null default false/);
  assert.match(communicationMigration, /create table if not exists public\.communication_outbox/);
  assert.match(communicationMigration, /idempotency_key text not null/);
  assert.doesNotMatch(communicationMigration, /API_KEY|AUTH_TOKEN|SECRET/);
  assert.match(emailDraftRoute, /enqueueApprovedEmail/);
  assert.match(provider, /requiredEnvironment\("RESEND_API_KEY"\)/);
  assert.match(provider, /requiredEnvironment\("TWILIO_AUTH_TOKEN"\)/);
  assert.match(provider, /Idempotency-Key/);
  assert.match(automationAuth, /timingSafeEqual/);
  assert.match(automationAuth, /COMMUNICATION_PROCESSOR_SECRET/);
  assert.match(automationAuth, /CRON_SECRET/);
  assert.match(processor, /attemptCount >= 3/);
  assert.match(deliveryWorkflow, /review_follow_up_email/);
});

test("municipality material tax is cost-side and snapshots its source", () => {
  assert.match(communicationMigration, /create table if not exists public\.municipality_material_tax_rates/);
  assert.match(communicationMigration, /material_tax_source_url/);
  assert.match(communicationMigration, /tax_rate_percent is[\s\S]*cost-side material tax percentage/);
  assert.match(communicationMigration, /property_address/);
  assert.match(estimateCollection, /resolveEstimateMaterialTax\(supabase, propertyAddress\)/);
  assert.match(estimateDetail, /municipalityTax\?\.ratePercent/);
});
