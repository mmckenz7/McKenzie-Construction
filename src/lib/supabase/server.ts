import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

type AuthenticatedServerClientOptions = {
  trustDevice?: boolean;
};

export async function createAuthenticatedServerClient(
  options: AuthenticatedServerClientOptions = {},
) {
  const cookieStore = await cookies();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabasePublishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
    );
  }

  const trustDevice = options.trustDevice ?? true;

  return createServerClient(
    supabaseUrl,
    supabasePublishableKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },

        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(
              ({ name, value, options: cookieOptions }) => {
                const finalOptions = trustDevice
                  ? cookieOptions
                  : {
                      ...cookieOptions,
                      expires: undefined,
                      maxAge: undefined,
                    };

                cookieStore.set(name, value, finalOptions);
              },
            );
          } catch {
            // Server Components cannot always write cookies.
            // The proxy handles session refreshes.
          }
        },
      },
    },
  );
}