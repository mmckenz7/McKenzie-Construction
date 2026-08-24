import { createAdminServerClient } from "@/lib/supabase/admin-server";
import { communicationWorkspaceMatchesSingletonCompany } from "@/lib/communications/workspace-company";
import { canAccessWorkspace, getWorkspaceAccess } from "@/lib/workspace-access";

type ThreadUpdateRequest = {
  action?: unknown;
  targetType?: unknown;
  targetId?: unknown;
  status?: unknown;
  isRead?: unknown;
  assignedToId?: unknown;
};

const threadStatuses = new Set(["open", "waiting", "closed", "archived"]);
const matchTargetTypes = new Set(["lead", "customer"]);

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

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

  const action = typeof payload.action === "string" ? payload.action.trim() : undefined;
  const targetType = typeof payload.targetType === "string" ? payload.targetType.trim() : "";
  const targetId = typeof payload.targetId === "string" ? payload.targetId.trim() : "";
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
  if (action !== undefined && action !== "match") {
    return Response.json(
      { success: false, error: "Choose a valid conversation action." },
      { status: 400 },
    );
  }
  if (action === "match" && (!matchTargetTypes.has(targetType) || !isUuid(targetId))) {
    return Response.json(
      { success: false, error: "Choose a valid lead or customer." },
      { status: 400 },
    );
  }
  if (action === "match" && (payload.status !== undefined || payload.isRead !== undefined || payload.assignedToId !== undefined)) {
    return Response.json(
      { success: false, error: "Match the conversation before making other changes." },
      { status: 400 },
    );
  }
  if (action !== "match" && status === undefined && isRead === undefined && assignedToId === undefined) {
    return Response.json(
      { success: false, error: "Choose a conversation change." },
      { status: 400 },
    );
  }

  const supabase = createAdminServerClient();
  if (!await communicationWorkspaceMatchesSingletonCompany(supabase, workspace.access!.company_id)) {
    return Response.json(
      { success: false, error: "The company workspace could not be verified." },
      { status: 403 },
    );
  }

  if (action === "match") {
    const threadResult = await supabase
      .from("communication_threads")
      .select("id,lead_id,customer_id")
      .eq("id", threadId)
      .maybeSingle();

    if (threadResult.error || !threadResult.data) {
      return Response.json(
        { success: false, error: "The conversation could not be found." },
        { status: 404 },
      );
    }
    if (threadResult.data.lead_id || threadResult.data.customer_id) {
      return Response.json(
        { success: false, error: "This conversation is already matched. Open the linked CRM record to review it." },
        { status: 409 },
      );
    }

    let leadId: string | null = null;
    let customerId: string | null = null;
    let targetLabel = "CRM record";

    if (targetType === "lead") {
      const leadResult = await supabase
        .from("leads")
        .select("id,name")
        .eq("id", targetId)
        .maybeSingle();
      if (leadResult.error || !leadResult.data) {
        return Response.json(
          { success: false, error: "The selected lead could not be found." },
          { status: 404 },
        );
      }
      leadId = leadResult.data.id;
      targetLabel = leadResult.data.name;
    } else {
      const customerResult = await supabase
        .from("customers")
        .select("id,customer_name,source_lead_id")
        .eq("id", targetId)
        .maybeSingle();
      if (customerResult.error || !customerResult.data) {
        return Response.json(
          { success: false, error: "The selected customer could not be found." },
          { status: 404 },
        );
      }
      customerId = customerResult.data.id;
      leadId = customerResult.data.source_lead_id ?? null;
      targetLabel = customerResult.data.customer_name;
    }

    const updateResult = await supabase
      .from("communication_threads")
      .update({ lead_id: leadId, customer_id: customerId })
      .eq("id", threadId)
      .is("lead_id", null)
      .is("customer_id", null)
      .select("id,lead_id,customer_id")
      .maybeSingle();

    if (updateResult.error || !updateResult.data) {
      return Response.json(
        { success: false, error: "The conversation changed before it could be matched. Refresh and try again." },
        { status: 409 },
      );
    }

    let warning: string | undefined;
    if (leadId) {
      const messageUpdate = await supabase
        .from("communication_messages")
        .update({ lead_id: leadId })
        .eq("thread_id", threadId);
      if (messageUpdate.error) {
        warning = "The conversation is matched, but older message audit rows still need repair.";
      }
    }

    return Response.json({
      success: true,
      thread: updateResult.data,
      targetLabel,
      warning,
    });
  }

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
