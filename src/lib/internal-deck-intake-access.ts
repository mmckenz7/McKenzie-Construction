import "server-only";

import { getServerFeatureMap } from "@/lib/features/server";
import { getWorkspaceAccess } from "@/lib/workspace-access";

const ALLOWED_ROLES = new Set(["owner", "administrator", "estimator"]);

export async function getInternalDeckIntakeAccess() {
  const workspace = await getWorkspaceAccess();

  if (
    !workspace.access ||
    workspace.access.portal_access?.sales !== true ||
    workspace.access.permissions?.edit_prices !== true ||
    workspace.access.permissions?.capture_site_visits !== true ||
    !ALLOWED_ROLES.has(workspace.access.role)
  ) {
    return { access: workspace.access, enabled: false };
  }

  try {
    const features = await getServerFeatureMap({
      scopeType: "global",
      scopeId: "default",
    });

    return {
      access: workspace.access,
      enabled:
        features.estimates &&
        features.ai_estimator &&
        features.guided_site_visits,
    };
  } catch {
    return { access: workspace.access, enabled: false };
  }
}
