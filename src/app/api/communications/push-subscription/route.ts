import {
  isInternalPushRecipient,
  validPushEndpoint,
  validPushKey,
  webPushPublicKey,
} from "@/lib/communications/web-push";
import { createAdminServerClient } from "@/lib/supabase/admin-server";
import { canAccessWorkspace, getWorkspaceAccess } from "@/lib/workspace-access";

type SubscriptionPayload = {
  endpoint?: unknown;
  keys?: { p256dh?: unknown; auth?: unknown };
};

async function authorized() {
  const workspace = await getWorkspaceAccess();
  if (!workspace.user) return { workspace, response: Response.json({ success: false, error: "Sign in to manage phone notifications." }, { status: 401 }) };
  if (!canAccessWorkspace(workspace.access, "sales")) {
    return { workspace, response: Response.json({ success: false, error: "Sales access is required for Company Inbox notifications." }, { status: 403 }) };
  }
  const email = workspace.access?.email ?? workspace.user.email;
  if (!isInternalPushRecipient(email)) {
    return { workspace, response: Response.json({ success: false, error: "Phone notifications are currently limited to the info account." }, { status: 403 }) };
  }
  return { workspace, response: null };
}

export async function GET() {
  const access = await authorized();
  if (access.response) return access.response;
  const publicKey = webPushPublicKey();
  return Response.json({ success: true, configured: Boolean(publicKey), publicKey });
}

export async function POST(request: Request) {
  const access = await authorized();
  if (access.response) return access.response;
  if (!webPushPublicKey()) {
    return Response.json({ success: false, error: "Phone notifications are not configured on this deployment." }, { status: 503 });
  }
  let payload: SubscriptionPayload;
  try {
    payload = await request.json() as SubscriptionPayload;
  } catch {
    return Response.json({ success: false, error: "The phone notification subscription is invalid." }, { status: 400 });
  }
  const endpoint = payload.endpoint;
  const p256dh = payload.keys?.p256dh;
  const authKey = payload.keys?.auth;
  if (!validPushEndpoint(endpoint) || !validPushKey(p256dh) || !validPushKey(authKey)) {
    return Response.json({ success: false, error: "The phone notification subscription is invalid." }, { status: 400 });
  }

  const userId = access.workspace.user!.id;
  const supabase = createAdminServerClient();
  const existing = await supabase.from("push_subscriptions").select("id,user_id").eq("endpoint", endpoint).maybeSingle();
  if (existing.error) return Response.json({ success: false, error: "Phone notifications could not be enabled." }, { status: 500 });
  if (existing.data?.user_id && existing.data.user_id !== userId) {
    return Response.json({ success: false, error: "This phone notification subscription belongs to another account." }, { status: 409 });
  }
  const result = existing.data
    ? await supabase.from("push_subscriptions").update({ user_id: userId, p256dh, auth: authKey }).eq("id", existing.data.id)
    : await supabase.from("push_subscriptions").insert({ user_id: userId, endpoint, p256dh, auth: authKey });
  if (result.error) return Response.json({ success: false, error: "Phone notifications could not be enabled." }, { status: 500 });
  return Response.json({ success: true });
}

export async function DELETE(request: Request) {
  const access = await authorized();
  if (access.response) return access.response;
  let payload: { endpoint?: unknown };
  try {
    payload = await request.json() as { endpoint?: unknown };
  } catch {
    return Response.json({ success: false, error: "The phone notification subscription is invalid." }, { status: 400 });
  }
  if (!validPushEndpoint(payload.endpoint)) {
    return Response.json({ success: false, error: "The phone notification subscription is invalid." }, { status: 400 });
  }
  const result = await createAdminServerClient().from("push_subscriptions")
    .delete().eq("user_id", access.workspace.user!.id).eq("endpoint", payload.endpoint);
  if (result.error) return Response.json({ success: false, error: "Phone notifications could not be disabled." }, { status: 500 });
  return Response.json({ success: true });
}
