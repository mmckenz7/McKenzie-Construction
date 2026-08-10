import Link from "next/link";

type Task = {
  id: string;
  title: string;
  priority: string;
  due_at: string | null;
  project_id: string | null;
  lead_id: string | null;
  status: string;
  metadata: Record<string, unknown> | null;
};

type Project = {
  id: string;
  project_name: string;
  status: string;
  project_manager_id: string | null;
  start_date: string | null;
  target_completion_date: string | null;
  updated_at: string;
};

type Lead = {
  id: string;
  name: string | null;
  lead_status: string | null;
  consultation_status: string | null;
  follow_up_at: string | null;
  updated_at: string;
};

type ChangeOrder = {
  id: string;
  project_id: string;
  title: string;
  status: string;
  updated_at: string;
};

type Activity = {
  id: string;
  lead_id: string;
  summary: string;
  occurred_at: string;
};

type InboxThread = {
  id: string;
  subject: string | null;
  department: string;
  lead_id: string | null;
  unread_count: number;
  last_message_at: string;
};

type DashboardProps = {
  urgentFollowUps: Task[];
  overdueTasks: Task[];
  dueTodayTasks: Task[];
  projectTasks: Task[];
  projectBlockers: Project[];
  consultations: Lead[];
  estimates: Lead[];
  changes: ChangeOrder[];
  activities: Activity[];
  inboxThreads: InboxThread[];
  errorCount: number;
};

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2";

export function MissionControlDashboard({
  urgentFollowUps,
  overdueTasks,
  dueTodayTasks,
  projectTasks,
  projectBlockers,
  consultations,
  estimates,
  changes,
  activities,
  inboxThreads,
  errorCount,
}: DashboardProps) {
  const unreadMessages = inboxThreads.reduce(
    (total, thread) => total + thread.unread_count,
    0,
  );

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#f4f4f2] text-slate-950">
      <header className="border-b border-slate-800 bg-[#171b1e] text-white">
        <div className="mx-auto max-w-[1440px] px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-white/10 bg-white/[.06] text-amber-400">
                <Icon name="mark" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                  McKenzie Construction
                </p>
                <h1 className="truncate text-lg font-semibold tracking-tight sm:text-xl">
                  Mission Control
                </h1>
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-3 border-t border-white/10 pt-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-slate-400">
              Live operational priorities and active work
            </p>
            <nav aria-label="Primary dashboard links" className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:gap-1.5">
              <QuickLink href="/operations/projects" icon="project">Projects</QuickLink>
              <QuickLink href="/sales/estimates" icon="estimate">Estimates</QuickLink>
              <QuickLink href="/operations/tasks" icon="task">Active work</QuickLink>
              <QuickLink href="/sales/communications" icon="mail">Inbox</QuickLink>
            </nav>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1440px] px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
        {errorCount ? (
          <div role="status" className="mb-4 flex items-start gap-3 rounded-md border border-amber-300/70 bg-amber-50 px-4 py-3 text-sm text-amber-950 shadow-sm">
            <Icon name="alert" />
            <p>
              Some live data could not be loaded. Available sections remain current; refresh to try again.
            </p>
          </div>
        ) : null}

        <section aria-label="Operational summary" className="grid grid-cols-2 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,.04)] lg:grid-cols-5">
          <Metric label="Unread replies" value={unreadMessages} tone="warning" />
          <Metric label="Urgent follow-ups" value={urgentFollowUps.length} tone="urgent" />
          <Metric label="Overdue work" value={overdueTasks.length} tone="urgent" />
          <Metric label="Due today" value={dueTodayTasks.length} />
          <Metric label="Project blockers" value={projectBlockers.length} tone="warning" />
        </section>

        <div className="mt-5 grid min-w-0 gap-5 lg:grid-cols-2 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,.75fr)]">
          <div className="grid min-w-0 content-start gap-5">
            <Panel title="Urgent customer follow-ups" eyebrow="Customer response" href="/sales/leads" count={urgentFollowUps.length} icon="customer">
              <TaskRows tasks={urgentFollowUps} empty="No urgent customer follow-ups. New priority follow-ups will appear here." limit={8} tone="urgent" />
            </Panel>

            <Panel title="Overdue and due today" eyebrow="Work queue" href="/operations/tasks" count={overdueTasks.length + dueTodayTasks.length} icon="clock">
              <TaskRows tasks={[...overdueTasks, ...dueTodayTasks.filter((task) => !overdueTasks.some((overdue) => overdue.id === task.id))]} empty="No overdue or due-today work. The active queue is clear." limit={10} />
            </Panel>

            <Panel title="Active project workflow" eyebrow="Field operations" href="/operations/tasks" count={projectTasks.length} icon="task">
              <TaskRows tasks={projectTasks} empty="No active project workflow tasks. Generated next actions will appear here." limit={10} />
            </Panel>
          </div>

          <aside className="grid min-w-0 content-start gap-5">
            <Panel title="Customer inbox" eyebrow="Microsoft 365" href="/sales/communications" count={unreadMessages} icon="mail">
              {inboxThreads.length ? inboxThreads.slice(0, 6).map((thread) => (
                <OperationalRow key={thread.id} href={`/sales/communications/${thread.id}`} title={thread.subject ?? "(No subject)"} detail={`${humanize(thread.department)} · ${formatDateTime(thread.last_message_at)}`} badge={thread.unread_count ? `${thread.unread_count} new` : "Read"} tone={thread.unread_count ? "warning" : "neutral"} />
              )) : <EmptyState icon="mail" title="Inbox is clear" detail="Microsoft 365 customer replies will appear here after synchronization." />}
            </Panel>

            <Panel title="Project blockers" eyebrow="Requires assignment" href="/operations/projects" count={projectBlockers.length} icon="blocker">
              {projectBlockers.length ? projectBlockers.slice(0, 7).map((project) => (
                <OperationalRow key={project.id} href={`/operations/projects/${project.id}`} title={project.project_name} detail="Project manager required" badge={humanize(project.status)} tone="warning" />
              )) : <EmptyState icon="check" title="No assignment blockers" detail="Every active project in this view has a project manager." />}
            </Panel>

            <Panel title="Consultations" eyebrow="Customer action" href="/sales/leads" count={consultations.length} icon="calendar">
              {consultations.length ? consultations.slice(0, 7).map((lead) => (
                <OperationalRow key={lead.id} href={`/sales/leads/${lead.id}`} title={lead.name ?? "Unnamed lead"} detail={lead.follow_up_at ? `Follow up ${formatDate(lead.follow_up_at)}` : "Action required"} badge={humanize(lead.consultation_status ?? "pending")} tone="warning" />
              )) : <EmptyState icon="check" title="Consultations are current" detail="None are awaiting confirmation or rescheduling." />}
            </Panel>

            <Panel title="Estimates & change orders" eyebrow="Commercial work" href="/sales/estimates" count={estimates.length + changes.length} icon="estimate">
              {estimates.slice(0, 4).map((lead) => (
                <OperationalRow key={`estimate-${lead.id}`} href={`/sales/leads/${lead.id}`} title={lead.name ?? "Unnamed lead"} detail="Estimate workflow" badge={humanize(lead.lead_status ?? "estimate")} />
              ))}
              {changes.slice(0, 4).map((change) => (
                <OperationalRow key={`change-${change.id}`} href={`/operations/projects/${change.project_id}/change-orders`} title={change.title} detail="Change order" badge={humanize(change.status)} />
              ))}
              {!estimates.length && !changes.length ? <EmptyState icon="check" title="Commercial queue is clear" detail="No estimates or change orders are awaiting action." /> : null}
            </Panel>
          </aside>
        </div>

        <div className="mt-5">
          <Panel title="Recent meaningful activity" eyebrow="Latest updates" href="/sales/leads" count={activities.length} icon="activity">
            <div className="grid md:grid-cols-2">
              {activities.length ? activities.map((activity) => (
                <OperationalRow key={activity.id} href={`/sales/leads/${activity.lead_id}`} title={activity.summary} detail={formatDateTime(activity.occurred_at)} />
              )) : <div className="md:col-span-2"><EmptyState icon="activity" title="No recent activity" detail="Recorded lead activity will appear here as work progresses." /></div>}
            </div>
          </Panel>
        </div>
      </div>
    </main>
  );
}

function QuickLink({ href, icon, children }: { href: string; icon: IconName; children: React.ReactNode }) {
  return <Link href={href} className={`${focusRing} inline-flex min-h-10 min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-white/10 bg-white/[.04] px-2 text-xs font-semibold text-slate-200 transition last:col-span-2 hover:border-white/20 hover:bg-white/[.08] sm:col-span-1 sm:gap-2 sm:px-3`}><Icon name={icon} /><span className="min-w-0">{children}</span><Icon name="arrow" /></Link>;
}

function Metric({ label, value, tone = "neutral" }: { label: string; value: number; tone?: "neutral" | "urgent" | "warning" }) {
  const valueColor = tone === "urgent" && value ? "text-red-700" : tone === "warning" && value ? "text-amber-700" : "text-slate-950";
  return <div className="border-b border-r border-slate-200 px-4 py-3.5 last:border-r-0 lg:border-b-0 sm:px-5"><p className="text-[10px] font-semibold uppercase tracking-[.14em] text-slate-500">{label}</p><div className="mt-1 flex items-baseline gap-2"><strong className={`text-2xl font-semibold tabular-nums tracking-tight ${valueColor}`}>{value}</strong><span className="text-xs text-slate-400">open</span></div></div>;
}

function Panel({ title, eyebrow, href, count, icon, children }: { title: string; eyebrow: string; href: string; count: number; icon: IconName; children: React.ReactNode }) {
  return <section className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_1px_3px_rgba(15,23,42,.05)]"><header className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3.5 sm:items-center sm:px-5"><div className="flex min-w-0 items-start gap-3 sm:items-center"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-slate-100 text-slate-600"><Icon name={icon} /></span><div className="min-w-0"><p className="text-[9px] font-semibold uppercase tracking-[.16em] text-slate-400">{eyebrow}</p><h2 className="break-words text-sm font-semibold leading-5 text-slate-950 sm:truncate sm:text-base">{title}</h2></div></div><div className="flex shrink-0 items-center gap-2 sm:gap-3"><span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold tabular-nums text-slate-600">{count}</span><Link href={href} className={`${focusRing} inline-flex min-h-10 items-center rounded-sm px-1 text-xs font-semibold text-slate-600 hover:text-slate-950`}>View all<span className="sr-only"> {title}</span></Link></div></header><div className="divide-y divide-slate-100">{children}</div></section>;
}

function TaskRows({ tasks, empty, limit, tone }: { tasks: Task[]; empty: string; limit: number; tone?: "urgent" }) {
  if (!tasks.length) return <EmptyState icon="check" title="Queue is clear" detail={empty} />;
  return tasks.slice(0, limit).map((task) => {
    const href = task.project_id ? `/operations/projects/${task.project_id}` : task.lead_id ? `/sales/leads/${task.lead_id}` : "/operations/tasks";
    const prerequisite = task.metadata?.prerequisite;
    return <OperationalRow key={task.id} href={href} title={task.title} detail={typeof prerequisite === "string" && prerequisite ? `Blocked by: ${prerequisite}` : task.due_at ? formatDue(task.due_at) : "No due date"} badge={task.priority === "urgent" ? "Urgent" : humanize(task.status)} tone={tone ?? (task.priority === "urgent" ? "urgent" : "neutral")} />;
  });
}

function OperationalRow({ href, title, detail, badge, tone = "neutral" }: { href: string; title: string; detail: string; badge?: string; tone?: "neutral" | "urgent" | "warning" }) {
  const dot = tone === "urgent" ? "bg-red-600" : tone === "warning" ? "bg-amber-500" : "bg-slate-400";
  const badgeStyle = tone === "urgent" ? "border-red-200 bg-red-50 text-red-800" : tone === "warning" ? "border-amber-200 bg-amber-50 text-amber-800" : "border-slate-200 bg-slate-50 text-slate-600";
  return <Link href={href} className={`${focusRing} group flex min-w-0 items-center gap-3 px-4 py-3 transition hover:bg-slate-50/80 sm:px-5`}><span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} /><span className="min-w-0 flex-1"><strong className="block truncate text-sm font-medium text-slate-900 group-hover:text-slate-950">{title}</strong><span className="mt-0.5 block truncate text-xs text-slate-500">{detail}</span></span>{badge ? <span className={`hidden max-w-40 truncate rounded border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide sm:block ${badgeStyle}`}>{badge}</span> : null}<span className="shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-500"><Icon name="arrow" /></span></Link>;
}

function EmptyState({ icon, title, detail }: { icon: IconName; title: string; detail: string }) {
  return <div className="flex items-start gap-3 px-4 py-5 sm:px-5"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-slate-200 bg-slate-50 text-slate-400"><Icon name={icon} /></span><div><p className="text-sm font-medium text-slate-700">{title}</p><p className="mt-0.5 text-xs leading-5 text-slate-500">{detail}</p></div></div>;
}

function humanize(value: string) { return value.replaceAll("_", " "); }
function formatDate(value: string) { return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(value)); }
function formatDateTime(value: string) { return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value)); }
function formatDue(value: string) { const date = new Date(value); return `${date < new Date() ? "Overdue" : "Due"} ${formatDateTime(value)}`; }

type IconName = "activity" | "alert" | "arrow" | "blocker" | "calendar" | "check" | "clock" | "customer" | "estimate" | "mail" | "mark" | "project" | "task";
function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, React.ReactNode> = {
    activity: <><path d="M3 12h3l2-5 3 10 2-5h4" /><path d="M19 12h2" /></>,
    alert: <><path d="M12 9v4" /><path d="M12 17h.01" /><path d="m10.3 3.4-8.1 14a2 2 0 0 0 1.7 3h16.2a2 2 0 0 0 1.7-3l-8.1-14a2 2 0 0 0-3.4 0Z" /></>,
    arrow: <><path d="m9 18 6-6-6-6" /></>,
    blocker: <><path d="M5 12h14" /><circle cx="12" cy="12" r="9" /></>,
    calendar: <><path d="M6 2v4M18 2v4M3 9h18" /><rect x="3" y="4" width="18" height="17" rx="2" /></>,
    check: <><path d="m5 12 4 4L19 6" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    customer: <><circle cx="9" cy="8" r="3" /><path d="M3 20c0-4 2-6 6-6s6 2 6 6M16 7h5M18.5 4.5v5" /></>,
    estimate: <><path d="M6 2h9l4 4v16H6z" /><path d="M14 2v5h5M9 12h6M9 16h6" /></>,
    mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>,
    mark: <><path d="M4 19V8l8-5 8 5v11" /><path d="M8 21v-8h8v8M2 21h20" /></>,
    project: <><path d="M3 21h18M5 21V8l7-4 7 4v13" /><path d="M9 21v-6h6v6" /></>,
    task: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="m8 9 1.5 1.5L12 8M14 9h3M8 15h9" /></>,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}
