import { projectNextActions, selectCanonicalGeneratedTasks, type ProjectActionInput } from "@/lib/projects/next-actions";

type DatabaseClient = any;

export async function reconcileProjectNextActions(
  supabase: DatabaseClient,
  project: ProjectActionInput & { customerId: string; projectManagerId: string | null },
) {
  const desired = projectNextActions(project);
  const { data: existing, error: readError } = await supabase
    .from("tasks")
    .select("id, status, metadata, created_at")
    .eq("project_id", project.id)
    .eq("source_type", "project_next_action");
  if (readError) throw readError;

  const existingByKey = new Map<string, any[]>();
  for (const task of existing ?? []) {
    const key = task.metadata?.automation_key;
    if (typeof key === "string") existingByKey.set(key, [...(existingByKey.get(key) ?? []), task]);
  }

  const canonicalByKey = new Map<string, any>();
  const duplicateIds: string[] = [];
  for (const [key, tasks] of existingByKey) {
    const active = tasks.filter((task) => ["open", "in_progress"].includes(task.status));
    const canonical = selectCanonicalGeneratedTasks(tasks);
    canonicalByKey.set(key, canonical);
    for (const task of active.filter((task) => task.id !== canonical?.id)) duplicateIds.push(task.id);
  }

  const desiredKeys = new Set(desired.map((action) => action.key));
  const now = new Date().toISOString();
  const inserts = desired
    .filter((action) => !canonicalByKey.has(action.key))
    .map((action) => ({
      project_id: project.id,
      customer_id: project.customerId,
      assigned_to_id: project.projectManagerId,
      assigned_at: project.projectManagerId ? now : null,
      task_type: action.key,
      title: action.title,
      description: action.description,
      category: "project",
      status: "open",
      priority: action.priority,
      source_type: "project_next_action",
      metadata: {
        automation_key: action.key,
        prerequisite: action.prerequisite,
        generated_for_project_state: project.status,
      },
    }));

  if (inserts.length) {
    const { error } = await supabase.from("tasks").insert(inserts);
    if (error) throw error;
  }

  const obsoleteIds = (existing ?? [])
    .filter((task: any) => ["open", "in_progress"].includes(task.status))
    .filter((task: any) => !desiredKeys.has(task.metadata?.automation_key))
    .map((task: any) => task.id);
  const closeIds = [...new Set([...obsoleteIds, ...duplicateIds])];
  if (closeIds.length) {
    const { error } = await supabase.from("tasks").update({
      status: "canceled",
      canceled_at: now,
      completion_note: "Closed automatically because this next action is no longer relevant.",
    }).in("id", closeIds);
    if (error) throw error;
  }

  return { created: inserts.length, closed: closeIds.length, desired };
}
