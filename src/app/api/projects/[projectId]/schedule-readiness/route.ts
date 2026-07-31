import { NextRequest, NextResponse } from "next/server";

import {
  createUnauthorizedApiResponse,
  getAuthenticatedApiUser,
} from "@/lib/api-auth";
import { createAdminServerClient } from "@/lib/supabase/admin-server";

type RouteContext = {
  params: Promise<{
    projectId: string;
  }>;
};

type UpdateBody = {
  hasDemo?: boolean;
  customerReady?: boolean;
  permitReady?: boolean;
  dumpsterReady?: boolean;
  siteAccessReady?: boolean;
  installerEarliestDemoStart?: string | null;
  installerEarliestConstructionStart?: string | null;
  expectedDemoDurationDays?: number | null;
  expectedTotalDurationDays?: number | null;
  confirmedMaterialDeliveryDate?: string | null;
  deliveryBufferWorkdays?: number;
  confirmedDemoStart?: string | null;
  confirmedConstructionStart?: string | null;
  scheduleStatus?: string;
  schedulingNotes?: string | null;
};

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function normalizeReadiness(
  record: Record<string, unknown>,
) {
  return {
    id: String(record.id ?? ""),
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
    expectedDemoDurationDays:
      typeof record.expected_demo_duration_days ===
      "number"
        ? record.expected_demo_duration_days
        : null,
    expectedTotalDurationDays:
      typeof record.expected_total_duration_days ===
      "number"
        ? record.expected_total_duration_days
        : null,
    confirmedMaterialDeliveryDate:
      record.confirmed_material_delivery_date
        ? String(
            record.confirmed_material_delivery_date,
          )
        : null,
    deliveryBufferWorkdays:
      typeof record.delivery_buffer_workdays ===
      "number"
        ? record.delivery_buffer_workdays
        : 1,
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
      record.schedule_status ?? "planning",
    ),
    schedulingNotes:
      record.scheduling_notes
        ? String(record.scheduling_notes)
        : null,
  };
}

export async function GET(
  request: NextRequest,
  context: RouteContext,
) {
  const authUser =
    await getAuthenticatedApiUser();

  if (!authUser) {
    return createUnauthorizedApiResponse(
      request,
    );
  }

  const { projectId } =
    await context.params;

  if (!isUuid(projectId)) {
    return NextResponse.json(
      {
        success: false,
        error: "Invalid project ID.",
      },
      {
        status: 400,
      },
    );
  }

  const supabase =
    createAdminServerClient();

  const { error: recalculateError } =
    await supabase.rpc(
      "recalculate_project_schedule",
      {
        requested_project_id:
          projectId,
      },
    );

  if (recalculateError) {
    return NextResponse.json(
      {
        success: false,
        error:
          recalculateError.message,
      },
      {
        status: 500,
      },
    );
  }

  const [
    readinessResult,
    phasesResult,
  ] = await Promise.all([
    supabase
      .from(
        "project_schedule_readiness",
      )
      .select("*")
      .eq("project_id", projectId)
      .single(),

    supabase
      .from(
        "project_material_phases",
      )
      .select("*")
      .eq("project_id", projectId)
      .order("phase_order", {
        ascending: true,
      }),
  ]);

  if (readinessResult.error) {
    return NextResponse.json(
      {
        success: false,
        error:
          readinessResult.error.message,
      },
      {
        status: 500,
      },
    );
  }

  if (phasesResult.error) {
    return NextResponse.json(
      {
        success: false,
        error:
          phasesResult.error.message,
      },
      {
        status: 500,
      },
    );
  }

  return NextResponse.json({
    success: true,
    readiness: normalizeReadiness(
      readinessResult.data as Record<
        string,
        unknown
      >,
    ),
    materialPhases:
      phasesResult.data ?? [],
  });
}

export async function PATCH(
  request: NextRequest,
  context: RouteContext,
) {
  const authUser =
    await getAuthenticatedApiUser();

  if (!authUser) {
    return createUnauthorizedApiResponse(
      request,
    );
  }

  const { projectId } =
    await context.params;

  if (!isUuid(projectId)) {
    return NextResponse.json(
      {
        success: false,
        error: "Invalid project ID.",
      },
      {
        status: 400,
      },
    );
  }

  let body: UpdateBody;

  try {
    body =
      (await request.json()) as UpdateBody;
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: "Invalid request body.",
      },
      {
        status: 400,
      },
    );
  }

  const updateData: Record<
    string,
    unknown
  > = {};

  const mappings: Array<
    [
      keyof UpdateBody,
      string,
    ]
  > = [
    ["hasDemo", "has_demo"],
    [
      "customerReady",
      "customer_ready",
    ],
    ["permitReady", "permit_ready"],
    [
      "dumpsterReady",
      "dumpster_ready",
    ],
    [
      "siteAccessReady",
      "site_access_ready",
    ],
    [
      "installerEarliestDemoStart",
      "installer_earliest_demo_start",
    ],
    [
      "installerEarliestConstructionStart",
      "installer_earliest_construction_start",
    ],
    [
      "expectedDemoDurationDays",
      "expected_demo_duration_days",
    ],
    [
      "expectedTotalDurationDays",
      "expected_total_duration_days",
    ],
    [
      "confirmedMaterialDeliveryDate",
      "confirmed_material_delivery_date",
    ],
    [
      "deliveryBufferWorkdays",
      "delivery_buffer_workdays",
    ],
    [
      "confirmedDemoStart",
      "confirmed_demo_start",
    ],
    [
      "confirmedConstructionStart",
      "confirmed_construction_start",
    ],
    [
      "scheduleStatus",
      "schedule_status",
    ],
    [
      "schedulingNotes",
      "scheduling_notes",
    ],
  ];

  for (const [bodyKey, column] of mappings) {
    if (body[bodyKey] !== undefined) {
      updateData[column] =
        body[bodyKey];
    }
  }

  const supabase =
    createAdminServerClient();

  const { error: upsertError } =
    await supabase
      .from(
        "project_schedule_readiness",
      )
      .upsert(
        {
          project_id: projectId,
          ...updateData,
        },
        {
          onConflict: "project_id",
        },
      );

  if (upsertError) {
    return NextResponse.json(
      {
        success: false,
        error: upsertError.message,
      },
      {
        status: 500,
      },
    );
  }

  const { data, error } =
    await supabase.rpc(
      "recalculate_project_schedule",
      {
        requested_project_id:
          projectId,
      },
    );

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

  return NextResponse.json({
    success: true,
    schedule: data,
  });
}
