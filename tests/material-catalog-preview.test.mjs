import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  formatMaterialCatalogDate,
  formatMaterialCatalogMoney,
} from "../src/lib/material-catalog-preview-format.ts";

const page = readFileSync(
  "src/app/operations/materials/catalog/page.tsx",
  "utf8",
);
const loading = readFileSync(
  "src/app/operations/materials/catalog/loading.tsx",
  "utf8",
);
const loader = readFileSync(
  "src/lib/material-catalog-preview.ts",
  "utf8",
);
const formatter = readFileSync(
  "src/lib/material-catalog-preview-format.ts",
  "utf8",
);
const view = readFileSync(
  "src/components/material-catalog-preview-view.tsx",
  "utf8",
);

test("preview uses the Core page decision before any tenant loader call", () => {
  assert.match(page, /getMaterialCatalogAuthorizationDecision\(\s*"view_supplier_comparisons"/);
  assert.match(page, /if \(decision\.state !== "authorized"\)/);
  assert.ok(
    page.indexOf('decision.state !== "authorized"') <
      page.indexOf("loadMaterialCatalogPreview("),
  );
  assert.match(page, /decision\.authorization\.companyId/);
  assert.match(page, /export const dynamic = "force-dynamic"/);
  assert.match(page, /export const revalidate = 0/);
  assert.doesNotMatch(page, /createAdminServerClient|getWorkspaceAccess|getServerFeatureMap/);
});

test("loader starts from company observations and constrains later global reads", () => {
  assert.match(loader, /^import "server-only";/);
  assert.ok(
    loader.indexOf('.from("supplier_offer_observations")') <
      loader.indexOf('.from("supplier_product_offers")'),
  );
  assert.ok(
    loader.indexOf('.from("supplier_offer_observations")') <
      loader.indexOf('.from("material_catalog")'),
  );
  assert.match(
    loader,
    /from\("supplier_offer_observations"\)[\s\S]*?\.eq\("company_id", companyId\)/,
  );
  assert.match(loader, /\.in\("observation_id", observationIds\)/);
  assert.match(loader, /\.in\("id", offerIds\)/);
  assert.match(loader, /\.in\("id", productIds\)/);
  assert.match(loader, /OBSERVATION_LIMIT = 160/);
  assert.match(loader, /RELATED_ROW_LIMIT = 500/);
});

test("preview never reads legacy selected prices or mutation surfaces", () => {
  for (const source of [page, loading, loader, view]) {
    assert.doesNotMatch(
      source,
      /material_supplier_prices|choosePrice|effective_unit_cost|catalog_fallback|needs_live_lookup/,
    );
    assert.doesNotMatch(
      source,
      /\.insert\(|\.update\(|\.delete\(|method:\s*["'](?:POST|PATCH|PUT|DELETE)|use server|server action/i,
    );
  }
  assert.doesNotMatch(loader, /source_reference|raw_record_sha256|credential_reference|account_number|metadata|published_by_auth_user_id|verified_by_auth_user_id|terms_note/);
  assert.doesNotMatch(view, /^"use client";/);
  assert.match(view, /<form method="get"/);
});

test("read model exposes exact unit and evidence semantics without ranking", () => {
  assert.match(loader, /sellUnit: string/);
  assert.match(loader, /minimumOrderQuantity: string \| null/);
  assert.match(loader, /orderIncrement: string \| null/);
  assert.match(loader, /price_quantity_text:price_quantity::text,price_unit_id,tier_min_quantity_text:tier_min_quantity::text,tier_max_quantity_text:tier_max_quantity::text/);
  assert.match(loader, /Observed .*day/);
  assert.match(loader, /verification_status !== "verified"/);
  assert.match(loader, /rounding_mode !== "exact"/);
  assert.match(view, /Supplier sell unit/);
  assert.match(view, /Tier basis/);
  assert.match(view, /Confidence/);
  assert.match(view, /Availability/);
  assert.match(view, /No supplier is ranked/);
  assert.doesNotMatch(view, /best price|recommended supplier|selected price/i);
});

test("preview has honest loading, denial, empty, incomplete, and error states", () => {
  assert.match(loading, /MaterialCatalogPreviewLoading/);
  assert.match(view, /Loading catalog evidence/);
  for (const state of [
    "unauthorized",
    "access_unavailable",
    "feature_unavailable",
    "feature_disabled",
    "forbidden",
    "tenant_scope_unavailable",
  ]) {
    assert.match(view, new RegExp(`${state}:`));
  }
  assert.match(view, /Legacy identity incomplete/);
  assert.match(view, /No published supplier observations are available/);
  assert.match(view, /No catalog products match these filters/);
  assert.match(view, /no price component was published/i);
  assert.match(view, /No fallback price was substituted/);
  assert.match(view, /This preview does not create sample data/);
});

test("filters are bounded allowlists and remain read-only URL state", () => {
  assert.match(loader, /SEARCH_LIMIT = 80/);
  assert.match(loader, /mappingStatuses = new Set/);
  assert.match(loader, /\^\[a-z0-9-\]\{1,80\}\$/);
  assert.match(view, /name="q"/);
  assert.match(view, /name="supplier"/);
  assert.match(view, /name="mappingStatus"/);
  assert.doesNotMatch(view, /name="(?:company|companyId|tenant)"/i);
});

test("decimal price evidence preserves the exact database string", () => {
  assert.equal(formatMaterialCatalogMoney("12.3400", "USD"), "USD 12.3400");
  assert.equal(formatMaterialCatalogMoney(12.34, "USD"), "Not provided");
  assert.equal(formatMaterialCatalogMoney("-0.1000", "USD"), "Not provided");
  assert.match(loader, /amount_text:amount::text/);
  assert.doesNotMatch(formatter, /Number\(rawAmount\)|parseFloat\(rawAmount\)|parseInt\(rawAmount/);
});

test("date-only evidence preserves its calendar date without timezone shift", () => {
  assert.equal(formatMaterialCatalogDate("2026-08-11"), "Aug 11, 2026");
  assert.doesNotMatch(formatMaterialCatalogDate("2026-08-11"), /Aug 10/);
  assert.match(formatter, /timeZone: isDateOnly \? "UTC" : BUSINESS_TIME_ZONE/);
  assert.match(formatter, /BUSINESS_TIME_ZONE = "America\/New_York"/);
});

test("summary counts are derived only from final search-filtered DTOs", () => {
  const productDtosIndex = loader.indexOf("const productDtos =");
  const displayedOffersIndex = loader.indexOf("const displayedOffers =");
  const summaryIndex = loader.indexOf("summary: Object.freeze({", displayedOffersIndex);
  assert.ok(productDtosIndex >= 0 && productDtosIndex < displayedOffersIndex);
  assert.ok(displayedOffersIndex < summaryIndex);
  assert.match(loader, /const displayedOffers = productDtos\.flatMap/);
  assert.match(loader, /offers: displayedOffers\.length/);
  assert.match(loader, /observations: displayedOffers\.length/);
  assert.match(loader, /offersMissingPrice: displayedOffers\.filter/);
  assert.doesNotMatch(loader, /displayedObservationCount|offersNeedingEvidence/);
  assert.match(view, /Offers missing price/);
});

test("all displayed collections use deterministic code-point ordering", () => {
  assert.match(loader, /function codePointCompare/);
  assert.match(loader, /return left < right \? -1 : left > right \? 1 : 0/);
  assert.match(loader, /supplierOptions[\s\S]*?\.sort\(\(left, right\) => compareFields/);
  assert.match(loader, /priceDtos[\s\S]*?\.sort\(\(left, right\) => compareFields/);
  assert.match(loader, /productOffers\.sort\(\(left, right\) => compareFields/);
  assert.match(loader, /productDtos[\s\S]*?\.sort\(\(left, right\) => compareFields/);
  assert.doesNotMatch(loader, /localeCompare/);
  assert.match(loader, /left\.dto\.priceType[\s\S]*left\.id/);
  assert.match(loader, /left\.dto\.supplierName[\s\S]*left\.id/);
  assert.match(loader, /left\.dto\.displayName[\s\S]*left\.id/);
  assert.match(loader, /\.map\(\(entry\) => entry\.dto\)/);
});

test("caps are truthful and related-row overflow fails closed", () => {
  assert.match(loader, /\.limit\(OBSERVATION_LIMIT \+ 1\)/);
  assert.match(loader, /observationRows\.length > OBSERVATION_LIMIT/);
  assert.match(loader, /observationRows\.slice\(0, OBSERVATION_LIMIT\)/);
  assert.match(loader, /if \(rows\.length > limit\) throw new MaterialCatalogPreviewLoadError/);
  assert.match(loader, /\.limit\(RELATED_ROW_LIMIT \+ 1\), RELATED_ROW_LIMIT/);
  assert.match(loader, /resultsLimited,/);
  assert.match(view, /Showing a bounded evidence set/);
  assert.match(view, /counts below do not represent the full catalog/);
});
