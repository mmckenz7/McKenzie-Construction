export type ChangeOrderProjectAccess = {
  teamMemberId: string;
  roles: string[];
};

export type ChangeOrderProjectReference = {
  project_manager_id: string | null;
};

export type ChangeOrderReference = {
  id: string;
  project_id: string;
};

export type ChangeOrderPermissionAccess = {
  permissions?: Record<
    string,
    boolean
  >;
};

export function canAccessChangeOrderProject(
  access: ChangeOrderProjectAccess,
  project: ChangeOrderProjectReference | null,
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

export function changeOrderBelongsToProject(
  changeOrder: ChangeOrderReference | null,
  projectId: string,
) {
  return Boolean(
    changeOrder &&
      changeOrder.id &&
      changeOrder.project_id ===
        projectId,
  );
}

export function hasChangeOrderPermission(
  access: ChangeOrderPermissionAccess,
  permission: string,
) {
  return access.permissions?.[permission] ===
    true;
}

export function isCustomerDecisionStatus(
  status: unknown,
): status is "approved" | "declined" {
  return (
    status === "approved" ||
    status === "declined"
  );
}

export function filterChangeOrderFinancialFields<
  T,
>(value: T, canViewCosts: boolean): T {
  if (
    canViewCosts ||
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return value;
  }

  const {
    costAmount: _costAmount,
    cost_amount: _costAmountDatabase,
    profit: _profit,
    profitAmount: _profitAmount,
    profit_amount: _profitAmountDatabase,
    ...visibleFields
  } = value as Record<string, unknown>;

  return visibleFields as T;
}
