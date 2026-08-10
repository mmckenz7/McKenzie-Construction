import {
  createForbiddenApiResponse,
  createUnauthorizedApiResponse,
  getAuthenticatedAccess,
  hasManagementAccess,
} from "@/lib/api-auth";
import { trustedCommunicationAutomationRequest } from "@/lib/communications/automation-auth";
import { processCommunicationOutbox } from "@/lib/communications/processor";
import { createAdminServerClient } from "@/lib/supabase/admin-server";

async function authorize(request: Request) {
  if (trustedCommunicationAutomationRequest(request)) return null;
  const access = await getAuthenticatedAccess();
  if (!access) return createUnauthorizedApiResponse(request);
  if (!hasManagementAccess(access.teamMember.roles)) return createForbiddenApiResponse(request);
  return null;
}

export async function POST(request: Request) {
  const denied = await authorize(request);
  if (denied) return denied;

  try {
    return Response.json({
      success: true,
      ...await processCommunicationOutbox(createAdminServerClient()),
    });
  } catch (error) {
    return Response.json({
      success: false,
      error: error instanceof Error ? error.message : "The communication outbox could not be processed.",
    }, { status: 500 });
  }
}
