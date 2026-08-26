import "server-only";

import webpush, { type PushSubscription } from "web-push";

import { createAdminServerClient } from "@/lib/supabase/admin-server";

export const INTERNAL_PUSH_RECIPIENT_EMAIL = "info@mckenzie-builds.com";

type StoredSubscription = {
  id: string;
  user_id: string | null;
  endpoint: string;
  p256dh: string;
  auth: string;
};

export type WebPushDeliverySummary = {
  configured: boolean;
  attempted: number;
  delivered: number;
  removed: number;
  rejectedStatusCodes: number[];
};

function configuration() {
  return {
    publicKey: process.env.WEB_PUSH_VAPID_PUBLIC_KEY?.trim() ?? "",
    privateKey: process.env.WEB_PUSH_VAPID_PRIVATE_KEY?.trim() ?? "",
    subject: process.env.WEB_PUSH_VAPID_SUBJECT?.trim() || "mailto:info@mckenzie-builds.com",
  };
}

export function webPushPublicKey() {
  return configuration().publicKey;
}

export function isInternalPushRecipient(email: string | null | undefined) {
  return email?.trim().toLowerCase() === INTERNAL_PUSH_RECIPIENT_EMAIL;
}

export function validPushEndpoint(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2_048) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

export function validPushKey(value: unknown): value is string {
  return typeof value === "string" && value.length >= 16 && value.length <= 512 && /^[A-Za-z0-9_-]+$/.test(value);
}

function stalePushSubscription(error: unknown) {
  const statusCode = typeof error === "object" && error !== null && "statusCode" in error
    ? Number((error as { statusCode?: unknown }).statusCode)
    : 0;
  return statusCode === 404 || statusCode === 410;
}

async function deliver(rows: StoredSubscription[]): Promise<WebPushDeliverySummary> {
  const config = configuration();
  if (!config.publicKey || !config.privateKey) {
    return { configured: false, attempted: 0, delivered: 0, removed: 0, rejectedStatusCodes: [] };
  }

  webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
  const supabase = createAdminServerClient();
  let delivered = 0;
  let removed = 0;
  const rejectedStatusCodes = new Set<number>();
  const payload = JSON.stringify({
    title: "New customer text",
    body: "A new text arrived in Company Inbox.",
  });

  for (const row of rows) {
    const subscription: PushSubscription = {
      endpoint: row.endpoint,
      keys: { p256dh: row.p256dh, auth: row.auth },
    };
    try {
      await webpush.sendNotification(subscription, payload, {
        TTL: 60,
      });
      delivered += 1;
    } catch (error) {
      if (stalePushSubscription(error)) {
        const result = await supabase.from("push_subscriptions").delete().eq("id", row.id);
        if (!result.error) removed += 1;
      } else {
        const statusCode = typeof error === "object" && error !== null && "statusCode" in error
          ? Number((error as { statusCode?: unknown }).statusCode)
          : 0;
        rejectedStatusCodes.add(Number.isFinite(statusCode) ? statusCode : 0);
      }
    }
  }
  return { configured: true, attempted: rows.length, delivered, removed, rejectedStatusCodes: [...rejectedStatusCodes].sort((a, b) => a - b) };
}

async function internalRecipientAuthUserId() {
  const supabase = createAdminServerClient();
  const result = await supabase.from("team_members")
    .select("auth_user_id")
    .eq("status", "active")
    .ilike("email", INTERNAL_PUSH_RECIPIENT_EMAIL)
    .limit(2);
  const rows = result.data ?? [];
  if (result.error || rows.length !== 1 || typeof rows[0].auth_user_id !== "string") return null;
  return rows[0].auth_user_id;
}

export async function sendInboundTextPush() {
  const userId = await internalRecipientAuthUserId();
  if (!userId) return { configured: Boolean(webPushPublicKey()), attempted: 0, delivered: 0, removed: 0, rejectedStatusCodes: [] };
  return sendPushToUser(userId);
}

async function sendPushToUser(userId: string) {
  const supabase = createAdminServerClient();
  const subscriptions = await supabase
    .from("push_subscriptions")
    .select("id,user_id,endpoint,p256dh,auth")
    .eq("user_id", userId);
  if (subscriptions.error) {
    return { configured: Boolean(webPushPublicKey()), attempted: 0, delivered: 0, removed: 0, rejectedStatusCodes: [] };
  }
  return deliver((subscriptions.data ?? []) as StoredSubscription[]);
}

export async function sendPushTestToUser(userId: string, email: string | null | undefined) {
  if (!isInternalPushRecipient(email)) {
    return { configured: Boolean(webPushPublicKey()), attempted: 0, delivered: 0, removed: 0, rejectedStatusCodes: [] };
  }
  return sendPushToUser(userId);
}
