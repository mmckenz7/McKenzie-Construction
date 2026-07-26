"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type EmailDraftReviewProps = {
  leadId: string;
};

type EmailDraft = {
  id: string;
  lead_id: string;
  template_key: string | null;
  to_email: string | null;
  cc_email: string | null;
  subject: string | null;
  body: string | null;
  status: string;
  approved_at: string | null;
  sent_at: string | null;
  canceled_at: string | null;
  external_message_id: string | null;
  error_message: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

type DraftLookupResponse = {
  success?: boolean;
  hasDraft?: boolean;
  draft?: EmailDraft | null;
  error?: string;
};

type DraftUpdateResponse = {
  success?: boolean;
  action?: string;
  draft?: EmailDraft;
  nextFollowUpAt?: string | null;
  followUpTaskCreated?: boolean;
  error?: string;
};

export default function EmailDraftReview({
  leadId,
}: EmailDraftReviewProps) {
  const router = useRouter();

  const [draft, setDraft] = useState<EmailDraft | null>(
    null,
  );

  const [toEmail, setToEmail] = useState("");
  const [ccEmail, setCcEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");

  const [isLoading, setIsLoading] = useState(true);
  const [activeAction, setActiveAction] = useState<
    "save" | "approve" | "cancel" | "mark_sent" | null
  >(null);

  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const loadDraft = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage("");

    try {
      const response = await fetch(
        `/api/leads/${encodeURIComponent(
          leadId,
        )}/email-draft`,
        {
          method: "GET",
          cache: "no-store",
        },
      );

      const result =
        (await response.json()) as DraftLookupResponse;

      if (!response.ok || !result.success) {
        throw new Error(
          result.error ??
            "Unable to load the email draft.",
        );
      }

      if (!result.hasDraft || !result.draft) {
        setDraft(null);
        setToEmail("");
        setCcEmail("");
        setSubject("");
        setEmailBody("");
        return;
      }

      setDraft(result.draft);
      setToEmail(result.draft.to_email ?? "");
      setCcEmail(result.draft.cc_email ?? "");
      setSubject(result.draft.subject ?? "");
      setEmailBody(result.draft.body ?? "");
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to load the email draft.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [leadId]);

  useEffect(() => {
    void loadDraft();
  }, [loadDraft]);

  async function updateDraft(
    action:
      | "save"
      | "approve"
      | "cancel"
      | "mark_sent",
  ) {
    if (!draft) {
      setErrorMessage(
        "There is no email draft available.",
      );
      return;
    }

    if (
      action !== "cancel" &&
      action !== "mark_sent"
    ) {
      if (!toEmail.trim()) {
        setErrorMessage(
          "Enter the recipient email address.",
        );
        return;
      }

      if (!subject.trim()) {
        setErrorMessage("Enter an email subject.");
        return;
      }

      if (!emailBody.trim()) {
        setErrorMessage("Enter the email message.");
        return;
      }
    }

    setActiveAction(action);
    setMessage("");
    setErrorMessage("");

    try {
      const response = await fetch(
        `/api/email-drafts/${encodeURIComponent(
          draft.id,
        )}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action,
            toEmail,
            ccEmail,
            subject,
            body: emailBody,
          }),
        },
      );

      const result =
        (await response.json()) as DraftUpdateResponse;

      if (!response.ok || !result.success) {
        throw new Error(
          result.error ??
            "Unable to update the email draft.",
        );
      }

      if (action === "cancel") {
        setDraft(null);
        setToEmail("");
        setCcEmail("");
        setSubject("");
        setEmailBody("");
        setMessage("Email draft canceled.");
      } else if (action === "mark_sent") {
        setDraft(null);
        setToEmail("");
        setCcEmail("");
        setSubject("");
        setEmailBody("");

        setMessage(
          result.followUpTaskCreated
            ? "Email marked sent. The next phone follow-up was scheduled."
            : "Email marked sent.",
        );
      } else if (result.draft) {
        setDraft(result.draft);
        setToEmail(result.draft.to_email ?? "");
        setCcEmail(result.draft.cc_email ?? "");
        setSubject(result.draft.subject ?? "");
        setEmailBody(result.draft.body ?? "");

        setMessage(
          action === "approve"
            ? "Email draft approved. It is ready to send."
            : "Email draft saved.",
        );
      }

      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to update the email draft.",
      );
    } finally {
      setActiveAction(null);
    }
  }

  if (isLoading) {
    return (
      <section className="rounded-xl border border-orange-300 bg-orange-50 p-5">
        <p className="text-sm font-semibold text-orange-900">
          Loading email draft...
        </p>
      </section>
    );
  }

  if (!draft) {
    return (
      <section className="rounded-xl border border-slate-300 bg-slate-50 p-5">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-slate-600">
              Email Draft
            </p>

            <h3 className="mt-1 text-lg font-bold text-slate-950">
              No Draft Awaiting Review
            </h3>

            <p className="mt-1 text-sm leading-6 text-slate-700">
              A draft will appear here after a workflow action
              creates one.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void loadDraft()}
            className="shrink-0 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-800 transition hover:bg-slate-100"
          >
            Check for Draft
          </button>
        </div>

        {message ? (
          <p className="mt-4 text-sm font-semibold text-slate-700">
            {message}
          </p>
        ) : null}

        {errorMessage ? (
          <p className="mt-4 text-sm font-semibold text-red-700">
            {errorMessage}
          </p>
        ) : null}
      </section>
    );
  }

  const draftIsApproved =
    draft.status === "approved";

  const controlsAreDisabled =
    activeAction !== null;

  return (
    <section className="rounded-xl border border-orange-300 bg-orange-50 p-5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-orange-800">
            Email Draft Review
          </p>

          <h3 className="mt-1 text-lg font-bold text-slate-950">
            Review Customer Email
          </h3>

          <p className="mt-1 text-sm leading-6 text-slate-700">
            Review and edit this message before approving it.
            Until an email provider is connected, send it
            manually and then click Mark Sent.
          </p>
        </div>

        <span
          className={`inline-flex w-fit rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${
            draftIsApproved
              ? "bg-emerald-100 text-emerald-800"
              : "bg-orange-100 text-orange-800"
          }`}
        >
          {draftIsApproved
            ? "Approved"
            : "Draft"}
        </span>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-2 block text-sm font-bold text-slate-950">
            To
          </span>

          <input
            type="email"
            value={toEmail}
            onChange={(event) => {
              setToEmail(event.target.value);
              setMessage("");
              setErrorMessage("");
            }}
            disabled={controlsAreDisabled}
            className="w-full rounded-lg border border-orange-300 bg-white px-3 py-2 text-sm text-slate-950"
          />
        </label>

        <label className="block">
          <span className="mb-2 block text-sm font-bold text-slate-950">
            CC
          </span>

          <input
            type="email"
            value={ccEmail}
            onChange={(event) => {
              setCcEmail(event.target.value);
              setMessage("");
              setErrorMessage("");
            }}
            disabled={controlsAreDisabled}
            placeholder="Optional"
            className="w-full rounded-lg border border-orange-300 bg-white px-3 py-2 text-sm text-slate-950"
          />
        </label>
      </div>

      <label className="mt-4 block">
        <span className="mb-2 block text-sm font-bold text-slate-950">
          Subject
        </span>

        <input
          type="text"
          value={subject}
          onChange={(event) => {
            setSubject(event.target.value);
            setMessage("");
            setErrorMessage("");
          }}
          disabled={controlsAreDisabled}
          className="w-full rounded-lg border border-orange-300 bg-white px-3 py-2 text-sm text-slate-950"
        />
      </label>

      <label className="mt-4 block">
        <span className="mb-2 block text-sm font-bold text-slate-950">
          Message
        </span>

        <textarea
          value={emailBody}
          onChange={(event) => {
            setEmailBody(event.target.value);
            setMessage("");
            setErrorMessage("");
          }}
          disabled={controlsAreDisabled}
          rows={14}
          className="w-full rounded-lg border border-orange-300 bg-white px-3 py-2 text-sm leading-6 text-slate-950"
        />
      </label>

      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => void updateDraft("save")}
          disabled={controlsAreDisabled}
          className="rounded-lg border border-orange-400 bg-white px-4 py-2 text-sm font-bold text-orange-900 transition hover:bg-orange-100 disabled:cursor-not-allowed disabled:text-orange-300"
        >
          {activeAction === "save"
            ? "Saving..."
            : "Save Changes"}
        </button>

        {!draftIsApproved ? (
          <button
            type="button"
            onClick={() =>
              void updateDraft("approve")
            }
            disabled={controlsAreDisabled}
            className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-orange-500 disabled:cursor-not-allowed disabled:bg-orange-300"
          >
            {activeAction === "approve"
              ? "Approving..."
              : "Approve Draft"}
          </button>
        ) : (
          <button
            type="button"
            onClick={() =>
              void updateDraft("mark_sent")
            }
            disabled={controlsAreDisabled}
            className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-bold text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-emerald-300"
          >
            {activeAction === "mark_sent"
              ? "Updating..."
              : "Mark Sent"}
          </button>
        )}

        <button
          type="button"
          onClick={() => void updateDraft("cancel")}
          disabled={controlsAreDisabled}
          className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-bold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:text-red-300"
        >
          {activeAction === "cancel"
            ? "Canceling..."
            : "Cancel Draft"}
        </button>

        <button
          type="button"
          onClick={() => void loadDraft()}
          disabled={controlsAreDisabled}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-300"
        >
          Reload
        </button>
      </div>

      {message ? (
        <p className="mt-4 text-sm font-semibold text-emerald-800">
          {message}
        </p>
      ) : null}

      {errorMessage ? (
        <p className="mt-4 text-sm font-semibold text-red-700">
          {errorMessage}
        </p>
      ) : null}
    </section>
  );
}