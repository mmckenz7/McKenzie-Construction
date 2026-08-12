import Link from "next/link";

import { EstimateBuilder } from "@/components/estimates/estimate-builder";

export const dynamic = "force-dynamic";

export default async function EstimateBuilderPage({
  params,
  searchParams,
}: {
  params: Promise<{ estimateId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { estimateId } = await params;
  const query = await searchParams;
  return <main className="mx-auto max-w-[1500px] px-4 py-8 sm:px-6">
    <Link href="/sales/estimates" className="text-sm font-semibold text-emerald-800 hover:underline">← Back to estimates</Link>
    <EstimateBuilder
      estimateId={estimateId}
      showFenceWorkflow={query.workflow === "fence"}
      showDeckWorkflow={query.workflow === "deck"}
    />
  </main>;
}
