import {
  NextRequest,
  NextResponse,
} from "next/server";

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

type MaterialPhaseBody = {
  id?: string;
  phaseKey?: string;
  phaseName?: string;
  phaseOrder?: number;
  requiredForStart?: boolean;
  supplierName?: string | null;
  deliveryStatus?: string;
  estimatedDeliveryDate?: string | null;
  confirmedDeliveryDate?: string | null;
  deliveryBufferWorkdays?: number;
  notes?: string | null;
};

const allowedStatuses = new Set([
  "not_sent",
  "sent_for_quote",
  "quoted",
  "ordered",
  "scheduled",
  "delivered",
  "delayed",
  "cancelled",
]);

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function normalizePhase(
  record: Record<string, unknown>,
) {
  return {
    id: String(record.id ?? ""),
    projectId: String(
      record.project_id ?? "",
    ),
    phaseKey: String(
      record.phase_key ?? "",
    ),
    phaseName: String(
      record.phase_name ?? "",
    ),
    phaseOrder:
      typeof record.phase_order ===
      "number"
        ? record.phase_order
        : 1,
    requiredForStart:
      record.required_for_start === true,
    supplierName: record.supplier_name
      ? String(record.supplier_name)
      : null,
    deliveryStatus: String(
      record.delivery_status ??
        "not_sent",
    ),
    estimatedDeliveryDate:
      record.estimated_delivery_date
        ? String(
            record.estimated_delivery_date,
          )
        : null,
    confirmedDeliveryDate:
      record.confirmed_delivery_date
        ? String(
            record.confirmed_delivery_date,
          )
        : null,
    deliveryBufferWorkdays:
      typeof record.delivery_buffer_workdays ===
      "number"
        ? record.delivery_buffer_workdays
        : 1,
    calculatedReadyDate:
      record.calculated_ready_date
        ? String(
            record.calculated_ready_date,
          )
        : null,
    notes: record.notes
      ? String(record.notes)
      : null,
  };
}

async function authorize(
  request: NextRequest,
) {
  const authUser =
    await getAuthenticatedApiUser();

  if (!authUser) {
    return {
      authUser: null,
      response:
        createUnauthorizedApiResponse(
          request,
        ),
    };
  }

  return {
    authUser,
    response: null,
  };
}

export async function GET(
  request: NextRequest,
  context: RouteContext,
) {
  const authorization =
    await authorize(request);

  if (authorization.response) {
    return authorization.response;
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

  const { error: initializeError } =
    await supabase.rpc(
      "initialize_project_material_phases",
      {
        requested_project_id:
          projectId,
      },
    );

  if (initializeError) {
    return NextResponse.json(
      {
        success: false,
        error:
          initializeError.message,
      },
      {
        status: 500,
      },
    );
  }

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

  const { data, error } =
    await supabase
      .from(
        "project_material_phases",
      )
      .select("*")
      .eq("project_id", projectId)
      .order("phase_order", {
        ascending: true,
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

  return NextResponse.json({
    success: true,
    materialPhases: (
      data ?? []
    ).map((record) =>
      normalizePhase(
        record as Record<
          string,
          unknown
        >,
      ),
    ),
  });
}

export async function POST(
  request: NextRequest,
  context: RouteContext,
) {
  const authorization =
    await authorize(request);

  if (authorization.response) {
    return authorization.response;
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

  let body: MaterialPhaseBody;

  try {
    body =
      (await request.json()) as MaterialPhaseBody;
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

  if (
    !body.phaseKey?.trim() ||
    !body.phaseName?.trim()
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Phase key and phase name are required.",
      },
      {
        status: 400,
      },
    );
  }

  const supabase =
    createAdminServerClient();

  const { data, error } =
    await supabase
      .from(
        "project_material_phases",
      )
      .insert({
        project_id: projectId,
        phase_key:
          body.phaseKey.trim(),
        phase_name:
          body.phaseName.trim(),
        phase_order:
          body.phaseOrder ?? 1,
        required_for_start:
          body.requiredForStart ??
          false,
        supplier_name:
          body.supplierName ?? null,
        delivery_status:
          allowedStatuses.has(
            body.deliveryStatus ?? "",
          )
            ? body.deliveryStatus
            : "not_sent",
        estimated_delivery_date:
          body.estimatedDeliveryDate ??
          null,
        confirmed_delivery_date:
          body.confirmedDeliveryDate ??
          null,
        delivery_buffer_workdays:
          body.deliveryBufferWorkdays ??
          1,
        notes: body.notes ?? null,
      })
      .select("*")
      .single();

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

  await supabase.rpc(
    "recalculate_project_schedule",
    {
      requested_project_id:
        projectId,
    },
  );

  return NextResponse.json({
    success: true,
    materialPhase: normalizePhase(
      data as Record<string, unknown>,
    ),
  });
}

export async function PATCH(
  request: NextRequest,
  context: RouteContext,
) {
  const authorization =
    await authorize(request);

  if (authorization.response) {
    return authorization.response;
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

  let body: MaterialPhaseBody;

  try {
    body =
      (await request.json()) as MaterialPhaseBody;
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

  if (!body.id || !isUuid(body.id)) {
    return NextResponse.json(
      {
        success: false,
        error:
          "A valid material phase ID is required.",
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

  if (body.phaseName !== undefined) {
    updateData.phase_name =
      body.phaseName.trim();
  }

  if (body.phaseOrder !== undefined) {
    updateData.phase_order =
      body.phaseOrder;
  }

  if (
    body.requiredForStart !== undefined
  ) {
    updateData.required_for_start =
      body.requiredForStart;
  }

  if (body.supplierName !== undefined) {
    updateData.supplier_name =
      body.supplierName;
  }

  if (
    body.deliveryStatus !== undefined
  ) {
    if (
      !allowedStatuses.has(
        body.deliveryStatus,
      )
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Invalid delivery status.",
        },
        {
          status: 400,
        },
      );
    }

    updateData.delivery_status =
      body.deliveryStatus;
  }

  if (
    body.estimatedDeliveryDate !==
    undefined
  ) {
    updateData.estimated_delivery_date =
      body.estimatedDeliveryDate;
  }

  if (
    body.confirmedDeliveryDate !==
    undefined
  ) {
    updateData.confirmed_delivery_date =
      body.confirmedDeliveryDate;
  }

  if (
    body.deliveryBufferWorkdays !==
    undefined
  ) {
    updateData.delivery_buffer_workdays =
      body.deliveryBufferWorkdays;
  }

  if (body.notes !== undefined) {
    updateData.notes = body.notes;
  }

  const supabase =
    createAdminServerClient();

  const { data, error } =
    await supabase
      .from(
        "project_material_phases",
      )
      .update(updateData)
      .eq("id", body.id)
      .eq("project_id", projectId)
      .select("*")
      .single();

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

  const {
    data: schedule,
    error: scheduleError,
  } = await supabase.rpc(
    "recalculate_project_schedule",
    {
      requested_project_id:
        projectId,
    },
  );

  if (scheduleError) {
    return NextResponse.json(
      {
        success: false,
        error:
          scheduleError.message,
      },
      {
        status: 500,
      },
    );
  }

  return NextResponse.json({
    success: true,
    materialPhase: normalizePhase(
      data as Record<string, unknown>,
    ),
    schedule,
  });
}

export async function DELETE(
  request: NextRequest,
  context: RouteContext,
) {
  const authorization =
    await authorize(request);

  if (authorization.response) {
    return authorization.response;
  }

  const { projectId } =
    await context.params;

  const phaseId =
    request.nextUrl.searchParams.get(
      "phaseId",
    );

  if (
    !isUuid(projectId) ||
    !phaseId ||
    !isUuid(phaseId)
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Valid project and phase IDs are required.",
      },
      {
        status: 400,
      },
    );
  }

  const supabase =
    createAdminServerClient();

  const { error } = await supabase
    .from("project_material_phases")
    .delete()
    .eq("id", phaseId)
    .eq("project_id", projectId);

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

  await supabase.rpc(
    "recalculate_project_schedule",
    {
      requested_project_id:
        projectId,
    },
  );

  return NextResponse.json({
    success: true,
  });
}
