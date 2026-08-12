import type { FenceEmblemPricedPreviewProjection } from "@/lib/fence-emblem-priced-preview";

export function FencePricedPreview({
  preview,
}: {
  preview: FenceEmblemPricedPreviewProjection;
}) {
  if (preview.status === "manual_review") {
    return <section aria-labelledby="fence-price-title" className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-950">
      <p className="text-xs font-bold uppercase tracking-[.16em]">Step 4</p>
      <h3 id="fence-price-title" className="mt-1 font-bold">Apply Lowe&apos;s prices — Manual review</h3>
      <p className="mt-2 text-sm"><strong>Why pricing stops:</strong> {preview.issue}</p>
      <p className="mt-3 text-sm font-bold">No priced preview is available.</p>
    </section>;
  }

  return <section aria-labelledby="fence-price-title" className="rounded-lg border border-blue-200 bg-white p-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-xs font-bold uppercase tracking-[.16em] text-blue-700">Step 4 · Read only</p>
        <h3 id="fence-price-title" className="mt-1 font-bold text-slate-950">Lowe&apos;s public retail preview</h3>
        <p className="mt-1 text-sm text-slate-600">Exact accepted evidence from {preview.storeName} #{preview.storeNumber}, observed {preview.observedAt}.</p>
      </div>
      <a href={preview.storeSourceReference} target="_blank" rel="noreferrer" className="text-xs font-bold text-blue-800 underline">Store source ↗</a>
    </div>

    <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
      <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
          <tr><th className="px-3 py-2">Material</th><th className="px-3 py-2">Qty</th><th className="px-3 py-2">Lowe&apos;s identity</th><th className="px-3 py-2">Unit retail</th><th className="px-3 py-2">Subtotal</th><th className="px-3 py-2">Evidence</th></tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {preview.lines.map((line) => <tr key={line.demandKey}>
            <td className="px-3 py-3 font-semibold text-slate-900">{line.description}</td>
            <td className="px-3 py-3 text-slate-800">{line.quantity}</td>
            <td className="px-3 py-3 text-slate-700"><span className="block">Item {line.itemNumber}</span><span className="block">Model {line.modelNumber}</span></td>
            <td className="px-3 py-3 font-semibold text-slate-900">${line.unitPriceAmount} / ea.</td>
            <td className="px-3 py-3 font-bold text-slate-950">${line.subtotalAmount}</td>
            <td className="px-3 py-3"><a href={line.priceSourceReference} target="_blank" rel="noreferrer" className="font-bold text-blue-800 underline">Product source ↗</a></td>
          </tr>)}
        </tbody>
        <tfoot className="bg-slate-50">
          <tr><th colSpan={4} className="px-3 py-3 text-right text-sm text-slate-700">Material total</th><td className="px-3 py-3 text-lg font-bold text-slate-950">${preview.materialTotalAmount}</td><td className="px-3 py-3" /></tr>
        </tfoot>
      </table>
    </div>

    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"><strong>Tax unknown.</strong> Tax is excluded from this material total.</div>
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"><strong>Availability not guaranteed.</strong> Captured page text is display-only evidence, not an inventory quantity.</div>
    </div>
    <ul className="mt-3 list-disc space-y-1 pl-5 text-xs font-semibold text-slate-600">{preview.disclosures.map((disclosure) => <li key={disclosure}>{disclosure}</li>)}</ul>
  </section>;
}
