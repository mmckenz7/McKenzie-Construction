"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type LeadStatusFormProps = {
  leadId: string;
  currentStatus: string | null;
  currentFollowUpAt: string | null;
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

function formatForDateTimeInput(value: string | null) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export default function LeadStatusForm({
  leadId,
  currentStatus,
  currentFollowUpAt,
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

  const [followUpAt, setFollowUpAt] = useState(
    formatForDateTimeInput(currentFollowUpAt),
  );

  const [isSavingStatus, setIsSavingStatus] = useState(false);
  const [isSavingFollowUp, setIsSavingFollowUp] = useState(false);

  const [statusMessage, setStatusMessage] = useState("");
  const [statusHasError, setStatusHasError] = useState(false);

  const [followUpMessage, setFollowUpMessage] = useState("");
  const [followUpHasError, setFollowUpHasError] = useState(false);

  async function saveChanges(payload: {
    status?: string;
    followUpAt?: string | null;
  }) {
    const response = await fetch("/api/leads", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        leadId,
        ...payload,
      }),
    });

    const result = (await response.json()) as {
      success?: boolean;
      error?: string;
    };

    if (!response.ok || !result.success) {
      throw new Error(
        result.error ?? "Unable to update the lead.",
      );
    }
  }

  async function handleStatusSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    setIsSavingStatus(true);
    setStatusMessage("");
    setStatusHasError(false);

    try {
      await saveChanges({
        status,
      });

      setStatusMessage("Status saved.");
      router.refresh();
    } catch (error) {
      setStatusHasError(true);

      setStatusMessage(
        error instanceof Error
          ? error.message
          : "Unable to save the lead status.",
      );
    } finally {
      setIsSavingStatus(false);
    }
  }

  async function handleFollowUpSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!followUpAt) {
      setFollowUpHasError(true);
      setFollowUpMessage("Choose a follow-up date and time.");
      return;
    }

    setIsSavingFollowUp(true);
    setFollowUpMessage("");
    setFollowUpHasError(false);

    try {
      await saveChanges({
        followUpAt,
      });

      setFollowUpMessage("Follow-up saved.");
      router.refresh();
    } catch (error) {
      setFollowUpHasError(true);

      setFollowUpMessage(
        error instanceof Error
          ? error.message
          : "Unable to save the follow-up.",
      );
    } finally {
      setIsSavingFollowUp(false);
    }
  }

  async function handleClearFollowUp() {
    setIsSavingFollowUp(true);
    setFollowUpMessage("");
    setFollowUpHasError(false);

    try {
      await saveChanges({
        followUpAt: null,
      });

      setFollowUpAt("");
      setFollowUpMessage("Follow-up cleared.");
      router.refresh();
    } catch (error) {
      setFollowUpHasError(true);

      setFollowUpMessage(
        error instanceof Error
          ? error.message
          : "Unable to clear the follow-up.",
      );
    } finally {
      setIsSavingFollowUp(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <form onSubmit={handleStatusSubmit}>
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
            setStatusMessage("");
            setStatusHasError(false);
          }}
          disabled={isSavingStatus}
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

        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
          <button
            type="submit"
            disabled={isSavingStatus}
            className="rounded-lg bg-slate-950 px-5 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {isSavingStatus ? "Saving..." : "Save Status"}
          </button>

          {statusMessage ? (
            <p
              className={`text-sm font-semibold ${
                statusHasError
                  ? "text-red-700"
                  : "text-green-700"
              }`}
            >
              {statusMessage}
            </p>
          ) : null}
        </div>
      </form>

      <form onSubmit={handleFollowUpSubmit}>
        <label
          htmlFor={`lead-follow-up-${leadId}`}
          className="mb-2 block text-sm font-bold text-slate-950"
        >
          Follow-Up Date and Time
        </label>

        <input
          id={`lead-follow-up-${leadId}`}
          type="datetime-local"
          value={followUpAt}
          onChange={(event) => {
            setFollowUpAt(event.target.value);
            setFollowUpMessage("");
            setFollowUpHasError(false);
          }}
          disabled={isSavingFollowUp}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none transition focus:border-slate-950 focus:ring-2 focus:ring-slate-200 disabled:cursor-not-allowed disabled:bg-slate-100"
        />

        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
          <button
            type="submit"
            disabled={isSavingFollowUp}
            className="rounded-lg bg-slate-950 px-5 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {isSavingFollowUp
              ? "Saving..."
              : "Save Follow-Up"}
          </button>

          <button
            type="button"
            onClick={handleClearFollowUp}
            disabled={isSavingFollowUp || !followUpAt}
            className="rounded-lg border border-slate-300 bg-white px-5 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-400"
          >
            Clear
          </button>

          {followUpMessage ? (
            <p
              className={`text-sm font-semibold ${
                followUpHasError
                  ? "text-red-700"
                  : "text-green-700"
              }`}
            >
              {followUpMessage}
            </p>
          ) : null}
        </div>
      </form>
    </div>
  );
}