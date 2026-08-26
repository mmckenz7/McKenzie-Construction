import { redirect } from "next/navigation";

import { CompanyBrandingForm } from "@/components/company-branding-form";
import { getAuthenticatedAccess, hasManagementAccess } from "@/lib/api-auth";

export default async function BrandingSettingsPage() {
  const access = await getAuthenticatedAccess();
  if (!access || !hasManagementAccess(access.teamMember.roles)) redirect("/admin");
  return <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6"><p className="text-xs font-bold uppercase tracking-[.18em] text-blue-500">Appearance</p><h1 className="mt-2 text-3xl font-bold text-slate-950">Company branding</h1><p className="mt-2 max-w-3xl text-slate-600">Manage the shared logo and colors, then choose the company-wide automatic email-signature layout. Employee contact facts continue to come from each employee profile.</p><div className="mt-7"><CompanyBrandingForm /></div></main>;
}
