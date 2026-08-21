import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  createUnauthorizedApiResponse,
  getAuthenticatedApiUser,
} from "@/lib/api-auth";
import { createAdminServerClient } from "@/lib/supabase/admin-server";

function normalizeProject(
  record: Record<string, unknown>,
) {
  return {
    id: String(record.id ?? ""),
    name: String(
      record.name ??
        record.project_name ??
        record.title ??
        "Unnamed project",
    ),
    address: String(
      record.address ??
        record.project_address ??
        record.job_address ??
        "",
    ),
  };
}

function normalizeReadiness(
  record: Record<string, unknown>,
) {
  return {
    projectId: String(
      record.project_id ?? "",
    ),
    hasDemo:
      record.has_demo === true,
    customerReady:
      record.customer_ready === true,
    permitReady:
      record.permit_ready === true,
    dumpsterReady:
      record.dumpster_ready === true,
    siteAccessReady:
      record.site_access_ready === true,
    materialsNotRequired:
      record.materials_not_required === true,
    installerEarliestDemoStart:
      record.installer_earliest_demo_start
        ? String(
            record.installer_earliest_demo_start,
          )
        : null,
    installerEarliestConstructionStart:
      record.installer_earliest_construction_start
        ? String(
            record.installer_earliest_construction_start,
          )
        : null,
    calculatedMaterialSafeStart:
      record.calculated_material_safe_start
        ? String(
            record.calculated_material_safe_start,
          )
        : null,
    calculatedDemoStart:
      record.calculated_demo_start
        ? String(
            record.calculated_demo_start,
          )
        : null,
    calculatedConstructionStart:
      record.calculated_construction_start
        ? String(
            record.calculated_construction_start,
          )
        : null,
    confirmedDemoStart:
      record.confirmed_demo_start
        ? String(
            record.confirmed_demo_start,
          )
        : null,
    confirmedConstructionStart:
      record.confirmed_construction_start
        ? String(
            record.confirmed_construction_start,
          )
        : null,
    scheduleStatus: String(
      record.schedule_status ??
        "planning",
    ),
  };
}

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

  const { data: projects, error } =
    await supabase
      .from("projects")
      .select("*")
      .order("created_at", {
        ascending: false,
      });

  if (error) {
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      {
        status: 500,
      },
    );
  }

  const projectRecords =
    projects ?? [];

  for (const project of projectRecords) {
    await supabase.rpc(
      "recalculate_project_schedule",
      {
        requested_project_id:
          project.id,
      },
    );
  }

  const { data: readinessRows, error: readinessError } =
    await supabase
      .from(
        "project_schedule_readiness",
      )
      .select("*");

  if (readinessError) {
    return NextResponse.json(
      {
        success: false,
        error:
          readinessError.message,
      },
      {
        status: 500,
      },
    );
  }

  const readinessByProject =
    new Map(
      (readinessRows ?? []).map(
        (record) => {
          const normalized =
            normalizeReadiness(
              record as Record<
                string,
                unknown
              >,
            );

          return [
            normalized.projectId,
            normalized,
          ];
        },
      ),
    );

  return NextResponse.json({
    success: true,
    projects: projectRecords.map(
      (record) => {
        const project =
          normalizeProject(
            record as Record<
              string,
              unknown
            >,
          );

        return {
          ...project,
          readiness:
            readinessByProject.get(
              project.id,
            ) ?? null,
        };
      },
    ),
  });
}
