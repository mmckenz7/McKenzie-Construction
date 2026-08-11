"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Proposal = {
  id: string;
  leadId: string | null;
  status: string;
  customerName: string;
  customerEmail: string | null;
  expiresAt: string;
  issuedAt: string;
  openedAt: string | null;
  respondedAt: string | null;
  response: string | null;
  responseName: string | null;
  publicUrl: string | null;
};

type ProposalResponse = { success?: boolean; error?: string; proposal?: Proposal | null };
type DraftResponse = { success?: boolean; error?: string; created?: boolean; draft?: { id: string; leadId: string; status: string } };
const primary = "rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50";
const secondary = "rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 disabled:opacity-50";

function label(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

export function EstimateProposalCard({ estimateId, estimateStatus }: { estimateId: string; estimateStatus: string }) {
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetch(`/api/estimates/${encodeURIComponent(estimateId)}/proposal`, { cache: "no-store" });
        const body = await response.json() as ProposalResponse;
        if (!response.ok) throw new Error(body.error ?? "Customer estimate link could not be loaded.");
        if (active) setProposal(body.proposal ?? null);
      } catch (requestError) {
        if (active) setError(requestError instanceof Error ? requestError.message : "Customer estimate link could not be loaded.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [estimateId]);

  async function issue() {
    setPending(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/estimates/${encodeURIComponent(estimateId)}/proposal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expiresInDays: 30 }),
      });
      const body = await response.json() as ProposalResponse;
      if (!response.ok || !body.proposal) throw new Error(body.error ?? "Customer estimate link could not be created.");
      setProposal(body.proposal);
      window.location.reload();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Customer estimate link could not be created.");
      setPending(false);
    }
  }

  async function copyLink() {
    if (!proposal?.publicUrl) return;
    try {
      await navigator.clipboard.writeText(proposal.publicUrl);
      setNotice("Customer link copied.");
    } catch {
      setError("The browser could not copy the link. Select and copy it manually.");
    }
  }

  async function createEmailDraft() {
    setPending(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/estimates/${encodeURIComponent(estimateId)}/proposal-email-draft`, {
        method: "POST",
      });
      const body = await response.json() as DraftResponse;
      if (!response.ok || !body.draft) throw new Error(body.error ?? "The customer email draft could not be created.");
      setNotice(body.created
        ? "Email draft created. Review and approve it from the customer lead before sending."
        : body.draft.status === "sent"
          ? "This estimate email was already sent."
          : "The existing email draft is ready on the customer lead.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The customer email draft could not be created.");
    } finally {
      setPending(false);
    }
  }

  async function revoke() {
    if (!window.confirm("Revoke this customer link and reopen the estimate for editing?")) return;
    setPending(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/estimates/${encodeURIComponent(estimateId)}/proposal`, { method: "DELETE" });
      const body = await response.json() as ProposalResponse;
      if (!response.ok) throw new Error(body.error ?? "Customer estimate link could not be revoked.");
      window.location.reload();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Customer estimate link could not be revoked.");
      setPending(false);
    }
  }

  const canIssue = estimateStatus === "draft" || estimateStatus === "reviewing";
  const active = proposal && (proposal.status === "issued" || proposal.status === "viewed");
  const expired = Boolean(active && new Date(proposal.expiresAt).getTime() <= Date.now());

  return <section className="rounded-2xl border border-blue-200 bg-blue-50 p-6 shadow-sm">
    <p className="text-xs font-bold uppercase tracking-[.18em] text-blue-700">Customer estimate</p>
    <h2 className="mt-2 text-2xl font-bold text-slate-950">Issue a secure customer link</h2>
    <p className="mt-2 max-w-3xl text-sm text-slate-700">The link freezes the current customer presentation for 30 days. Creating it locks estimate editing until the link is revoked or the customer responds.</p>

    {loading ? <p className="mt-5 text-sm font-semibold text-slate-600">Checking customer link…</p> : proposal && proposal.status !== "revoked" ? <div className="mt-5 rounded-xl border border-blue-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="font-bold text-slate-950">{proposal.customerName}</p><p className="mt-1 text-sm text-slate-600">{proposal.customerEmail ?? "No customer email saved"}</p></div><span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-bold uppercase text-blue-900">{expired ? "Expired" : label(proposal.status)}</span></div>
      {proposal.publicUrl ? <input readOnly aria-label="Customer estimate link" value={proposal.publicUrl} className="mt-4 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700" /> : null}
      <div className="mt-4 flex flex-wrap gap-3">
        {proposal.publicUrl ? <button type="button" className={primary} onClick={() => void copyLink()}>Copy link</button> : null}
        {active && !expired && proposal.customerEmail && proposal.leadId ? <button type="button" disabled={pending} className={primary} onClick={() => void createEmailDraft()}>{pending ? "Preparing draft…" : "Create email draft"}</button> : null}
        {proposal.leadId ? <Link className={secondary} href={`/sales/leads/${encodeURIComponent(proposal.leadId)}`}>Open customer lead</Link> : null}
        {active ? <button type="button" disabled={pending} className={secondary} onClick={() => void revoke()}>{pending ? "Working…" : "Revoke and edit"}</button> : null}
      </div>
      {expired ? <p className="mt-3 text-sm font-semibold text-amber-800">This link has expired. Revoke it, review the estimate, and issue a fresh link before emailing the customer.</p> : null}
      {active && !proposal.customerEmail ? <p className="mt-3 text-sm font-semibold text-amber-800">Add an email address to the customer lead, then revoke and reissue this link to refresh its frozen recipient details.</p> : null}
      {proposal.respondedAt ? <p className="mt-3 text-sm text-slate-700">Response recorded: <strong>{label(proposal.response ?? proposal.status)}</strong>{proposal.responseName ? ` by ${proposal.responseName}` : ""}.</p> : null}
    </div> : canIssue ? <button type="button" disabled={pending} className={`mt-5 ${primary}`} onClick={() => void issue()}>{pending ? "Creating secure link…" : "Create customer link"}</button> : <p className="mt-5 rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-700">This estimate is {label(estimateStatus)}. Its customer-link lifecycle cannot be restarted from this state.</p>}
    {notice ? <p className="mt-4 text-sm font-semibold text-emerald-800">{notice}</p> : null}
    {error ? <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-800">{error}</p> : null}
  </section>;
}
