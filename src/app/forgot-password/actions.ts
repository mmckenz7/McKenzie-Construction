"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getRecoveryCallbackUrl } from "@/lib/auth/recovery";
import { createAuthenticatedServerClient } from "@/lib/supabase/server";

export async function requestPasswordRecovery(formData: FormData) {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();

  if (!email) {
    redirect("/forgot-password?error=missing-email");
  }

  const requestHeaders = await headers();
  const callbackUrl = getRecoveryCallbackUrl(requestHeaders.get("origin") ?? undefined);

  if (!callbackUrl) {
    redirect("/forgot-password?error=unavailable");
  }

  const supabase = await createAuthenticatedServerClient({
    trustDevice: false,
  });
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: callbackUrl,
  });

  if (error) {
    redirect("/forgot-password?error=unavailable");
  }

  redirect("/forgot-password?sent=true");
}
