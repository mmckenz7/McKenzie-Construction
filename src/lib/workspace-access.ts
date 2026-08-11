import { getAuthenticatedApiUser } from "@/lib/api-auth";
import { createAdminServerClient } from "@/lib/supabase/admin-server";

export type WorkspaceName =
  | "sales"
  | "operations"
  | "admin"
  | "subcontractor";

export type EffectiveWorkspaceAccess = {
  user_id: string;
  auth_user_id: string;
  company_id: string;
  display_name: string | null;
  email: string | null;
  phone: string | null;
  role: string;
  default_portal: WorkspaceName;
  preferred_language: "en" | "es";
  portal_access: Partial<
    Record<WorkspaceName, boolean>
  >;
  permissions: Record<string, boolean>;
};

export async function getWorkspaceAccess() {
  const user =
    await getAuthenticatedApiUser();

  if (!user) {
    return {
      user: null,
      access: null,
    };
  }

  const supabase =
    createAdminServerClient();

  const { data, error } = await supabase.rpc(
    "get_effective_user_access",
    {
      requested_auth_user_id: user.id,
    },
  );

  if (error || !data) {
    return {
      user,
      access: null,
    };
  }

  return {
    user,
    access:
      data as EffectiveWorkspaceAccess,
  };
}

export function canAccessWorkspace(
  access: EffectiveWorkspaceAccess | null,
  workspace: WorkspaceName,
) {
  return access?.portal_access?.[workspace] === true;
}

export function countInternalWorkspaces(
  access: EffectiveWorkspaceAccess | null,
) {
  return (
    ["sales", "operations", "admin"] as const
  ).filter(
    (workspace) =>
      access?.portal_access?.[workspace] ===
      true,
  ).length;
}
