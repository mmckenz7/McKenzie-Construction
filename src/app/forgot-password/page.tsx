import type { Metadata } from "next";
import Link from "next/link";

import { requestPasswordRecovery } from "./actions";

export const metadata: Metadata = {
  title: "Reset password",
  robots: {
    index: false,
    follow: false,
  },
};

type ForgotPasswordPageProps = {
  searchParams: Promise<{
    error?: string;
    sent?: string;
  }>;
};

export default async function ForgotPasswordPage({
  searchParams,
}: ForgotPasswordPageProps) {
  const params = await searchParams;
  const sent = params.sent === "true";
  const errorMessage =
    params.error === "missing-email"
      ? "Enter your email address."
      : params.error === "unavailable"
        ? "We could not send a recovery email right now. Please try again."
        : null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-5 py-12">
      <section className="w-full max-w-md rounded-2xl border border-slate-800 bg-white p-7 shadow-2xl sm:p-9">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-lime-700">
          McKenzie Construction
        </p>

        <h1 className="mt-3 text-3xl font-black text-slate-950">
          Reset your password
        </h1>

        {sent ? (
          <div className="mt-6 space-y-4">
            <div
              role="status"
              className="rounded-lg border border-lime-200 bg-lime-50 px-4 py-3 text-sm font-semibold leading-6 text-lime-900"
            >
              If that address belongs to an account, a recovery email is on its way.
              Open the link in this browser. The link expires, so use it promptly.
            </div>

            <Link
              href="/login"
              className="inline-flex min-h-11 items-center font-bold text-slate-700 underline decoration-slate-300 underline-offset-4 hover:text-slate-950"
            >
              Return to sign in
            </Link>
          </div>
        ) : (
          <>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Enter your account email and we’ll send a secure recovery link.
            </p>

            {errorMessage ? (
              <div
                role="alert"
                className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700"
              >
                {errorMessage}
              </div>
            ) : null}

            <form action={requestPasswordRecovery} className="mt-7 space-y-5">
              <div>
                <label htmlFor="email" className="block text-sm font-bold text-slate-800">
                  Email address
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  className="mt-2 min-h-12 w-full rounded-lg border border-slate-300 px-4 text-slate-950 outline-none transition focus:border-lime-600 focus:ring-2 focus:ring-lime-600/20"
                />
              </div>

              <button
                type="submit"
                className="flex min-h-12 w-full items-center justify-center rounded-lg bg-slate-950 px-5 text-sm font-black text-white transition hover:bg-slate-800"
              >
                SEND RECOVERY EMAIL
              </button>
            </form>

            <Link
              href="/login"
              className="mt-6 inline-flex min-h-11 items-center font-bold text-slate-700 underline decoration-slate-300 underline-offset-4 hover:text-slate-950"
            >
              Return to sign in
            </Link>
          </>
        )}
      </section>
    </main>
  );
}
