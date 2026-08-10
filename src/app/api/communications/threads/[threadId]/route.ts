import { createAdminServerClient } from "@/lib/supabase/admin-server";
import { canAccessWorkspace, getWorkspaceAccess } from "@/lib/workspace-access";

type ThreadUpdateRequest = {
  status?: unknown;
  isRead?: unknown;
  assignedToId?: unknown;
};

const threadStatuses = new Set(["open", "waiting", "closed", "archived"]);

function optionalId(value: unknown) {
  if (value === null) return null;
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ threadId: string }> },
) {
  const workspace = await getWorkspaceAccess();
  if (!workspace.user) {
    return Response.json(
      { success: false, error: "Sign in to manage customer conversations." },
      { status: 401 },
    );
  }
  if (!canAccessWorkspace(workspace.access, "sales")) {
    return Response.json(
      { success: false, error: "Sales access is required to manage customer conversations." },
      { status: 403 },
    );
  }

  const { threadId } = await context.params;
  let payload: ThreadUpdateRequest;
  try {
    payload = await request.json() as ThreadUpdateRequest;
  } catch {
    return Response.json(
      { success: false, error: "Enter a valid conversation update." },
      { status: 400 },
    );
  }

  const status = typeof payload.status === "string" ? payload.status.trim() : undefined;
  const isRead = typeof payload.isRead === "boolean" ? payload.isRead : undefined;
  const assignedToId = optionalId(payload.assignedToId);

  if (status !== undefined && !threadStatuses.has(status)) {
    return Response.json(
      { success: false, error: "Choose a valid conversation status." },
      { status: 400 },
    );
  }
  if (payload.isRead !== undefined && isRead === undefined) {
    return Response.json(
      { success: false, error: "Choose a valid read state." },
      { status: 400 },
    );
  }
  if (payload.assignedToId !== undefined && assignedToId === undefined) {
    return Response.json(
      { success: false, error: "Choose a valid assignee." },
      { status: 400 },
    );
  }
  if (status === undefined && isRead === undefined && assignedToId === undefined) {
    return Response.json(
      { success: false, error: "Choose a conversation change." },
      { status: 400 },
    );
  }

  const supabase = createAdminServerClient();
  const threadResult = await supabase
    .from("communication_threads")
    .select("id,status,assigned_to_id,lead_id,customer_id")
    .eq("id", threadId)
    .or("lead_id.not.is.null,customer_id.not.is.null")
    .maybeSingle();

  if (threadResult.error || !threadResult.data) {
    return Response.json(
      { success: false, error: "The matched conversation could not be found." },
      { status: 404 },
    );
  }

  if (assignedToId) {
    const assigneeResult = await supabase
      .from("team_members")
      .select("id")
      .eq("id", assignedToId)
      .eq("status", "active")
      .maybeSingle();
    if (assigneeResult.error || !assigneeResult.data) {
      return Response.json(
        { success: false, error: "Choose an active team member." },
        { status: 400 },
      );
    }
  }

  const threadUpdates: Record<string, unknown> = {};
  if (status !== undefined) threadUpdates.status = status;
  if (assignedToId !== undefined) threadUpdates.assigned_to_id = assignedToId;

  if (isRead === true) {
    const messagesResult = await supabase
      .from("communication_messages")
      .update({ is_read: true })
      .eq("thread_id", threadId)
      .eq("direction", "inbound");
    if (messagesResult.error) {
      return Response.json(
        { success: false, error: "The conversation could not be marked as read." },
        { status: 500 },
      );
    }
    threadUpdates.unread_count = 0;
  } else if (isRead === false) {
    const latestInbound = await supabase
      .from("communication_messages")
      .select("id")
      .eq("thread_id", threadId)
      .eq("direction", "inbound")
      .order("received_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestInbound.error || !latestInbound.data) {
      return Response.json(
        { success: false, error: "An inbound message is required before marking this conversation unread." },
        { status: 409 },
      );
    }
    const messagesResult = await supabase
      .from("communication_messages")
      .update({ is_read: false })
      .eq("id", latestInbound.data.id);
    if (messagesResult.error) {
      return Response.json(
        { success: false, error: "The conversation could not be marked as unread." },
        { status: 500 },
      );
    }
    threadUpdates.unread_count = 1;
  }

  const updateResult = await supabase
    .from("communication_threads")
    .update(threadUpdates)
    .eq("id", threadId)
    .select("id,status,assigned_to_id,unread_count")
    .single();

  if (updateResult.error || !updateResult.data) {
    return Response.json(
      { success: false, error: "The conversation update could not be saved." },
      { status: 500 },
    );
  }

  return Response.json({ success: true, thread: updateResult.data });
}
