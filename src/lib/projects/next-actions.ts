export type ProjectActionInput = {
  id: string;
  projectName: string;
  status: string;
  projectType: string | null;
  description: string | null;
  propertyAddress: string | null;
  projectManagerId: string | null;
  estimatedValue: number | null;
  contractValue: number | null;
  startDate: string | null;
  targetCompletionDate: string | null;
  externalPartyCount?: number;
  subcontractorScheduleEligible?: boolean;
  vendorBidEligible?: boolean;
  materialPhaseCount?: number;
  hasOpenChangeOrder?: boolean;
};

export type ProjectNextAction = {
  key: string;
  title: string;
  description: string;
  prerequisite: string | null;
  priority: "normal" | "high";
};

export function selectCanonicalGeneratedTasks(tasks: Array<{ id: string; status: string; created_at?: string | null }>) {
  const active = tasks.filter((task) => ["open", "in_progress"].includes(task.status));
  const candidates = active.length ? active : tasks;
  return [...candidates].sort((a, b) => String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")) || a.id.localeCompare(b.id))[0] ?? null;
}

export function projectNextActions(project: ProjectActionInput): ProjectNextAction[] {
  if (["completed", "canceled"].includes(project.status)) return [];
  const actions: ProjectNextAction[] = [];
  const add = (action: ProjectNextAction) => actions.push(action);
  if (!project.projectType || !project.description || !project.propertyAddress) add({ key: "confirm_project_details", title: "Confirm project details", description: "Complete the scope, project type, and jobsite details.", prerequisite: null, priority: "high" });
  if (!project.projectManagerId) add({ key: "assign_internal_team", title: "Assign internal team", description: "Assign an active project manager before scheduling field work.", prerequisite: null, priority: "high" });
  if (!project.externalPartyCount) add({ key: "add_project_partners", title: "Add subcontractors or vendors", description: "Connect the external trades and vendors needed for this project.", prerequisite: null, priority: "normal" });
  if (!project.estimatedValue && !project.contractValue) add({ key: "prepare_estimate", title: "Create or complete estimate", description: "Prepare the project estimate before customer approval and scheduling.", prerequisite: "Project scope must be confirmed.", priority: "high" });
  if (!project.materialPhaseCount) add({ key: "identify_material_decisions", title: "Identify material decisions", description: "Add material phases and identify selections that require customer input.", prerequisite: "Project scope must be confirmed.", priority: "normal" });
  if (!project.startDate || !project.targetCompletionDate) add({ key: "create_initial_schedule", title: "Create initial schedule", description: "Set the planned start and target completion dates.", prerequisite: project.projectManagerId ? null : "Assign an internal project manager first.", priority: "high" });
  if (project.subcontractorScheduleEligible) {
    add({ key: "request_subcontractor_schedule", title: "Request subcontractor schedule", description: "Request availability from assigned subcontractors.", prerequisite: "Assign a subcontractor with schedule workflow access.", priority: "normal" });
  }
  if (project.vendorBidEligible) {
    add({ key: "request_vendor_bid", title: "Request supplier or vendor bid", description: "Request pricing from an assigned supplier or vendor.", prerequisite: "Assign a vendor with bid workflow access.", priority: "normal" });
  }
  if (project.hasOpenChangeOrder) add({ key: "prepare_change_order", title: "Prepare change order", description: "Complete scope, pricing, and customer approval for the open change order.", prerequisite: null, priority: "high" });
  return actions;
}
