"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { recoverySessionCookie } from "@/lib/auth/recovery";
import { createAuthenticatedServerClient } from "@/lib/supabase/server";

export async function updateRecoveredPassword(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("confirmation") ?? "");
  const cookieStore = await cookies();

  if (cookieStore.get(recoverySessionCookie)?.value !== "active") {
    redirect("/reset-password?error=invalid-link");
  }

  if (password.length < 12) {
    redirect("/reset-password?error=too-short");
  }

  if (password !== confirmation) {
    redirect("/reset-password?error=mismatch");
  }

  const supabase = await createAuthenticatedServerClient({
    trustDevice: false,
  });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    cookieStore.delete(recoverySessionCookie);
    redirect("/reset-password?error=invalid-link");
  }

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    redirect("/reset-password?error=update-failed");
  }

  cookieStore.delete(recoverySessionCookie);
  await supabase.auth.signOut();
  redirect("/login?notice=password-updated");
}
