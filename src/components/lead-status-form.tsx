"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type LeadStatusFormProps = {
  leadId: string;
  currentStatus: string | null;
  currentConsultationStatus: string | null;
  currentFollowUpAt: string | null;
};

const leadStatuses = [
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  {
    value: "consultation_scheduled",
    label: "Consultation Scheduled",
  },
  { value: "proposal_sent", label: "Proposal Sent" },
  { value: "won", label: "Won" },
  { value: "lost", label: "Lost" },
];

const consultationStatuses = [
  { value: "not_requested", label: "Not Requested" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "declined", label: "Declined" },
  { value: "completed", label: "Completed" },
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
  currentConsultationStatus,
  currentFollowUpAt,
}: LeadStatusFormProps) {
  const router = useRouter();

  const startingStatus = leadStatuses.some(
    (option) => option.value === currentStatus,
  )
    ? currentStatus!
    : "new";

  const startingConsultationStatus =
    consultationStatuses.some(
      (option) =>
        option.value === currentConsultationStatus,
    )
      ? currentConsultationStatus!
      : "not_requested";

  const [status, setStatus] = useState(startingStatus);

  const [consultationStatus, setConsultationStatus] = useState(
    startingConsultationStatus,
  );

  const [followUpAt, setFollowUpAt] = useState(
    formatForDateTimeInput(currentFollowUpAt),
  );

  const [statusMessage, setStatusMessage] = useState("");
  const [consultationMessage, setConsultationMessage] =
    useState("");
  const [followUpMessage, setFollowUpMessage] = useState("");

  const [isSavingStatus, setIsSavingStatus] = useState(false);
  const [isSavingConsultation, setIsSavingConsultation] =
    useState(false);
  const [isSavingFollowUp, setIsSavingFollowUp] =
    useState(false);

  async function patchLead(payload: Record<string, unknown>) {
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

    try {
      await patchLead({
        lead_status: status,
      });

      setStatusMessage("Status saved.");
      router.refresh();
    } catch (error) {
      setStatusMessage(
        error instanceof Error
          ? error.message
          : "Unable to save status.",
      );
    } finally {
      setIsSavingStatus(false);
    }
  }

  async function handleConsultationSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    setIsSavingConsultation(true);
    setConsultationMessage("");

    try {
      await patchLead({
        consultation_status: consultationStatus,
      });

      setConsultationMessage(
        "Consultation status saved.",
      );

      router.refresh();
    } catch (error) {
      setConsultationMessage(
        error instanceof Error
          ? error.message
          : "Unable to save consultation status.",
      );
    } finally {
      setIsSavingConsultation(false);
    }
  }

  async function handleFollowUpSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!followUpAt) {
      setFollowUpMessage(
        "Choose a follow-up date and time.",
      );
      return;
    }

    setIsSavingFollowUp(true);
    setFollowUpMessage("");

    try {
      await patchLead({
        follow_up_at: followUpAt,
      });

      setFollowUpMessage("Follow-up saved.");
      router.refresh();
    } catch (error) {
      setFollowUpMessage(
        error instanceof Error
          ? error.message
          : "Unable to save follow-up.",
      );
    } finally {
      setIsSavingFollowUp(false);
    }
  }

  async function handleClearFollowUp() {
    setIsSavingFollowUp(true);
    setFollowUpMessage("");

    try {
      await patchLead({
        follow_up_at: null,
      });

      setFollowUpAt("");
      setFollowUpMessage("Follow-up cleared.");
      router.refresh();
    } catch (error) {
      setFollowUpMessage(
        error instanceof Error
          ? error.message
          : "Unable to clear follow-up.",
      );
    } finally {
      setIsSavingFollowUp(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <form onSubmit={handleStatusSubmit}>
        <label
          htmlFor={`lead-status-${leadId}`}
          className="mb-2 block text-sm font-bold text-slate-950"
        >
          Lead Status
        </label>

        <select
          id={`lead-status-${leadId}`}
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setStatusMessage("");
          }}
          disabled={isSavingStatus}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
        >
          {leadStatuses.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <button
          type="submit"
          disabled={isSavingStatus}
          className="mt-3 rounded-lg bg-slate-950 px-5 py-2 text-sm font-semibold text-white disabled:bg-slate-400"
        >
          {isSavingStatus ? "Saving..." : "Save Status"}
        </button>

        {statusMessage ? (
          <p className="mt-2 text-sm font-semibold text-slate-700">
            {statusMessage}
          </p>
        ) : null}
      </form>

      <form onSubmit={handleConsultationSubmit}>
        <label
          htmlFor={`consultation-status-${leadId}`}
          className="mb-2 block text-sm font-bold text-slate-950"
        >
          Consultation Status
        </label>

        <select
          id={`consultation-status-${leadId}`}
          value={consultationStatus}
          onChange={(event) => {
            setConsultationStatus(event.target.value);
            setConsultationMessage("");
          }}
          disabled={isSavingConsultation}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
        >
          {consultationStatuses.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <button
          type="submit"
          disabled={isSavingConsultation}
          className="mt-3 rounded-lg bg-slate-950 px-5 py-2 text-sm font-semibold text-white disabled:bg-slate-400"
        >
          {isSavingConsultation
            ? "Saving..."
            : "Save Consultation"}
        </button>

        {consultationMessage ? (
          <p className="mt-2 text-sm font-semibold text-slate-700">
            {consultationMessage}
          </p>
        ) : null}
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
          }}
          disabled={isSavingFollowUp}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
        />

        <div className="mt-3 flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={isSavingFollowUp}
            className="rounded-lg bg-slate-950 px-5 py-2 text-sm font-semibold text-white disabled:bg-slate-400"
          >
            {isSavingFollowUp
              ? "Saving..."
              : "Save Follow-Up"}
          </button>

          <button
            type="button"
            onClick={handleClearFollowUp}
            disabled={isSavingFollowUp || !followUpAt}
            className="rounded-lg border border-slate-300 bg-white px-5 py-2 text-sm font-semibold text-slate-700 disabled:text-slate-400"
          >
            Clear
          </button>
        </div>

        {followUpMessage ? (
          <p className="mt-2 text-sm font-semibold text-slate-700">
            {followUpMessage}
          </p>
        ) : null}
      </form>
    </div>
  );
}