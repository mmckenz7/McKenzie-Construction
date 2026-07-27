"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import EmailDraftReview from "@/components/email-draft-review";

type LeadStageWorkflowProps = {
  leadId: string;
  currentStatus: string | null;
  currentConsultationStatus: string | null;
  currentFollowUpAt: string | null;
  requestedDate: string | null;
  requestedTime: string | null;
  alternateDate: string | null;
  alternateTime: string | null;
};

type CallOutcome =
  | "spoke"
  | "no_answer"
  | "left_voicemail"
  | "callback_requested";

type WorkflowAction =
  | "reschedule_consultation"
  | "cancel_consultation"
  | "revisions_requested"
  | "revised_estimate_sent"
  | "customer_reviewing"
  | "schedule_follow_up"
  | "start_call"
  | "won"
  | "lost";

const lostReasons = [
  "Price",
  "Timing",
  "Chose another contractor",
  "Project canceled",
  "No response",
  "Outside service area",
  "Not a good fit",
  "Other",
];

function formatForDateTimeInput(
  value: string | null,
) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const year = date.getFullYear();
  const month = String(
    date.getMonth() + 1,
  ).padStart(2, "0");
  const day = String(date.getDate()).padStart(
    2,
    "0",
  );
  const hours = String(date.getHours()).padStart(
    2,
    "0",
  );
  const minutes = String(
    date.getMinutes(),
  ).padStart(2, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function combineDateAndTime(
  date: string | null,
  time: string | null,
) {
  if (!date || !time) {
    return "";
  }

  return `${date}T${time.slice(0, 5)}`;
}

function formatRequestedOption(
  date: string | null,
  time: string | null,
) {
  const combined = combineDateAndTime(
    date,
    time,
  );

  if (!combined) {
    return "Not provided";
  }

  const parsedDate = new Date(combined);

  if (Number.isNaN(parsedDate.getTime())) {
    return `${date ?? ""} ${
      time ?? ""
    }`.trim();
  }

  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(parsedDate);
}

export default function LeadStageWorkflow({
  leadId,
  currentStatus,
  currentConsultationStatus,
  currentFollowUpAt,
  requestedDate,
  requestedTime,
  alternateDate,
  alternateTime,
}: LeadStageWorkflowProps) {
  const router = useRouter();

  const preferredAppointmentAt =
    combineDateAndTime(
      requestedDate,
      requestedTime,
    );

  const alternateAppointmentAt =
    combineDateAndTime(
      alternateDate,
      alternateTime,
    );

  const [
    consultationChoice,
    setConsultationChoice,
  ] = useState<
    "preferred" | "alternate" | "custom"
  >(
    preferredAppointmentAt
      ? "preferred"
      : alternateAppointmentAt
        ? "alternate"
        : "custom",
  );

  const [status, setStatus] = useState(
    currentStatus ?? "new",
  );

  const [
    consultationStatus,
    setConsultationStatus,
  ] = useState(
    currentConsultationStatus ??
      "not_requested",
  );

  const [appointmentAt, setAppointmentAt] =
    useState(
      currentConsultationStatus ===
        "confirmed"
        ? formatForDateTimeInput(
            currentFollowUpAt,
          )
        : preferredAppointmentAt ||
            alternateAppointmentAt ||
            "",
    );

  const [followUpAt, setFollowUpAt] =
    useState("");

  const [callbackAt, setCallbackAt] =
    useState("");

  const [notes, setNotes] = useState("");
  const [callNotes, setCallNotes] =
    useState("");

  const [lostReason, setLostReason] =
    useState("");

  const [
    customLostReason,
    setCustomLostReason,
  ] = useState("");

  const [message, setMessage] =
    useState("");

  const [errorMessage, setErrorMessage] =
    useState("");

  const [
    activeAction,
    setActiveAction,
  ] = useState<string | null>(null);

  const isBusy = activeAction !== null;

  function clearMessages() {
    setMessage("");
    setErrorMessage("");
  }

  async function readResponse(
    response: Response,
  ) {
    const result = (await response.json()) as {
      success?: boolean;
      error?: string;
      appointmentAt?: string;
      estimateDueAt?: string;
      followUpAt?: string;
      emailDraftCreated?: boolean;
      followUpTaskCreated?: boolean;
      callbackTaskCreated?: boolean;
      nextFollowUpAt?: string | null;
      canConvertToProject?: boolean;
      phone?: string | null;
    };

    if (!response.ok || !result.success) {
      throw new Error(
        result.error ??
          "Unable to complete the workflow action.",
      );
    }

    return result;
  }

  async function runWorkflowAction(
    action: WorkflowAction,
    overrides?: {
      appointmentAt?: string;
      followUpAt?: string;
      notes?: string;
      lostReason?: string;
    },
  ) {
    setActiveAction(action);
    clearMessages();

    try {
      const response = await fetch(
        `/api/leads/${encodeURIComponent(
          leadId,
        )}/workflow`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            action,
            appointmentAt:
              overrides?.appointmentAt ??
              appointmentAt,
            followUpAt:
              overrides?.followUpAt ??
              followUpAt,
            notes:
              overrides?.notes ?? notes,
            lostReason:
              overrides?.lostReason ??
              lostReason,
          }),
        },
      );

      const result =
        await readResponse(response);

      if (
        action ===
        "reschedule_consultation"
      ) {
        setStatus(
          "consultation_scheduled",
        );
        setConsultationStatus(
          "confirmed",
        );

        if (result.appointmentAt) {
          setAppointmentAt(
            formatForDateTimeInput(
              result.appointmentAt,
            ),
          );
        }

        setMessage(
          result.emailDraftCreated
            ? "Consultation rescheduled. An email draft was created."
            : "Consultation rescheduled.",
        );
      }

      if (
        action ===
        "cancel_consultation"
      ) {
        setStatus("contacted");
        setConsultationStatus(
          "declined",
        );

        setMessage(
          result.emailDraftCreated
            ? "Consultation canceled. An email draft was created."
            : "Consultation canceled.",
        );
      }

      if (
        action ===
        "revisions_requested"
      ) {
        setStatus(
          "estimate_in_progress",
        );

        setMessage(
          "Revisions recorded. A revised-estimate task was created.",
        );
      }

      if (
        action ===
        "revised_estimate_sent"
      ) {
        setStatus("proposal_sent");

        setMessage(
          "Revised estimate marked sent. The next follow-up was scheduled.",
        );
      }

      if (
        action ===
        "customer_reviewing"
      ) {
        setStatus(
          "customer_reviewing",
        );

        setMessage(
          "Customer marked as reviewing. A follow-up task was scheduled.",
        );
      }

      if (
        action ===
        "schedule_follow_up"
      ) {
        setStatus(
          "customer_reviewing",
        );
        setFollowUpAt("");

        setMessage(
          "The next follow-up was scheduled.",
        );
      }

      if (action === "start_call") {
        setMessage(
          result.phone
            ? `Call activity started for ${result.phone}.`
            : "Call activity started.",
        );
      }

      if (action === "won") {
        setStatus("won");

        setMessage(
          "Lead marked won. It is ready to convert to a project.",
        );
      }

      if (action === "lost") {
        setStatus("lost");

        setMessage(
          "Lead marked lost and all open sales tasks were closed.",
        );
      }

      setNotes("");
      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to complete the workflow action.",
      );
    } finally {
      setActiveAction(null);
    }
  }

  async function handleConfirmConsultation(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!appointmentAt) {
      setErrorMessage(
        "Choose the consultation date and time.",
      );
      return;
    }

    setActiveAction(
      "confirm_consultation",
    );
    clearMessages();

    try {
      const response = await fetch(
        `/api/leads/${encodeURIComponent(
          leadId,
        )}/confirm-consultation`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            appointmentAt,
          }),
        },
      );

      const result =
        await readResponse(response);

      setStatus(
        "consultation_scheduled",
      );
      setConsultationStatus(
        "confirmed",
      );

      setMessage(
        result.emailDraftCreated
          ? "Consultation confirmed. The visit task and email draft were created."
          : "Consultation confirmed. The visit task was created.",
      );

      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to confirm the consultation.",
      );
    } finally {
      setActiveAction(null);
    }
  }

  async function handleCompleteVisit() {
    setActiveAction("complete_visit");
    clearMessages();

    try {
      const response = await fetch(
        `/api/leads/${encodeURIComponent(
          leadId,
        )}/complete-consultation`,
        {
          method: "POST",
        },
      );

      await readResponse(response);

      setStatus(
        "estimate_in_progress",
      );
      setConsultationStatus(
        "completed",
      );

      setMessage(
        "Visit completed. The estimate task was created.",
      );

      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to complete the consultation.",
      );
    } finally {
      setActiveAction(null);
    }
  }

  async function handleSendEstimate() {
    setActiveAction("send_estimate");
    clearMessages();

    try {
      const response = await fetch(
        `/api/leads/${encodeURIComponent(
          leadId,
        )}/send-estimate`,
        {
          method: "POST",
        },
      );

      const result =
        await readResponse(response);

      setStatus("proposal_sent");

      setMessage(
        result.followUpTaskCreated
          ? "Estimate marked sent. The first phone follow-up was scheduled."
          : "Estimate marked sent.",
      );

      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to mark the estimate sent.",
      );
    } finally {
      setActiveAction(null);
    }
  }

  async function handleCallOutcome(
    outcome: CallOutcome,
  ) {
    if (
      outcome ===
        "callback_requested" &&
      !callbackAt
    ) {
      setErrorMessage(
        "Choose the requested callback date and time.",
      );
      return;
    }

    setActiveAction(outcome);
    clearMessages();

    try {
      const response = await fetch(
        `/api/leads/${encodeURIComponent(
          leadId,
        )}/call-outcome`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            outcome,
            notes: callNotes,
            callbackAt:
              outcome ===
              "callback_requested"
                ? callbackAt
                : null,
          }),
        },
      );

      const result =
        await readResponse(response);

      if (outcome === "spoke") {
        setMessage(
          "Call logged as spoke with customer.",
        );
      }

      if (outcome === "no_answer") {
        setMessage(
          result.emailDraftCreated
            ? "No answer logged. A follow-up email draft was created."
            : "No answer logged.",
        );
      }

      if (
        outcome === "left_voicemail"
      ) {
        setMessage(
          result.emailDraftCreated
            ? "Voicemail logged. A follow-up email draft was created."
            : "Voicemail logged.",
        );
      }

      if (
        outcome ===
        "callback_requested"
      ) {
        setMessage(
          result.callbackTaskCreated
            ? "The requested callback was scheduled."
            : "Callback request logged.",
        );
      }

      setCallNotes("");

      if (
        outcome !==
        "callback_requested"
      ) {
        setCallbackAt("");
      }

      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to save the call outcome.",
      );
    } finally {
      setActiveAction(null);
    }
  }

  function handleLostLead() {
    const finalReason =
      lostReason === "Other"
        ? customLostReason.trim()
        : lostReason;

    if (!finalReason) {
      setErrorMessage(
        "Choose or enter a lost reason.",
      );
      return;
    }

    void runWorkflowAction("lost", {
      lostReason: finalReason,
    });
  }

  const leadIsWon = status === "won";
  const leadIsLost = status === "lost";

  const showNewLeadStage =
    !leadIsWon &&
    !leadIsLost &&
    consultationStatus !== "confirmed" &&
    consultationStatus !== "completed" &&
    status !== "estimate_in_progress" &&
    status !== "proposal_sent" &&
    status !== "customer_reviewing";

  const showConfirmedConsultationStage =
    !leadIsWon &&
    !leadIsLost &&
    consultationStatus === "confirmed";

  const showEstimateStage =
    !leadIsWon &&
    !leadIsLost &&
    status === "estimate_in_progress";

  const showProposalStage =
    !leadIsWon &&
    !leadIsLost &&
    status === "proposal_sent";

  const showReviewingStage =
    !leadIsWon &&
    !leadIsLost &&
    status === "customer_reviewing";

  return (
    <div className="space-y-6">
      {showNewLeadStage ? (
        <section className="rounded-xl border border-amber-300 bg-amber-50 p-5">
          <p className="text-xs font-bold uppercase tracking-widest text-amber-800">
            Current Stage
          </p>

          <h3 className="mt-1 text-xl font-bold text-slate-950">
            Schedule Consultation
          </h3>

          <p className="mt-2 text-sm leading-6 text-slate-700">
            Confirm the consultation date and create the site-visit task.
          </p>

          <form
            onSubmit={handleConfirmConsultation}
            className="mt-5 space-y-4"
          >
            <fieldset
              disabled={isBusy}
              className="grid gap-3 lg:grid-cols-3"
            >
              <legend className="sr-only">
                Choose a consultation time
              </legend>

              <label className="flex cursor-pointer gap-3 rounded-xl border border-amber-300 bg-white p-4">
                <input
                  type="radio"
                  name="consultationChoice"
                  value="preferred"
                  checked={
                    consultationChoice ===
                    "preferred"
                  }
                  disabled={
                    !preferredAppointmentAt ||
                    isBusy
                  }
                  onChange={() => {
                    setConsultationChoice(
                      "preferred",
                    );
                    setAppointmentAt(
                      preferredAppointmentAt,
                    );
                    clearMessages();
                  }}
                  className="mt-1"
                />

                <span>
                  <span className="block text-sm font-bold text-slate-950">
                    Preferred
                  </span>

                  <span className="mt-1 block text-sm text-slate-700">
                    {formatRequestedOption(
                      requestedDate,
                      requestedTime,
                    )}
                  </span>
                </span>
              </label>

              <label className="flex cursor-pointer gap-3 rounded-xl border border-amber-300 bg-white p-4">
                <input
                  type="radio"
                  name="consultationChoice"
                  value="alternate"
                  checked={
                    consultationChoice ===
                    "alternate"
                  }
                  disabled={
                    !alternateAppointmentAt ||
                    isBusy
                  }
                  onChange={() => {
                    setConsultationChoice(
                      "alternate",
                    );
                    setAppointmentAt(
                      alternateAppointmentAt,
                    );
                    clearMessages();
                  }}
                  className="mt-1"
                />

                <span>
                  <span className="block text-sm font-bold text-slate-950">
                    Alternate
                  </span>

                  <span className="mt-1 block text-sm text-slate-700">
                    {formatRequestedOption(
                      alternateDate,
                      alternateTime,
                    )}
                  </span>
                </span>
              </label>

              <label className="flex cursor-pointer gap-3 rounded-xl border border-amber-300 bg-white p-4">
                <input
                  type="radio"
                  name="consultationChoice"
                  value="custom"
                  checked={
                    consultationChoice ===
                    "custom"
                  }
                  disabled={isBusy}
                  onChange={() => {
                    setConsultationChoice(
                      "custom",
                    );
                    setAppointmentAt("");
                    clearMessages();
                  }}
                  className="mt-1"
                />

                <span>
                  <span className="block text-sm font-bold text-slate-950">
                    Custom
                  </span>

                  <span className="mt-1 block text-sm text-slate-700">
                    Select another date and time.
                  </span>
                </span>
              </label>
            </fieldset>

            {consultationChoice ===
            "custom" ? (
              <label className="block">
                <span className="mb-2 block text-sm font-bold text-slate-950">
                  Custom Consultation Date and Time
                </span>

                <input
                  type="datetime-local"
                  value={appointmentAt}
                  onChange={(event) => {
                    setAppointmentAt(
                      event.target.value,
                    );
                    clearMessages();
                  }}
                  disabled={isBusy}
                  className="w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm text-slate-950"
                />
              </label>
            ) : (
              <div className="rounded-lg border border-amber-200 bg-white px-4 py-3">
                <p className="text-xs font-bold uppercase tracking-widest text-amber-800">
                  Selected Appointment
                </p>

                <p className="mt-1 text-sm font-semibold text-slate-950">
                  {consultationChoice ===
                  "preferred"
                    ? formatRequestedOption(
                        requestedDate,
                        requestedTime,
                      )
                    : formatRequestedOption(
                        alternateDate,
                        alternateTime,
                      )}
                </p>
              </div>
            )}

            <button
              type="submit"
              disabled={
                isBusy || !appointmentAt
              }
              className="rounded-lg bg-amber-500 px-5 py-2 text-sm font-bold text-slate-950 disabled:bg-amber-200 disabled:text-slate-500"
            >
              {activeAction ===
              "confirm_consultation"
                ? "Confirming..."
                : "Confirm Consultation"}
            </button>
          </form>
        </section>
      ) : null}

      {showConfirmedConsultationStage ? (
        <section className="rounded-xl border border-emerald-300 bg-emerald-50 p-5">
          <p className="text-xs font-bold uppercase tracking-widest text-emerald-800">
            Current Stage
          </p>

          <h3 className="mt-1 text-xl font-bold text-slate-950">
            Consultation Confirmed
          </h3>

          <p className="mt-2 text-sm leading-6 text-slate-700">
            Complete the visit, reschedule it, or cancel the consultation.
          </p>

          <label className="mt-5 block">
            <span className="mb-2 block text-sm font-bold text-slate-950">
              Consultation Date and Time
            </span>

            <input
              type="datetime-local"
              value={appointmentAt}
              onChange={(event) => {
                setAppointmentAt(
                  event.target.value,
                );
                clearMessages();
              }}
              disabled={isBusy}
              className="w-full rounded-lg border border-emerald-300 bg-white px-3 py-2 text-sm text-slate-950"
            />
          </label>

          <label className="mt-4 block">
            <span className="mb-2 block text-sm font-bold text-slate-950">
              Notes
            </span>

            <textarea
              value={notes}
              onChange={(event) => {
                setNotes(event.target.value);
                clearMessages();
              }}
              rows={3}
              disabled={isBusy}
              placeholder="Optional rescheduling or cancellation notes"
              className="w-full rounded-lg border border-emerald-300 bg-white px-3 py-2 text-sm text-slate-950"
            />
          </label>

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleCompleteVisit}
              disabled={isBusy}
              className="rounded-lg bg-emerald-700 px-5 py-2 text-sm font-bold text-white disabled:bg-emerald-300"
            >
              {activeAction ===
              "complete_visit"
                ? "Completing..."
                : "Mark Visit Complete"}
            </button>

            <button
              type="button"
              onClick={() =>
                void runWorkflowAction(
                  "reschedule_consultation",
                )
              }
              disabled={
                isBusy || !appointmentAt
              }
              className="rounded-lg border border-emerald-400 bg-white px-5 py-2 text-sm font-bold text-emerald-900 disabled:text-emerald-300"
            >
              {activeAction ===
              "reschedule_consultation"
                ? "Rescheduling..."
                : "Reschedule"}
            </button>

            <button
              type="button"
              onClick={() =>
                void runWorkflowAction(
                  "cancel_consultation",
                )
              }
              disabled={isBusy}
              className="rounded-lg border border-red-300 bg-white px-5 py-2 text-sm font-bold text-red-700 disabled:text-red-300"
            >
              {activeAction ===
              "cancel_consultation"
                ? "Canceling..."
                : "Cancel Consultation"}
            </button>
          </div>
        </section>
      ) : null}

      {showEstimateStage ? (
        <section className="rounded-xl border border-sky-300 bg-sky-50 p-5">
          <p className="text-xs font-bold uppercase tracking-widest text-sky-800">
            Current Stage
          </p>

          <h3 className="mt-1 text-xl font-bold text-slate-950">
            Estimate In Progress
          </h3>

          <p className="mt-2 text-sm leading-6 text-slate-700">
            Mark the original or revised estimate sent when it has been delivered to the customer.
          </p>

          <label className="mt-5 block">
            <span className="mb-2 block text-sm font-bold text-slate-950">
              Notes
            </span>

            <textarea
              value={notes}
              onChange={(event) => {
                setNotes(event.target.value);
                clearMessages();
              }}
              rows={3}
              disabled={isBusy}
              placeholder="Optional estimate notes"
              className="w-full rounded-lg border border-sky-300 bg-white px-3 py-2 text-sm text-slate-950"
            />
          </label>

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleSendEstimate}
              disabled={isBusy}
              className="rounded-lg bg-sky-700 px-5 py-2 text-sm font-bold text-white disabled:bg-sky-300"
            >
              {activeAction ===
              "send_estimate"
                ? "Updating..."
                : "Mark Estimate Sent"}
            </button>

            <button
              type="button"
              onClick={() =>
                void runWorkflowAction(
                  "revised_estimate_sent",
                )
              }
              disabled={isBusy}
              className="rounded-lg border border-sky-400 bg-white px-5 py-2 text-sm font-bold text-sky-900 disabled:text-sky-300"
            >
              {activeAction ===
              "revised_estimate_sent"
                ? "Updating..."
                : "Mark Revised Estimate Sent"}
            </button>
          </div>
        </section>
      ) : null}

      {showProposalStage ? (
        <section className="rounded-xl border border-violet-300 bg-violet-50 p-5">
          <p className="text-xs font-bold uppercase tracking-widest text-violet-800">
            Current Stage
          </p>

          <h3 className="mt-1 text-xl font-bold text-slate-950">
            Proposal Follow-Up
          </h3>

          <p className="mt-2 text-sm leading-6 text-slate-700">
            Record the result of the customer follow-up call.
          </p>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-sm font-bold text-slate-950">
                Call Notes
              </span>

              <textarea
                value={callNotes}
                onChange={(event) => {
                  setCallNotes(
                    event.target.value,
                  );
                  clearMessages();
                }}
                rows={3}
                disabled={isBusy}
                className="w-full rounded-lg border border-violet-300 bg-white px-3 py-2 text-sm text-slate-950"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-bold text-slate-950">
                Callback Date and Time
              </span>

              <input
                type="datetime-local"
                value={callbackAt}
                onChange={(event) => {
                  setCallbackAt(
                    event.target.value,
                  );
                  clearMessages();
                }}
                disabled={isBusy}
                className="w-full rounded-lg border border-violet-300 bg-white px-3 py-2 text-sm text-slate-950"
              />
            </label>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() =>
                void runWorkflowAction(
                  "start_call",
                )
              }
              disabled={isBusy}
              className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-bold text-white disabled:bg-slate-400"
            >
              {activeAction === "start_call"
                ? "Starting..."
                : "Start Call"}
            </button>

            <button
              type="button"
              onClick={() =>
                void handleCallOutcome("spoke")
              }
              disabled={isBusy}
              className="rounded-lg bg-violet-800 px-4 py-2 text-sm font-bold text-white disabled:bg-violet-300"
            >
              Spoke With Customer
            </button>

            <button
              type="button"
              onClick={() =>
                void handleCallOutcome(
                  "no_answer",
                )
              }
              disabled={isBusy}
              className="rounded-lg border border-violet-400 bg-white px-4 py-2 text-sm font-bold text-violet-900 disabled:text-violet-300"
            >
              No Answer
            </button>

            <button
              type="button"
              onClick={() =>
                void handleCallOutcome(
                  "left_voicemail",
                )
              }
              disabled={isBusy}
              className="rounded-lg border border-violet-400 bg-white px-4 py-2 text-sm font-bold text-violet-900 disabled:text-violet-300"
            >
              Left Voicemail
            </button>

            <button
              type="button"
              onClick={() =>
                void handleCallOutcome(
                  "callback_requested",
                )
              }
              disabled={
                isBusy || !callbackAt
              }
              className="rounded-lg border border-violet-400 bg-white px-4 py-2 text-sm font-bold text-violet-900 disabled:text-violet-300"
            >
              Call Back Requested
            </button>
          </div>

          <div className="mt-6 border-t border-violet-200 pt-5">
            <p className="text-sm font-bold text-slate-950">
              Customer decision
            </p>

            <div className="mt-3 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() =>
                  void runWorkflowAction(
                    "customer_reviewing",
                  )
                }
                disabled={isBusy}
                className="rounded-lg bg-indigo-700 px-4 py-2 text-sm font-bold text-white disabled:bg-indigo-300"
              >
                Customer Reviewing
              </button>

              <button
                type="button"
                onClick={() =>
                  void runWorkflowAction(
                    "revisions_requested",
                  )
                }
                disabled={isBusy}
                className="rounded-lg border border-sky-400 bg-white px-4 py-2 text-sm font-bold text-sky-900 disabled:text-sky-300"
              >
                Revisions Requested
              </button>

              <button
                type="button"
                onClick={() =>
                  void runWorkflowAction("won")
                }
                disabled={isBusy}
                className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-bold text-white disabled:bg-emerald-300"
              >
                Mark Won
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {showReviewingStage ? (
        <section className="rounded-xl border border-indigo-300 bg-indigo-50 p-5">
          <p className="text-xs font-bold uppercase tracking-widest text-indigo-800">
            Current Stage
          </p>

          <h3 className="mt-1 text-xl font-bold text-slate-950">
            Customer Reviewing
          </h3>

          <p className="mt-2 text-sm leading-6 text-slate-700">
            Schedule the next follow-up, record revisions, or close the lead.
          </p>

          <label className="mt-5 block">
            <span className="mb-2 block text-sm font-bold text-slate-950">
              Workflow Notes
            </span>

            <textarea
              value={notes}
              onChange={(event) => {
                setNotes(event.target.value);
                clearMessages();
              }}
              rows={3}
              disabled={isBusy}
              placeholder="Customer feedback, requested changes, or decision details"
              className="w-full rounded-lg border border-indigo-300 bg-white px-3 py-2 text-sm text-slate-950"
            />
          </label>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-sm font-bold text-slate-950">
                Next Follow-Up Date and Time
              </span>

              <input
                type="datetime-local"
                value={followUpAt}
                onChange={(event) => {
                  setFollowUpAt(
                    event.target.value,
                  );
                  clearMessages();
                }}
                disabled={isBusy}
                className="w-full rounded-lg border border-indigo-300 bg-white px-3 py-2 text-sm text-slate-950"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-bold text-slate-950">
                Lost Reason
              </span>

              <select
                value={lostReason}
                onChange={(event) => {
                  setLostReason(
                    event.target.value,
                  );
                  clearMessages();
                }}
                disabled={isBusy}
                className="w-full rounded-lg border border-indigo-300 bg-white px-3 py-2 text-sm text-slate-950"
              >
                <option value="">
                  Choose reason
                </option>

                {lostReasons.map(
                  (reason) => (
                    <option
                      key={reason}
                      value={reason}
                    >
                      {reason}
                    </option>
                  ),
                )}
              </select>
            </label>
          </div>

          {lostReason === "Other" ? (
            <label className="mt-4 block">
              <span className="mb-2 block text-sm font-bold text-slate-950">
                Other Lost Reason
              </span>

              <input
                type="text"
                value={customLostReason}
                onChange={(event) => {
                  setCustomLostReason(
                    event.target.value,
                  );
                  clearMessages();
                }}
                disabled={isBusy}
                className="w-full rounded-lg border border-indigo-300 bg-white px-3 py-2 text-sm text-slate-950"
              />
            </label>
          ) : null}

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() =>
                void runWorkflowAction(
                  "schedule_follow_up",
                )
              }
              disabled={
                isBusy || !followUpAt
              }
              className="rounded-lg bg-indigo-700 px-4 py-2 text-sm font-bold text-white disabled:bg-indigo-300"
            >
              {activeAction ===
              "schedule_follow_up"
                ? "Scheduling..."
                : "Schedule Next Follow-Up"}
            </button>

            <button
              type="button"
              onClick={() =>
                void runWorkflowAction(
                  "revisions_requested",
                )
              }
              disabled={isBusy}
              className="rounded-lg border border-sky-400 bg-white px-4 py-2 text-sm font-bold text-sky-900 disabled:text-sky-300"
            >
              Revisions Requested
            </button>

            <button
              type="button"
              onClick={() =>
                void runWorkflowAction("won")
              }
              disabled={isBusy}
              className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-bold text-white disabled:bg-emerald-300"
            >
              {activeAction === "won"
                ? "Closing..."
                : "Mark Won"}
            </button>

            <button
              type="button"
              onClick={handleLostLead}
              disabled={isBusy}
              className="rounded-lg bg-red-700 px-4 py-2 text-sm font-bold text-white disabled:bg-red-300"
            >
              {activeAction === "lost"
                ? "Closing..."
                : "Mark Lost"}
            </button>
          </div>
        </section>
      ) : null}

      {leadIsWon ? (
        <section className="rounded-xl border border-emerald-400 bg-emerald-100 p-5">
          <p className="text-xs font-bold uppercase tracking-widest text-emerald-800">
            Current Stage
          </p>

          <h3 className="mt-1 text-xl font-bold text-slate-950">
            Job Awarded
          </h3>

          <p className="mt-2 text-sm text-slate-700">
            This lead is ready for the future Convert to Project workflow.
          </p>

          <button
            type="button"
            disabled
            className="mt-4 rounded-lg bg-emerald-300 px-4 py-2 text-sm font-bold text-emerald-800"
          >
            Convert to Project — Coming Next
          </button>
        </section>
      ) : null}

      {leadIsLost ? (
        <section className="rounded-xl border border-red-300 bg-red-50 p-5">
          <p className="text-xs font-bold uppercase tracking-widest text-red-800">
            Current Stage
          </p>

          <h3 className="mt-1 text-xl font-bold text-slate-950">
            Lead Closed
          </h3>

          <p className="mt-2 text-sm text-slate-700">
            The lead is marked lost and its open sales tasks have been closed.
          </p>
        </section>
      ) : null}

      {message ? (
        <p className="rounded-lg bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
          {message}
        </p>
      ) : null}

      {errorMessage ? (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {errorMessage}
        </p>
      ) : null}

      <EmailDraftReview leadId={leadId} />
    </div>
  );
}