"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";

const field =
  "mt-2 min-h-12 w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-base text-slate-950 outline-none focus:border-amber-600 focus:ring-2 focus:ring-amber-100";

export function OnsiteDeckIntakeForm() {
  const router = useRouter();
  const idempotencyKey = useRef(crypto.randomUUID());
  const [pending, setPending] = useState(false);
  const [emailUnknown, setEmailUnknown] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError("");
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/internal/deck-intakes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idempotencyKey: idempotencyKey.current,
          customerName: data.get("customerName"),
          phone: data.get("phone"),
          email: emailUnknown ? null : data.get("email"),
          propertyAddress: data.get("propertyAddress"),
          notes: data.get("notes"),
        }),
      });
      const result = (await response.json()) as {
        success?: boolean;
        error?: string;
        estimateId?: unknown;
      };
      if (
        !response.ok ||
        !result.success ||
        typeof result.estimateId !== "string"
      ) {
        throw new Error(
          result.error ?? "The onsite Deck intake could not be created.",
        );
      }
      router.push(
        `/sales/estimates/${encodeURIComponent(result.estimateId)}?workflow=deck`,
      );
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "The onsite Deck intake could not be created.",
      );
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5 pb-28 sm:pb-8">
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
        Use this when you are already at the property. It skips appointment
        scheduling and opens the Deck field guide immediately.
      </div>
      <label className="block text-sm font-bold text-slate-800">
        Customer name *
        <input
          name="customerName"
          required
          autoComplete="name"
          className={field}
          disabled={pending}
        />
      </label>
      <label className="block text-sm font-bold text-slate-800">
        Phone *
        <input
          name="phone"
          required
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          className={field}
          disabled={pending}
        />
      </label>
      <label className="block text-sm font-bold text-slate-800">
        Email
        <input
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          className={field}
          disabled={pending || emailUnknown}
        />
      </label>
      <label className="flex min-h-12 items-center gap-3 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800">
        <input
          type="checkbox"
          className="h-5 w-5"
          checked={emailUnknown}
          onChange={(event) => setEmailUnknown(event.target.checked)}
          disabled={pending}
        />
        I don’t have the email yet
      </label>
      <label className="block text-sm font-bold text-slate-800">
        Property address
        <input
          name="propertyAddress"
          autoComplete="street-address"
          className={field}
          disabled={pending}
        />
      </label>
      <label className="block text-sm font-bold text-slate-800">
        Onsite notes
        <textarea
          name="notes"
          rows={4}
          maxLength={4000}
          className={field}
          disabled={pending}
          placeholder="Anything you already know about the Deck project"
        />
      </label>
      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm font-semibold text-red-800"
        >
          {error}
        </p>
      ) : null}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 p-4 backdrop-blur sm:static sm:border-0 sm:bg-transparent sm:p-0">
        <button
          disabled={pending}
          className="min-h-14 w-full rounded-lg bg-slate-950 px-5 text-base font-bold text-white disabled:opacity-50"
        >
          {pending
            ? "Creating Deck estimate…"
            : "Create and open Deck estimate"}
        </button>
      </div>
    </form>
  );
}
