"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import {
  buildItemMutationBody,
  canMutateEstimate,
  DECIMAL_PATTERNS,
  formatCents,
  loadEstimateBuilder,
  previewMarkupCents,
  requiredDecimalInput,
  retryRequiredBuilderReload,
  runEstimateBuilderMutation,
    type BuilderMutation,
    type BuilderReloadRequirement,
  type EstimateBuilderEnvelope,
  type EstimateBuilderItem,
  type EstimateBuilderSection, type EstimateItemDraft,
} from "@/lib/estimate-builder-client";

type SectionDraft = { id: string | null; name: string; customerDescription: string; internalNotes: string; sortOrder: string };
type EstimateSetupDraft = {
  title: string;
  validUntil: string;
  overheadPercent: string;
  profitMarkupPercent: string;
  taxRatePercent: string;
  discountAmount: string;
};
type ItemDraft = EstimateItemDraft & {
  id: string | null; itemType: "standard" | "allowance"; sectionId: string;
  customerDescription: string; internalDescription: string; quantity: string; unit: string;
};

const button = "rounded-md px-3 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50";
const primary = `${button} bg-slate-950 text-white hover:bg-slate-800`;
const secondary = `${button} border border-slate-300 bg-white text-slate-800 hover:bg-slate-50`;
const danger = `${button} border border-red-300 bg-white text-red-700 hover:bg-red-50`;
const input = "mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-100";

function sectionDraft(section?: EstimateBuilderSection, nextSortOrder = 0): SectionDraft {
  return { id: section?.id ?? null, name: section?.name ?? "", customerDescription: section?.customerDescription ?? "", internalNotes: section?.internalNotes ?? "", sortOrder: String(section?.sortOrder ?? nextSortOrder) };
}

function itemDraft(item: EstimateBuilderItem | undefined, sectionId: string, itemType: "standard" | "allowance", nextSortOrder: number): ItemDraft {
  return {
    id: item?.id ?? null, itemType: item?.itemType ?? itemType, sectionId: item?.sectionId ?? sectionId,
    customerDescription: item?.customerDescription ?? "", internalDescription: item?.internalDescription ?? "",
    quantity: item?.quantity ?? "1", unit: item?.unit ?? (itemType === "allowance" ? "allowance" : "ea"),
    materialUnitCost: item && "materialUnitCost" in item ? item.materialUnitCost ?? "" : "",
    laborUnitCost: item && "laborUnitCost" in item ? item.laborUnitCost ?? "" : "",
    subcontractorUnitCost: item && "subcontractorUnitCost" in item ? item.subcontractorUnitCost ?? "" : "",
    equipmentUnitCost: item && "equipmentUnitCost" in item ? item.equipmentUnitCost ?? "" : "",
    otherDirectUnitCost: item && "otherDirectUnitCost" in item ? item.otherDirectUnitCost ?? "" : "",
    materialWastePercent: item && "materialWastePercent" in item ? item.materialWastePercent ?? "0" : "0",
    itemMarkupPercent: item && "itemMarkupPercent" in item ? item.itemMarkupPercent ?? "" : "",
    fixedCustomerPrice: item?.itemType === "allowance" && "fixedCustomerPrice" in item ? item.fixedCustomerPrice ?? "" : "",
    taxable: item?.taxable ?? false, included: item?.included ?? true, sortOrder: String(item?.sortOrder ?? nextSortOrder),
    showCosts: !!item && "materialUnitCost" in item, showMarkup: !!item && "itemMarkupPercent" in item,
  };
}

function setupValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function estimateSetupDraft(state: EstimateBuilderEnvelope): EstimateSetupDraft {
  return {
    title: setupValue(state.estimate.title),
    validUntil: setupValue(state.estimate.validUntil),
    overheadPercent: setupValue(state.estimate.overheadPercent),
    profitMarkupPercent: setupValue(state.estimate.profitMarkupPercent),
    taxRatePercent: setupValue(state.estimate.taxRatePercent),
    discountAmount: setupValue(state.estimate.discountAmount),
  };
}

function nonnegativeInteger(value: string, label: string) {
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) throw new TypeError(`${label} must be a nonnegative whole number.`);
  return Number(value);
}

function humanizeStatus(value: unknown) {
  const status = typeof value === "string" && value ? value : "not editable";
  return status.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-sm font-semibold text-slate-800"><span>{label}</span>{children}</label>;
}

export function EstimateBuilder({ estimateId }: { estimateId: string }) {
  const [state, setState] = useState<EstimateBuilderEnvelope | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reloadRequirement, setReloadRequirement] = useState<BuilderReloadRequirement | null>(null);
  const [setupForm, setSetupForm] = useState<EstimateSetupDraft | null>(null);
  const [sectionForm, setSectionForm] = useState<SectionDraft | null>(null);
  const [itemForm, setItemForm] = useState<ItemDraft | null>(null);

  const reload = useCallback(async () => {
    setLoading(true); setError("");
    try { setState(await loadEstimateBuilder(fetch, estimateId)); setReloadRequirement(null); }
    catch (loadError) { setError(loadError instanceof Error ? loadError.message : "Unable to load the estimate builder."); }
    finally { setLoading(false); }
  }, [estimateId]);

  useEffect(() => { void reload(); }, [reload]);

  const mutate = useCallback(async (mutation: BuilderMutation) => {
    if (!state || pendingRef.current || !canMutateEstimate(state, reloadRequirement)) return false;
    pendingRef.current = true; setPending(true); setError(""); setNotice("");
    try {
      const result = await runEstimateBuilderMutation(fetch, estimateId, state, mutation, reloadRequirement);
      setState(result.state); setNotice(result.notice ?? "Estimate saved.");
      setReloadRequirement(result.reloadRequirement);
      return result.closeSubmittedForm;
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : "The estimate change could not be saved.");
      return false;
    } finally { pendingRef.current = false; setPending(false); }
  }, [estimateId, reloadRequirement, state]);

  const retryReload = useCallback(async () => {
    if (!state || !reloadRequirement || pendingRef.current) return;
    pendingRef.current = true; setPending(true); setError("");
    try {
      const result = await retryRequiredBuilderReload(fetch, estimateId, state, reloadRequirement);
      setState(result.state); setReloadRequirement(result.reloadRequirement); setNotice(result.notice);
    } finally { pendingRef.current = false; setPending(false); }
  }, [estimateId, reloadRequirement, state]);

  const sectionIds = useMemo(() => new Set(state?.sections.map((section) => section.id) ?? []), [state]);
  const orphan = state?.items.find((item) => !sectionIds.has(item.sectionId));

  if (loading) return <section className="mt-6 border border-slate-200 bg-white p-8" aria-busy="true"><p className="font-semibold text-slate-700">Loading estimate builder…</p></section>;
  if (!state) return <section className="mt-6 border border-red-200 bg-red-50 p-6"><h1 className="text-xl font-bold text-red-900">Estimate unavailable</h1><p className="mt-2 text-red-800">{error}</p><button className={`mt-4 ${secondary}`} onClick={() => void reload()}>Try again</button></section>;
  if (orphan) return <section className="mt-6 border border-red-200 bg-red-50 p-6"><h1 className="font-bold text-red-900">Estimate state needs attention</h1><p className="mt-2 text-red-800">Item {orphan.id} does not belong to a returned section. Reload before editing.</p><button className={`mt-4 ${secondary}`} onClick={() => void reload()}>Reload estimate</button></section>;

  const canMutate = canMutateEstimate(state, reloadRequirement);
  const controlsDisabled = pending || !canMutate;
  const canCreateStandard = canMutate && state.capabilities.canViewCosts && state.capabilities.canViewProfit;
  const calculation = state.estimate.calculation;
  const profitMarkupPreview = setupForm
    ? previewMarkupCents(
        typeof calculation.preProfitSubtotalCents === "string"
          ? calculation.preProfitSubtotalCents
          : null,
        setupForm.profitMarkupPercent,
      )
    : null;

  async function submitSection(event: FormEvent) {
    event.preventDefault(); if (!sectionForm || !canMutate) return;
    try {
      if (!sectionForm.name.trim()) throw new TypeError("Section name is required.");
      const body = { name: sectionForm.name.trim(), customerDescription: sectionForm.customerDescription.trim() || null, internalNotes: sectionForm.internalNotes.trim() || null, sortOrder: nonnegativeInteger(sectionForm.sortOrder, "Sort order") };
      const success = await mutate({ path: sectionForm.id ? `/api/estimates/${estimateId}/sections/${sectionForm.id}` : `/api/estimates/${estimateId}/sections`, method: sectionForm.id ? "PATCH" : "POST", body });
      if (success) setSectionForm(null);
    } catch (formError) { setError(formError instanceof Error ? formError.message : "Section is invalid."); }
  }

  async function submitItem(event: FormEvent) {
    event.preventDefault(); if (!itemForm || !canMutate) return;
    try {
      const body = buildItemMutationBody(itemForm, !itemForm.id);
      const success = await mutate({ path: itemForm.id ? `/api/estimates/${estimateId}/items/${itemForm.id}` : `/api/estimates/${estimateId}/items`, method: itemForm.id ? "PATCH" : "POST", body });
      if (success) setItemForm(null);
    } catch (formError) { setError(formError instanceof Error ? formError.message : "Item is invalid."); }
  }

  async function submitSetup(event: FormEvent) {
    event.preventDefault(); if (!setupForm || !canMutate) return;
    try {
      const title = setupForm.title.trim();
      if (!title) throw new TypeError("Estimate title is required.");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(setupForm.validUntil)) {
        throw new TypeError("Valid until must be a calendar date.");
      }
      const body = {
        title,
        validUntil: setupForm.validUntil,
        overheadPercent: requiredDecimalInput(setupForm.overheadPercent, DECIMAL_PATTERNS.percent, "Overhead percent"),
        profitMarkupPercent: requiredDecimalInput(setupForm.profitMarkupPercent, DECIMAL_PATTERNS.percent, "Profit markup percent"),
        taxRatePercent: requiredDecimalInput(setupForm.taxRatePercent, DECIMAL_PATTERNS.percent, "Tax rate percent"),
        discountAmount: requiredDecimalInput(setupForm.discountAmount, DECIMAL_PATTERNS.money, "Discount amount"),
      };
      const success = await mutate({ path: `/api/estimates/${estimateId}`, method: "PATCH", body });
      if (success) setSetupForm(null);
    } catch (formError) { setError(formError instanceof Error ? formError.message : "Estimate setup is invalid."); }
  }

  async function remove(kind: "section" | "item", id: string) {
    if (!canMutate) return;
    if (!window.confirm(`Delete this ${kind}? This cannot be undone.`)) return;
    await mutate({ path: `/api/estimates/${estimateId}/${kind === "section" ? "sections" : "items"}/${id}`, method: "DELETE", body: {} });
  }

  return <div className="mt-6 space-y-6">
    <header className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-emerald-700">Structured estimate</p><h1 className="mt-2 text-3xl font-bold text-slate-950">{String(state.estimate.title ?? "Untitled estimate")}</h1><p className="mt-2 text-sm text-slate-600">Revision {state.calculationRevision} · {canMutate ? "Editing enabled" : "Read only"}</p></div><div className="text-right"><p className="text-sm font-semibold text-slate-600">Customer total</p><p className="text-2xl font-bold text-slate-950">{formatCents(calculation.customerTotalCents as string | null | undefined)}</p></div></div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Summary label="Customer total" value={formatCents(calculation.customerTotalCents as string | null | undefined)} />{"directCostCents" in calculation ? <Summary label="Direct cost" value={formatCents(calculation.directCostCents as string | null | undefined)} /> : null}{"grossProfitCents" in calculation ? <Summary label="Gross profit" value={formatCents(calculation.grossProfitCents as string | null | undefined)} /> : null}{"grossMarginPercent" in calculation ? <Summary label="Gross margin" value={calculation.grossMarginPercent === null ? "—" : `${String(calculation.grossMarginPercent)}%`} /> : null}</div>
      <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold"><span className="rounded-full bg-slate-100 px-3 py-1">Costs {state.capabilities.canViewCosts ? "visible" : "hidden"}</span><span className="rounded-full bg-slate-100 px-3 py-1">Profit {state.capabilities.canViewProfit ? "visible" : "hidden"}</span></div>
    </header>

    {error ? <div role="alert" className="border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800">{error}</div> : null}
    {notice ? <div role="status" className="border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-900">{notice}</div> : null}

    {reloadRequirement ? <div role="alert" className="border border-amber-300 bg-amber-50 p-5 text-amber-950"><p className="font-bold">Editing is disabled until the latest estimate is loaded.</p><p className="mt-1 text-sm">The displayed state may be out of date. Revision {reloadRequirement.minimumAcceptableRevision} or newer is required. Retrying reload performs a read only and will not repeat your previous change.</p><button disabled={pending} className={`mt-3 ${primary}`} onClick={() => void retryReload()}>{pending ? "Reloading…" : "Retry reload"}</button></div> : null}

    {canMutate ? <div className="flex flex-wrap gap-3"><button disabled={controlsDisabled} className={primary} onClick={() => setSectionForm(sectionDraft(undefined, state.sections.length ? Math.max(...state.sections.map((section) => section.sortOrder)) + 10 : 0))}>Add section</button>{state.capabilities.canViewProfit ? <button disabled={controlsDisabled} className={secondary} onClick={() => setSetupForm(estimateSetupDraft(state))}>Edit estimate setup</button> : null}{pending ? <span className="self-center text-sm font-semibold text-slate-600">Saving…</span> : null}</div> : !reloadRequirement ? <p className="border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">{state.estimate.status !== "draft" ? `This estimate is ${humanizeStatus(state.estimate.status)} and can no longer be edited.` : "You can review this estimate, but you do not have permission to change pricing or structure."}</p> : null}

    {setupForm ? <form onSubmit={submitSetup} className="rounded-xl border border-violet-300 bg-violet-50/40 p-5"><h2 className="font-bold">Estimate setup</h2><p className="mt-1 text-sm text-slate-600">These percentages apply only to this job and recalculate the estimate when saved.</p><div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3"><Field label="Estimate title"><input autoFocus className={input} value={setupForm.title} onChange={(event) => setSetupForm({ ...setupForm, title: event.target.value })} disabled={controlsDisabled} /></Field><Field label="Valid until"><input type="date" className={input} value={setupForm.validUntil} onChange={(event) => setSetupForm({ ...setupForm, validUntil: event.target.value })} disabled={controlsDisabled} /></Field><Field label="Overhead percent"><input inputMode="decimal" className={input} value={setupForm.overheadPercent} onChange={(event) => setSetupForm({ ...setupForm, overheadPercent: event.target.value })} disabled={controlsDisabled} /></Field><MarkupSlider value={setupForm.profitMarkupPercent} previewCents={profitMarkupPreview} disabled={controlsDisabled} onChange={(profitMarkupPercent) => setSetupForm({ ...setupForm, profitMarkupPercent })} /><Field label="Tax rate percent"><input inputMode="decimal" className={input} value={setupForm.taxRatePercent} onChange={(event) => setSetupForm({ ...setupForm, taxRatePercent: event.target.value })} disabled={controlsDisabled} /></Field><Field label="Discount amount"><input inputMode="decimal" className={input} value={setupForm.discountAmount} onChange={(event) => setSetupForm({ ...setupForm, discountAmount: event.target.value })} disabled={controlsDisabled} /></Field></div><div className="mt-4 flex gap-3"><button className={primary} disabled={controlsDisabled}>{pending ? "Saving…" : "Save setup"}</button><button type="button" className={secondary} disabled={pending} onClick={() => setSetupForm(null)}>Cancel</button></div></form> : null}

    {sectionForm ? <form onSubmit={submitSection} className="rounded-xl border border-emerald-300 bg-emerald-50/40 p-5"><h2 className="font-bold">{sectionForm.id ? "Edit section" : "New section"}</h2><div className="mt-4 grid gap-4 md:grid-cols-2"><Field label="Section name"><input autoFocus className={input} value={sectionForm.name} onChange={(event) => setSectionForm({ ...sectionForm, name: event.target.value })} disabled={controlsDisabled} /></Field><Field label="Position"><input inputMode="numeric" className={input} value={sectionForm.sortOrder} onChange={(event) => setSectionForm({ ...sectionForm, sortOrder: event.target.value })} disabled={controlsDisabled} /></Field><Field label="Customer description"><textarea className={input} value={sectionForm.customerDescription} onChange={(event) => setSectionForm({ ...sectionForm, customerDescription: event.target.value })} disabled={controlsDisabled} /></Field><Field label="Internal notes"><textarea className={input} value={sectionForm.internalNotes} onChange={(event) => setSectionForm({ ...sectionForm, internalNotes: event.target.value })} disabled={controlsDisabled} /></Field></div><div className="mt-4 flex gap-3"><button className={primary} disabled={controlsDisabled}>Save section</button><button type="button" className={secondary} disabled={pending} onClick={() => setSectionForm(null)}>Cancel</button></div></form> : null}

    {itemForm ? <ItemEditor draft={itemForm} sections={state.sections} pending={controlsDisabled} onChange={setItemForm} onCancel={() => setItemForm(null)} onSubmit={submitItem} /> : null}

    <div className="space-y-5">{state.sections.map((section) => {
      const items = state.items.filter((item) => item.sectionId === section.id);
      const nextSort = items.length ? Math.max(...items.map((item) => item.sortOrder)) + 10 : 0;
      return <section key={section.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"><header className="border-b border-slate-200 bg-slate-50 p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-xl font-bold text-slate-950">{section.name}</h2>{section.customerDescription ? <p className="mt-1 text-sm text-slate-700">{section.customerDescription}</p> : null}{section.internalNotes ? <p className="mt-2 text-xs font-semibold text-amber-800">Internal: {section.internalNotes}</p> : null}<p className="mt-2 text-xs text-slate-500">Position {section.sortOrder}</p></div>{canMutate ? <div className="flex flex-wrap gap-2"><button disabled={controlsDisabled} className={secondary} onClick={() => setSectionForm(sectionDraft(section))}>Edit section</button><button disabled={controlsDisabled} className={danger} onClick={() => void remove("section", section.id)}>Delete</button></div> : null}</div>{canMutate ? <div className="mt-4 flex flex-wrap gap-2"><button disabled={controlsDisabled || !canCreateStandard} title={!canCreateStandard ? "Standard items require visible cost and markup inputs." : undefined} className={primary} onClick={() => setItemForm({ ...itemDraft(undefined, section.id, "standard", nextSort), showCosts: true, showMarkup: true })}>Add standard item</button><button disabled={controlsDisabled} className={secondary} onClick={() => setItemForm(itemDraft(undefined, section.id, "allowance", nextSort))}>Add allowance</button></div> : null}</header><div className="divide-y divide-slate-200">{items.length ? items.map((item) => <ItemRow key={item.id} item={item} canEdit={canMutate} pending={controlsDisabled} onEdit={() => setItemForm(itemDraft(item, item.sectionId, item.itemType, item.sortOrder))} onDelete={() => void remove("item", item.id)} />) : <p className="p-5 text-sm text-slate-500">No line items in this section.</p>}</div></section>;
    })}</div>
    {!state.sections.length ? <div className="border border-dashed border-slate-300 bg-white p-8 text-center text-slate-600">Add a section to begin organizing the estimate.</div> : null}
  </div>;
}

function Summary({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-slate-50 p-3"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 font-bold text-slate-950">{value}</p></div>;
}

function MarkupSlider({ value, previewCents, disabled, onChange }: { value: string; previewCents: string | null; disabled: boolean; onChange: (value: string) => void }) {
  return <label className="block text-sm font-semibold text-slate-800"><span className="flex items-center justify-between gap-3"><span>Profit markup</span><output className="font-bold text-violet-900">{value}% · {formatCents(previewCents)}</output></span><input aria-label="Profit markup percent" type="range" min="0" max="100" step="0.5" className="mt-3 w-full accent-violet-700" value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} /><span className="mt-1 block text-xs font-normal text-slate-600">Calculated on item prices plus overhead. Save to update the final estimate.</span></label>;
}

function ItemRow({ item, canEdit, pending, onEdit, onDelete }: { item: EstimateBuilderItem; canEdit: boolean; pending: boolean; onEdit: () => void; onDelete: () => void }) {
  return <article className="grid gap-4 p-5 lg:grid-cols-[1fr_auto]"><div><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2 py-1 text-xs font-bold uppercase ${item.itemType === "allowance" ? "bg-violet-100 text-violet-800" : "bg-sky-100 text-sky-800"}`}>{item.itemType}</span>{!item.included ? <span className="text-xs font-semibold text-slate-500">Not included</span> : null}{item.taxable ? <span className="text-xs font-semibold text-slate-500">Taxable</span> : null}</div><h3 className="mt-2 font-bold text-slate-950">{item.customerDescription}</h3>{item.internalDescription ? <p className="mt-1 text-xs text-amber-800">Internal: {item.internalDescription}</p> : null}<p className="mt-2 text-sm text-slate-600">{item.quantity} {item.unit} · sort {item.sortOrder}</p><div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm"><span>Customer price <strong>{formatCents(item.customerPriceCents)}</strong></span>{"directCostCents" in item ? <span>Direct cost <strong>{formatCents(item.directCostCents)}</strong></span> : null}{"itemMarkupCents" in item ? <span>Profit/markup <strong>{formatCents(item.itemMarkupCents)}</strong></span> : null}{item.itemType === "allowance" && "fixedCustomerPrice" in item ? <span>Allowance price <strong>${item.fixedCustomerPrice}</strong></span> : null}</div>{"materialUnitCost" in item ? <p className="mt-2 text-xs text-slate-600">Unit costs: material {item.materialUnitCost ?? "unknown"}, labor {item.laborUnitCost ?? "unknown"}, subcontractor {item.subcontractorUnitCost ?? "unknown"}, equipment {item.equipmentUnitCost ?? "unknown"}, other {item.otherDirectUnitCost ?? "unknown"}</p> : null}</div>{canEdit ? <div className="flex gap-2 lg:justify-end"><button disabled={pending} className={secondary} onClick={onEdit}>Edit / move</button><button disabled={pending} className={danger} onClick={onDelete}>Delete</button></div> : null}</article>;
}

function ItemEditor({ draft, sections, pending, onChange, onCancel, onSubmit }: { draft: ItemDraft; sections: readonly EstimateBuilderSection[]; pending: boolean; onChange: (draft: ItemDraft) => void; onCancel: () => void; onSubmit: (event: FormEvent) => void }) {
  const set = (field: keyof ItemDraft, value: string | boolean) => onChange({ ...draft, [field]: value });
  return <form onSubmit={onSubmit} className="rounded-xl border border-sky-300 bg-sky-50/40 p-5"><h2 className="text-lg font-bold">{draft.id ? "Edit" : "New"} {draft.itemType} item</h2><div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3"><Field label="Section"><select className={input} value={draft.sectionId} onChange={(event) => set("sectionId", event.target.value)} disabled={pending}>{sections.map((section) => <option key={section.id} value={section.id}>{section.name}</option>)}</select></Field><Field label="Customer description"><input className={input} value={draft.customerDescription} onChange={(event) => set("customerDescription", event.target.value)} disabled={pending} /></Field><Field label="Internal description"><input className={input} value={draft.internalDescription} onChange={(event) => set("internalDescription", event.target.value)} disabled={pending} /></Field><Field label="Quantity"><input inputMode="decimal" className={input} value={draft.quantity} onChange={(event) => set("quantity", event.target.value)} disabled={pending} /></Field><Field label="Unit"><input className={input} value={draft.unit} onChange={(event) => set("unit", event.target.value)} disabled={pending} /></Field><Field label="Sort order"><input inputMode="numeric" className={input} value={draft.sortOrder} onChange={(event) => set("sortOrder", event.target.value)} disabled={pending} /></Field>
      {draft.itemType === "standard" && draft.showCosts ? <><Field label="Material unit cost (blank = unknown)"><input inputMode="decimal" className={input} value={draft.materialUnitCost} onChange={(event) => set("materialUnitCost", event.target.value)} disabled={pending} /></Field><Field label="Labor unit cost (blank = unknown)"><input inputMode="decimal" className={input} value={draft.laborUnitCost} onChange={(event) => set("laborUnitCost", event.target.value)} disabled={pending} /></Field><Field label="Subcontractor unit cost (blank = unknown)"><input inputMode="decimal" className={input} value={draft.subcontractorUnitCost} onChange={(event) => set("subcontractorUnitCost", event.target.value)} disabled={pending} /></Field><Field label="Equipment unit cost (blank = unknown)"><input inputMode="decimal" className={input} value={draft.equipmentUnitCost} onChange={(event) => set("equipmentUnitCost", event.target.value)} disabled={pending} /></Field><Field label="Other direct unit cost (blank = unknown)"><input inputMode="decimal" className={input} value={draft.otherDirectUnitCost} onChange={(event) => set("otherDirectUnitCost", event.target.value)} disabled={pending} /></Field><Field label="Material waste percent"><input inputMode="decimal" className={input} value={draft.materialWastePercent} onChange={(event) => set("materialWastePercent", event.target.value)} disabled={pending} /></Field></> : null}
      {draft.itemType === "standard" && draft.showMarkup ? <Field label="Item markup percent"><input inputMode="decimal" className={input} value={draft.itemMarkupPercent} onChange={(event) => set("itemMarkupPercent", event.target.value)} disabled={pending} /></Field> : null}
      {draft.itemType === "allowance" ? <Field label="Fixed customer price"><input inputMode="decimal" className={input} value={draft.fixedCustomerPrice} onChange={(event) => set("fixedCustomerPrice", event.target.value)} disabled={pending} /></Field> : null}
    </div><div className="mt-4 flex flex-wrap gap-5"><label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={draft.taxable} onChange={(event) => set("taxable", event.target.checked)} disabled={pending} /> Taxable</label><label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={draft.included} onChange={(event) => set("included", event.target.checked)} disabled={pending} /> Included</label></div><div className="mt-5 flex gap-3"><button className={primary} disabled={pending}>{pending ? "Saving…" : "Save item"}</button><button type="button" className={secondary} disabled={pending} onClick={onCancel}>Cancel</button></div></form>;
}
