export type ProjectTaskReference = {
  id: string;
  project_id: string | null;
};

export type InspectionProjectAccess = {
  teamMemberId: string;
  roles: string[];
};

export type InspectionProjectReference = {
  project_manager_id: string | null;
};

export const INSPECTION_PROJECT_FORBIDDEN_BODY = {
  success: false as const,
  error:
    "You do not have access to this project.",
};

export function canAccessInspectionProject(
  access: InspectionProjectAccess,
  project: InspectionProjectReference | null,
) {
  if (!project) {
    return false;
  }

  const hasManagementRole =
    access.roles.some((role) =>
      [
        "owner",
        "admin",
        "administrator",
      ].includes(role),
    );

  return (
    hasManagementRole ||
    project.project_manager_id ===
      access.teamMemberId
  );
}

export function taskBelongsToProject(
  task: ProjectTaskReference | null,
  projectId: string,
) {
  return Boolean(
    task &&
      task.id &&
      task.project_id === projectId,
  );
}
