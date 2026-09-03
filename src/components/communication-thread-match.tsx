"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

type MatchOption = {
  id: string;
  label: string;
  detail: string;
};

type CommunicationThreadMatchProps = {
  threadId: string;
  leads: MatchOption[];
  customers: MatchOption[];
  canCreateLead?: boolean;
};

export function CommunicationThreadMatch({
  threadId,
  leads,
  customers,
  canCreateLead = false,
}: CommunicationThreadMatchProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [target, setTarget] = useState("");
  const [error, setError] = useState("");
  const [leadName, setLeadName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isPending, startTransition] = useTransition();

  const normalizedQuery = query.trim().toLowerCase();
  const visibleLeads = useMemo(
    () => leads.filter((option) => `${option.label} ${option.detail}`.toLowerCase().includes(normalizedQuery)).slice(0, 50),
    [leads, normalizedQuery],
  );
  const visibleCustomers = useMemo(
    () => customers.filter((option) => `${option.label} ${option.detail}`.toLowerCase().includes(normalizedQuery)).slice(0, 50),
    [customers, normalizedQuery],
  );

  async function matchConversation() {
    const [targetType, targetId] = target.split(":");
    if (!targetId || (targetType !== "lead" && targetType !== "customer")) {
      setError("Choose the correct lead or customer first.");
      return;
    }

    setError("");
    setIsSaving(true);
    try {
      const response = await fetch(`/api/communications/threads/${threadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "match", targetType, targetId }),
      });
      const result = await response.json() as { success?: boolean; error?: string; warning?: string };
      if (!response.ok || !result.success) {
        setError(result.error ?? "The conversation could not be matched.");
        return;
      }
      startTransition(() => router.refresh());
    } catch {
      setError("The conversation could not be matched. Check your connection and try again.");
    } finally {
      setIsSaving(false);
    }
  }

  async function createLead() {
    const name = leadName.trim();
    if (!name) {
      setError("Enter the person’s name before creating a lead.");
      return;
    }

    setError("");
    setIsSaving(true);
    try {
      const response = await fetch(`/api/communications/threads/${threadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create_lead", name }),
      });
      const result = await response.json() as { success?: boolean; error?: string };
      if (!response.ok || !result.success) {
        setError(result.error ?? "The lead could not be created.");
        return;
      }
      startTransition(() => router.refresh());
    } catch {
      setError("The lead could not be created. Check your connection and try again.");
    } finally {
      setIsSaving(false);
    }
  }

  const busy = isSaving || isPending;
  const noMatches = visibleLeads.length === 0 && visibleCustomers.length === 0;

  return <section className="mt-7 rounded-2xl border border-amber-300 bg-amber-50 p-5 shadow-sm">
    <p className="text-[11px] font-bold uppercase tracking-[.16em] text-amber-800">Conversation options</p>
    <h2 className="mt-2 text-lg font-semibold text-slate-950">Keep this conversation or connect it to CRM</h2>
    <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-700">Replying does not require a lead or customer. Link an existing contact, create a lead when appropriate, or leave the complete conversation unassigned for later review. Leave vendor, account, and system mail unmatched.</p>

    <div className="mt-5 grid gap-3 rounded-xl border border-amber-200 bg-white/70 p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto] sm:items-end">
      <div className="sm:col-span-3">
        <h3 className="font-semibold text-slate-900">Link existing contact</h3>
        <p className="mt-1 text-sm text-slate-600">Who does this conversation belong to?</p>
      </div>
      <label className="block text-sm font-semibold text-slate-800">
        Find by name, email, or phone
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Start typing…"
          className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-slate-950 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
        />
      </label>
      <label className="block text-sm font-semibold text-slate-800">
        Existing contact
        <select
          value={target}
          onChange={(event) => setTarget(event.target.value)}
          className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-slate-950 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
        >
          <option value="">Choose a lead or customer</option>
          {visibleCustomers.length ? <optgroup label="Customers">
            {visibleCustomers.map((option) => <option key={`customer:${option.id}`} value={`customer:${option.id}`}>{option.label} — {option.detail}</option>)}
          </optgroup> : null}
          {visibleLeads.length ? <optgroup label="Leads">
            {visibleLeads.map((option) => <option key={`lead:${option.id}`} value={`lead:${option.id}`}>{option.label} — {option.detail}</option>)}
          </optgroup> : null}
        </select>
      </label>
      <button
        type="button"
        disabled={busy || !target}
        onClick={matchConversation}
        className="min-h-11 rounded-lg bg-slate-950 px-5 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-45"
      >
        {busy ? "Matching…" : "Match conversation"}
      </button>
    </div>
    {canCreateLead ? <div className="mt-3 grid gap-3 rounded-xl border border-amber-200 bg-white/70 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
      <label className="block text-sm font-semibold text-slate-800">
        New lead name
        <input
          value={leadName}
          onChange={(event) => setLeadName(event.target.value)}
          maxLength={120}
          placeholder="Person or household name"
          className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-slate-950 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
        />
      </label>
      <button
        type="button"
        disabled={busy || !leadName.trim()}
        onClick={createLead}
        className="min-h-11 rounded-lg border border-slate-900 bg-white px-5 text-sm font-semibold text-slate-900 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-45"
      >
        {busy ? "Saving…" : "Create Lead"}
      </button>
    </div> : null}
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-slate-700">Not ready to decide? The thread and every message stay intact.</p>
      <Link href="/communications?view=unassigned" className="inline-flex min-h-10 items-center rounded-lg border border-amber-400 bg-white px-4 text-sm font-semibold text-amber-900 hover:bg-amber-100">Leave unassigned</Link>
    </div>
    {noMatches ? <p className="mt-3 text-sm font-medium text-amber-900">No CRM records match that search.</p> : null}
    {error ? <p role="alert" className="mt-3 text-sm font-semibold text-rose-700">{error}</p> : null}
  </section>;
}
