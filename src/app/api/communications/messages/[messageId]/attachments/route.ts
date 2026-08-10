import {
  getMatchedMicrosoftMessageLocation,
  listMicrosoftMessageAttachments,
} from "@/lib/communications/microsoft-attachments";
import { createAdminServerClient } from "@/lib/supabase/admin-server";
import { canAccessWorkspace, getWorkspaceAccess } from "@/lib/workspace-access";

export async function GET(
  _request: Request,
  context: { params: Promise<{ messageId: string }> },
) {
  const workspace = await getWorkspaceAccess();
  if (!workspace.user) {
    return Response.json({ success: false, error: "Sign in to view attachments." }, { status: 401 });
  }
  if (!canAccessWorkspace(workspace.access, "sales")) {
    return Response.json({ success: false, error: "Sales access is required to view attachments." }, { status: 403 });
  }

  const { messageId } = await context.params;
  const supabase = createAdminServerClient();
  const location = await getMatchedMicrosoftMessageLocation(supabase, messageId);
  if (!location) {
    return Response.json({ success: false, error: "The matched message could not be found." }, { status: 404 });
  }

  try {
    const attachments = await listMicrosoftMessageAttachments(supabase, location);
    return Response.json(
      { success: true, attachments },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return Response.json(
      { success: false, error: "Attachments could not be loaded from Microsoft 365." },
      { status: 502 },
    );
  }
}
