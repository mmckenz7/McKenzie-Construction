import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  normalizeAttachment,
  type AttachmentSummary,
  type MicrosoftAttachmentInput,
} from "@/lib/communications/microsoft-attachment-core";
import { getMicrosoftGraphAccessToken } from "@/lib/communications/microsoft-graph";

type GraphAttachmentList = {
  value?: MicrosoftAttachmentInput[];
  error?: { message?: string };
};

type MicrosoftMessageLocation = {
  graphUser: string;
  providerMessageId: string;
};

export async function getMatchedMicrosoftMessageLocation(
  supabase: SupabaseClient,
  messageId: string,
): Promise<MicrosoftMessageLocation | null> {
  const messageResult = await supabase
    .from("communication_messages")
    .select("id,provider,provider_message_id,mailbox_id,thread_id,has_attachments")
    .eq("id", messageId)
    .eq("provider", "microsoft_graph")
    .eq("has_attachments", true)
    .maybeSingle();
  if (messageResult.error || !messageResult.data?.mailbox_id || !messageResult.data.thread_id) {
    return null;
  }

  const [threadResult, mailboxResult] = await Promise.all([
    supabase
      .from("communication_threads")
      .select("id")
      .eq("id", messageResult.data.thread_id)
      .or("lead_id.not.is.null,customer_id.not.is.null")
      .maybeSingle(),
    supabase
      .from("communication_mailboxes")
      .select("address,graph_user_id")
      .eq("id", messageResult.data.mailbox_id)
      .eq("provider", "microsoft_graph")
      .eq("is_active", true)
      .maybeSingle(),
  ]);

  if (threadResult.error || !threadResult.data || mailboxResult.error || !mailboxResult.data) {
    return null;
  }

  const graphUser = mailboxResult.data.graph_user_id?.trim() || mailboxResult.data.address?.trim();
  const providerMessageId = messageResult.data.provider_message_id?.trim();
  return graphUser && providerMessageId ? { graphUser, providerMessageId } : null;
}

function graphMessageUrl(location: MicrosoftMessageLocation) {
  return `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(location.graphUser)}/messages/${encodeURIComponent(location.providerMessageId)}`;
}

export async function listMicrosoftMessageAttachments(
  supabase: SupabaseClient,
  location: MicrosoftMessageLocation,
) {
  const accessToken = await getMicrosoftGraphAccessToken(supabase);
  const response = await fetch(
    `${graphMessageUrl(location)}/attachments?$select=id,name,contentType,size,isInline`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    },
  );
  const result = await response.json() as GraphAttachmentList;
  if (!response.ok) throw new Error("Microsoft attachments could not be loaded.");
  return (result.value ?? []).map(normalizeAttachment).filter((attachment): attachment is AttachmentSummary => Boolean(attachment));
}

export async function downloadMicrosoftMessageAttachment(
  supabase: SupabaseClient,
  location: MicrosoftMessageLocation,
  attachmentId: string,
) {
  const accessToken = await getMicrosoftGraphAccessToken(supabase);
  return fetch(
    `${graphMessageUrl(location)}/attachments/${encodeURIComponent(attachmentId)}/$value`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    },
  );
}
