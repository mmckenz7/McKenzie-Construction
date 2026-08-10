import {
  createForbiddenApiResponse,
  createUnauthorizedApiResponse,
  getAuthenticatedAccess,
  hasManagementAccess,
} from "@/lib/api-auth";
import { trustedCommunicationAutomationRequest } from "@/lib/communications/automation-auth";
import {
  MicrosoftInboxConfigurationError,
  syncMicrosoftInbox,
} from "@/lib/communications/microsoft-graph";
import { processCommunicationOutbox } from "@/lib/communications/processor";
import { createAdminServerClient } from "@/lib/supabase/admin-server";

async function authorize(request: Request) {
  if (trustedCommunicationAutomationRequest(request)) return null;
  const access = await getAuthenticatedAccess();
  if (!access) return createUnauthorizedApiResponse(request);
  if (!hasManagementAccess(access.teamMember.roles)) return createForbiddenApiResponse(request);
  return null;
}

async function run(request: Request) {
  const denied = await authorize(request);
  if (denied) return denied;

  const supabase = createAdminServerClient();
  const result: {
    outbox?: Awaited<ReturnType<typeof processCommunicationOutbox>>;
    inbox?: Awaited<ReturnType<typeof syncMicrosoftInbox>>;
    warnings: string[];
  } = { warnings: [] };

  try {
    result.outbox = await processCommunicationOutbox(supabase);
  } catch (error) {
    result.warnings.push(error instanceof Error ? error.message : "The communication outbox could not be processed.");
  }

  try {
    result.inbox = await syncMicrosoftInbox(supabase);
  } catch (error) {
    if (!(error instanceof MicrosoftInboxConfigurationError)) {
      result.warnings.push(error instanceof Error ? error.message : "Microsoft inbox synchronization failed.");
    }
  }

  return Response.json({ success: result.warnings.length === 0, ...result }, {
    status: result.warnings.length === 0 ? 200 : 207,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET(request: Request) {
  if (!trustedCommunicationAutomationRequest(request)) {
    return Response.json({ success: false, error: "Scheduler authorization is required." }, { status: 401 });
  }
  return run(request);
}

export async function POST(request: Request) {
  return run(request);
}
