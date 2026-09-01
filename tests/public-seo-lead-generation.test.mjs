import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("homepage uses Knoxville search intent and conversion-focused actions", () => {
  const source = read("src/app/page.tsx");

  assert.match(source, /Knoxville Deck Builder &amp; Outdoor Living Contractor/);
  assert.match(source, /REQUEST A CONSULTATION/);
  assert.match(source, /Call or text 865-433-3325/);
  assert.match(source, /location="homepage_hero"/);
});

test("deck service page presents matching visible FAQs and structured data", () => {
  const source = read("src/app/knoxville-deck-builder/page.tsx");

  assert.match(source, /"@type": "Service"/);
  assert.match(source, /"@type": "FAQPage"/);
  assert.match(source, /frequentlyAskedQuestions\.map/);
  assert.match(source, /Do you build both wood and composite decks\?/);
  assert.match(source, /Can you replace an existing deck\?/);
  assert.match(source, /Call or Text \(865\) 433-3325/);
});

test("lead and phone conversions are recorded without personal information", () => {
  const phone = read("src/components/tracked-phone-link.tsx");
  const lead = read("src/components/lead-conversion-tracker.tsx");
  const analytics = read("src/lib/public-analytics.ts");
  const thankYou = read("src/app/thank-you/page.tsx");

  assert.match(phone, /recordPublicConversion\("phone_call_click", location\)/);
  assert.match(lead, /recordPublicConversion\("generate_lead"/);
  assert.match(lead, /project_request_submitted/);
  assert.match(analytics, /analyticsWindow\.dataLayer\.push/);
  assert.match(analytics, /event_label: eventLabel/);
  assert.match(thankYou, /conversionId \? <LeadConversionTracker conversionId=\{conversionId\}/);
  assert.doesNotMatch(phone + lead + analytics, /email|phone_number|customer_name/i);
});

test("public footers provide one understated employee login link", () => {
  const sharedFooter = read("src/components/footer.tsx");
  const homepage = read("src/app/page.tsx");

  for (const source of [sharedFooter, homepage]) {
    assert.equal((source.match(/href="\/login"/g) ?? []).length, 1);
    assert.match(source, />\s*Employee Login\s*<\/Link>/);
  }
});
