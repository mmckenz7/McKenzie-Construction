import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import { recoverySessionCookie } from "@/lib/auth/recovery";
import { createAuthenticatedServerClient } from "@/lib/supabase/server";

function invalidRecoveryResponse(request: NextRequest) {
  return NextResponse.redirect(
    new URL("/reset-password?error=invalid-link", request.url),
  );
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");

  if (!code) {
    return invalidRecoveryResponse(request);
  }

  const supabase = await createAuthenticatedServerClient({
    trustDevice: false,
  });
  let isRecoveryExchange = false;
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((event) => {
    if (event === "PASSWORD_RECOVERY") {
      isRecoveryExchange = true;
    }
  });

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  subscription.unsubscribe();

  if (error || !isRecoveryExchange) {
    await supabase.auth.signOut();
    return invalidRecoveryResponse(request);
  }

  const cookieStore = await cookies();
  cookieStore.set(recoverySessionCookie, "active", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 15,
  });

  return NextResponse.redirect(new URL("/reset-password", request.url));
}
