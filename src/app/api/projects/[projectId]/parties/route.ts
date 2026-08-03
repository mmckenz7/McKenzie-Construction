import { getAuthenticatedApiUser, createUnauthorizedApiResponse } from "@/lib/api-auth";
import { createAdminServerClient } from "@/lib/supabase/admin-server";
import { reconcileProjectNextActions } from "@/lib/projects/reconcile-next-actions";

type Context = { params: Promise<{ projectId: string }> };
const partyTypes = new Set(["subcontractor", "vendor"]);
const workflows = new Set(["schedule", "bid", "material", "vendor"]);
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";

export async function GET(request: Request, context: Context) {
  if (!await getAuthenticatedApiUser()) return createUnauthorizedApiResponse(request);
  const { projectId } = await context.params;
  const supabase = createAdminServerClient();
  const { data, error } = await supabase.from("project_parties").select("*").eq("project_id", projectId).eq("is_active", true).order("name");
  return error ? Response.json({ error: error.message }, { status: 500 }) : Response.json({ success: true, parties: data ?? [] });
}

export async function POST(request: Request, context: Context) {
  const user = await getAuthenticatedApiUser();
  if (!user) return createUnauthorizedApiResponse(request);
  const { projectId } = await context.params;
  const body = await request.json() as Record<string, unknown>;
  const partyType = text(body.partyType), name = text(body.name), tradeRole = text(body.tradeRole);
  if (!partyTypes.has(partyType) || !name || !tradeRole) return Response.json({ error: "Type, company name, and trade or role are required." }, { status: 400 });
  const selectedWorkflows = Array.isArray(body.workflows) ? body.workflows.filter((item): item is string => typeof item === "string" && workflows.has(item)) : [];
  const supplierId = text(body.supplierId) || null;
  const supabase = createAdminServerClient();
  const { data, error } = await supabase.from("project_parties").insert({
    project_id: projectId, party_type: partyType, supplier_id: supplierId, name, trade_role: tradeRole,
    contact_name: text(body.contactName) || null, contact_email: text(body.contactEmail) || null,
    contact_phone: text(body.contactPhone) || null, workflow_permissions: selectedWorkflows, created_by: user.id,
  }).select("*").single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  const [projectResult, partiesResult, phaseCount] = await Promise.all([
    supabase.from("projects").select("*").eq("id", projectId).single(),
    supabase.from("project_parties").select("party_type, workflow_permissions").eq("project_id", projectId).eq("is_active", true),
    supabase.from("project_material_phases").select("id", { count: "exact", head: true }).eq("project_id", projectId),
  ]);
  if (projectResult.data) await reconcileProjectNextActions(supabase, {
    id: projectId, customerId: projectResult.data.customer_id, projectName: projectResult.data.project_name,
    status: projectResult.data.status, projectType: projectResult.data.project_type, description: projectResult.data.description,
    propertyAddress: projectResult.data.property_address, projectManagerId: projectResult.data.project_manager_id,
    estimatedValue: projectResult.data.estimated_value, contractValue: projectResult.data.contract_value,
    startDate: projectResult.data.start_date, targetCompletionDate: projectResult.data.target_completion_date,
    externalPartyCount: partiesResult.data?.length ?? 0,
    subcontractorScheduleEligible: Boolean(partiesResult.data?.some((party) => party.party_type === "subcontractor" && party.workflow_permissions?.includes("schedule"))),
    vendorBidEligible: Boolean(partiesResult.data?.some((party) => party.party_type === "vendor" && party.workflow_permissions?.includes("bid"))),
    materialPhaseCount: phaseCount.count ?? 0, hasOpenChangeOrder: false,
  });
  return Response.json({ success: true, party: data }, { status: 201 });
}
