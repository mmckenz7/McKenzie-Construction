import type { EmblemTakeoffProjection } from "@/lib/fence-emblem-takeoff";

export function FenceMaterialVerification({
  takeoff,
}: {
  takeoff: EmblemTakeoffProjection;
}) {
  if (takeoff.status === "manual_review") {
    const affectedRuns = takeoff.blockedCalculationTrace?.runs.filter((run) => run.requiresCut) ?? [];
    return <section aria-labelledby="fence-material-title" className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-950">
      <p className="text-xs font-bold uppercase tracking-[.16em]">Step 3</p>
      <h3 id="fence-material-title" className="mt-1 font-bold">Verify materials — Manual review</h3>
      <p className="mt-2 text-sm leading-6"><strong>Why this takeoff stops:</strong> {takeoff.issue}</p>
      {affectedRuns.length > 0 ? <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
        {affectedRuns.map((run) => <li key={run.runNumber}>Run {run.runNumber} calculates a {run.finalPanelPhysicalWidthInches} in final panel. Field-verify the run and obtain an approved minimum cut-panel rule.</li>)}
      </ul> : null}
      <p className="mt-3 text-sm font-bold">No issuable material quantities are available.</p>
    </section>;
  }

  const materials = takeoff.manufacturerTakeoff;
  if (!materials) return null;

  return <section aria-labelledby="fence-material-title" className="rounded-lg border border-emerald-200 bg-white p-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-xs font-bold uppercase tracking-[.16em] text-emerald-700">Step 3</p>
        <h3 id="fence-material-title" className="mt-1 font-bold text-slate-950">Verify manufacturer materials</h3>
        <p className="mt-1 text-sm text-slate-600">Working Emblem 6 × 8 white takeoff. Review these quantities before any supplier or estimate work.</p>
      </div>
      <span className="rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-900">Ready to verify</span>
    </div>

    <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
      <MaterialCount label="Panels" count={materials.panelCount} />
      <MaterialCount label="End posts" count={materials.endPostCount} />
      <MaterialCount label="Line posts" count={materials.linePostCount} />
      <MaterialCount label="Corner posts" count={materials.cornerPostCount} />
      <MaterialCount label="Post caps" count={materials.capCount} />
    </dl>

    <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-600">How each run was counted</p>
      <ul className="mt-2 space-y-2 text-sm text-slate-800">
        {materials.runs.map((run) => <li key={run.runNumber} className="rounded-md bg-white px-3 py-2">
          <strong>Run {run.runNumber}:</strong> {formatLength(run.centerlineLengthInches)} center to center gives {countLabel(run.panelCount, "panel")} and {countLabel(run.linePostCount, "line post")}. Final panel width: {run.finalPanelPhysicalWidthInches} in; no cut required.
        </li>)}
      </ul>
    </div>

    <p className="mt-3 text-xs font-semibold text-slate-500">Manufacturer takeoff only. No concrete, gravel, supplier products, prices, or estimate items are included.</p>
  </section>;
}

function MaterialCount({ label, count }: { label: string; count: number }) {
  return <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-center">
    <dt className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</dt>
    <dd className="mt-1 text-2xl font-bold text-slate-950">{count}</dd>
  </div>;
}

function formatLength(rawInches: string) {
  const inches = BigInt(rawInches);
  return `${(inches / 12n).toString()} ft ${(inches % 12n).toString()} in`;
}

function countLabel(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}
