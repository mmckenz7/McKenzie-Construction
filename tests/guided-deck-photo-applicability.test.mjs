import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
    "supabase/migrations/20260813145000_guided_deck_photo_applicability_findings.sql",
    "utf8",
  ),
  provider = readFileSync(
    "src/lib/guided-site-visits/ai-intake-classification.ts",
    "utf8",
  ),
  classificationRoute = readFileSync(
    "src/app/api/guided-site-visits/[visitId]/intake-photos/[attemptId]/classification-reviews/route.ts",
    "utf8",
  ),
  intakeRoute = readFileSync(
    "src/app/api/guided-site-visits/[visitId]/intake-batches/route.ts",
    "utf8",
  ),
  component = readFileSync(
    "src/components/estimates/guided-deck-site-visit.tsx",
    "utf8",
  );

test("persists immutable tenant-linked findings with complete model provenance", () => {
  assert.match(migration, /^begin;\n/);
  assert.match(migration, /\ncommit;\n$/);
  assert.match(migration, /guided_site_visit_intake_applicability_findings/);
  assert.match(migration, /finding in \('present','absent','unclear'\)/);
  assert.match(migration, /confidence between 0 and 1/);
  assert.match(migration, /classification_review_id,visit_id,company_id/);
  assert.match(migration, /intake_attempt_id,visit_id,company_id/);
  assert.match(migration, /visit_item_id,visit_id,company_id/);
  assert.match(migration, /before update or delete/);
  assert.match(migration, /from public,anon,authenticated,service_role/);
  assert.match(migration, /grant select.*to service_role/s);
  assert.match(intakeRoute, /provider,model_version,prompt_version,schema_version/);
});

test("records review and applicability rows atomically with exact replay", () => {
  assert.match(migration, /record_guided_site_visit_intake_classification_v2/);
  assert.match(
    migration,
    /record_guided_site_visit_intake_classification\(/,
  );
  assert.match(migration, /existing_findings is distinct from/);
  assert.match(migration, /idempotency_conflict/);
  assert.match(migration, /existing_review\.model_version<>requested_model_version/);
  assert.match(migration, /existing_review\.request_sha256<>requested_request_sha256/);
  assert.match(migration, /existing_review\.response_sha256<>requested_response_sha256/);
  assert.match(migration, /jsonb_array_length\(requested_applicability_findings\)>16/);
  assert.match(migration, /item\.item_key='stairs_landings'/);
  assert.match(migration, /findingKey' in \('item_applies','landing_present'\)/);
  assert.match(classificationRoute, /requested_applicability_findings/);
  assert.match(classificationRoute, /record_guided_site_visit_intake_classification_v2/);
});

test("provider requires explicit findings and forbids absence-by-omission or dimensions", () => {
  assert.match(provider, /Never treat an omitted subject or omitted proposal as absent/);
  assert.match(provider, /applicabilityFindings/);
  assert.match(provider, /"present", "absent", "unclear"/);
  assert.match(provider, /confidence/);
  assert.match(provider, /reason/);
  assert.match(provider, /Do not infer measurements/);
  assert.doesNotMatch(provider, /measuredValue|dimensionValue|prefill/);
});

test("only findings grounded in effective human-approved assignments drive the form", () => {
  assert.match(component, /groundedAttemptIds/);
  assert.match(component, /intakeCoverageForItem\(item\)/);
  assert.match(component, /finding\.intakeAttemptId/);
  assert.match(component, /latestByAttempt/);
  assert.match(component, /explicit\.size > 1/);
  assert.match(component, /finding\.confidence < 0\.85/);
  assert.match(component, /finding: "unclear" as const/);
  assert.match(component, /Missing findings are never treated as No/);
});

test("landing present, absent, and unclear states show only truthful controls", () => {
  assert.match(component, /landingFinding\?\.finding === "present"/);
  assert.match(component, /Photo review: a stair landing is present/);
  assert.match(component, /landingFinding\?\.finding === "absent"/);
  assert.match(component, /Photo review: no stair landing is shown/);
  assert.match(component, /Is there a stair landing\?/);
  assert.match(component, /photo review could not determine this/);
  assert.match(component, /Stair landing size \(length × width\)/);
  assert.match(component, /No explicit landing finding was saved/);
  assert.match(component, /Change this finding/);
});

test("landing decision persists without inventing a measurement", () => {
  assert.match(component, /applicability:\s*\{\s*landingPresent:/s);
  assert.match(component, /measurementFieldsForItem\(item\)/);
  assert.match(
    component,
    /field !== "landing_dimensions" \|\|\s*effectiveFieldApplicability/s,
  );
  assert.match(migration, /array\['landingPresent'\]::text\[\]/);
  assert.match(migration, /required_field='landing_dimensions' and landing_absent then continue/);
  assert.match(migration, /jsonb_typeof\(requested_observation->'applicability'->'landingPresent'\)<>'boolean'/);
  assert.match(
    component,
    /landing_dimensions: \["Landing length", "Landing width"\]/,
  );
  assert.match(component, /landing_dimensions: "in"/);
  assert.match(component, /draft\.components!\.map\(\(part\) => part\.trim\(\)\)\.join\(" × "\)/);
});

test("focused review preserves every prior applicability key unless explicitly replaced", () => {
  assert.match(classificationRoute, /guided_site_visit_intake_applicability_findings/);
  assert.match(classificationRoute, /classification_review_id/);
  assert.match(classificationRoute, /previousApplicability/);
  assert.match(classificationRoute, /currentKeys/);
  assert.match(
    classificationRoute,
    /`\$\{normalized\.visitItemId\}\\u001f\$\{normalized\.findingKey\}`/,
  );
  assert.match(classificationRoute, /\.\.\.applicabilityFindings/);
  assert.match(classificationRoute, /requested_applicability_findings: applicabilityFindings/);
  assert.match(classificationRoute, /applicabilityFindings,/);
});

test("existing approved photos can be analyzed once without re-upload", () => {
  assert.match(component, /applicabilityAnalysisCandidates/);
  assert.match(component, /latest\.schemaVersion !== "guided-deck-intake-classification-v2"/);
  assert.match(component, /!hasApplicabilityResult/);
  assert.match(component, /Analyze saved photos/);
  assert.match(component, /does not upload anything again/);
  assert.match(component, /for \(const attemptId of applicabilityAnalysisCandidates\)/);
  assert.match(component, /guided-visit-applicability:\$\{attemptId\}:\$\{crypto\.randomUUID\(\)\}/);
  assert.match(component, /Completed reviews stay saved/);
  assert.match(component, /await loadIntakeEvidence\(visit\.id\)/);
  assert.doesNotMatch(component, /analyzeExistingPhotoApplicability[\s\S]{0,1200}upload-session/);
});

test("current reviews persist an unclear result when the provider cannot decide", () => {
  assert.match(classificationRoute, /intakeApplicabilityTargets/);
  assert.match(classificationRoute, /finding: "unclear" as const/);
  assert.match(classificationRoute, /confidence: 0/);
  assert.match(
    classificationRoute,
    /photo review did not provide an explicit determination/,
  );
  assert.match(component, /diagnosticClass !== "classified"/);
});
