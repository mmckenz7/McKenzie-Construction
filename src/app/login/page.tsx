import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { LoginForm } from "./login-form";
import { createAuthenticatedServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Admin Login",
  robots: {
    index: false,
    follow: false,
  },
};

type LoginPageProps = {
  searchParams: Promise<{
    error?: string;
  }>;
};

export default async function LoginPage({
  searchParams,
}: LoginPageProps) {
  const supabase = await createAuthenticatedServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/admin");
  }

  const params = await searchParams;

  const errorMessage =
    params.error === "missing-fields"
      ? "Enter your email address and password."
      : params.error === "invalid-login"
        ? "The email address or password is incorrect."
        : null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-5 py-12">
      <section className="w-full max-w-md rounded-2xl border border-slate-800 bg-white p-7 shadow-2xl sm:p-9">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-lime-700">
            McKenzie Construction
          </p>

          <h1 className="mt-3 text-3xl font-black text-slate-950">
            Company Dashboard
          </h1>

          <p className="mt-3 text-sm leading-6 text-slate-600">
            Sign in to manage leads, customers, tasks, and company
            activity.
          </p>
        </div>

        <LoginForm errorMessage={errorMessage} />

        <p className="mt-6 text-center text-xs leading-5 text-slate-500">
          Authorized company users only.
        </p>
      </section>
    </main>
  );
}