"use client";

import { useEffect, useMemo, useState } from "react";

import {
  projectFenceContextQuestions,
  type FenceContextAnswers,
} from "@/lib/fence-context-questions";
import type { FenceLayoutDraftProjection } from "@/lib/fence-layout-draft";

const choiceClass = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-left text-sm font-semibold text-slate-900 hover:border-emerald-600 hover:bg-emerald-50";

export function FenceContextQuestions({
  draft,
  needsGate,
  estimate,
  answers,
  pending,
  onSave,
}: {
  draft: Pick<FenceLayoutDraftProjection, "status" | "runs">;
  needsGate: boolean;
  estimate: Readonly<{ propertyAddress?: string; status: string }>;
  answers: FenceContextAnswers;
  pending: boolean;
  onSave: (answers: FenceContextAnswers) => Promise<void>;
}) {
  const [frostDepthDraft, setFrostDepthDraft] = useState(answers.frostDepthInches ?? "");
  const projection = useMemo(
    () => projectFenceContextQuestions({ draft, needsGate, estimate, answers }),
    [answers, draft, estimate, needsGate],
  );
  const current = projection.currentQuestion;

  useEffect(() => setFrostDepthDraft(answers.frostDepthInches ?? ""), [answers.frostDepthInches]);

  function answer(key: keyof FenceContextAnswers, value: string) {
    void onSave({ ...answers, [key]: value });
  }

  return <section aria-labelledby="fence-context-title" className="rounded-lg border border-slate-200 bg-white p-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-xs font-bold uppercase tracking-[.16em] text-emerald-700">Step 2</p>
        <h3 id="fence-context-title" className="mt-1 font-bold text-slate-950">Answer only what the job must tell us</h3>
        <p className="mt-1 text-sm text-slate-600">Manufacturer facts are already filled in. Questions appear one at a time.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {Object.keys(answers).length > 0 ? <button type="button" disabled={pending} onClick={() => void onSave({})} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-800 disabled:cursor-not-allowed disabled:opacity-50">Start answers over</button> : null}
        <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${projection.status === "manual_review" ? "border-amber-300 bg-amber-50 text-amber-900" : projection.status === "job_context_complete" ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-blue-200 bg-blue-50 text-blue-800"}`}>{projection.statusLabel}</span>
      </div>
    </div>

    <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
      <div><dt className="font-bold uppercase tracking-wide text-slate-500">Job address</dt><dd className="mt-0.5 font-semibold text-slate-900">{projection.propertyAddressLabel}</dd></div>
      <div><dt className="font-bold uppercase tracking-wide text-slate-500">Estimate status</dt><dd className="mt-0.5 font-semibold text-slate-900">{projection.estimateStatusLabel}</dd></div>
    </dl>

    {current ? <fieldset className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-4">
      <legend className="px-1 font-bold text-slate-950">{current.prompt}</legend>
      <p className="mt-1 text-sm leading-6 text-slate-700">{current.help}</p>
      {current.inputKind === "choice" ? <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {current.options?.map((option) => <button key={option.value} type="button" disabled={pending} onClick={() => answer(current.key, option.value)} className={`${choiceClass} disabled:cursor-not-allowed disabled:opacity-50`}>{option.label}</button>)}
      </div> : <label className="mt-3 block text-sm font-semibold text-slate-800">Verified frost depth (whole inches)
        <div className="mt-1 flex max-w-sm gap-2">
          <input inputMode="numeric" pattern="[0-9]*" value={frostDepthDraft} onChange={(event) => setFrostDepthDraft(event.target.value)} disabled={pending} className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-100" />
          <button type="button" disabled={pending} onClick={() => answer("frostDepthInches", frostDepthDraft)} className="rounded-lg bg-slate-950 px-3 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">{pending ? "Saving…" : "Continue"}</button>
        </div>
      </label>}
    </fieldset> : null}

    {projection.jobBlocker ? <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"><strong>Why this job stops:</strong> {projection.jobBlocker}</div> : null}

    {projection.status === "job_context_complete" || projection.status === "manual_review" ? <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-600">Company rules still needed</p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">{projection.companyStandardBlockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul>
    </div> : null}

    <details className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <summary className="cursor-pointer text-sm font-bold text-slate-900">Manufacturer facts already resolved</summary>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">{projection.manufacturerFacts.map((fact) => <li key={fact}>{fact}</li>)}</ul>
    </details>

    <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold leading-5 text-amber-950">{projection.testFixtureNotice}</p>
    <p className="mt-2 text-xs font-semibold text-slate-500">Each answer is saved with the Fence revision. Answers create no quantities, products, prices, or tasks.</p>
  </section>;
}
