import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const privacy = readFileSync("src/app/privacy/page.tsx", "utf8");
const terms = readFileSync("src/app/sms-terms/page.tsx", "utf8");
const consent = readFileSync("src/app/sms-consent/page.tsx", "utf8");
const reusableFooter = readFileSync("src/components/footer.tsx", "utf8");
const homePage = readFileSync("src/app/page.tsx", "utf8");
const publicPhoneSurfaces = [
  "src/app/layout.tsx",
  "src/app/page.tsx",
  "src/app/contact/page.tsx",
  "src/app/services/page.tsx",
  "src/app/knoxville-deck-builder/page.tsx",
  "src/app/thank-you/page.tsx",
  "src/components/home-navigation.tsx",
].map((path) => readFileSync(path, "utf8"));

test("privacy page contains the approved SMS privacy disclosures", () => {
  assert.match(privacy, /message frequency varies/i);
  assert.match(privacy, /Message and data rates may apply/);
  assert.match(privacy, /Reply\s+STOP to opt out or HELP for assistance/);
  assert.match(privacy, /Consent is not a condition\s+of purchase/);
  assert.match(privacy, /does not sell or rent mobile numbers or SMS/);
  assert.match(privacy, /do not share mobile numbers or SMS/);
  assert.match(privacy, /marketing or promotional purposes/);
  assert.match(privacy, /href="\/sms-terms"/);
  assert.match(privacy, /href="\/sms-consent"/);
});

test("SMS terms identify program rules, eligibility, delivery, and privacy", () => {
  assert.match(terms, /conversational and transactional text/);
  assert.match(terms, /inquiries, appointments, estimates, projects/);
  assert.match(terms, /Reply STOP to opt out/);
  assert.match(terms, /Reply HELP for assistance/);
  assert.match(terms, /at least 18 years old/);
  assert.match(terms, /carriers are not liable for delayed or undelivered messages/i);
  assert.match(terms, /href="\/privacy"/);
});

test("SMS consent page preserves the approved script and website boundary", () => {
  assert.match(consent, /May McKenzie Construction send text messages to this mobile/);
  assert.match(consent, /Message frequency varies/);
  assert.match(consent, /Reply STOP to opt out or HELP for/);
  assert.match(consent, /Consent is not a condition of purchase/);
  assert.match(consent, /website form is\s+not SMS opt-in/);
  assert.match(consent, /website form does not store SMS consent/);
  assert.match(consent, /verbally or by text/);
});

test("SMS consent page alone provides the visible START text action", () => {
  assert.match(consent, /Text START to 865-433-3325/);
  assert.match(consent, /Send START to 865-433-3325/);
  assert.match(consent, /href="sms:\+18654333325\?body=START"/);
  assert.equal(privacy.includes("body=START"), false);
  assert.equal(terms.includes("body=START"), false);
});

test("both public footer variants expose all three compliance routes", () => {
  for (const source of [reusableFooter, homePage]) {
    assert.match(source, /href="\/privacy"/);
    assert.match(source, /href="\/sms-terms"/);
    assert.match(source, /href="\/sms-consent"/);
  }
});

test("approved public surfaces use the SMS-capable public number", () => {
  for (const source of publicPhoneSurfaces) {
    assert.equal(source.includes("865-263-3811"), false);
    assert.equal(source.includes("8652633811"), false);
    assert.equal(source.includes("+18652633811"), false);
    assert.match(source, /865-433-3325|8654333325|\+18654333325/);
  }
});
