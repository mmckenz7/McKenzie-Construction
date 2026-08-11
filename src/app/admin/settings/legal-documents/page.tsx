import { redirect } from "next/navigation";

import { CompanyLegalDocumentsManager } from "@/components/company-legal-documents-manager";
import { getAuthenticatedAccess, hasManagementAccess } from "@/lib/api-auth";

export default async function LegalDocumentsSettingsPage() {
  const access = await getAuthenticatedAccess();
  if (!access || !hasManagementAccess(access.teamMember.roles)) redirect("/admin");
  return <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
    <p className="text-xs font-bold uppercase tracking-[.18em] text-blue-500">Company governance</p>
    <h1 className="mt-2 text-3xl font-bold text-slate-950">Legal documents</h1>
    <p className="mt-2 max-w-3xl text-slate-600">Upload and version company contracts, warranties, change-order terms, privacy documents, and other legal forms.</p>
    <div className="mt-7"><CompanyLegalDocumentsManager /></div>
  </main>;
}
