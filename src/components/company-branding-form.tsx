"use client";

/* eslint-disable @next/next/no-img-element -- Administrators can supply tenant-specific remote logo URLs. */

import { useEffect, useState, type FormEvent } from "react";

type BrandingRecord = {
  company_name: string;
  brand_logo_url: string | null;
  brand_primary_color: string;
  brand_accent_color: string;
};

export function CompanyBrandingForm() {
  const [branding, setBranding] = useState<BrandingRecord | null>(null);
  const [message, setMessage] = useState("Loading company branding…");
  const [saving, setSaving] = useState(false);
  useEffect(() => { void (async () => {
    const response = await fetch("/api/company-branding", { cache: "no-store" });
    const result = await response.json() as { success?: boolean; branding?: BrandingRecord; error?: string };
    if (response.ok && result.branding) { setBranding(result.branding); setMessage(""); }
    else setMessage(result.error || "Company branding could not be loaded.");
  })(); }, []);
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!branding || saving) return;
    setSaving(true); setMessage("");
    try {
      const response = await fetch("/api/company-branding", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ logoUrl: branding.brand_logo_url, primaryColor: branding.brand_primary_color, accentColor: branding.brand_accent_color }) });
      const result = await response.json() as { branding?: BrandingRecord; error?: string };
      if (!response.ok || !result.branding) throw new Error(result.error || "Company branding could not be saved.");
      setBranding(result.branding); setMessage("Branding saved. Refresh another workspace to see the update.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Company branding could not be saved."); }
    finally { setSaving(false); }
  }
  if (!branding) return <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">{message}</div>;
  const input = "mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";
  return <form onSubmit={submit} className="grid gap-6 rounded-xl border border-slate-200 bg-white p-6 lg:grid-cols-[1fr_20rem]">
    <div className="space-y-5"><label className="block text-sm font-bold">Logo URL or local public path<input className={input} value={branding.brand_logo_url || ""} onChange={(event) => setBranding({ ...branding, brand_logo_url: event.target.value || null })} placeholder="/branding/company-logo.png" /></label><div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm font-bold">Primary color<input type="color" className={`${input} h-12 p-1`} value={branding.brand_primary_color} onChange={(event) => setBranding({ ...branding, brand_primary_color: event.target.value.toUpperCase() })} /></label><label className="block text-sm font-bold">Accent color<input type="color" className={`${input} h-12 p-1`} value={branding.brand_accent_color} onChange={(event) => setBranding({ ...branding, brand_accent_color: event.target.value.toUpperCase() })} /></label></div><button disabled={saving} className="rounded-lg bg-slate-950 px-5 py-3 text-sm font-bold text-white disabled:opacity-50">{saving ? "Saving…" : "Save branding"}</button>{message ? <p role="status" className="text-sm font-semibold text-slate-600">{message}</p> : null}</div>
    <aside className="rounded-xl border border-slate-200 bg-slate-950 p-5" style={{ borderColor: branding.brand_primary_color }}><p className="text-xs font-bold uppercase tracking-[.18em]" style={{ color: branding.brand_accent_color }}>Live preview</p>{branding.brand_logo_url ? <img src={branding.brand_logo_url} alt="Company logo preview" className="mt-5 max-h-24 w-full object-contain object-left" /> : <p className="mt-5 text-xl font-bold text-white">{branding.company_name}</p>}<div className="mt-6 h-2 rounded-full" style={{ background: branding.brand_primary_color }} /></aside>
  </form>;
}
