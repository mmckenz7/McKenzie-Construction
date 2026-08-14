import { randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { buildDeckTakeoffPreview, DECK_TAKEOFF_VERSION, type DeckCatalogPrice, type DeckTakeoffPlan } from "@/lib/deck-takeoff-v0";
import { authorizeEstimateRequest, ESTIMATE_NOT_FOUND_BODY } from "@/lib/estimate-access";
import {
  calculateMutation, canonicalItemRpcValue, completeCommittedMutationState,
  expectedRevision, loadMutationState, MutationStateChangedError, rpcResult, UUID_PATTERN,
  type CanonicalEstimateItem,
} from "@/lib/estimate-mutations";
import { createAdminServerClient } from "@/lib/supabase/admin-server";

type RouteContext = { params: Promise<{ estimateId: string }> };

const PLAN_KEYS = new Set([
  "boardActualWidthInches", "boardGapInches", "boardStockLengthFeet", "boardWastePercent",
  "boardCatalogMaterialId", "boardUnitCost", "boardSourceReference",
  "screwCoverageSquareFeetPerPack", "screwCatalogMaterialId", "screwPackUnitCost", "screwSourceReference",
  "additionalLines",
]);
const LINE_KEYS = new Set(["key", "category", "description", "quantity", "unit", "unitCost", "catalogMaterialId", "sourceReference"]);
const PREVIEW_KEYS = new Set(["visitId", "expectedVisitRevision", "plan"]);
const APPLY_KEYS = new Set([...PREVIEW_KEYS, "expectedCalculationRevision", "applicationId", "idempotencyKey", "applicationVersion", "previewBinding"]);

function exactFields(record: Record<string, unknown>, fields: ReadonlySet<string>) {
  return Object.keys(record).length === fields.size && Object.keys(record).every((key) => fields.has(key));
}

function text(value: unknown, maximum: number) {
  if (typeof value !== "string" || value.length > maximum) throw new TypeError("Takeoff text is invalid.");
  return value;
}

function nullableUuid(value: unknown) {
  if (value === null) return null;
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) throw new TypeError("Catalog material identity is invalid.");
  return value;
}

function parsePlan(value: unknown): DeckTakeoffPlan {
  if (!value || typeof value !== "object" || Array.isArray(value) || !exactFields(value as Record<string, unknown>, PLAN_KEYS)) {
    throw new TypeError("The Deck takeoff plan is invalid.");
  }
  const plan = value as Record<string, unknown>;
  if (!Array.isArray(plan.additionalLines) || plan.additionalLines.length > 12) throw new TypeError("The Deck takeoff has too many planned lines.");
  const additionalLines = plan.additionalLines.map((raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw) || !exactFields(raw as Record<string, unknown>, LINE_KEYS)) throw new TypeError("A planned cost line is invalid.");
    const line = raw as Record<string, unknown>;
    if (!new Set(["material", "labor", "equipment", "other"]).has(String(line.category))) throw new TypeError("A planned cost category is invalid.");
    return {
      key: text(line.key, 80), category: line.category as "material" | "labor" | "equipment" | "other",
      description: text(line.description, 240), quantity: text(line.quantity, 30), unit: text(line.unit, 40),
      unitCost: text(line.unitCost, 30), catalogMaterialId: nullableUuid(line.catalogMaterialId),
      sourceReference: text(line.sourceReference, 1000),
    };
  });
  if (new Set(additionalLines.map((line) => line.key)).size !== additionalLines.length) throw new TypeError("Planned cost keys must be unique.");
  return {
    boardActualWidthInches: text(plan.boardActualWidthInches, 30),
    boardGapInches: text(plan.boardGapInches, 30),
    boardStockLengthFeet: text(plan.boardStockLengthFeet, 30),
    boardWastePercent: text(plan.boardWastePercent, 30),
    boardCatalogMaterialId: nullableUuid(plan.boardCatalogMaterialId),
    boardUnitCost: text(plan.boardUnitCost, 30), boardSourceReference: text(plan.boardSourceReference, 1000),
    screwCoverageSquareFeetPerPack: text(plan.screwCoverageSquareFeetPerPack, 30),
    screwCatalogMaterialId: nullableUuid(plan.screwCatalogMaterialId),
    screwPackUnitCost: text(plan.screwPackUnitCost, 30), screwSourceReference: text(plan.screwSourceReference, 1000),
    additionalLines,
  };
}

function failure(code: string) {
  if (code === "not_found") return NextResponse.json(ESTIMATE_NOT_FOUND_BODY, { status: 404 });
  if (code === "forbidden") return NextResponse.json({ success: false, error: "Estimate price-edit access is required.", code }, { status: 403 });
  if (code === "non_draft") return NextResponse.json({ success: false, error: "Only a draft estimate can receive a Deck takeoff.", code }, { status: 409 });
  if (code === "stale_visit_revision" || code === "stale_calculation_revision") return NextResponse.json({ success: false, error: "The field visit or estimate changed. Reload and review the takeoff again.", code }, { status: 409 });
  if (code === "replayed_application" || code === "application_identity_conflict") return NextResponse.json({ success: false, error: "This takeoff action was already used and will not be applied twice.", code }, { status: 409 });
  if (code === "invalid_application") return NextResponse.json({ success: false, error: "The reviewed Deck takeoff is invalid.", code }, { status: 400 });
  return NextResponse.json({ success: false, error: "The Deck takeoff could not be applied." }, { status: 500 });
}

async function loadVisitAndCatalog(
  supabase: ReturnType<typeof createAdminServerClient>, companyId: string, estimateId: string,
  visitId: string, expectedVisitRevision: number, plan: DeckTakeoffPlan,
) {
  const visit = await supabase.from("guided_site_visits")
    .select("id,status,revision")
    .eq("id", visitId).eq("company_id", companyId).eq("target_estimate_id", estimateId).maybeSingle();
  if (visit.error) throw new Error("The completed Deck visit could not be loaded.");
  if (!visit.data || visit.data.status !== "completed") return { code: "not_found" as const };
  if (visit.data.revision !== expectedVisitRevision) return { code: "stale_visit_revision" as const };
  const itemResult = await supabase.from("guided_site_visit_items")
    .select("item_key,observation").eq("company_id", companyId).eq("visit_id", visitId).order("ordinal");
  if (itemResult.error) throw new Error("The completed Deck field facts could not be loaded.");
  const ids = [...new Set([
    plan.boardCatalogMaterialId, plan.screwCatalogMaterialId,
    ...plan.additionalLines.map((line) => line.catalogMaterialId),
  ].filter((id): id is string => Boolean(id)))];
  const catalog = new Map<string, DeckCatalogPrice>();
  if (ids.length) {
    const [materials, prices] = await Promise.all([
      supabase.from("material_catalog").select("id,description,unit,unit_cost,is_active").in("id", ids),
      supabase.from("material_supplier_prices")
        .select("material_catalog_id,unit_cost,source_reference,last_checked_at,effective_at,expires_at,suppliers(name),supplier_locations(name,store_number)")
        .in("material_catalog_id", ids).eq("is_active", true).lte("effective_at", new Date().toISOString())
        .or(`expires_at.is.null,expires_at.gte.${new Date().toISOString()}`)
        .order("last_checked_at", { ascending: false }),
    ]);
    if (materials.error || prices.error) throw new Error("Catalog pricing could not be loaded.");
    for (const material of materials.data ?? []) {
      if (!material.is_active) continue;
      const selected = (prices.data ?? []).find((price) => price.material_catalog_id === material.id);
      const supplier = selected?.suppliers as { name?: string } | null;
      const location = selected?.supplier_locations as { name?: string; store_number?: string } | null;
      const source = selected?.source_reference || `catalog:${material.id}:${supplier?.name ?? "catalog"}${location?.store_number ? `:store-${location.store_number}` : ""}`;
      catalog.set(material.id, {
        materialId: material.id, description: material.description, unit: material.unit,
        unitCost: String(selected?.unit_cost ?? material.unit_cost), sourceReference: source,
      });
    }
  }
  return { code: "ok" as const, visit: visit.data, items: (itemResult.data ?? []).map((item) => ({ itemKey: item.item_key, observation: item.observation as Record<string, unknown> })), catalog };
}

async function prepare(request: NextRequest, context: RouteContext, allowed: ReadonlySet<string>) {
  const { estimateId } = await context.params;
  if (!UUID_PATTERN.test(estimateId)) throw new TypeError("Invalid estimate ID.");
  const auth = await authorizeEstimateRequest(request, estimateId);
  if (auth.response) return { response: auth.response } as const;
  if (!auth.authorization!.canEditPrices) return { response: failure("forbidden") } as const;
  const body = await request.json() as Record<string, unknown>;
  if (!exactFields(body, allowed) || typeof body.visitId !== "string" || !UUID_PATTERN.test(body.visitId)
    || !Number.isSafeInteger(body.expectedVisitRevision) || (body.expectedVisitRevision as number) < 1) throw new TypeError("The visit identity or revision is invalid.");
  return { estimateId, auth: auth.authorization!, body, plan: parsePlan(body.plan) } as const;
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const prepared = await prepare(request, context, PREVIEW_KEYS);
    if ("response" in prepared) return prepared.response;
    const supabase = createAdminServerClient();
    const loaded = await loadVisitAndCatalog(supabase, prepared.auth.companyId, prepared.estimateId, prepared.body.visitId as string, prepared.body.expectedVisitRevision as number, prepared.plan);
    if (loaded.code !== "ok") return failure(loaded.code);
    return NextResponse.json(buildDeckTakeoffPreview({ items: loaded.items, plan: prepared.plan, catalog: loaded.catalog }), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof TypeError ? error.message : "Draft takeoff could not be calculated." }, { status: error instanceof TypeError ? 400 : 500 });
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const prepared = await prepare(request, context, APPLY_KEYS);
    if ("response" in prepared) return prepared.response;
    const body = prepared.body;
    if (typeof body.applicationId !== "string" || !UUID_PATTERN.test(body.applicationId)
      || typeof body.idempotencyKey !== "string" || !UUID_PATTERN.test(body.idempotencyKey)
      || body.applicationVersion !== DECK_TAKEOFF_VERSION
      || typeof body.previewBinding !== "string" || body.previewBinding.length > 12000) throw new TypeError("The reviewed takeoff identity is invalid.");
    const calculationRevision = expectedRevision(body.expectedCalculationRevision);
    const supabase = createAdminServerClient();
    const [loaded, state] = await Promise.all([
      loadVisitAndCatalog(supabase, prepared.auth.companyId, prepared.estimateId, body.visitId as string, body.expectedVisitRevision as number, prepared.plan),
      loadMutationState(supabase, prepared.estimateId),
    ]);
    if (loaded.code !== "ok") return failure(loaded.code);
    if (!state) return failure("not_found");
    if (state.estimate.status !== "draft") return failure("non_draft");
    if (state.estimate.calculation_revision !== calculationRevision) return failure("stale_calculation_revision");
    const preview = buildDeckTakeoffPreview({ items: loaded.items, plan: prepared.plan, catalog: loaded.catalog });
    if (preview.status !== "ready" || preview.previewBinding !== body.previewBinding) throw new TypeError("The reviewed Deck takeoff changed or still needs input.");
    const sectionId = randomUUID();
    const firstSort = state.items.reduce((maximum, item) => Math.max(maximum, item.sortOrder), -1) + 1;
    const newItems: CanonicalEstimateItem[] = preview.lines.map((line, index) => ({
      id: randomUUID(), sectionId, itemType: "standard", quantity: line.quantity, unit: line.unit,
      customerDescription: line.customerDescription, internalDescription: `${line.internalDescription} Formula: ${line.formula}`,
      materialUnitCost: line.category === "material" ? line.unitCost : "0",
      laborUnitCost: line.category === "labor" ? line.unitCost : "0",
      subcontractorUnitCost: "0", equipmentUnitCost: line.category === "equipment" ? line.unitCost : "0",
      otherDirectUnitCost: line.category === "other" ? line.unitCost : "0",
      materialWastePercent: "0", itemMarkupPercent: "0", taxable: false, included: true,
      fixedCustomerPrice: null, sortOrder: firstSort + index,
    }));
    const calculated = calculateMutation(state.estimate, [...state.items, ...newItems]);
    const evidenceSnapshot = {
      version: DECK_TAKEOFF_VERSION, visitId: loaded.visit.id, visitRevision: loaded.visit.revision,
      previewBinding: preview.previewBinding, fieldDimensions: { lengthFeet: preview.deckLengthFeet, widthFeet: preview.deckWidthFeet, areaSquareFeet: preview.deckAreaSquareFeet },
      disclosures: preview.disclosures, plan: prepared.plan,
      lines: preview.lines.map((line, index) => ({ ...line, estimateLineItemId: newItems[index].id })),
    };
    const result = await supabase.rpc("apply_reviewed_deck_takeoff", {
      requested_auth_user_id: prepared.auth.authUserId, requested_estimate_id: prepared.estimateId,
      requested_visit_id: body.visitId, requested_application_id: body.applicationId,
      requested_idempotency_key: body.idempotencyKey, requested_expected_visit_revision: body.expectedVisitRevision,
      requested_expected_calculation_revision: calculationRevision, requested_application_version: body.applicationVersion,
      requested_preview_binding: body.previewBinding, requested_section_id: sectionId,
      requested_new_items: newItems.map(canonicalItemRpcValue), requested_item_calculations: calculated.itemCalculations,
      requested_estimate_calculation: calculated.estimateCalculation, requested_evidence_snapshot: evidenceSnapshot,
    });
    if (result.error) throw new Error(result.error.message);
    const outcome = rpcResult(result.data);
    if (outcome.result_code !== "ok") return failure(outcome.result_code);
    const completion = await completeCommittedMutationState(supabase, prepared.estimateId, prepared.auth, outcome.next_calculation_revision, "applicationId", String(body.applicationId));
    if (!completion.ok) return NextResponse.json(completion.body, { status: completion.status });
    return NextResponse.json({ success: true, applicationId: body.applicationId, sectionId, nextCalculationRevision: completion.state.calculationRevision, ...completion.state }, { status: 201 });
  } catch (error) {
    if (error instanceof MutationStateChangedError) return failure("stale_calculation_revision");
    const status = error instanceof TypeError || error instanceof RangeError || error instanceof SyntaxError ? 400 : 500;
    return NextResponse.json({ success: false, error: status === 400 && error instanceof Error ? error.message : "Reviewed Deck takeoff could not be applied." }, { status });
  }
}
