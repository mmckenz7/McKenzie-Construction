import { normalizeDocusignConnectEvent } from "@/lib/contracts/docusign-connect";
import { verifyDocusignConnectSignature } from "@/lib/contracts/docusign";
import { createAdminServerClient } from "@/lib/supabase/admin-server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const rawBody = await request.text();
  if (!verifyDocusignConnectSignature(rawBody, request.headers.get("x-docusign-signature-1"))) {
    return Response.json({ success: false, error: "The DocuSign webhook signature is invalid." }, { status: 401 });
  }
  const event = normalizeDocusignConnectEvent(rawBody);
  if (!event) return Response.json({ success: true, ignored: true });

  const result = await createAdminServerClient().rpc("record_docusign_contract_event", {
    requested_contract_preparation_id: event.contractPreparationId,
    requested_provider_event_id: event.eventId,
    requested_envelope_id: event.envelopeId,
    requested_event_type: event.eventType,
    requested_occurred_at: event.occurredAt,
    requested_payload_sha256: event.payloadSha256,
    requested_metadata: event.metadata,
  });
  if (result.error) {
    return Response.json({ success: false, error: "The DocuSign event could not be recorded." }, { status: 500 });
  }
  return Response.json({ success: true, result: result.data });
}
