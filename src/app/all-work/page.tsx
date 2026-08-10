import { MissionControlDashboard } from "@/components/mission-control-dashboard";
import { createAdminServerClient } from "@/lib/supabase/admin-server";

export const dynamic = "force-dynamic";

const openStatuses = ["open", "in_progress"];

export default async function MissionControlPage() {
  const supabase = createAdminServerClient();
  const now = new Date();
  const endToday = new Date(now);
  endToday.setHours(23, 59, 59, 999);

  const [tasksResult, projectsResult, leadsResult, changesResult, activityResult, inboxResult] =
    await Promise.all([
      supabase
        .from("tasks")
        .select("id,title,priority,due_at,project_id,lead_id,status,metadata")
        .in("status", openStatuses)
        .order("due_at", { ascending: true, nullsFirst: false })
        .limit(40),
      supabase
        .from("projects")
        .select("id,project_name,status,project_manager_id,start_date,target_completion_date,updated_at")
        .not("status", "in", '("completed","canceled")')
        .order("updated_at", { ascending: false })
        .limit(12),
      supabase
        .from("leads")
        .select("id,name,lead_status,consultation_status,follow_up_at,updated_at")
        .order("updated_at", { ascending: false })
        .limit(40),
      supabase
        .from("project_change_orders")
        .select("id,project_id,title,status,updated_at")
        .in("status", ["draft", "pending_approval", "revision_requested"])
        .order("updated_at", { ascending: false })
        .limit(12),
      supabase
        .from("lead_activities")
        .select("id,lead_id,summary,occurred_at")
        .order("occurred_at", { ascending: false })
        .limit(8),
      supabase
        .from("communication_threads")
        .select("id,subject,department,lead_id,unread_count,last_message_at")
        .neq("status", "archived")
        .or("lead_id.not.is.null,customer_id.not.is.null")
        .order("unread_count", { ascending: false })
        .order("last_message_at", { ascending: false })
        .limit(8),
    ]);

  const tasks = tasksResult.data ?? [];
  const projects = projectsResult.data ?? [];
  const leads = leadsResult.data ?? [];
  const overdueTasks = tasks.filter(
    (task) => task.due_at && new Date(task.due_at) < now,
  );
  const dueTodayTasks = tasks.filter(
    (task) =>
      task.due_at &&
      new Date(task.due_at) >= now &&
      new Date(task.due_at) <= endToday,
  );
  const urgentFollowUps = tasks.filter(
    (task) =>
      task.lead_id &&
      (task.priority === "urgent" ||
        (task.due_at && new Date(task.due_at) < now)),
  );
  const projectTasks = tasks.filter((task) => task.project_id);
  const projectBlockers = projects.filter((project) => !project.project_manager_id);
  const consultations = leads.filter((lead) =>
    [
      "requested",
      "pending",
      "pending_customer_confirmation",
      "reschedule_requested",
    ].includes(lead.consultation_status ?? ""),
  );
  const estimates = leads.filter((lead) =>
    ["estimate_in_progress", "proposal_sent", "customer_reviewing"].includes(
      lead.lead_status ?? "",
    ),
  );
  const errors = [
    tasksResult,
    projectsResult,
    leadsResult,
    changesResult,
    activityResult,
    inboxResult,
  ].filter((result) => result.error).length;

  return (
    <MissionControlDashboard
      urgentFollowUps={urgentFollowUps}
      overdueTasks={overdueTasks}
      dueTodayTasks={dueTodayTasks}
      projectTasks={projectTasks}
      projectBlockers={projectBlockers}
      consultations={consultations}
      estimates={estimates}
      changes={changesResult.data ?? []}
      activities={activityResult.data ?? []}
      inboxThreads={inboxResult.data ?? []}
      errorCount={errors}
    />
  );
}
