import { NextResponse, type NextRequest } from "next/server";

import { createAuthenticatedServerClient } from "@/lib/supabase/server";

export async function getAuthenticatedApiUser() {
  const supabase = await createAuthenticatedServerClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  return user;
}

export function createUnauthorizedApiResponse(
  request: NextRequest | Request,
) {
  const acceptHeader = request.headers.get("accept") ?? "";
  const expectsHtml = acceptHeader.includes("text/html");

  if (expectsHtml) {
    const requestUrl = new URL(request.url);
    const originalPath = `${requestUrl.pathname}${requestUrl.search}`;

    const loginUrl = new URL("/login", requestUrl.origin);
    loginUrl.searchParams.set("next", originalPath);

    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.json(
    {
      success: false,
      error: "You must be signed in.",
    },
    {
      status: 401,
    },
  );
}