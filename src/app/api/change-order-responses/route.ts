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
  value: unknown,
) {
  if (
    !value ||
    typeof value !== "object"
  ) {
    return null;
  }

  const record =
    value as Record<string, unknown>;

  return {
    id: String(record.id ?? ""),

    name: String(
      record.name ??
        record.project_name ??
        record.title ??
        "Project",
    ),

    address: String(
      record.address ??
        record.project_address ??
        record.job_address ??
        "",
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

  const { data, error } =
    await supabase
      .from(
        "project_change_order_responses",
      )
      .select(`
        *,
        projects (*)
      `)
      .order("submitted_at", {
        ascending: false,
      })
      .limit(500);

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

  const responses = (
    data ?? []
  ).map((record) => ({
    id: String(
      record.id ?? "",
    ),

    changeOrderId: String(
      record.change_order_id ?? "",
    ),

    projectId: String(
      record.project_id ?? "",
    ),

    response:
      record.response,

    customerName:
      record.customer_name,

    customerNotes:
      record.customer_notes,

    agreementText:
      record.agreement_text,

    acknowledgedTerms:
      record.acknowledged_terms ===
      true,

    submittedAt:
      record.submitted_at,

    changeOrderNumber: Number(
      record.change_order_number ?? 0,
    ),

    title:
      record.title,

    description:
      record.description,

    reason:
      record.reason,

    amount: Number(
      record.amount ?? 0,
    ),

    scheduleImpactDays: Number(
      record.schedule_impact_days ??
        0,
    ),

    customerNotesSnapshot:
      record.customer_notes_snapshot,

    project: normalizeProject(
      record.projects,
    ),
  }));

  return NextResponse.json({
    success: true,

    responses,

    summary: {
      total:
        responses.length,

      approved:
        responses.filter(
          (item) =>
            item.response ===
            "approved",
        ).length,

      declined:
        responses.filter(
          (item) =>
            item.response ===
            "declined",
        ).length,

      approvedRevenue:
        responses
          .filter(
            (item) =>
              item.response ===
              "approved",
          )
          .reduce(
            (total, item) =>
              total + item.amount,
            0,
          ),

      declinedRevenue:
        responses
          .filter(
            (item) =>
              item.response ===
              "declined",
          )
          .reduce(
            (total, item) =>
              total + item.amount,
            0,
          ),
    },
  });
}
