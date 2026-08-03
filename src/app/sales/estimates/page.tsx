import Link from "next/link";
import { createAdminServerClient } from "@/lib/supabase/admin-server";

export const dynamic = "force-dynamic";

export default async function EstimatesPage() {
  const supabase = createAdminServerClient();
  const { data, error } = await supabase.from("leads")
    .select("id, name, project_type, lead_status, updated_at")
    .in("lead_status", ["consultation_scheduled", "estimate_in_progress", "proposal_sent", "customer_reviewing", "won"])
    .order("updated_at", { ascending: false });
  return <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
    <p className="text-xs font-bold uppercase tracking-[.18em] text-emerald-700">Sales</p>
    <h1 className="mt-2 text-3xl font-bold text-slate-950">Estimates</h1>
    <p className="mt-2 text-slate-600">Consulted opportunities and proposals that are ready for estimating action.</p>
    {error ? <p className="mt-6 border border-red-200 bg-red-50 p-4 text-red-800">Unable to load estimates: {error.message}</p> : null}
    {!error && !data?.length ? <section className="mt-6 border border-dashed border-slate-300 bg-white p-8"><h2 className="font-bold">No estimates need action</h2><p className="mt-2 text-sm text-slate-600">An opportunity appears here after a consultation is scheduled. Open a lead to advance its workflow.</p></section> : null}
    <section className="mt-6 divide-y divide-slate-200 border border-slate-200 bg-white">{data?.map((lead) => <Link key={lead.id} href={`/sales/leads/${lead.id}`} className="flex items-center justify-between gap-4 p-4 hover:bg-slate-50"><span><strong className="block text-slate-950">{lead.name ?? "Unnamed lead"}</strong><span className="text-sm text-slate-600">{lead.project_type ?? "Project type not confirmed"}</span></span><span className="text-sm font-semibold text-emerald-800">{lead.lead_status.replaceAll("_", " ")}</span></Link>)}</section>
  </main>;
}
