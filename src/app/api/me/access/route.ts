import { NextRequest, NextResponse } from "next/server";

import {
  createUnauthorizedApiResponse,
} from "@/lib/api-auth";
import { createAdminServerClient } from "@/lib/supabase/admin-server";
import { createAuthenticatedServerClient } from "@/lib/supabase/server";

export async function GET(
  request: NextRequest,
) {
  const authenticatedSupabase =
    await createAuthenticatedServerClient();

  const {
    data: { user: authUser },
    error: authError,
  } = await authenticatedSupabase.auth.getUser();

  if (authError || !authUser) {
    return createUnauthorizedApiResponse(
      request,
    );
  }

  const supabase =
    createAdminServerClient();

  const {
    data: teamMember,
    error: teamMemberError,
  } = await supabase
    .from("team_members")
    .select("id, status, roles")
    .eq("auth_user_id", authUser.id)
    .maybeSingle();

  const roles = Array.isArray(
    teamMember?.roles,
  )
    ? teamMember.roles.filter(
        (role): role is string =>
          typeof role === "string" &&
          role.trim().length > 0,
      )
    : [];

  if (
    teamMemberError ||
    !teamMember ||
    teamMember.status !== "active" ||
    roles.length === 0
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Your login is valid, but it is not linked to an active employee role.",
        needsProfile: true,
      },
      {
        status: 403,
      },
    );
  }

  const {
    data,
    error,
  } = await supabase.rpc(
    "get_effective_user_access",
    {
      requested_auth_user_id:
        authUser.id,
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

  if (!data) {
    return NextResponse.json(
      {
        success: false,
        error:
          "No active application profile is connected to this login.",
        needsProfile: true,
      },
      {
        status: 403,
      },
    );
  }

  return NextResponse.json({
    success: true,
    access: data,
  });
}
