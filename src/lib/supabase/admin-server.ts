import "server-only";

import { createClient } from "@supabase/supabase-js";

export function createAdminServerClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL in the .env.local file.",
    );
  }

  if (!secretKey) {
    throw new Error(
      "Missing SUPABASE_SERVICE_ROLE_KEY in the .env.local file.",
    );
  }

  return createClient(supabaseUrl, secretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}