import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const pages = [
  {
    file: "src/app/deck-replacement-knoxville/page.tsx",
    canonical: "/deck-replacement-knoxville",
    phrase: "Deck Replacement in Knoxville, TN",
  },
  {
    file: "src/app/composite-decks-knoxville/page.tsx",
    canonical: "/composite-decks-knoxville",
    phrase: "Composite Deck Builder in Knoxville, TN",
  },
  {
    file: "src/app/covered-decks-knoxville/page.tsx",
    canonical: "/covered-decks-knoxville",
    phrase: "Covered Deck Builder in Knoxville, TN",
  },
];

test("high-intent service pages have unique metadata and substantive content", () => {
  for (const page of pages) {
    const source = read(page.file);
    assert.match(source, new RegExp(page.phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.ok(source.includes(`canonical: "${page.canonical}"`));
    assert.match(source, /planningDetails=\{\[/);
    assert.match(source, /processDetails=\{\[/);
    assert.match(source, /const faqs = \[/);
  }
});

test("shared service template keeps visible FAQs aligned with search data and lead actions", () => {
  const source = read("src/components/service-landing-page.tsx");
  assert.match(source, /"@type": "Service"/);
  assert.match(source, /"@type": "FAQPage"/);
  assert.match(source, /faqs\.map/);
  assert.match(source, /Request a Consultation/);
  assert.match(source, /projectType/);
  assert.match(source, /encodeURIComponent\(projectType\)/);
  assert.match(source, /Call or Text \(865\) 433-3325/);
  assert.match(source, /View Completed Work/);
});

test("service intent carries into an editable contact form", () => {
  const contact = read("src/app/contact/page.tsx");
  const form = read("src/components/project-request-form.tsx");

  assert.match(contact, /readProjectType/);
  assert.match(contact, /supportedProjectTypes/);
  assert.match(contact, /defaultProjectType=\{defaultProjectType\}/);
  assert.match(contact, /You can change it below/);
  assert.match(form, /defaultValue=\{defaultProjectType\}/);
  assert.doesNotMatch(contact, /dangerouslySetInnerHTML.*projectType/s);
});

test("completed project page has canonical metadata and matching project data", () => {
  const source = read("src/app/projects/island-ford/page.tsx");

  assert.match(source, /canonical: "\/projects\/island-ford"/);
  assert.match(source, /"@type": "CreativeWork"/);
  assert.match(source, /Lake City, Tennessee/);
  assert.match(source, /McKenzie Construction/);
});

test("public navigation works on mobile and service pages expose breadcrumbs", () => {
  const navigation = read("src/components/navigation.tsx");
  const service = read("src/components/service-landing-page.tsx");

  assert.match(navigation, /aria-label="Mobile navigation"/);
  assert.match(navigation, /Request a Consultation/);
  assert.match(navigation, /min-h-11/);
  assert.match(service, /"@type": "BreadcrumbList"/);
  assert.match(service, /aria-label="Breadcrumb"/);
});

test("project gallery has search metadata and a path to consultation", () => {
  const gallery = read("src/app/projects/gallery/page.tsx");

  assert.match(gallery, /canonical: "\/projects\/gallery"/);
  assert.match(gallery, /View the Full Project/);
  assert.match(gallery, /\/contact\?projectType=New%20Deck/);
  assert.match(gallery, /\/projects\/completed-renovations\/renovation-one-exterior\.jpg/);
  assert.match(gallery, /\/projects\/completed-renovations\/renovation-two-living-room\.jpg/);
  assert.doesNotMatch(gallery, /Cecil Avenue|Valley View/);
});

test("new services are discoverable through internal links and sitemap", () => {
  const sitemap = read("src/app/sitemap.ts");
  const footer = read("src/components/footer.tsx");
  const services = read("src/app/services/page.tsx");

  for (const page of pages) {
    assert.ok(sitemap.includes(page.canonical));
    assert.ok(footer.includes(page.canonical));
  }

  assert.match(services, /href: "\/deck-replacement-knoxville"/);
  assert.match(services, /href: "\/covered-decks-knoxville"/);
});
