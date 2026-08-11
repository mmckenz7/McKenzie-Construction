import { NextResponse } from "next/server";

import {
  createForbiddenApiResponse,
  createUnauthorizedApiResponse,
  getAuthenticatedAccess,
  hasManagementAccess,
} from "@/lib/api-auth";
import {
  compareMissionControlSignals,
  MISSION_CONTROL_ACTIONABLE_STATUSES,
  MISSION_CONTROL_SIGNAL_SEVERITIES,
  MISSION_CONTROL_V0_RULE_KEYS,
  parseMissionControlFeedLimit,
  toMissionControlSignalResponse,
  type MissionControlSignalRow,
} from "@/lib/mission-control/signal-feed";
import { createAdminServerClient } from "@/lib/supabase/admin-server";

const SIGNAL_SELECT = `
  id,
  rule_key,
  rule_version,
  subject_type,
  subject_id,
  status,
  severity,
  first_detected_at,
  last_evaluated_at,
  due_at,
  assigned_to_id,
  acknowledged_at,
  snoozed_until,
  evidence,
  rule_output,
  updated_at
`;

export async function GET(request: Request) {
  const access =
    await getAuthenticatedAccess();

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
    return createForbiddenApiResponse(
      request,
    );
  }

  const requestUrl = new URL(request.url);
  const limit = parseMissionControlFeedLimit(
    requestUrl.searchParams.get("limit"),
  );

  if (limit === null) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Mission Control limit must be an integer from 1 to 100.",
      },
      { status: 400 },
    );
  }

  const supabase =
    createAdminServerClient();
  const companyResult = await supabase
    .from("company_settings")
    .select("id")
    .limit(2);

  if (companyResult.error) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Mission Control company scope could not be verified.",
      },
      { status: 503 },
    );
  }

  if (companyResult.data?.length !== 1) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Exactly one company must be configured before Mission Control signals can be read.",
      },
      { status: 409 },
    );
  }

  const companyId = String(
    companyResult.data[0].id,
  );
  const asOf = new Date().toISOString();

  const results = await Promise.all(
    MISSION_CONTROL_SIGNAL_SEVERITIES.map(
      (severity) =>
        supabase
          .from("mission_control_signals")
          .select(SIGNAL_SELECT)
          .eq("company_id", companyId)
          .eq("severity", severity)
          .in(
            "rule_key",
            [...MISSION_CONTROL_V0_RULE_KEYS],
          )
          .in(
            "status",
            [
              ...MISSION_CONTROL_ACTIONABLE_STATUSES,
            ],
          )
          .or(
            `status.neq.snoozed,snoozed_until.lte.${asOf}`,
          )
          .order("due_at", {
            ascending: true,
            nullsFirst: false,
          })
          .order("first_detected_at", {
            ascending: true,
          })
          .order("id", {
            ascending: true,
          })
          .limit(limit),
    ),
  );

  const queryError = results.find(
    (result) => result.error,
  )?.error;

  if (queryError) {
    return NextResponse.json(
      {
        success: false,
        code:
          "mission_control_schema_unavailable",
        error:
          "Mission Control signals are not currently available.",
      },
      { status: 503 },
    );
  }

  const signals = results
    .flatMap(
      (result) =>
        (result.data ?? []) as MissionControlSignalRow[],
    )
    .sort(compareMissionControlSignals)
    .slice(0, limit)
    .map(toMissionControlSignalResponse);

  return NextResponse.json(
    {
      success: true,
      asOf,
      signals,
    },
    {
      headers: {
        "Cache-Control": "private, no-store",
      },
    },
  );
}
