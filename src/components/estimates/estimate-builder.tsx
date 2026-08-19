"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";

import { ContractPreparationCard } from "@/components/estimates/contract-preparation";
import { GuidedDeckSiteVisit } from "@/components/estimates/guided-deck-site-visit";
import { DeckTakeoffPlanner } from "@/components/estimates/deck-takeoff-planner";
import { DeckShapeReview, type FinalizedDeckShape } from "@/components/estimates/deck-shape-review";
import { EstimateProposalCard } from "@/components/estimates/estimate-proposal-card";
import { FenceEstimateWorkflow } from "@/components/estimates/fence-estimate-workflow";

import {
  addPreviewCents,
  buildItemMutationBody,
  canMutateEstimate,
  DECIMAL_PATTERNS,
  ESTIMATE_COST_CATEGORIES,
  estimateItemPrimaryCostEntry,
  formatCents,
  formatDecimalDollars,
  loadEstimateBuilder,
  previewMarkupCents,
  previewMarkupPercent,
  previewEstimateRawCostCents,
  centsToMoneyInput,
  requiredDecimalInput,
  retryRequiredBuilderReload,
  runEstimateBuilderMutation,
    type BuilderMutation,
    type BuilderReloadRequirement,
  type EstimateBuilderEnvelope,
  type EstimateBuilderItem,
  type EstimateBuilderSection, type EstimateItemDraft,
  type EstimateCostCategory,
} from "@/lib/estimate-builder-client";
import { buildCustomerPresentation, snapshotEstimatePresentation } from "@/lib/estimate-presentation";
import { projectFenceEstimateWorkflow } from "@/lib/fence-estimate-workflow";

type SectionDraft = { id: string | null; name: string; customerDescription: string; internalNotes: string; sortOrder: string };
type EstimateSetupDraft = {
  title: string;
  description: string;
  propertyAddress: string;
  validUntil: string;
  scopeNotes: string;
  exclusions: string;
  customerNotes: string;
  overheadPercent: string;
  profitMarkupPercent: string;
  taxRatePercent: string;
  discountAmount: string;
};
type ItemDraft = EstimateItemDraft & {
  id: string | null; itemType: "standard" | "allowance"; sectionId: string;
  customerDescription: string; internalDescription: string; quantity: string; unit: string;
};
type PresentationDraft = {
  detailLevel: "lump_sum" | "section_summary" | "itemized";
  ohpPresentationMode: "distributed" | "separate_line_item";
  lumpSumLabel: string;
};
type DeckVisitItemSummary = {
  itemKey: string;
  title: string;
  ordinal: number;
  state: string;
  observation: Record<string, unknown>;
};
type DeckVisitSummary = {
  id: string;
  status: string;
  revision: number;
  items: DeckVisitItemSummary[];
  latestApprovedShape: FinalizedDeckShape | null;
};
type DeckWorkspaceStage = "site_visit" | "shape" | "structure" | "takeoff" | "proposal";
type DeckStructureReadiness = "not_ready" | "preliminary_geometry" | "approved_plan";

const button = "rounded-md px-3 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50";
const primary = `${button} bg-slate-950 text-white hover:bg-slate-800`;
const secondary = `${button} border border-slate-300 bg-white text-slate-800 hover:bg-slate-50`;
const danger = `${button} border border-red-300 bg-white text-red-700 hover:bg-red-50`;
const input = "mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-100";

function sectionDraft(section?: EstimateBuilderSection, nextSortOrder = 0): SectionDraft {
  return { id: section?.id ?? null, name: section?.name ?? "", customerDescription: section?.customerDescription ?? "", internalNotes: section?.internalNotes ?? "", sortOrder: String(section?.sortOrder ?? nextSortOrder) };
}

function itemDraft(item: EstimateBuilderItem | undefined, sectionId: string, itemType: "standard" | "allowance", nextSortOrder: number): ItemDraft {
  const cost = estimateItemPrimaryCostEntry(item);
  return {
    id: item?.id ?? null, itemType: item?.itemType ?? itemType, sectionId: item?.sectionId ?? sectionId,
    customerDescription: item?.customerDescription ?? "", internalDescription: item?.internalDescription ?? "",
    quantity: item?.quantity ?? "1", unit: item?.unit ?? (itemType === "allowance" ? "allowance" : "ea"),
    costCategory: cost.category, unitCost: cost.unitCost,
    fixedCustomerPrice: item?.itemType === "allowance" && "fixedCustomerPrice" in item ? item.fixedCustomerPrice ?? "" : "",
    taxable: item?.taxable ?? false, included: item?.included ?? true, sortOrder: String(item?.sortOrder ?? nextSortOrder),
  };
}

function setupValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function estimateSetupDraft(state: EstimateBuilderEnvelope): EstimateSetupDraft {
  return {
    title: setupValue(state.estimate.title),
    description: setupValue(state.estimate.description),
    propertyAddress: setupValue(state.estimate.propertyAddress),
    validUntil: setupValue(state.estimate.validUntil),
    scopeNotes: setupValue(state.estimate.scopeNotes),
    exclusions: setupValue(state.estimate.exclusions),
    customerNotes: setupValue(state.estimate.customerNotes),
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

export function EstimateBuilder({
  estimateId,
  showFenceWorkflow = false,
  showDeckWorkflow = false,
}: {
  estimateId: string;
  showFenceWorkflow?: boolean;
  showDeckWorkflow?: boolean;
}) {
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
  const [ohpDraftPercent, setOhpDraftPercent] = useState<string | null>(null);
  const [ohpDraftDollars, setOhpDraftDollars] = useState<string | null>(null);
  const [presentationDraft, setPresentationDraft] = useState<PresentationDraft | null>(null);
  const [deckVisitStatus, setDeckVisitStatus] = useState<"checking" | "unavailable" | "not_started" | "in_progress" | "completed">("checking");
  const [deckVisitSummary, setDeckVisitSummary] = useState<DeckVisitSummary | null>(null);
  const [deckWorkspaceStage, setDeckWorkspaceStage] = useState<DeckWorkspaceStage>("site_visit");
  const [finalizedDeckShape, setFinalizedDeckShape] = useState<FinalizedDeckShape | null>(null);
  const [deckStructureReadiness, setDeckStructureReadiness] = useState<DeckStructureReadiness>("not_ready");

  const loadDeckVisitStatus = useCallback(async () => {
    if (!showDeckWorkflow) return;
    try {
      const response = await fetch(`/api/estimates/${encodeURIComponent(estimateId)}/guided-site-visits`, { cache: "no-store" });
      const body = await response.json() as { activeVisit?: DeckVisitSummary | null; latestCompletedVisit?: DeckVisitSummary | null };
      if (!response.ok) throw new Error("Deck site visit status could not be loaded.");
      const summary = body.latestCompletedVisit ?? body.activeVisit ?? null;
      setDeckVisitSummary(summary);
      setFinalizedDeckShape(summary?.latestApprovedShape ?? null);
      setDeckVisitStatus(body.latestCompletedVisit?.status === "completed" ? "completed" : body.activeVisit ? "in_progress" : "not_started");
    } catch {
      setDeckVisitSummary(null);
      setDeckVisitStatus("unavailable");
    }
  }, [estimateId, showDeckWorkflow]);

  const reload = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const loaded = await loadEstimateBuilder(fetch, estimateId);
      setState(loaded);
      setPresentationDraft({ detailLevel: loaded.estimate.presentation.detailLevel, ohpPresentationMode: loaded.estimate.presentation.ohpPresentationMode, lumpSumLabel: loaded.estimate.presentation.lumpSumLabel });
      setReloadRequirement(null);
    }
    catch (loadError) { setError(loadError instanceof Error ? loadError.message : "Unable to load the estimate builder."); }
    finally { setLoading(false); }
  }, [estimateId]);

  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => { void loadDeckVisitStatus(); }, [loadDeckVisitStatus]);
  useEffect(() => {
    if (!showDeckWorkflow) return;
    if (deckVisitStatus === "completed") {
      const lifecycleStatus = String(state?.estimate.status ?? "draft");
      const issuedOrResponded = lifecycleStatus !== "draft";
      setDeckWorkspaceStage((current) => issuedOrResponded ? "proposal" : current === "site_visit" ? finalizedDeckShape ? "structure" : "shape" : current);
    } else if (deckVisitStatus !== "checking")
      setDeckWorkspaceStage("site_visit");
  }, [deckVisitStatus, finalizedDeckShape, showDeckWorkflow, state?.estimate.status]);
  const handleDeckVisitStatusChanged = useCallback((status: "checking" | "unavailable" | "not_started" | "in_progress" | "completed") => {
    setDeckVisitStatus(status);
    if (status === "completed") void loadDeckVisitStatus();
  }, [loadDeckVisitStatus]);
  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(""), 4500);
    return () => window.clearTimeout(timeout);
  }, [notice]);

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
  const directCostCents = previewEstimateRawCostCents(state.items, itemForm);
  const storedOhpPercent = setupValue(state.estimate.overheadPercent);
  const ohpPercent = ohpDraftDollars === null
    ? ohpDraftPercent ?? storedOhpPercent
    : previewMarkupPercent(directCostCents, ohpDraftDollars) ?? "";
  const ohpPreview = previewMarkupCents(directCostCents, ohpPercent);
  const ohpDollarInput = ohpDraftDollars ?? centsToMoneyInput(ohpPreview);
  const customerPricePreview = addPreviewCents(directCostCents, ohpPreview);
  const presentationSnapshot = presentationDraft?.lumpSumLabel.trim() ? snapshotEstimatePresentation({
    id: "estimate-preview",
    name: "Estimate preview",
    detailLevel: presentationDraft.detailLevel,
    lumpSumLabel: presentationDraft.lumpSumLabel,
    showQuantities: presentationDraft.detailLevel === "itemized",
    showUnitPrices: presentationDraft.detailLevel === "itemized",
    showSectionSubtotals: presentationDraft.detailLevel !== "lump_sum",
    ohpPresentationMode: presentationDraft.detailLevel === "lump_sum" ? "distributed" : presentationDraft.ohpPresentationMode,
  }) : null;
  const customerPresentation = presentationSnapshot
    ? buildCustomerPresentation(presentationSnapshot, state.sections, state.items, calculation)
    : null;
  const deckTakeoffStarted = state.sections.length > 0 || state.items.length > 0;
  const deckReviewedTakeoffApplied = state.sections.some((section) => section.name.trim().toLowerCase() === "reviewed deck takeoff");
  const deckTrueCostLineCount = state.items.filter((item) =>
    item.itemType === "standard" && item.included && typeof item.directCostCents === "string" && /^\d+$/.test(item.directCostCents) && BigInt(item.directCostCents) > 0n
  ).length;
  const deckTrueCostsReady = deckTrueCostLineCount > 0;
  const deckCustomerTotalReady = typeof calculation.customerTotalCents === "string" && /^\d+$/.test(calculation.customerTotalCents) && BigInt(calculation.customerTotalCents) > 0n;
  const deckPricingReady =
    deckVisitStatus === "completed" &&
    deckReviewedTakeoffApplied &&
    deckTrueCostsReady;
  const deckProposalReady = deckPricingReady && deckCustomerTotalReady;
  const fenceWorkflow = showFenceWorkflow
    ? projectFenceEstimateWorkflow({
        estimate: state.estimate,
        editable: canMutate,
        fenceDataState: "ready",
      })
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

  async function submitItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!itemForm || !canMutate) return;
    try {
      const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
      const addAnother = !itemForm.id && submitter?.value === "add-another";
      const body = buildItemMutationBody(itemForm, !itemForm.id);
      const success = await mutate({ path: itemForm.id ? `/api/estimates/${estimateId}/items/${itemForm.id}` : `/api/estimates/${estimateId}/items`, method: itemForm.id ? "PATCH" : "POST", body });
      if (success) setItemForm(addAnother
        ? itemDraft(undefined, itemForm.sectionId, itemForm.itemType, nonnegativeInteger(itemForm.sortOrder, "Sort order") + 10)
        : null);
    } catch (formError) { setError(formError instanceof Error ? formError.message : "Item is invalid."); }
  }

  async function saveInlineItem(draft: ItemDraft) {
    if (!draft.id || !canMutate) return false;
    try {
      const body = buildItemMutationBody(draft, false);
      return await mutate({ path: `/api/estimates/${estimateId}/items/${draft.id}`, method: "PATCH", body });
    } catch (formError) {
      setError(formError instanceof Error ? formError.message : "Item is invalid.");
      return false;
    }
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
        description: setupForm.description.trim() || null,
        propertyAddress: setupForm.propertyAddress.trim() || null,
        validUntil: setupForm.validUntil,
        scopeNotes: setupForm.scopeNotes.trim() || null,
        exclusions: setupForm.exclusions.trim() || null,
        customerNotes: setupForm.customerNotes.trim() || null,
        taxRatePercent: requiredDecimalInput(setupForm.taxRatePercent, DECIMAL_PATTERNS.percent, "Tax rate percent"),
        discountAmount: requiredDecimalInput(setupForm.discountAmount, DECIMAL_PATTERNS.money, "Discount amount"),
      };
      const success = await mutate({ path: `/api/estimates/${estimateId}`, method: "PATCH", body });
      if (success) setSetupForm(null);
    } catch (formError) { setError(formError instanceof Error ? formError.message : "Estimate setup is invalid."); }
  }

  async function submitPricing(event: FormEvent) {
    event.preventDefault(); if (!canMutate) return;
    try {
      const overheadPercent = requiredDecimalInput(ohpPercent, DECIMAL_PATTERNS.percent, "OH&P percent");
      const success = await mutate({
        path: `/api/estimates/${estimateId}`,
        method: "PATCH",
        body: { overheadPercent, profitMarkupPercent: "0" },
      });
      if (success) {
        setOhpDraftPercent(null);
        setOhpDraftDollars(null);
        setNotice("Pricing saved. The customer preview below has been updated.");
      }
    } catch (formError) { setError(formError instanceof Error ? formError.message : "OH&P is invalid."); }
  }

  async function submitPresentation(event: FormEvent) {
    event.preventDefault(); if (!state || !presentationDraft || !canMutate || !state.estimate.presentation.schemaAvailable) return;
    try {
      const lumpSumLabel = presentationDraft.lumpSumLabel.trim();
      if (!lumpSumLabel || lumpSumLabel.length > 240) throw new TypeError("The lump-sum description must be 1 to 240 characters.");
      const success = await mutate({
        path: `/api/estimates/${estimateId}`,
        method: "PATCH",
        body: {
          presentationDetailLevel: presentationDraft.detailLevel,
          presentationOhpMode: presentationDraft.detailLevel === "lump_sum" ? "distributed" : presentationDraft.ohpPresentationMode,
          presentationLumpSumLabel: lumpSumLabel,
        },
      });
      if (success) setNotice("Customer presentation saved.");
    } catch (formError) { setError(formError instanceof Error ? formError.message : "Customer presentation is invalid."); }
  }

  async function remove(kind: "section" | "item", id: string) {
    if (!canMutate) return;
    if (!window.confirm(`Delete this ${kind}? This cannot be undone.`)) return;
    await mutate({ path: `/api/estimates/${estimateId}/${kind === "section" ? "sections" : "items"}/${id}`, method: "DELETE", body: {} });
  }

  function beginDeckTakeoff() {
    if (!state || !canMutate) return;
    setDeckWorkspaceStage("shape");
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const target = document.getElementById("deck-stage-shape");
      target?.focus({ preventScroll: true });
      target?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
        block: "start",
      });
    }));
  }

  function openDeckWorkspaceStage(stage: DeckWorkspaceStage) {
    if (stage === "shape" && deckVisitStatus !== "completed") return;
    if (stage === "structure" && !finalizedDeckShape) return;
    if (stage === "takeoff" && deckStructureReadiness === "not_ready") return;
    if (stage === "proposal" && !deckProposalReady) return;
    setDeckWorkspaceStage(stage);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const target = document.getElementById(stage === "structure" || stage === "takeoff" ? "deck-takeoff-workspace" : `deck-stage-${stage}`);
      target?.focus({ preventScroll: true });
      target?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        block: "start",
      });
    }));
  }

  function beginDeckCostLine(category: EstimateCostCategory) {
    if (!state || !canCreateStandard || !state.sections.length) return;
    const section = state.sections.find((entry) => entry.name.trim().toLowerCase() === "deck construction") ?? state.sections[0];
    const sectionItems = state.items.filter((item) => item.sectionId === section.id);
    const nextSort = sectionItems.length
      ? Math.max(...sectionItems.map((item) => item.sortOrder)) + 10
      : 0;
    const draft = itemDraft(undefined, section.id, "standard", nextSort);
    setItemForm({
      ...draft,
      costCategory: category,
      unit: category === "labor" ? "hr" : category === "equipment" ? "day" : "ea",
    });
  }

  return <div className="mt-6 space-y-6">
    <header className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-emerald-700">Structured estimate</p><h1 className="mt-2 text-3xl font-bold text-slate-950">{String(state.estimate.title ?? "Untitled estimate")}</h1><p className="mt-2 text-sm text-slate-600">Revision {state.calculationRevision} · {canMutate ? "Editing enabled" : "Read only"}</p></div>{!showDeckWorkflow || deckWorkspaceStage !== "site_visit" ? <div className="text-right"><p className="text-sm font-semibold text-slate-600">Customer total</p><p className="text-2xl font-bold text-slate-950">{formatCents(calculation.customerTotalCents as string | null | undefined)}</p></div> : null}</div>
      {!showDeckWorkflow || deckWorkspaceStage !== "site_visit" ? <><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Summary label="Customer total" value={formatCents(calculation.customerTotalCents as string | null | undefined)} />{"directCostCents" in calculation ? <Summary label="Direct cost" value={formatCents(calculation.directCostCents as string | null | undefined)} /> : null}{"grossProfitCents" in calculation ? <Summary label="Gross profit" value={formatCents(calculation.grossProfitCents as string | null | undefined)} /> : null}{"grossMarginPercent" in calculation ? <Summary label="Gross margin" value={calculation.grossMarginPercent === null ? "—" : `${String(calculation.grossMarginPercent)}%`} /> : null}</div><div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold"><span className="rounded-full bg-slate-100 px-3 py-1">Costs {state.capabilities.canViewCosts ? "visible" : "hidden"}</span><span className="rounded-full bg-slate-100 px-3 py-1">Profit {state.capabilities.canViewProfit ? "visible" : "hidden"}</span></div></> : null}
    </header>

    {error ? <div role="alert" className="estimate-save-toast fixed right-6 top-24 z-[80] max-w-md border border-red-300 bg-red-50 p-4 text-sm font-semibold text-red-950 shadow-2xl">{error}</div> : null}
    {notice ? <div role="status" className="estimate-save-toast fixed right-6 top-24 z-[80] max-w-md border border-emerald-300 bg-emerald-50 p-4 text-sm font-semibold text-emerald-950 shadow-2xl">{notice}</div> : null}

    {reloadRequirement ? <div role="alert" className="border border-amber-300 bg-amber-50 p-5 text-amber-950"><p className="font-bold">Editing is disabled until the latest estimate is loaded.</p><p className="mt-1 text-sm">The displayed state may be out of date. Revision {reloadRequirement.minimumAcceptableRevision} or newer is required. Retrying reload performs a read only and will not repeat your previous change.</p><button disabled={pending} className={`mt-3 ${primary}`} onClick={() => void retryReload()}>{pending ? "Reloading…" : "Retry reload"}</button></div> : null}

    {fenceWorkflow ? <FenceEstimateWorkflow
      workflow={fenceWorkflow}
      returnHref={`/sales/estimates/${encodeURIComponent(estimateId)}`}
      estimateId={estimateId}
      editable={canMutate}
    /> : null}

    {showDeckWorkflow ? <DeckJobStageHeader
      activeStage={deckWorkspaceStage}
      visitStatus={deckVisitStatus}
      shapeReady={Boolean(finalizedDeckShape)}
      structureReadiness={deckStructureReadiness}
      takeoffStarted={deckTakeoffStarted}
      trueCostLineCount={deckTrueCostLineCount}
      proposalReady={deckProposalReady}
      onOpenStage={openDeckWorkspaceStage}
    /> : null}

    {showDeckWorkflow && deckWorkspaceStage === "site_visit" ? <section id="deck-stage-site_visit" tabIndex={-1} className="scroll-mt-24 focus-visible:outline-none"><GuidedDeckSiteVisit estimateId={estimateId} onVisitStatusChanged={handleDeckVisitStatusChanged} onContinueToEstimate={beginDeckTakeoff} /></section> : null}

    {showDeckWorkflow && deckWorkspaceStage === "shape" && deckVisitSummary ? <section id="deck-stage-shape" tabIndex={-1} className="scroll-mt-24 focus-visible:outline-none"><DeckShapeReview
      visitItems={deckVisitSummary.items}
      visitId={deckVisitSummary.id}
      visitRevision={deckVisitSummary.revision}
      initialShape={finalizedDeckShape}
      disabled={controlsDisabled}
      onFinalize={(shape) => {
        setFinalizedDeckShape(shape);
        setDeckStructureReadiness("not_ready");
        setDeckWorkspaceStage("structure");
      }}
    /></section> : null}

    {showDeckWorkflow && (deckWorkspaceStage === "structure" || deckWorkspaceStage === "takeoff") ? <DeckTakeoffWorkspace
      estimateId={estimateId}
      calculationRevision={state.calculationRevision}
      visitStatus={deckVisitStatus}
      visitSummary={deckVisitSummary}
      hasSection={state.sections.length > 0}
      trueCostLineCount={deckTrueCostLineCount}
      directCost={formatCents("directCostCents" in calculation ? calculation.directCostCents as string | null | undefined : null)}
      takeoffApplied={deckReviewedTakeoffApplied}
      canEdit={canCreateStandard}
      disabled={controlsDisabled}
      workflowPhase={deckWorkspaceStage}
      structureReadiness={deckStructureReadiness}
      approvedShape={finalizedDeckShape}
      onCreateSection={beginDeckTakeoff}
      onAddCostLine={beginDeckCostLine}
      onTakeoffApplied={(nextState) => { setState(nextState); setNotice("Reviewed Deck takeoff added. Review the true-cost lines, then continue to OH&P."); }}
      onStructureReady={(readiness) => { setDeckStructureReadiness(readiness); setDeckWorkspaceStage("takeoff"); }}
      onContinuePricing={() => document.getElementById("deck-pricing-workspace")?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" })}
    /> : null}

    {(!showDeckWorkflow || deckWorkspaceStage === "takeoff") && (canMutate ? <div id={showDeckWorkflow ? undefined : "deck-takeoff-workspace"} className="flex scroll-mt-24 flex-wrap gap-3"><button disabled={controlsDisabled} className={primary} onClick={() => setSectionForm(sectionDraft(undefined, state.sections.length ? Math.max(...state.sections.map((section) => section.sortOrder)) + 10 : 0))}>Add section</button>{state.capabilities.canViewProfit ? <button disabled={controlsDisabled} className={secondary} onClick={() => setSetupForm(estimateSetupDraft(state))}>Edit estimate details</button> : null}{pending ? <span className="self-center text-sm font-semibold text-slate-600">Saving…</span> : null}</div> : !reloadRequirement ? <p className="border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">{state.estimate.status !== "draft" ? `This estimate is ${humanizeStatus(state.estimate.status)} and can no longer be edited.` : "You can review this estimate, but you do not have permission to change pricing or structure."}</p> : null)}

    {(!showDeckWorkflow || deckWorkspaceStage === "takeoff") && setupForm ? <form onSubmit={submitSetup} className="estimate-editor-panel rounded-xl border p-5">
      <h2 className="font-bold">Estimate details</h2>
      <p className="mt-1 text-sm text-slate-600">Add the customer-facing project details that appear on the printable estimate.</p>
      <div className="mt-4 grid gap-4 md:grid-cols-2"><Field label="Estimate title"><input autoFocus className={input} value={setupForm.title} onChange={(event) => setSetupForm({ ...setupForm, title: event.target.value })} disabled={controlsDisabled} /></Field><Field label="Valid until"><input type="date" className={input} value={setupForm.validUntil} onChange={(event) => setSetupForm({ ...setupForm, validUntil: event.target.value })} disabled={controlsDisabled} /></Field></div>
      <div className="mt-4 grid gap-4 md:grid-cols-2"><Field label="Project address"><input className={input} value={setupForm.propertyAddress} onChange={(event) => setSetupForm({ ...setupForm, propertyAddress: event.target.value })} disabled={controlsDisabled} placeholder="Customer project address" /></Field><Field label="Project overview"><textarea className={`${input} min-h-24`} value={setupForm.description} onChange={(event) => setSetupForm({ ...setupForm, description: event.target.value })} disabled={controlsDisabled} placeholder="Briefly describe the finished project" /></Field></div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3"><Field label="Scope of work"><textarea className={`${input} min-h-32`} value={setupForm.scopeNotes} onChange={(event) => setSetupForm({ ...setupForm, scopeNotes: event.target.value })} disabled={controlsDisabled} placeholder="What is included in this estimate" /></Field><Field label="Exclusions"><textarea className={`${input} min-h-32`} value={setupForm.exclusions} onChange={(event) => setSetupForm({ ...setupForm, exclusions: event.target.value })} disabled={controlsDisabled} placeholder="What is not included" /></Field><Field label="Customer notes"><textarea className={`${input} min-h-32`} value={setupForm.customerNotes} onChange={(event) => setSetupForm({ ...setupForm, customerNotes: event.target.value })} disabled={controlsDisabled} placeholder="Payment terms, selections, or other notes" /></Field></div>
      <details className="mt-5 rounded-lg border border-slate-200 bg-white p-4"><summary className="cursor-pointer text-sm font-bold text-slate-800">Additional adjustments</summary><div className="mt-4 grid gap-4 md:grid-cols-2"><Field label="Municipality material tax percent"><input inputMode="decimal" className={input} value={setupForm.taxRatePercent} onChange={(event) => setSetupForm({ ...setupForm, taxRatePercent: event.target.value })} disabled={controlsDisabled} /><span className="mt-1 block text-xs text-slate-500">Applied only to material cost before OH&amp;P. The municipality-rate lookup will fill this automatically once its verified rate source is configured.</span></Field><Field label="Discount amount"><input inputMode="decimal" className={input} value={setupForm.discountAmount} onChange={(event) => setSetupForm({ ...setupForm, discountAmount: event.target.value })} disabled={controlsDisabled} /></Field></div></details>
      <div className="mt-4 flex gap-3"><button className={primary} disabled={controlsDisabled}>{pending ? "Saving…" : "Save details"}</button><button type="button" className={secondary} disabled={pending} onClick={() => setSetupForm(null)}>Cancel</button></div>
    </form> : null}

    {(!showDeckWorkflow || deckWorkspaceStage === "takeoff") && sectionForm ? <form onSubmit={submitSection} className="estimate-editor-panel rounded-xl border p-5"><h2 className="font-bold">{sectionForm.id ? "Edit section" : "New section"}</h2><div className="mt-4 grid gap-4 md:grid-cols-2"><Field label="Section name"><input autoFocus className={input} value={sectionForm.name} onChange={(event) => setSectionForm({ ...sectionForm, name: event.target.value })} disabled={controlsDisabled} /></Field><Field label="Position"><input inputMode="numeric" className={input} value={sectionForm.sortOrder} onChange={(event) => setSectionForm({ ...sectionForm, sortOrder: event.target.value })} disabled={controlsDisabled} /></Field><Field label="Customer description"><textarea className={input} value={sectionForm.customerDescription} onChange={(event) => setSectionForm({ ...sectionForm, customerDescription: event.target.value })} disabled={controlsDisabled} /></Field><Field label="Internal notes"><textarea className={input} value={sectionForm.internalNotes} onChange={(event) => setSectionForm({ ...sectionForm, internalNotes: event.target.value })} disabled={controlsDisabled} /></Field></div><div className="mt-4 flex gap-3"><button className={primary} disabled={controlsDisabled}>Save section</button><button type="button" className={secondary} disabled={pending} onClick={() => setSectionForm(null)}>Cancel</button></div></form> : null}

    {(!showDeckWorkflow || deckWorkspaceStage === "takeoff") ? <div className="space-y-5">{state.sections.map((section) => {
      const items = state.items.filter((item) => item.sectionId === section.id);
      const nextSort = items.length ? Math.max(...items.map((item) => item.sortOrder)) + 10 : 0;
      const addingHere = itemForm?.sectionId === section.id && itemForm.id === null;
      return <section key={section.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"><header className="border-b border-slate-200 bg-slate-50 p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-xl font-bold text-slate-950">{section.name}</h2>{section.customerDescription ? <p className="mt-1 text-sm text-slate-700">{section.customerDescription}</p> : null}{section.internalNotes ? <p className="mt-2 text-xs font-semibold text-amber-800">Internal: {section.internalNotes}</p> : null}</div>{canMutate ? <div className="flex flex-wrap gap-2"><button disabled={controlsDisabled} className={secondary} onClick={() => setSectionForm(sectionDraft(section))}>Edit section</button><button disabled={controlsDisabled} className={danger} onClick={() => void remove("section", section.id)}>Delete</button></div> : null}</div>{canMutate ? <div className="mt-4 flex flex-wrap gap-2"><button disabled={controlsDisabled || !canCreateStandard || addingHere} title={!canCreateStandard ? "Standard items require cost and profit access." : undefined} className={primary} onClick={() => setItemForm(itemDraft(undefined, section.id, "standard", nextSort))}>Add line item</button><button disabled={controlsDisabled || addingHere} className={secondary} onClick={() => setItemForm(itemDraft(undefined, section.id, "allowance", nextSort))}>Add allowance</button><span className="self-center text-xs text-slate-500">Edit any row directly. Tab moves across fields.</span></div> : null}</header>
        <div className="estimate-cost-sheet overflow-x-auto">
          {items.length ? <div className="estimate-sheet-header hidden min-w-[1050px] grid-cols-[9rem_minmax(12rem,1fr)_minmax(14rem,1.2fr)_6rem_7rem_8rem_8rem_8rem] gap-2 px-4 py-2 text-xs font-bold uppercase tracking-wide text-slate-500 md:grid"><span>Category</span><span>Heading</span><span>Description</span><span>Qty</span><span>Unit</span><span>Unit cost</span><span>Raw cost</span><span>Actions</span></div> : null}
          <div className="divide-y divide-slate-200">{items.length ? items.map((item) => <InlineItemRow key={item.id} item={item} canEdit={canMutate} pending={controlsDisabled} onSave={saveInlineItem} onDelete={() => void remove("item", item.id)} />) : !addingHere ? <p className="p-5 text-sm text-slate-500">No line items in this section.</p> : null}</div>
        </div>
        {addingHere ? <div className="border-t border-slate-200 p-4"><ItemEditor draft={itemForm} pending={controlsDisabled} onChange={setItemForm} onCancel={() => setItemForm(null)} onSubmit={submitItem} /></div> : null}
      </section>;
    })}</div> : null}
    {(!showDeckWorkflow || deckWorkspaceStage === "takeoff") && !state.sections.length ? <div className="border border-dashed border-slate-300 bg-white p-8 text-center text-slate-600">Add a section to begin organizing the estimate.</div> : null}
    {(!showDeckWorkflow || deckWorkspaceStage === "takeoff") && state.capabilities.canViewProfit && presentationDraft ? <section id={showDeckWorkflow ? "deck-pricing-workspace" : undefined} className={`scroll-mt-24 rounded-2xl border bg-white p-6 shadow-sm ${showDeckWorkflow && !deckPricingReady ? "border-slate-300" : "border-emerald-500"}`}>
      <form onSubmit={submitPricing}>
        <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-emerald-700">Bottom-line pricing</p><h2 className="mt-2 text-2xl font-bold text-slate-950">Set the job price</h2><p className="mt-1 text-sm text-slate-600">Set OH&amp;P only after verified field work and positive true-cost lines, then choose how the finished price appears to the customer.</p></div><div className="grid grid-cols-3 gap-3 text-right"><Summary label="Raw costs" value={formatCents(directCostCents)} /><Summary label="OH&P" value={formatCents(ohpPreview)} /><Summary label="Customer price" value={formatCents(customerPricePreview)} /></div></div>
        {showDeckWorkflow && !deckPricingReady ? <p className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm font-bold text-amber-950">OH&amp;P is locked until the completed Deck visit has a full reviewed takeoff with positive framing, hardware, labor, and other required true-cost lines. Saved finish materials remain in the estimate.</p> : null}
        <div className="mt-6"><PercentageSlider label="OH&P markup" value={ohpPercent} dollarValue={ohpDollarInput} disabled={controlsDisabled || directCostCents === null || showDeckWorkflow && !deckPricingReady} onPercentChange={(value) => { setOhpDraftDollars(null); setOhpDraftPercent(value); }} onDollarChange={(value) => { setOhpDraftPercent(null); setOhpDraftDollars(value); }} /></div>
        {itemForm ? <p className="estimate-live-preview-note mt-4 rounded-lg p-3 text-sm font-semibold">Live preview includes the line item you are editing. Save the line item to make the cost permanent.</p> : null}
        {canMutate ? <div className="mt-5 flex flex-wrap items-center gap-3"><button className={primary} disabled={controlsDisabled || directCostCents === null || !ohpPercent || showDeckWorkflow && !deckPricingReady}>{pending ? "Saving…" : "Save job pricing"}</button>{ohpDraftPercent !== null || ohpDraftDollars !== null ? <button type="button" className={secondary} disabled={pending} onClick={() => { setOhpDraftPercent(null); setOhpDraftDollars(null); }}>Reset</button> : null}</div> : null}
      </form>

      <div className="my-6 border-t border-slate-200" />
      <form onSubmit={submitPresentation}>
        <div className="flex flex-wrap items-end gap-4">
          <label className="min-w-56 flex-1 text-sm font-bold text-slate-800">Customer shows<select className={input} value={presentationDraft.detailLevel} onChange={(event) => { const detailLevel = event.target.value as PresentationDraft["detailLevel"]; setPresentationDraft({ ...presentationDraft, detailLevel, ohpPresentationMode: detailLevel === "lump_sum" ? "distributed" : presentationDraft.ohpPresentationMode }); }} disabled={controlsDisabled}><option value="lump_sum">One lump-sum price</option><option value="section_summary">Section totals</option><option value="itemized">Itemized lines</option></select></label>
          {presentationDraft.detailLevel !== "lump_sum" ? <label className="min-w-56 flex-1 text-sm font-bold text-slate-800">OH&amp;P appears<select className={input} value={presentationDraft.ohpPresentationMode} onChange={(event) => setPresentationDraft({ ...presentationDraft, ohpPresentationMode: event.target.value as PresentationDraft["ohpPresentationMode"] })} disabled={controlsDisabled}><option value="distributed">Built into customer prices</option><option value="separate_line_item">As a separate OH&amp;P line</option></select></label> : null}
          <button className={secondary} disabled={controlsDisabled || !state.estimate.presentation.schemaAvailable}>{pending ? "Saving…" : "Save customer display"}</button>
        </div>
        {presentationDraft.detailLevel === "lump_sum" ? <label className="mt-4 block text-sm font-bold text-slate-800">Public description<input maxLength={240} className={input} value={presentationDraft.lumpSumLabel} onChange={(event) => setPresentationDraft({ ...presentationDraft, lumpSumLabel: event.target.value })} disabled={controlsDisabled} /></label> : null}
        {!state.estimate.presentation.schemaAvailable ? <p className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm font-semibold text-amber-900">Saving the customer display requires the prepared estimate presentation database migration.</p> : null}
      </form>

      <details className="mt-5 overflow-hidden rounded-xl border border-slate-300 bg-slate-50 text-slate-950">
        <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"><span>Preview customer estimate</span><span>{formatCents(calculation.customerTotalCents as string | null | undefined)} ▾</span></summary>
        <div className="border-t border-slate-300 bg-white"><div className="grid grid-cols-[1fr_auto] border-b border-slate-200 bg-slate-100 px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600"><span>Description</span><span>Price</span></div>{customerPresentation?.rows.length ? customerPresentation.rows.map((row) => <div key={row.id} className="grid grid-cols-[1fr_auto] gap-4 border-b border-slate-200 px-4 py-4 last:border-0"><div><p className="font-semibold text-slate-950">{row.description}</p>{row.quantity && row.unit ? <p className="mt-1 text-xs text-slate-600">{row.quantity} {row.unit}</p> : null}</div><strong>{formatCents(row.totalCents)}</strong></div>) : <p className="p-5 text-sm text-slate-600">Add and save priced line items to build the customer preview.</p>}</div>
      </details>
      <div className="mt-4 flex flex-wrap justify-end gap-3"><Link href={`/sales/estimates/${estimateId}/preview`} className={secondary}>Open printable customer preview</Link>{showDeckWorkflow && deckProposalReady ? <button type="button" className={primary} onClick={() => openDeckWorkspaceStage("proposal")}>Review and send estimate</button> : null}</div>
    </section> : null}
    {(!showDeckWorkflow || deckWorkspaceStage === "proposal") ? <section id={showDeckWorkflow ? "deck-stage-proposal" : undefined} tabIndex={showDeckWorkflow ? -1 : undefined} className="scroll-mt-24 space-y-6 focus-visible:outline-none"><EstimateProposalCard estimateId={estimateId} estimateStatus={String(state.estimate.status)} issuanceBlockedReason={showDeckWorkflow && !deckProposalReady ? "Complete and apply the full reviewed Deck takeoff before creating a customer link. Finish-only costs are saved but are not a complete customer estimate." : undefined} /><ContractPreparationCard estimateId={estimateId} estimateStatus={String(state.estimate.status)} /></section> : null}
  </div>;
}

function DeckJobStageHeader({ activeStage, visitStatus, shapeReady, structureReadiness, takeoffStarted, trueCostLineCount, proposalReady, onOpenStage }: {
  activeStage: DeckWorkspaceStage;
  visitStatus: "checking" | "unavailable" | "not_started" | "in_progress" | "completed";
  shapeReady: boolean;
  structureReadiness: DeckStructureReadiness;
  takeoffStarted: boolean;
  trueCostLineCount: number;
  proposalReady: boolean;
  onOpenStage: (stage: DeckWorkspaceStage) => void;
}) {
  const fieldComplete = visitStatus === "completed";
  const stageContent: Record<DeckWorkspaceStage, { title: string; instruction: string }> = {
    site_visit: {
      title: "Site visit",
      instruction: "Confirm the job type, capture the photos, and finish only the field information needed to describe the existing site.",
    },
    shape: {
      title: "Deck shape",
      instruction: "Check the bird's-eye footprint. Drag corners, add bump-ins or bump-outs, and enter exact edge dimensions. Nothing structural is decided here.",
    },
    structure: {
      title: "Framing plan",
      instruction: "With the footprint locked, establish the framing, support, footing and stair plan and carry its quantities forward. Finish-product shopping comes next.",
    },
    takeoff: {
      title: "Material selections",
      instruction: trueCostLineCount
        ? "Review the saved true costs, set OH&P, and prepare the customer view."
        : structureReadiness === "preliminary_geometry"
          ? "Choose decking and railing finishes for the saved footprint. Structural review and final framing costs remain clearly separated."
          : "Choose decking and railing finishes. Matching products, finish quantities and prices are calculated here.",
    },
    proposal: {
      title: "Review and send",
      instruction: "Check the customer-facing scope and price before creating the secure estimate link. Nothing is sent automatically.",
    },
  };
  const stages: { key: DeckWorkspaceStage; title: string; status: string; enabled: boolean }[] = [
    { key: "site_visit", title: "Site visit", status: fieldComplete ? "Complete" : visitStatus === "in_progress" ? "In progress" : visitStatus === "checking" ? "Checking" : visitStatus === "unavailable" ? "Needs attention" : "Not started", enabled: true },
    { key: "shape", title: "Shape", status: shapeReady ? "Approved" : fieldComplete ? "Ready" : "Waiting", enabled: fieldComplete },
    { key: "structure", title: "Framing", status: structureReadiness === "approved_plan" ? "Approved" : structureReadiness === "preliminary_geometry" ? "Preliminary" : shapeReady ? "Ready" : "Waiting", enabled: shapeReady },
    { key: "takeoff", title: "Materials", status: trueCostLineCount ? `${trueCostLineCount} costs saved` : takeoffStarted ? "Selecting" : structureReadiness === "preliminary_geometry" ? "Ready for finishes" : structureReadiness === "approved_plan" ? "Ready" : "Waiting", enabled: structureReadiness !== "not_ready" },
    { key: "proposal", title: "Proposal", status: proposalReady ? "Ready" : "Waiting", enabled: proposalReady },
  ];
  const current = stageContent[activeStage];
  return <section aria-labelledby="deck-job-stage-title" className="sticky top-20 z-30 rounded-xl border border-slate-300 bg-white p-4 shadow-lg sm:static sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="text-xs font-black uppercase tracking-[.16em] text-slate-600">Deck job</p><h2 id="deck-job-stage-title" className="mt-1 text-xl font-black text-slate-950">Current step: {current.title}</h2></div>
      <p className="max-w-2xl text-sm leading-6 text-slate-700">{current.instruction}</p>
    </div>
    <ol className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">{stages.map((stage, index) => <li key={stage.key}><button
      type="button"
      aria-current={activeStage === stage.key ? "step" : undefined}
      disabled={!stage.enabled}
      onClick={() => onOpenStage(stage.key)}
      className={`min-h-16 w-full rounded-lg border p-2 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-800 disabled:cursor-not-allowed disabled:opacity-50 ${activeStage === stage.key ? "border-slate-900 bg-slate-100" : "border-slate-300 bg-white hover:border-slate-500 hover:bg-slate-50"}`}
    ><span className="block text-xs font-black uppercase tracking-wide text-slate-500">{index + 1}. {stage.title}</span><span className="mt-1 block text-xs font-bold text-slate-950">{stage.status}</span></button></li>)}</ol>
    <p className="mt-3 text-xs font-semibold text-slate-600">The approved shape feeds the framing plan. Framing quantities are reviewed before the separate finish-material screen chooses decking, railing and matching products.</p>
  </section>;
}

function deckObservationRows(observation: Record<string, unknown>) {
  const rows: { label: string; value: string }[] = [];
  const add = (label: string, value: unknown) => {
    if (typeof value === "string" && value.trim())
      rows.push({ label, value: value.trim() });
    else if (typeof value === "boolean")
      rows.push({ label, value: value ? "Yes" : "No" });
  };
  const measurements = observation.measurements;
  if (measurements && typeof measurements === "object" && !Array.isArray(measurements))
    for (const [key, raw] of Object.entries(measurements)) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
      const measurement = raw as Record<string, unknown>;
      if (typeof measurement.value === "string")
        add(humanizeStatus(key), `${measurement.value}${typeof measurement.unit === "string" ? ` ${measurement.unit}` : ""}`);
    }
  const applicability = observation.applicability;
  if (applicability && typeof applicability === "object" && !Array.isArray(applicability))
    for (const [key, value] of Object.entries(applicability))
      add(humanizeStatus(key), value);
  add("Site condition", observation.conditionStatus);
  add("Field note", observation.notes);
  return rows;
}

function DeckTakeoffWorkspace({
  estimateId,
  calculationRevision,
  visitStatus,
  visitSummary,
  hasSection,
  trueCostLineCount,
  directCost,
  takeoffApplied,
  canEdit,
  disabled,
  workflowPhase,
  structureReadiness,
  approvedShape,
  onCreateSection,
  onAddCostLine,
  onTakeoffApplied,
  onStructureReady,
  onContinuePricing,
}: {
  estimateId: string;
  calculationRevision: number;
  visitStatus: "checking" | "unavailable" | "not_started" | "in_progress" | "completed";
  visitSummary: DeckVisitSummary | null;
  hasSection: boolean;
  trueCostLineCount: number;
  directCost: string;
  takeoffApplied: boolean;
  canEdit: boolean;
  disabled: boolean;
  workflowPhase: "structure" | "takeoff";
  structureReadiness: DeckStructureReadiness;
  approvedShape: FinalizedDeckShape | null;
  onCreateSection: () => void;
  onAddCostLine: (category: EstimateCostCategory) => void;
  onTakeoffApplied: (state: EstimateBuilderEnvelope) => void;
  onStructureReady: (readiness: Exclude<DeckStructureReadiness, "not_ready">) => void;
  onContinuePricing: () => void;
}) {
  const categories: { key: EstimateCostCategory; label: string; help: string }[] = [
    { key: "material", label: "Material", help: "Boards, framing, fasteners, concrete, and hardware." },
    { key: "labor", label: "Labor", help: "Crew hours at your true hourly labor cost." },
    { key: "subcontractor", label: "Subcontractor", help: "Quoted work performed by another company." },
    { key: "equipment", label: "Equipment", help: "Rental or equipment cost charged to this job." },
    { key: "other", label: "Other", help: "Disposal, delivery, permits, or another direct cost." },
  ];
  const measuredItems = (visitSummary?.items ?? []).flatMap((item) => {
    const rows = deckObservationRows(item.observation ?? {});
    return rows.length ? [{ ...item, rows }] : [];
  });
  return <section
    id="deck-takeoff-workspace"
    tabIndex={-1}
    aria-labelledby="deck-takeoff-title"
    className="scroll-mt-24 rounded-xl border border-slate-300 bg-white p-5 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 sm:p-6"
  >
    <p className="text-xs font-black uppercase tracking-[.16em] text-blue-800">{workflowPhase === "structure" ? "Step 3 · Build the framing plan" : "Step 4 · Choose finish materials"}</p>
    <h2 id="deck-takeoff-title" className="mt-1 text-2xl font-black text-slate-950">{workflowPhase === "structure" ? "Framing plan and quantities" : "Material selections"}</h2>
    {visitStatus !== "completed" ? <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm font-bold text-amber-950">Finish the field form before building the Deck estimate.</p> : <>
      <p className="mt-2 text-sm leading-6 text-slate-700">{workflowPhase === "structure" ? "The deck shape is set. Build the framing, supports, footings, stairs and attachment plan, then review its quantities. Finish products and prices stay out of this step." : structureReadiness === "preliminary_geometry" ? "The exact footprint and preliminary quantities are saved. Choose the visible decking and railing finishes here; unresolved structural work remains separate." : "The framing plan supplied the quantities. Now choose decking and railing finishes and match them to current products and prices."}</p>
      <details className="mt-4 rounded-lg border border-slate-300 bg-slate-50 p-4">
        <summary className="min-h-11 cursor-pointer font-bold text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700">Saved field measurements and notes</summary>
        {measuredItems.length ? <div className="mt-3 grid gap-3 md:grid-cols-2">{measuredItems.map((item) => <section key={item.itemKey} className="rounded-lg bg-white p-3"><h3 className="font-bold text-slate-950">{item.title}</h3><dl className="mt-2 space-y-2 text-sm">{item.rows.map((row) => <div key={`${item.itemKey}-${row.label}`} className="flex items-start justify-between gap-4"><dt className="text-slate-600">{row.label}</dt><dd className="text-right font-bold text-slate-950">{row.value}</dd></div>)}</dl></section>)}</div> : <p className="mt-3 text-sm text-slate-600">No field measurements were returned. Reload the visit before entering quantities.</p>}
      </details>
      {visitSummary ? <DeckTakeoffPlanner
        estimateId={estimateId}
        visitId={visitSummary.id}
        visitRevision={visitSummary.revision}
        visitItems={visitSummary.items}
        calculationRevision={calculationRevision}
        takeoffApplied={takeoffApplied}
        disabled={disabled || !canEdit}
        workflowPhase={workflowPhase}
        approvedShape={approvedShape}
        onApplied={onTakeoffApplied}
        onStructureReady={onStructureReady}
      /> : null}
      {workflowPhase === "takeoff" ? <>
        <details className="mt-5 rounded-lg border border-slate-300 bg-slate-50 p-4"><summary className="min-h-11 cursor-pointer font-bold text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600">Manual cost-line fallback</summary>{!hasSection ? <div className="mt-3"><p className="text-sm text-slate-700">Use this only when you need to build the estimate without the reviewed takeoff.</p><button type="button" disabled={disabled} className={`mt-3 ${primary}`} onClick={onCreateSection}>Create Deck construction section</button></div> : <div className="mt-3"><p className="text-sm text-slate-600">Choose a cost type, then enter its verified quantity and unit cost.</p><div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{categories.map((category) => <button key={category.key} type="button" disabled={disabled || !canEdit} onClick={() => onAddCostLine(category.key)} className="min-h-24 rounded-lg border border-slate-300 bg-white p-3 text-left transition hover:border-emerald-600 hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"><strong className="block text-slate-950">Add {category.label}</strong><span className="mt-1 block text-xs leading-5 text-slate-600">{category.help}</span></button>)}</div></div>}</details>
        <div className="mt-5 rounded-lg border border-slate-300 p-4"><h3 className="font-black text-slate-950">Review true costs</h3><p className="mt-1 text-sm text-slate-700">{trueCostLineCount ? `${trueCostLineCount} positive true-cost ${trueCostLineCount === 1 ? "line" : "lines"} saved · ${directCost} current direct cost.` : "No positive true-cost lines are saved yet."}</p>{takeoffApplied && trueCostLineCount ? <button type="button" className={`mt-3 ${primary}`} onClick={onContinuePricing}>Continue to OH&amp;P</button> : trueCostLineCount ? <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm font-bold leading-6 text-amber-950">Finish materials are saved, but this is not the complete job cost. Complete and apply the framing, hardware, stairs, demolition, delivery, equipment, and labor takeoff above before setting OH&amp;P.</p> : null}</div>
      </> : null}
    </>}
  </section>;
}

function Summary({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-slate-50 p-3"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 font-bold text-slate-950">{value}</p></div>;
}

function PercentageSlider({ label, value, dollarValue, disabled, onPercentChange, onDollarChange }: { label: string; value: string; dollarValue: string; disabled: boolean; onPercentChange: (value: string) => void; onDollarChange: (value: string) => void }) {
  const id = `${label.toLowerCase().replace(/[^a-z]+/g, "-")}-percent`;
  return <div className="estimate-pricing-control rounded-lg p-4"><label htmlFor={`${id}-number`} className="text-sm font-bold text-slate-900">{label}</label><div className="mt-3 grid gap-3 sm:grid-cols-[1fr_7rem_9rem] sm:items-center"><input id={`${id}-range`} aria-label={`${label} slider`} type="range" min="0" max="100" step="0.5" className="w-full" value={Math.min(Number(value) || 0, 100)} onChange={(event) => onPercentChange(event.target.value)} disabled={disabled} /><div className="relative"><input id={`${id}-number`} aria-label={`${label} exact percent`} inputMode="decimal" className={`${input} mt-0 pr-8 text-right`} value={value} onChange={(event) => onPercentChange(event.target.value)} disabled={disabled} /><span className="pointer-events-none absolute right-3 top-2 text-sm font-semibold text-slate-500">%</span></div><div className="relative"><span className="pointer-events-none absolute left-3 top-2 text-sm font-semibold text-slate-500">$</span><input aria-label={`${label} exact dollars`} inputMode="decimal" className={`${input} mt-0 pl-7 text-right`} value={dollarValue} onChange={(event) => onDollarChange(event.target.value)} disabled={disabled} /></div></div><p className="mt-2 text-xs text-slate-600">Move the slider, type a percentage, or enter the exact OH&amp;P dollars you want.</p></div>;
}

function draftFingerprint(draft: ItemDraft) {
  return JSON.stringify({
    itemType: draft.itemType, customerDescription: draft.customerDescription,
    internalDescription: draft.internalDescription, quantity: draft.quantity, unit: draft.unit,
    costCategory: draft.costCategory, unitCost: draft.unitCost,
    fixedCustomerPrice: draft.fixedCustomerPrice, included: draft.included,
  });
}

function InlineItemRow({ item, canEdit, pending, onSave, onDelete }: {
  item: EstimateBuilderItem;
  canEdit: boolean;
  pending: boolean;
  onSave: (draft: ItemDraft) => Promise<boolean>;
  onDelete: () => void;
}) {
  const initial = itemDraft(item, item.sectionId, item.itemType, item.sortOrder);
  const [draft, setDraft] = useState(initial);
  const [savedFingerprint, setSavedFingerprint] = useState(() => draftFingerprint(initial));
  const dirty = draftFingerprint(draft) !== savedFingerprint;
  const set = (field: keyof ItemDraft, value: string | boolean) => setDraft({ ...draft, [field]: value });
  const units = ["ea", "hr", "day", "sq ft", "ln ft", "package"];
  const rawCost = draft.itemType === "standard" ? previewEstimateRawCostCents([], draft) : null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dirty || pending || !canEdit) return;
    if (await onSave(draft)) setSavedFingerprint(draftFingerprint(draft));
  }

  return <form onSubmit={submit} className={`estimate-sheet-row grid gap-2 p-4 md:min-w-[1050px] md:grid-cols-[9rem_minmax(12rem,1fr)_minmax(14rem,1.2fr)_6rem_7rem_8rem_8rem_8rem] md:items-end ${dirty ? "estimate-sheet-row-dirty" : ""}`}>
    {draft.itemType === "standard" ? <>
      <CompactField label="Category"><select className={input} value={draft.costCategory} onChange={(event) => { const costCategory = event.target.value as EstimateCostCategory; setDraft({ ...draft, costCategory, unit: costCategory === "labor" && draft.unit === "ea" ? "hr" : draft.unit }); }} disabled={pending || !canEdit}><option value="mixed" disabled>Mixed costs</option>{ESTIMATE_COST_CATEGORIES.map((category) => <option key={category} value={category}>{category[0].toUpperCase() + category.slice(1)}</option>)}</select></CompactField>
      <CompactField label="Heading"><input className={input} value={draft.customerDescription} onChange={(event) => set("customerDescription", event.target.value)} disabled={pending || !canEdit} /></CompactField>
      <CompactField label="Description"><input className={input} value={draft.internalDescription} onChange={(event) => set("internalDescription", event.target.value)} disabled={pending || !canEdit} /></CompactField>
      <CompactField label="Qty"><input inputMode="decimal" className={input} value={draft.quantity} onChange={(event) => set("quantity", event.target.value)} disabled={pending || !canEdit} /></CompactField>
      <CompactField label="Unit"><select className={input} value={draft.unit} onChange={(event) => set("unit", event.target.value)} disabled={pending || !canEdit}>{!units.includes(draft.unit) ? <option value={draft.unit}>{draft.unit}</option> : null}{units.map((unit) => <option key={unit} value={unit}>{unit}</option>)}</select></CompactField>
      <CompactField label="Unit cost"><input inputMode="decimal" className={input} value={draft.unitCost} onChange={(event) => set("unitCost", event.target.value)} disabled={pending || !canEdit} /></CompactField>
      <div><span className="mb-1 block text-xs font-semibold text-slate-500 md:hidden">Raw cost</span><strong className="block min-h-10 py-2 text-sm text-slate-950">{formatCents(rawCost)}</strong></div>
    </> : <>
      <div className="self-center"><span className="rounded-full bg-violet-100 px-2 py-1 text-xs font-bold uppercase text-violet-800">Allowance</span></div>
      <div className="md:col-span-2"><CompactField label="Heading"><input className={input} value={draft.customerDescription} onChange={(event) => set("customerDescription", event.target.value)} disabled={pending || !canEdit} /></CompactField></div>
      <CompactField label="Qty"><input inputMode="decimal" className={input} value={draft.quantity} onChange={(event) => set("quantity", event.target.value)} disabled={pending || !canEdit} /></CompactField>
      <div />
      <CompactField label="Amount"><input inputMode="decimal" className={input} value={draft.fixedCustomerPrice} onChange={(event) => set("fixedCustomerPrice", event.target.value)} disabled={pending || !canEdit} /></CompactField>
      <div><span className="mb-1 block text-xs font-semibold text-slate-500 md:hidden">Price</span><strong className="block min-h-10 py-2 text-sm text-slate-950">{formatDecimalDollars(draft.fixedCustomerPrice)}</strong></div>
    </>}
    <div className="flex gap-2"><button className={primary} disabled={pending || !canEdit || !dirty}>{pending && dirty ? "Saving…" : dirty ? "Save" : "Saved"}</button><button type="button" aria-label={`Delete ${draft.customerDescription || "line item"}`} className={danger} disabled={pending || !canEdit} onClick={onDelete}>×</button></div>
  </form>;
}

function CompactField({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-xs font-semibold text-slate-500"><span className="mb-1 block md:hidden">{label}</span>{children}</label>;
}

function ItemEditor({ draft, pending, onChange, onCancel, onSubmit }: { draft: ItemDraft; pending: boolean; onChange: (draft: ItemDraft) => void; onCancel: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  const set = (field: keyof ItemDraft, value: string | boolean) => onChange({ ...draft, [field]: value });
  const editing = draft.id !== null;
  const standardUnits = ["ea", "hr", "day", "sq ft", "ln ft", "package"];
  return <form onSubmit={onSubmit} className="estimate-editor-panel rounded-xl border p-5">
    <h2 className="text-lg font-bold">{editing ? "Edit" : "Add"} {draft.itemType === "allowance" ? "allowance" : "line item"}</h2>
    <p className="mt-1 text-sm text-slate-600">Use a separate line for each material, labor, subcontractor, equipment, or other cost.</p>
    <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {draft.itemType === "standard" ? <>
        <Field label="Category"><select autoFocus className={input} value={draft.costCategory} onChange={(event) => {
          const costCategory = event.target.value as EstimateCostCategory;
          onChange({ ...draft, costCategory, unit: costCategory === "labor" && draft.unit === "ea" ? "hr" : draft.unit });
        }} disabled={pending}><option value="mixed" disabled>Mixed legacy costs</option>{ESTIMATE_COST_CATEGORIES.map((category) => <option key={category} value={category}>{category[0].toUpperCase() + category.slice(1)}</option>)}</select></Field>
        <Field label="Line item heading"><input className={input} value={draft.customerDescription} onChange={(event) => set("customerDescription", event.target.value)} disabled={pending} /></Field>
        <Field label="Description"><input className={input} value={draft.internalDescription} onChange={(event) => set("internalDescription", event.target.value)} disabled={pending} /></Field>
        <Field label="Quantity"><input inputMode="decimal" className={input} value={draft.quantity} onChange={(event) => set("quantity", event.target.value)} disabled={pending} /></Field>
        <Field label="Unit"><select className={input} value={draft.unit} onChange={(event) => set("unit", event.target.value)} disabled={pending}>{!standardUnits.includes(draft.unit) ? <option value={draft.unit}>{draft.unit}</option> : null}{standardUnits.map((unit) => <option key={unit} value={unit}>{unit}</option>)}</select></Field>
        <Field label="Unit cost"><input inputMode="decimal" className={input} value={draft.unitCost} onChange={(event) => set("unitCost", event.target.value)} disabled={pending} /></Field>
      </> : <><div className="md:col-span-2 lg:col-span-3"><Field label="Allowance heading"><input autoFocus className={input} value={draft.customerDescription} onChange={(event) => set("customerDescription", event.target.value)} disabled={pending} /></Field></div><Field label="Quantity"><input inputMode="decimal" className={input} value={draft.quantity} onChange={(event) => set("quantity", event.target.value)} disabled={pending} /></Field><Field label="Allowance amount"><input inputMode="decimal" className={input} value={draft.fixedCustomerPrice} onChange={(event) => set("fixedCustomerPrice", event.target.value)} disabled={pending} /></Field></>}
    </div>
    {draft.costCategory === "mixed" ? <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm font-semibold text-amber-900">This older row contains multiple cost categories. Create separate lines for each category, then remove the old row.</p> : null}
    <div className="mt-5 flex flex-wrap gap-3"><button className={primary} disabled={pending}>{pending ? "Saving…" : editing ? "Save changes" : "Add item"}</button>{!editing ? <button name="intent" value="add-another" className={secondary} disabled={pending}>Save &amp; add another</button> : null}<button type="button" className={secondary} disabled={pending} onClick={onCancel}>Cancel</button></div>
  </form>;
}
