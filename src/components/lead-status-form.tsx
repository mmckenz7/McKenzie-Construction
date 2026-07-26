"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type LeadStatusFormProps = {
  leadId: string;
  currentStatus: string | null;
};

const leadStatuses = [
  {
    value: "new",
    label: "New",
  },
  {
    value: "contacted",
    label: "Contacted",
  },
  {
    value: "consultation_scheduled",
    label: "Consultation Scheduled",
  },
  {
    value: "proposal_sent",
    label: "Proposal Sent",
  },
  {
    value: "won",
    label: "Won",
  },
  {
    value: "lost",
    label: "Lost",
  },
];

export default function LeadStatusForm({
  leadId,
  currentStatus,
}: LeadStatusFormProps) {
  const router = useRouter();

  const startingStatus =
    currentStatus &&
    leadStatuses.some(
      (statusOption) => statusOption.value === currentStatus,
    )
      ? currentStatus
      : "new";

  const [status, setStatus] = useState(startingStatus);
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
          status,
        }),
      });

      const result = (await response.json()) as {
        success?: boolean;
        error?: string;
      };

      if (!response.ok || !result.success) {
        throw new Error(
          result.error ?? "Unable to update the lead status.",
        );
      }

      setMessage("Status saved.");

      router.refresh();
    } catch (error) {
      setHasError(true);

      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to update the lead status.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 sm:flex-row sm:items-end"
    >
      <div className="w-full sm:max-w-xs">
        <label
          htmlFor={`lead-status-${leadId}`}
          className="mb-2 block text-sm font-bold text-slate-950"
        >
          Update lead status
        </label>

        <select
          id={`lead-status-${leadId}`}
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setMessage("");
            setHasError(false);
          }}
          disabled={isSaving}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 disabled:cursor-not-allowed disabled:bg-slate-100"
        >
          {leadStatuses.map((statusOption) => (
            <option
              key={statusOption.value}
              value={statusOption.value}
            >
              {statusOption.label}
            </option>
          ))}
        </select>
      </div>

      <button
        type="submit"
        disabled={isSaving}
        className="rounded-lg bg-slate-950 px-5 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
      >
        {isSaving ? "Saving..." : "Save Status"}
      </button>

      {message ? (
        <p
          className={`pb-2 text-sm font-semibold ${
            hasError ? "text-red-700" : "text-green-700"
          }`}
        >
          {message}
        </p>
      ) : null}
    </form>
  );
}