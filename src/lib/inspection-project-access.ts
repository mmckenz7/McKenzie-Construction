import "server-only";

import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  createUnauthorizedApiResponse,
  getAuthenticatedAccess,
} from "@/lib/api-auth";
import {
  canAccessInspectionProject,
  INSPECTION_PROJECT_FORBIDDEN_BODY,
} from "@/lib/inspection-task-dependencies";
import { createAdminServerClient } from "@/lib/supabase/admin-server";

export async function authorizeInspectionProjectRequest(
  request: NextRequest,
  projectId: string,
) {
  const access =
    await getAuthenticatedAccess();

  if (!access) {
    return {
      access: null,
      response:
        createUnauthorizedApiResponse(
          request,
        ),
    };
  }

  const supabase =
    createAdminServerClient();

  const { data, error } =
    await supabase
      .from("projects")
      .select("id, project_manager_id")
      .eq("id", projectId)
      .maybeSingle();

  if (error) {
    return {
      access: null,
      response: NextResponse.json(
        {
          success: false,
          error:
            "Project access could not be verified.",
        },
        {
          status: 500,
        },
      ),
    };
  }

  if (
    !canAccessInspectionProject(
      {
        teamMemberId:
          access.teamMember.id,
        roles:
          access.teamMember.roles,
      },
      data,
    )
  ) {
    return {
      access: null,
      response: NextResponse.json(
        INSPECTION_PROJECT_FORBIDDEN_BODY,
        {
          status: 403,
        },
      ),
    };
  }

  return {
    access,
    response: null,
  };
}
