import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  normalizePublicLeadAttribution,
  publicLeadSource,
} from "../src/lib/public-lead-attribution.ts";

const leadRoute = readFileSync("src/app/api/leads/route.ts", "utf8");
const contact = readFileSync("src/app/contact/page.tsx", "utf8");
const form = readFileSync("src/components/project-request-form.tsx", "utf8");
const capture = readFileSync("src/components/public-lead-attribution.tsx", "utf8");
const tracker = readFileSync("src/components/lead-conversion-tracker.tsx", "utf8");
const thankYou = readFileSync("src/app/thank-you/page.tsx", "utf8");

test("paid campaign attribution is bounded and identifies Google Ads", () => {
  const attribution = normalizePublicLeadAttribution({
    utm_source: " google ",
    utm_medium: "cpc",
    utm_campaign: "composite-deck-replacement-knoxville",
    gclid: "synthetic-click-id",
    landing_path: "/deck-replacement-knoxville",
    ignored: "not-stored",
  });
  assert.deepEqual(attribution, {
    utm_source: "google",
    utm_medium: "cpc",
    utm_campaign: "composite-deck-replacement-knoxville",
    gclid: "synthetic-click-id",
    landing_path: "/deck-replacement-knoxville",
  });
  assert.equal(publicLeadSource(attribution), "google_ads");
  assert.equal(publicLeadSource({ utm_source: "newsletter" }), "website");
  assert.equal(normalizePublicLeadAttribution({ landing_path: "//outside.test" }).landing_path, undefined);
});

test("landing attribution survives navigation and enters the existing lead workflow", () => {
  assert.match(capture, /sessionStorage\.setItem\(storageKey/);
  assert.match(form, /<PublicLeadAttributionFields \/>/);
  assert.match(leadRoute, /lead_source: publicLeadSource\(attribution\)/);
  assert.match(leadRoute, /metadata: \{[\s\S]*?attribution,/u);
  assert.doesNotMatch(leadRoute, /utm_source:\s*"google"/);
});

test("public submissions enforce bounded facts and explain validation failures", () => {
  assert.match(leadRoute, /phoneDigits\.length < 10/);
  assert.match(leadRoute, /allowedProjectTypes\.has\(projectType\)/);
  assert.match(leadRoute, /allowedContactMethods\.has\(preferredContactMethod\)/);
  assert.match(leadRoute, /Project description",\s*5000/u);
  assert.match(leadRoute, /contact\?error=validation/);
  assert.match(contact, /role="alert"/);
});

test("only a successful lead workflow receives a deduplicated conversion marker", () => {
  assert.match(leadRoute, /return redirectTo\("\/thank-you", crypto\.randomUUID\(\)\)/);
  assert.match(leadRoute, /HttpOnly; Secure; SameSite=Lax/);
  assert.match(thankYou, /cookies\(\)/);
  assert.match(thankYou, /conversionId \? <LeadConversionTracker/);
  assert.match(tracker, /mckenzie-lead-conversion-recorded:\$\{conversionId\}/);
});
