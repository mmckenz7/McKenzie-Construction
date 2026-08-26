import { isInternalPushRecipient, sendPushTestToUser } from "@/lib/communications/web-push";
import { canAccessWorkspace, getWorkspaceAccess } from "@/lib/workspace-access";

export async function POST() {
  const workspace = await getWorkspaceAccess();
  if (!workspace.user) return Response.json({ success: false, error: "Sign in to test phone notifications." }, { status: 401 });
  if (!canAccessWorkspace(workspace.access, "sales")) {
    return Response.json({ success: false, error: "Sales access is required for Company Inbox notifications." }, { status: 403 });
  }
  const email = workspace.access?.email ?? workspace.user.email;
  if (!isInternalPushRecipient(email)) {
    return Response.json({ success: false, error: "Phone notifications are currently limited to the info account." }, { status: 403 });
  }
  const result = await sendPushTestToUser(workspace.user.id, email);
  if (!result.configured) return Response.json({ success: false, error: "Phone notifications are not configured on this deployment." }, { status: 503 });
  if (result.attempted < 1) return Response.json({ success: false, error: "No active phone notification subscription was found." }, { status: 409 });
  if (result.delivered < 1) {
    const providerStatus = result.rejectedStatusCodes.filter(Boolean).join(", ");
    return Response.json({
      success: false,
      error: providerStatus
        ? `The phone push service rejected the test (status ${providerStatus}). Re-enable notifications on this device, then try once more.`
        : "The phone push service rejected the test. Re-enable notifications on this device, then try once more.",
    }, { status: 502 });
  }
  return Response.json({ success: true });
}
