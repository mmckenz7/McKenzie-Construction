export type CustomerHubThread = {
  id: string;
  lead_id: string | null;
  customer_id: string | null;
  provider: string;
  unread_count: number;
  last_message_at: string;
};

export type CustomerHubGroup<T extends CustomerHubThread> = {
  key: string;
  threads: T[];
  representative: T;
  unreadCount: number;
  channels: Array<"email" | "sms">;
};

export function customerHubKey(thread: CustomerHubThread) {
  if (thread.customer_id) return `customer:${thread.customer_id}`;
  if (thread.lead_id) return `lead:${thread.lead_id}`;
  return `thread:${thread.id}`;
}

export function groupCustomerHubThreads<T extends CustomerHubThread>(threads: readonly T[]) {
  const grouped = new Map<string, T[]>();
  for (const thread of threads) {
    const key = customerHubKey(thread);
    grouped.set(key, [...(grouped.get(key) ?? []), thread]);
  }

  return [...grouped.entries()].map(([key, groupedThreads]): CustomerHubGroup<T> => {
    const ordered = [...groupedThreads].sort((left, right) =>
      Date.parse(right.last_message_at) - Date.parse(left.last_message_at));
    const channelSet = new Set<"email" | "sms">(
      ordered.map((thread) => thread.provider === "twilio" ? "sms" : "email"),
    );
    return {
      key,
      threads: ordered,
      representative: ordered[0],
      unreadCount: ordered.reduce((total, thread) => total + thread.unread_count, 0),
      channels: [...channelSet].sort(),
    };
  }).sort((left, right) =>
    Date.parse(right.representative.last_message_at) - Date.parse(left.representative.last_message_at));
}
