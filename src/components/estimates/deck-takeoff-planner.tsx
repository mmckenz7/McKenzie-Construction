"use client";

import { useEffect, useMemo, useState } from "react";

import type { EstimateBuilderEnvelope } from "@/lib/estimate-builder-client";
import type { DeckTakeoffPlan, DeckTakeoffPreview } from "@/lib/deck-takeoff-v0";

type CatalogMaterial = {
  id: string;
  description: string;
  effective_unit_cost?: number;
  selected_price?: { source_reference?: string | null; suppliers?: { name?: string } | null; supplier_locations?: { name?: string; store_number?: string } | null } | null;
};

type FixedLine = DeckTakeoffPlan["additionalLines"][number];

const input = "mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-100";
const primary = "min-h-11 rounded-md bg-slate-950 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

const INITIAL_LINES: FixedLine[] = [
  { key: "joists", category: "material", description: "Planned joists", quantity: "", unit: "ea", unitCost: "", catalogMaterialId: null, sourceReference: "" },
  { key: "beams", category: "material", description: "Planned beam lumber", quantity: "", unit: "ln ft", unitCost: "", catalogMaterialId: null, sourceReference: "" },
  { key: "posts", category: "material", description: "Planned posts", quantity: "", unit: "ea", unitCost: "", catalogMaterialId: null, sourceReference: "" },
  { key: "concrete", category: "material", description: "Concrete mix", quantity: "", unit: "bag", unitCost: "", catalogMaterialId: null, sourceReference: "" },
  { key: "railing", category: "material", description: "Railing materials", quantity: "", unit: "ln ft", unitCost: "", catalogMaterialId: null, sourceReference: "" },
  { key: "stairs", category: "material", description: "Stair materials", quantity: "", unit: "allowance", unitCost: "", catalogMaterialId: null, sourceReference: "" },
  { key: "labor", category: "labor", description: "Deck construction labor", quantity: "", unit: "hr", unitCost: "", catalogMaterialId: null, sourceReference: "" },
  { key: "disposal", category: "other", description: "Demolition and disposal", quantity: "", unit: "allowance", unitCost: "", catalogMaterialId: null, sourceReference: "" },
];

function defaultPlan(): DeckTakeoffPlan {
  return {
    boardActualWidthInches: "5.5", boardGapInches: "0.125", boardStockLengthFeet: "",
    boardWastePercent: "10", boardCatalogMaterialId: null, boardUnitCost: "", boardSourceReference: "",
    screwCoverageSquareFeetPerPack: "", screwCatalogMaterialId: null, screwPackUnitCost: "", screwSourceReference: "",
    additionalLines: INITIAL_LINES,
  };
}

function Field({ label, children, help }: { label: string; children: React.ReactNode; help?: string }) {
  return <label className="block text-sm font-bold text-slate-800"><span>{label}</span>{children}{help ? <span className="mt-1 block text-xs font-normal leading-5 text-slate-600">{help}</span> : null}</label>;
}

function sourceLabel(material: CatalogMaterial) {
  const supplier = material.selected_price?.suppliers?.name ?? "Catalog";
  const location = material.selected_price?.supplier_locations;
  return `${supplier}${location?.store_number ? ` store ${location.store_number}` : location?.name ? ` · ${location.name}` : ""}`;
}

export function DeckTakeoffPlanner({
  estimateId, visitId, visitRevision, calculationRevision, takeoffApplied, disabled, onApplied,
}: {
  estimateId: string;
  visitId: string;
  visitRevision: number;
  calculationRevision: number;
  takeoffApplied: boolean;
  disabled: boolean;
  onApplied: (state: EstimateBuilderEnvelope) => void;
}) {
  const [plan, setPlan] = useState<DeckTakeoffPlan>(defaultPlan);
  const [catalog, setCatalog] = useState<CatalogMaterial[]>([]);
  const [preview, setPreview] = useState<DeckTakeoffPreview | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [checks, setChecks] = useState({ dimensions: false, quantities: false, prices: false });

  useEffect(() => {
    let active = true;
    void fetch("/api/material-catalog?active=true&includePrices=true", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json() as { materials?: CatalogMaterial[] };
        if (!response.ok) throw new Error();
        if (active) setCatalog(body.materials ?? []);
      })
      .catch(() => { if (active) setNotice("The catalog could not be loaded. You can still enter a verified cost and source manually."); });
    return () => { active = false; };
  }, []);

  const catalogById = useMemo(() => new Map(catalog.map((material) => [material.id, material])), [catalog]);

  function chooseCatalog(target: "board" | "screw" | string, id: string) {
    const material = catalogById.get(id);
    const cost = material?.effective_unit_cost;
    const source = material ? material.selected_price?.source_reference || `catalog:${material.id}:${sourceLabel(material)}` : "";
    if (target === "board") setPlan({ ...plan, boardCatalogMaterialId: id || null, boardUnitCost: cost ? String(cost) : "", boardSourceReference: source });
    else if (target === "screw") setPlan({ ...plan, screwCatalogMaterialId: id || null, screwPackUnitCost: cost ? String(cost) : "", screwSourceReference: source });
    else setPlan({ ...plan, additionalLines: plan.additionalLines.map((line) => line.key === target ? { ...line, catalogMaterialId: id || null, unitCost: cost ? String(cost) : "", sourceReference: source } : line) });
    setPreview(null);
  }

  function updateLine(key: string, field: keyof FixedLine, value: string) {
    setPlan({ ...plan, additionalLines: plan.additionalLines.map((line) => line.key === key ? { ...line, [field]: value, ...(field === "unitCost" || field === "sourceReference" ? { catalogMaterialId: null } : {}) } : line) });
    setPreview(null);
  }

  async function requestPreview() {
    setPending(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/estimates/${encodeURIComponent(estimateId)}/deck-takeoff`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visitId, expectedVisitRevision: visitRevision, plan }),
      });
      const body = await response.json() as DeckTakeoffPreview & { error?: string };
      if (!response.ok) throw new Error(body.error || "Draft takeoff could not be calculated.");
      setPreview(body); setChecks({ dimensions: false, quantities: false, prices: false });
      if (body.status === "ready") setNotice("Draft takeoff is ready for your review.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Draft takeoff could not be calculated."); }
    finally { setPending(false); }
  }

  async function applyTakeoff() {
    if (!preview || preview.status !== "ready" || !checks.dimensions || !checks.quantities || !checks.prices) return;
    setPending(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/estimates/${encodeURIComponent(estimateId)}/deck-takeoff`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          visitId, expectedVisitRevision: visitRevision, expectedCalculationRevision: calculationRevision,
          applicationId: crypto.randomUUID(), idempotencyKey: crypto.randomUUID(),
          applicationVersion: preview.version, previewBinding: preview.previewBinding, plan,
        }),
      });
      const body = await response.json() as EstimateBuilderEnvelope & { success?: boolean; error?: string };
      if (!response.ok || !body.success) throw new Error(body.error || "Reviewed takeoff could not be added.");
      onApplied(body); setNotice("Reviewed takeoff added as true-cost estimate lines. Continue to OH&P below.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Reviewed takeoff could not be added."); }
    finally { setPending(false); }
  }

  const catalogOptions = (lineKey: string) => catalog.filter((material) => {
    const text = material.description.toLowerCase();
    if (lineKey === "board") return text.includes("deck") && (text.includes("board") || text.includes("lumber"));
    if (lineKey === "screw") return text.includes("screw") || text.includes("fastener");
    if (lineKey === "concrete") return text.includes("concrete");
    if (lineKey === "joists" || lineKey === "posts") return text.includes("lumber");
    return [];
  });

  if (takeoffApplied) return <section className="mt-5 rounded-xl border-2 border-emerald-700 bg-emerald-50 p-5"><p className="text-xs font-black uppercase tracking-[.16em] text-emerald-800">Draft takeoff complete</p><h3 className="mt-1 text-xl font-black text-emerald-950">Reviewed quantities and true costs are in the estimate</h3><p className="mt-2 text-sm text-emerald-950">Review the saved lines below. Then continue to OH&amp;P and the customer proposal.</p></section>;

  return <section className="mt-5 rounded-xl border-2 border-blue-700 bg-blue-50 p-4 sm:p-5">
    <p className="text-xs font-black uppercase tracking-[.16em] text-blue-800">Draft material takeoff</p>
    <h3 className="mt-1 text-xl font-black text-slate-950">Turn field measurements into reviewed true costs</h3>
    <p className="mt-2 text-sm leading-6 text-slate-700">The app calculates only straightforward decking coverage. You enter the build-plan quantities for framing and labor. It will never invent structural design or a Lowe&apos;s price.</p>

    <div className="mt-5 rounded-lg bg-white p-4">
      <h4 className="font-black text-slate-950">1. Decking calculation</h4>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Actual board width (inches)"><input className={input} inputMode="decimal" value={plan.boardActualWidthInches} onChange={(e) => { setPlan({ ...plan, boardActualWidthInches: e.target.value }); setPreview(null); }} /></Field>
        <Field label="Board gap (inches)"><input className={input} inputMode="decimal" value={plan.boardGapInches} onChange={(e) => { setPlan({ ...plan, boardGapInches: e.target.value }); setPreview(null); }} /></Field>
        <Field label="Stock board length (feet)" help="Must span the deck run. The app will not design board splices."><input className={input} inputMode="decimal" value={plan.boardStockLengthFeet} onChange={(e) => { setPlan({ ...plan, boardStockLengthFeet: e.target.value }); setPreview(null); }} /></Field>
        <Field label="Waste (%)"><input className={input} inputMode="decimal" value={plan.boardWastePercent} onChange={(e) => { setPlan({ ...plan, boardWastePercent: e.target.value }); setPreview(null); }} /></Field>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <Field label="Exact catalog product"><select className={input} value={plan.boardCatalogMaterialId ?? ""} onChange={(e) => chooseCatalog("board", e.target.value)}><option value="">Enter verified cost manually</option>{catalogOptions("board").map((material) => <option key={material.id} value={material.id}>{material.description} · ${material.effective_unit_cost ?? "?"}</option>)}</select></Field>
        <Field label="Unit cost"><input className={input} inputMode="decimal" value={plan.boardUnitCost} onChange={(e) => { setPlan({ ...plan, boardUnitCost: e.target.value, boardCatalogMaterialId: null }); setPreview(null); }} /></Field>
        <Field label="Price source" help="Lowe's product URL, quote number, or another traceable reference."><input className={input} value={plan.boardSourceReference} onChange={(e) => { setPlan({ ...plan, boardSourceReference: e.target.value, boardCatalogMaterialId: null }); setPreview(null); }} /></Field>
      </div>
    </div>

    <div className="mt-4 rounded-lg bg-white p-4">
      <h4 className="font-black text-slate-950">2. Fasteners (optional)</h4>
      <div className="mt-3 grid gap-3 md:grid-cols-4">
        <Field label="Coverage per package (sq ft)" help="Use the fastener manufacturer's installation guidance."><input className={input} inputMode="decimal" value={plan.screwCoverageSquareFeetPerPack} onChange={(e) => { setPlan({ ...plan, screwCoverageSquareFeetPerPack: e.target.value }); setPreview(null); }} /></Field>
        <Field label="Exact catalog product"><select className={input} value={plan.screwCatalogMaterialId ?? ""} onChange={(e) => chooseCatalog("screw", e.target.value)}><option value="">Enter verified cost manually</option>{catalogOptions("screw").map((material) => <option key={material.id} value={material.id}>{material.description} · ${material.effective_unit_cost ?? "?"}</option>)}</select></Field>
        <Field label="Package cost"><input className={input} inputMode="decimal" value={plan.screwPackUnitCost} onChange={(e) => { setPlan({ ...plan, screwPackUnitCost: e.target.value, screwCatalogMaterialId: null }); setPreview(null); }} /></Field>
        <Field label="Price source"><input className={input} value={plan.screwSourceReference} onChange={(e) => { setPlan({ ...plan, screwSourceReference: e.target.value, screwCatalogMaterialId: null }); setPreview(null); }} /></Field>
      </div>
    </div>

    <div className="mt-4 rounded-lg bg-white p-4">
      <h4 className="font-black text-slate-950">3. Planned quantities the photos cannot decide</h4>
      <p className="mt-1 text-sm text-slate-600">Leave a row blank when it does not apply. These quantities must come from your reviewed build plan, not AI.</p>
      <div className="mt-3 space-y-4">{plan.additionalLines.map((line) => <fieldset key={line.key} className="rounded-lg border border-slate-200 p-3"><legend className="px-1 font-bold text-slate-900">{line.description}</legend><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Field label="Quantity"><input className={input} inputMode="decimal" value={line.quantity} onChange={(e) => updateLine(line.key, "quantity", e.target.value)} /></Field>
        <Field label="Unit"><input className={input} value={line.unit} onChange={(e) => updateLine(line.key, "unit", e.target.value)} /></Field>
        {line.category === "material" ? <Field label="Exact catalog product"><select className={input} value={line.catalogMaterialId ?? ""} onChange={(e) => chooseCatalog(line.key, e.target.value)}><option value="">Enter verified cost manually</option>{catalogOptions(line.key).map((material) => <option key={material.id} value={material.id}>{material.description} · ${material.effective_unit_cost ?? "?"}</option>)}</select></Field> : <div />}
        <Field label="Unit cost"><input className={input} inputMode="decimal" value={line.unitCost} onChange={(e) => updateLine(line.key, "unitCost", e.target.value)} /></Field>
        <Field label="Cost source"><input className={input} value={line.sourceReference} onChange={(e) => updateLine(line.key, "sourceReference", e.target.value)} /></Field>
      </div></fieldset>)}</div>
    </div>

    {error ? <p role="alert" className="mt-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm font-bold text-red-900">{error}</p> : null}
    {notice ? <p role="status" className="mt-4 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm font-bold text-emerald-900">{notice}</p> : null}
    <button type="button" className={`mt-5 w-full ${primary}`} disabled={disabled || pending} onClick={() => void requestPreview()}>{pending ? "Working…" : "Calculate draft takeoff"}</button>

    {preview ? <section className="mt-5 rounded-lg border border-slate-300 bg-white p-4">
      <h4 className="text-lg font-black text-slate-950">4. Review before adding costs</h4>
      <p className="mt-1 text-sm text-slate-700">Verified deck area: {preview.deckAreaSquareFeet ? `${preview.deckAreaSquareFeet} sq ft` : "not available"}</p>
      {preview.unresolved.length ? <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3"><p className="font-bold text-amber-950">Still needs input</p><ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-950">{preview.unresolved.map((value) => <li key={value}>{value}</li>)}</ul></div> : null}
      <div className="mt-3 space-y-2">{preview.lines.map((line) => <details key={line.key} className="rounded-lg border border-slate-200 p-3"><summary className="min-h-11 cursor-pointer font-bold text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600">{line.customerDescription}: {line.quantity} {line.unit} × ${line.unitCost}</summary><p className="mt-2 text-sm text-slate-700">{line.formula}</p><p className="mt-1 break-all text-xs text-slate-600">Cost source: {line.sourceReference}</p></details>)}</div>
      {preview.status === "ready" ? <div className="mt-4 space-y-3">{[
        ["dimensions", "I reviewed the field dimensions used by this takeoff."],
        ["quantities", "I reviewed the build-plan quantities and formulas."],
        ["prices", "I reviewed every true cost and its source."],
      ].map(([key, label]) => <label key={key} className="flex min-h-11 items-center gap-3 rounded-lg border border-slate-200 p-3 text-sm font-bold text-slate-900"><input type="checkbox" checked={checks[key as keyof typeof checks]} onChange={(e) => setChecks({ ...checks, [key]: e.target.checked })} />{label}</label>)}<button type="button" className={`w-full ${primary}`} disabled={disabled || pending || !checks.dimensions || !checks.quantities || !checks.prices} onClick={() => void applyTakeoff()}>{pending ? "Adding…" : "Add reviewed takeoff to estimate"}</button></div> : null}
    </section> : null}
  </section>;
}
