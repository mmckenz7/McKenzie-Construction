import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildLowesPilotEvidence,
  buildLowesPilotManifest,
  canonicalLowesPriceSearchUrl,
  canonicalLowesUrl,
  LOWES_EAST_KNOXVILLE_OBSERVED_AT,
  LOWES_EAST_KNOXVILLE_RAIL_OBSERVED_AT,
  LOWES_EAST_KNOXVILLE_PILOT_ITEMS,
  LOWES_EAST_KNOXVILLE_STORE,
  sha256CanonicalJson,
} from "../src/lib/material-catalog-lowes-pilot.ts";

const workflow = readFileSync(
  "src/lib/material-catalog-lowes-pilot-workflow.ts",
  "utf8",
);
const service = readFileSync(
  "src/lib/material-catalog-lowes-pilot-service.ts",
  "utf8",
);
const route = readFileSync(
  "src/app/api/material-catalog/pilots/lowes-east-knoxville/route.ts",
  "utf8",
);
const reviewPage = readFileSync(
  "src/components/lowes-pilot-review.tsx",
  "utf8",
);

test("the pilot is exactly the four Controller-reviewed East Knoxville observations", () => {
  assert.equal(LOWES_EAST_KNOXVILLE_STORE.storeNumber, "1544");
  assert.equal(LOWES_EAST_KNOXVILLE_STORE.addressLine1, "3100 S Mall Rd NE");
  assert.equal(LOWES_EAST_KNOXVILLE_STORE.city, "Knoxville");
  assert.equal(LOWES_EAST_KNOXVILLE_STORE.state, "TN");
  assert.equal(LOWES_EAST_KNOXVILLE_STORE.postalCode, "37924");
  assert.equal(LOWES_EAST_KNOXVILLE_OBSERVED_AT, "2026-08-11T20:52:58.340Z");
  assert.equal(LOWES_EAST_KNOXVILLE_RAIL_OBSERVED_AT, "2026-08-11T21:50:36.621Z");
  assert.deepEqual(
    LOWES_EAST_KNOXVILLE_PILOT_ITEMS.map(({ itemNumber, modelNumber, priceAmount }) =>
      [itemNumber, modelNumber, priceAmount]),
    [
      ["202922", "635548", "2.28"],
      ["10385", "110180", "6.98"],
      ["894294", "48419", "29.98"],
      ["312282", "OG220408-AG", "4.68"],
    ],
  );
  assert.deepEqual(
    LOWES_EAST_KNOXVILLE_PILOT_ITEMS.map(({ observedAt }) => observedAt),
    [
      LOWES_EAST_KNOXVILLE_OBSERVED_AT,
      LOWES_EAST_KNOXVILLE_OBSERVED_AT,
      LOWES_EAST_KNOXVILLE_OBSERVED_AT,
      LOWES_EAST_KNOXVILLE_RAIL_OBSERVED_AT,
    ],
  );
  assert.equal(
    LOWES_EAST_KNOXVILLE_PILOT_ITEMS[3]?.priceSourcePath,
    "/search?searchTerm=Severe%20Weather%202-in%20x%204-in%20x%208-ft%20pressure%20treated",
  );
});

test("evidence is public retail, store-scoped, exact, and deliberately availability-free", () => {
  for (const item of LOWES_EAST_KNOXVILLE_PILOT_ITEMS) {
    const evidence = buildLowesPilotEvidence(item);
    assert.equal(evidence.availabilityStatus, "unknown");
    assert.equal(evidence.priceType, "retail");
    assert.equal(evidence.currencyCode, "USD");
    assert.equal(evidence.storeNumber, "1544");
    assert.equal(evidence.taxIncluded, null);
    assert.equal(evidence.priceEvidenceSurface, "localized_search_results");
    assert.match(evidence.priceSourceReference, /^https:\/\/www\.lowes\.com\/search\?searchTerm=/);
    assert.match(evidence.identitySourceReference, /^https:\/\/www\.lowes\.com\/pd\//);
    assert.match(evidence.priceAmount, /^\d+\.\d{2}$/);
    assert.match(evidence.rawRecordSha256, /^[0-9a-f]{64}$/);
    assert.equal(evidence.canonicalUrl, `https://www.lowes.com${item.canonicalPath}`);
    assert.doesNotMatch(JSON.stringify(evidence), /cookie|account|contractor|inventory|delivery/i);
  }
  assert.equal(LOWES_EAST_KNOXVILLE_PILOT_ITEMS[2]?.sellUnitCode, "PACK");
  assert.equal(LOWES_EAST_KNOXVILLE_PILOT_ITEMS[2]?.packageQuantity, "310");
});

test("canonical URLs reject arbitrary hosts, query strings, and non-product paths", () => {
  assert.throws(() => canonicalLowesUrl("https://evil.example/pd/a/1"));
  assert.throws(() => canonicalLowesUrl("/pd/a/1?tracking=yes"));
  assert.throws(() => canonicalLowesUrl("/search/fence"));
  assert.throws(() => canonicalLowesPriceSearchUrl("/search?searchTerm=10385"));
  assert.equal(
    canonicalLowesPriceSearchUrl("/search?searchTerm=202922"),
    "https://www.lowes.com/search?searchTerm=202922",
  );
  assert.equal(canonicalLowesUrl("/pd/Product-Name/123"), "https://www.lowes.com/pd/Product-Name/123");
});

test("manifest hashes are deterministic and change with evidence", () => {
  const first = buildLowesPilotManifest();
  const second = buildLowesPilotManifest();
  assert.equal(first.manifestSha256, second.manifestSha256);
  assert.equal(first.manifestSha256.length, 64);
  assert.notEqual(sha256CanonicalJson({ price: "2.28" }), sha256CanonicalJson({ price: "2.29" }));
});

test("workflow stages before review and never writes legacy price surfaces", () => {
  assert.match(workflow, /status: "review_required"/);
  assert.match(workflow, /row_status: "unmatched"/);
  assert.match(workflow, /availabilityStatus: "unknown"/);
  assert.match(workflow, /changeType: "new_offer"/);
  assert.doesNotMatch(service, /material_supplier_prices/);
  assert.doesNotMatch(service, /from\("estimates"\)|from\("estimate_line_items"\)/);
  assert.doesNotMatch(service, /fetch\(|axios|cheerio|puppeteer|playwright/i);
  for (const rpc of [
    "stage_material_catalog_web_lookup_import",
    "review_material_catalog_web_lookup_import",
    "preview_material_catalog_web_lookup_import",
    "approve_material_catalog_import",
    "publish_material_catalog_import",
  ]) assert.match(service, new RegExp(`rpc\\(\\s*"${rpc}"`));
  assert.doesNotMatch(service, /\.insert\(|\.update\(|\.delete\(/);
});

test("owner review is visual, fixed-data, sequential, and never auto-publishes", () => {
  for (const label of [
    "Stage evidence",
    "Confirm product identities",
    "Build price preview",
    "Approve preview",
    "Publish four prices",
  ]) assert.match(reviewPage, new RegExp(label));
  assert.match(reviewPage, /availability, delivery, and tax are unknown/i);
  assert.match(reviewPage, /Price source/);
  assert.match(reviewPage, /Identity source/);
  assert.match(reviewPage, /Loading this page never writes or publishes anything/);
  assert.match(reviewPage, /onClick=\{\(\) => runAction\(action\)\}/);
  assert.doesNotMatch(reviewPage, /useEffect|autoPublish|defaultValue|<input|<textarea|<select/);
});

test("the fixed endpoint uses action-specific catalog capabilities", () => {
  for (const capability of [
    "upload_supplier_imports",
    "review_product_mappings",
    "preview_price_changes",
    "publish_supplier_prices",
  ]) assert.match(route, new RegExp(`"${capability}"`));
  assert.doesNotMatch(route, /body\.(?:url|sourceReference|priceAmount|itemNumber)/);
  assert.match(route, /Cache-Control", "no-store"/);
});
