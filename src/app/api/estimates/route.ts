import { NextRequest, NextResponse } from "next/server";

import { authorizeEstimateRequest } from "@/lib/estimate-access";
import { calculateEstimate, ESTIMATE_CALCULATION_POLICY_VERSION } from "@/lib/estimate-calculations";
import {
  buildEstimateCalculationPersistence,
  calculatePersistedEstimate,
  isStructuredLeadDraftUniqueViolation,
  optionalIsoCalendarDate,
  projectPersistedEstimate,
  STRUCTURED_ESTIMATE_ITEM_SELECT,
  STRUCTURED_ESTIMATE_SELECT,
} from "@/lib/estimate-persistence";
import { createAdminServerClient } from "@/lib/supabase/admin-server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATUSES = new Set(["draft", "reviewing", "sent", "viewed", "accepted", "declined", "expired", "converted", "void"]);
const CREATE_FIELDS = new Set([
  "leadId", "customerId", "projectId", "title", "description", "propertyAddress",
  "validUntil", "overheadPercent", "profitMarkupPercent", "taxRatePercent",
  "discountAmount", "scopeNotes", "exclusions", "internalNotes", "customerNotes",
]);

function optionalId(value: unknown, name: string) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !UUID.test(value)) throw new TypeError(`${name} must be a UUID.`);
  return value;
}

function optionalText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function decimal(value: unknown, fallback: string, name: string) {
  const result = value === undefined ? fallback : value;
  if (typeof result !== "string") throw new TypeError(`${name} must be a decimal string.`);
  return result;
}

async function verifyRelationships(
  supabase: ReturnType<typeof createAdminServerClient>,
  leadId: string | null,
  customerId: string | null,
  projectId: string | null,
) {
  const [leadResult, customerResult, projectResult] = await Promise.all([
    leadId ? supabase.from("leads").select("id").eq("id", leadId).maybeSingle() : Promise.resolve({ data: null, error: null }),
    customerId ? supabase.from("customers").select("id, source_lead_id").eq("id", customerId).maybeSingle() : Promise.resolve({ data: null, error: null }),
    projectId ? supabase.from("projects").select("id, customer_id").eq("id", projectId).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);
  if (leadResult.error || customerResult.error || projectResult.error) throw new Error("Relationships could not be verified.");
  if ((leadId && !leadResult.data) || (customerId && !customerResult.data) || (projectId && !projectResult.data)) return false;

  let projectCustomer = customerResult.data as { id: string; source_lead_id: string | null } | null;
  if (projectResult.data) {
    const linkedCustomerId = String(projectResult.data.customer_id);
    if (customerId && linkedCustomerId !== customerId) return false;
    if (!projectCustomer) {
      const result = await supabase.from("customers").select("id, source_lead_id").eq("id", linkedCustomerId).maybeSingle();
      if (result.error) throw new Error("Relationships could not be verified.");
      if (!result.data) return false;
      projectCustomer = result.data;
    }
  }
  return !(leadId && projectCustomer && projectCustomer.source_lead_id !== leadId);
}

async function loadStructuredLeadDraft(
  supabase: ReturnType<typeof createAdminServerClient>,
  leadId: string,
) {
  return supabase.from("estimates").select(STRUCTURED_ESTIMATE_SELECT)
    .eq("lead_id", leadId).eq("status", "draft")
    .eq("calculation_policy_version", ESTIMATE_CALCULATION_POLICY_VERSION)
    .order("created_at", { ascending: true }).limit(1).maybeSingle();
}

async function projectStructuredDraft(
  supabase: ReturnType<typeof createAdminServerClient>,
  estimate: Record<string, unknown>,
  permissions: { canViewCosts: boolean; canViewProfit: boolean },
) {
  const items = await supabase.from("estimate_line_items").select(STRUCTURED_ESTIMATE_ITEM_SELECT)
    .eq("estimate_id", estimate.id).order("sort_order").order("id");
  if (items.error) throw new Error(items.error.message);
  const calculation = calculatePersistedEstimate(estimate, items.data ?? []);
  return projectPersistedEstimate(estimate, calculation, permissions);
}

export async function POST(request: NextRequest) {
  const auth = await authorizeEstimateRequest(request);
  if (auth.response) return auth.response;
  if (!auth.authorization!.canEditPrices) {
    return NextResponse.json({ success: false, error: "You do not have permission to edit estimate prices." }, { status: 403 });
  }
  try {
    const body = await request.json() as Record<string, unknown>;
    if (Object.keys(body).some((key) => !CREATE_FIELDS.has(key))) {
      return NextResponse.json({ success: false, error: "The request contains unsupported fields." }, { status: 400 });
    }
    const leadId = optionalId(body.leadId, "leadId");
    const customerId = optionalId(body.customerId, "customerId");
    const projectId = optionalId(body.projectId, "projectId");
    if (!leadId && !customerId && !projectId) {
      return NextResponse.json({ success: false, error: "A lead, customer, or project is required." }, { status: 400 });
    }
    const title = optionalText(body.title);
    if (!title) return NextResponse.json({ success: false, error: "title is required." }, { status: 400 });

    const supabase = createAdminServerClient();
    if (!await verifyRelationships(supabase, leadId, customerId, projectId)) {
      return NextResponse.json({ success: false, error: "The estimate relationships are invalid or incompatible." }, { status: 400 });
    }

    if (leadId) {
      const existing = await loadStructuredLeadDraft(supabase, leadId);
      if (existing.error) throw new Error(existing.error.message);
      if (existing.data) {
        const estimate = await projectStructuredDraft(supabase, existing.data, auth.authorization!);
        return NextResponse.json({ success: true, estimate });
      }
    }

    const overheadPercent = decimal(body.overheadPercent, "0", "overheadPercent");
    const profitMarkupPercent = decimal(body.profitMarkupPercent, "0", "profitMarkupPercent");
    const taxRatePercent = decimal(body.taxRatePercent, "0", "taxRatePercent");
    const discountAmount = decimal(body.discountAmount, "0", "discountAmount");
    const calculation = calculateEstimate({ items: [], overheadPercent, profitMarkupPercent, taxPercent: taxRatePercent, discountAmount });
    const payload = {
      lead_id: leadId, customer_id: customerId, project_id: projectId, title,
      description: optionalText(body.description), property_address: optionalText(body.propertyAddress),
      valid_until: optionalIsoCalendarDate(body.validUntil), status: "draft",
      overhead_percent: overheadPercent, profit_markup_percent: profitMarkupPercent,
      tax_rate_percent: taxRatePercent, discount_type: "fixed_amount", discount_value: discountAmount,
      scope_notes: optionalText(body.scopeNotes), exclusions: optionalText(body.exclusions),
      internal_notes: optionalText(body.internalNotes), customer_notes: optionalText(body.customerNotes),
      calculation_policy_version: ESTIMATE_CALCULATION_POLICY_VERSION,
      calculation_revision: 0, created_by_auth_user_id: auth.authorization!.authUserId,
      ...buildEstimateCalculationPersistence(calculation),
    };
    const inserted = await supabase.from("estimates").insert(payload).select(STRUCTURED_ESTIMATE_SELECT).single();
    if (inserted.error) {
      if (leadId && isStructuredLeadDraftUniqueViolation(inserted.error)) {
        const winning = await loadStructuredLeadDraft(supabase, leadId);
        if (winning.error) throw new Error(winning.error.message);
        if (!winning.data) throw new Error("The winning structured lead draft could not be loaded.");
        const estimate = await projectStructuredDraft(supabase, winning.data, auth.authorization!);
        return NextResponse.json({ success: true, estimate });
      }
      throw new Error(inserted.error.message);
    }
    if (!inserted.data) throw new Error("Estimate creation failed.");
    return NextResponse.json({ success: true, estimate: projectPersistedEstimate(inserted.data, calculation, auth.authorization!) }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Estimate creation failed.";
    return NextResponse.json({ success: false, error: message }, { status: error instanceof TypeError || error instanceof RangeError ? 400 : 500 });
  }
}

export async function GET(request: NextRequest) {
  const auth = await authorizeEstimateRequest(request);
  if (auth.response) return auth.response;
  const params = request.nextUrl.searchParams;
  const filters: Array<[string, string]> = [];
  for (const [query, column] of [["leadId", "lead_id"], ["customerId", "customer_id"], ["projectId", "project_id"]] as const) {
    const value = params.get(query);
    if (value) {
      if (!UUID.test(value)) return NextResponse.json({ success: false, error: `${query} must be a UUID.` }, { status: 400 });
      filters.push([column, value]);
    }
  }
  const status = params.get("status");
  if (status && !STATUSES.has(status)) return NextResponse.json({ success: false, error: "Invalid estimate status." }, { status: 400 });

  const supabase = createAdminServerClient();
  let query = supabase.from("estimates").select(STRUCTURED_ESTIMATE_SELECT)
    .eq("calculation_policy_version", ESTIMATE_CALCULATION_POLICY_VERSION)
    .order("created_at", { ascending: false }).order("id", { ascending: true });
  for (const [column, value] of filters) query = query.eq(column, value);
  if (status) query = query.eq("status", status);
  const result = await query;
  if (result.error) return NextResponse.json({ success: false, error: "Estimates could not be loaded." }, { status: 500 });
  try {
    const estimates = await Promise.all((result.data ?? []).map(async (estimate) => {
      const items = await supabase.from("estimate_line_items").select(STRUCTURED_ESTIMATE_ITEM_SELECT).eq("estimate_id", estimate.id).order("sort_order").order("id");
      if (items.error) throw new Error(items.error.message);
      return projectPersistedEstimate(estimate, calculatePersistedEstimate(estimate, items.data ?? []), auth.authorization!);
    }));
    return NextResponse.json({ success: true, estimates });
  } catch {
    return NextResponse.json({ success: false, error: "Estimates could not be loaded." }, { status: 500 });
  }
}
