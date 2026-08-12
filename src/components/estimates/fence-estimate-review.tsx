import type { FenceEmblemPricedPreview } from "@/lib/fence-emblem-priced-preview";
import type { EmblemManufacturerTakeoff } from "@/lib/fence-emblem-takeoff";

export function FenceEstimateReview({
  revision,
  runCount,
  totalLengthLabel,
  takeoff,
  pricedPreview,
}: {
  revision: number;
  runCount: number;
  totalLengthLabel: string;
  takeoff: EmblemManufacturerTakeoff;
  pricedPreview: FenceEmblemPricedPreview;
}) {
  return <section aria-labelledby="fence-review-title" className="rounded-lg border border-slate-200 bg-white p-4">
    <p className="text-xs font-bold uppercase tracking-[.16em] text-slate-500">Step 5 · Review only</p>
    <h3 id="fence-review-title" className="mt-1 font-bold text-slate-950">Review Fence estimate preview</h3>
    <p className="mt-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm font-bold text-blue-950">No estimate has been changed. This review cannot apply items or prices.</p>

    <dl className="mt-4 grid gap-3 sm:grid-cols-3">
      <ReviewFact term="Drawing" detail={`Saved Fence revision ${revision}; ${runCount} connected ${runCount === 1 ? "run" : "runs"}; ${totalLengthLabel}.`} />
      <ReviewFact term="Materials" detail={`${takeoff.panelCount} panels, ${takeoff.physicalPostCount} physical posts, and ${takeoff.capCount} post caps from ${takeoff.systemKey}.`} />
      <ReviewFact term="Retail preview" detail={`$${pricedPreview.materialTotalAmount} before unknown tax; ${pricedPreview.storeName} #${pricedPreview.storeNumber}; observed ${pricedPreview.observedAt}.`} />
    </dl>

    <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
      <p><strong>Material authority:</strong> {takeoff.authority}</p>
      <p className="mt-1"><strong>Price authority:</strong> {pricedPreview.authority}; evidence {pricedPreview.evidenceVersion}; manifest {pricedPreview.evidenceManifestSha256}.</p>
      <p className="mt-1"><strong>Limits:</strong> public retail evidence only, availability not guaranteed, tax unknown, and no catalog publication or estimate mutation.</p>
    </div>
  </section>;
}

function ReviewFact({ term, detail }: { term: string; detail: string }) {
  return <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
    <dt className="text-xs font-bold uppercase tracking-wide text-slate-500">{term}</dt>
    <dd className="mt-1 text-sm font-semibold leading-6 text-slate-900">{detail}</dd>
  </div>;
}
