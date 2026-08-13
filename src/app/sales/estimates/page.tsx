import Link from "next/link";
import { StartEstimateButton } from "@/components/estimates/start-estimate-button";
import { createAdminServerClient } from "@/lib/supabase/admin-server";
import { STRUCTURED_ESTIMATE_CALCULATION_POLICY_VERSIONS } from "@/lib/estimate-calculations";
import { getInternalDeckIntakeAccess } from "@/lib/internal-deck-intake-access";

export const dynamic = "force-dynamic";

export default async function EstimatesPage() {
  const supabase = createAdminServerClient();
  const intakeAccess = await getInternalDeckIntakeAccess();
  const [
    { data, error },
    { data: drafts, error: draftError },
    { data: activeVisits, error: visitError },
  ] = await Promise.all([
    supabase
      .from("leads")
      .select("id, name, project_type, lead_status, updated_at")
      .in("lead_status", [
        "consultation_scheduled",
        "estimate_in_progress",
        "proposal_sent",
        "customer_reviewing",
        "won",
      ])
      .order("updated_at", { ascending: false }),
    supabase
      .from("estimates")
      .select("id, lead_id, status, updated_at")
      .in("status", ["draft", "reviewing", "sent", "viewed"])
      .in(
        "calculation_policy_version",
        STRUCTURED_ESTIMATE_CALCULATION_POLICY_VERSIONS,
      )
      .order("updated_at", { ascending: false }),
    intakeAccess.enabled && intakeAccess.access?.company_id
      ? supabase
          .from("guided_site_visits")
          .select("id,target_estimate_id,started_at")
          .eq("company_id", intakeAccess.access.company_id)
          .eq("status", "in_progress")
          .order("started_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
  ]);
  const activeVisitByEstimate = new Map(
    (activeVisits ?? []).map((visit) => [
      String(visit.target_estimate_id),
      String(visit.id),
    ]),
  );
  const estimateByLead = new Map<string, { id: string; status: string }>();
  for (const estimate of drafts ?? []) {
    const leadId = String(estimate.lead_id);
    if (!estimateByLead.has(leadId)) {
      estimateByLead.set(leadId, {
        id: String(estimate.id),
        status: String(estimate.status),
      });
    }
  }
  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <p className="text-xs font-bold uppercase tracking-[.18em] text-emerald-700">
        Sales
      </p>
      <h1 className="mt-2 text-3xl font-bold text-slate-950">Estimates</h1>
      <p className="mt-2 text-slate-600">
        Consulted opportunities and proposals that are ready for estimating
        action.
      </p>
      {error || draftError || visitError ? (
        <p className="mt-6 border border-red-200 bg-red-50 p-4 text-red-800">
          Unable to load estimates.
        </p>
      ) : null}
      {!error && !data?.length ? (
        <section className="mt-6 border border-dashed border-slate-300 bg-white p-8">
          <h2 className="font-bold">No estimates need action</h2>
          <p className="mt-2 text-sm text-slate-600">
            An opportunity appears here after a consultation is scheduled. Open
            a lead to advance its workflow.
          </p>
        </section>
      ) : null}
      <section className="mt-6 divide-y divide-slate-200 border border-slate-200 bg-white">
        {data?.map((lead) => {
          const estimate = estimateByLead.get(String(lead.id));
          const leadName = lead.name ?? "Unnamed lead";
          const activeVisitId = estimate
            ? activeVisitByEstimate.get(estimate.id)
            : undefined;
          return (
            <article
              key={lead.id}
              className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <span>
                <strong className="block text-slate-950">{leadName}</strong>
                <span className="text-sm text-slate-600">
                  {lead.project_type ?? "Project type not confirmed"}
                </span>
                {activeVisitId ? (
                  <span className="mt-2 block text-sm font-bold text-amber-700">
                    Site visit in progress
                  </span>
                ) : null}
              </span>
              <span className="flex flex-wrap items-center gap-3">
                <span className="text-sm font-semibold text-emerald-800">
                  {estimate?.status === "reviewing"
                    ? "pricing review"
                    : lead.lead_status.replaceAll("_", " ")}
                </span>
                {estimate ? (
                  <Link
                    href={`/sales/estimates/${estimate.id}${activeVisitId ? "?workflow=deck" : ""}`}
                    className="min-h-11 rounded-md bg-slate-950 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800"
                  >
                    {activeVisitId
                      ? "Resume"
                      : estimate.status === "reviewing"
                        ? "Review pricing"
                        : "Open builder"}
                  </Link>
                ) : (
                  <>
                    <Link
                      href={`/sales/leads/${lead.id}`}
                      className="text-sm font-semibold text-slate-700 hover:underline"
                    >
                      Open lead
                    </Link>
                    <StartEstimateButton
                      leadId={String(lead.id)}
                      leadName={leadName}
                    />
                  </>
                )}
              </span>
            </article>
          );
        })}
      </section>
    </main>
  );
}
