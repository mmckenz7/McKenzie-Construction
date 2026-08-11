"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";

type LegalDocument = {
  id: string; document_type: string; title: string; version_label: string; source_kind: string;
  original_file_name: string | null; file_size_bytes: number | null; status: string;
  legal_review_status: string; is_default: boolean; notes: string | null; updated_at: string;
};

const typeLabels: Record<string, string> = {
  construction_contract: "Construction contract", change_order_terms: "Change-order terms", warranty: "Warranty",
  privacy: "Privacy", subcontractor_agreement: "Subcontractor agreement", other: "Other",
};

export function CompanyLegalDocumentsManager() {
  const [documents, setDocuments] = useState<LegalDocument[]>([]);
  const [message, setMessage] = useState("Loading legal documents…");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const response = await fetch("/api/company-legal-documents", { cache: "no-store" });
    const body = await response.json() as { documents?: LegalDocument[]; error?: string };
    if (!response.ok) { setMessage(body.error ?? "Legal documents could not be loaded."); return; }
    setDocuments(body.documents ?? []); setMessage("");
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/company-legal-documents", { method: "POST", body: new FormData(event.currentTarget) });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Upload failed.");
      event.currentTarget.reset(); await load(); setMessage("Legal document uploaded as an unreviewed draft.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Upload failed."); }
    finally { setBusy(false); }
  }

  async function action(id: string, body: Record<string, unknown>) {
    if (busy) return; setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/company-legal-documents/${encodeURIComponent(id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "The document could not be updated.");
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "The document could not be updated."); }
    finally { setBusy(false); }
  }

  const input = "mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";
  return <div className="space-y-6">
    <section className="rounded-xl border border-amber-300 bg-amber-50 p-5">
      <h2 className="font-bold text-amber-950">Beta boilerplate included</h2>
      <p className="mt-2 text-sm leading-6 text-amber-900">The included construction agreement is only for sandbox workflow testing. It is not attorney-reviewed and cannot be used for live DocuSign sending.</p>
    </section>
    <form onSubmit={upload} className="rounded-xl border border-slate-200 bg-white p-6">
      <h2 className="text-xl font-bold text-slate-950">Upload a legal document</h2>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <label className="text-sm font-bold">Document type<select name="documentType" required className={input}>{Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="text-sm font-bold">Title<input name="title" required maxLength={240} className={input} /></label>
        <label className="text-sm font-bold">Version<input name="versionLabel" defaultValue="1.0" maxLength={80} className={input} /></label>
        <label className="text-sm font-bold">PDF or DOCX<input name="file" required type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className={input} /></label>
      </div>
      <label className="mt-4 block text-sm font-bold">Notes<textarea name="notes" maxLength={2000} rows={3} className={input} /></label>
      <button disabled={busy} className="mt-5 rounded-lg bg-slate-950 px-5 py-3 text-sm font-bold text-white disabled:opacity-50">{busy ? "Working…" : "Upload document"}</button>
    </form>
    <section className="rounded-xl border border-slate-200 bg-white p-6">
      <h2 className="text-xl font-bold text-slate-950">Company document library</h2>
      <div className="mt-5 space-y-3">{documents.map((document) => <article key={document.id} className="rounded-lg border border-slate-200 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-bold text-slate-950">{document.title}</p><p className="mt-1 text-sm text-slate-600">{typeLabels[document.document_type] ?? document.document_type} · Version {document.version_label}{document.is_default ? " · Default" : ""}</p></div><span className={`rounded-full px-3 py-1 text-xs font-bold uppercase ${document.legal_review_status === "attorney_reviewed" ? "bg-emerald-100 text-emerald-800" : document.legal_review_status === "beta_test_only" ? "bg-blue-100 text-blue-800" : "bg-amber-100 text-amber-900"}`}>{document.legal_review_status.replaceAll("_", " ")}</span></div>
        <div className="mt-4 flex flex-wrap gap-2"><a className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold" href={`/api/company-legal-documents/${document.id}/download`}>Download</a>{!document.is_default && document.status !== "archived" ? <button disabled={busy} onClick={() => void action(document.id, { action: "set_default" })} className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold">Make default</button> : null}{document.source_kind !== "boilerplate" && document.legal_review_status === "not_reviewed" ? <button disabled={busy} onClick={() => void action(document.id, { action: "set_review_status", reviewStatus: "beta_test_only" })} className="rounded-md border border-blue-300 px-3 py-2 text-sm font-semibold text-blue-800">Allow sandbox testing</button> : null}{document.source_kind !== "boilerplate" && document.legal_review_status !== "attorney_reviewed" ? <button disabled={busy} onClick={() => { if (window.confirm("Confirm that an attorney has reviewed and approved this exact document version.")) void action(document.id, { action: "set_review_status", reviewStatus: "attorney_reviewed" }); }} className="rounded-md border border-emerald-300 px-3 py-2 text-sm font-semibold text-emerald-800">Mark attorney-reviewed</button> : null}{document.status !== "archived" ? <button disabled={busy} onClick={() => void action(document.id, { action: "archive" })} className="rounded-md border border-red-200 px-3 py-2 text-sm font-semibold text-red-700">Archive</button> : null}</div>
      </article>)}{!documents.length && !message ? <p className="text-sm text-slate-600">No legal documents are configured.</p> : null}</div>
      {message ? <p role="status" className="mt-4 text-sm font-semibold text-slate-700">{message}</p> : null}
    </section>
  </div>;
}
