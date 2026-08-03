import Link from "next/link";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";
import { createAdminServerClient } from "@/lib/supabase/admin-server";

export const dynamic = "force-dynamic";

const openStatuses = ["open", "in_progress"];

export default async function MissionControlPage() {
  const supabase = createAdminServerClient();
  const now = new Date();
  const endToday = new Date(now); endToday.setHours(23, 59, 59, 999);
  const [tasksResult, projectsResult, leadsResult, changesResult, activityResult] = await Promise.all([
    supabase.from("tasks").select("id,title,priority,due_at,project_id,lead_id,status,metadata").in("status", openStatuses).order("due_at", { ascending: true, nullsFirst: false }).limit(40),
    supabase.from("projects").select("id,project_name,status,project_manager_id,start_date,target_completion_date,updated_at").not("status", "in", '("completed","canceled")').order("updated_at", { ascending: false }).limit(12),
    supabase.from("leads").select("id,name,lead_status,consultation_status,follow_up_at,updated_at").order("updated_at", { ascending: false }).limit(40),
    supabase.from("project_change_orders").select("id,project_id,title,status,updated_at").in("status", ["draft", "pending_approval", "revision_requested"]).order("updated_at", { ascending: false }).limit(12),
    supabase.from("lead_activities").select("id,lead_id,summary,occurred_at").order("occurred_at", { ascending: false }).limit(8),
  ]);
  const tasks = tasksResult.data ?? [];
  const urgent = tasks.filter((task) => task.priority === "urgent" || (task.due_at && new Date(task.due_at) < now));
  const today = tasks.filter((task) => task.due_at && new Date(task.due_at) <= endToday);
  const consultations = (leadsResult.data ?? []).filter((lead) => ["requested", "pending", "pending_customer_confirmation", "reschedule_requested"].includes(lead.consultation_status ?? ""));
  const estimates = (leadsResult.data ?? []).filter((lead) => ["estimate_in_progress", "proposal_sent", "customer_reviewing"].includes(lead.lead_status ?? ""));
  const errors = [tasksResult, projectsResult, leadsResult, changesResult, activityResult].filter((result) => result.error);

  return <main className="min-h-screen bg-slate-100 text-slate-950">
    <header className="border-b border-slate-800 bg-slate-950 text-white">
      <div className="mx-auto max-w-[1500px] px-4 py-5 sm:px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div><p className="text-xs font-bold uppercase tracking-[.2em] text-amber-400">McKenzie Construction</p><h1 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">Mission Control</h1><p className="mt-2 text-sm text-slate-300">Everything happening across your business, in one place.</p></div>
          <div className="max-w-full overflow-hidden"><WorkspaceSwitcher /></div>
        </div>
        <nav aria-label="Mission Control" className="mt-5 flex gap-x-5 gap-y-2 overflow-x-auto pb-1 text-sm font-semibold text-slate-200">
          {[["Mission Control","/all-work"],["Leads / Opportunities","/sales/leads"],["Estimates","/sales/estimates"],["Projects","/operations/projects"],["Schedule","/operations/schedule"],["Communications","/operations/messages"],["Team","/admin/team"],["Files","/operations/projects"],["Settings","/admin/settings"]].map(([label, href]) => <Link className="whitespace-nowrap hover:text-amber-300" key={href} href={href}>{label}</Link>)}
        </nav>
      </div>
    </header>
    <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6">
      {errors.length ? <p className="mb-5 border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">Some Mission Control data could not be loaded. Available sections remain current.</p> : null}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Metric label="Urgent follow-ups" value={urgent.length} tone="red" /><Metric label="Due today" value={today.length} /><Metric label="Projects requiring action" value={(projectsResult.data ?? []).length} /><Metric label="Pending estimates" value={estimates.length} /><Metric label="Awaiting confirmation" value={consultations.length} tone="amber" />
      </section>
      <div className="mt-6 grid gap-5 xl:grid-cols-[1.3fr_.7fr]">
        <section className="border border-slate-200 bg-white shadow-sm"><SectionTitle title="Priority work" href="/operations/tasks" />
          <div className="divide-y divide-slate-100">{(urgent.length ? urgent : today).slice(0, 10).map((task) => <ActionRow key={task.id} title={task.title} detail={task.metadata?.prerequisite ? `Prerequisite: ${String(task.metadata.prerequisite)}` : task.due_at ? `Due ${new Date(task.due_at).toLocaleString()}` : "No due date"} href={task.project_id ? `/operations/projects/${task.project_id}` : task.lead_id ? `/sales/leads/${task.lead_id}` : "/operations/tasks"} />)}{!(urgent.length || today.length) ? <Empty text="No urgent or due-today tasks. New workflow actions will appear here automatically." /> : null}</div>
        </section>
        <section className="border border-slate-200 bg-white shadow-sm"><SectionTitle title="Consultations" href="/sales/leads" /><div className="divide-y divide-slate-100">{consultations.slice(0, 7).map((lead) => <ActionRow key={lead.id} title={lead.name ?? "Unnamed lead"} detail={(lead.consultation_status ?? "pending").replaceAll("_", " ")} href={`/sales/leads/${lead.id}`} />)}{!consultations.length ? <Empty text="No consultations are awaiting customer confirmation." /> : null}</div></section>
        <section className="border border-slate-200 bg-white shadow-sm"><SectionTitle title="Projects requiring action" href="/operations/projects" /><div className="divide-y divide-slate-100">{(projectsResult.data ?? []).slice(0, 8).map((project) => <ActionRow key={project.id} title={project.project_name} detail={!project.project_manager_id ? "Project manager required" : project.status.replaceAll("_", " ")} href={`/operations/projects/${project.id}`} />)}{!projectsResult.data?.length ? <Empty text="No active projects require action." /> : null}</div></section>
        <section className="border border-slate-200 bg-white shadow-sm"><SectionTitle title="Estimates & change orders" href="/sales/estimates" /><div className="divide-y divide-slate-100">{estimates.slice(0, 4).map((lead) => <ActionRow key={lead.id} title={lead.name ?? "Unnamed lead"} detail={(lead.lead_status ?? "estimate").replaceAll("_", " ")} href={`/sales/leads/${lead.id}`} />)}{(changesResult.data ?? []).slice(0, 4).map((change) => <ActionRow key={change.id} title={change.title} detail={`Change order: ${change.status.replaceAll("_", " ")}`} href={`/operations/projects/${change.project_id}/change-orders`} />)}{!estimates.length && !changesResult.data?.length ? <Empty text="No estimates or change orders are awaiting action." /> : null}</div></section>
        <section className="border border-slate-200 bg-white shadow-sm xl:col-span-2"><SectionTitle title="Recent activity" href="/sales/leads" /><div className="divide-y divide-slate-100">{(activityResult.data ?? []).map((activity) => <ActionRow key={activity.id} title={activity.summary} detail={new Date(activity.occurred_at).toLocaleString()} href={`/sales/leads/${activity.lead_id}`} />)}{!activityResult.data?.length ? <Empty text="No recent activity has been recorded." /> : null}</div></section>
      </div>
    </div>
  </main>;
}

function Metric({ label, value, tone = "slate" }: { label: string; value: number; tone?: "slate" | "red" | "amber" }) { const classes = tone === "red" ? "border-red-200 text-red-800" : tone === "amber" ? "border-amber-200 text-amber-800" : "border-slate-200 text-slate-950"; return <article className={`border bg-white p-4 shadow-sm ${classes}`}><p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-2 text-3xl font-bold">{value}</p></article>; }
function SectionTitle({ title, href }: { title: string; href: string }) { return <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4"><h2 className="font-bold">{title}</h2><Link href={href} className="text-sm font-semibold text-blue-800 hover:underline">View all</Link></header>; }
function ActionRow({ title, detail, href }: { title: string; detail: string; href: string }) { return <Link href={href} className="flex min-w-0 items-center justify-between gap-4 px-5 py-3 hover:bg-slate-50"><span className="min-w-0"><strong className="block truncate text-sm">{title}</strong><span className="block truncate text-xs capitalize text-slate-500">{detail}</span></span><span aria-hidden className="text-slate-400">→</span></Link>; }
function Empty({ text }: { text: string }) { return <p className="px-5 py-8 text-sm text-slate-500">{text}</p>; }
