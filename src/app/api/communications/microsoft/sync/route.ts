import {
  createForbiddenApiResponse,
  createUnauthorizedApiResponse,
  getAuthenticatedAccess,
  hasManagementAccess,
} from "@/lib/api-auth";
import {
  MicrosoftInboxConfigurationError,
  syncMicrosoftInbox,
} from "@/lib/communications/microsoft-graph";
import { trustedCommunicationAutomationRequest } from "@/lib/communications/automation-auth";
import { createAdminServerClient } from "@/lib/supabase/admin-server";

export async function POST(request: Request) {
  if (trustedCommunicationAutomationRequest(request)) {
    try {
      const result = await syncMicrosoftInbox(
        createAdminServerClient(),
      );
      return Response.json({ success: true, ...result });
    } catch (error) {
      const configurationError = error instanceof MicrosoftInboxConfigurationError;
      return Response.json({
        success: false,
        error: error instanceof Error ? error.message : "Microsoft inbox synchronization failed.",
      }, { status: configurationError ? 400 : 502 });
    }
  }

  const access = await getAuthenticatedAccess();

  if (!access) {
    return createUnauthorizedApiResponse(
      request,
    );
  }

  if (
    !hasManagementAccess(
      access.teamMember.roles,
    )
  ) {
    return createForbiddenApiResponse(request);
  }

  try {
    const result = await syncMicrosoftInbox(
      createAdminServerClient(),
    );

    return Response.json({
      success: true,
      ...result,
    });
  } catch (error) {
    const configurationError =
      error instanceof
      MicrosoftInboxConfigurationError;

    return Response.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Microsoft inbox synchronization failed.",
      },
      {
        status: configurationError
          ? 400
          : 502,
      },
    );
  }
}
