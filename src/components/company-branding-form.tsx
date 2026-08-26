"use client";

/* eslint-disable @next/next/no-img-element -- Company-controlled HTTPS logo references are intentionally previewed. */

import { useEffect, useState, type FormEvent } from "react";

type SignatureLayout = "off" | "compact" | "branded";

type BrandingRecord = {
  company_name: string;
  brand_logo_url: string | null;
  brand_primary_color: string;
  brand_accent_color: string;
  email_signature_layout: SignatureLayout;
};

type SignaturePreview = {
  layout: SignatureLayout;
  label: string;
  lines: readonly string[];
  logoUrl: string | null;
};

type SignatureVariants = Record<
  SignatureLayout,
  SignaturePreview | null
>;

export function CompanyBrandingForm() {
  const [branding, setBranding] = useState<BrandingRecord | null>(null);
  const [signatureVariants, setSignatureVariants] = useState<SignatureVariants | null>(null);
  const [signatureSchemaAvailable, setSignatureSchemaAvailable] = useState(true);
  const [message, setMessage] = useState("Loading company branding…");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      const [brandingResponse, previewResponse] = await Promise.all([
        fetch("/api/company-branding", { cache: "no-store" }),
        fetch("/api/communications/signature-preview", { cache: "no-store" }),
      ]);
      const brandingResult = await brandingResponse.json() as {
        success?: boolean;
        branding?: BrandingRecord;
        signatureSchemaAvailable?: boolean;
        error?: string;
      };
      const previewResult = await previewResponse.json() as {
        variants?: SignatureVariants;
      };
      if (brandingResponse.ok && brandingResult.branding) {
        setBranding(brandingResult.branding);
        setSignatureSchemaAvailable(
          brandingResult.signatureSchemaAvailable !== false,
        );
        setSignatureVariants(previewResult.variants ?? null);
        setMessage("");
      } else {
        setMessage(
          brandingResult.error || "Company branding could not be loaded.",
        );
      }
    })();
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!branding || saving) return;
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/company-branding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          logoUrl: branding.brand_logo_url,
          primaryColor: branding.brand_primary_color,
          accentColor: branding.brand_accent_color,
          signatureLayout: branding.email_signature_layout,
        }),
      });
      const result = await response.json() as {
        branding?: BrandingRecord;
        error?: string;
      };
      if (!response.ok || !result.branding) {
        throw new Error(
          result.error || "Company branding could not be saved.",
        );
      }
      setBranding(result.branding);
      setMessage(
        "Branding and the automatic email signature layout were saved.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Company branding could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (!branding) {
    return <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">{message}</div>;
  }

  const input = "mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";
  const signaturePreview = signatureVariants?.[
    branding.email_signature_layout
  ] ?? null;

  return <form onSubmit={submit} className="grid gap-6 rounded-xl border border-slate-200 bg-white p-6 lg:grid-cols-[1fr_20rem]">
    <div className="space-y-5">
      <label className="block text-sm font-bold">Logo URL or local public path
        <input className={input} value={branding.brand_logo_url || ""} onChange={(event) => setBranding({ ...branding, brand_logo_url: event.target.value || null })} placeholder="/branding/company-logo.png" />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-bold">Primary color
          <input type="color" className={`${input} h-12 p-1`} value={branding.brand_primary_color} onChange={(event) => setBranding({ ...branding, brand_primary_color: event.target.value.toUpperCase() })} />
        </label>
        <label className="block text-sm font-bold">Accent color
          <input type="color" className={`${input} h-12 p-1`} value={branding.brand_accent_color} onChange={(event) => setBranding({ ...branding, brand_accent_color: event.target.value.toUpperCase() })} />
        </label>
      </div>
      <label className="block text-sm font-bold">Automatic email signature
        <select
          aria-label="Email signature layout"
          className={input}
          value={branding.email_signature_layout}
          disabled={!signatureSchemaAvailable || saving}
          onChange={(event) => setBranding({
            ...branding,
            email_signature_layout: event.target.value as SignatureLayout,
          })}
        >
          <option value="off">Off</option>
          <option value="compact">Compact</option>
          <option value="branded">Branded</option>
        </select>
        <span className="mt-2 block text-xs font-normal leading-5 text-slate-500">
          Employee name, title, phone, and email come from the signed-in employee profile. Branded email uses the logo only when its saved URL is HTTPS.
        </span>
      </label>
      {!signatureSchemaAvailable ? <p role="status" className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">Apply the approved email-signature migration before choosing a layout. Existing email remains unchanged with signatures off.</p> : null}
      <button disabled={saving || !signatureSchemaAvailable} className="rounded-lg bg-slate-950 px-5 py-3 text-sm font-bold text-white disabled:opacity-50">{saving ? "Saving…" : "Save branding"}</button>
      {message ? <p role="status" className="text-sm font-semibold text-slate-600">{message}</p> : null}
    </div>
    <div className="space-y-4">
      <aside className="rounded-xl border border-slate-200 bg-slate-950 p-5" style={{ borderColor: branding.brand_primary_color }}>
        <p className="text-xs font-bold uppercase tracking-[.18em]" style={{ color: branding.brand_accent_color }}>Platform preview</p>
        {branding.brand_logo_url ? <img src={branding.brand_logo_url} alt="Company logo preview" className="mt-5 max-h-24 w-full object-contain object-left" /> : <p className="mt-5 text-xl font-bold text-white">{branding.company_name}</p>}
        <div className="mt-6 h-2 rounded-full" style={{ background: branding.brand_primary_color }} />
      </aside>
      <aside aria-label="Automatic email signature preview" className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-700">
        <p className="text-xs font-bold uppercase tracking-[.18em] text-slate-500">Email signature preview</p>
        {branding.email_signature_layout === "off" ? <p className="mt-4 text-slate-500">Automatic signature is off.</p> : signaturePreview ? <div className="mt-4 border-t-2 pt-4" style={{ borderColor: branding.brand_accent_color }}>
          {signaturePreview.logoUrl ? <img src={signaturePreview.logoUrl} alt={`${branding.company_name} logo`} className="mb-3 max-h-16 max-w-[11rem] object-contain object-left" /> : null}
          <p className="sr-only">{signaturePreview.label}</p>
          {signaturePreview.lines.map((line, index) => <p key={`${index}:${line}`} className={index === 0 ? "font-bold" : "mt-1"}>{line}</p>)}
        </div> : <p className="mt-4 text-slate-500">The current employee profile does not contain enough information to preview this signature.</p>}
      </aside>
    </div>
  </form>;
}
