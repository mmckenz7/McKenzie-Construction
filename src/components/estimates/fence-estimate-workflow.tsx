import Link from "next/link";

import { FenceLayoutEditor } from "@/components/estimates/fence-layout-editor";
import type { FenceEstimateWorkflowProjection } from "@/lib/fence-estimate-workflow";

export function FenceEstimateWorkflow({
  workflow,
  returnHref,
  estimateId,
  editable,
}: {
  workflow: FenceEstimateWorkflowProjection;
  returnHref: string;
  estimateId: string;
  editable: boolean;
}) {
  return <section aria-labelledby="fence-estimate-workflow-title" className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
    <header className="border-b border-slate-200 px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.18em] text-emerald-700">Fence estimate</p>
          <h2 id="fence-estimate-workflow-title" className="mt-1 text-xl font-bold text-slate-950">One step at a time</h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-700">Versioned Fence draft</span>
          <Link href={returnHref} className="text-xs font-bold text-slate-600 hover:text-slate-950 hover:underline">Exit Fence view</Link>
        </div>
      </div>
      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
        <ContextFact term="Estimate" detail={workflow.estimateTitle} />
        <ContextFact term="Status" detail={workflow.estimateStatus} />
        <ContextFact term="Address" detail={workflow.propertyAddress} />
      </dl>
    </header>

    <div className="border-b border-amber-200 bg-amber-50 px-5 py-3 text-sm leading-6 text-amber-950">
      <strong>Manufacturer guide controls.</strong> Post spacing, rails, gates, hardware, and installation details must come from the exact selected fence system. Unsupported systems stay in manual review.
    </div>

    {editable && workflow.steps[0].status !== "manual_review"
      ? <FenceLayoutEditor workflow={workflow} estimateId={estimateId} editable={editable} estimate={{ propertyAddress: workflow.propertyAddressKnown ? workflow.propertyAddress : undefined, status: workflow.estimateStatus }} />
      : <ol className="divide-y divide-slate-200">{workflow.steps.map((step, index) => <li key={step.key} aria-current={step.expanded ? "step" : undefined}>
        <div className="flex items-center gap-3 px-5 py-3">
          <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-950 text-xs font-bold text-white">{index + 1}</span>
          <span className="min-w-0 flex-1 font-semibold text-slate-900">{step.label}</span>
          <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${step.status === "manual_review" ? "border-amber-300 bg-amber-50 text-amber-900" : "border-slate-200 bg-slate-50 text-slate-600"}`}>{step.statusLabel}</span>
        </div>
        {step.expanded ? <div className="border-t border-slate-100 bg-slate-50 px-5 py-4 sm:pl-16"><p className="text-sm leading-6 text-slate-700">{step.detail}</p><p className="mt-2 text-xs font-semibold text-slate-500">No quantities, products, or prices have been created.</p></div> : null}
      </li>)}</ol>}
  </section>;
}

function ContextFact({ term, detail }: { term: string; detail: string }) {
  return <div className="min-w-0">
    <dt className="text-xs font-bold uppercase tracking-wide text-slate-500">{term}</dt>
    <dd className="mt-0.5 truncate font-semibold text-slate-900" title={detail}>{detail}</dd>
  </div>;
}
