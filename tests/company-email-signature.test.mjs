import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  composeSignedEmail,
  EMAIL_SIGNATURE_RENDERER_VERSION,
  parseEmailSignatureLayout,
  renderEmailSignature,
} from "../src/lib/communications/email-signature.ts";

const completeFacts = {
  companyName: "McKenzie Construction",
  companyPhone: "865-555-0100",
  companyEmail: "office@example.com",
  websiteUrl: "https://example.com/contact",
  logoUrl: "https://example.com/company-logo.png",
  primaryColor: "#112233",
  accentColor: "#AABBCC",
  employeeName: "Jordan Builder",
  employeeTitle: "Project Manager",
  employeePhone: "865-555-0101",
  employeeEmail: "jordan@example.com",
};

test("signature layout is a closed company-controlled enum", () => {
  assert.equal(parseEmailSignatureLayout("off"), "off");
  assert.equal(parseEmailSignatureLayout("compact"), "compact");
  assert.equal(parseEmailSignatureLayout("branded"), "branded");
  assert.equal(parseEmailSignatureLayout("custom-html"), "off");
  assert.equal(parseEmailSignatureLayout(null), "off");
});

test("off preserves the authored text and still produces escaped provider HTML", () => {
  const result = composeSignedEmail("Hello <team> & everyone", "off", completeFacts);
  assert.equal(result.text, "Hello <team> & everyone");
  assert.equal(result.signature, null);
  assert.match(result.html, /Hello &lt;team&gt; &amp; everyone/);
  assert.doesNotMatch(result.html, /data-company-email-signature/);
});

test("compact uses authoritative employee facts and cleanly omits the logo", () => {
  const signature = renderEmailSignature("compact", completeFacts);
  assert.ok(signature);
  assert.equal(signature.layout, "compact");
  assert.match(signature.plainText, /Jordan Builder/);
  assert.match(signature.plainText, /Project Manager/);
  assert.match(signature.plainText, /jordan@example[.]com/);
  assert.equal(signature.preview.logoUrl, null);
  assert.doesNotMatch(signature.html, /<img/);
});

test("branded accepts only the authoritative HTTPS logo reference", () => {
  const httpsSignature = renderEmailSignature("branded", completeFacts);
  assert.equal(httpsSignature?.preview.logoUrl, "https://example.com/company-logo.png");
  assert.match(httpsSignature?.html ?? "", /<img src="https:\/\/example[.]com\/company-logo[.]png"/);

  for (const logoUrl of [
    "/branding/company-logo.png",
    "http://example.com/logo.png",
    "data:image/png;base64,not-real",
    "javascript:alert(1)",
  ]) {
    const signature = renderEmailSignature("branded", {
      ...completeFacts,
      logoUrl,
    });
    assert.equal(signature?.preview.logoUrl, null);
    assert.doesNotMatch(signature?.html ?? "", /<img/);
  }
});

test("all signature fields and authored text are HTML escaped", () => {
  const result = composeSignedEmail(
    "Hello\n<script>alert('message')</script>",
    "branded",
    {
      ...completeFacts,
      employeeName: "<img src=x onerror=alert(1)>",
      employeeTitle: "Owner & Builder",
      companyName: "Build <Strong>",
    },
  );
  assert.doesNotMatch(result.html, /<script>|<img src=x onerror=/);
  assert.match(result.html, /&lt;script&gt;/);
  assert.match(result.html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(result.html, /Owner &amp; Builder/);
  assert.match(result.html, /Build &lt;Strong&gt;/);
});

test("the final plain-text snapshot is signed once across retries", () => {
  const first = composeSignedEmail("Approved staging note", "compact", completeFacts);
  const replay = composeSignedEmail(first.text, "compact", completeFacts);
  assert.equal(replay.text, first.text);
  assert.equal(
    replay.text.split("Jordan Builder").length - 1,
    1,
  );
  assert.deepEqual(first.signature, {
    layout: "compact",
    version: EMAIL_SIGNATURE_RENDERER_VERSION,
  });
});

test("missing optional employee and company fields are omitted without empty separators", () => {
  const signature = renderEmailSignature("branded", {
    employeeName: "Jordan Builder",
    companyName: "McKenzie Construction",
  });
  assert.equal(
    signature?.plainText,
    "Jordan Builder\nMcKenzie Construction",
  );
  assert.doesNotMatch(signature?.plainText ?? "", /undefined|null| · /);
});

test("migration, routes, provider, and UI preserve signature authority boundaries", () => {
  const migration = readFileSync("supabase/migrations/20260826180000_company_email_signature_layout.sql", "utf8");
  const settingsRoute = readFileSync("src/app/api/company-branding/route.ts", "utf8");
  const previewRoute = readFileSync("src/app/api/communications/signature-preview/route.ts", "utf8");
  const replyRoute = readFileSync("src/app/api/communications/replies/route.ts", "utf8");
  const provider = readFileSync("src/lib/communications/provider.ts", "utf8");
  const processor = readFileSync("src/lib/communications/processor.ts", "utf8");
  const brandingForm = readFileSync("src/components/company-branding-form.tsx", "utf8");
  const composer = readFileSync("src/components/communication-reply-composer.tsx", "utf8");

  assert.match(migration, /email_signature_layout text not null default 'off'/i);
  assert.match(migration, /check \(email_signature_layout in \('off', 'compact', 'branded'\)\)/i);
  assert.doesNotMatch(migration, /team_members[\s\S]*update|insert into public[.]team_members/i);
  assert.match(settingsRoute, /hasManagementAccess/);
  assert.match(settingsRoute, /EMAIL_SIGNATURE_LAYOUTS[.]includes/);
  assert.match(previewRoute, /canAccessWorkspace\(workspace[.]access, "sales"\)/);
  assert.match(previewRoute, /communicationWorkspaceMatchesSingletonCompany/);
  assert.match(replyRoute, /loadCompanyEmailSignature/);
  assert.match(replyRoute, /body: signedEmail[.]text/);
  assert.match(replyRoute, /html: signedEmail[.]html/);
  assert.match(replyRoute, /email_signature: signedEmail[.]signature/);
  assert.match(provider, /html: message[.]html/);
  assert.match(processor, /plainTextEmailHtml\(candidate[.]body\)/);
  assert.match(brandingForm, />Off<|>Compact<|>Branded</);
  assert.match(brandingForm, /Automatic email signature preview/);
  assert.match(composer, /This preview is not editable here/);
  assert.doesNotMatch(composer, /form[.]set\("signature/);
});
