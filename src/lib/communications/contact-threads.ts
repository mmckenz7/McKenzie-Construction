import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { e164UsPhone } from "@/lib/communications/phone";

export type ContactCommunicationThread = {
  id: string;
  subject: string | null;
  provider: string;
  department: string;
  status: string;
  lead_id: string | null;
  customer_id: string | null;
  participant_addresses: string[];
  unread_count: number;
  last_message_at: string;
};

type ContactIdentity = {
  leadId?: string | null;
  customerId?: string | null;
  email?: string | null;
  phone?: string | null;
};

const threadSelection =
  "id,subject,provider,department,status,lead_id,customer_id,participant_addresses,unread_count,last_message_at";

export async function loadContactCommunicationThreads(
  supabase: SupabaseClient,
  identity: ContactIdentity,
) {
  const directFilters = [
    identity.leadId
      ? { column: "lead_id", value: identity.leadId }
      : null,
    identity.customerId
      ? { column: "customer_id", value: identity.customerId }
      : null,
  ].filter(
    (
      filter,
    ): filter is { column: string; value: string } =>
      Boolean(filter),
  );

  const participantAddresses = [
    identity.email?.trim().toLowerCase() || null,
    identity.phone
      ? e164UsPhone(identity.phone)
      : null,
  ].filter(
    (value): value is string => Boolean(value),
  );

  const threads = new Map<
    string,
    ContactCommunicationThread
  >();

  for (const filter of directFilters) {
    const result = await supabase
      .from("communication_threads")
      .select(threadSelection)
      .eq(filter.column, filter.value)
      .neq("status", "archived")
      .order("last_message_at", {
        ascending: false,
      })
      .limit(20);

    if (!result.error) {
      for (const thread of result.data ?? []) {
        threads.set(
          thread.id,
          thread as ContactCommunicationThread,
        );
      }
    }
  }

  for (const address of participantAddresses) {
    const result = await supabase
      .from("communication_threads")
      .select(threadSelection)
      .contains("participant_addresses", [address])
      .neq("status", "archived")
      .order("last_message_at", {
        ascending: false,
      })
      .limit(20);

    if (!result.error) {
      for (const thread of result.data ?? []) {
        threads.set(
          thread.id,
          thread as ContactCommunicationThread,
        );
      }
    }
  }

  return [...threads.values()]
    .sort(
      (left, right) =>
        Date.parse(right.last_message_at) -
        Date.parse(left.last_message_at),
    )
    .slice(0, 20);
}
