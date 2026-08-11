import Link from "next/link";

import type {
  MaterialCatalogPreview,
  MaterialCatalogPreviewOffer,
} from "@/lib/material-catalog-preview";

type AuthorizationState =
  | "unauthorized"
  | "access_unavailable"
  | "feature_unavailable"
  | "feature_disabled"
  | "forbidden"
  | "tenant_scope_unavailable";

const stateCopy: Record<AuthorizationState, { eyebrow: string; title: string; detail: string }> = {
  unauthorized: {
    eyebrow: "Sign in required",
    title: "Supplier pricing is not available",
    detail: "Sign in with an active employee account to view catalog evidence.",
  },
  access_unavailable: {
    eyebrow: "Access unavailable",
    title: "Your catalog access could not be verified",
    detail: "No supplier or price records were loaded. Try again after access service is restored.",
  },
  feature_unavailable: {
    eyebrow: "Feature status unavailable",
    title: "Material Catalog could not be verified",
    detail: "No catalog evidence was loaded because the feature status is unavailable.",
  },
  feature_disabled: {
    eyebrow: "Preview disabled",
    title: "Material Catalog preview is off for this account",
    detail: "An owner can enable the catalog preview when the company is ready to review published supplier evidence.",
  },
  forbidden: {
    eyebrow: "Access denied",
    title: "Supplier pricing requires view-costs access",
    detail: "Your workspace access does not include supplier comparison or cost visibility.",
  },
  tenant_scope_unavailable: {
    eyebrow: "Company scope unavailable",
    title: "The company catalog scope could not be verified",
    detail: "No supplier evidence was loaded because company ownership did not pass the required checks.",
  },
};

export function MaterialCatalogPreviewState({
  state,
}: {
  state: AuthorizationState;
}) {
  const copy = stateCopy[state];
  return (
    <main className="mx-auto max-w-4xl px-5 py-12">
      <section className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
          {copy.eyebrow}
        </p>
        <h1 className="mt-3 text-3xl font-black text-slate-950">{copy.title}</h1>
        <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-slate-600">
          {copy.detail}
        </p>
        <Link
          href="/operations/materials"
          className="mt-6 inline-flex rounded-xl bg-slate-950 px-5 py-3 text-sm font-bold text-white"
        >
          Return to Materials
        </Link>
      </section>
    </main>
  );
}

export function MaterialCatalogPreviewError() {
  return (
    <main className="mx-auto max-w-4xl px-5 py-12">
      <section className="rounded-2xl border border-red-200 bg-white p-8 text-center shadow-sm">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-red-700">Evidence unavailable</p>
        <h1 className="mt-3 text-3xl font-black text-slate-950">Catalog evidence could not be loaded</h1>
        <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-slate-600">
          No fallback price was substituted. Refresh to retry the read-only query.
        </p>
        <Link
          href="/operations/materials/catalog"
          className="mt-6 inline-flex rounded-xl bg-slate-950 px-5 py-3 text-sm font-bold text-white"
        >
          Retry preview
        </Link>
      </section>
    </main>
  );
}

export function MaterialCatalogPreviewLoading() {
  return (
    <main
      aria-busy="true"
      aria-label="Loading catalog evidence"
      className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8"
    >
      <p className="text-sm font-semibold text-slate-600">Loading catalog evidence…</p>
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {[0, 1, 2].map((item) => (
          <div key={item} className="h-36 animate-pulse rounded-2xl border border-slate-200 bg-white shadow-sm" />
        ))}
      </div>
      <div className="mt-6 h-72 animate-pulse rounded-2xl border border-slate-200 bg-white shadow-sm" />
    </main>
  );
}

export function MaterialCatalogPreviewView({
  preview,
}: {
  preview: MaterialCatalogPreview;
}) {
  const filtersActive = Boolean(
    preview.filters.query || preview.filters.supplier || preview.filters.mappingStatus,
  );
  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-slate-500">Materials</p>
            <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-blue-800">
              Read only
            </span>
          </div>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950">
            Supplier pricing preview
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Published supplier evidence only. This page does not change catalog, supplier,
            price, or estimate records.
          </p>
        </div>
        <p className="text-xs text-slate-500">
          Evidence assembled {new Date(preview.generatedAt).toLocaleString("en-US")}
        </p>
      </header>

      <section className="mt-7 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950">
        <p className="font-bold">Evidence preview, not a purchasing recommendation</p>
        <p className="mt-1 leading-6">
          No supplier is ranked until quantity, target unit, freshness, confidence,
          delivery, and account policy are approved.
        </p>
      </section>

      {preview.resultsLimited ? (
        <section className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 p-5 text-sm text-blue-950">
          <p className="font-bold">Showing a bounded evidence set</p>
          <p className="mt-1 leading-6">
            More than 160 company observations are available. This preview uses the 160
            most recently observed records, so counts below do not represent the full catalog.
          </p>
        </section>
      ) : null}

      <form method="get" className="mt-7 grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:grid-cols-[minmax(0,1fr)_220px_200px_auto]">
        <label className="block">
          <span className="text-sm font-bold text-slate-800">Product search</span>
          <input
            type="search"
            name="q"
            defaultValue={preview.filters.query}
            maxLength={80}
            placeholder="Canonical name or code"
            className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-950"
          />
        </label>
        <label className="block">
          <span className="text-sm font-bold text-slate-800">Supplier</span>
          <select
            name="supplier"
            defaultValue={preview.filters.supplier}
            className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-950"
          >
            <option value="">All suppliers</option>
            {preview.supplierOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-bold text-slate-800">Mapping status</span>
          <select
            name="mappingStatus"
            defaultValue={preview.filters.mappingStatus}
            className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-950"
          >
            <option value="">All statuses</option>
            <option value="verified">Verified</option>
            <option value="unverified">Unverified</option>
            <option value="disputed">Disputed</option>
            <option value="replaced">Replaced</option>
            <option value="inactive">Inactive</option>
          </select>
        </label>
        <div className="flex items-end gap-2">
          <button type="submit" className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white">
            Filter
          </button>
          {filtersActive ? (
            <Link href="/operations/materials/catalog" className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-700">
              Clear
            </Link>
          ) : null}
        </div>
      </form>

      <section aria-label="Preview result counts" className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Products shown" value={preview.summary.products} />
        <SummaryCard label="Offers shown" value={preview.summary.offers} />
        <SummaryCard label="Latest observations" value={preview.summary.observations} />
        <SummaryCard label="Offers missing price" value={preview.summary.offersMissingPrice} />
      </section>

      {preview.products.length === 0 ? (
        <section className="mt-7 rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <h2 className="text-xl font-black text-slate-950">
            {filtersActive ? "No catalog products match these filters" : "No published supplier observations are available"}
          </h2>
          <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            {filtersActive
              ? "Clear the filters to review the bounded company evidence set."
              : "This preview does not create sample data or substitute legacy prices."}
          </p>
        </section>
      ) : (
        <div className="mt-7 space-y-6">
          {preview.products.map((product, productIndex) => (
            <article key={`${product.displayName}-${productIndex}`} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 p-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-bold uppercase tracking-wide ${product.identityComplete ? "bg-emerald-50 text-emerald-800" : "bg-amber-100 text-amber-900"}`}>
                        {product.identityComplete ? "Canonical identity" : "Legacy identity incomplete"}
                      </span>
                      {product.lifecycleStatus ? <span className="text-xs font-semibold text-slate-500">{label(product.lifecycleStatus)}</span> : null}
                    </div>
                    <h2 className="mt-3 text-2xl font-black text-slate-950">{product.displayName}</h2>
                    {product.legacyDescription ? <p className="mt-1 text-sm text-slate-600">Legacy description: {product.legacyDescription}</p> : null}
                  </div>
                  <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:min-w-[420px]">
                    <Fact term="Product code" detail={product.productCode ?? "Not assigned"} />
                    <Fact term="Legacy SKU" detail={product.legacySku ?? "Not provided"} />
                    <Fact term="Manufacturer" detail={product.manufacturer ?? "Not provided"} />
                    <Fact term="Manufacturer part" detail={product.manufacturerPartNumber ?? "Not provided"} />
                    <Fact term="Category" detail={product.category ?? "Not provided"} />
                    <Fact term="Stocking unit" detail={product.stockingUnit ?? "Not provided"} />
                  </dl>
                </div>
              </div>
              <div className="divide-y divide-slate-200">
                {product.offers.map((offer, offerIndex) => (
                  <OfferCard key={`${offer.supplierSlug}-${offer.supplierSku}-${offerIndex}`} offer={offer} />
                ))}
              </div>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}

function SummaryCard({ label: cardLabel, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{cardLabel}</p>
      <p className="mt-2 text-3xl font-black text-slate-950">{value}</p>
      <p className="mt-1 text-xs text-slate-500">Current bounded page result</p>
    </div>
  );
}

function Fact({ term, detail }: { term: string; detail: string }) {
  return (
    <div>
      <dt className="text-xs font-bold uppercase tracking-wide text-slate-500">{term}</dt>
      <dd className="mt-0.5 font-semibold text-slate-900">{detail}</dd>
    </div>
  );
}

function OfferCard({ offer }: { offer: MaterialCatalogPreviewOffer }) {
  const tone = offer.observation.evidenceTone;
  return (
    <section className="p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-lg font-black text-slate-950">{offer.supplierName}</p>
          <p className="mt-1 text-sm text-slate-600">{offer.location}</p>
          <p className="mt-1 text-xs text-slate-500">Supplier SKU {offer.supplierSku}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge>{offer.mappingStatus}</Badge>
          <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${tone === "current" ? "bg-emerald-50 text-emerald-800" : tone === "warning" ? "bg-amber-100 text-amber-900" : "bg-slate-100 text-slate-700"}`}>
            {offer.observation.evidenceStatus}
          </span>
        </div>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-3">
        <EvidencePanel title="Purchase basis">
          <Fact term="Supplier sell unit" detail={offer.sellUnit} />
          <Fact term="Minimum order" detail={offer.minimumOrderQuantity ? `${offer.minimumOrderQuantity} ${offer.sellUnit}` : "Not provided"} />
          <Fact term="Order increment" detail={offer.orderIncrement ? `${offer.orderIncrement} ${offer.sellUnit}` : "Not provided"} />
          <Fact term="Offer effective" detail={offer.effectiveRange} />
        </EvidencePanel>
        <EvidencePanel title="Published observation">
          <Fact term="Observed" detail={offer.observation.observedLabel} />
          <Fact term="Effective" detail={offer.observation.effectiveRange} />
          <Fact term="Confidence" detail={offer.observation.confidence} />
          <Fact term="Source" detail={offer.observation.sourceType} />
        </EvidencePanel>
        <EvidencePanel title="Availability">
          <Fact term="Status" detail={offer.observation.availability} />
          <Fact term="Inventory" detail={offer.observation.inventory} />
          <Fact term="Lead time" detail={offer.observation.leadTime} />
          <Fact term="Promised date" detail={offer.observation.promisedDate} />
          <Fact term="Delivery cost" detail={offer.observation.delivery} />
        </EvidencePanel>
      </div>

      <div className="mt-5">
        <h3 className="text-sm font-black uppercase tracking-wide text-slate-700">Price components</h3>
        {offer.observation.prices.length === 0 ? (
          <div className="mt-3 rounded-xl border border-dashed border-slate-300 p-5 text-sm text-slate-600">
            Availability was observed, but no price component was published.
          </div>
        ) : (
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            {offer.observation.prices.map((price, priceIndex) => (
              <article key={`${price.price}-${priceIndex}`} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-lg font-black text-slate-950">{price.price}</p>
                  <Badge>{price.priceType}</Badge>
                </div>
                <dl className="mt-3 grid gap-2 sm:grid-cols-2">
                  <Fact term="Tier basis" detail={price.tier} />
                  <Fact term="Tax" detail={price.tax} />
                </dl>
                <p className="mt-3 rounded-lg bg-white p-3 text-sm leading-6 text-slate-700">
                  {price.comparisonExplanation}
                </p>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function EvidencePanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <h3 className="text-sm font-black uppercase tracking-wide text-slate-700">{title}</h3>
      <dl className="mt-3 space-y-2">{children}</dl>
    </section>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">{children}</span>;
}

function label(value: string) {
  return value.replaceAll("_", " ");
}
