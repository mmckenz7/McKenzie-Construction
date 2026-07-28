"use server";

import { redirect } from "next/navigation";

import { createAuthenticatedServerClient } from "@/lib/supabase/server";

export async function login(formData: FormData) {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();

  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    redirect("/login?error=missing-fields");
  }

  const supabase = await createAuthenticatedServerClient();

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    redirect("/login?error=invalid-login");
  }

  redirect("/admin");
}

export async function logout() {
  const supabase = await createAuthenticatedServerClient();

  await supabase.auth.signOut();

  redirect("/login");
}