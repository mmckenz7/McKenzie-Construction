import Link from "next/link";

import { ProjectCostManager } from "@/components/project-cost-manager";
import { ProjectMaterialPhases } from "@/components/project-material-phases";
import { ProjectScheduleReadiness } from "@/components/project-schedule-readiness";
import { createAdminServerClient } from "@/lib/supabase/admin-server";

export const dynamic = "force-dynamic";

type ProjectPageProps = {
  params: Promise<{ projectId: string }>;
};

type ProjectRecord = {
  id: string;
  customer_id: string;
  project_name: string;
  project_type: string | null;
  description: string | null;
  property_address: string | null;
  status: string;
  project_manager_id: string | null;
  estimated_value: number | null;
  contract_value: number | null;
  start_date: string | null;
  target_completion_date: string | null;
  notes: string | null;
  updated_at: string;
};

function label(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function money(value: number | null) {
  return value === null
    ? "—"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      }).format(value);
}

function date(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00`));
}

export default async function ProjectWorkspacePage({ params }: ProjectPageProps) {
  const { projectId } = await params;
  const supabase = createAdminServerClient();
  const projectResult = await supabase
    .from("projects")
    .select(`
      id,
      customer_id,
      project_name,
      project_type,
      description,
      property_address,
      status,
      project_manager_id,
      estimated_value,
      contract_value,
      start_date,
      target_completion_date,
      notes,
      updated_at
    `)
    .eq("id", projectId)
    .maybeSingle();

  if (projectResult.error || !projectResult.data) {
    return (
      <main className="mx-auto max-w-4xl px-6 py-10">
        <section className="border border-red-900/60 bg-red-950/30 p-6">
          <h1 className="text-xl font-bold text-white">Project could not be opened</h1>
          <p className="mt-2 text-sm text-red-200">
            {projectResult.error?.message ?? "This project no longer exists."}
          </p>
          <Link href="/operations/projects" className="mt-5 inline-flex bg-white px-4 py-2 text-sm font-bold text-slate-950">
            Return to projects
          </Link>
        </section>
      </main>
    );
  }

  const project = projectResult.data as ProjectRecord;
  const [customerResult, managerResult] = await Promise.all([
    supabase
      .from("customers")
      .select("customer_name, email, phone")
      .eq("id", project.customer_id)
      .maybeSingle(),
    project.project_manager_id
      ? supabase
          .from("team_members")
          .select("name")
          .eq("id", project.project_manager_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  const customer = customerResult.data;
  const manager = managerResult.data;

  return (
    <main className="mx-auto max-w-[1500px] space-y-7 px-5 py-8 lg:px-8">
      <nav className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
        <Link href="/operations/projects" className="font-semibold text-blue-700 hover:text-blue-900">
          Projects
        </Link>
        <span>/</span>
        <span>{project.project_name}</span>
      </nav>

      <header className="border border-slate-200 bg-white p-6 shadow-sm lg:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-xs font-bold uppercase tracking-[.18em] text-blue-500">
                {project.project_type ?? "Project"}
              </p>
              <span className="rounded-full bg-blue-950 px-3 py-1 text-xs font-bold text-blue-200">
                {label(project.status)}
              </span>
            </div>
            <h1 className="mt-3 text-3xl font-bold text-slate-950 lg:text-4xl">{project.project_name}</h1>
            <p className="mt-2 text-sm text-slate-600">
              {customer?.customer_name ?? "Unknown customer"}
              {project.property_address ? ` · ${project.property_address}` : ""}
            </p>
            {project.description ? <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-600">{project.description}</p> : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`/operations/projects/${projectId}/activity`} className="border border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-800">Activity</Link>
            <Link href={`/operations/projects/${projectId}/team`} className="border border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-800">Team</Link>
            <Link href={`/operations/projects/${projectId}/change-orders`} className="bg-blue-600 px-4 py-2.5 text-sm font-bold text-white">Change orders</Link>
          </div>
        </div>

        <dl className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          {[
            ["Contract", money(project.contract_value)],
            ["Estimate", money(project.estimated_value)],
            ["Manager", manager?.name ?? "Unassigned"],
            ["Start", date(project.start_date)],
            ["Target", date(project.target_completion_date)],
            ["Customer contact", customer?.email ?? customer?.phone ?? "—"],
          ].map(([term, value]) => (
            <div key={term} className="border border-slate-200 bg-slate-50 p-4">
              <dt className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{term}</dt>
              <dd className="mt-2 break-words text-sm font-bold text-slate-900">{value}</dd>
            </div>
          ))}
        </dl>
      </header>

      <section id="costs" className="scroll-mt-24">
        <div className="mb-4">
          <p className="text-xs font-bold uppercase tracking-[.15em] text-emerald-700">Job financials</p>
          <h2 className="mt-2 text-2xl font-bold text-slate-950">Costs, payments, and projected margin</h2>
          <p className="mt-2 text-sm text-slate-600">Enter real job costs here; the project and financial dashboards use the same ledger.</p>
        </div>
        <ProjectCostManager projectId={projectId} />
      </section>

      <ProjectMaterialPhases projectId={projectId} />
      <ProjectScheduleReadiness projectId={projectId} />

      <section className="grid gap-4 md:grid-cols-3">
        <Link href={`/operations/projects/${projectId}/team`} className="border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-widest text-blue-500">People</p>
          <h2 className="mt-2 text-lg font-bold">Internal team and trade partners</h2>
        </Link>
        <Link href={`/operations/projects/${projectId}/inspections`} className="border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-widest text-amber-500">Quality</p>
          <h2 className="mt-2 text-lg font-bold">Inspections and corrections</h2>
        </Link>
        <Link href={`/operations/projects/${projectId}/change-orders`} className="border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-widest text-violet-500">Scope</p>
          <h2 className="mt-2 text-lg font-bold">Change orders and approvals</h2>
        </Link>
      </section>
    </main>
  );
}
