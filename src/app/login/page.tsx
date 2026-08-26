import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { LoginForm } from "./login-form";
import { getSafeInternalRedirectPath } from "@/lib/auth/redirect";
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
    next?: string;
    notice?: string;
  }>;
};

export default async function LoginPage({
  searchParams,
}: LoginPageProps) {
  const params = await searchParams;
  const nextPath = getSafeInternalRedirectPath(params.next);

  const supabase = await createAuthenticatedServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect(nextPath);
  }

  const errorMessage =
    params.error === "missing-fields"
      ? "Enter your email address and password."
      : params.error === "invalid-login"
        ? "The email address or password is incorrect."
        : null;
  const noticeMessage =
    params.notice === "password-updated"
      ? "Your password was updated. Sign in with your new password."
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

        <LoginForm
          errorMessage={errorMessage}
          nextPath={nextPath}
        />

        {noticeMessage ? (
          <div
            role="status"
            className="mt-6 rounded-lg border border-lime-200 bg-lime-50 px-4 py-3 text-sm font-semibold text-lime-900"
          >
            {noticeMessage}
          </div>
        ) : null}

        <Link
          href="/forgot-password"
          className="mt-5 flex min-h-11 items-center justify-center text-sm font-bold text-slate-700 underline decoration-slate-300 underline-offset-4 hover:text-slate-950"
        >
          Forgot your password?
        </Link>

        <p className="mt-6 text-center text-xs leading-5 text-slate-500">
          Authorized company users only.
        </p>
      </section>
    </main>
  );
}
