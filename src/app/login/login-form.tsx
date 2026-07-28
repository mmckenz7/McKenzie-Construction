"use client";

import { useEffect, useState } from "react";

import { login } from "./actions";

type LoginFormProps = {
  errorMessage: string | null;
};

const rememberedEmailKey = "mckenzie-crm-remembered-email";

export function LoginForm({
  errorMessage,
}: LoginFormProps) {
  const [email, setEmail] = useState("");
  const [rememberEmail, setRememberEmail] = useState(true);
  const [trustDevice, setTrustDevice] = useState(true);

  useEffect(() => {
    const rememberedEmail = window.localStorage.getItem(
      rememberedEmailKey,
    );

    if (rememberedEmail) {
      setEmail(rememberedEmail);
      setRememberEmail(true);
    }
  }, []);

  function handleSubmit() {
    if (rememberEmail) {
      window.localStorage.setItem(
        rememberedEmailKey,
        email.trim().toLowerCase(),
      );
    } else {
      window.localStorage.removeItem(rememberedEmailKey);
    }
  }

  return (
    <>
      {errorMessage ? (
        <div
          role="alert"
          className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700"
        >
          {errorMessage}
        </div>
      ) : null}

      <form
        action={login}
        onSubmit={handleSubmit}
        className="mt-7 space-y-5"
      >
        <div>
          <label
            htmlFor="email"
            className="block text-sm font-bold text-slate-800"
          >
            Email address
          </label>

          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            className="mt-2 min-h-12 w-full rounded-lg border border-slate-300 px-4 text-slate-950 outline-none transition focus:border-lime-600 focus:ring-2 focus:ring-lime-600/20"
          />
        </div>

        <div>
          <label
            htmlFor="password"
            className="block text-sm font-bold text-slate-800"
          >
            Password
          </label>

          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="mt-2 min-h-12 w-full rounded-lg border border-slate-300 px-4 text-slate-950 outline-none transition focus:border-lime-600 focus:ring-2 focus:ring-lime-600/20"
          />
        </div>

        <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              name="rememberEmail"
              type="checkbox"
              checked={rememberEmail}
              onChange={(event) =>
                setRememberEmail(event.target.checked)
              }
              className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-slate-950"
            />

            <span>
              <span className="block text-sm font-bold text-slate-800">
                Remember my email
              </span>

              <span className="mt-0.5 block text-xs leading-5 text-slate-500">
                Saves only your email address on this browser.
              </span>
            </span>
          </label>

          <label className="flex cursor-pointer items-start gap-3">
            <input
              name="trustDevice"
              type="checkbox"
              checked={trustDevice}
              onChange={(event) =>
                setTrustDevice(event.target.checked)
              }
              className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-slate-950"
            />

            <span>
              <span className="block text-sm font-bold text-slate-800">
                Trust this device
              </span>

              <span className="mt-0.5 block text-xs leading-5 text-slate-500">
                Keeps you signed in after closing the browser.
              </span>
            </span>
          </label>
        </div>

        <button
          type="submit"
          className="flex min-h-12 w-full items-center justify-center rounded-lg bg-slate-950 px-5 text-sm font-black text-white transition hover:bg-slate-800"
        >
          SIGN IN
        </button>
      </form>
    </>
  );
}