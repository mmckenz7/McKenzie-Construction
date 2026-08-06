import { NextRequest, NextResponse } from "next/server";

import { authorizeEstimateRequest, ESTIMATE_NOT_FOUND_BODY } from "@/lib/estimate-access";
import { loadBuilderState, MutationStateChangedError } from "@/lib/estimate-mutations";
import {
  buildEstimateCalculationPersistence,
  calculatePersistedEstimate,
  optionalIsoCalendarDate,
  postgresNumericToDecimalString,
  projectPersistedEstimate,
  STRUCTURED_ESTIMATE_ITEM_SELECT,
  STRUCTURED_ESTIMATE_SELECT,
} from "@/lib/estimate-persistence";
import { createAdminServerClient } from "@/lib/supabase/admin-server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PATCH_FIELDS = new Set([
  "title", "description", "propertyAddress", "validUntil", "overheadPercent",
  "profitMarkupPercent", "taxRatePercent", "discountAmount", "scopeNotes",
  "exclusions", "internalNotes", "customerNotes", "expectedCalculationRevision",
]);

type RouteContext = { params: Promise<{ estimateId: string }> };

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function loadStructuredEstimate(
  supabase: ReturnType<typeof createAdminServerClient>,
  estimateId: string,
) {
  const [estimate, items, sections] = await Promise.all([
    supabase.from("estimates").select(STRUCTURED_ESTIMATE_SELECT).eq("id", estimateId).maybeSingle(),
    supabase.from("estimate_line_items").select(STRUCTURED_ESTIMATE_ITEM_SELECT).eq("estimate_id", estimateId).order("sort_order").order("id"),
    supabase.from("estimate_sections").select("id, name, customer_description, sort_order").eq("estimate_id", estimateId).order("sort_order").order("id"),
  ]);
  if (estimate.error || items.error || sections.error) throw new Error("Estimate could not be loaded.");
  return { estimate: estimate.data, items: items.data ?? [], sections: sections.data ?? [] };
}

export async function GET(request: NextRequest, context: RouteContext) {
  const { estimateId } = await context.params;
  if (!UUID.test(estimateId)) return NextResponse.json({ success: false, error: "Invalid estimate ID." }, { status: 400 });
  const auth = await authorizeEstimateRequest(request, estimateId);
  if (auth.response) return auth.response;
  try {
    const builderState = await loadBuilderState(createAdminServerClient(), estimateId, auth.authorization!);
    if (!builderState) {
      return NextResponse.json(ESTIMATE_NOT_FOUND_BODY, { status: 404 });
    }
    return NextResponse.json({ success: true, ...builderState });
  } catch (error) {
    if (error instanceof MutationStateChangedError) {
      return NextResponse.json({ success: false, error: "The estimate changed while it was being loaded.", code: "stale_calculation_revision" }, { status: 409 });
    }
    return NextResponse.json({ success: false, error: "Estimate could not be loaded." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { estimateId } = await context.params;
  if (!UUID.test(estimateId)) return NextResponse.json({ success: false, error: "Invalid estimate ID." }, { status: 400 });
  const auth = await authorizeEstimateRequest(request, estimateId);
  if (auth.response) return auth.response;
  if (!auth.authorization!.canEditPrices) {
    return NextResponse.json({ success: false, error: "You do not have permission to edit estimate prices." }, { status: 403 });
  }

  try {
    const body = await request.json() as Record<string, unknown>;
    if (Object.keys(body).some((key) => !PATCH_FIELDS.has(key))) {
      return NextResponse.json({ success: false, error: "The request contains unsupported fields." }, { status: 400 });
    }
    if (!Number.isInteger(body.expectedCalculationRevision) || (body.expectedCalculationRevision as number) < 0) {
      return NextResponse.json({ success: false, error: "expectedCalculationRevision is required." }, { status: 400 });
    }

    const supabase = createAdminServerClient();
    const loaded = await loadStructuredEstimate(supabase, estimateId);
    if (!loaded.estimate || loaded.estimate.calculation_policy_version !== "structured-estimate-v1") {
      return NextResponse.json(ESTIMATE_NOT_FOUND_BODY, { status: 404 });
    }
    if (loaded.estimate.status !== "draft") {
      return NextResponse.json({ success: false, error: "Only draft estimates can be edited." }, { status: 409 });
    }
    const expectedRevision = body.expectedCalculationRevision as number;
    if (loaded.estimate.calculation_revision !== expectedRevision) {
      return NextResponse.json({ success: false, error: "The estimate was updated by another request.", code: "stale_calculation_revision" }, { status: 409 });
    }

    // B2a has no section or item mutation routes. B2b must make every such
    // mutation increment calculation_revision transactionally. Header PATCH
    // and all future structured-item writers must share this concurrency token;
    // strengthen this boundary before any other writer can mutate those items.
    const calculationRecord = {
      ...loaded.estimate,
      overhead_percent_text: body.overheadPercent === undefined
        ? loaded.estimate.overhead_percent_text
        : postgresNumericToDecimalString(body.overheadPercent, "overheadPercent"),
      profit_markup_percent_text: body.profitMarkupPercent === undefined
        ? loaded.estimate.profit_markup_percent_text
        : postgresNumericToDecimalString(body.profitMarkupPercent, "profitMarkupPercent"),
      tax_rate_percent_text: body.taxRatePercent === undefined
        ? loaded.estimate.tax_rate_percent_text
        : postgresNumericToDecimalString(body.taxRatePercent, "taxRatePercent"),
      discount_value_text: body.discountAmount === undefined
        ? loaded.estimate.discount_value_text
        : postgresNumericToDecimalString(body.discountAmount, "discountAmount"),
    };
    const calculation = calculatePersistedEstimate(calculationRecord, loaded.items);
    const updates: Record<string, unknown> = {
      ...(body.title !== undefined ? { title: text(body.title) } : {}),
      ...(body.description !== undefined ? { description: text(body.description) } : {}),
      ...(body.propertyAddress !== undefined ? { property_address: text(body.propertyAddress) } : {}),
      ...(body.validUntil !== undefined ? { valid_until: optionalIsoCalendarDate(body.validUntil) } : {}),
      ...(body.scopeNotes !== undefined ? { scope_notes: text(body.scopeNotes) } : {}),
      ...(body.exclusions !== undefined ? { exclusions: text(body.exclusions) } : {}),
      ...(body.internalNotes !== undefined ? { internal_notes: text(body.internalNotes) } : {}),
      ...(body.customerNotes !== undefined ? { customer_notes: text(body.customerNotes) } : {}),
      overhead_percent: calculationRecord.overhead_percent_text,
      profit_markup_percent: calculationRecord.profit_markup_percent_text,
      tax_rate_percent: calculationRecord.tax_rate_percent_text,
      discount_value: calculationRecord.discount_value_text,
      ...buildEstimateCalculationPersistence(calculation),
      calculation_revision: expectedRevision + 1,
    };
    if (updates.title === null) return NextResponse.json({ success: false, error: "title cannot be empty." }, { status: 400 });

    const updated = await supabase.from("estimates").update(updates)
      .eq("id", estimateId).eq("status", "draft")
      .eq("calculation_revision", expectedRevision)
      .select(STRUCTURED_ESTIMATE_SELECT).maybeSingle();
    if (updated.error) throw new Error(updated.error.message);
    if (!updated.data) return NextResponse.json({ success: false, error: "The estimate was updated by another request.", code: "stale_calculation_revision" }, { status: 409 });
    return NextResponse.json({ success: true, estimate: projectPersistedEstimate(updated.data, calculation, auth.authorization!), sections: loaded.sections });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Estimate update failed." }, { status: error instanceof TypeError || error instanceof RangeError ? 400 : 500 });
  }
}
