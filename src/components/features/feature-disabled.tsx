import Link from "next/link";

type Props = {
  title?: string;
  description?: string;
  backHref?: string;
  backLabel?: string;
};

export default function FeatureDisabled({
  title =
    "Feature unavailable",
  description =
    "This feature has been disabled in the current settings.",
  backHref =
    "/operations",
  backLabel =
    "Return to Operations",
}: Props) {
  return (
    <main className="mx-auto max-w-3xl px-5 py-12">
      <section className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
          Disabled
        </p>

        <h1 className="mt-3 text-3xl font-black text-slate-950">
          {title}
        </h1>

        <p className="mx-auto mt-3 max-w-xl text-slate-600">
          {description}
        </p>

        <Link
          href={backHref}
          className="mt-6 inline-flex rounded-xl bg-blue-950 px-5 py-3 text-sm font-bold text-white"
        >
          {backLabel}
        </Link>
      </section>
    </main>
  );
}
