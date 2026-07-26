"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import EmailDraftReview from "@/components/email-draft-review";

type LeadStatusFormProps = {
  leadId: string;
  currentStatus: string | null;
  currentConsultationStatus: string | null;
  currentFollowUpAt: string | null;
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

const leadStatuses = [
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  {
    value: "consultation_scheduled",
    label: "Consultation Scheduled",
  },
  {
    value: "estimate_in_progress",
    label: "Estimate In Progress",
  },
  {
    value: "proposal_sent",
    label: "Proposal Sent",
  },
  {
    value: "customer_reviewing",
    label: "Customer Reviewing",
  },
  { value: "won", label: "Won" },
  { value: "lost", label: "Lost" },
];

const consultationStatuses = [
  {
    value: "not_requested",
    label: "Not Requested",
  },
  {
    value: "pending",
    label: "Pending Confirmation",
  },
  {
    value: "confirmed",
    label: "Consultation Confirmed",
  },
  {
    value: "declined",
    label: "Declined or Canceled",
  },
  {
    value: "completed",
    label: "Completed",
  },
];

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

export default function LeadStatusForm({
  leadId,
  currentStatus,
  currentConsultationStatus,
  currentFollowUpAt,
}: LeadStatusFormProps) {
  const router = useRouter();

  const startingStatus = leadStatuses.some(
    (option) =>
      option.value === currentStatus,
  )
    ? currentStatus!
    : "new";

  const startingConsultationStatus =
    consultationStatuses.some(
      (option) =>
        option.value ===
        currentConsultationStatus,
    )
      ? currentConsultationStatus!
      : "not_requested";

  const [status, setStatus] = useState(
    startingStatus,
  );

  const [
    consultationStatus,
    setConsultationStatus,
  ] = useState(
    startingConsultationStatus,
  );

  const [followUpAt, setFollowUpAt] =
    useState(
      formatForDateTimeInput(
        currentFollowUpAt,
      ),
    );

  const [appointmentAt, setAppointmentAt] =
    useState(
      currentConsultationStatus ===
        "confirmed"
        ? formatForDateTimeInput(
            currentFollowUpAt,
          )
        : "",
    );

  const [
    workflowFollowUpAt,
    setWorkflowFollowUpAt,
  ] = useState("");

  const [callbackAt, setCallbackAt] =
    useState("");

  const [workflowNotes, setWorkflowNotes] =
    useState("");

  const [callNotes, setCallNotes] =
    useState("");

  const [lostReason, setLostReason] =
    useState("");

  const [
    customLostReason,
    setCustomLostReason,
  ] = useState("");

  const [statusMessage, setStatusMessage] =
    useState("");

  const [
    consultationMessage,
    setConsultationMessage,
  ] = useState("");

  const [
    followUpMessage,
    setFollowUpMessage,
  ] = useState("");

  const [
    confirmationMessage,
    setConfirmationMessage,
  ] = useState("");

  const [visitMessage, setVisitMessage] =
    useState("");

  const [
    estimateMessage,
    setEstimateMessage,
  ] = useState("");

  const [callMessage, setCallMessage] =
    useState("");

  const [
    workflowMessage,
    setWorkflowMessage,
  ] = useState("");

  const [
    workflowError,
    setWorkflowError,
  ] = useState("");

  const [
    isSavingStatus,
    setIsSavingStatus,
  ] = useState(false);

  const [
    isSavingConsultation,
    setIsSavingConsultation,
  ] = useState(false);

  const [
    isSavingFollowUp,
    setIsSavingFollowUp,
  ] = useState(false);

  const [
    isConfirmingConsultation,
    setIsConfirmingConsultation,
  ] = useState(false);

  const [
    isCompletingVisit,
    setIsCompletingVisit,
  ] = useState(false);

  const [
    isSendingEstimate,
    setIsSendingEstimate,
  ] = useState(false);

  const [
    isSavingCallOutcome,
    setIsSavingCallOutcome,
  ] = useState(false);

  const [
    activeWorkflowAction,
    setActiveWorkflowAction,
  ] = useState<WorkflowAction | null>(
    null,
  );

  async function patchLead(
    payload: Record<string, unknown>,
  ) {
    const response = await fetch(
      "/api/leads",
      {
        method: "PATCH",
        headers: {
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify({
          leadId,
          ...payload,
        }),
      },
    );

    const result = (await response.json()) as {
      success?: boolean;
      error?: string;
    };

    if (!response.ok || !result.success) {
      throw new Error(
        result.error ??
          "Unable to update the lead.",
      );
    }
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
    setActiveWorkflowAction(action);
    setWorkflowMessage("");
    setWorkflowError("");

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
              workflowFollowUpAt,
            notes:
              overrides?.notes ??
              workflowNotes,
            lostReason:
              overrides?.lostReason ??
              lostReason,
          }),
        },
      );

      const result =
        (await response.json()) as {
          success?: boolean;
          error?: string;
          appointmentAt?: string;
          estimateDueAt?: string;
          followUpAt?: string;
          emailDraftCreated?: boolean;
          canConvertToProject?: boolean;
          phone?: string | null;
        };

      if (!response.ok || !result.success) {
        throw new Error(
          result.error ??
            "Unable to complete the workflow action.",
        );
      }

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

          setFollowUpAt(
            formatForDateTimeInput(
              result.appointmentAt,
            ),
          );
        }

        setWorkflowMessage(
          result.emailDraftCreated
            ? "Consultation rescheduled. A customer email draft was created."
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
        setFollowUpAt("");

        setWorkflowMessage(
          result.emailDraftCreated
            ? "Consultation canceled. A customer email draft was created."
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

        if (result.estimateDueAt) {
          setFollowUpAt(
            formatForDateTimeInput(
              result.estimateDueAt,
            ),
          );
        }

        setWorkflowMessage(
          "Revisions recorded. A revised-estimate task was created.",
        );
      }

      if (
        action ===
        "revised_estimate_sent"
      ) {
        setStatus("proposal_sent");

        if (result.followUpAt) {
          setFollowUpAt(
            formatForDateTimeInput(
              result.followUpAt,
            ),
          );
        }

        setWorkflowMessage(
          "Revised estimate marked sent. The next phone follow-up was scheduled.",
        );
      }

      if (
        action ===
        "customer_reviewing"
      ) {
        setStatus(
          "customer_reviewing",
        );

        if (result.followUpAt) {
          setFollowUpAt(
            formatForDateTimeInput(
              result.followUpAt,
            ),
          );
        }

        setWorkflowMessage(
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

        if (result.followUpAt) {
          setFollowUpAt(
            formatForDateTimeInput(
              result.followUpAt,
            ),
          );
        }

        setWorkflowMessage(
          "The next follow-up was scheduled.",
        );
      }

      if (action === "start_call") {
        setWorkflowMessage(
          result.phone
            ? `Call activity started for ${result.phone}.`
            : "Call activity started.",
        );
      }

      if (action === "won") {
        setStatus("won");
        setFollowUpAt("");

        setWorkflowMessage(
          result.canConvertToProject
            ? "Lead marked won. It is ready to convert to a project."
            : "Lead marked won.",
        );
      }

      if (action === "lost") {
        setStatus("lost");
        setFollowUpAt("");

        setWorkflowMessage(
          "Lead marked lost and all open sales tasks were closed.",
        );
      }

      setWorkflowNotes("");

      if (
        action === "schedule_follow_up"
      ) {
        setWorkflowFollowUpAt("");
      }

      router.refresh();
    } catch (error) {
      setWorkflowError(
        error instanceof Error
          ? error.message
          : "Unable to complete the workflow action.",
      );
    } finally {
      setActiveWorkflowAction(null);
    }
  }

  async function handleConfirmConsultation(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!appointmentAt) {
      setConfirmationMessage(
        "Choose the confirmed consultation date and time.",
      );
      return;
    }

    setIsConfirmingConsultation(true);
    setConfirmationMessage("");

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
        (await response.json()) as {
          success?: boolean;
          error?: string;
          appointmentAt?: string;
          emailDraftCreated?: boolean;
        };

      if (!response.ok || !result.success) {
        throw new Error(
          result.error ??
            "Unable to confirm the consultation.",
        );
      }

      setStatus(
        "consultation_scheduled",
      );
      setConsultationStatus(
        "confirmed",
      );

      const confirmedDate =
        result.appointmentAt ??
        appointmentAt;

      setFollowUpAt(
        formatForDateTimeInput(
          confirmedDate,
        ),
      );

      setConfirmationMessage(
        result.emailDraftCreated
          ? "Consultation confirmed. The site-visit task and confirmation email draft were created."
          : "Consultation confirmed and the site-visit task was created.",
      );

      router.refresh();
    } catch (error) {
      setConfirmationMessage(
        error instanceof Error
          ? error.message
          : "Unable to confirm the consultation.",
      );
    } finally {
      setIsConfirmingConsultation(
        false,
      );
    }
  }

  async function handleCompleteVisit() {
    setIsCompletingVisit(true);
    setVisitMessage("");

    try {
      const response = await fetch(
        `/api/leads/${encodeURIComponent(
          leadId,
        )}/complete-consultation`,
        {
          method: "POST",
        },
      );

      const result =
        (await response.json()) as {
          success?: boolean;
          error?: string;
          estimateDueAt?: string;
          estimateTaskCreated?: boolean;
        };

      if (!response.ok || !result.success) {
        throw new Error(
          result.error ??
            "Unable to complete the consultation.",
        );
      }

      setStatus(
        "estimate_in_progress",
      );
      setConsultationStatus(
        "completed",
      );

      if (result.estimateDueAt) {
        setFollowUpAt(
          formatForDateTimeInput(
            result.estimateDueAt,
          ),
        );
      }

      setVisitMessage(
        result.estimateTaskCreated
          ? "Visit completed. The estimate task was created."
          : "Visit completed and the lead moved to Estimate In Progress.",
      );

      router.refresh();
    } catch (error) {
      setVisitMessage(
        error instanceof Error
          ? error.message
          : "Unable to complete the consultation.",
      );
    } finally {
      setIsCompletingVisit(false);
    }
  }

  async function handleSendEstimate() {
    setIsSendingEstimate(true);
    setEstimateMessage("");

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
        (await response.json()) as {
          success?: boolean;
          error?: string;
          followUpAt?: string;
          followUpTaskCreated?: boolean;
        };

      if (!response.ok || !result.success) {
        throw new Error(
          result.error ??
            "Unable to mark the estimate sent.",
        );
      }

      setStatus("proposal_sent");

      if (result.followUpAt) {
        setFollowUpAt(
          formatForDateTimeInput(
            result.followUpAt,
          ),
        );
      }

      setEstimateMessage(
        result.followUpTaskCreated
          ? "Estimate marked sent. The first phone follow-up was scheduled."
          : "Estimate marked sent.",
      );

      router.refresh();
    } catch (error) {
      setEstimateMessage(
        error instanceof Error
          ? error.message
          : "Unable to mark the estimate sent.",
      );
    } finally {
      setIsSendingEstimate(false);
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
      setCallMessage(
        "Choose the requested callback date and time.",
      );
      return;
    }

    setIsSavingCallOutcome(true);
    setCallMessage("");

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
        (await response.json()) as {
          success?: boolean;
          error?: string;
          emailDraftCreated?: boolean;
          callbackTaskCreated?: boolean;
          nextFollowUpAt?: string | null;
        };

      if (!response.ok || !result.success) {
        throw new Error(
          result.error ??
            "Unable to save the call outcome.",
        );
      }

      if (result.nextFollowUpAt) {
        setFollowUpAt(
          formatForDateTimeInput(
            result.nextFollowUpAt,
          ),
        );
      } else if (outcome === "spoke") {
        setFollowUpAt("");
      }

      if (outcome === "no_answer") {
        setCallMessage(
          result.emailDraftCreated
            ? "No answer logged. A follow-up email draft was created."
            : "No answer logged.",
        );
      }

      if (
        outcome === "left_voicemail"
      ) {
        setCallMessage(
          result.emailDraftCreated
            ? "Voicemail logged. A follow-up email draft was created."
            : "Voicemail logged.",
        );
      }

      if (
        outcome ===
        "callback_requested"
      ) {
        setCallMessage(
          result.callbackTaskCreated
            ? "Callback task scheduled."
            : "Callback request logged.",
        );
      }

      if (outcome === "spoke") {
        setCallMessage(
          "Call logged as spoke with customer.",
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
      setCallMessage(
        error instanceof Error
          ? error.message
          : "Unable to save the call outcome.",
      );
    } finally {
      setIsSavingCallOutcome(false);
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
        consultation_status:
          consultationStatus,
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

      setFollowUpMessage(
        "Follow-up saved.",
      );

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
      setFollowUpMessage(
        "Follow-up cleared.",
      );

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

  function handleLostLead() {
    const finalReason =
      lostReason === "Other"
        ? customLostReason.trim()
        : lostReason;

    if (!finalReason) {
      setWorkflowError(
        "Choose or enter a lost reason.",
      );
      return;
    }

    void runWorkflowAction("lost", {
      lostReason: finalReason,
    });
  }

  const canCompleteVisit =
    status === "consultation_scheduled" &&
    consultationStatus === "confirmed";

  const visitIsCompleted =
    consultationStatus === "completed";

  const canSendEstimate =
    status === "estimate_in_progress";

  const estimateIsSent =
    status === "proposal_sent" ||
    status === "customer_reviewing";

  const canRecordCallOutcome =
    status === "proposal_sent" ||
    status === "customer_reviewing";

  const leadIsClosed =
    status === "won" ||
    status === "lost";

  const workflowIsBusy =
    activeWorkflowAction !== null;

  return (
    <div className="space-y-6">
      {!leadIsClosed ? (
        <section className="rounded-xl border border-amber-300 bg-amber-50 p-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-amber-800">
              Consultation
            </p>

            <h3 className="mt-1 text-lg font-bold text-slate-950">
              Confirm, Reschedule, or Cancel
            </h3>
          </div>

          <form
            onSubmit={handleConfirmConsultation}
            className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end"
          >
            <label className="block flex-1">
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
                  setConfirmationMessage("");
                  setWorkflowMessage("");
                  setWorkflowError("");
                }}
                disabled={
                  isConfirmingConsultation ||
                  workflowIsBusy
                }
                className="w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm text-slate-950"
              />
            </label>

            <button
              type="submit"
              disabled={
                isConfirmingConsultation ||
                workflowIsBusy ||
                !appointmentAt
              }
              className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-slate-950 disabled:bg-amber-200 disabled:text-slate-500"
            >
              {isConfirmingConsultation
                ? "Confirming..."
                : consultationStatus ===
                    "confirmed"
                  ? "Update Confirmation"
                  : "Confirm Consultation"}
            </button>

            <button
              type="button"
              onClick={() =>
                void runWorkflowAction(
                  "reschedule_consultation",
                )
              }
              disabled={
                workflowIsBusy ||
                !appointmentAt ||
                consultationStatus !==
                  "confirmed"
              }
              className="rounded-lg border border-amber-400 bg-white px-4 py-2 text-sm font-bold text-amber-900 disabled:text-amber-300"
            >
              {activeWorkflowAction ===
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
              disabled={
                workflowIsBusy ||
                consultationStatus !==
                  "confirmed"
              }
              className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-bold text-red-700 disabled:text-red-300"
            >
              {activeWorkflowAction ===
              "cancel_consultation"
                ? "Canceling..."
                : "Cancel Consultation"}
            </button>
          </form>

          {confirmationMessage ? (
            <p className="mt-3 text-sm font-semibold text-slate-700">
              {confirmationMessage}
            </p>
          ) : null}
        </section>
      ) : null}

      {!leadIsClosed ? (
        <section className="rounded-xl border border-emerald-300 bg-emerald-50 p-5">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-emerald-800">
                Site Visit
              </p>

              <h3 className="mt-1 text-lg font-bold text-slate-950">
                Consultation Visit Complete
              </h3>
            </div>

            <button
              type="button"
              onClick={handleCompleteVisit}
              disabled={
                isCompletingVisit ||
                (!canCompleteVisit &&
                  !visitIsCompleted)
              }
              className="rounded-lg bg-emerald-700 px-5 py-2 text-sm font-bold text-white disabled:bg-emerald-200 disabled:text-emerald-700"
            >
              {isCompletingVisit
                ? "Completing..."
                : visitIsCompleted
                  ? "Visit Completed"
                  : "Mark Visit Complete"}
            </button>
          </div>

          {!canCompleteVisit &&
          !visitIsCompleted ? (
            <p className="mt-3 text-sm text-emerald-900">
              Confirm the consultation before marking the visit complete.
            </p>
          ) : null}

          {visitMessage ? (
            <p className="mt-3 text-sm font-semibold text-slate-700">
              {visitMessage}
            </p>
          ) : null}
        </section>
      ) : null}

      {!leadIsClosed ? (
        <section className="rounded-xl border border-sky-300 bg-sky-50 p-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-sky-800">
              Estimate
            </p>

            <h3 className="mt-1 text-lg font-bold text-slate-950">
              Estimate and Revision Actions
            </h3>
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleSendEstimate}
              disabled={
                isSendingEstimate ||
                workflowIsBusy ||
                (!canSendEstimate &&
                  !estimateIsSent)
              }
              className="rounded-lg bg-sky-700 px-4 py-2 text-sm font-bold text-white disabled:bg-sky-200 disabled:text-sky-700"
            >
              {isSendingEstimate
                ? "Updating..."
                : estimateIsSent
                  ? "Estimate Sent"
                  : "Mark Estimate Sent"}
            </button>

            <button
              type="button"
              onClick={() =>
                void runWorkflowAction(
                  "revisions_requested",
                )
              }
              disabled={
                workflowIsBusy ||
                !estimateIsSent
              }
              className="rounded-lg border border-sky-400 bg-white px-4 py-2 text-sm font-bold text-sky-900 disabled:text-sky-300"
            >
              {activeWorkflowAction ===
              "revisions_requested"
                ? "Updating..."
                : "Revisions Requested"}
            </button>

            <button
              type="button"
              onClick={() =>
                void runWorkflowAction(
                  "revised_estimate_sent",
                )
              }
              disabled={
                workflowIsBusy ||
                status !==
                  "estimate_in_progress"
              }
              className="rounded-lg border border-sky-400 bg-white px-4 py-2 text-sm font-bold text-sky-900 disabled:text-sky-300"
            >
              {activeWorkflowAction ===
              "revised_estimate_sent"
                ? "Updating..."
                : "Mark Revised Estimate Sent"}
            </button>
          </div>

          {estimateMessage ? (
            <p className="mt-3 text-sm font-semibold text-slate-700">
              {estimateMessage}
            </p>
          ) : null}
        </section>
      ) : null}

      {!leadIsClosed ? (
        <section className="rounded-xl border border-violet-300 bg-violet-50 p-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-violet-800">
              Phone Follow-Up
            </p>

            <h3 className="mt-1 text-lg font-bold text-slate-950">
              Record Customer Call
            </h3>
          </div>

          {!canRecordCallOutcome ? (
            <p className="mt-4 text-sm text-violet-900">
              Mark the estimate sent before recording a follow-up call.
            </p>
          ) : (
            <>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
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
                      setCallMessage("");
                    }}
                    rows={3}
                    disabled={
                      isSavingCallOutcome ||
                      workflowIsBusy
                    }
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
                      setCallMessage("");
                    }}
                    disabled={
                      isSavingCallOutcome ||
                      workflowIsBusy
                    }
                    className="w-full rounded-lg border border-violet-300 bg-white px-3 py-2 text-sm text-slate-950"
                  />
                </label>
              </div>

              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() =>
                    void runWorkflowAction(
                      "start_call",
                    )
                  }
                  disabled={workflowIsBusy}
                  className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-bold text-white disabled:bg-slate-400"
                >
                  {activeWorkflowAction ===
                  "start_call"
                    ? "Starting..."
                    : "Start Call"}
                </button>

                <button
                  type="button"
                  onClick={() =>
                    void handleCallOutcome(
                      "spoke",
                    )
                  }
                  disabled={
                    isSavingCallOutcome ||
                    workflowIsBusy
                  }
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
                  disabled={
                    isSavingCallOutcome ||
                    workflowIsBusy
                  }
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
                  disabled={
                    isSavingCallOutcome ||
                    workflowIsBusy
                  }
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
                    isSavingCallOutcome ||
                    workflowIsBusy ||
                    !callbackAt
                  }
                  className="rounded-lg border border-violet-400 bg-white px-4 py-2 text-sm font-bold text-violet-900 disabled:text-violet-300"
                >
                  Call Back Requested
                </button>
              </div>
            </>
          )}

          {callMessage ? (
            <p className="mt-4 text-sm font-semibold text-slate-700">
              {callMessage}
            </p>
          ) : null}
        </section>
      ) : null}

      {!leadIsClosed &&
      canRecordCallOutcome ? (
        <section className="rounded-xl border border-indigo-300 bg-indigo-50 p-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-indigo-800">
              Proposal Decision
            </p>

            <h3 className="mt-1 text-lg font-bold text-slate-950">
              Reviewing, Follow-Up, Won, or Lost
            </h3>
          </div>

          <label className="mt-4 block">
            <span className="mb-2 block text-sm font-bold text-slate-950">
              Workflow Notes
            </span>

            <textarea
              value={workflowNotes}
              onChange={(event) => {
                setWorkflowNotes(
                  event.target.value,
                );
                setWorkflowMessage("");
                setWorkflowError("");
              }}
              rows={3}
              disabled={workflowIsBusy}
              placeholder="Customer feedback, requested changes, decision details, or other notes"
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
                value={workflowFollowUpAt}
                onChange={(event) => {
                  setWorkflowFollowUpAt(
                    event.target.value,
                  );
                  setWorkflowMessage("");
                  setWorkflowError("");
                }}
                disabled={workflowIsBusy}
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
                  setWorkflowMessage("");
                  setWorkflowError("");
                }}
                disabled={workflowIsBusy}
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
                  setWorkflowError("");
                }}
                disabled={workflowIsBusy}
                className="w-full rounded-lg border border-indigo-300 bg-white px-3 py-2 text-sm text-slate-950"
              />
            </label>
          ) : null}

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() =>
                void runWorkflowAction(
                  "customer_reviewing",
                )
              }
              disabled={workflowIsBusy}
              className="rounded-lg bg-indigo-700 px-4 py-2 text-sm font-bold text-white disabled:bg-indigo-300"
            >
              {activeWorkflowAction ===
              "customer_reviewing"
                ? "Updating..."
                : "Customer Reviewing"}
            </button>

            <button
              type="button"
              onClick={() =>
                void runWorkflowAction(
                  "schedule_follow_up",
                )
              }
              disabled={
                workflowIsBusy ||
                !workflowFollowUpAt
              }
              className="rounded-lg border border-indigo-400 bg-white px-4 py-2 text-sm font-bold text-indigo-900 disabled:text-indigo-300"
            >
              {activeWorkflowAction ===
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
              disabled={workflowIsBusy}
              className="rounded-lg border border-sky-400 bg-white px-4 py-2 text-sm font-bold text-sky-900 disabled:text-sky-300"
            >
              Revisions Requested
            </button>

            <button
              type="button"
              onClick={() =>
                void runWorkflowAction(
                  "won",
                )
              }
              disabled={workflowIsBusy}
              className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-bold text-white disabled:bg-emerald-300"
            >
              {activeWorkflowAction ===
              "won"
                ? "Closing..."
                : "Mark Won"}
            </button>

            <button
              type="button"
              onClick={handleLostLead}
              disabled={workflowIsBusy}
              className="rounded-lg bg-red-700 px-4 py-2 text-sm font-bold text-white disabled:bg-red-300"
            >
              {activeWorkflowAction ===
              "lost"
                ? "Closing..."
                : "Mark Lost"}
            </button>
          </div>
        </section>
      ) : null}

      {status === "won" ? (
        <section className="rounded-xl border border-emerald-400 bg-emerald-100 p-5">
          <p className="text-xs font-bold uppercase tracking-widest text-emerald-800">
            Won
          </p>

          <h3 className="mt-1 text-lg font-bold text-slate-950">
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

      {status === "lost" ? (
        <section className="rounded-xl border border-red-300 bg-red-50 p-5">
          <p className="text-xs font-bold uppercase tracking-widest text-red-800">
            Lost
          </p>

          <h3 className="mt-1 text-lg font-bold text-slate-950">
            Lead Closed
          </h3>

          <p className="mt-2 text-sm text-slate-700">
            Open sales tasks and follow-ups have been closed.
          </p>
        </section>
      ) : null}

      {workflowMessage ? (
        <p className="rounded-lg bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
          {workflowMessage}
        </p>
      ) : null}

      {workflowError ? (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {workflowError}
        </p>
      ) : null}

      <EmailDraftReview leadId={leadId} />

      <section className="rounded-xl border border-slate-300 bg-slate-50 p-5">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-slate-600">
            Manual Override
          </p>

          <h3 className="mt-1 text-lg font-bold text-slate-950">
            Lead Record Controls
          </h3>

          <p className="mt-1 text-sm text-slate-600">
            Use these only when the normal workflow buttons do not fit the situation.
          </p>
        </div>

        <div className="mt-5 grid gap-6 lg:grid-cols-3">
          <form
            onSubmit={handleStatusSubmit}
          >
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
                setStatus(
                  event.target.value,
                );
                setStatusMessage("");
              }}
              disabled={isSavingStatus}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
            >
              {leadStatuses.map(
                (option) => (
                  <option
                    key={option.value}
                    value={option.value}
                  >
                    {option.label}
                  </option>
                ),
              )}
            </select>

            <button
              type="submit"
              disabled={isSavingStatus}
              className="mt-3 rounded-lg bg-slate-950 px-5 py-2 text-sm font-semibold text-white disabled:bg-slate-400"
            >
              {isSavingStatus
                ? "Saving..."
                : "Save Status"}
            </button>

            {statusMessage ? (
              <p className="mt-2 text-sm font-semibold text-slate-700">
                {statusMessage}
              </p>
            ) : null}
          </form>

          <form
            onSubmit={
              handleConsultationSubmit
            }
          >
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
                setConsultationStatus(
                  event.target.value,
                );
                setConsultationMessage("");
              }}
              disabled={
                isSavingConsultation
              }
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
            >
              {consultationStatuses.map(
                (option) => (
                  <option
                    key={option.value}
                    value={option.value}
                  >
                    {option.label}
                  </option>
                ),
              )}
            </select>

            <button
              type="submit"
              disabled={
                isSavingConsultation
              }
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

          <form
            onSubmit={handleFollowUpSubmit}
          >
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
                setFollowUpAt(
                  event.target.value,
                );
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
                onClick={
                  handleClearFollowUp
                }
                disabled={
                  isSavingFollowUp ||
                  !followUpAt
                }
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
      </section>
    </div>
  );
}