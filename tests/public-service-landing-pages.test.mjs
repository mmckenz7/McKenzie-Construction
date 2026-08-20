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

test("renovation photos are grouped into private, photo-backed project stories", () => {
  const ranch = read("src/app/projects/east-tennessee-ranch-renovation/page.tsx");
  const cottage = read("src/app/projects/east-tennessee-cottage-renovation/page.tsx");
  const shared = read("src/components/renovation-project-page.tsx");
  const projects = read("src/app/projects/page.tsx");
  const sitemap = read("src/app/sitemap.ts");

  assert.match(ranch, /canonical: "\/projects\/east-tennessee-ranch-renovation"/);
  assert.match(cottage, /canonical: "\/projects\/east-tennessee-cottage-renovation"/);
  assert.match(shared, /Exact addresses and homeowner details/);
  assert.match(shared, /Exterior%20Residential%20Project/);
  assert.match(projects, /east-tennessee-ranch-renovation/);
  assert.match(projects, /east-tennessee-cottage-renovation/);
  assert.match(sitemap, /projects\/east-tennessee-ranch-renovation/);
  assert.match(sitemap, /projects\/east-tennessee-cottage-renovation/);
  assert.doesNotMatch(`${ranch}\n${cottage}`, /Cecil Avenue|Valley View/);
});

test("completed deck work is the primary project focus", () => {
  const home = read("src/app/page.tsx");
  const projects = read("src/app/projects/page.tsx");
  const trex = read("src/app/projects/knoxville-trex-deck-replacement/page.tsx");
  const porch = read("src/app/projects/tellico-village-screened-porch/page.tsx");
  const coveredDeck = read("src/app/projects/east-tennessee-elevated-covered-deck/page.tsx");
  const sitemap = read("src/app/sitemap.ts");

  assert.match(home, /projects\/knoxville-trex-deck\/finished-deck-wide\.jpg/);
  assert.match(home, /projects\/tellico-village-screened-porch\/screened-living-space\.jpg/);
  assert.doesNotMatch(home, /images\.unsplash\.com/);
  assert.ok(projects.indexOf("Knoxville Trex Deck Replacement") < projects.indexOf("East Tennessee Ranch Home Renovation"));
  assert.match(trex, /canonical: "\/projects\/knoxville-trex-deck-replacement"/);
  assert.match(trex, /Trex decking/);
  assert.match(porch, /canonical: "\/projects\/tellico-village-screened-porch"/);
  assert.match(porch, /Screened%20Porch/);
  assert.match(coveredDeck, /canonical: "\/projects\/east-tennessee-elevated-covered-deck"/);
  assert.match(coveredDeck, /finished soffit ceiling/);
  assert.doesNotMatch(coveredDeck, /Pearson/i);
  assert.match(sitemap, /projects\/knoxville-trex-deck-replacement/);
  assert.match(sitemap, /projects\/tellico-village-screened-porch/);
  assert.match(sitemap, /projects\/east-tennessee-elevated-covered-deck/);
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
  assert.match(gallery, /Choose a project to see the complete photo story/);
  assert.match(gallery, /\/contact\?projectType=New%20Deck/);
  assert.match(gallery, /\/projects\/knoxville-trex-deck-replacement/);
  assert.match(gallery, /\/projects\/tellico-village-screened-porch/);
  assert.match(gallery, /\/projects\/east-tennessee-elevated-covered-deck/);
  assert.match(gallery, /\/projects\/island-ford/);
  assert.match(gallery, /\/projects\/east-tennessee-ranch-renovation/);
  assert.match(gallery, /\/projects\/east-tennessee-cottage-renovation/);
  assert.match(gallery, /project\.photoCount/);
  assert.doesNotMatch(gallery, /columns-1/);
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
