import Link from "next/link";

import { CommunicationAutomationControls } from "@/components/communication-automation-controls";
import { CommunicationThreadControls } from "@/components/communication-thread-controls";
import { createAdminServerClient } from "@/lib/supabase/admin-server";

export const dynamic = "force-dynamic";

type CommunicationsPageProps = {
  searchParams: Promise<{
    view?: string;
  }>;
};

type InboxThread = {
  id: string;
  provider: string;
  subject: string | null;
  department: string;
  status: string;
  lead_id: string | null;
  customer_id: string | null;
  participant_addresses: string[];
  unread_count: number;
  assigned_to_id: string | null;
  last_message_at: string;
};

type Message = {
  id: string;
  channel: string;
  thread_id: string | null;
  direction: string;
  sender: string;
  recipient: string;
  subject: string | null;
  body: string;
  status: string;
  department: string;
  lead_id: string | null;
  is_read: boolean;
  has_attachments: boolean;
  received_at: string | null;
  sent_at: string | null;
  created_at: string;
};

const views = [
  ["all", "All"],
  ["unread", "Unread"],
  ["closed", "Closed"],
  ["archived", "Archived"],
  ["sales", "Sales"],
  ["estimating", "Estimating"],
  ["operations", "Operations"],
  ["billing", "Billing"],
] as const;

function timestamp(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function titleCase(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function messageTime(message: Message) {
  return message.received_at ?? message.sent_at ?? message.created_at;
}

export default async function CommunicationsPage({
  searchParams,
}: CommunicationsPageProps) {
  const { view: rawView } = await searchParams;
  const view = views.some(([value]) => value === rawView) ? rawView! : "all";
  const supabase = createAdminServerClient();
  let threadQuery = supabase
    .from("communication_threads")
    .select("id,provider,subject,department,status,lead_id,customer_id,assigned_to_id,participant_addresses,unread_count,last_message_at")
    .order("unread_count", { ascending: false })
    .order("last_message_at", { ascending: false })
    .limit(100);

  threadQuery = view === "archived"
    ? threadQuery.eq("status", "archived")
    : threadQuery.neq("status", "archived");
  if (view === "unread") threadQuery = threadQuery.gt("unread_count", 0);
  if (view === "closed") threadQuery = threadQuery.eq("status", "closed");
  if (["sales", "estimating", "operations", "billing"].includes(view)) {
    threadQuery = threadQuery.eq("department", view);
  }

  const [threadsResult, messagesResult, outboxResult, mailboxResult, teamResult] = await Promise.all([
    threadQuery,
    supabase
      .from("communication_messages")
      .select("id,channel,thread_id,direction,sender,recipient,subject,body,status,department,lead_id,is_read,has_attachments,received_at,sent_at,created_at")
      .order("created_at", { ascending: false })
      .limit(150),
    supabase
      .from("communication_outbox")
      .select("id,channel,recipient,sender,subject,body,status,lead_id,created_at")
      .not("lead_id", "is", null)
      .in("status", ["queued", "processing", "failed", "canceled"])
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("communication_mailboxes")
      .select("address,last_sync_at,last_sync_status,last_sync_error")
      .eq("provider", "microsoft_graph")
      .eq("is_active", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("team_members")
      .select("id,name")
      .eq("status", "active")
      .order("name", { ascending: true }),
  ]);

  if (threadsResult.error || messagesResult.error || outboxResult.error || mailboxResult.error || teamResult.error) {
    return <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <p className="text-xs font-bold uppercase tracking-[.18em] text-blue-400">Sales</p>
      <h1 className="mt-2 text-3xl font-bold">Company Inbox</h1>
      <div className="mt-7 rounded-2xl border border-amber-700/40 bg-amber-950/20 p-6 text-amber-100">
        <h2 className="font-bold">Local Microsoft inbox migration required</h2>
        <p className="mt-2 text-sm text-amber-200/80">Apply the local Microsoft 365 inbox migration before using this screen. No remote database was changed.</p>
      </div>
    </main>;
  }

  const threads = (threadsResult.data ?? []) as InboxThread[];
  const matchedThreadIds = new Set(
    threads.map((thread) => thread.id),
  );
  const pendingMessages: Message[] = (outboxResult.data ?? []).map((message) => ({
    id: message.id,
    channel: message.channel,
    thread_id: null,
    direction: "outbound",
    sender: message.sender,
    recipient: message.recipient,
    subject: message.subject,
    body: message.body,
    status: message.status,
    department: "general",
    lead_id: message.lead_id,
    is_read: true,
    has_attachments: false,
    received_at: null,
    sent_at: null,
    created_at: message.created_at,
  }));
  const matchedInboxMessages = ((messagesResult.data ?? []) as Message[])
    .filter((message) =>
      Boolean(
        message.thread_id &&
        matchedThreadIds.has(message.thread_id),
      ),
    );
  const messages = [...matchedInboxMessages, ...pendingMessages]
    .sort((a, b) => Date.parse(messageTime(b)) - Date.parse(messageTime(a)));
  const latestByThread = new Map<string, Message>();
  for (const message of messages) {
    if (message.thread_id && !latestByThread.has(message.thread_id)) latestByThread.set(message.thread_id, message);
  }
  const leadIds = [...new Set(threads.map((thread) => thread.lead_id).filter((id): id is string => Boolean(id)))];
  const leadsResult = leadIds.length
    ? await supabase.from("leads").select("id,name,email,phone").in("id", leadIds)
    : { data: [], error: null };
  const customerIds = [...new Set(threads.map((thread) => thread.customer_id).filter((id): id is string => Boolean(id)))];
  const customersResult = customerIds.length
    ? await supabase.from("customers").select("id,customer_name,email,phone").in("id", customerIds)
    : { data: [], error: null };
  const leads = new Map((leadsResult.data ?? []).map((lead) => [String(lead.id), lead]));
  const customers = new Map((customersResult.data ?? []).map((customer) => [String(customer.id), customer]));
  const unread = threads.reduce((total, thread) => total + thread.unread_count, 0);
  const openConversations = threads.filter((thread) => thread.status === "open" || thread.status === "waiting").length;
  const matchedRecords = new Set(
    threads.flatMap((thread) => thread.lead_id
      ? [`lead:${thread.lead_id}`]
      : thread.customer_id
        ? [`customer:${thread.customer_id}`]
        : []),
  ).size;
  const needsAttention = messages.filter((message) => ["failed", "undelivered"].includes(message.status)).length;
  const mailbox = mailboxResult.data;
  const lastSyncAgeMinutes = mailbox?.last_sync_at
    ? Math.max(0, Math.round((Date.now() - Date.parse(mailbox.last_sync_at)) / 60_000))
    : null;
  const inboxHealth = mailbox?.last_sync_status === "failed"
    ? { label: "Failed", tone: "text-rose-300" }
    : mailbox?.last_sync_status === "succeeded" && lastSyncAgeMinutes !== null && lastSyncAgeMinutes <= 10
      ? { label: "Healthy", tone: "text-emerald-300" }
      : mailbox?.last_sync_at
        ? { label: "Stale", tone: "text-amber-300" }
        : { label: "Not synchronized", tone: "text-slate-400" };
  const queuedDeliveries = (outboxResult.data ?? []).filter((message) => ["queued", "processing"].includes(message.status)).length;
  const failedDeliveries = (outboxResult.data ?? []).filter((message) => ["failed", "canceled"].includes(message.status)).length;
  const schedulerSecretReady = Boolean(process.env.COMMUNICATION_PROCESSOR_SECRET || process.env.CRON_SECRET);
  const resendWebhookReady = Boolean(process.env.RESEND_WEBHOOK_SECRET);
  const teamMembers = (teamResult.data ?? []).map((member) => ({ id: String(member.id), name: String(member.name) }));
  const teamById = new Map(teamMembers.map((member) => [member.id, member.name]));

  return <main className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6"><div className="mx-auto max-w-7xl">
    <div className="flex flex-wrap items-end justify-between gap-5">
      <div><p className="text-[11px] font-semibold uppercase tracking-[.18em] text-slate-500">Mission Control</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Company Inbox</h1><p className="mt-2 max-w-2xl text-sm text-slate-600">Email and text conversations from across the company in one place. Lead, customer, and project cards show filtered views of this history.</p></div>
      <Link href="/admin/settings/communications" className="min-h-10 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:border-slate-400">Integration settings</Link>
    </div>

    <section className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {[['Unread', unread], ['Open', openConversations], ['Matched', matchedRecords], ['Needs attention', needsAttention]].map(([label, value]) => <article key={String(label)} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</p><p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">{value}</p></article>)}
    </section>

    <section className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div><p className="text-sm font-semibold text-slate-900">{mailbox?.address ?? "Microsoft 365 mailbox not configured"}</p><p className="mt-1 text-xs text-slate-500">{mailbox?.last_sync_at ? `Last synchronized ${timestamp(mailbox.last_sync_at)}` : "Synchronization has not run yet"} · {titleCase(mailbox?.last_sync_status ?? "not configured")}</p></div>
      <div className="flex flex-wrap gap-1">{views.map(([value, label]) => <Link key={value} href={value === "all" ? "/communications" : `/communications?view=${value}`} className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold ${view === value ? "bg-slate-950 text-white" : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"}`}>{label}</Link>)}</div>
    </section>

    <details className="mt-5 rounded-xl border border-slate-200 bg-white shadow-sm">
      <summary className="cursor-pointer list-none px-5 py-4 text-sm font-semibold text-slate-800">Integration health <span className="ml-2 font-normal text-slate-500">Email, text, and scheduled processing</span></summary>
      <section className="border-t border-slate-200 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Automation health</p><h2 className="mt-1 text-lg font-semibold text-slate-950">Delivery workflow</h2></div>
        <p className="max-w-xl text-right text-xs leading-5 text-slate-500">Live refresh runs while this inbox is open. Scheduled processing handles unattended delivery and inbox updates.</p>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-xl border border-slate-200 bg-slate-50 p-4"><p className="text-xs font-semibold uppercase text-slate-500">Microsoft inbox</p><p className={`mt-2 text-sm font-semibold ${inboxHealth.tone.replace('-300', '-700')}`}>{inboxHealth.label}</p><p className="mt-1 text-xs text-slate-500">{lastSyncAgeMinutes === null ? "No completed synchronization" : `${lastSyncAgeMinutes} minutes since update`}</p></article>
        <article className="rounded-xl border border-slate-200 bg-slate-50 p-4"><p className="text-xs font-semibold uppercase text-slate-500">Delivery queue</p><p className={`mt-2 text-sm font-semibold ${failedDeliveries ? "text-rose-700" : "text-emerald-700"}`}>{failedDeliveries ? `${failedDeliveries} need attention` : "Ready"}</p><p className="mt-1 text-xs text-slate-500">{queuedDeliveries} waiting to process</p></article>
        <article className="rounded-xl border border-slate-200 bg-slate-50 p-4"><p className="text-xs font-semibold uppercase text-slate-500">Resend events</p><p className={`mt-2 text-sm font-semibold ${resendWebhookReady ? "text-emerald-700" : "text-amber-700"}`}>{resendWebhookReady ? "Signing secret ready" : "Signing secret missing"}</p><p className="mt-1 text-xs text-slate-500">Delivery, bounce, and complaint events</p></article>
        <article className="rounded-xl border border-slate-200 bg-slate-50 p-4"><p className="text-xs font-semibold uppercase text-slate-500">Scheduler</p><p className={`mt-2 text-sm font-semibold ${schedulerSecretReady ? "text-emerald-700" : "text-amber-700"}`}>{schedulerSecretReady ? "Ready" : "Secret missing"}</p><p className="mt-1 text-xs text-slate-500">Unattended processing</p></article>
      </div>
      <div className="mt-4 border-t border-slate-200 pt-4"><CommunicationAutomationControls enabled /></div>
      </section>
    </details>

    <section className="mt-5 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-4"><h2 className="font-semibold text-slate-950">Conversations</h2></div>
      {threads.length === 0 ? <div className="p-10 text-center"><p className="font-semibold text-slate-900">No conversations in this view</p><p className="mt-2 text-sm text-slate-500">New email and text conversations will appear here.</p></div> : <div className="divide-y divide-slate-200">
        {threads.map((thread) => {
          const latest = latestByThread.get(thread.id);
          const lead = thread.lead_id ? leads.get(thread.lead_id) : null;
          const customer = thread.customer_id ? customers.get(thread.customer_id) : null;
          const phone = lead?.phone ?? customer?.phone ?? null;
          const matchedName = lead?.name ?? customer?.customer_name ?? latest?.sender ?? thread.participant_addresses[0] ?? "Matched customer";
          return <article key={thread.id} className="grid gap-3 px-5 py-5 transition hover:bg-slate-50 lg:grid-cols-[170px_1fr_280px]">
            <div><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-slate-950 px-2 py-0.5 text-[10px] font-semibold uppercase text-white">{thread.provider === "twilio" ? "Text" : "Email"}</span><span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{thread.department}</span>{thread.unread_count ? <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-semibold text-white">{thread.unread_count} new</span> : null}</div><p className="mt-2 text-xs text-slate-500">{timestamp(thread.last_message_at)}</p>{thread.assigned_to_id ? <p className="mt-1 text-xs text-slate-500">{teamById.get(thread.assigned_to_id) ?? "Assigned"}</p> : null}</div>
            <div className="min-w-0"><Link href={`/communications/${thread.id}`} className="truncate font-semibold text-slate-950 hover:text-blue-700">{thread.subject || "Customer conversation"}</Link><p className="mt-1 text-sm text-slate-600">{matchedName}</p>{!lead && !customer ? <p className="mt-1 text-xs font-semibold text-amber-700">Not matched to a CRM record yet</p> : null}{latest ? <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-500">{latest.body}</p> : null}</div>
            <div className="flex flex-wrap items-start justify-end gap-2">{phone ? <a href={`tel:${phone}`} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-600">Device call</a> : null}{lead || customer ? <><Link href={`/communications/${thread.id}#reply`} className="rounded-lg bg-slate-950 px-3 py-2 text-xs font-semibold text-white">Reply</Link><CommunicationThreadControls compact threadId={thread.id} status={thread.status} unreadCount={thread.unread_count} assignedToId={thread.assigned_to_id} teamMembers={teamMembers} /></> : <span className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">Match needed</span>}</div>
          </article>;
        })}
      </div>}
    </section>

    <details className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <summary className="cursor-pointer list-none border-b border-slate-200 px-5 py-4 font-semibold text-slate-950">Delivery activity</summary>
      <div className="divide-y divide-slate-200">{messages.slice(0, 12).map((message) => <article key={message.id} className="grid gap-3 px-5 py-4 sm:grid-cols-[110px_1fr_auto]"><div><span className="text-xs font-semibold uppercase text-slate-500">{message.channel} · {message.direction}</span><p className="mt-1 text-xs text-slate-500">{timestamp(messageTime(message))}</p></div><div><p className="text-sm font-semibold text-slate-800">{message.subject || (message.channel === "sms" ? "Text message" : "No subject")}</p><p className="mt-1 line-clamp-1 text-xs text-slate-500">{message.direction === "inbound" ? message.sender : message.recipient}</p></div><span className="text-xs font-semibold uppercase text-slate-500">{message.status}</span></article>)}</div>
    </details>
  </div></main>;
}
