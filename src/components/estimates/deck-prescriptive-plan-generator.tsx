"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  buildPrescriptiveDeckPlan,
  deckEstimatingImmediateIssueIds,
  KNOXVILLE_2024_DECK_PROFILE,
  recommendedPrescriptiveDraft,
  type DeckPrescriptiveDraft,
  type DeckPrescriptivePlan,
} from "@/lib/deck-prescriptive-plan";
import type { DeckBlueprintVisitSeed } from "@/lib/deck-takeoff-v0";

const control =
  "mt-1 min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-blue-700 focus:ring-2 focus:ring-blue-100";
const button =
  "min-h-11 rounded-md bg-slate-950 px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50";
const STEPS = [
  "Confirm facts",
  "Framing draft",
  "Supports & footings",
  "Exceptions",
  "Review plan",
] as const;
type BlueprintFacts = Readonly<{ attachment: "ledger" | "freestanding" | null; stairs: boolean | null; railings: boolean | null }>;
type BlueprintCallout = Readonly<{ id: string; label: string; step: number; anchorX: number; anchorY: number; markerX: number; markerY: number; kind: "input" | "exception" | "package" }>;

function draftForFacts(facts: BlueprintFacts, lengthFeet: number, widthFeet: number, visitSeed: DeckBlueprintVisitSeed) {
  const draft = recommendedPrescriptiveDraft(facts.attachment ?? "ledger", facts.stairs ?? false, lengthFeet, widthFeet, facts.railings ?? false);
  return {
    ...draft,
    attachment: facts.attachment ?? "",
    stairsIncluded: facts.stairs === null ? "" : facts.stairs ? "yes" : "no",
    railingsIncluded: facts.railings === null ? "" : facts.railings ? "yes" : "no",
    attachmentConfirmed: facts.attachment !== null,
    stairsConfirmed: facts.stairs !== null,
    joistSpacingInches: visitSeed.supportedJoistSpacingInches ?? draft.joistSpacingInches,
    joistSize: visitSeed.estimatingAssumptions.joistSize ?? draft.joistSize,
    beamSize: visitSeed.estimatingAssumptions.beamSize ?? draft.beamSize,
    postSize: visitSeed.estimatingAssumptions.postSize ?? draft.postSize,
    postCount: visitSeed.estimatingAssumptions.postCount ? String(visitSeed.estimatingAssumptions.postCount) : draft.postCount,
    postHeightFeet: visitSeed.heightFromGradeFeet ? String(visitSeed.heightFromGradeFeet) : draft.postHeightFeet,
    jurisdiction: "city_knoxville_estimating_assumption",
    ledgerSubstrate: facts.attachment === "ledger" ? "estimating_band_rim_assumption" : draft.ledgerSubstrate,
    footingDepthInches: draft.footingDepthInches || "24",
    frostBasis: "24 in local frost-depth basis — estimating assumption pending AHJ verification",
  } satisfies DeckPrescriptiveDraft;
}
function Field({
  label,
  children,
  help,
}: {
  label: string;
  children: React.ReactNode;
  help?: string;
}) {
  return (
    <label className="block text-sm font-bold text-slate-900">
      <span>{label}</span>
      {children}
      {help ? (
        <span className="mt-1 block text-xs font-normal leading-5 text-slate-600">
          {help}
        </span>
      ) : null}
    </label>
  );
}

export function DeckPrescriptivePlanGenerator({
  lengthFeet,
  widthFeet,
  blueprintAttachment,
  blueprintStairs,
  blueprintRailings,
  stairPlacementConfirmed,
  visitSeed,
  stairEdge = "yard",
  stairPosition = "center",
  disabled,
  onApprove,
  onEditStairPlacement,
}: {
  lengthFeet: number;
  widthFeet: number;
  blueprintAttachment: "ledger" | "freestanding" | null;
  blueprintStairs: boolean | null;
  blueprintRailings: boolean | null;
  stairPlacementConfirmed: boolean;
  visitSeed: DeckBlueprintVisitSeed;
  stairEdge?: "left" | "right" | "yard" | "top";
  stairPosition?: "start" | "center" | "end";
  disabled: boolean;
  onApprove: (plan: DeckPrescriptivePlan) => void;
  onEditStairPlacement: () => void;
}) {
  const facts = useMemo<BlueprintFacts>(() => ({ attachment: blueprintAttachment, stairs: blueprintStairs, railings: blueprintRailings }), [blueprintAttachment, blueprintStairs, blueprintRailings]);
  const seedSignature = JSON.stringify(visitSeed);
  const factsSignature = `${lengthFeet}:${widthFeet}:${blueprintAttachment ?? "unknown"}:${blueprintStairs ?? "unknown"}:${blueprintRailings ?? "unknown"}:${stairPlacementConfirmed}:${seedSignature}`;
  const [draft, setDraft] = useState<DeckPrescriptiveDraft>(() => draftForFacts(facts, lengthFeet, widthFeet, visitSeed));
  const [step, setStep] = useState(0);
  const [generated, setGenerated] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [pendingFacts, setPendingFacts] = useState<BlueprintFacts | null>(null);
  const [comparisonOnly, setComparisonOnly] = useState(false);
  const [approved, setApproved] = useState(false);
  const [activePackage, setActivePackage] = useState<"stairs" | "guards" | "connectors" | null>(null);
  const packagePanelRef = useRef<HTMLDivElement>(null);
  const [drawingExpanded, setDrawingExpanded] = useState(false);
  const svgTitleId = useId();
  const svgDescriptionId = useId();
  const lastFactsSignature = useRef(factsSignature);
  useEffect(() => {
    if (lastFactsSignature.current === factsSignature) return;
    lastFactsSignature.current = factsSignature;
    if (dirty) { setPendingFacts(facts); setComparisonOnly(false); setApproved(false); }
    else setDraft(draftForFacts(facts, lengthFeet, widthFeet, visitSeed));
  }, [dirty, facts, factsSignature, lengthFeet, visitSeed, widthFeet]);
  const plan = useMemo(
    () => buildPrescriptiveDeckPlan({ lengthFeet, widthFeet, draft }),
    [lengthFeet, widthFeet, draft],
  );
  const set = <K extends keyof DeckPrescriptiveDraft>(
    key: K,
    value: DeckPrescriptiveDraft[K],
  ) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setDirty(true);
    setApproved(false);
  };
  const joists =
    plan.quantities?.joists ??
    Math.max(
      2,
      Math.ceil((lengthFeet * 12) / Number(draft.joistSpacingInches || 16)) + 1,
    );
  const beamLines = Math.max(1, Number(draft.beamLineCount || 1));
  const posts = Math.max(1, Number(draft.postCount || 1));
  const stairAlong = stairPosition === "start" ? 55 : stairPosition === "end" ? 235 : 145;
  const stairAcross = stairPosition === "start" ? 35 : stairPosition === "end" ? 125 : 80;
  const callouts = useMemo<BlueprintCallout[]>(() => {
    const values: BlueprintCallout[] = [];
    const add = (value: BlueprintCallout) => { if (!values.some((item) => item.id === value.id)) values.push(value); };
    const immediateIssues = new Set(deckEstimatingImmediateIssueIds({ lengthFeet, widthFeet, draft, stairPlacementConfirmed }));
    if (pendingFacts) add({ id: "stale-field-facts", label: "This drawing uses outdated field facts and is available for comparison only. Rebuild it before approval.", step: 0, anchorX: 160, anchorY: 95, markerX: 160, markerY: 12, kind: "exception" });
    if (immediateIssues.has("dimensions-profile")) add({ id: "dimensions-profile", label: "The deck dimensions are missing or outside this profile's supported rectangular limits.", step: 0, anchorX: 160, anchorY: 95, markerX: 160, markerY: 55, kind: "exception" });
    if (immediateIssues.has("attachment-fact")) add({ id: "attachment-fact", label: "Confirm whether the replacement layout is ledger-attached or freestanding.", step: 0, anchorX: 160, anchorY: 20, markerX: 116, markerY: 10, kind: "input" });
    if (immediateIssues.has("stairs-fact")) add({ id: "stairs-fact", label: draft.stairsIncluded ? "Place the verified stair opening on the replacement layout and confirm its position." : "Confirm whether stairs are included in the replacement layout.", step: 0, anchorX: stairEdge === "left" ? 30 : stairEdge === "right" ? 290 : stairAlong, anchorY: stairEdge === "top" ? 20 : stairEdge === "yard" ? 170 : stairAcross, markerX: 300, markerY: 52, kind: "input" });
    if (immediateIssues.has("railings-fact")) add({ id: "railings-fact", label: "Confirm whether guards or railings apply from the approved field facts.", step: 0, anchorX: 290, anchorY: 45, markerX: 302, markerY: 82, kind: "input" });
    if (immediateIssues.has("outside-profile")) add({ id: "outside-profile", label: "The proposed replacement geometry or load condition is outside this supported layout profile. Use an engineer/building-department-approved plan.", step: 3, anchorX: 250, anchorY: 145, markerX: 302, markerY: 154, kind: "exception" });
    return values;
  }, [draft, lengthFeet, pendingFacts, stairAlong, stairAcross, stairEdge, stairPlacementConfirmed, widthFeet]);
  const unresolvedLabels = plan.unresolvedPackages.map((item) => item === "stairs" ? "reviewed stair detail" : item === "guard_schedule" ? "guard/railing attachment schedule" : item === "jurisdiction" ? "jurisdiction verification" : item === "ledger_detail" ? "concealed ledger attachment detail" : item === "soil_frost" ? "soil/frost verification" : "compatible connector schedule");
  const openPackageGuidance = (id: string) => {
    const packageName = id === "package-stairs" ? "stairs" : id === "package-guards" ? "guards" : "connectors";
    setActivePackage(packageName);
    requestAnimationFrame(() => { packagePanelRef.current?.focus({ preventScroll: true }); packagePanelRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }); });
  };
  return (
    <section className="mt-5 rounded-xl border-2 border-violet-600 bg-white p-4">
      <p className="text-xs font-black uppercase tracking-[.16em] text-violet-800">
        Required framing source for a full rebuild
      </p>
      <h4 className="mt-1 text-lg font-black text-slate-950">
        Create or import the framing plan
      </h4>
      <p className="mt-2 rounded-md bg-violet-50 p-3 text-sm font-bold leading-6 text-violet-950">
        Prescriptive estimating draft — not stamped and not a permit plan.
        Subject to field verification and City building-department approval. An
        engineer/AHJ-approved plan may be used instead.
      </p>
      {pendingFacts ? <div role="alert" className="mt-3 rounded-lg border-2 border-red-600 bg-red-50 p-3 text-sm text-red-950"><p className="font-black">Outdated field facts — approval blocked</p><p className="mt-1">The current drawing no longer matches the latest dimensions or applicability. You may keep it visible for comparison, but it cannot be approved until updated.</p><div className="mt-3 grid gap-2 sm:grid-cols-2"><button type="button" className={button} onClick={() => { setDraft(draftForFacts(pendingFacts, lengthFeet, widthFeet, visitSeed)); setPendingFacts(null); setComparisonOnly(false); setDirty(false); setApproved(false); setGenerated(true); setStep(4); }}>Rebuild from updated field facts</button>{!comparisonOnly ? <button type="button" className="min-h-11 rounded-md border-2 border-red-700 bg-white px-4 py-2 font-bold" onClick={() => setComparisonOnly(true)}>Keep current draft for comparison only</button> : <p className="rounded-md bg-white p-3 font-bold">Comparison only. Rebuild from updated field facts to enable approval.</p>}</div></div> : null}
      {!generated ? <button type="button" className={`mt-4 w-full ${button}`} disabled={disabled} onClick={() => { setGenerated(true); setDetailsOpen(false); setStep(4); }}>
        Generate draft blueprint
      </button> : <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <button type="button" className={`${button} flex-1`} onClick={() => { setDetailsOpen(false); setStep(4); }}>View draft blueprint</button>
        <button type="button" className="min-h-11 flex-1 rounded-md border-2 border-slate-400 bg-white px-4 py-2 text-sm font-bold text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600 focus-visible:ring-offset-2" onClick={() => { setDetailsOpen(true); setStep(0); }}>Edit blueprint details</button>
      </div>}
      {detailsOpen ? <><div
        className="mt-3 grid grid-cols-5 gap-1"
        aria-label={`Step ${step + 1} of ${STEPS.length}`}
      >
        {STEPS.map((label, index) => (
          <button
            type="button"
            key={label}
            aria-label={label}
            className={`min-h-11 rounded px-1 text-xs font-bold ${index === step ? "bg-violet-700 text-white" : "bg-slate-100 text-slate-700"}`}
            onClick={() => setStep(index)}
          >
            {index + 1}
          </button>
        ))}
      </div>
      <p className="mt-2 text-sm font-black">{STEPS[step]}</p>
      </> : null}
      {detailsOpen && step === 0 ? (
        <div className="mt-3 space-y-3">
          <Field label="Verified authority having jurisdiction">
            <select
              className={control}
              value={draft.jurisdiction}
              onChange={(e) =>
                set(
                  "jurisdiction",
                  e.target.value as DeckPrescriptiveDraft["jurisdiction"],
                )
              }
            >
              <option value="">Choose after verification</option>
              <option value="city_knoxville_verified">
                City of Knoxville verified
              </option>
              <option value="city_knoxville_estimating_assumption">City of Knoxville estimating assumption — verify later</option>
              <option value="other_or_uncertain">Other or uncertain</option>
            </select>
          </Field>
          <p className="text-xs text-slate-600">
            A Knoxville mailing address does not prove City jurisdiction.
          </p>
          <div className="rounded-md border p-3 text-xs">
            <a
              className="block text-blue-800 underline"
              href={KNOXVILLE_2024_DECK_PROFILE.controllingCodeUrl}
            >
              City adoption · 2024 IRC
            </a>
            <a
              className="block text-blue-800 underline"
              href={KNOXVILLE_2024_DECK_PROFILE.codeSourceUrl}
            >
              IRC 2024 R507 rule source
            </a>
            <a
              className="block text-blue-800 underline"
              href={KNOXVILLE_2024_DECK_PROFILE.formatReferenceUrl}
            >
              City 2018 deck guide · format reference only
            </a>
          </div>
          <p className="rounded-md bg-slate-50 p-3 text-sm">
            Approved blueprint says:{" "}
            <strong>
              {blueprintAttachment === null ? "attachment not confirmed" : blueprintAttachment === "ledger" ? "attached at house" : "freestanding"}
            </strong>
            ;{" "}
            <strong>{blueprintStairs === null ? "stairs not confirmed" : blueprintStairs ? "stairs included" : "no stairs"}</strong>;{" "}
            <strong>{blueprintRailings === null ? "railings not confirmed" : blueprintRailings ? "railings included" : "no railings"}</strong>
            .
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Deck attachment"><select className={control} value={draft.attachment} onChange={(e) => set("attachment", e.target.value as DeckPrescriptiveDraft["attachment"])}><option value="">Confirm from field facts</option><option value="ledger">Ledger attached</option><option value="freestanding">Freestanding</option></select></Field>
            <Field label="Stairs"><select className={control} value={draft.stairsIncluded} onChange={(e) => set("stairsIncluded", e.target.value as DeckPrescriptiveDraft["stairsIncluded"])}><option value="">Confirm from field facts</option><option value="yes">Included</option><option value="no">Not included</option></select></Field>
            <Field label="Guards / railings"><select className={control} value={draft.railingsIncluded} onChange={(e) => set("railingsIncluded", e.target.value as DeckPrescriptiveDraft["railingsIncluded"])}><option value="">Confirm from field facts</option><option value="yes">Included</option><option value="no">Not included</option></select></Field>
          </div>
          <label className="flex min-h-11 gap-3 rounded border p-3 text-sm font-bold">
            <input
              type="checkbox"
              checked={draft.attachmentConfirmed}
              onChange={(e) => set("attachmentConfirmed", e.target.checked)}
            />
            I confirmed the attachment fact.
          </label>
          <label className="flex min-h-11 gap-3 rounded border p-3 text-sm font-bold">
            <input
              type="checkbox"
              checked={draft.stairsConfirmed}
              onChange={(e) => set("stairsConfirmed", e.target.checked)}
            />
            I confirmed the stair fact.
          </label>
          {draft.attachment === "ledger" ? (
            <Field label="House attachment substrate">
              <select
                className={control}
                value={draft.ledgerSubstrate}
                onChange={(e) =>
                  set(
                    "ledgerSubstrate",
                    e.target.value as DeckPrescriptiveDraft["ledgerSubstrate"],
                  )
                }
              >
                <option value="">Choose after field check</option>
                <option value="verified_band_rim">
                  Verified wood band/rim joist
                </option>
                <option value="estimating_band_rim_assumption">Wood band/rim estimating assumption — verify concealed condition later</option>
                <option value="masonry_veneer">Brick/stone veneer</option>
                <option value="concrete_or_other">Concrete or other</option>
                <option value="unknown">Unknown/concealed</option>
              </select>
            </Field>
          ) : null}
        </div>
      ) : null}
      {detailsOpen && step === 1 ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Lumber species and grade">
            <select
              className={control}
              value={draft.speciesGrade}
              onChange={(e) =>
                set(
                  "speciesGrade",
                  e.target.value as DeckPrescriptiveDraft["speciesGrade"],
                )
              }
            >
              <option value="">Choose</option>
              <option value="southern_pine_no2">Southern Pine No. 2</option>
            </select>
          </Field>
          <Field label="Treatment / service">
            <select
              className={control}
              value={draft.treatmentService}
              onChange={(e) =>
                set(
                  "treatmentService",
                  e.target.value as DeckPrescriptiveDraft["treatmentService"],
                )
              }
            >
              <option value="">Choose</option>
              <option value="pressure_treated_wet_service">
                Pressure-treated · wet service
              </option>
            </select>
          </Field>
          <Field label="Design load profile">
            <select
              className={control}
              value={draft.designLoad}
              onChange={(e) =>
                set(
                  "designLoad",
                  e.target.value as DeckPrescriptiveDraft["designLoad"],
                )
              }
            >
              <option value="">Choose</option>
              <option value="40_live_10_dead">40 psf live + 10 psf dead</option>
            </select>
          </Field>
          <Field label="Joist spacing (inches on center)">
            <select
              className={control}
              value={draft.joistSpacingInches}
              onChange={(e) =>
                set(
                  "joistSpacingInches",
                  e.target.value as DeckPrescriptiveDraft["joistSpacingInches"],
                )
              }
            >
              {["12", "16", "24"].map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Joist size">
            <select
              className={control}
              value={draft.joistSize}
              onChange={(e) =>
                set(
                  "joistSize",
                  e.target.value as DeckPrescriptiveDraft["joistSize"],
                )
              }
            >
              {["2x6", "2x8", "2x10", "2x12"].map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Beam size">
            <select
              className={control}
              value={draft.beamSize}
              onChange={(e) =>
                set(
                  "beamSize",
                  e.target.value as DeckPrescriptiveDraft["beamSize"],
                )
              }
            >
              {["2x6", "2x8", "2x10", "2x12"].map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Beam plies">
            <select
              className={control}
              value={draft.beamPlies}
              onChange={(e) =>
                set(
                  "beamPlies",
                  e.target.value as DeckPrescriptiveDraft["beamPlies"],
                )
              }
            >
              {["1", "2", "3"].map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Support/beam lines">
            <input
              className={control}
              inputMode="numeric"
              value={draft.beamLineCount}
              onChange={(e) => set("beamLineCount", e.target.value)}
            />
          </Field>
        </div>
      ) : null}
      {detailsOpen && step === 2 ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <p className="rounded-md border border-blue-300 bg-blue-50 p-3 text-sm text-blue-950 sm:col-span-2">
            <strong>Profile recommendation:</strong> the current geometry
            prefilled the smallest encoded passing beam and footing-pad values.
            Review them; every change is checked again.
          </p>
          <Field label="Post count">
            <input
              className={control}
              inputMode="numeric"
              value={draft.postCount}
              onChange={(e) => set("postCount", e.target.value)}
            />
          </Field>
          <Field label="Post size">
            <select
              className={control}
              value={draft.postSize}
              onChange={(e) =>
                set(
                  "postSize",
                  e.target.value as DeckPrescriptiveDraft["postSize"],
                )
              }
            >
              <option value="">Choose</option>
              {["4x4", "6x6"].map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Maximum exposed post height (feet)">
            <input
              className={control}
              inputMode="decimal"
              value={draft.postHeightFeet}
              onChange={(e) => set("postHeightFeet", e.target.value)}
            />
          </Field>
          <Field label="Footing count">
            <input
              className={control}
              inputMode="numeric"
              value={draft.footingCount}
              onChange={(e) => set("footingCount", e.target.value)}
            />
          </Field>
          <Field label="Round footing diameter (inches)">
            <input
              className={control}
              inputMode="decimal"
              value={draft.footingDiameterInches}
              onChange={(e) => set("footingDiameterInches", e.target.value)}
            />
          </Field>
          <Field label="Concrete footing thickness (inches)">
            <input
              className={control}
              inputMode="decimal"
              value={draft.footingThicknessInches}
              onChange={(e) => set("footingThicknessInches", e.target.value)}
            />
          </Field>
          <Field label="Bottom of footing depth below grade (inches)">
            <input
              className={control}
              inputMode="decimal"
              value={draft.footingDepthInches}
              onChange={(e) => set("footingDepthInches", e.target.value)}
            />
          </Field>
          <Field label="Verified frost-depth basis">
            <input
              className={control}
              maxLength={160}
              value={draft.frostBasis}
              onChange={(e) => set("frostBasis", e.target.value)}
            />
          </Field>
          <Field
            label="Extra reviewed blocking rows"
            help="Zero is allowed. Add only blocking/bracing shown by a reviewed plan or required detail."
          >
            <input
              className={control}
              inputMode="numeric"
              value={draft.extraBlockingRows}
              onChange={(e) => set("extraBlockingRows", e.target.value)}
            />
          </Field>
          <Field
            label="Connector/fastener notes (not proof of a complete schedule)"
            help="These notes do not complete the connector work package. Supply the actual reviewed schedule and cost source in the takeoff checklist."
          >
            <input
              className={control}
              maxLength={160}
              value={draft.hardwareBasis}
              onChange={(e) => set("hardwareBasis", e.target.value)}
            />
          </Field>
        </div>
      ) : null}
      {detailsOpen && step === 3 ? (
        <div className="mt-3 space-y-2">
          {(
            [
              ["unusualGeometry", "Nonrectangular/unusual geometry"],
              ["cantilever", "Cantilever/overhang"],
              ["roofOrSpecialLoad", "Roof, hot tub, or special load"],
              ["soilOrFootingUncertain", "Soil or frost basis uncertain"],
            ] as const
          ).map(([key, label]) => (
            <label
              key={key}
              className="flex min-h-11 gap-3 rounded border p-3 text-sm font-bold"
            >
              <input
                type="checkbox"
                checked={draft[key]}
                onChange={(e) => set(key, e.target.checked)}
              />
              {label}
            </label>
          ))}
          <p className="text-sm text-slate-700">
            Any checked condition stops this bounded profile for engineer/AHJ
            review.
          </p>
        </div>
      ) : null}
      {generated && step === 4 ? (
        <div className="mt-3">
          <div className="overflow-x-auto rounded border bg-slate-50">
          <svg
            viewBox="0 0 320 210"
            role="img"
            aria-labelledby={`${svgTitleId} ${svgDescriptionId}`}
            className={drawingExpanded ? "min-w-[720px] w-full" : "min-w-[320px] w-full"}
          >
            <title id={svgTitleId}>Prescriptive estimating draft framing blueprint</title>
            <desc id={svgDescriptionId}>Main deck framing drawing with joists, beams, posts, footings, attachment edge, stair opening when applicable, and numbered callouts for missing or unresolved work.</desc>
            <rect
              x="30"
              y="20"
              width="260"
              height="150"
              fill="white"
              stroke="#334155"
              strokeWidth="2"
            />
            {Array.from({ length: Math.min(joists, 30) }, (_, i) => (
              <line
                data-plan-member="joist"
                key={`j${i}`}
                x1={30 + (i * 260) / (Math.min(joists, 30) - 1)}
                x2={30 + (i * 260) / (Math.min(joists, 30) - 1)}
                y1="20"
                y2="170"
                stroke="#94a3b8"
              />
            ))}
            {Array.from({ length: beamLines }, (_, i) => (
              <line
                data-plan-member="beam"
                key={`b${i}`}
                x1="30"
                x2="290"
                y1={20 + ((i + 1) * 150) / (beamLines + 1)}
                y2={20 + ((i + 1) * 150) / (beamLines + 1)}
                stroke="#7c3aed"
                strokeWidth="4"
              />
            ))}
            {Array.from({ length: posts }, (_, i) => (
              <g key={`p${i}`}>
                <circle
                  data-plan-member="footing"
                  cx={45 + (i * 230) / Math.max(1, posts - 1)}
                  cy="120"
                  r="7"
                  fill="#c4b5fd"
                />
                <rect
                  data-plan-member="post"
                  x={41 + (i * 230) / Math.max(1, posts - 1)}
                  y="116"
                  width="8"
                  height="8"
                  fill="#4c1d95"
                />
              </g>
            ))}
            <line
              data-plan-member={
                draft.attachment === "ledger" ? "ledger" : "freestanding-edge"
              }
              x1="30"
              x2="290"
              y1="20"
              y2="20"
              stroke="#0f172a"
              strokeWidth="6"
            />
            {draft.stairsIncluded === "yes" ? (
              <g>
                <rect
                  data-plan-member="stair-opening"
                  x={stairEdge === "left" ? 30 : stairEdge === "right" ? 265 : stairAlong}
                  y={stairEdge === "top" ? 20 : stairEdge === "yard" ? 145 : stairAcross}
                  width={stairEdge === "left" || stairEdge === "right" ? 25 : 40}
                  height={stairEdge === "left" || stairEdge === "right" ? 40 : 25}
                  fill="#fef3c7"
                  stroke="#92400e"
                  strokeWidth="2"
                />
                <text x={stairEdge === "left" ? 42 : stairEdge === "right" ? 277 : stairAlong + 20} y={stairEdge === "top" ? 35 : stairEdge === "yard" ? 160 : stairAcross + 22} textAnchor="middle" fontSize="7" fill="#78350f">detail required</text>
              </g>
            ) : null}
            {callouts.map((callout, index) => (
              <g key={callout.id} data-plan-member="blueprint-callout" data-callout-id={callout.id}>
                <line data-plan-member="callout-leader" x1={callout.anchorX} y1={callout.anchorY} x2={callout.markerX} y2={callout.markerY} stroke="#b91c1c" strokeWidth="1.5" strokeDasharray="3 2" />
                <circle cx={callout.markerX} cy={callout.markerY} r="10" fill="#b91c1c" stroke="white" strokeWidth="2" />
                <text x={callout.markerX} y={callout.markerY + 3.5} textAnchor="middle" fontSize="10" fontWeight="700" fill="white" aria-hidden="true">{index + 1}</text>
              </g>
            ))}
            <text x="160" y="188" textAnchor="middle" fontSize="8" fontWeight="700" fill="#991b1b">ESTIMATING DRAFT — NOT FOR PERMIT OR CONSTRUCTION — NOT STAMPED</text>
            <text x="160" y="198" textAnchor="middle" fontSize="10">
              Plan geometry changes with framing inputs · not stamped
            </text>
          </svg>
          </div>
          <button type="button" className="mt-2 min-h-11 rounded-md border-2 border-slate-400 bg-white px-4 py-2 text-sm font-bold text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600" aria-pressed={drawingExpanded} onClick={() => setDrawingExpanded((value) => !value)}>{drawingExpanded ? "Fit drawing to screen" : "Expand drawing"}</button>
          <p className="mt-2 rounded-md border border-red-300 bg-red-50 p-3 text-xs font-black text-red-950">ESTIMATING DRAFT — NOT FOR PERMIT OR CONSTRUCTION — NOT STAMPED</p>
          <section className="mt-3 grid gap-3 md:grid-cols-2" aria-label="Site visit evidence and proposed estimating assumptions"><div className="rounded-lg border border-blue-300 bg-blue-50 p-3"><h5 className="font-black text-blue-950">Observed existing — completed human site visit</h5><p className="mt-1 text-xs text-blue-900">Saved field observations are reused as evidence. They are not automatically declared to be the replacement design.</p><ul className="mt-2 space-y-1 text-sm text-blue-950">{visitSeed.observedMeasurements.length ? visitSeed.observedMeasurements.map((item) => <li key={`${item.itemKey}:${item.key}`}><strong>{item.key.replaceAll("_", " ")}:</strong> {item.value} {item.unit}</li>) : <li>No reusable measurement was saved.</li>}</ul></div><div className="rounded-lg border border-violet-300 bg-violet-50 p-3"><h5 className="font-black text-violet-950">Proposed estimating assumptions — reviewable</h5><p className="mt-1 text-xs text-violet-900">Supported observed values seed this editable draft only as explicit assumptions; the code-profile checks run again.</p><ul className="mt-2 space-y-1 text-sm text-violet-950"><li>Joists: {draft.joistSize || "not selected"} at {draft.joistSpacingInches || "?"} inches on center</li><li>Beam: {draft.beamPlies || "?"}-ply {draft.beamSize || "not selected"}</li><li>Posts: {draft.postCount || "?"} × {draft.postSize || "not selected"}</li><li>Attachment/stairs/railings: {draft.attachment || "unanswered"}; {draft.stairsIncluded || "unanswered"}; {draft.railingsIncluded || "unanswered"}</li></ul></div></section>
          {callouts.length ? <section aria-labelledby="blueprint-callouts-heading" aria-live="polite" className="mt-3 rounded-lg border-2 border-amber-400 bg-amber-50 p-3">
            <h5 id="blueprint-callouts-heading" className="font-black text-amber-950">What this draft still needs</h5>
            <p className="mt-1 text-sm text-amber-900">The numbered markers show where missing or unsupported decisions affect the drawing.</p>
            <ol className="mt-3 space-y-2">
              {callouts.map((callout, index) => <li key={callout.id}><button type="button" className="flex min-h-11 w-full gap-3 rounded-md bg-white p-3 text-left text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-700" onClick={() => { if (callout.id === "stairs-fact" && draft.stairsIncluded === "yes") onEditStairPlacement(); else if (callout.kind === "package") openPackageGuidance(callout.id); else { setDetailsOpen(true); setStep(callout.step); } }}><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-red-700 font-black text-white" aria-hidden="true">{index + 1}</span><span><span className="sr-only">Callout {index + 1}: </span>{callout.label}<span className="mt-1 block text-xs font-bold text-violet-800">{callout.id === "stairs-fact" && draft.stairsIncluded === "yes" ? "Edit stair placement" : callout.kind === "package" ? "Open package guidance" : `Edit ${STEPS[callout.step]}`}</span></span></button></li>)}
            </ol>
          </section> : <p className="mt-3 rounded-md border border-blue-400 bg-blue-50 p-3 text-sm font-bold text-blue-950">No immediate layout questions remain. Later design, ordering, and permit-readiness items are listed separately below.</p>}
          <details className="mt-3 rounded-lg border border-slate-300 bg-slate-50 p-3"><summary className="min-h-11 cursor-pointer py-2 font-black text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-700">Later: design, ordering, and permit readiness</summary><p className="mt-2 text-sm text-slate-700">These items do not belong in “answer now” drawing callouts. They still block canonical approval or final estimate readiness at the appropriate later stage.</p><ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-800"><li>Explicit City jurisdiction verification</li><li>Concealed ledger substrate and attachment detail</li><li>Soil bearing and frost-depth basis</li><li>Reviewed stair and guard details where applicable</li><li>Compatible connector products, manufacturer fasteners, prices, and traceable sources</li></ul><div className="mt-3 grid gap-2 sm:grid-cols-3">{plan.unresolvedPackages.includes("stairs") ? <button type="button" className={button} onClick={() => openPackageGuidance("package-stairs")}>Stair readiness guidance</button> : null}{plan.unresolvedPackages.includes("guard_schedule") ? <button type="button" className={button} onClick={() => openPackageGuidance("package-guards")}>Guard readiness guidance</button> : null}<button type="button" className={button} onClick={() => openPackageGuidance("package-connectors")}>Connector readiness guidance</button></div></details>
          {activePackage ? <div ref={packagePanelRef} tabIndex={-1} role="region" aria-live="polite" aria-labelledby="package-guidance-title" className="mt-3 rounded-lg border-2 border-violet-500 bg-violet-50 p-4 outline-none focus-visible:ring-2 focus-visible:ring-violet-700"><h5 id="package-guidance-title" className="font-black text-violet-950">{activePackage === "stairs" ? "Stair package guidance" : activePackage === "guards" ? "Guard and railing package guidance" : "Connector package guidance"}</h5><p className="mt-2 text-sm leading-6 text-violet-950">{activePackage === "stairs" ? "Complete the Stairs category in the takeoff checklist with a reviewed stair framing/landing/footing detail, purchasable quantities, compatible products, prices, and traceable sources. This drawing does not size stringers or landings." : activePackage === "guards" ? "Complete the Structural connectors category with the reviewed railing system layout: posts, corners, ends, blocking and load path, attachments, manufacturer fasteners, compatible products, prices, and sources." : "Complete the Structural connectors category in the takeoff checklist. Every applicable row needs its compatible product, manufacturer fastener schedule, verified substrate/coating/load path, purchase quantity, price, and traceable source."}</p><button type="button" className="mt-3 min-h-11 rounded-md border-2 border-violet-700 bg-white px-4 py-2 text-sm font-bold text-violet-950" onClick={() => setActivePackage(null)}>Close package guidance</button></div> : null}
          {plan.bom.length ? (
            <div className="mt-3 rounded border border-amber-400 bg-amber-50 p-3">
              <p className="font-black">Main deck framing draft is partially ready</p>
              <p className="mt-1 text-sm">Main-deck framing can move forward, but {unresolvedLabels.join(", ")} {unresolvedLabels.length === 1 ? "is" : "are"} still required before the complete estimate is ready.</p>
              <ul className="mt-2 space-y-1 text-sm">
                {plan.bom.map((x) => (
                  <li key={x.key}>
                    {x.quantity} {x.unit} · {x.description}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <label className="mt-3 flex min-h-11 gap-3 rounded border p-3 text-sm font-bold">
            <input
              type="checkbox"
              disabled={!plan.quantities || callouts.length > 0 || Boolean(pendingFacts)}
              checked={approved}
              onChange={(e) => setApproved(e.target.checked)}
            />
            I reviewed the saved field facts, explicit estimating assumptions,
            rule checks, drawing, and preliminary quantities. Later permit and ordering packages remain unresolved.
          </label>
          <button
            type="button"
            className={`mt-3 w-full ${button}`}
            disabled={disabled || !approved || !plan.quantities || callouts.length > 0 || Boolean(pendingFacts)}
            onClick={() => onApprove(plan)}
          >
            Approve estimating layout and use preliminary framing in takeoff
          </button>
        </div>
      ) : null}
      {detailsOpen ? <div className="sticky bottom-2 z-10 mt-4 grid grid-cols-2 gap-2 rounded-lg border border-slate-300 bg-white/95 p-2 shadow-lg backdrop-blur">
        <button
          type="button"
          className={button}
          disabled={step === 0}
          onClick={() => setStep((x) => x - 1)}
        >
          Previous
        </button>
        <button
          type="button"
          className={button}
          disabled={step === STEPS.length - 1}
          onClick={() => setStep((x) => x + 1)}
        >
          Next
        </button>
      </div> : null}
    </section>
  );
}
