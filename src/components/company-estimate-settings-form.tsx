"use client";

import { useEffect, useState, type FormEvent } from "react";

type Settings = {
  default_estimate_detail_level: "lump_sum" | "section_summary" | "itemized";
  default_estimate_ohp_mode: "distributed" | "separate_line_item";
  default_estimate_lump_sum_label: string;
};

export function CompanyEstimateSettingsForm() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [message, setMessage] = useState("Loading estimate defaults…");
  const [saving, setSaving] = useState(false);
  useEffect(() => { void (async () => {
    const response = await fetch("/api/company-estimate-settings", { cache: "no-store" });
    const result = await response.json() as { settings?: Settings; error?: string };
    if (response.ok && result.settings) { setSettings(result.settings); setMessage(""); }
    else setMessage(result.error || "Estimate defaults could not be loaded.");
  })(); }, []);
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!settings || saving) return;
    setSaving(true); setMessage("");
    try {
      const response = await fetch("/api/company-estimate-settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ detailLevel: settings.default_estimate_detail_level, ohpMode: settings.default_estimate_ohp_mode, lumpSumLabel: settings.default_estimate_lump_sum_label }) });
      const result = await response.json() as { settings?: Settings; error?: string };
      if (!response.ok || !result.settings) throw new Error(result.error || "Estimate defaults could not be saved.");
      setSettings(result.settings); setMessage("Company estimate defaults saved. Existing estimates keep their own choices.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Estimate defaults could not be saved."); }
    finally { setSaving(false); }
  }
  if (!settings) return <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">{message}</div>;
  const input = "mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";
  const lumpSum = settings.default_estimate_detail_level === "lump_sum";
  return <form onSubmit={submit} className="rounded-xl border border-slate-200 bg-white p-6">
    <div className="grid gap-5 md:grid-cols-2"><label className="text-sm font-bold">Default customer detail<select className={input} value={settings.default_estimate_detail_level} onChange={(event) => { const detail = event.target.value as Settings["default_estimate_detail_level"]; setSettings({ ...settings, default_estimate_detail_level: detail, default_estimate_ohp_mode: detail === "lump_sum" ? "distributed" : settings.default_estimate_ohp_mode }); }}><option value="lump_sum">One lump-sum price</option><option value="section_summary">Section totals</option><option value="itemized">Itemized</option></select></label><label className="text-sm font-bold">Default OH&amp;P display<select className={input} disabled={lumpSum} value={lumpSum ? "distributed" : settings.default_estimate_ohp_mode} onChange={(event) => setSettings({ ...settings, default_estimate_ohp_mode: event.target.value as Settings["default_estimate_ohp_mode"] })}><option value="distributed">Built into customer prices</option><option value="separate_line_item">Separate OH&amp;P line</option></select></label></div>
    <label className="mt-5 block text-sm font-bold">Default lump-sum description<input maxLength={240} className={input} value={settings.default_estimate_lump_sum_label} onChange={(event) => setSettings({ ...settings, default_estimate_lump_sum_label: event.target.value })} /></label>
    <p className="mt-3 text-sm text-slate-600">Lump-sum estimates always hide OH&amp;P inside the final price. New estimates copy these defaults and can then be changed individually.</p>
    <button disabled={saving} className="mt-5 rounded-lg bg-slate-950 px-5 py-3 text-sm font-bold text-white disabled:opacity-50">{saving ? "Saving…" : "Save estimate defaults"}</button>{message ? <p role="status" className="mt-3 text-sm font-semibold text-slate-600">{message}</p> : null}
  </form>;
}
