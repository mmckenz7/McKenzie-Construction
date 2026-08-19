import { NextRequest, NextResponse } from "next/server";

import {
  getMaterialCatalogAuthorizationDecision,
  getMaterialCatalogMutationAuthorizationDecision,
} from "@/lib/material-catalog-access";
import { createAdminServerClient } from "@/lib/supabase/admin-server";

const COST_TYPES = new Set([
  "material",
  "labor",
  "subcontractor",
  "equipment",
  "other",
]);
const QUANTITY_BASES = new Set([
  "fixed_each",
  "per_linear_foot",
  "per_square_foot",
  "per_count",
  "manual_review",
]);
const STATUSES = new Set(["draft", "active", "retired"]);
const KEY_PATTERN = /^[a-z0-9][a-z0-9_-]{1,63}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ComponentInput = Readonly<{
  componentKey: string;
  label: string;
  costType: string;
  materialCatalogId: string | null;
  quantityBasis: string;
  quantityFactor: number | null;
  unit: string;
  wastePercent: number;
  required: boolean;
  compatibilityGroup: string;
  sourceNotes: string;
  sortOrder: number;
}>;

function noStore(response: NextResponse) {
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function accessResponse(state: string) {
  const status = state === "unauthorized" ? 401 : state.includes("unavailable") ? 503 : 403;
  return noStore(NextResponse.json({
    success: false,
    error: state === "unauthorized"
      ? "Sign in to use estimating assemblies."
      : "Estimating assembly access is unavailable.",
  }, { status }));
}

function textValue(value: unknown, maximum: number) {
  if (typeof value !== "string") return null;
  const result = value.trim();
  return result && result.length <= maximum ? result : null;
}

function optionalText(value: unknown, maximum: number) {
  if (value === null || value === undefined || value === "") return "";
  return textValue(value, maximum);
}

function finiteNumber(value: unknown, minimum: number, maximum: number) {
  const result = typeof value === "number" ? value : Number(value);
  return Number.isFinite(result) && result >= minimum && result <= maximum
    ? result
    : null;
}

function parseComponent(value: unknown, sortOrder: number): ComponentInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const componentKey = textValue(input.componentKey, 64);
  const label = textValue(input.label, 160);
  const costType = textValue(input.costType, 30);
  const quantityBasis = textValue(input.quantityBasis, 40);
  const unit = textValue(input.unit, 40);
  const wastePercent = finiteNumber(input.wastePercent ?? 0, 0, 100);
  const compatibilityGroup = optionalText(input.compatibilityGroup, 80);
  const sourceNotes = optionalText(input.sourceNotes, 1000);
  const materialCatalogId = input.materialCatalogId === null || input.materialCatalogId === ""
    ? null
    : typeof input.materialCatalogId === "string" && UUID_PATTERN.test(input.materialCatalogId)
      ? input.materialCatalogId
      : undefined;
  const quantityFactor = quantityBasis === "manual_review"
    ? null
    : finiteNumber(input.quantityFactor, 0.000001, 1_000_000);

  if (!componentKey || !KEY_PATTERN.test(componentKey) || !label || !costType ||
    !COST_TYPES.has(costType) || !quantityBasis || !QUANTITY_BASES.has(quantityBasis) ||
    !unit || wastePercent === null || compatibilityGroup === null || sourceNotes === null ||
    materialCatalogId === undefined || (costType === "material") !== Boolean(materialCatalogId) ||
    (quantityBasis !== "manual_review" && quantityFactor === null)) return null;

  return {
    componentKey,
    label,
    costType,
    materialCatalogId,
    quantityBasis,
    quantityFactor,
    unit,
    wastePercent,
    required: input.required !== false,
    compatibilityGroup,
    sourceNotes,
    sortOrder,
  };
}

export async function GET() {
  const decision = await getMaterialCatalogAuthorizationDecision("view_supplier_comparisons");
  if (decision.state !== "authorized") return accessResponse(decision.state);
  const supabase = createAdminServerClient();
  const result = await supabase
    .from("estimating_assemblies")
    .select(`
      id, assembly_key, name, trade_code, description, status, row_revision,
      created_at, updated_at,
      estimating_assembly_components (
        id, component_key, label, cost_type, material_catalog_id,
        quantity_basis, quantity_factor, unit, waste_percent, required,
        compatibility_group, source_notes, sort_order,
        material_catalog (id, sku, description, brand, product_line, unit, unit_cost, waste_percent, is_active)
      )
    `)
    .eq("company_id", decision.authorization.companyId)
    .order("name", { ascending: true });
  if (result.error) return noStore(NextResponse.json({ success: false, error: "Assemblies could not be loaded." }, { status: 500 }));
  return noStore(NextResponse.json({ success: true, assemblies: result.data ?? [] }));
}

export async function POST(request: NextRequest) {
  const decision = await getMaterialCatalogMutationAuthorizationDecision("edit_catalog");
  if (decision.state !== "authorized") return accessResponse(decision.state);

  let body: Record<string, unknown>;
  try {
    const parsed = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    body = parsed as Record<string, unknown>;
  } catch {
    return noStore(NextResponse.json({ success: false, error: "Enter a valid assembly." }, { status: 400 }));
  }

  const id = body.id === null || body.id === undefined || body.id === ""
    ? null
    : typeof body.id === "string" && UUID_PATTERN.test(body.id) ? body.id : undefined;
  const expectedRevision = id ? finiteNumber(body.expectedRevision, 1, 1_000_000_000) : null;
  const assemblyKey = textValue(body.assemblyKey, 64);
  const name = textValue(body.name, 120);
  const tradeCode = textValue(body.tradeCode, 40);
  const description = optionalText(body.description, 1000);
  const status = textValue(body.status, 20);
  const inputs = Array.isArray(body.components) ? body.components : [];
  const components = inputs.map(parseComponent);
  const keys = components.map((component) => component?.componentKey);

  if (id === undefined || (id && expectedRevision === null) || !assemblyKey ||
    !KEY_PATTERN.test(assemblyKey) || !name || !tradeCode || description === null ||
    !status || !STATUSES.has(status) || inputs.length < 1 || inputs.length > 50 ||
    components.some((component) => !component) || new Set(keys).size !== keys.length) {
    return noStore(NextResponse.json({ success: false, error: "Complete the assembly and every component before saving." }, { status: 400 }));
  }

  const supabase = createAdminServerClient();
  const result = await supabase.rpc("save_estimating_assembly", {
    requested_auth_user_id: decision.authorization.authUserId,
    requested_company_id: decision.authorization.companyId,
    requested_assembly_id: id,
    requested_expected_revision: expectedRevision,
    requested_assembly_key: assemblyKey,
    requested_name: name,
    requested_trade_code: tradeCode,
    requested_description: description || null,
    requested_status: status,
    requested_components: components,
  });
  if (result.error) {
    const conflict = result.error.message.includes("changed") || result.error.message.includes("duplicate");
    return noStore(NextResponse.json({ success: false, error: conflict ? "This assembly changed or its key is already used. Reload and try again." : "The assembly could not be saved." }, { status: conflict ? 409 : 500 }));
  }
  return noStore(NextResponse.json({ success: true, assembly: result.data }));
}
