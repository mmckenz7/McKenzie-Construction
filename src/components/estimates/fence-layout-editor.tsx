"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { FenceContextQuestions } from "@/components/estimates/fence-context-questions";
import { FenceEstimateReview } from "@/components/estimates/fence-estimate-review";
import { FenceMaterialVerification } from "@/components/estimates/fence-material-verification";
import { FencePricedPreview } from "@/components/estimates/fence-priced-preview";
import { isStaleFenceDraftError, loadFenceDraft, saveFenceDraft } from "@/lib/fence-draft-client";
import {
  projectFenceContextQuestions,
  type FenceContextAnswers,
} from "@/lib/fence-context-questions";
import { projectEmblemManufacturerTakeoff } from "@/lib/fence-emblem-takeoff";
import { buildFenceEmblemLowesEvidenceManifest } from "@/lib/fence-emblem-lowes-evidence";
import { projectFenceEmblemRetailPreview } from "@/lib/fence-emblem-priced-preview";
import type {
  FenceEstimateStepKey,
  FenceEstimateWorkflowProjection,
} from "@/lib/fence-estimate-workflow";
import {
  buildPersistableFenceLayoutDraft,
  FENCE_DRAFT_MAX_RUNS,
  projectFenceLayoutDraft,
  storedFenceRunInputs,
} from "@/lib/fence-layout-draft";

type EditableRun = { key: number; feet: string; inches: string };

const fieldClass = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-100";

function draftFingerprint(runs: readonly EditableRun[], needsGate: boolean) {
  return JSON.stringify({ runs: runs.map(({ feet, inches }) => ({ feet, inches })), needsGate });
}

export function FenceLayoutEditor({
  workflow,
  estimateId,
  editable,
  estimate,
}: {
  workflow: FenceEstimateWorkflowProjection;
  estimateId: string;
  editable: boolean;
  estimate: Readonly<{ propertyAddress?: string; status: string }>;
}) {
  const [nextKey, setNextKey] = useState(2);
  const [runs, setRuns] = useState<EditableRun[]>([{ key: 1, feet: "", inches: "" }]);
  const [needsGate, setNeedsGate] = useState(false);
  const [contextAnswers, setContextAnswers] = useState<FenceContextAnswers>({});
  const [revision, setRevision] = useState(0);
  const [savedFingerprint, setSavedFingerprint] = useState(() => draftFingerprint([], false));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [requestedStep, setRequestedStep] = useState<FenceEstimateStepKey | null>(null);
  const [materialsConfirmed, setMaterialsConfirmed] = useState(false);
  const [pricesConfirmed, setPricesConfirmed] = useState(false);
  const projection = useMemo(
    () => projectFenceLayoutDraft({ runs, needsGate }),
    [runs, needsGate],
  );
  const manualReview = projection.status === "manual_review";
  const fingerprint = draftFingerprint(runs, needsGate);
  const dirty = fingerprint !== savedFingerprint;
  const contextProjection = useMemo(
    () => projectFenceContextQuestions({ draft: projection, needsGate, estimate, answers: contextAnswers }),
    [contextAnswers, estimate, needsGate, projection],
  );
  const takeoff = useMemo(() => contextProjection.status === "job_context_complete"
    ? projectEmblemManufacturerTakeoff({
        runLengthsInches: projection.runs.flatMap((run) => run.lengthInches === null ? [] : [run.lengthInches]),
        needsGate,
        answers: contextAnswers,
      })
    : null, [contextAnswers, contextProjection.status, needsGate, projection.runs]);
  const pricedPreview = useMemo(() => materialsConfirmed && takeoff
    ? projectFenceEmblemRetailPreview({
        takeoff,
        evidence: buildFenceEmblemLowesEvidenceManifest(),
      })
    : null, [materialsConfirmed, takeoff]);
  const derivedStep: FenceEstimateStepKey = loading || revision === 0 || dirty
    ? "draw_fence"
    : contextProjection.status === "job_context_complete"
      ? !materialsConfirmed
        ? "verify_materials"
        : pricesConfirmed ? "review_estimate" : "apply_lowes_prices"
      : "answer_questions";
  const currentStep = requestedStep ?? derivedStep;

  const applyStoredDraft = useCallback((stored: Awaited<ReturnType<typeof loadFenceDraft>>) => {
    setRequestedStep(null);
    setMaterialsConfirmed(false);
    setPricesConfirmed(false);
    if (!stored) {
      const initial = [{ key: 1, feet: "", inches: "" }];
      setRuns(initial);
      setNeedsGate(false);
      setContextAnswers({});
      setRevision(0);
      setNextKey(2);
      setSavedFingerprint(draftFingerprint([], false));
      return;
    }
    const hydrated = storedFenceRunInputs(stored.runLengthsInches).map((run, index) => ({
      key: index + 1,
      feet: run.feet,
      inches: run.inches,
    }));
    setRuns(hydrated);
    setNeedsGate(stored.needsGate);
    setContextAnswers(stored.contextAnswers);
    setRevision(stored.revision);
    setNextKey(hydrated.length + 1);
    setSavedFingerprint(draftFingerprint(hydrated, stored.needsGate));
  }, []);

  const reloadSavedDraft = useCallback(async () => {
    setLoading(true);
    setMaterialsConfirmed(false);
    setPricesConfirmed(false);
    setError("");
    try {
      applyStoredDraft(await loadFenceDraft(fetch, estimateId));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "The saved Fence draft could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [applyStoredDraft, estimateId]);

  useEffect(() => { void reloadSavedDraft(); }, [reloadSavedDraft]);

  function updateRun(key: number, field: "feet" | "inches", value: string) {
    setMaterialsConfirmed(false);
    setPricesConfirmed(false);
    setRuns((current) => current.map((run) => run.key === key ? { ...run, [field]: value } : run));
  }

  function addRun() {
    if (runs.length >= FENCE_DRAFT_MAX_RUNS) return;
    setMaterialsConfirmed(false);
    setPricesConfirmed(false);
    setRuns((current) => [...current, { key: nextKey, feet: "", inches: "" }]);
    setNextKey((current) => current + 1);
  }

  function removeLastRun() {
    if (runs.length <= 1) return;
    setMaterialsConfirmed(false);
    setPricesConfirmed(false);
    setRuns((current) => current.slice(0, -1));
  }

  async function save() {
    if (!editable || saving || loading) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const payload = buildPersistableFenceLayoutDraft({ runs, needsGate, contextAnswers: {} });
      const stored = await saveFenceDraft(fetch, estimateId, revision, payload);
      applyStoredDraft(stored);
      setMessage(needsGate
        ? `Revision ${stored.revision} saved. Gate details still require manual review.`
        : `Revision ${stored.revision} saved.`);
    } catch (saveError) {
      if (isStaleFenceDraftError(saveError)) {
        try {
          applyStoredDraft(await loadFenceDraft(fetch, estimateId));
          setMessage("A newer saved Fence draft was found and loaded. Review it before continuing.");
        } catch {
          setError("A newer Fence draft exists, but it could not be reloaded. Refresh before editing.");
        }
      } else {
        setError(saveError instanceof Error ? saveError.message : "The Fence draft could not be saved.");
      }
    } finally {
      setSaving(false);
    }
  }

  async function saveContextAnswers(nextAnswers: FenceContextAnswers) {
    if (!editable || saving || loading || dirty) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const payload = buildPersistableFenceLayoutDraft({ runs, needsGate, contextAnswers: nextAnswers });
      const stored = await saveFenceDraft(fetch, estimateId, revision, payload);
      applyStoredDraft(stored);
      setMessage(`Job answer saved in Fence revision ${stored.revision}.`);
    } catch (saveError) {
      if (isStaleFenceDraftError(saveError)) {
        try {
          applyStoredDraft(await loadFenceDraft(fetch, estimateId));
          setMessage("A newer saved Fence draft was found and loaded. Review it before continuing.");
        } catch {
          setError("A newer Fence draft exists, but it could not be reloaded. Refresh before editing.");
        }
      } else {
        setError(saveError instanceof Error ? saveError.message : "The Fence job answer could not be saved.");
      }
    } finally {
      setSaving(false);
    }
  }

  const controlsDisabled = loading || saving || !editable;
  const saveable = projection.status === "ready" || (needsGate && projection.runs.length > 0 && projection.runs.every((run) => run.error === null));

  const drawStep = <div className="space-y-4">
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-bold text-slate-950">Draw connected fence runs</h3>
          <p className="mt-1 text-sm text-slate-600">Type the measured length for each straight run. Joins are ordinary corners; no corner products are inferred.</p>
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${manualReview ? "border-amber-300 bg-amber-50 text-amber-900" : projection.status === "ready" ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-blue-200 bg-blue-50 text-blue-800"}`}>
          {loading ? "Loading saved draft" : projection.statusLabel}
        </span>
      </div>

      <FenceDraftSchematic runCount={runs.length} />

      <div className="mt-4 space-y-3">
        {runs.map((run, index) => {
          const result = projection.runs[index];
          return <fieldset key={run.key} className="rounded-lg border border-slate-200 p-3">
            <legend className="px-1 text-sm font-bold text-slate-900">Run {index + 1}: {result?.fromLabel} → {result?.toLabel}</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-semibold text-slate-800">Feet
                <input inputMode="numeric" pattern="[0-9]*" value={run.feet} onChange={(event) => updateRun(run.key, "feet", event.target.value)} className={fieldClass} aria-describedby={result?.error ? `fence-run-${run.key}-error` : undefined} disabled={controlsDisabled} />
              </label>
              <label className="text-sm font-semibold text-slate-800">Inches (0–11)
                <input inputMode="numeric" pattern="[0-9]*" value={run.inches} onChange={(event) => updateRun(run.key, "inches", event.target.value)} className={fieldClass} aria-describedby={result?.error ? `fence-run-${run.key}-error` : undefined} disabled={controlsDisabled} />
              </label>
            </div>
            {result?.error ? <p id={`fence-run-${run.key}-error`} role="alert" className="mt-2 text-sm font-semibold text-rose-700">{result.error}</p> : null}
          </fieldset>;
        })}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={addRun} disabled={runs.length >= FENCE_DRAFT_MAX_RUNS || controlsDisabled} className="rounded-lg bg-slate-950 px-3 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">Add connected run</button>
        <button type="button" onClick={removeLastRun} disabled={runs.length <= 1 || controlsDisabled} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-800 disabled:cursor-not-allowed disabled:opacity-50">Remove last run</button>
      </div>
    </div>

    <label className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-900">
      <input type="checkbox" checked={needsGate} onChange={(event) => { setMaterialsConfirmed(false); setPricesConfirmed(false); setNeedsGate(event.target.checked); }} disabled={controlsDisabled} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-700" />
      <span><strong>This fence needs a gate</strong><span className="mt-1 block text-slate-600">The measured layout can be saved, but gate assemblies remain blocked for manual review. No gate opening or quantity is created.</span></span>
    </label>

    <div className={`rounded-lg border p-4 ${manualReview ? "border-amber-300 bg-amber-50 text-amber-950" : "border-slate-200 bg-white text-slate-900"}`} aria-live="polite">
      <p className="text-xs font-bold uppercase tracking-wide">Fence length</p>
      {projection.totalLengthLabel ? <p className="mt-1 text-2xl font-bold">{projection.totalLengthLabel}</p> : <p className="mt-1 font-bold">Not ready</p>}
      {projection.issue ? <p className="mt-1 text-sm">{projection.issue}</p> : <p className="mt-1 text-sm text-slate-600">Typed run lengths are ready to save. Saving does not add anything to the estimate.</p>}
    </div>

    <div className="flex flex-wrap items-center gap-3">
      <button type="button" onClick={() => void save()} disabled={controlsDisabled || !dirty || !saveable} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">
        {saving ? "Saving…" : revision > 0 ? "Save new revision" : "Save Fence draft"}
      </button>
      <span className="text-xs font-semibold text-slate-600">
        {revision > 0 ? `Saved revision ${revision}${dirty ? " · Unsaved changes" : ""}` : dirty ? "Not saved" : "Add a measured run"}
      </span>
      {revision > 0 && !dirty && requestedStep === "draw_fence" ? <button type="button" onClick={() => setRequestedStep(null)} className="text-xs font-bold text-slate-700 underline">Continue with saved drawing</button> : null}
    </div>
    {message ? <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-900">{message}</p> : null}
    {error ? <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-900"><p>{error}</p><button type="button" onClick={() => void reloadSavedDraft()} className="mt-2 underline">Reload saved draft</button></div> : null}

  </div>;

  const stepOrder = workflow.steps.map((step) => step.key);
  const currentIndex = stepOrder.indexOf(currentStep);

  return <ol className="divide-y divide-slate-200">
    {workflow.steps.map((step, index) => {
      const expanded = step.key === currentStep;
      const complete = index < currentIndex;
      const materialReview = step.key === "verify_materials" && takeoff?.status === "manual_review";
      const priceReview = step.key === "apply_lowes_prices" && pricedPreview?.status === "manual_review";
      const answerReview = step.key === "answer_questions" && contextProjection.status === "manual_review";
      const statusLabel = expanded
        ? materialReview || priceReview || answerReview
          ? "Manual review"
          : step.key === "verify_materials"
            ? "Needs confirmation"
            : step.key === "apply_lowes_prices"
              ? "Needs confirmation"
              : step.key === "review_estimate"
                ? "Review only"
              : "Current step"
        : complete ? "Complete" : "Waiting";
      const statusTone = materialReview || priceReview || answerReview
        ? "border-amber-300 bg-amber-50 text-amber-900"
        : complete
          ? "border-emerald-300 bg-emerald-50 text-emerald-900"
          : expanded
            ? "border-blue-200 bg-blue-50 text-blue-800"
            : "border-slate-200 bg-slate-50 text-slate-600";

      return <li key={step.key} aria-current={expanded ? "step" : undefined}>
        <div className="flex items-center gap-3 px-5 py-3">
          <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-950 text-xs font-bold text-white">{index + 1}</span>
          <span className="min-w-0 flex-1 font-semibold text-slate-900">{step.label}</span>
          <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${statusTone}`}>{statusLabel}</span>
        </div>
        {expanded ? <div className="border-t border-slate-100 bg-slate-50 px-5 py-4 sm:pl-16">
          {step.key === "draw_fence" ? drawStep : null}
          {step.key === "answer_questions" ? <div className="space-y-3">
            <div className="flex flex-wrap gap-3">
              <button type="button" onClick={() => setRequestedStep("draw_fence")} className="text-xs font-bold text-slate-600 hover:text-slate-950 hover:underline">← Edit drawing</button>
              {contextProjection.status === "job_context_complete" ? <button type="button" onClick={() => setRequestedStep(null)} className="text-xs font-bold text-emerald-800 hover:text-emerald-950 hover:underline">Continue to Verify materials →</button> : null}
            </div>
            <FenceContextQuestions draft={projection} needsGate={needsGate} estimate={estimate} answers={contextAnswers} pending={saving} onSave={saveContextAnswers} />
          </div> : null}
          {step.key === "verify_materials" && takeoff ? <div className="space-y-3">
            <button type="button" onClick={() => setRequestedStep("answer_questions")} className="text-xs font-bold text-slate-600 hover:text-slate-950 hover:underline">← Review job answers</button>
            <FenceMaterialVerification takeoff={takeoff} />
            {takeoff.status === "ready" ? materialsConfirmed ? <div className="flex flex-wrap items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950">
              <strong>Materials confirmed for this browser session.</strong>
              <button type="button" onClick={() => setRequestedStep(null)} className="font-bold underline">Continue to Apply Lowe&apos;s prices →</button>
            </div> : <div className="rounded-lg border border-slate-200 bg-white p-3">
              <button type="button" onClick={() => { setMaterialsConfirmed(true); setPricesConfirmed(false); setRequestedStep(null); }} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-bold text-white">Materials look correct</button>
              <p className="mt-2 text-xs font-semibold text-slate-500">This confirmation lasts only for this browser session. It is not saved and does not change the estimate.</p>
            </div> : null}
          </div> : null}
          {step.key === "apply_lowes_prices" && pricedPreview ? <div className="space-y-3">
            <button type="button" onClick={() => setRequestedStep("verify_materials")} className="text-xs font-bold text-slate-600 hover:text-slate-950 hover:underline">← Review verified materials</button>
            <FencePricedPreview preview={pricedPreview} />
            {pricedPreview.status === "ready" ? pricesConfirmed ? <div className="flex flex-wrap items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950">
              <strong>Prices confirmed for this browser session.</strong>
              <button type="button" onClick={() => setRequestedStep(null)} className="font-bold underline">Continue to Review estimate →</button>
            </div> : <div className="rounded-lg border border-slate-200 bg-white p-3">
              <button type="button" onClick={() => { setPricesConfirmed(true); setRequestedStep(null); }} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-bold text-white">Prices look correct</button>
              <p className="mt-2 text-xs font-semibold text-slate-500">This confirmation lasts only for this browser session. It is not saved and does not change the estimate.</p>
            </div> : null}
          </div> : null}
          {step.key === "review_estimate" && takeoff?.status === "ready" && takeoff.manufacturerTakeoff && pricedPreview?.status === "ready" && projection.totalLengthLabel ? <div className="space-y-3">
            <button type="button" onClick={() => setRequestedStep("apply_lowes_prices")} className="text-xs font-bold text-slate-600 hover:text-slate-950 hover:underline">← Review priced preview</button>
            <FenceEstimateReview revision={revision} runCount={projection.runs.length} totalLengthLabel={projection.totalLengthLabel} takeoff={takeoff.manufacturerTakeoff} pricedPreview={pricedPreview} />
          </div> : null}
        </div> : null}
      </li>;
    })}
  </ol>;
}

function FenceDraftSchematic({ runCount }: { runCount: number }) {
  const visibleCount = Math.min(runCount, 8);
  const points = Array.from({ length: visibleCount + 1 }, (_, index) => {
    const x = 24 + index * (432 / Math.max(visibleCount, 1));
    const y = index === 0 || index === visibleCount ? 76 : index % 2 ? 36 : 116;
    return `${x},${y}`;
  }).join(" ");

  return <figure className="mt-4 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3">
    <svg viewBox="0 0 480 152" role="img" aria-label={`Illustrative connected fence with ${runCount} ${runCount === 1 ? "run" : "runs"}`} className="h-36 w-full">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-700" />
      {points.split(" ").map((point, index) => {
        const [cx, cy] = point.split(",");
        return <g key={point}>
          <circle cx={cx} cy={cy} r="7" className="fill-slate-950" />
          <text x={cx} y={Number(cy) + (Number(cy) < 76 ? -13 : 24)} textAnchor="middle" className="fill-slate-700 text-[11px] font-bold">{index === 0 ? "Start" : index === visibleCount ? "End" : `Corner ${index}`}</text>
        </g>;
      })}
    </svg>
    <figcaption className="text-xs font-semibold text-slate-600">Shape is illustrative; typed lengths control. {runCount > visibleCount ? `First ${visibleCount} runs shown.` : ""}</figcaption>
  </figure>;
}
