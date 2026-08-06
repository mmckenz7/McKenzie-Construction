import { NextResponse } from "next/server";

import {
  betaDiagnosticIsAvailable,
  runBetaSupabaseDiagnostic,
} from "@/lib/beta-supabase-diagnostic";
import { createAdminServerClient } from "@/lib/supabase/admin-server";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!betaDiagnosticIsAvailable()) {
    return new NextResponse(null, {
      status: 404,
    });
  }

  const diagnostic =
    await runBetaSupabaseDiagnostic();

  const supabase =
    createAdminServerClient();
  const authUserId =
    "c4b7658f-1a7e-4eb8-b386-ea00f033a8dc";
  const email = "info@mckenzie-builds.com";

  const [
    teamMemberResult,
    appUserResult,
    effectiveAccessResult,
  ] = await Promise.all([
    supabase
      .from("team_members")
      .select(
        "auth_user_id, email, status, roles",
      )
      .or(
        `auth_user_id.eq.${authUserId},email.ilike.${email}`,
      ),
    supabase
      .from("app_users")
      .select("auth_user_id")
      .eq("auth_user_id", authUserId),
    supabase.rpc(
      "get_effective_user_access",
      {
        requested_auth_user_id:
          authUserId,
      },
    ),
  ]);

  const teamMembers = Array.isArray(
    teamMemberResult.data,
  )
    ? teamMemberResult.data
    : [];
  const linkedTeamMember = teamMembers.find(
    (member) =>
      member.auth_user_id === authUserId,
  );
  const emailOnlyTeamMember = teamMembers.find(
    (member) =>
      typeof member.email === "string" &&
      member.email.toLowerCase() === email &&
      member.auth_user_id !== authUserId,
  );
  const linkedRoles = Array.isArray(
    linkedTeamMember?.roles,
  )
    ? linkedTeamMember.roles.filter(
        (role): role is string =>
          typeof role === "string",
      )
    : [];
  const effectiveAccess =
    effectiveAccessResult.data &&
    typeof effectiveAccessResult.data ===
      "object"
      ? (effectiveAccessResult.data as Record<
          string,
          unknown
        >)
      : null;
  const portalAccess =
    effectiveAccess?.portal_access &&
    typeof effectiveAccess.portal_access ===
      "object"
      ? (effectiveAccess.portal_access as Record<
          string,
          unknown
        >)
      : {};
  const permissions =
    effectiveAccess?.permissions &&
    typeof effectiveAccess.permissions ===
      "object"
      ? (effectiveAccess.permissions as Record<
          string,
          unknown
        >)
      : {};

  return NextResponse.json({
    ...diagnostic,
    userAccess: {
      teamMemberQuery:
        teamMemberResult.error
          ? "ERROR"
          : "OK",
      linkedTeamMember:
        linkedTeamMember
          ? "FOUND"
          : "MISSING",
      emailOnlyTeamMember:
        emailOnlyTeamMember
          ? "FOUND"
          : "MISSING",
      teamMemberStatus:
        typeof linkedTeamMember?.status ===
        "string"
          ? linkedTeamMember.status
          : "UNKNOWN",
      roles: linkedRoles,
      appUserQuery: appUserResult.error
        ? "ERROR"
        : "OK",
      appUser:
        Array.isArray(appUserResult.data) &&
        appUserResult.data.length > 0
          ? "FOUND"
          : "MISSING",
      effectiveAccessQuery:
        effectiveAccessResult.error
          ? "ERROR"
          : "OK",
      effectiveAccess:
        effectiveAccess
          ? "FOUND"
          : "MISSING",
      salesAccess:
        portalAccess.sales === true,
      editPrices:
        permissions.edit_prices === true,
      viewCosts:
        permissions.view_costs === true,
      viewProfit:
        permissions.view_profit === true,
    },
  }, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
