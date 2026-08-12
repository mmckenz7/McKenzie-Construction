import { NextRequest, NextResponse } from "next/server";

import { authorizeEstimateRequest, ESTIMATE_NOT_FOUND_BODY } from "@/lib/estimate-access";
import { STRUCTURED_ESTIMATE_CALCULATION_POLICY_VERSIONS } from "@/lib/estimate-calculations";
import {
  calculateMutation,
  completeCommittedMutationState,
  loadBuilderState,
  loadMutationState,
  MutationStateChangedError,
} from "@/lib/estimate-mutations";
import {
  buildEstimateCalculationPersistence,
  optionalIsoCalendarDate,
  postgresNumericToDecimalString,
} from "@/lib/estimate-persistence";
import { createAdminServerClient } from "@/lib/supabase/admin-server";
import { ESTIMATE_PRESENTATION_VERSION } from "@/lib/estimate-presentation";
import type { EstimateCalculationPolicyVersion } from "@/lib/estimate-types";
import { resolveEstimateMaterialTax } from "@/lib/estimate-material-tax";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PATCH_FIELDS = new Set([
  "title", "description", "propertyAddress", "validUntil", "overheadPercent",
  "profitMarkupPercent", "taxRatePercent", "discountAmount", "scopeNotes",
  "exclusions", "internalNotes", "customerNotes", "expectedCalculationRevision",
  "presentationDetailLevel", "presentationOhpMode", "presentationLumpSumLabel",
]);

type RouteContext = { params: Promise<{ estimateId: string }> };

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
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
    const loaded = await loadMutationState(supabase, estimateId);
    if (!loaded || !STRUCTURED_ESTIMATE_CALCULATION_POLICY_VERSIONS.includes(
      loaded.estimate.calculation_policy_version as EstimateCalculationPolicyVersion,
    )) {
      return NextResponse.json(ESTIMATE_NOT_FOUND_BODY, { status: 404 });
    }
    if (loaded.estimate.status !== "draft") {
      return NextResponse.json({ success: false, error: "Only draft estimates can be edited." }, { status: 409 });
    }
    const expectedRevision = body.expectedCalculationRevision as number;
    if (loaded.estimate.calculation_revision !== expectedRevision) {
      return NextResponse.json({ success: false, error: "The estimate was updated by another request.", code: "stale_calculation_revision" }, { status: 409 });
    }

    const changingPresentation = body.presentationDetailLevel !== undefined
      || body.presentationOhpMode !== undefined || body.presentationLumpSumLabel !== undefined;
    if (changingPresentation && !("presentation_detail_level" in loaded.estimate)) {
      return NextResponse.json({ success: false, code: "presentation_schema_unavailable", error: "Apply the estimate presentation migration before saving customer presentation settings." }, { status: 503 });
    }
    const presentationDetailLevel = body.presentationDetailLevel ?? loaded.estimate.presentation_detail_level;
    if (changingPresentation && !["lump_sum", "section_summary", "itemized"].includes(String(presentationDetailLevel))) {
      return NextResponse.json({ success: false, error: "Choose a supported customer detail level." }, { status: 400 });
    }
    const requestedOhpMode = body.presentationOhpMode ?? loaded.estimate.presentation_ohp_mode;
    if (changingPresentation && !["distributed", "separate_line_item"].includes(String(requestedOhpMode))) {
      return NextResponse.json({ success: false, error: "Choose a supported OH&P presentation." }, { status: 400 });
    }
    const presentationLumpSumLabel = body.presentationLumpSumLabel ?? loaded.estimate.presentation_lump_sum_label;
    if (changingPresentation && (typeof presentationLumpSumLabel !== "string" || !presentationLumpSumLabel.trim() || presentationLumpSumLabel.trim().length > 240)) {
      return NextResponse.json({ success: false, error: "The lump-sum description must be 1 to 240 characters." }, { status: 400 });
    }

    const requestedPropertyAddress = body.propertyAddress === undefined
      ? text(loaded.estimate.property_address)
      : text(body.propertyAddress);
    const changingPropertyAddress = body.propertyAddress !== undefined
      && requestedPropertyAddress !== text(loaded.estimate.property_address);
    const municipalityTax = changingPropertyAddress
      ? await resolveEstimateMaterialTax(supabase, requestedPropertyAddress)
      : null;
    const calculationRecord = {
      ...loaded.estimate,
      overhead_percent_text: body.overheadPercent === undefined
        ? loaded.estimate.overhead_percent_text
        : postgresNumericToDecimalString(body.overheadPercent, "overheadPercent"),
      profit_markup_percent_text: body.profitMarkupPercent === undefined
        ? loaded.estimate.profit_markup_percent_text
        : postgresNumericToDecimalString(body.profitMarkupPercent, "profitMarkupPercent"),
      tax_rate_percent_text: municipalityTax?.ratePercent ?? (body.taxRatePercent === undefined
        ? loaded.estimate.tax_rate_percent_text
        : postgresNumericToDecimalString(body.taxRatePercent, "taxRatePercent")),
      discount_value_text: body.discountAmount === undefined
        ? loaded.estimate.discount_value_text
        : postgresNumericToDecimalString(body.discountAmount, "discountAmount"),
    };
    const { calculation } = calculateMutation(calculationRecord, loaded.items);
    const updates: Record<string, unknown> = {
      ...(body.title !== undefined ? { title: text(body.title) } : {}),
      ...(body.description !== undefined ? { description: text(body.description) } : {}),
      ...(body.propertyAddress !== undefined ? { property_address: text(body.propertyAddress) } : {}),
      ...(body.validUntil !== undefined ? { valid_until: optionalIsoCalendarDate(body.validUntil) } : {}),
      ...(body.scopeNotes !== undefined ? { scope_notes: text(body.scopeNotes) } : {}),
      ...(body.exclusions !== undefined ? { exclusions: text(body.exclusions) } : {}),
      ...(body.internalNotes !== undefined ? { internal_notes: text(body.internalNotes) } : {}),
      ...(body.customerNotes !== undefined ? { customer_notes: text(body.customerNotes) } : {}),
      ...(changingPresentation ? {
        presentation_version: ESTIMATE_PRESENTATION_VERSION,
        presentation_detail_level: presentationDetailLevel,
        presentation_ohp_mode: presentationDetailLevel === "lump_sum" ? "distributed" : requestedOhpMode,
        presentation_lump_sum_label: (presentationLumpSumLabel as string).trim(),
      } : {}),
      overhead_percent: calculationRecord.overhead_percent_text,
      profit_markup_percent: calculationRecord.profit_markup_percent_text,
      tax_rate_percent: calculationRecord.tax_rate_percent_text,
      ...(changingPropertyAddress ? {
        material_tax_municipality: municipalityTax?.municipality ?? null,
        material_tax_county: municipalityTax?.county ?? null,
        material_tax_state_code: municipalityTax?.stateCode ?? null,
        material_tax_rate_id: municipalityTax?.rateId ?? null,
        material_tax_source_url: municipalityTax?.sourceUrl ?? null,
        material_tax_verified_at: municipalityTax?.verifiedAt ?? null,
      } : {}),
      discount_value: calculationRecord.discount_value_text,
      ...buildEstimateCalculationPersistence(calculation),
      calculation_revision: expectedRevision + 1,
    };
    if (updates.title === null) return NextResponse.json({ success: false, error: "title cannot be empty." }, { status: 400 });

    const updated = await supabase.from("estimates").update(updates)
      .eq("id", estimateId).eq("status", "draft")
      .eq("calculation_revision", expectedRevision)
      .select("id").maybeSingle();
    if (updated.error) throw new Error(updated.error.message);
    if (!updated.data) return NextResponse.json({ success: false, error: "The estimate was updated by another request.", code: "stale_calculation_revision" }, { status: 409 });
    const committedRevision = expectedRevision + 1;
    const completion = await completeCommittedMutationState(
      supabase,
      estimateId,
      auth.authorization!,
      committedRevision,
      "estimateId",
      estimateId,
    );
    if (!completion.ok) return NextResponse.json(completion.body, { status: completion.status });
    return NextResponse.json({
      success: true,
      estimateId,
      nextCalculationRevision: completion.state.calculationRevision,
      ...completion.state,
    });
  } catch (error) {
    if (error instanceof MutationStateChangedError) {
      return NextResponse.json({ success: false, error: "The estimate changed before the setup update could be saved.", code: "stale_calculation_revision" }, { status: 409 });
    }
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Estimate update failed." }, { status: error instanceof TypeError || error instanceof RangeError ? 400 : 500 });
  }
}
