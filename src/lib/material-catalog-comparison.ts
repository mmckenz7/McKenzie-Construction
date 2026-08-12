export const MATERIAL_CATALOG_COMPARISON_POLICY_VERSION =
  "material-catalog-comparison-v0" as const;

const MAX_DECIMAL_LENGTH = 48;
const QUANTITY_SCALE = 8;
const MONEY_SCALE = 4;

type Rational = Readonly<{
  numerator: bigint;
  denominator: bigint;
}>;

export type MaterialConversionEvidence = Readonly<{
  id: string;
  productId: string;
  fromUnitId: string;
  toUnitId: string;
  fromQuantity: string;
  toQuantity: string;
  roundingMode: "ceiling" | "nearest" | "exact";
  orderIncrement: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  verificationStatus: "unverified" | "verified" | "disputed" | "retired";
  sourceType: "manufacturer" | "supplier" | "manual" | "legacy";
  sourceReference: string | null;
}>;

export type SupplierComparisonCandidate = Readonly<{
  candidateId: string;
  companyId: string;
  productId: string;
  supplierId: string;
  supplierLocationId: string | null;
  companySupplierAccountId: string | null;
  offerId: string;
  supplierSku: string;
  mappingStatus: "unverified" | "verified" | "disputed" | "replaced" | "inactive";
  offerEffectiveFrom: string;
  offerEffectiveTo: string | null;
  sellUnitId: string;
  minimumOrderQuantity: string | null;
  orderIncrement: string | null;
  observation: Readonly<{
    id: string;
    companyId: string;
    observedAt: string;
    effectiveFrom: string;
    effectiveTo: string | null;
    expiresAt: string | null;
    availabilityStatus:
      | "in_stock"
      | "limited"
      | "backorder"
      | "special_order"
      | "discontinued"
      | "unknown";
    inventoryQuantity: string | null;
    inventoryUnitId: string | null;
    leadTimeMin: string | null;
    leadTimeMax: string | null;
    leadTimeUnit: "business_day" | "calendar_day" | "week" | null;
    promisedAvailableDate: string | null;
    deliveryCost: string | null;
    deliveryCurrencyCode: string | null;
    sourceType:
      | "manual"
      | "csv"
      | "spreadsheet"
      | "supplier_quote"
      | "api"
      | "web_lookup"
      | "legacy";
    sourceReference: string | null;
    rawRecordSha256: string | null;
    confidence: "verified" | "confirmed" | "probable" | "unverified";
    correctedByObservationId: string | null;
  }>;
  price: Readonly<{
    id: string;
    priceType:
      | "list"
      | "retail"
      | "contractor"
      | "negotiated"
      | "quoted"
      | "promotional"
      | "net_cost"
      | "other";
    amount: string;
    currencyCode: string;
    priceQuantity: string;
    priceUnitId: string;
    tierMinQuantity: string | null;
    tierMaxQuantity: string | null;
    taxIncluded: boolean | null;
  }>;
  requestedToSellConversionPath: readonly MaterialConversionEvidence[];
  sellToPriceConversionPath: readonly MaterialConversionEvidence[];
}>;

export type SupplierComparisonRequest = Readonly<{
  companyId: string;
  productId: string;
  requestedQuantity: string;
  requestedUnitId: string;
  pricedForAt: string;
  maximumObservationAgeDays: number;
  currencyCode: string;
  rankingBasis: "merchandise_cost" | "landed_cost";
  candidates: readonly SupplierComparisonCandidate[];
}>;

export type SupplierComparisonExclusionReason =
  | "tenant_scope_mismatch"
  | "product_scope_mismatch"
  | "mapping_not_verified"
  | "offer_not_effective"
  | "observation_not_effective"
  | "observation_expired"
  | "observation_from_future"
  | "observation_stale"
  | "observation_corrected"
  | "product_discontinued"
  | "currency_mismatch"
  | "invalid_conversion_path"
  | "conversion_not_verified"
  | "conversion_not_effective"
  | "exact_quantity_unavailable"
  | "price_tier_not_applicable"
  | "insufficient_inventory"
  | "invalid_candidate";

export type SupplierComparisonResult = Readonly<{
  policyVersion: typeof MATERIAL_CATALOG_COMPARISON_POLICY_VERSION;
  pricedForAt: string;
  requestedQuantity: string;
  requestedUnitId: string;
  currencyCode: string;
  rankingBasis: "merchandise_cost" | "landed_cost";
  comparisons: readonly Readonly<{
    rank: number | null;
    rankable: boolean;
    candidateId: string;
    offerId: string;
    observationId: string;
    observationPriceId: string;
    supplierId: string;
    supplierLocationId: string | null;
    companySupplierAccountId: string | null;
    supplierSku: string;
    priceType: SupplierComparisonCandidate["price"]["priceType"];
    confidence: SupplierComparisonCandidate["observation"]["confidence"];
    availabilityStatus: SupplierComparisonCandidate["observation"]["availabilityStatus"];
    inventoryQuantity: string | null;
    inventoryUnitId: string | null;
    requestedQuantity: string;
    requestedUnitId: string;
    preRoundPurchaseQuantity: string;
    purchaseQuantity: string;
    purchaseUnitId: string;
    pricePurchaseQuantity: string;
    priceUnitId: string;
    coveredRequestedQuantity: string;
    leftoverQuantity: string;
    merchandiseCost: string;
    deliveryCost: string | null;
    landedCost: string | null;
    effectiveMerchandiseCostPerRequestedUnit: string;
    effectiveLandedCostPerRequestedUnit: string | null;
    taxIncluded: boolean | null;
    observationAgeDays: string;
    observedAt: string;
    effectiveFrom: string;
    effectiveTo: string | null;
    expiresAt: string | null;
    leadTimeMin: string | null;
    leadTimeMax: string | null;
    leadTimeUnit: SupplierComparisonCandidate["observation"]["leadTimeUnit"];
    promisedAvailableDate: string | null;
    sourceType: SupplierComparisonCandidate["observation"]["sourceType"];
    sourceReference: string | null;
    rawRecordSha256: string | null;
    requestedToSellConversionPath: readonly MaterialConversionEvidence[];
    sellToPriceConversionPath: readonly MaterialConversionEvidence[];
    conversionPath: readonly MaterialConversionEvidence[];
  }>[];
  exclusions: readonly Readonly<{
    candidateId: string;
    reason: SupplierComparisonExclusionReason;
  }>[];
}>;

function gcd(first: bigint, second: bigint) {
  let left = first < 0n ? -first : first;
  let right = second < 0n ? -second : second;
  while (right !== 0n) {
    [left, right] = [right, left % right];
  }
  return left;
}

function rational(numerator: bigint, denominator = 1n): Rational {
  if (denominator <= 0n) throw new RangeError("A rational denominator must be positive.");
  const divisor = gcd(numerator, denominator);
  return Object.freeze({ numerator: numerator / divisor, denominator: denominator / divisor });
}

function parseDecimal(value: string, label: string): Rational {
  if (typeof value !== "string" || value.length > MAX_DECIMAL_LENGTH) {
    throw new RangeError(`${label} exceeds the supported input length.`);
  }
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) {
    throw new TypeError(`${label} must be a nonnegative decimal string.`);
  }
  const [whole, fraction = ""] = value.split(".");
  if (fraction.length > QUANTITY_SCALE) {
    throw new RangeError(`${label} supports at most ${QUANTITY_SCALE} decimal places.`);
  }
  const denominator = 10n ** BigInt(fraction.length);
  return rational(BigInt(whole) * denominator + BigInt(fraction || "0"), denominator);
}

function add(left: Rational, right: Rational) {
  return rational(
    left.numerator * right.denominator + right.numerator * left.denominator,
    left.denominator * right.denominator,
  );
}

function subtract(left: Rational, right: Rational) {
  return rational(
    left.numerator * right.denominator - right.numerator * left.denominator,
    left.denominator * right.denominator,
  );
}

function multiply(left: Rational, right: Rational) {
  return rational(left.numerator * right.numerator, left.denominator * right.denominator);
}

function divide(left: Rational, right: Rational) {
  if (right.numerator <= 0n) throw new RangeError("A divisor must be positive.");
  return rational(left.numerator * right.denominator, left.denominator * right.numerator);
}

function compare(left: Rational, right: Rational) {
  const difference = left.numerator * right.denominator - right.numerator * left.denominator;
  return difference < 0n ? -1 : difference > 0n ? 1 : 0;
}

function maximum(left: Rational, right: Rational) {
  return compare(left, right) >= 0 ? left : right;
}

function roundToIncrement(
  value: Rational,
  increment: Rational,
  mode: MaterialConversionEvidence["roundingMode"],
) {
  if (increment.numerator <= 0n) throw new RangeError("An increment must be positive.");
  const scaledNumerator = value.numerator * increment.denominator;
  const scaledDenominator = value.denominator * increment.numerator;
  const quotient = scaledNumerator / scaledDenominator;
  const remainder = scaledNumerator % scaledDenominator;
  if (mode === "exact" && remainder !== 0n) return null;
  const units = mode === "ceiling"
    ? quotient + (remainder === 0n ? 0n : 1n)
    : mode === "nearest" && remainder * 2n >= scaledDenominator
      ? quotient + 1n
      : quotient;
  return multiply(rational(units), increment);
}

function formatDecimal(value: Rational, scale: number) {
  const factor = 10n ** BigInt(scale);
  const scaledNumerator = value.numerator * factor;
  let units = scaledNumerator / value.denominator;
  const remainder = scaledNumerator % value.denominator;
  if (remainder * 2n >= value.denominator) units += 1n;
  const negative = units < 0n;
  const magnitude = negative ? -units : units;
  const whole = magnitude / factor;
  const fraction = (magnitude % factor).toString().padStart(scale, "0");
  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

function parseInstant(value: string, label: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    throw new TypeError(`${label} must be an ISO timestamp.`);
  }
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) throw new TypeError(`${label} must be an ISO timestamp.`);
  return milliseconds;
}

function isEffective(at: number, from: string, to: string | null) {
  return at >= parseInstant(from, "effectiveFrom") &&
    (to === null || at <= parseInstant(to, "effectiveTo"));
}

function convertQuantityAlongPath(
  quantity: Rational,
  productId: string,
  fromUnitId: string,
  toUnitId: string,
  path: readonly MaterialConversionEvidence[],
  pricedForMilliseconds: number,
  stage: "purchasing" | "pricing_basis",
):
  | Readonly<{ quantity: Rational }>
  | Readonly<{
      reason:
        | "invalid_conversion_path"
        | "conversion_not_verified"
        | "conversion_not_effective"
        | "exact_quantity_unavailable";
    }> {
  if (path.length === 0) {
    if (fromUnitId !== toUnitId) {
      return { reason: "invalid_conversion_path" as const };
    }
    return { quantity };
  }

  let currentUnitId = fromUnitId;
  let convertedQuantity = quantity;
  for (const conversion of path) {
    if (
      conversion.productId !== productId ||
      conversion.fromUnitId !== currentUnitId
    ) {
      return { reason: "invalid_conversion_path" as const };
    }
    if (conversion.verificationStatus !== "verified") {
      return { reason: "conversion_not_verified" as const };
    }
    if (!isEffective(pricedForMilliseconds, conversion.effectiveFrom, conversion.effectiveTo)) {
      return { reason: "conversion_not_effective" as const };
    }
    if (
      stage === "pricing_basis" &&
      (conversion.roundingMode !== "exact" || conversion.orderIncrement !== null)
    ) {
      return { reason: "exact_quantity_unavailable" as const };
    }
    convertedQuantity = multiply(
      convertedQuantity,
      divide(
        parseDecimal(conversion.toQuantity, "conversion.toQuantity"),
        parseDecimal(conversion.fromQuantity, "conversion.fromQuantity"),
      ),
    );
    if (conversion.orderIncrement !== null) {
      const rounded = roundToIncrement(
        convertedQuantity,
        parseDecimal(conversion.orderIncrement, "conversion.orderIncrement"),
        conversion.roundingMode,
      );
      if (rounded === null) return { reason: "exact_quantity_unavailable" as const };
      convertedQuantity = rounded;
    }
    currentUnitId = conversion.toUnitId;
  }
  if (currentUnitId !== toUnitId) {
    return { reason: "invalid_conversion_path" as const };
  }
  return { quantity: convertedQuantity };
}

function reverseConvertQuantity(
  quantity: Rational,
  path: readonly MaterialConversionEvidence[],
) {
  return [...path].reverse().reduce(
    (current, conversion) => multiply(
      current,
      divide(
        parseDecimal(conversion.fromQuantity, "conversion.fromQuantity"),
        parseDecimal(conversion.toQuantity, "conversion.toQuantity"),
      ),
    ),
    quantity,
  );
}

function exclude(
  candidate: SupplierComparisonCandidate,
  reason: SupplierComparisonExclusionReason,
) {
  return { candidateId: candidate.candidateId, reason } as const;
}

function compareCodePoints(left: string, right: string) {
  const leftCodePoints = Array.from(left, (character) => character.codePointAt(0)!);
  const rightCodePoints = Array.from(right, (character) => character.codePointAt(0)!);
  const sharedLength = Math.min(leftCodePoints.length, rightCodePoints.length);
  for (let index = 0; index < sharedLength; index += 1) {
    if (leftCodePoints[index] !== rightCodePoints[index]) {
      return leftCodePoints[index] < rightCodePoints[index] ? -1 : 1;
    }
  }
  return leftCodePoints.length < rightCodePoints.length
    ? -1
    : leftCodePoints.length > rightCodePoints.length
      ? 1
      : 0;
}

export function compareSupplierOffers(
  request: SupplierComparisonRequest,
): SupplierComparisonResult {
  if (!request.companyId.trim() || !request.productId.trim() || !request.requestedUnitId.trim()) {
    throw new TypeError("Company, product, and requested unit are required.");
  }
  const requestedQuantity = parseDecimal(request.requestedQuantity, "requestedQuantity");
  if (requestedQuantity.numerator <= 0n) throw new RangeError("requestedQuantity must be positive.");
  if (!Number.isInteger(request.maximumObservationAgeDays) || request.maximumObservationAgeDays < 0) {
    throw new RangeError("maximumObservationAgeDays must be a nonnegative integer.");
  }
  if (!/^[A-Z]{3}$/.test(request.currencyCode)) {
    throw new TypeError("currencyCode must be an uppercase ISO currency code.");
  }

  const pricedForMilliseconds = parseInstant(request.pricedForAt, "pricedForAt");
  const maximumAgeMilliseconds = request.maximumObservationAgeDays * 86_400_000;
  const comparisons: Array<SupplierComparisonResult["comparisons"][number] & { rankValue: Rational }> = [];
  const exclusions: Array<SupplierComparisonResult["exclusions"][number]> = [];

  for (const candidate of request.candidates) {
    try {
      if (candidate.companyId !== request.companyId || candidate.observation.companyId !== request.companyId) {
        exclusions.push(exclude(candidate, "tenant_scope_mismatch"));
        continue;
      }
      if (candidate.productId !== request.productId) {
        exclusions.push(exclude(candidate, "product_scope_mismatch"));
        continue;
      }
      if (candidate.mappingStatus !== "verified") {
        exclusions.push(exclude(candidate, "mapping_not_verified"));
        continue;
      }
      if (!isEffective(pricedForMilliseconds, candidate.offerEffectiveFrom, candidate.offerEffectiveTo)) {
        exclusions.push(exclude(candidate, "offer_not_effective"));
        continue;
      }
      if (!isEffective(pricedForMilliseconds, candidate.observation.effectiveFrom, candidate.observation.effectiveTo)) {
        exclusions.push(exclude(candidate, "observation_not_effective"));
        continue;
      }
      if (candidate.observation.expiresAt !== null && pricedForMilliseconds > parseInstant(candidate.observation.expiresAt, "expiresAt")) {
        exclusions.push(exclude(candidate, "observation_expired"));
        continue;
      }
      const observedMilliseconds = parseInstant(candidate.observation.observedAt, "observedAt");
      if (observedMilliseconds > pricedForMilliseconds) {
        exclusions.push(exclude(candidate, "observation_from_future"));
        continue;
      }
      const observationAgeMilliseconds = pricedForMilliseconds - observedMilliseconds;
      if (observationAgeMilliseconds > maximumAgeMilliseconds) {
        exclusions.push(exclude(candidate, "observation_stale"));
        continue;
      }
      if (candidate.observation.correctedByObservationId !== null) {
        exclusions.push(exclude(candidate, "observation_corrected"));
        continue;
      }
      if (candidate.observation.availabilityStatus === "discontinued") {
        exclusions.push(exclude(candidate, "product_discontinued"));
        continue;
      }
      if (candidate.price.currencyCode !== request.currencyCode) {
        exclusions.push(exclude(candidate, "currency_mismatch"));
        continue;
      }

      const requestedToSell = convertQuantityAlongPath(
        requestedQuantity,
        request.productId,
        request.requestedUnitId,
        candidate.sellUnitId,
        candidate.requestedToSellConversionPath,
        pricedForMilliseconds,
        "purchasing",
      );
      if ("reason" in requestedToSell) {
        exclusions.push(exclude(candidate, requestedToSell.reason));
        continue;
      }
      const preRoundPurchaseQuantity = requestedToSell.quantity;
      let purchaseQuantity = candidate.minimumOrderQuantity === null
        ? preRoundPurchaseQuantity
        : maximum(
            preRoundPurchaseQuantity,
            parseDecimal(candidate.minimumOrderQuantity, "minimumOrderQuantity"),
          );
      if (candidate.orderIncrement !== null) {
        purchaseQuantity = roundToIncrement(
          purchaseQuantity,
          parseDecimal(candidate.orderIncrement, "orderIncrement"),
          "ceiling",
        )!;
      }

      const sellToPrice = convertQuantityAlongPath(
        purchaseQuantity,
        request.productId,
        candidate.sellUnitId,
        candidate.price.priceUnitId,
        candidate.sellToPriceConversionPath,
        pricedForMilliseconds,
        "pricing_basis",
      );
      if ("reason" in sellToPrice) {
        exclusions.push(exclude(candidate, sellToPrice.reason));
        continue;
      }
      const pricePurchaseQuantity = sellToPrice.quantity;

      // Tier bounds belong to the observation price row and are therefore
      // interpreted in priceUnitId, after sell-unit purchasing rules run.
      const tierMinimum = candidate.price.tierMinQuantity === null
        ? null
        : parseDecimal(candidate.price.tierMinQuantity, "tierMinQuantity");
      const tierMaximum = candidate.price.tierMaxQuantity === null
        ? null
        : parseDecimal(candidate.price.tierMaxQuantity, "tierMaxQuantity");
      if (
        (tierMinimum !== null && compare(pricePurchaseQuantity, tierMinimum) < 0) ||
        (tierMaximum !== null && compare(pricePurchaseQuantity, tierMaximum) > 0)
      ) {
        exclusions.push(exclude(candidate, "price_tier_not_applicable"));
        continue;
      }

      if (
        candidate.observation.inventoryQuantity !== null &&
        (
          candidate.observation.inventoryUnitId === candidate.sellUnitId ||
          candidate.observation.inventoryUnitId === candidate.price.priceUnitId
        ) &&
        compare(
          parseDecimal(candidate.observation.inventoryQuantity, "inventoryQuantity"),
          candidate.observation.inventoryUnitId === candidate.sellUnitId
            ? purchaseQuantity
            : pricePurchaseQuantity,
        ) < 0
      ) {
        exclusions.push(exclude(candidate, "insufficient_inventory"));
        continue;
      }

      const merchandiseCost = multiply(
        divide(pricePurchaseQuantity, parseDecimal(candidate.price.priceQuantity, "priceQuantity")),
        parseDecimal(candidate.price.amount, "price.amount"),
      );
      const deliveryCost = candidate.observation.deliveryCost === null
        ? null
        : candidate.observation.deliveryCurrencyCode === request.currencyCode
          ? parseDecimal(candidate.observation.deliveryCost, "deliveryCost")
          : null;
      const landedCost = deliveryCost === null || candidate.price.taxIncluded !== true
        ? null
        : add(merchandiseCost, deliveryCost);
      const coveredRequestedQuantity = reverseConvertQuantity(
        purchaseQuantity,
        candidate.requestedToSellConversionPath,
      );
      const leftoverQuantity = maximum(
        subtract(coveredRequestedQuantity, requestedQuantity),
        rational(0n),
      );
      const merchandisePerRequestedUnit = divide(merchandiseCost, requestedQuantity);
      const landedPerRequestedUnit = landedCost === null
        ? null
        : divide(landedCost, requestedQuantity);
      const rankable = request.rankingBasis === "merchandise_cost" || landedCost !== null;
      const rankValue = request.rankingBasis === "landed_cost" && landedCost !== null
        ? landedCost
        : merchandiseCost;

      comparisons.push({
        rank: null,
        rankable,
        candidateId: candidate.candidateId,
        offerId: candidate.offerId,
        observationId: candidate.observation.id,
        observationPriceId: candidate.price.id,
        supplierId: candidate.supplierId,
        supplierLocationId: candidate.supplierLocationId,
        companySupplierAccountId: candidate.companySupplierAccountId,
        supplierSku: candidate.supplierSku,
        priceType: candidate.price.priceType,
        confidence: candidate.observation.confidence,
        availabilityStatus: candidate.observation.availabilityStatus,
        inventoryQuantity: candidate.observation.inventoryQuantity,
        inventoryUnitId: candidate.observation.inventoryUnitId,
        requestedQuantity: formatDecimal(requestedQuantity, QUANTITY_SCALE),
        requestedUnitId: request.requestedUnitId,
        preRoundPurchaseQuantity: formatDecimal(preRoundPurchaseQuantity, QUANTITY_SCALE),
        purchaseQuantity: formatDecimal(purchaseQuantity, QUANTITY_SCALE),
        purchaseUnitId: candidate.sellUnitId,
        pricePurchaseQuantity: formatDecimal(pricePurchaseQuantity, QUANTITY_SCALE),
        priceUnitId: candidate.price.priceUnitId,
        coveredRequestedQuantity: formatDecimal(coveredRequestedQuantity, QUANTITY_SCALE),
        leftoverQuantity: formatDecimal(leftoverQuantity, QUANTITY_SCALE),
        merchandiseCost: formatDecimal(merchandiseCost, MONEY_SCALE),
        deliveryCost: deliveryCost === null ? null : formatDecimal(deliveryCost, MONEY_SCALE),
        landedCost: landedCost === null ? null : formatDecimal(landedCost, MONEY_SCALE),
        effectiveMerchandiseCostPerRequestedUnit: formatDecimal(merchandisePerRequestedUnit, MONEY_SCALE),
        effectiveLandedCostPerRequestedUnit: landedPerRequestedUnit === null
          ? null
          : formatDecimal(landedPerRequestedUnit, MONEY_SCALE),
        taxIncluded: candidate.price.taxIncluded,
        observationAgeDays: formatDecimal(
          rational(BigInt(observationAgeMilliseconds), 86_400_000n),
          QUANTITY_SCALE,
        ),
        observedAt: candidate.observation.observedAt,
        effectiveFrom: candidate.observation.effectiveFrom,
        effectiveTo: candidate.observation.effectiveTo,
        expiresAt: candidate.observation.expiresAt,
        leadTimeMin: candidate.observation.leadTimeMin,
        leadTimeMax: candidate.observation.leadTimeMax,
        leadTimeUnit: candidate.observation.leadTimeUnit,
        promisedAvailableDate: candidate.observation.promisedAvailableDate,
        sourceType: candidate.observation.sourceType,
        sourceReference: candidate.observation.sourceReference,
        rawRecordSha256: candidate.observation.rawRecordSha256,
        requestedToSellConversionPath: Object.freeze([
          ...candidate.requestedToSellConversionPath,
        ]),
        sellToPriceConversionPath: Object.freeze([
          ...candidate.sellToPriceConversionPath,
        ]),
        conversionPath: Object.freeze([
          ...candidate.requestedToSellConversionPath,
          ...candidate.sellToPriceConversionPath,
        ]),
        rankValue,
      });
    } catch {
      exclusions.push(exclude(candidate, "invalid_candidate"));
    }
  }

  comparisons.sort((left, right) => {
    if (left.rankable !== right.rankable) return left.rankable ? -1 : 1;
    if (left.rankable && right.rankable) {
      const costComparison = compare(left.rankValue, right.rankValue);
      if (costComparison !== 0) return costComparison;
    }
    return compareCodePoints(
      [left.supplierId, left.supplierLocationId ?? "", left.supplierSku, left.offerId, left.observationPriceId]
        .join("\u0000"),
      [right.supplierId, right.supplierLocationId ?? "", right.supplierSku, right.offerId, right.observationPriceId]
        .join("\u0000"),
    );
  });

  let rank = 0;
  const projectedComparisons = comparisons.map(({ rankValue: _rankValue, ...comparison }) => {
    void _rankValue;
    if (comparison.rankable) rank += 1;
    return Object.freeze({ ...comparison, rank: comparison.rankable ? rank : null });
  });

  exclusions.sort((left, right) => compareCodePoints(
    `${left.candidateId}\u0000${left.reason}`,
    `${right.candidateId}\u0000${right.reason}`,
  ));

  return Object.freeze({
    policyVersion: MATERIAL_CATALOG_COMPARISON_POLICY_VERSION,
    pricedForAt: request.pricedForAt,
    requestedQuantity: formatDecimal(requestedQuantity, QUANTITY_SCALE),
    requestedUnitId: request.requestedUnitId,
    currencyCode: request.currencyCode,
    rankingBasis: request.rankingBasis,
    comparisons: Object.freeze(projectedComparisons),
    exclusions: Object.freeze(exclusions.map((entry) => Object.freeze(entry))),
  });
}
