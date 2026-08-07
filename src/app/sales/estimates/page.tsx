import Link from "next/link";
import { StartEstimateButton } from "@/components/estimates/start-estimate-button";
import { createAdminServerClient } from "@/lib/supabase/admin-server";

export const dynamic = "force-dynamic";

export default async function EstimatesPage() {
  const supabase = createAdminServerClient();
  const [{ data, error }, { data: drafts, error: draftError }] = await Promise.all([
    supabase.from("leads")
      .select("id, name, project_type, lead_status, updated_at")
      .in("lead_status", ["consultation_scheduled", "estimate_in_progress", "proposal_sent", "customer_reviewing", "won"])
      .order("updated_at", { ascending: false }),
    supabase.from("estimates").select("id, lead_id")
      .eq("status", "draft").eq("calculation_policy_version", "structured-estimate-v1"),
  ]);
  const draftByLead = new Map((drafts ?? []).map((draft) => [String(draft.lead_id), String(draft.id)]));
  return <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
    <p className="text-xs font-bold uppercase tracking-[.18em] text-emerald-700">Sales</p>
    <h1 className="mt-2 text-3xl font-bold text-slate-950">Estimates</h1>
    <p className="mt-2 text-slate-600">Consulted opportunities and proposals that are ready for estimating action.</p>
    {error || draftError ? <p className="mt-6 border border-red-200 bg-red-50 p-4 text-red-800">Unable to load estimates.</p> : null}
    {!error && !data?.length ? <section className="mt-6 border border-dashed border-slate-300 bg-white p-8"><h2 className="font-bold">No estimates need action</h2><p className="mt-2 text-sm text-slate-600">An opportunity appears here after a consultation is scheduled. Open a lead to advance its workflow.</p></section> : null}
    <section className="mt-6 divide-y divide-slate-200 border border-slate-200 bg-white">{data?.map((lead) => {
      const estimateId = draftByLead.get(String(lead.id));
      const leadName = lead.name ?? "Unnamed lead";
      return <article key={lead.id} className="flex flex-wrap items-center justify-between gap-4 p-4"><span><strong className="block text-slate-950">{leadName}</strong><span className="text-sm text-slate-600">{lead.project_type ?? "Project type not confirmed"}</span></span><span className="flex items-center gap-3"><span className="text-sm font-semibold text-emerald-800">{lead.lead_status.replaceAll("_", " ")}</span>{estimateId ? <Link href={`/sales/estimates/${estimateId}`} className="rounded-md bg-slate-950 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800">Open builder</Link> : <><Link href={`/sales/leads/${lead.id}`} className="text-sm font-semibold text-slate-700 hover:underline">Open lead</Link><StartEstimateButton leadId={String(lead.id)} leadName={leadName} /></>}</span></article>;
    })}</section>
  </main>;
}
