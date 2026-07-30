import type { SupabaseClient } from "@supabase/supabase-js";

export type CompanyAssignmentSettings = {
  automatically_assign_new_leads: boolean;
  automatically_assign_new_tasks: boolean;
  automatically_assign_converted_projects: boolean;
  allow_unassigned_leads: boolean;
  allow_unassigned_tasks: boolean;
  require_responsible_person: boolean;
  require_task_assignee: boolean;
  require_project_manager: boolean;
  default_lead_owner_id: string | null;
  default_estimator_id: string | null;
  default_project_manager_id: string | null;
};

export type TaskAssignmentStrategy =
  | "specific_employee"
  | "lead_owner"
  | "default_lead_owner"
  | "default_estimator"
  | "default_project_manager"
  | "unassigned";

type TeamMemberRecord = {
  id: string;
  status: string;
};

type ResolveTaskAssigneeOptions = {
  settings: CompanyAssignmentSettings;
  assignmentStrategy: TaskAssignmentStrategy;
  defaultAssigneeId?: string | null;
  leadOwnerId?: string | null;
};

export async function getActiveTeamMember(
  supabase: SupabaseClient,
  teamMemberId: string | null | undefined,
): Promise<TeamMemberRecord | null> {
  if (!teamMemberId) {
    return null;
  }

  const { data, error } = await supabase
    .from("team_members")
    .select("id, status")
    .eq("id", teamMemberId)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Unable to validate team member ${teamMemberId}: ${error.message}`,
    );
  }

  if (!data || data.status !== "active") {
    return null;
  }

  return data as TeamMemberRecord;
}

export async function validateActiveAssignee(
  supabase: SupabaseClient,
  teamMemberId: string | null | undefined,
): Promise<string | null> {
  const teamMember = await getActiveTeamMember(
    supabase,
    teamMemberId,
  );

  return teamMember?.id ?? null;
}

export async function resolveLeadOwner(
  supabase: SupabaseClient,
  settings: CompanyAssignmentSettings,
): Promise<string | null> {
  if (!settings.automatically_assign_new_leads) {
    return null;
  }

  return validateActiveAssignee(
    supabase,
    settings.default_lead_owner_id,
  );
}

export async function resolveTaskAssignee(
  supabase: SupabaseClient,
  options: ResolveTaskAssigneeOptions,
): Promise<string | null> {
  const {
    settings,
    assignmentStrategy,
    defaultAssigneeId,
    leadOwnerId,
  } = options;

  if (!settings.automatically_assign_new_tasks) {
    return null;
  }

  switch (assignmentStrategy) {
    case "specific_employee":
      return validateActiveAssignee(
        supabase,
        defaultAssigneeId,
      );

    case "lead_owner": {
      const activeLeadOwner = await validateActiveAssignee(
        supabase,
        leadOwnerId,
      );

      if (activeLeadOwner) {
        return activeLeadOwner;
      }

      return validateActiveAssignee(
        supabase,
        settings.default_lead_owner_id,
      );
    }

    case "default_lead_owner":
      return validateActiveAssignee(
        supabase,
        settings.default_lead_owner_id,
      );

    case "default_estimator": {
      const activeEstimator = await validateActiveAssignee(
        supabase,
        settings.default_estimator_id,
      );

      if (activeEstimator) {
        return activeEstimator;
      }

      return validateActiveAssignee(
        supabase,
        leadOwnerId ?? settings.default_lead_owner_id,
      );
    }

    case "default_project_manager":
      return validateActiveAssignee(
        supabase,
        settings.default_project_manager_id,
      );

    case "unassigned":
      return null;

    default:
      return null;
  }
}

export async function resolveProjectManager(
  supabase: SupabaseClient,
  settings: CompanyAssignmentSettings,
  selectedProjectManagerId?: string | null,
): Promise<string | null> {
  const activeSelectedManager = await validateActiveAssignee(
    supabase,
    selectedProjectManagerId,
  );

  if (!settings.automatically_assign_converted_projects) {
    return activeSelectedManager;
  }

  const activeDefaultManager = await validateActiveAssignee(
    supabase,
    settings.default_project_manager_id,
  );

  return activeDefaultManager ?? activeSelectedManager;
}

export function leadOwnerIsRequired(
  settings: CompanyAssignmentSettings,
): boolean {
  return (
    settings.require_responsible_person ||
    !settings.allow_unassigned_leads
  );
}

export function taskAssigneeIsRequired(
  settings: CompanyAssignmentSettings,
): boolean {
  return (
    settings.require_task_assignee ||
    !settings.allow_unassigned_tasks
  );
}

export function projectManagerIsRequired(
  settings: CompanyAssignmentSettings,
): boolean {
  return settings.require_project_manager;
}