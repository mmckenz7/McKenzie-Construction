"use client";

/* eslint-disable @next/next/no-img-element -- Company administrators control customer-document branding URLs. */

import Link from "next/link";
import { useEffect, useState, type CSSProperties } from "react";

import { formatCents } from "@/lib/estimate-builder-client";
import type { EstimateCustomerDocument } from "@/lib/estimate-customer-document";

type PreviewResponse = {
  success: true;
  document: EstimateCustomerDocument;
  customerName: string;
  company: {
    companyName: string;
    logoUrl: string;
    primaryColor: string;
    accentColor: string;
    phone: string | null;
    email: string | null;
    websiteUrl: string | null;
  };
};

function displayDate(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "Not specified";
  const [year, month, day] = value.split("-");
  return `${month}/${day}/${year}`;
}

export function EstimateCustomerPreview({ estimateId }: { estimateId: string }) {
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { void (async () => {
    try {
      const response = await fetch(`/api/estimates/${encodeURIComponent(estimateId)}/presentation`, { cache: "no-store" });
      const result = await response.json() as PreviewResponse | { error?: string };
      if (!response.ok || !("document" in result)) throw new Error(("error" in result ? result.error : null) || "The customer estimate could not be loaded.");
      setPreview(result);
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : "The customer estimate could not be loaded."); }
  })(); }, [estimateId]);

  if (error) return <main className="estimate-print-page mx-auto max-w-4xl p-8"><div className="rounded-xl border border-red-300 bg-red-50 p-6 text-red-900"><h1 className="text-xl font-bold">Preview unavailable</h1><p className="mt-2">{error}</p><Link href={`/sales/estimates/${estimateId}`} className="mt-5 inline-block font-bold underline">Return to estimate</Link></div></main>;
  if (!preview) return <main className="estimate-print-page mx-auto max-w-4xl p-8"><p className="text-sm font-semibold text-slate-600">Preparing customer estimate…</p></main>;

  const { company, document, customerName } = preview;
  return <main className="estimate-print-page mx-auto max-w-5xl px-4 py-8 sm:px-8" style={{ "--estimate-document-primary": company.primaryColor, "--estimate-document-accent": company.accentColor } as CSSProperties}>
    <div className="estimate-print-actions mb-5 flex flex-wrap justify-between gap-3"><Link href={`/sales/estimates/${estimateId}`} className="rounded-lg border border-slate-600 px-4 py-2 text-sm font-bold text-white">← Back to builder</Link><button onClick={() => window.print()} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white">Print or save PDF</button></div>
    <article className="estimate-customer-document overflow-hidden rounded-2xl bg-white text-slate-950 shadow-2xl">
      <header className="estimate-document-header flex flex-wrap items-start justify-between gap-8 border-b p-8 sm:p-10">
        <div><img src={company.logoUrl} alt={company.companyName} className="max-h-24 max-w-72 object-contain object-left" /><p className="mt-4 text-sm font-semibold text-slate-600">{[company.phone, company.email, company.websiteUrl].filter(Boolean).join(" · ")}</p></div>
        <div className="text-left sm:text-right"><p className="text-xs font-bold uppercase tracking-[.2em] text-slate-500">Estimate</p><h1 className="mt-2 text-3xl font-bold">{document.title}</h1><p className="mt-3 text-sm text-slate-600">Valid through {displayDate(document.validUntil)}</p></div>
      </header>
      <section className="grid gap-6 border-b p-8 sm:grid-cols-2 sm:p-10"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-slate-500">Prepared for</p><p className="mt-2 text-lg font-bold">{customerName}</p></div><div><p className="text-xs font-bold uppercase tracking-[.16em] text-slate-500">Project location</p><p className="mt-2 text-lg font-bold">{document.propertyAddress || "To be confirmed"}</p></div>{document.description ? <p className="text-sm leading-7 text-slate-700 sm:col-span-2">{document.description}</p> : null}</section>
      <section className="p-8 sm:p-10"><div className="overflow-hidden rounded-xl border border-slate-200"><div className="grid grid-cols-[1fr_auto] bg-slate-950 px-5 py-3 text-xs font-bold uppercase tracking-[.14em] text-white"><span>Description</span><span>Price</span></div>{document.presentation.rows.map((row) => <div key={row.id} className="grid grid-cols-[1fr_auto] gap-6 border-b border-slate-200 px-5 py-5 last:border-0"><div><p className="font-semibold">{row.description}</p>{row.quantity && row.unit ? <p className="mt-1 text-xs text-slate-500">{row.quantity} {row.unit}</p> : null}</div><strong>{formatCents(row.totalCents)}</strong></div>)}</div><div className="mt-6 flex justify-end"><div className="min-w-64 border-t-2 pt-4 text-right" style={{ borderColor: company.primaryColor }}><p className="text-xs font-bold uppercase tracking-[.16em] text-slate-500">Estimate total</p><p className="mt-2 text-3xl font-bold">{formatCents(document.presentation.totalCents)}</p></div></div></section>
      {document.scopeNotes || document.exclusions || document.customerNotes ? <section className="grid gap-6 border-t border-slate-200 bg-slate-50 p-8 sm:grid-cols-2 sm:p-10">{document.scopeNotes ? <DocumentNote title="Scope" value={document.scopeNotes} /> : null}{document.exclusions ? <DocumentNote title="Exclusions" value={document.exclusions} /> : null}{document.customerNotes ? <DocumentNote title="Notes" value={document.customerNotes} /> : null}</section> : null}
      <footer className="px-8 py-6 text-center text-xs font-semibold text-slate-500 sm:px-10">Thank you for the opportunity to prepare this estimate. Pricing is valid through {displayDate(document.validUntil)}.</footer>
    </article>
  </main>;
}

function DocumentNote({ title, value }: { title: string; value: string }) {
  return <div><h2 className="text-xs font-bold uppercase tracking-[.16em] text-slate-500">{title}</h2><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{value}</p></div>;
}
