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
  if (result.delivered < 1) return Response.json({ success: false, error: "No active phone notification subscription was found." }, { status: 409 });
  return Response.json({ success: true });
}
