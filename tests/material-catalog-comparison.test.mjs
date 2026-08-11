import assert from "node:assert/strict";
import test from "node:test";

import {
  compareSupplierOffers,
  MATERIAL_CATALOG_COMPARISON_POLICY_VERSION,
} from "../src/lib/material-catalog-comparison.ts";

const pricedForAt = "2026-08-11T12:00:00.000Z";

function candidate(overrides = {}) {
  const base = {
    candidateId: "candidate-a",
    companyId: "company-a",
    productId: "product-a",
    supplierId: "supplier-a",
    supplierLocationId: "location-a",
    companySupplierAccountId: "account-a",
    offerId: "offer-a",
    supplierSku: "SUP-001",
    mappingStatus: "verified",
    offerEffectiveFrom: "2026-01-01T00:00:00.000Z",
    offerEffectiveTo: null,
    sellUnitId: "EA",
    minimumOrderQuantity: null,
    orderIncrement: null,
    observation: {
      id: "observation-a",
      companyId: "company-a",
      observedAt: "2026-08-10T12:00:00.000Z",
      effectiveFrom: "2026-08-01T00:00:00.000Z",
      effectiveTo: null,
      expiresAt: null,
      availabilityStatus: "in_stock",
      inventoryQuantity: null,
      inventoryUnitId: null,
      leadTimeMin: "1",
      leadTimeMax: "2",
      leadTimeUnit: "business_day",
      promisedAvailableDate: null,
      deliveryCost: "5.00",
      deliveryCurrencyCode: "USD",
      sourceType: "api",
      sourceReference: "supplier-request-1",
      rawRecordSha256: "a".repeat(64),
      confidence: "verified",
      correctedByObservationId: null,
    },
    price: {
      id: "price-a",
      priceType: "negotiated",
      amount: "10.00",
      currencyCode: "USD",
      priceQuantity: "1",
      priceUnitId: "EA",
      tierMinQuantity: null,
      tierMaxQuantity: null,
      taxIncluded: true,
    },
    requestedToSellConversionPath: [],
    sellToPriceConversionPath: [],
  };
  return {
    ...base,
    ...overrides,
    observation: { ...base.observation, ...(overrides.observation ?? {}) },
    price: { ...base.price, ...(overrides.price ?? {}) },
  };
}

function compare(candidates, overrides = {}) {
  return compareSupplierOffers({
    companyId: "company-a",
    productId: "product-a",
    requestedQuantity: "2",
    requestedUnitId: "EA",
    pricedForAt,
    maximumObservationAgeDays: 30,
    currencyCode: "USD",
    rankingBasis: "landed_cost",
    candidates,
    ...overrides,
  });
}

test("returns a versioned exact-decimal comparison with provenance", () => {
  const result = compare([candidate()]);
  assert.equal(result.policyVersion, MATERIAL_CATALOG_COMPARISON_POLICY_VERSION);
  assert.equal(result.comparisons.length, 1);
  assert.deepEqual(result.exclusions, []);
  assert.deepEqual(result.comparisons[0], {
    rank: 1,
    rankable: true,
    candidateId: "candidate-a",
    offerId: "offer-a",
    observationId: "observation-a",
    observationPriceId: "price-a",
    supplierId: "supplier-a",
    supplierLocationId: "location-a",
    companySupplierAccountId: "account-a",
    supplierSku: "SUP-001",
    priceType: "negotiated",
    confidence: "verified",
    availabilityStatus: "in_stock",
    inventoryQuantity: null,
    inventoryUnitId: null,
    requestedQuantity: "2.00000000",
    requestedUnitId: "EA",
    preRoundPurchaseQuantity: "2.00000000",
    purchaseQuantity: "2.00000000",
    purchaseUnitId: "EA",
    pricePurchaseQuantity: "2.00000000",
    priceUnitId: "EA",
    coveredRequestedQuantity: "2.00000000",
    leftoverQuantity: "0.00000000",
    merchandiseCost: "20.0000",
    deliveryCost: "5.0000",
    landedCost: "25.0000",
    effectiveMerchandiseCostPerRequestedUnit: "10.0000",
    effectiveLandedCostPerRequestedUnit: "12.5000",
    taxIncluded: true,
    observationAgeDays: "1.00000000",
    observedAt: "2026-08-10T12:00:00.000Z",
    effectiveFrom: "2026-08-01T00:00:00.000Z",
    effectiveTo: null,
    expiresAt: null,
    leadTimeMin: "1",
    leadTimeMax: "2",
    leadTimeUnit: "business_day",
    promisedAvailableDate: null,
    sourceType: "api",
    sourceReference: "supplier-request-1",
    rawRecordSha256: "a".repeat(64),
    requestedToSellConversionPath: [],
    sellToPriceConversionPath: [],
    conversionPath: [],
  });
});

test("uses product-specific conversion evidence and rounds packages upward", () => {
  const conversion = {
    id: "conversion-pack-each",
    productId: "product-a",
    fromUnitId: "EA",
    toUnitId: "PACK",
    fromQuantity: "10",
    toQuantity: "1",
    roundingMode: "ceiling",
    orderIncrement: "1",
    effectiveFrom: "2026-01-01T00:00:00.000Z",
    effectiveTo: null,
    verificationStatus: "verified",
    sourceType: "manufacturer",
    sourceReference: "manufacturer-pack-spec",
  };
  const result = compare([
    candidate({
      sellUnitId: "PACK",
      minimumOrderQuantity: "1",
      price: { amount: "42", priceUnitId: "PACK" },
      requestedToSellConversionPath: [conversion],
    }),
  ], { requestedQuantity: "15" });
  const item = result.comparisons[0];
  assert.equal(item.preRoundPurchaseQuantity, "2.00000000");
  assert.equal(item.purchaseQuantity, "2.00000000");
  assert.equal(item.pricePurchaseQuantity, "2.00000000");
  assert.equal(item.coveredRequestedQuantity, "20.00000000");
  assert.equal(item.leftoverQuantity, "5.00000000");
  assert.equal(item.merchandiseCost, "84.0000");
  assert.deepEqual(item.conversionPath, [conversion]);
});

test("rounds in the sell unit before converting to the price unit and applying tiers", () => {
  const requestedToSell = {
    id: "conversion-each-box",
    productId: "product-a",
    fromUnitId: "EA",
    toUnitId: "BOX",
    fromQuantity: "10",
    toQuantity: "1",
    roundingMode: "exact",
    orderIncrement: null,
    effectiveFrom: "2026-01-01T00:00:00.000Z",
    effectiveTo: null,
    verificationStatus: "verified",
    sourceType: "manufacturer",
    sourceReference: "box-specification",
  };
  const sellToPrice = {
    id: "conversion-box-linear-foot",
    productId: "product-a",
    fromUnitId: "BOX",
    toUnitId: "LF",
    fromQuantity: "1",
    toQuantity: "12",
    roundingMode: "exact",
    orderIncrement: null,
    effectiveFrom: "2026-01-01T00:00:00.000Z",
    effectiveTo: null,
    verificationStatus: "verified",
    sourceType: "manufacturer",
    sourceReference: "box-coverage",
  };
  const result = compare([
    candidate({
      sellUnitId: "BOX",
      minimumOrderQuantity: "3",
      orderIncrement: "2",
      price: {
        amount: "15",
        priceQuantity: "10",
        priceUnitId: "LF",
        tierMinQuantity: "48",
        tierMaxQuantity: "48",
      },
      requestedToSellConversionPath: [requestedToSell],
      sellToPriceConversionPath: [sellToPrice],
    }),
  ], { requestedQuantity: "25" });

  const item = result.comparisons[0];
  assert.equal(item.preRoundPurchaseQuantity, "2.50000000");
  assert.equal(item.purchaseQuantity, "4.00000000");
  assert.equal(item.purchaseUnitId, "BOX");
  assert.equal(item.pricePurchaseQuantity, "48.00000000");
  assert.equal(item.priceUnitId, "LF");
  assert.equal(item.merchandiseCost, "72.0000");
  assert.equal(item.coveredRequestedQuantity, "40.00000000");
  assert.equal(item.leftoverQuantity, "15.00000000");
  assert.deepEqual(item.requestedToSellConversionPath, [requestedToSell]);
  assert.deepEqual(item.sellToPriceConversionPath, [sellToPrice]);
  assert.deepEqual(item.conversionPath, [requestedToSell, sellToPrice]);
});

test("fails closed when the required sell-to-price conversion is missing", () => {
  const result = compare([
    candidate({
      sellUnitId: "BOX",
      price: { priceUnitId: "LF" },
      requestedToSellConversionPath: [{
        id: "conversion-each-box",
        productId: "product-a",
        fromUnitId: "EA",
        toUnitId: "BOX",
        fromQuantity: "10",
        toQuantity: "1",
        roundingMode: "ceiling",
        orderIncrement: "1",
        effectiveFrom: "2026-01-01T00:00:00.000Z",
        effectiveTo: null,
        verificationStatus: "verified",
        sourceType: "manufacturer",
        sourceReference: "box-specification",
      }],
    }),
  ]);

  assert.deepEqual(result.comparisons, []);
  assert.deepEqual(result.exclusions, [
    { candidateId: "candidate-a", reason: "invalid_conversion_path" },
  ]);
});

test("fails closed for unverified and ineffective sell-to-price conversions", () => {
  const sellToPrice = {
    id: "conversion-each-linear-foot",
    productId: "product-a",
    fromUnitId: "EA",
    toUnitId: "LF",
    fromQuantity: "1",
    toQuantity: "8",
    roundingMode: "exact",
    orderIncrement: null,
    effectiveFrom: "2026-01-01T00:00:00.000Z",
    effectiveTo: null,
    verificationStatus: "verified",
    sourceType: "manufacturer",
    sourceReference: "product-length",
  };
  const result = compare([
    candidate({
      candidateId: "unverified-second-stage",
      price: { priceUnitId: "LF" },
      sellToPriceConversionPath: [{
        ...sellToPrice,
        id: "unverified-conversion",
        verificationStatus: "unverified",
      }],
    }),
    candidate({
      candidateId: "ineffective-second-stage",
      price: { priceUnitId: "LF" },
      sellToPriceConversionPath: [{
        ...sellToPrice,
        id: "expired-conversion",
        effectiveTo: "2026-08-10T00:00:00.000Z",
      }],
    }),
  ]);

  assert.deepEqual(result.exclusions, [
    { candidateId: "ineffective-second-stage", reason: "conversion_not_effective" },
    { candidateId: "unverified-second-stage", reason: "conversion_not_verified" },
  ]);
});

test("requires a continuous exact non-rounding sell-to-price path", () => {
  const sellToPrice = {
    id: "conversion-each-linear-foot",
    productId: "product-a",
    fromUnitId: "EA",
    toUnitId: "LF",
    fromQuantity: "1",
    toQuantity: "8",
    roundingMode: "exact",
    orderIncrement: null,
    effectiveFrom: "2026-01-01T00:00:00.000Z",
    effectiveTo: null,
    verificationStatus: "verified",
    sourceType: "manufacturer",
    sourceReference: "product-length",
  };
  const result = compare([
    candidate({
      candidateId: "non-exact-second-stage",
      price: { priceUnitId: "LF" },
      sellToPriceConversionPath: [{
        ...sellToPrice,
        id: "rounded-pricing-basis",
        roundingMode: "ceiling",
      }],
    }),
    candidate({
      candidateId: "incremented-second-stage",
      price: { priceUnitId: "LF" },
      sellToPriceConversionPath: [{
        ...sellToPrice,
        id: "incremented-pricing-basis",
        orderIncrement: "1",
      }],
    }),
    candidate({
      candidateId: "discontinuous-second-stage",
      price: { priceUnitId: "LF" },
      sellToPriceConversionPath: [{
        ...sellToPrice,
        id: "discontinuous-pricing-basis",
        fromUnitId: "PACK",
      }],
    }),
  ]);

  assert.deepEqual(result.comparisons, []);
  assert.deepEqual(result.exclusions, [
    { candidateId: "discontinuous-second-stage", reason: "invalid_conversion_path" },
    { candidateId: "incremented-second-stage", reason: "exact_quantity_unavailable" },
    { candidateId: "non-exact-second-stage", reason: "exact_quantity_unavailable" },
  ]);
});

test("applies minimum orders, order increments, and price quantity exactly", () => {
  const result = compare([
    candidate({
      minimumOrderQuantity: "5",
      orderIncrement: "3",
      price: { amount: "17.50", priceQuantity: "2" },
    }),
  ]);
  assert.equal(result.comparisons[0].purchaseQuantity, "6.00000000");
  assert.equal(result.comparisons[0].merchandiseCost, "52.5000");
  assert.equal(result.comparisons[0].leftoverQuantity, "4.00000000");
});

test("keeps unknown delivery unknown and labels landed-cost candidates unrankable", () => {
  const result = compare([
    candidate({ observation: { deliveryCost: null, deliveryCurrencyCode: null } }),
  ]);
  assert.equal(result.comparisons[0].deliveryCost, null);
  assert.equal(result.comparisons[0].landedCost, null);
  assert.equal(result.comparisons[0].effectiveLandedCostPerRequestedUnit, null);
  assert.equal(result.comparisons[0].rankable, false);
  assert.equal(result.comparisons[0].rank, null);
});

test("does not invent tax when producing landed cost", () => {
  const result = compare([
    candidate({ price: { taxIncluded: null } }),
  ]);
  assert.equal(result.comparisons[0].merchandiseCost, "20.0000");
  assert.equal(result.comparisons[0].deliveryCost, "5.0000");
  assert.equal(result.comparisons[0].landedCost, null);
  assert.equal(result.comparisons[0].rankable, false);
});

test("can explicitly rank by merchandise while preserving incomplete landed cost", () => {
  const expensive = candidate({
    candidateId: "expensive",
    supplierId: "supplier-z",
    offerId: "offer-z",
    observation: { id: "observation-z", deliveryCost: null, deliveryCurrencyCode: null },
    price: { id: "price-z", amount: "12" },
  });
  const cheap = candidate({
    candidateId: "cheap",
    supplierId: "supplier-y",
    offerId: "offer-y",
    observation: { id: "observation-y", deliveryCost: null, deliveryCurrencyCode: null },
    price: { id: "price-y", amount: "10" },
  });
  const result = compare([expensive, cheap], { rankingBasis: "merchandise_cost" });
  assert.deepEqual(result.comparisons.map(({ candidateId, rank }) => ({ candidateId, rank })), [
    { candidateId: "cheap", rank: 1 },
    { candidateId: "expensive", rank: 2 },
  ]);
});

test("fails closed across company and product boundaries", () => {
  const result = compare([
    candidate({ candidateId: "wrong-company", companyId: "company-b" }),
    candidate({
      candidateId: "wrong-observation-company",
      observation: { companyId: "company-b" },
    }),
    candidate({ candidateId: "wrong-product", productId: "product-b" }),
  ]);
  assert.deepEqual(result.exclusions, [
    { candidateId: "wrong-company", reason: "tenant_scope_mismatch" },
    { candidateId: "wrong-observation-company", reason: "tenant_scope_mismatch" },
    { candidateId: "wrong-product", reason: "product_scope_mismatch" },
  ]);
});

test("excludes unverified mappings and unsafe conversion paths", () => {
  const conversion = {
    id: "conversion-a",
    productId: "product-a",
    fromUnitId: "EA",
    toUnitId: "PACK",
    fromQuantity: "10",
    toQuantity: "1",
    roundingMode: "ceiling",
    orderIncrement: "1",
    effectiveFrom: "2026-01-01T00:00:00.000Z",
    effectiveTo: null,
    verificationStatus: "unverified",
    sourceType: "manual",
    sourceReference: null,
  };
  const result = compare([
    candidate({ candidateId: "unverified-offer", mappingStatus: "unverified" }),
    candidate({
      candidateId: "unverified-conversion",
      sellUnitId: "PACK",
      requestedToSellConversionPath: [conversion],
    }),
    candidate({
      candidateId: "missing-conversion",
      sellUnitId: "PACK",
    }),
  ]);
  assert.deepEqual(result.exclusions, [
    { candidateId: "missing-conversion", reason: "invalid_conversion_path" },
    { candidateId: "unverified-conversion", reason: "conversion_not_verified" },
    { candidateId: "unverified-offer", reason: "mapping_not_verified" },
  ]);
});

test("enforces observation time, correction, currency, tier, and inventory evidence", () => {
  const result = compare([
    candidate({ candidateId: "stale", observation: { observedAt: "2026-01-01T00:00:00.000Z" } }),
    candidate({ candidateId: "future", observation: { observedAt: "2026-08-12T00:00:00.000Z" } }),
    candidate({ candidateId: "expired", observation: { expiresAt: "2026-08-10T00:00:00.000Z" } }),
    candidate({ candidateId: "corrected", observation: { correctedByObservationId: "new-observation" } }),
    candidate({ candidateId: "currency", price: { currencyCode: "CAD" } }),
    candidate({ candidateId: "tier", price: { tierMinQuantity: "3" } }),
    candidate({
      candidateId: "inventory",
      observation: { inventoryQuantity: "1", inventoryUnitId: "EA" },
    }),
  ]);
  assert.deepEqual(result.exclusions, [
    { candidateId: "corrected", reason: "observation_corrected" },
    { candidateId: "currency", reason: "currency_mismatch" },
    { candidateId: "expired", reason: "observation_expired" },
    { candidateId: "future", reason: "observation_from_future" },
    { candidateId: "inventory", reason: "insufficient_inventory" },
    { candidateId: "stale", reason: "observation_stale" },
    { candidateId: "tier", reason: "price_tier_not_applicable" },
  ]);
});

test("uses stable provenance keys to break exact cost ties", () => {
  const second = candidate({
    candidateId: "second",
    supplierId: "supplier-b",
    offerId: "offer-b",
    observation: { id: "observation-b" },
    price: { id: "price-b" },
  });
  const first = candidate({
    candidateId: "first",
    supplierId: "supplier-a",
    offerId: "offer-a",
    observation: { id: "observation-a" },
    price: { id: "price-a" },
  });
  const result = compare([second, first]);
  assert.deepEqual(result.comparisons.map(({ candidateId, rank }) => ({ candidateId, rank })), [
    { candidateId: "first", rank: 1 },
    { candidateId: "second", rank: 2 },
  ]);
});

test("uses Unicode code-point order for non-ASCII tie keys", () => {
  const supplementaryPlane = candidate({
    candidateId: "supplementary-plane",
    supplierSku: "😀",
    observation: { id: "observation-supplementary" },
    price: { id: "price-supplementary" },
  });
  const privateUse = candidate({
    candidateId: "private-use",
    supplierSku: "\uE000",
    observation: { id: "observation-private" },
    price: { id: "price-private" },
  });
  const result = compare([supplementaryPlane, privateUse]);

  assert.deepEqual(result.comparisons.map(({ candidateId }) => candidateId), [
    "private-use",
    "supplementary-plane",
  ]);
});

test("rejects invalid request decimals instead of using floating point coercion", () => {
  assert.throws(() => compare([], { requestedQuantity: "1e3" }), /decimal string/);
  assert.throws(() => compare([], { requestedQuantity: "0" }), /must be positive/);
  assert.throws(() => compare([], { maximumObservationAgeDays: 1.5 }), /nonnegative integer/);
  assert.throws(() => compare([], { currencyCode: "usd" }), /uppercase ISO currency/);
});
