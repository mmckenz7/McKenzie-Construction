import { NextRequest, NextResponse } from "next/server";

import { authorizeEstimateRequest, ESTIMATE_NOT_FOUND_BODY } from "@/lib/estimate-access";
import { buildEstimateCustomerDocument } from "@/lib/estimate-customer-document";
import { calculateMutation, loadMutationState, UUID_PATTERN } from "@/lib/estimate-mutations";
import { getCompanyBranding } from "@/lib/company-branding";
import { loadDeckProposalDesign } from "@/lib/deck-proposal-design";
import { createAdminServerClient } from "@/lib/supabase/admin-server";

type RouteContext = { params: Promise<{ estimateId: string }> };

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function GET(request: NextRequest, context: RouteContext) {
  const { estimateId } = await context.params;
  if (!UUID_PATTERN.test(estimateId)) return NextResponse.json({ success: false, error: "Invalid estimate ID." }, { status: 400 });
  const auth = await authorizeEstimateRequest(request, estimateId);
  if (auth.response) return auth.response;
  try {
    const supabase = createAdminServerClient();
    const state = await loadMutationState(supabase, estimateId);
    if (!state) return NextResponse.json(ESTIMATE_NOT_FOUND_BODY, { status: 404 });
    const { calculation } = calculateMutation(state.estimate, state.items);
    const document = buildEstimateCustomerDocument(state, calculation);
    const customerId = text(state.estimate.customer_id);
    const leadId = text(state.estimate.lead_id);
    const [branding, companyResult, customerResult, leadResult, deckDesign] = await Promise.all([
      getCompanyBranding(),
      supabase.from("company_settings").select("company_phone, company_email, website_url").limit(1).maybeSingle(),
      customerId ? supabase.from("customers").select("customer_name").eq("id", customerId).maybeSingle() : Promise.resolve({ data: null, error: null }),
      !customerId && leadId ? supabase.from("leads").select("name").eq("id", leadId).maybeSingle() : Promise.resolve({ data: null, error: null }),
      loadDeckProposalDesign(supabase, auth.authorization!.companyId, estimateId),
    ]);
    if (companyResult.error || customerResult.error || leadResult.error) throw new Error("Customer document details could not be loaded.");
    const customerName = text(customerResult.data?.customer_name) ?? text(leadResult.data?.name) ?? "Customer";
    return NextResponse.json({
      success: true,
      document,
      deckDesign,
      customerName,
      company: {
        ...branding,
        phone: text(companyResult.data?.company_phone),
        email: text(companyResult.data?.company_email),
        websiteUrl: text(companyResult.data?.website_url),
      },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof TypeError ? error.message : "The customer estimate preview could not be generated.";
    return NextResponse.json({ success: false, error: message }, { status: error instanceof TypeError ? 422 : 500 });
  }
}
