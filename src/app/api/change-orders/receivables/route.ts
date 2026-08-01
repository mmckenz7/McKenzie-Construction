import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  createUnauthorizedApiResponse,
  getAuthenticatedApiUser,
} from "@/lib/api-auth";
import {
  createReceivablesResponse,
  getChangeOrderReportingErrorResponse,
  type ChangeOrderReceivableRow,
} from "@/lib/change-order-reporting-api";
import { createAdminServerClient } from "@/lib/supabase/admin-server";

export async function GET(
  request: NextRequest,
) {
  const authUser =
    await getAuthenticatedApiUser();

  if (!authUser) {
    return createUnauthorizedApiResponse(
      request,
    );
  }

  const supabase =
    createAdminServerClient();

  const { data, error } =
    await supabase.rpc(
      "get_company_change_order_receivables",
      {
        requested_auth_user_id:
          authUser.id,
      },
    );

  if (error) {
    const errorResponse =
      getChangeOrderReportingErrorResponse(
        error,
      );

    return NextResponse.json(
      errorResponse.body,
      {
        status: errorResponse.status,
      },
    );
  }

  const records =
    (data ?? []) as ChangeOrderReceivableRow[];

  const projectIds = [
    ...new Set(
      records
        .map(
          (record) =>
            record.project_id,
        )
        .filter(Boolean),
    ),
  ];

  const {
    data: projects,
    error: projectsError,
  } = projectIds.length
    ? await supabase
        .from("projects")
        .select("*")
        .in("id", projectIds)
    : {
        data: [],
        error: null,
      };

  if (projectsError) {
    return NextResponse.json(
      {
        success: false,
        error:
          projectsError.message,
      },
      {
        status: 500,
      },
    );
  }

  const projectNames =
    new Map(
      (projects ?? []).map(
        (project) => [
          project.id,
          project.name ??
            project.project_name ??
            project.title ??
            "Project",
        ],
      ),
    );

  return NextResponse.json(
    createReceivablesResponse(
      records,
      projectNames,
    ),
  );
}
