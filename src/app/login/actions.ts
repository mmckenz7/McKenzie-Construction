"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { createAuthenticatedServerClient } from "@/lib/supabase/server";

function getSafeRedirectPath(value: FormDataEntryValue | null) {
  if (typeof value !== "string") {
    return "/admin";
  }

  const path = value.trim();

  if (
    !path.startsWith("/") ||
    path.startsWith("//") ||
    path.includes("://")
  ) {
    return "/admin";
  }

  return path;
}

export async function login(formData: FormData) {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();

  const password = String(formData.get("password") ?? "");
  const trustDevice = formData.get("trustDevice") === "on";
  const nextPath = getSafeRedirectPath(formData.get("next"));

  if (!email || !password) {
    redirect(
      `/login?error=missing-fields&next=${encodeURIComponent(nextPath)}`,
    );
  }

  const cookieStore = await cookies();

  cookieStore.set(
    "mckenzie-trust-device",
    trustDevice ? "true" : "false",
    {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      ...(trustDevice
        ? {
            maxAge: 60 * 60 * 24 * 30,
          }
        : {}),
    },
  );

  const supabase = await createAuthenticatedServerClient({
    trustDevice,
  });

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    cookieStore.delete("mckenzie-trust-device");

    redirect(
      `/login?error=invalid-login&next=${encodeURIComponent(nextPath)}`,
    );
  }

  redirect(nextPath);
}

export async function logout() {
  const supabase = await createAuthenticatedServerClient();

  await supabase.auth.signOut();

  const cookieStore = await cookies();
  cookieStore.delete("mckenzie-trust-device");

  redirect("/login");
}