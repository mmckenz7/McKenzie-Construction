import {
  NextResponse,
  type NextRequest,
} from "next/server";
import type { User } from "@supabase/supabase-js";

import { createAdminServerClient } from "@/lib/supabase/admin-server";
import { createAuthenticatedServerClient } from "@/lib/supabase/server";

export type AuthenticatedTeamMember = {
  id: string;
  name: string;
  email: string | null;
  roles: string[];
  status: string;
};

export type AuthenticatedAccess = {
  user: User;
  teamMember: AuthenticatedTeamMember;
};

export async function getAuthenticatedAccess(): Promise<
  AuthenticatedAccess | null
> {
  const supabase =
    await createAuthenticatedServerClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return null;
  }

  const adminSupabase =
    createAdminServerClient();

  const {
    data: teamMember,
    error: teamMemberError,
  } = await adminSupabase
    .from("team_members")
    .select(
      `
        id,
        name,
        email,
        roles,
        status
      `,
    )
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (
    teamMemberError ||
    !teamMember ||
    teamMember.status !== "active"
  ) {
    return null;
  }

  const roles = Array.isArray(
    teamMember.roles,
  )
    ? teamMember.roles.filter(
        (role): role is string =>
          typeof role === "string" &&
          role.trim().length > 0,
      )
    : [];

  if (roles.length === 0) {
    return null;
  }

  return {
    user,
    teamMember: {
      id: String(teamMember.id),
      name: String(teamMember.name),
      email:
        typeof teamMember.email ===
        "string"
          ? teamMember.email
          : null,
      roles,
      status: String(
        teamMember.status,
      ),
    },
  };
}

export async function getAuthenticatedApiUser() {
  const access =
    await getAuthenticatedAccess();

  return access?.user ?? null;
}

export function createUnauthorizedApiResponse(
  request: NextRequest | Request,
) {
  const acceptHeader =
    request.headers.get("accept") ?? "";

  const expectsHtml =
    acceptHeader.includes("text/html");

  if (expectsHtml) {
    const requestUrl = new URL(
      request.url,
    );

    const originalPath =
      `${requestUrl.pathname}${requestUrl.search}`;

    const loginUrl = new URL(
      "/login",
      requestUrl.origin,
    );

    loginUrl.searchParams.set(
      "next",
      originalPath,
    );

    return NextResponse.redirect(
      loginUrl,
    );
  }

  return NextResponse.json(
    {
      success: false,
      error:
        "You must be signed in with an active employee account.",
    },
    {
      status: 401,
    },
  );
}
