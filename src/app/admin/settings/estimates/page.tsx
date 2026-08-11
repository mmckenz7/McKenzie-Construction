import { redirect } from "next/navigation";

import { CompanyEstimateSettingsForm } from "@/components/company-estimate-settings-form";
import { getAuthenticatedAccess, hasManagementAccess } from "@/lib/api-auth";

export default async function EstimateSettingsPage() {
  const access = await getAuthenticatedAccess();
  if (!access || !hasManagementAccess(access.teamMember.roles)) redirect("/admin");
  return <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6"><p className="text-xs font-bold uppercase tracking-[.18em] text-blue-500">Sales defaults</p><h1 className="mt-2 text-3xl font-bold text-slate-950">Estimate presentation</h1><p className="mt-2 max-w-3xl text-slate-600">Choose what new estimates show customers. The private cost sheet and markup controls do not change.</p><div className="mt-7"><CompanyEstimateSettingsForm /></div></main>;
}
