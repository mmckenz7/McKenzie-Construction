import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  isTrustedGraphDeltaUrl,
  mergeMicrosoftThreadState,
  normalizeGraphInboxMessage,
  normalizedEmailThreadSubject,
  type GraphInboxMessage,
  type MicrosoftThreadState,
} from "@/lib/communications/microsoft-message";

type MicrosoftSettings = {
  microsoft_365_inbox_enabled: boolean;
  microsoft_365_tenant_id: string | null;
  microsoft_365_client_id: string | null;
};

type Mailbox = {
  id: string;
  address: string;
  graph_user_id: string | null;
  inbox_delta_link: string | null;
};

type GraphDeltaResponse = {
  value?: GraphInboxMessage[];
  "@odata.nextLink"?: string;
  "@odata.deltaLink"?: string;
};

export class MicrosoftInboxConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MicrosoftInboxConfigurationError";
  }
}

async function getAccessToken(
  settings: MicrosoftSettings,
) {
  const tenantId =
    settings.microsoft_365_tenant_id?.trim();
  const clientId =
    settings.microsoft_365_client_id?.trim();
  const clientSecret =
    process.env.MICROSOFT_365_CLIENT_SECRET?.trim();

  if (!tenantId || !clientId || !clientSecret) {
    throw new MicrosoftInboxConfigurationError(
      "Microsoft 365 tenant, application, and server secret configuration is incomplete.",
    );
  }

  const response = await fetch(
    `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: {
        "Content-Type":
          "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        scope:
          "https://graph.microsoft.com/.default",
        grant_type:
          "client_credentials",
      }),
      cache: "no-store",
    },
  );

  const result = (await response.json()) as {
    access_token?: string;
    error_description?: string;
  };

  if (!response.ok || !result.access_token) {
    throw new Error(
      result.error_description?.slice(0, 300) ||
        "Microsoft 365 authentication failed.",
    );
  }

  return result.access_token;
}

export async function getMicrosoftGraphAccessToken(
  supabase: SupabaseClient,
) {
  const settingsResult = await supabase
    .from("company_settings")
    .select("microsoft_365_inbox_enabled,microsoft_365_tenant_id,microsoft_365_client_id")
    .limit(1)
    .maybeSingle();

  if (settingsResult.error || !settingsResult.data?.microsoft_365_inbox_enabled) {
    throw new MicrosoftInboxConfigurationError("Microsoft inbox synchronization is disabled.");
  }

  return getAccessToken(settingsResult.data as MicrosoftSettings);
}

function initialDeltaUrl(mailbox: Mailbox) {
  const graphUser =
    mailbox.graph_user_id?.trim() ||
    mailbox.address.trim();
  const select = [
    "id",
    "conversationId",
    "internetMessageId",
    "subject",
    "bodyPreview",
    "body",
    "from",
    "toRecipients",
    "ccRecipients",
    "receivedDateTime",
    "isRead",
    "hasAttachments",
  ].join(",");

  return `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(graphUser)}/mailFolders/inbox/messages/delta?$select=${select}&$top=50`;
}

async function findRelatedRecords(
  supabase: SupabaseClient,
  sender: string,
) {
  const [leadResult, customerResult] =
    await Promise.all([
      supabase
        .from("leads")
        .select("id")
        .ilike("email", sender)
        .order("updated_at", {
          ascending: false,
        })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("customers")
        .select("id")
        .ilike("email", sender)
        .order("updated_at", {
          ascending: false,
        })
        .limit(1)
        .maybeSingle(),
    ]);

  return {
    leadId:
      leadResult.error
        ? null
        : leadResult.data?.id ?? null,
    customerId:
      customerResult.error
        ? null
        : customerResult.data?.id ?? null,
  };
}

async function storeMessage(
  supabase: SupabaseClient,
  mailbox: Mailbox,
  rawMessage: GraphInboxMessage,
) {
  if (rawMessage["@removed"] || !rawMessage.id) {
    return false;
  }

  const message =
    normalizeGraphInboxMessage(rawMessage);

  if (!message) {
    return false;
  }

  const related = await findRelatedRecords(
    supabase,
    message.sender,
  );
  const participants = [
    message.sender,
    ...message.recipients,
  ];
  const uniqueParticipants = [
    ...new Set(participants),
  ];

  const existingThreadResult = await supabase
    .from("communication_threads")
    .select(
      "id,subject,department,lead_id,customer_id,participant_addresses,last_message_at",
    )
    .eq("provider", "microsoft_graph")
    .eq(
      "provider_thread_id",
      message.providerConversationId,
    )
    .maybeSingle();

  if (existingThreadResult.error) {
    throw new Error(
      "The Microsoft conversation could not be loaded.",
    );
  }

  let existingThreadData = existingThreadResult.data;
  if (!existingThreadData && (related.leadId || related.customerId)) {
    let startedThreadQuery = supabase
      .from("communication_threads")
      .select("id,subject,department,lead_id,customer_id,participant_addresses,last_message_at")
      .eq("provider", "mission_control")
      .neq("status", "archived")
      .order("last_message_at", { ascending: false })
      .limit(20);
    startedThreadQuery = related.leadId
      ? startedThreadQuery.eq("lead_id", related.leadId)
      : startedThreadQuery.eq("customer_id", related.customerId);
    const startedThreads = await startedThreadQuery;
    if (startedThreads.error) {
      throw new Error("A Mission Control conversation could not be matched.");
    }
    const normalizedSubject = normalizedEmailThreadSubject(message.subject);
    existingThreadData = (startedThreads.data ?? []).find(
      (thread) => normalizedEmailThreadSubject(thread.subject) === normalizedSubject,
    ) ?? null;
    if (existingThreadData) {
      const convertedThread = await supabase
        .from("communication_threads")
        .update({
          provider: "microsoft_graph",
          provider_thread_id: message.providerConversationId,
        })
        .eq("id", existingThreadData.id);
      if (convertedThread.error) {
        throw new Error("The customer reply could not be joined to its Mission Control conversation.");
      }
    }
  }

  const existingThread = existingThreadData
    ? {
        subject: existingThreadData.subject,
        department: existingThreadData.department,
        leadId: existingThreadData.lead_id,
        customerId: existingThreadData.customer_id,
        participantAddresses:
          existingThreadData.participant_addresses,
        lastMessageAt:
          existingThreadData.last_message_at,
      } as MicrosoftThreadState
    : null;
  const mergedThread = mergeMicrosoftThreadState(
    existingThread,
    {
      subject: message.subject,
      department: message.department,
      leadId: related.leadId,
      customerId: related.customerId,
      participantAddresses: uniqueParticipants,
      lastMessageAt: message.receivedAt,
    },
  );

  const threadResult = await supabase
    .from("communication_threads")
    .upsert(
      {
        provider: "microsoft_graph",
        provider_thread_id:
          message.providerConversationId,
        subject: mergedThread.subject,
        department: mergedThread.department,
        lead_id: mergedThread.leadId,
        customer_id: mergedThread.customerId,
        participant_addresses:
          mergedThread.participantAddresses,
        last_message_at:
          mergedThread.lastMessageAt,
      },
      {
        onConflict:
          "provider,provider_thread_id",
      },
    )
    .select("id")
    .single();

  if (threadResult.error || !threadResult.data) {
    throw new Error(
      "The Microsoft conversation could not be saved.",
    );
  }

  const result = await supabase
    .from("communication_messages")
    .upsert(
      {
        channel: "email",
        direction: "inbound",
        sender: message.sender,
        recipient:
          message.recipients[0],
        subject: message.subject,
        body: message.body,
        status: "received",
        provider: "microsoft_graph",
        provider_message_id:
          message.providerMessageId,
        lead_id: mergedThread.leadId,
        received_at: message.receivedAt,
        mailbox_id: mailbox.id,
        thread_id: threadResult.data.id,
        provider_conversation_id:
          message.providerConversationId,
        internet_message_id:
          message.internetMessageId,
        is_read: message.isRead,
        has_attachments:
          message.hasAttachments,
        department: message.department,
        metadata: {
          sender_name: message.senderName,
          recipient_addresses:
            message.recipients,
          microsoft_mailbox_address:
            mailbox.address,
        },
      },
      {
        onConflict:
          "provider,provider_message_id,direction",
      },
    );

  if (result.error) {
    throw new Error(
      "The Microsoft message could not be saved.",
    );
  }

  if (mergedThread.leadId) {
    const relatedMessagesResult = await supabase
      .from("communication_messages")
      .update({
        lead_id: mergedThread.leadId,
      })
      .eq("thread_id", threadResult.data.id)
      .is("lead_id", null);

    if (relatedMessagesResult.error) {
      throw new Error(
        "The Microsoft conversation match could not be applied.",
      );
    }
  }

  return true;
}

async function refreshThreadUnreadCounts(
  supabase: SupabaseClient,
) {
  const threads = await supabase
    .from("communication_threads")
    .select("id")
    .eq("provider", "microsoft_graph");

  if (threads.error) {
    throw new Error(
      "Microsoft conversation counts could not be refreshed.",
    );
  }

  for (const thread of threads.data ?? []) {
    const unread = await supabase
      .from("communication_messages")
      .select("id", {
        count: "exact",
        head: true,
      })
      .eq("thread_id", thread.id)
      .eq("direction", "inbound")
      .eq("is_read", false);

    if (unread.error) {
      throw new Error(
        "Microsoft unread counts could not be refreshed.",
      );
    }

    await supabase
      .from("communication_threads")
      .update({
        unread_count: unread.count ?? 0,
      })
      .eq("id", thread.id);
  }
}

export async function syncMicrosoftInbox(
  supabase: SupabaseClient,
) {
  const [settingsResult, mailboxesResult] =
    await Promise.all([
      supabase
        .from("company_settings")
        .select(
          "microsoft_365_inbox_enabled,microsoft_365_tenant_id,microsoft_365_client_id",
        )
        .limit(1)
        .maybeSingle(),
      supabase
        .from("communication_mailboxes")
        .select(
          "id,address,graph_user_id,inbox_delta_link",
        )
        .eq("provider", "microsoft_graph")
        .eq("is_active", true)
        .eq("sync_enabled", true),
    ]);

  if (
    settingsResult.error ||
    !settingsResult.data ||
    mailboxesResult.error
  ) {
    throw new MicrosoftInboxConfigurationError(
      "Microsoft inbox settings could not be loaded.",
    );
  }

  if (
    !settingsResult.data
      .microsoft_365_inbox_enabled
  ) {
    throw new MicrosoftInboxConfigurationError(
      "Microsoft inbox synchronization is disabled.",
    );
  }

  if (!mailboxesResult.data?.length) {
    throw new MicrosoftInboxConfigurationError(
      "Add and enable a Microsoft 365 mailbox before synchronizing.",
    );
  }

  const accessToken = await getAccessToken(
    settingsResult.data as MicrosoftSettings,
  );
  let synchronized = 0;

  for (const mailbox of
    mailboxesResult.data as Mailbox[]) {
    await supabase
      .from("communication_mailboxes")
      .update({
        last_sync_status: "syncing",
        last_sync_error: null,
      })
      .eq("id", mailbox.id);

    try {
      let nextUrl = mailbox.inbox_delta_link;

      if (
        nextUrl &&
        !isTrustedGraphDeltaUrl(nextUrl)
      ) {
        throw new Error(
          "The stored Microsoft synchronization cursor is invalid.",
        );
      }

      nextUrl ||= initialDeltaUrl(mailbox);
      let deltaLink = "";

      while (nextUrl) {
        const response = await fetch(nextUrl, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Prefer:
              'outlook.body-content-type="text"',
          },
          cache: "no-store",
        });

        const page =
          (await response.json()) as GraphDeltaResponse & {
            error?: { message?: string };
          };

        if (!response.ok) {
          throw new Error(
            page.error?.message?.slice(0, 300) ||
              "Microsoft inbox synchronization failed.",
          );
        }

        for (const message of page.value ?? []) {
          if (
            await storeMessage(
              supabase,
              mailbox,
              message,
            )
          ) {
            synchronized += 1;
          }
        }

        const pageNext =
          page["@odata.nextLink"] ?? "";
        const pageDelta =
          page["@odata.deltaLink"] ?? "";

        if (
          pageNext &&
          !isTrustedGraphDeltaUrl(pageNext)
        ) {
          throw new Error(
            "Microsoft returned an invalid synchronization page.",
          );
        }

        if (
          pageDelta &&
          !isTrustedGraphDeltaUrl(pageDelta)
        ) {
          throw new Error(
            "Microsoft returned an invalid synchronization cursor.",
          );
        }

        nextUrl = pageNext;
        deltaLink = pageDelta || deltaLink;
      }

      await supabase
        .from("communication_mailboxes")
        .update({
          inbox_delta_link:
            deltaLink || mailbox.inbox_delta_link,
          last_sync_at:
            new Date().toISOString(),
          last_sync_status: "succeeded",
          last_sync_error: null,
        })
        .eq("id", mailbox.id);
    } catch (error) {
      await supabase
        .from("communication_mailboxes")
        .update({
          last_sync_status: "failed",
          last_sync_error:
            error instanceof Error
              ? error.message.slice(0, 500)
              : "Microsoft inbox synchronization failed.",
        })
        .eq("id", mailbox.id);

      throw error;
    }
  }

  await refreshThreadUnreadCounts(supabase);

  return {
    mailboxes:
      mailboxesResult.data.length,
    synchronized,
  };
}
