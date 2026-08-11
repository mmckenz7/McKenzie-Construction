"use client";

import { useEffect, useState, type CSSProperties, type FormEvent } from "react";
import { useParams } from "next/navigation";

type ProposalRow = {
  id: string;
  kind: "item" | "section" | "adjustment";
  description: string;
  quantity?: string;
  unit?: string;
  totalCents: string;
};

type Proposal = {
  status: "issued" | "viewed" | "accepted" | "declined";
  expiresAt: string;
  respondedAt: string | null;
  response: "accepted" | "declined" | null;
  responseName: string | null;
  responseNotes: string | null;
  customerName: string;
  document: {
    title: string;
    description: string | null;
    propertyAddress: string | null;
    validUntil: string | null;
    scopeNotes: string | null;
    exclusions: string | null;
    customerNotes: string | null;
    presentation: { detailLevel: string; totalCents: string; rows: ProposalRow[] };
  };
  company: {
    publicName: string;
    legalName: string;
    primaryColor: string;
    accentColor: string;
    phone: string | null;
    email: string | null;
    websiteUrl: string | null;
  };
};

type ApiResponse = {
  success: boolean;
  proposal?: Proposal;
  alreadySubmitted?: boolean;
  result?: { status?: "accepted" | "declined"; respondedAt?: string | null };
  error?: string;
};

function formatCents(value: string) {
  if (!/^-?\d+$/.test(value)) return "—";
  const amount = BigInt(value);
  const negative = amount < 0n;
  const absolute = negative ? -amount : amount;
  const dollars = (absolute / 100n).toLocaleString("en-US");
  const cents = String(absolute % 100n).padStart(2, "0");
  return `${negative ? "−" : ""}$${dollars}.${cents}`;
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" }).format(new Date(value));
}

export default function PublicEstimatePage() {
  const { token } = useParams<{ token: string }>();
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [response, setResponse] = useState<"accepted" | "declined" | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [notes, setNotes] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [submitted, setSubmitted] = useState<"accepted" | "declined" | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const result = await fetch(`/api/estimate-proposals/${encodeURIComponent(token)}`, { cache: "no-store" });
        const body = await result.json() as ApiResponse;
        if (!result.ok || !body.proposal) throw new Error(body.error ?? "This estimate is unavailable.");
        if (!active) return;
        setProposal(body.proposal);
        setCustomerName(body.proposal.customerName ?? "");
        if (body.proposal.response === "accepted" || body.proposal.response === "declined") setSubmitted(body.proposal.response);
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : "This estimate is unavailable.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [token]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!response) return setError("Choose accept or decline.");
    if (!customerName.trim()) return setError("Enter your name.");
    if (response === "accepted" && !acknowledged) return setError("Acknowledge the nonbinding estimate terms before accepting.");
    setSubmitting(true);
    try {
      const result = await fetch(`/api/estimate-proposals/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response, customerName, notes: notes || null, acknowledgedNonbinding: acknowledged }),
      });
      const body = await result.json() as ApiResponse;
      if (body.alreadySubmitted && (body.result?.status === "accepted" || body.result?.status === "declined")) {
        setSubmitted(body.result.status);
        return;
      }
      if (!result.ok || !body.success) throw new Error(body.error ?? "Your response could not be saved.");
      setSubmitted(response);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Your response could not be saved.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <main className="grid min-h-screen place-items-center bg-slate-950 text-slate-200">Loading estimate…</main>;
  if (!proposal) return <main className="grid min-h-screen place-items-center bg-slate-950 p-6"><section className="max-w-lg rounded-2xl border border-red-800 bg-slate-900 p-8 text-center text-white"><h1 className="text-2xl font-bold">Estimate unavailable</h1><p className="mt-3 text-sm text-red-200">{error || "This link is invalid or no longer available."}</p></section></main>;

  const theme = {
    "--proposal-primary": proposal.company.primaryColor,
    "--proposal-accent": proposal.company.accentColor,
  } as CSSProperties;

  if (submitted) return <main style={theme} className="grid min-h-screen place-items-center bg-slate-950 p-6">
    <section className="w-full max-w-xl rounded-3xl border border-slate-700 bg-slate-900 p-8 text-center text-white shadow-2xl">
      <div className={`mx-auto grid h-16 w-16 place-items-center rounded-full text-3xl ${submitted === "accepted" ? "bg-emerald-500/20 text-emerald-300" : "bg-red-500/20 text-red-300"}`}>{submitted === "accepted" ? "✓" : "×"}</div>
      <p className="mt-5 text-xs font-bold uppercase tracking-[.2em] text-[var(--proposal-accent)]">{proposal.company.publicName}</p>
      <h1 className="mt-3 text-3xl font-bold">Estimate {submitted === "accepted" ? "accepted" : "declined"}</h1>
      <p className="mt-4 text-sm leading-6 text-slate-300">{submitted === "accepted" ? "Your nonbinding intent to proceed has been recorded. The next step is a separate construction contract for review and electronic signature. No work is authorized by this response." : "Your response has been recorded. The company can follow up about questions or revisions."}</p>
      <div className="mt-6 rounded-xl bg-slate-800 p-5 text-left"><p className="text-xs font-bold uppercase tracking-wide text-slate-400">Estimate</p><p className="mt-1 font-bold">{proposal.document.title}</p><p className="mt-4 text-xs font-bold uppercase tracking-wide text-slate-400">Total</p><p className="mt-1 text-2xl font-bold">{formatCents(proposal.document.presentation.totalCents)}</p></div>
      <button type="button" onClick={() => window.print()} className="mt-6 rounded-xl border border-slate-600 px-5 py-3 text-sm font-bold print:hidden">Print or save as PDF</button>
    </section>
  </main>;

  return <main style={theme} className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 sm:py-12">
    <article className="mx-auto max-w-4xl overflow-hidden rounded-3xl border border-slate-700 bg-slate-900 shadow-2xl">
      <header className="border-b border-slate-700 bg-[linear-gradient(135deg,var(--proposal-primary),#0f172a_70%)] p-6 sm:p-10">
        <p className="text-xs font-bold uppercase tracking-[.22em] text-[var(--proposal-accent)]">{proposal.company.publicName}</p>
        <h1 className="mt-4 text-3xl font-bold sm:text-5xl">{proposal.document.title}</h1>
        <p className="mt-3 text-sm text-slate-200">Prepared for {proposal.customerName}</p>
      </header>

      <div className="space-y-8 p-6 sm:p-10">
        <dl className="grid gap-4 rounded-2xl border border-slate-700 bg-slate-950/60 p-5 sm:grid-cols-3">
          <Info label="Project address" value={proposal.document.propertyAddress ?? "—"} />
          <Info label="Estimate valid until" value={formatDate(proposal.document.validUntil)} />
          <Info label="Customer total" value={formatCents(proposal.document.presentation.totalCents)} />
        </dl>

        {proposal.document.description ? <TextSection title="Project overview" value={proposal.document.description} /> : null}
        {proposal.document.scopeNotes ? <TextSection title="Scope of work" value={proposal.document.scopeNotes} /> : null}

        <section className="overflow-hidden rounded-2xl border border-slate-700">
          <div className="grid grid-cols-[1fr_auto] border-b border-slate-700 bg-slate-950 px-5 py-3 text-xs font-bold uppercase tracking-wide text-slate-400"><span>Description</span><span>Price</span></div>
          {proposal.document.presentation.rows.map((row) => <div key={row.id} className="grid grid-cols-[1fr_auto] gap-4 border-b border-slate-800 px-5 py-4 last:border-0"><div><p className="font-semibold">{row.description}</p>{row.quantity && row.unit ? <p className="mt-1 text-xs text-slate-400">{row.quantity} {row.unit}</p> : null}</div><strong>{formatCents(row.totalCents)}</strong></div>)}
          <div className="grid grid-cols-[1fr_auto] gap-4 border-t border-slate-600 bg-slate-950 px-5 py-5 text-xl font-bold"><span>Total</span><span>{formatCents(proposal.document.presentation.totalCents)}</span></div>
        </section>

        {proposal.document.exclusions ? <TextSection title="Exclusions" value={proposal.document.exclusions} /> : null}
        {proposal.document.customerNotes ? <TextSection title="Customer notes" value={proposal.document.customerNotes} /> : null}

        <section className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-5">
          <h2 className="font-bold text-amber-200">Estimate acceptance is not a construction contract</h2>
          <p className="mt-2 text-sm leading-6 text-amber-100/90">Accepting records your intent to proceed with the scope and price shown. A separate construction contract must be prepared, reviewed, and signed before work is authorized or scheduled.</p>
        </section>

        <form onSubmit={submit} className="border-t border-slate-700 pt-8 print:hidden">
          <h2 className="text-2xl font-bold">Your response</h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <button type="button" onClick={() => setResponse("accepted")} className={`rounded-xl border p-4 font-bold ${response === "accepted" ? "border-emerald-400 bg-emerald-500/20 text-emerald-200" : "border-slate-600 bg-slate-950"}`}>✓ Accept estimate</button>
            <button type="button" onClick={() => setResponse("declined")} className={`rounded-xl border p-4 font-bold ${response === "declined" ? "border-red-400 bg-red-500/20 text-red-200" : "border-slate-600 bg-slate-950"}`}>× Decline estimate</button>
          </div>
          <label className="mt-5 block text-sm font-bold">Your name<input value={customerName} maxLength={160} onChange={(event) => setCustomerName(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-600 bg-slate-950 px-4 py-3 font-normal" /></label>
          <label className="mt-5 block text-sm font-bold">Comments<textarea value={notes} maxLength={4000} rows={4} onChange={(event) => setNotes(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-600 bg-slate-950 px-4 py-3 font-normal" placeholder="Optional questions or comments" /></label>
          {response === "accepted" ? <label className="mt-5 flex gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm leading-6"><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} className="mt-1 h-4 w-4" /><span>I understand that accepting this estimate records a nonbinding intent to proceed. Work will not begin until a separate construction contract is reviewed and signed.</span></label> : null}
          {error ? <p role="alert" className="mt-5 rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm font-semibold text-red-200">{error}</p> : null}
          <button disabled={submitting || !response} className="mt-5 w-full rounded-xl bg-[var(--proposal-primary)] px-5 py-4 font-bold text-white disabled:opacity-50">{submitting ? "Saving response…" : "Submit response"}</button>
        </form>
      </div>
    </article>
  </main>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</dt><dd className="mt-1 font-semibold text-slate-100">{value}</dd></div>;
}

function TextSection({ title, value }: { title: string; value: string }) {
  return <section><h2 className="text-xl font-bold">{title}</h2><p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-300">{value}</p></section>;
}
