"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type LeadNotesFormProps = {
  leadId: string;
  currentNotes: string | null;
};

export default function LeadNotesForm({
  leadId,
  currentNotes,
}: LeadNotesFormProps) {
  const router = useRouter();

  const [notes, setNotes] = useState(currentNotes ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [hasError, setHasError] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setIsSaving(true);
    setMessage("");
    setHasError(false);

    try {
      const response = await fetch("/api/leads", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          leadId,
          notes,
        }),
      });

      const result = (await response.json()) as {
        success?: boolean;
        error?: string;
      };

      if (!response.ok || !result.success) {
        throw new Error(
          result.error ?? "Unable to save internal notes.",
        );
      }

      setMessage("Notes saved.");

      router.refresh();
    } catch (error) {
      setHasError(true);

      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to save internal notes.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <label
        htmlFor={`lead-notes-${leadId}`}
        className="mb-2 block font-bold text-slate-950"
      >
        Internal Notes
      </label>

      <textarea
        id={`lead-notes-${leadId}`}
        value={notes}
        onChange={(event) => {
          setNotes(event.target.value);
          setMessage("");
          setHasError(false);
        }}
        disabled={isSaving}
        rows={6}
        placeholder="Add call notes, customer details, job information, or reminders..."
        className="w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-3 text-sm leading-6 text-slate-950 outline-none transition focus:border-slate-950 focus:ring-2 focus:ring-slate-200 disabled:cursor-not-allowed disabled:bg-slate-100"
      />

      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
        <button
          type="submit"
          disabled={isSaving}
          className="rounded-lg bg-slate-950 px-5 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          {isSaving ? "Saving..." : "Save Notes"}
        </button>

        {message ? (
          <p
            className={`text-sm font-semibold ${
              hasError ? "text-red-700" : "text-green-700"
            }`}
          >
            {message}
          </p>
        ) : null}
      </div>
    </form>
  );
}