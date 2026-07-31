import { NextRequest, NextResponse } from "next/server";

import {
  createUnauthorizedApiResponse,
  getAuthenticatedApiUser,
} from "@/lib/api-auth";
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
