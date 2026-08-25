import {
  downloadMicrosoftMessageAttachment,
  getMatchedMicrosoftMessageLocation,
  listMicrosoftMessageAttachments,
} from "@/lib/communications/microsoft-attachments";
import { safeAttachmentFilename } from "@/lib/communications/microsoft-attachment-core";
import { communicationWorkspaceMatchesSingletonCompany } from "@/lib/communications/workspace-company";
import { createAdminServerClient } from "@/lib/supabase/admin-server";
import { canAccessWorkspace, getWorkspaceAccess } from "@/lib/workspace-access";

export async function GET(
  _request: Request,
  context: { params: Promise<{ messageId: string; attachmentId: string }> },
) {
  const workspace = await getWorkspaceAccess();
  if (!workspace.user) return new Response("Sign in to download attachments.", { status: 401 });
  if (!canAccessWorkspace(workspace.access, "sales")) {
    return new Response("Sales access is required to download attachments.", { status: 403 });
  }

  const { messageId, attachmentId } = await context.params;
  const supabase = createAdminServerClient();
  if (!await communicationWorkspaceMatchesSingletonCompany(supabase, workspace.access!.company_id)) {
    return new Response("The company workspace could not be verified.", { status: 403 });
  }
  const location = await getMatchedMicrosoftMessageLocation(supabase, messageId);
  if (!location) return new Response("The matched message could not be found.", { status: 404 });

  try {
    const attachments = await listMicrosoftMessageAttachments(supabase, location);
    const attachment = attachments.find((item) => item.id === attachmentId);
    if (!attachment || !attachment.canDownload) {
      return new Response("This attachment is not available for secure download.", { status: 404 });
    }

    const response = await downloadMicrosoftMessageAttachment(supabase, location, attachmentId);
    if (!response.ok || !response.body) {
      return new Response("Microsoft 365 could not provide this attachment.", { status: 502 });
    }

    const filename = safeAttachmentFilename(attachment.name);
    const asciiFilename = filename.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_");
    const headers = new Headers({
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Content-Type": attachment.contentType,
      "Cross-Origin-Resource-Policy": "same-origin",
      "X-Content-Type-Options": "nosniff",
    });
    const contentLength = response.headers.get("content-length");
    if (contentLength) headers.set("Content-Length", contentLength);
    return new Response(response.body, { status: 200, headers });
  } catch {
    return new Response("The attachment could not be downloaded from Microsoft 365.", { status: 502 });
  }
}
