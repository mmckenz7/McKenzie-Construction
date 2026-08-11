import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthenticatedAccess, hasManagementAccess } from "@/lib/api-auth";

export default async function SettingsPage() {
  const access = await getAuthenticatedAccess();
  if (!access || !hasManagementAccess(access.teamMember.roles)) redirect("/admin");
  const items = [
    ["Company Branding", "Set the logo and colors used by the shared platform shell.", "/admin/settings/branding"],
    ["Estimate Presentation", "Set the default detail level and how OH&P appears to customers.", "/admin/settings/estimates"],
    ["Legal Documents", "Upload and manage company contracts, warranties, terms, and legal document versions.", "/admin/settings/legal-documents"],
    ["Email & Phone", "Connect delivery providers and control approved communication automation.", "/admin/settings/communications"],
    ["Workflow & Task Settings", "Task types, assignment defaults, due-date rules, and business hours.", "/admin/settings/tasks"],
    ["Feature Settings", "Company and workspace feature availability.", "/admin/settings/features"],
    ["Procurement Settings", "Material pricing and procurement defaults.", "/admin/settings/procurement"],
  ];
  return <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
    <p className="text-xs font-bold uppercase tracking-[.18em] text-amber-700">Administration</p>
    <h1 className="mt-2 text-3xl font-bold text-slate-950">Company Settings</h1>
    <p className="mt-2 text-slate-600">Administrative configuration is kept separate from daily operational work.</p>
    <section className="mt-7 grid gap-4 md:grid-cols-3">{items.map(([title, description, href]) =>
      <Link key={href} href={href} className="border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-400">
        <h2 className="font-bold text-slate-950">{title}</h2><p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
      </Link>)}</section>
  </main>;
}
