"use client";

import { useEffect, useState } from "react";

type ContractPreparation = {
  id: string;
  status: string;
  recipientName: string;
  recipientEmail: string | null;
  legalTermsStatus: string;
  legalDocumentTitle: string | null;
  legalDocumentVersion: string | null;
  legalDocumentReviewStatus: string | null;
};

type ContractAuditEvent = {
  id: string;
  eventType: string;
  actorName: string;
  previousRecipientName: string | null;
  previousRecipientEmail: string | null;
  recipientName: string | null;
  recipientEmail: string | null;
  createdAt: string;
};

type ContractResponse = {
  success?: boolean;
  error?: string;
  contractPreparation?: ContractPreparation | null;
  auditHistoryAvailable?: boolean;
  auditEvents?: ContractAuditEvent[];
};

const button = "rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50";

export function ContractPreparationCard({ estimateId, estimateStatus }: { estimateId: string; estimateStatus: string }) {
  const [preparation, setPreparation] = useState<ContractPreparation | null>(null);
  const [recipientName, setRecipientName] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [auditEvents, setAuditEvents] = useState<ContractAuditEvent[]>([]);
  const [auditHistoryAvailable, setAuditHistoryAvailable] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  function applyPreparation(next: ContractPreparation) {
    setPreparation(next);
    setRecipientName(next.recipientName);
    setRecipientEmail(next.recipientEmail ?? "");
  }

  useEffect(() => {
    if (estimateStatus !== "accepted") return;
    let active = true;
    void (async () => {
      try {
        const response = await fetch(`/api/estimates/${encodeURIComponent(estimateId)}/contract-preparation`, { cache: "no-store" });
        const body = await response.json() as ContractResponse;
        if (!response.ok) throw new Error(body.error ?? "Contract preparation could not be loaded.");
        if (active && body.contractPreparation) {
          setPreparation(body.contractPreparation);
          setRecipientName(body.contractPreparation.recipientName);
          setRecipientEmail(body.contractPreparation.recipientEmail ?? "");
        }
        if (active) {
          setAuditEvents(body.auditEvents ?? []);
          setAuditHistoryAvailable(body.auditHistoryAvailable !== false);
        }
      } catch (requestError) {
        if (active) setError(requestError instanceof Error ? requestError.message : "Contract preparation could not be loaded.");
      }
    })();
    return () => { active = false; };
  }, [estimateId, estimateStatus]);

  if (estimateStatus !== "accepted" && !preparation) return null;

  async function prepare() {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/estimates/${encodeURIComponent(estimateId)}/contract-preparation`, { method: "POST" });
      const body = await response.json() as ContractResponse;
      if (!response.ok || !body.contractPreparation) throw new Error(body.error ?? "Contract preparation could not be created.");
      applyPreparation(body.contractPreparation);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Contract preparation could not be created.");
    } finally {
      setPending(false);
    }
  }

  async function refreshLegalDocument() {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/estimates/${encodeURIComponent(estimateId)}/contract-preparation`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "refresh_legal_document" }),
      });
      const body = await response.json() as ContractResponse;
      if (!response.ok || !body.contractPreparation) throw new Error(body.error ?? "The legal document could not be selected.");
      applyPreparation(body.contractPreparation);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The legal document could not be selected.");
    } finally {
      setPending(false);
    }
  }

  async function saveRecipient() {
    if (pending || !preparation) return;
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/estimates/${encodeURIComponent(estimateId)}/contract-preparation`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update_recipient", recipientName, recipientEmail }),
      });
      const body = await response.json() as ContractResponse;
      if (!response.ok || !body.contractPreparation) throw new Error(body.error ?? "Recipient details could not be updated.");
      applyPreparation(body.contractPreparation);
      if (body.auditEvents) setAuditEvents(body.auditEvents);
      setAuditHistoryAvailable(body.auditHistoryAvailable !== false);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Recipient details could not be updated.");
    } finally {
      setPending(false);
    }
  }

  const editable = preparation?.status === "draft" || preparation?.status === "ready_for_signature";
  const readinessLabel = preparation?.legalTermsStatus !== "approved"
    ? "Legal review required"
    : !preparation.recipientEmail
      ? "Recipient email required"
      : preparation.status === "ready_for_signature"
        ? "Ready for signature"
        : preparation.status.replaceAll("_", " ");
  const input = "mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 disabled:bg-slate-100";

  return <section className="rounded-2xl border border-amber-300 bg-amber-50 p-6 shadow-sm">
    <p className="text-xs font-bold uppercase tracking-[.18em] text-amber-800">Next step after estimate acceptance</p>
    <h2 className="mt-2 text-2xl font-bold text-slate-950">Prepare the construction contract</h2>
    <p className="mt-2 max-w-3xl text-sm text-slate-700">
      Estimate acceptance records the customer&apos;s nonbinding intent to proceed. Work is not authorized until a separate contract is prepared, reviewed, and electronically signed.
    </p>
    {preparation ? <div className="mt-5 rounded-xl border border-amber-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="font-bold text-slate-950">Contract draft created for {preparation.recipientName}</p><p className="mt-1 text-sm text-slate-600">{preparation.recipientEmail ?? "Recipient email still required"}</p></div>
        <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold uppercase text-amber-900">
          {readinessLabel}
        </span>
      </div>
      {preparation.legalDocumentTitle ? <p className="mt-3 text-sm font-semibold text-slate-800">
        {preparation.legalDocumentTitle}{preparation.legalDocumentVersion ? ` · Version ${preparation.legalDocumentVersion}` : ""}
      </p> : null}
      <p className="mt-2 text-sm text-slate-700">The accepted customer estimate and selected legal-document version are frozen in this package. Sending stays locked until the selected version is attorney-reviewed.</p>
      {editable ? <>
        <div className="mt-5 grid gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4 md:grid-cols-2">
          <label className="text-sm font-bold text-slate-800">Recipient name
            <input value={recipientName} onChange={(event) => setRecipientName(event.target.value)} maxLength={240} disabled={pending} className={input} />
          </label>
          <label className="text-sm font-bold text-slate-800">Recipient email
            <input value={recipientEmail} onChange={(event) => setRecipientEmail(event.target.value)} type="email" maxLength={320} disabled={pending} className={input} />
          </label>
          <div className="md:col-span-2">
            <button type="button" className={button} disabled={pending || !recipientName.trim()} onClick={() => void saveRecipient()}>
              {pending ? "Saving…" : "Save recipient"}
            </button>
            <p className="mt-2 text-xs text-slate-600">Changes are locked when signature sending begins and are recorded in the contract audit history.</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <button type="button" className={button} disabled={pending} onClick={() => void refreshLegalDocument()}>
            {pending ? "Updating…" : preparation.legalDocumentTitle ? "Refresh from company default" : "Use company default contract"}
          </button>
          <a href="/admin/settings/legal-documents" className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800">Manage legal documents</a>
        </div>
      </> : <p className="mt-4 text-sm font-semibold text-slate-700">Recipient and legal-document details are locked because signature sending has begun.</p>}
      <div className="mt-5 border-t border-slate-200 pt-4">
        <h3 className="text-sm font-bold text-slate-950">Recipient change history</h3>
        {!auditHistoryAvailable ? <p className="mt-2 text-sm text-slate-600">Audit history is temporarily unavailable. Recipient editing remains protected by the database audit boundary.</p>
          : auditEvents.length ? <ol className="mt-3 space-y-3">{auditEvents.map((event) => <li key={event.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
            <p className="font-semibold text-slate-900">Updated by {event.actorName}</p>
            <p className="mt-1 text-slate-700">
              {event.previousRecipientName ?? "No name"} · {event.previousRecipientEmail ?? "No email"}
              <span aria-hidden="true"> → </span>
              {event.recipientName ?? "No name"} · {event.recipientEmail ?? "No email"}
            </p>
            <time dateTime={event.createdAt} className="mt-1 block text-xs text-slate-500">{new Date(event.createdAt).toLocaleString()}</time>
          </li>)}</ol>
            : <p className="mt-2 text-sm text-slate-600">No recipient changes have been recorded.</p>}
      </div>
    </div> : <button type="button" className={`mt-5 ${button}`} disabled={pending} onClick={() => void prepare()}>{pending ? "Preparing…" : "Prepare contract draft"}</button>}
    {error ? <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-800">{error}</p> : null}
  </section>;
}
