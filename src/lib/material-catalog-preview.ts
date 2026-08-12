import "server-only";

import { createAdminServerClient } from "@/lib/supabase/admin-server";
import {
  formatMaterialCatalogDate as formatDate,
  formatMaterialCatalogMoney as formatMoney,
} from "@/lib/material-catalog-preview-format";

const OBSERVATION_LIMIT = 160;
const RELATED_ROW_LIMIT = 500;
const SEARCH_LIMIT = 80;

const mappingStatuses = new Set([
  "verified",
  "unverified",
  "disputed",
  "replaced",
  "inactive",
]);

export type MaterialCatalogPreviewFilters = Readonly<{
  query: string;
  supplier: string;
  mappingStatus: string;
}>;

export type MaterialCatalogPreview = Readonly<{
  generatedAt: string;
  resultsLimited: boolean;
  filters: MaterialCatalogPreviewFilters;
  supplierOptions: readonly Readonly<{ value: string; label: string }>[];
  summary: Readonly<{
    products: number;
    offers: number;
    observations: number;
    offersMissingPrice: number;
  }>;
  products: readonly MaterialCatalogPreviewProduct[];
}>;

export type MaterialCatalogPreviewProduct = Readonly<{
  displayName: string;
  productCode: string | null;
  identityComplete: boolean;
  legacyDescription: string | null;
  legacySku: string | null;
  manufacturer: string | null;
  manufacturerPartNumber: string | null;
  category: string | null;
  stockingUnit: string | null;
  lifecycleStatus: string | null;
  offers: readonly MaterialCatalogPreviewOffer[];
}>;

export type MaterialCatalogPreviewOffer = Readonly<{
  supplierName: string;
  supplierSlug: string;
  location: string;
  supplierSku: string;
  mappingStatus: string;
  sellUnit: string;
  minimumOrderQuantity: string | null;
  orderIncrement: string | null;
  effectiveRange: string;
  observation: Readonly<{
    evidenceStatus: string;
    evidenceTone: "current" | "warning" | "inactive";
    observedLabel: string;
    effectiveRange: string;
    confidence: string;
    sourceType: string;
    availability: string;
    inventory: string;
    leadTime: string;
    promisedDate: string;
    delivery: string;
    prices: readonly Readonly<{
      price: string;
      priceType: string;
      tier: string;
      tax: string;
      comparisonExplanation: string;
    }>[];
  }>;
}>;

type DatabaseRow = Record<string, unknown>;

export class MaterialCatalogPreviewLoadError extends Error {
  constructor() {
    super("Catalog evidence could not be loaded. No fallback price was substituted.");
    this.name = "MaterialCatalogPreviewLoadError";
  }
}

function text(value: unknown) {
  return typeof value === "string" ? value : null;
}

function decimal(value: unknown) {
  return typeof value === "string" ? value : null;
}

function cleanSearch(value: unknown) {
  return typeof value === "string"
    ? value
        .slice(0, SEARCH_LIMIT)
        .replace(/[,%()]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
    : "";
}

export function parseMaterialCatalogPreviewFilters(
  values: Record<string, string | string[] | undefined>,
): MaterialCatalogPreviewFilters {
  const supplier = cleanSearch(values.supplier);
  const requestedStatus = cleanSearch(values.mappingStatus).toLowerCase();
  return Object.freeze({
    query: cleanSearch(values.q),
    supplier: /^[a-z0-9-]{1,80}$/.test(supplier) ? supplier : "",
    mappingStatus: mappingStatuses.has(requestedStatus) ? requestedStatus : "",
  });
}

function requireRows(result: { data: unknown; error: unknown }) {
  if (result.error || !Array.isArray(result.data)) {
    throw new MaterialCatalogPreviewLoadError();
  }
  return result.data as DatabaseRow[];
}

function requireBoundedRows(
  result: { data: unknown; error: unknown },
  limit: number,
) {
  const rows = requireRows(result);
  if (rows.length > limit) throw new MaterialCatalogPreviewLoadError();
  return rows;
}

function unique(values: Array<string | null>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function codePointCompare(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareFields(
  left: readonly string[],
  right: readonly string[],
) {
  for (let index = 0; index < left.length; index += 1) {
    const result = codePointCompare(left[index] ?? "", right[index] ?? "");
    if (result !== 0) return result;
  }
  return 0;
}

function mapById(rows: DatabaseRow[]) {
  return new Map(
    rows
      .map((row) => [text(row.id), row] as const)
      .filter((entry): entry is readonly [string, DatabaseRow] => entry[0] !== null),
  );
}

function formatRange(from: unknown, to: unknown) {
  return `${formatDate(from)} – ${text(to) ? formatDate(to) : "No end date"}`;
}

function formatLabel(value: unknown) {
  const raw = text(value);
  return raw ? raw.replaceAll("_", " ") : "Not provided";
}

function formatQuantity(value: unknown, unit: string | null) {
  const quantity = decimal(value);
  return quantity ? `${quantity} ${unit ?? "unit unknown"}` : "Not provided";
}

function observationStatus(observation: DatabaseRow, generatedAt: number) {
  const observedAt = Date.parse(text(observation.observed_at) ?? "");
  const effectiveFrom = Date.parse(text(observation.effective_from) ?? "");
  const effectiveTo = Date.parse(text(observation.effective_to) ?? "");
  const expiresAt = Date.parse(text(observation.expires_at) ?? "");
  if (Number.isFinite(observedAt) && observedAt > generatedAt) {
    return { label: "Observed in the future", tone: "warning" as const };
  }
  if (Number.isFinite(effectiveFrom) && generatedAt < effectiveFrom) {
    return { label: "Not effective yet", tone: "warning" as const };
  }
  if (Number.isFinite(expiresAt) && generatedAt > expiresAt) {
    return { label: "Expired evidence", tone: "inactive" as const };
  }
  if (Number.isFinite(effectiveTo) && generatedAt > effectiveTo) {
    return { label: "Effective period ended", tone: "inactive" as const };
  }
  if (observation.availability_status === "discontinued") {
    return { label: "Product discontinued", tone: "inactive" as const };
  }
  return { label: "Current published evidence", tone: "current" as const };
}

function observedLabel(value: unknown, generatedAt: number) {
  const raw = text(value);
  const milliseconds = Date.parse(raw ?? "");
  if (!raw || !Number.isFinite(milliseconds)) return "Observation date not provided";
  const days = Math.floor((generatedAt - milliseconds) / 86_400_000);
  if (days < 0) return `Observed ${formatDate(raw)} (future date)`;
  if (days === 0) return `Observed today (${formatDate(raw)})`;
  return `Observed ${days} day${days === 1 ? "" : "s"} ago (${formatDate(raw)})`;
}

type ConversionEdge = Readonly<{
  from: string;
  to: string;
  fromQuantity: string;
  toQuantity: string;
}>;

function findExactConversionPath(
  conversions: DatabaseRow[],
  fromUnitId: string,
  toUnitId: string,
  generatedAt: number,
) {
  const edges: ConversionEdge[] = conversions.flatMap((conversion) => {
    const from = text(conversion.from_unit_id);
    const to = text(conversion.to_unit_id);
    const fromQuantity = decimal(conversion.from_quantity_text);
    const toQuantity = decimal(conversion.to_quantity_text);
    const effectiveFrom = Date.parse(text(conversion.effective_from) ?? "");
    const effectiveTo = Date.parse(text(conversion.effective_to) ?? "");
    if (
      !from || !to || !fromQuantity || !toQuantity ||
      conversion.verification_status !== "verified" ||
      conversion.rounding_mode !== "exact" ||
      conversion.order_increment_text !== null ||
      !Number.isFinite(effectiveFrom) || generatedAt < effectiveFrom ||
      (Number.isFinite(effectiveTo) && generatedAt > effectiveTo)
    ) return [];
    return [{ from, to, fromQuantity, toQuantity }];
  });

  const queue: Array<{ unit: string; path: ConversionEdge[] }> = [
    { unit: fromUnitId, path: [] },
  ];
  const visited = new Set([fromUnitId]);
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.path.length >= 4) continue;
    for (const edge of edges.filter((item) => item.from === current.unit)) {
      const nextPath = [...current.path, edge];
      if (edge.to === toUnitId) return nextPath;
      if (!visited.has(edge.to)) {
        visited.add(edge.to);
        queue.push({ unit: edge.to, path: nextPath });
      }
    }
  }
  return null;
}

function comparisonExplanation(
  sellUnitId: string,
  priceUnitId: string,
  sellUnit: string,
  priceUnit: string,
  conversions: DatabaseRow[],
  unitById: Map<string, DatabaseRow>,
  generatedAt: number,
) {
  if (sellUnitId === priceUnitId) {
    return `Direct basis: this offer is sold and priced in ${sellUnit}. No unit translation is needed.`;
  }
  const path = findExactConversionPath(
    conversions,
    sellUnitId,
    priceUnitId,
    generatedAt,
  );
  if (!path) {
    return `Not safely comparable: the offer sells in ${sellUnit}, but the price is recorded in ${priceUnit}. A verified, effective, exact conversion is required.`;
  }
  const pathText = path
    .map((edge) => {
      const fromUnit = text(unitById.get(edge.from)?.code) ?? "unit unknown";
      const toUnit = text(unitById.get(edge.to)?.code) ?? "unit unknown";
      return `${edge.fromQuantity} ${fromUnit} = ${edge.toQuantity} ${toUnit}`;
    })
    .join("; ");
  return `Exact conversion evidence is available from ${sellUnit} to ${priceUnit}: ${pathText}. No supplier is ranked in this preview.`;
}

export async function loadMaterialCatalogPreview(
  companyId: string,
  filters: MaterialCatalogPreviewFilters,
): Promise<MaterialCatalogPreview> {
  const supabase = createAdminServerClient();
  const generatedAtIso = new Date().toISOString();
  const generatedAt = Date.parse(generatedAtIso);

  // Tenant evidence is always the first domain read. Global catalog rows are
  // reachable only through offer IDs found inside this authoritative scope.
  const observationRows = requireRows(await supabase
    .from("supplier_offer_observations")
    .select("id,supplier_product_offer_id,supplier_location_id,observed_at,effective_from,effective_to,expires_at,availability_status,inventory_quantity_text:inventory_quantity::text,inventory_unit_id,lead_time_min_text:lead_time_min::text,lead_time_max_text:lead_time_max::text,lead_time_unit,promised_available_date,delivery_cost_text:delivery_cost::text,delivery_currency_code,confidence,source_type,corrects_observation_id")
    .eq("company_id", companyId)
    .order("observed_at", { ascending: false })
    .order("id", { ascending: true })
    .limit(OBSERVATION_LIMIT + 1));
  const resultsLimited = observationRows.length > OBSERVATION_LIMIT;
  const observations = observationRows.slice(0, OBSERVATION_LIMIT);

  if (observations.length === 0) {
    return Object.freeze({
      generatedAt: generatedAtIso,
      resultsLimited: false,
      filters,
      supplierOptions: Object.freeze([]),
      summary: Object.freeze({ products: 0, offers: 0, observations: 0, offersMissingPrice: 0 }),
      products: Object.freeze([]),
    });
  }

  const observationIds = unique(observations.map((row) => text(row.id)));
  const offerIds = unique(observations.map((row) => text(row.supplier_product_offer_id)));
  const correctionRows = requireBoundedRows(await supabase
    .from("supplier_offer_observations")
    .select("corrects_observation_id")
    .eq("company_id", companyId)
    .in("corrects_observation_id", observationIds)
    .limit(RELATED_ROW_LIMIT + 1), RELATED_ROW_LIMIT);
  const correctedIds = new Set(
    correctionRows.map((row) => text(row.corrects_observation_id)).filter(Boolean),
  );
  const prices = requireBoundedRows(await supabase
    .from("supplier_offer_observation_prices")
    .select("id,observation_id,price_type,amount_text:amount::text,currency_code,price_quantity_text:price_quantity::text,price_unit_id,tier_min_quantity_text:tier_min_quantity::text,tier_max_quantity_text:tier_max_quantity::text,tax_included")
    .in("observation_id", observationIds)
    .limit(RELATED_ROW_LIMIT + 1), RELATED_ROW_LIMIT);
  const offers = requireBoundedRows(await supabase
    .from("supplier_product_offers")
    .select("id,supplier_id,supplier_location_id,material_catalog_id,supplier_sku,sell_unit_id,minimum_order_quantity_text:minimum_order_quantity::text,order_increment_text:order_increment::text,mapping_status,effective_from,effective_to")
    .in("id", offerIds)
    .limit(RELATED_ROW_LIMIT + 1), RELATED_ROW_LIMIT);
  const productIds = unique(offers.map((row) => text(row.material_catalog_id)));
  const supplierIds = unique(offers.map((row) => text(row.supplier_id)));
  const locationIds = unique([
    ...offers.map((row) => text(row.supplier_location_id)),
    ...observations.map((row) => text(row.supplier_location_id)),
  ]);

  const [products, suppliers, locations, conversions] = await Promise.all([
    productIds.length
      ? supabase.from("material_catalog")
          .select("id,mckenzie_product_code,canonical_name,lifecycle_status,manufacturer_id,manufacturer_part_number_normalized,category_id,stocking_unit_id,description,sku")
          .in("id", productIds).limit(RELATED_ROW_LIMIT + 1)
      : Promise.resolve({ data: [], error: null }),
    supplierIds.length
      ? supabase.from("suppliers").select("id,name,slug").in("id", supplierIds).limit(RELATED_ROW_LIMIT + 1)
      : Promise.resolve({ data: [], error: null }),
    locationIds.length
      ? supabase.from("supplier_locations").select("id,name,store_number,city,state").in("id", locationIds).limit(RELATED_ROW_LIMIT + 1)
      : Promise.resolve({ data: [], error: null }),
    productIds.length
      ? supabase.from("product_unit_conversions")
          .select("product_id,from_unit_id,to_unit_id,from_quantity_text:from_quantity::text,to_quantity_text:to_quantity::text,order_increment_text:order_increment::text,rounding_mode,effective_from,effective_to,verification_status")
          .in("product_id", productIds).limit(RELATED_ROW_LIMIT + 1)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const productRows = requireBoundedRows(products, RELATED_ROW_LIMIT);
  const supplierRows = requireBoundedRows(suppliers, RELATED_ROW_LIMIT);
  const locationRows = requireBoundedRows(locations, RELATED_ROW_LIMIT);
  const conversionRows = requireBoundedRows(conversions, RELATED_ROW_LIMIT);

  const manufacturerIds = unique(productRows.map((row) => text(row.manufacturer_id)));
  const categoryIds = unique(productRows.map((row) => text(row.category_id)));
  const unitIds = unique([
    ...productRows.map((row) => text(row.stocking_unit_id)),
    ...offers.map((row) => text(row.sell_unit_id)),
    ...observations.map((row) => text(row.inventory_unit_id)),
    ...prices.map((row) => text(row.price_unit_id)),
    ...conversionRows.flatMap((row) => [text(row.from_unit_id), text(row.to_unit_id)]),
  ]);
  const [manufacturers, categories, units] = await Promise.all([
    manufacturerIds.length
      ? supabase.from("material_manufacturers").select("id,canonical_name").in("id", manufacturerIds).limit(RELATED_ROW_LIMIT + 1)
      : Promise.resolve({ data: [], error: null }),
    categoryIds.length
      ? supabase.from("material_categories").select("id,name").in("id", categoryIds).limit(RELATED_ROW_LIMIT + 1)
      : Promise.resolve({ data: [], error: null }),
    unitIds.length
      ? supabase.from("units_of_measure").select("id,code,name").in("id", unitIds).limit(RELATED_ROW_LIMIT + 1)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const supplierById = mapById(supplierRows);
  const locationById = mapById(locationRows);
  const manufacturerById = mapById(requireBoundedRows(manufacturers, RELATED_ROW_LIMIT));
  const categoryById = mapById(requireBoundedRows(categories, RELATED_ROW_LIMIT));
  const unitById = mapById(requireBoundedRows(units, RELATED_ROW_LIMIT));
  const pricesByObservation = new Map<string, DatabaseRow[]>();
  for (const price of prices) {
    const observationId = text(price.observation_id);
    if (!observationId) continue;
    pricesByObservation.set(observationId, [
      ...(pricesByObservation.get(observationId) ?? []),
      price,
    ]);
  }
  const observationsByOffer = new Map<string, DatabaseRow[]>();
  for (const observation of observations) {
    const observationId = text(observation.id);
    const offerId = text(observation.supplier_product_offer_id);
    if (!observationId || !offerId || correctedIds.has(observationId)) continue;
    observationsByOffer.set(offerId, [
      ...(observationsByOffer.get(offerId) ?? []),
      observation,
    ]);
  }

  const supplierOptions = supplierRows
    .map((supplier) => ({ value: text(supplier.slug) ?? "", label: text(supplier.name) ?? "Unnamed supplier" }))
    .filter((option) => option.value)
    .sort((left, right) => compareFields(
      [left.label, left.value],
      [right.label, right.value],
    ));
  const offersByProduct = new Map<string, Array<Readonly<{ id: string; dto: MaterialCatalogPreviewOffer }>>>();

  for (const offer of offers) {
    const offerId = text(offer.id);
    const productId = text(offer.material_catalog_id);
    const supplier = supplierById.get(text(offer.supplier_id) ?? "");
    const supplierSlug = text(supplier?.slug) ?? "";
    if (!offerId || !productId || !supplier) continue;
    if (filters.supplier && supplierSlug !== filters.supplier) continue;
    if (filters.mappingStatus && offer.mapping_status !== filters.mappingStatus) continue;
    const observation = observationsByOffer.get(offerId)?.[0];
    if (!observation) continue;
    const sellUnitId = text(offer.sell_unit_id) ?? "";
    const sellUnit = text(unitById.get(sellUnitId)?.code) ?? "Unit unknown";
    const observationId = text(observation.id) ?? "";
    const location = locationById.get(
      text(observation.supplier_location_id) ?? text(offer.supplier_location_id) ?? "",
    );
    const locationParts = [
      text(location?.name),
      text(location?.city),
      text(location?.state),
      text(location?.store_number) ? `Store ${text(location?.store_number)}` : null,
    ].filter(Boolean);
    const status = observationStatus(observation, generatedAt);
    const productConversions = conversionRows.filter((row) => row.product_id === productId);
    const priceDtos = (pricesByObservation.get(observationId) ?? []).map((price) => {
      const priceId = text(price.id);
      if (!priceId) throw new MaterialCatalogPreviewLoadError();
      const priceUnitId = text(price.price_unit_id) ?? "";
      const priceUnit = text(unitById.get(priceUnitId)?.code) ?? "Unit unknown";
      const tierMin = decimal(price.tier_min_quantity_text);
      const tierMax = decimal(price.tier_max_quantity_text);
      const tier = tierMin || tierMax
        ? `${tierMin ?? "0"}–${tierMax ?? "No maximum"} ${priceUnit}`
        : `No tier bounds (${priceUnit} basis)`;
      return Object.freeze({ id: priceId, dto: Object.freeze({
        price: `${formatMoney(price.amount_text, price.currency_code)} per ${decimal(price.price_quantity_text) ?? "?"} ${priceUnit}`,
        priceType: formatLabel(price.price_type),
        tier,
        tax: price.tax_included === true
          ? "Tax included"
          : price.tax_included === false
            ? "Tax not included"
            : "Tax treatment not provided",
        comparisonExplanation: comparisonExplanation(
          sellUnitId,
          priceUnitId,
          sellUnit,
          priceUnit,
          productConversions,
          unitById,
          generatedAt,
        ),
      }) });
    }).sort((left, right) => compareFields(
      [left.dto.priceType, left.dto.price, left.dto.tier, left.dto.tax, left.id],
      [right.dto.priceType, right.dto.price, right.dto.tier, right.dto.tax, right.id],
    )).map((entry) => entry.dto);
    const inventoryUnit = text(unitById.get(text(observation.inventory_unit_id) ?? "")?.code);
    const delivery = decimal(observation.delivery_cost_text)
      ? formatMoney(observation.delivery_cost_text, observation.delivery_currency_code)
      : "Not provided";
    const leadMin = decimal(observation.lead_time_min_text);
    const leadMax = decimal(observation.lead_time_max_text);
    const leadUnit = formatLabel(observation.lead_time_unit);
    const leadTime = leadMin || leadMax
      ? `${leadMin ?? "?"}–${leadMax ?? "?"} ${leadUnit}`
      : "Not provided";
    const dto: MaterialCatalogPreviewOffer = Object.freeze({
      supplierName: text(supplier.name) ?? "Unnamed supplier",
      supplierSlug,
      location: locationParts.length ? locationParts.join(" · ") : "Supplier-wide / location not specified",
      supplierSku: text(offer.supplier_sku) ?? "Not provided",
      mappingStatus: formatLabel(offer.mapping_status),
      sellUnit,
      minimumOrderQuantity: decimal(offer.minimum_order_quantity_text),
      orderIncrement: decimal(offer.order_increment_text),
      effectiveRange: formatRange(offer.effective_from, offer.effective_to),
      observation: Object.freeze({
        evidenceStatus: status.label,
        evidenceTone: status.tone,
        observedLabel: observedLabel(observation.observed_at, generatedAt),
        effectiveRange: formatRange(observation.effective_from, observation.effective_to),
        confidence: formatLabel(observation.confidence),
        sourceType: formatLabel(observation.source_type),
        availability: formatLabel(observation.availability_status),
        inventory: formatQuantity(observation.inventory_quantity_text, inventoryUnit),
        leadTime,
        promisedDate: formatDate(observation.promised_available_date),
        delivery,
        prices: Object.freeze(priceDtos),
      }),
    });
    offersByProduct.set(productId, [...(offersByProduct.get(productId) ?? []), Object.freeze({ id: offerId, dto })]);
  }

  for (const [productId, productOffers] of offersByProduct) {
    offersByProduct.set(productId, productOffers.sort((left, right) => compareFields(
      [left.dto.supplierName, left.dto.location, left.dto.supplierSku, left.dto.mappingStatus, left.id],
      [right.dto.supplierName, right.dto.location, right.dto.supplierSku, right.dto.mappingStatus, right.id],
    )));
  }

  const queryNeedle = filters.query.toLocaleLowerCase("en-US");
  const productDtos = productRows.flatMap((product) => {
    const productId = text(product.id);
    if (!productId) return [];
    const productOffers = (offersByProduct.get(productId) ?? []).map((entry) => entry.dto);
    if (productOffers.length === 0) return [];
    const canonicalName = text(product.canonical_name);
    const productCode = text(product.mckenzie_product_code);
    const legacyDescription = text(product.description);
    const legacySku = text(product.sku);
    const searchable = [canonicalName, productCode, legacyDescription, legacySku]
      .filter(Boolean).join(" ").toLocaleLowerCase("en-US");
    if (queryNeedle && !searchable.includes(queryNeedle)) return [];
    const manufacturer = manufacturerById.get(text(product.manufacturer_id) ?? "");
    const category = categoryById.get(text(product.category_id) ?? "");
    const stockingUnit = unitById.get(text(product.stocking_unit_id) ?? "");
    return [Object.freeze({ id: productId, dto: Object.freeze({
      displayName: canonicalName ?? legacyDescription ?? "Unnamed legacy material",
      productCode,
      identityComplete: Boolean(canonicalName && productCode && product.category_id && product.stocking_unit_id),
      legacyDescription: canonicalName ? legacyDescription : null,
      legacySku,
      manufacturer: text(manufacturer?.canonical_name),
      manufacturerPartNumber: text(product.manufacturer_part_number_normalized),
      category: text(category?.name),
      stockingUnit: text(stockingUnit?.code),
      lifecycleStatus: text(product.lifecycle_status),
      offers: Object.freeze(productOffers),
    }) })];
  }).sort((left, right) => compareFields(
    [left.dto.displayName, left.dto.productCode ?? "", left.dto.legacySku ?? "", left.id],
    [right.dto.displayName, right.dto.productCode ?? "", right.dto.legacySku ?? "", right.id],
  )).map((entry) => entry.dto);

  const displayedOffers = productDtos.flatMap((product) => product.offers);

  return Object.freeze({
    generatedAt: generatedAtIso,
    resultsLimited,
    filters,
    supplierOptions: Object.freeze(supplierOptions),
    summary: Object.freeze({
      products: productDtos.length,
      offers: displayedOffers.length,
      observations: displayedOffers.length,
      offersMissingPrice: displayedOffers.filter(
        (offer) => offer.observation.prices.length === 0,
      ).length,
    }),
    products: Object.freeze(productDtos),
  });
}
