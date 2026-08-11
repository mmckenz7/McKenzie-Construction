import { NextRequest, NextResponse } from "next/server";

import { createDocusignEnvelope, DocusignConfigurationError } from "@/lib/contracts/docusign";
import { authorizeEstimateRequest } from "@/lib/estimate-access";
import { UUID_PATTERN } from "@/lib/estimate-mutations";
import { createAdminServerClient } from "@/lib/supabase/admin-server";

type RouteContext = { params: Promise<{ estimateId: string }> };
type Claim = { contract_preparation_id?: unknown; attempt_id?: unknown; recipient_name?: unknown; recipient_email?: unknown };

export async function POST(request: NextRequest, context: RouteContext) {
  const { estimateId } = await context.params;
  if (!UUID_PATTERN.test(estimateId)) {
    return NextResponse.json({ success: false, error: "Invalid estimate ID." }, { status: 400 });
  }
  const auth = await authorizeEstimateRequest(request, estimateId);
  if (auth.response) return auth.response;
  if (!auth.authorization!.canSendProposals) {
    return NextResponse.json({ success: false, error: "You do not have permission to send customer contracts." }, { status: 403 });
  }

  const supabase = createAdminServerClient();
  const preparation = await supabase.from("estimate_contract_preparations")
    .select("id").eq("estimate_id", estimateId).maybeSingle();
  if (preparation.error || !preparation.data) {
    return NextResponse.json({ success: false, error: "Contract preparation was not found." }, { status: 404 });
  }

  const claimed = await supabase.rpc("claim_estimate_contract_signature_send", {
    requested_contract_preparation_id: preparation.data.id,
    requested_app_user_id: auth.authorization!.appUserId,
  });
  if (claimed.error || !claimed.data || typeof claimed.data !== "object") {
    return NextResponse.json({ success: false, error: "The contract is not ready for signature." }, { status: 409 });
  }
  const claim = claimed.data as Claim;
  const preparationId = String(claim.contract_preparation_id ?? "");
  const attemptId = String(claim.attempt_id ?? "");

  try {
    const envelope = await createDocusignEnvelope({
      contractPreparationId: preparationId,
      recipient: {
        name: String(claim.recipient_name ?? ""),
        email: String(claim.recipient_email ?? ""),
      },
      emailSubject: "McKenzie Construction contract for electronic signature",
    });
    const finalized = await supabase.rpc("complete_estimate_contract_signature_send", {
      requested_contract_preparation_id: preparationId,
      requested_attempt_id: attemptId,
      requested_envelope_id: envelope.envelopeId,
    });
    if (finalized.error) {
      return NextResponse.json({ success: false, error: "DocuSign accepted the envelope, but its local status requires review." }, { status: 502 });
    }
    return NextResponse.json({ success: true, status: envelope.status });
  } catch (error) {
    await supabase.rpc("release_estimate_contract_signature_send", {
      requested_contract_preparation_id: preparationId,
      requested_attempt_id: attemptId,
      requested_error_code: error instanceof DocusignConfigurationError ? error.code : "provider_send_failed",
    });
    const status = error instanceof DocusignConfigurationError ? 503 : 502;
    return NextResponse.json({
      success: false,
      error: error instanceof DocusignConfigurationError ? error.message : "DocuSign could not send the contract.",
    }, { status });
  }
}
