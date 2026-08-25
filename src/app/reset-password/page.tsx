import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";

import { recoverySessionCookie } from "@/lib/auth/recovery";
import { createAuthenticatedServerClient } from "@/lib/supabase/server";

import { updateRecoveredPassword } from "./actions";

export const metadata: Metadata = {
  title: "Set new password",
  robots: {
    index: false,
    follow: false,
  },
};

type ResetPasswordPageProps = {
  searchParams: Promise<{
    error?: string;
  }>;
};

export default async function ResetPasswordPage({
  searchParams,
}: ResetPasswordPageProps) {
  const params = await searchParams;
  const cookieStore = await cookies();
  const hasRecoveryMarker =
    cookieStore.get(recoverySessionCookie)?.value === "active";
  const supabase = await createAuthenticatedServerClient({
    trustDevice: false,
  });
  const {
    data: { user },
  } = hasRecoveryMarker
    ? await supabase.auth.getUser()
    : { data: { user: null } };
  const canResetPassword = Boolean(hasRecoveryMarker && user);
  const errorMessage =
    params.error === "too-short"
      ? "Use at least 12 characters for your new password."
      : params.error === "mismatch"
        ? "The passwords do not match."
        : params.error === "update-failed"
          ? "We could not update your password. Try again or request a new link."
          : params.error === "invalid-link" || !canResetPassword
            ? "This recovery link is invalid or has expired."
            : null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-5 py-12">
      <section className="w-full max-w-md rounded-2xl border border-slate-800 bg-white p-7 shadow-2xl sm:p-9">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-lime-700">
          McKenzie Construction
        </p>

        <h1 className="mt-3 text-3xl font-black text-slate-950">
          Set a new password
        </h1>

        {errorMessage ? (
          <div
            role="alert"
            className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold leading-6 text-red-700"
          >
            {errorMessage}
          </div>
        ) : null}

        {canResetPassword ? (
          <div className="mt-7">
            <form action={updateRecoveredPassword} className="space-y-5">
              <div>
                <label htmlFor="password" className="block text-sm font-bold text-slate-800">
                  New password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  required
                  className="mt-2 min-h-12 w-full rounded-lg border border-slate-300 px-4 text-slate-950 outline-none transition focus:border-lime-600 focus:ring-2 focus:ring-lime-600/20"
                />
                <p className="mt-2 text-xs leading-5 text-slate-500">
                  Use at least 12 characters.
                </p>
              </div>

              <div>
                <label htmlFor="confirmation" className="block text-sm font-bold text-slate-800">
                  Confirm new password
                </label>
                <input
                  id="confirmation"
                  name="confirmation"
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  required
                  className="mt-2 min-h-12 w-full rounded-lg border border-slate-300 px-4 text-slate-950 outline-none transition focus:border-lime-600 focus:ring-2 focus:ring-lime-600/20"
                />
              </div>

              <button
                type="submit"
                className="flex min-h-12 w-full items-center justify-center rounded-lg bg-slate-950 px-5 text-sm font-black text-white transition hover:bg-slate-800"
              >
                UPDATE PASSWORD
              </button>
            </form>

            <Link
              href="/forgot-password"
              className="mt-5 inline-flex min-h-11 items-center font-bold text-slate-700 underline decoration-slate-300 underline-offset-4 hover:text-slate-950"
            >
              Request another recovery email
            </Link>
          </div>
        ) : (
          <Link
            href="/forgot-password"
            className="mt-6 inline-flex min-h-11 items-center font-bold text-slate-700 underline decoration-slate-300 underline-offset-4 hover:text-slate-950"
          >
            Request another recovery email
          </Link>
        )}
      </section>
    </main>
  );
}
