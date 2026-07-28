import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);

  requestHeaders.set(
    "x-pathname",
    request.nextUrl.pathname,
  );

  requestHeaders.set(
    "x-search-params",
    request.nextUrl.searchParams.toString(),
  );

  let response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabasePublishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
    );
  }

  const trustDevice =
    request.cookies.get("mckenzie-trust-device")?.value !== "false";

  const supabase = createServerClient(
    supabaseUrl,
    supabasePublishableKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },

        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });

          response = NextResponse.next({
            request: {
              headers: requestHeaders,
            },
          });

          cookiesToSet.forEach(
            ({ name, value, options: cookieOptions }) => {
              const finalOptions = trustDevice
                ? cookieOptions
                : {
                    ...cookieOptions,
                    expires: undefined,
                    maxAge: undefined,
                  };

              response.cookies.set(
                name,
                value,
                finalOptions,
              );
            },
          );
        },
      },
    },
  );

  await supabase.auth.getClaims();

  return response;
}