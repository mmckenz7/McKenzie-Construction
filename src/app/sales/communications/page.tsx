import Link from "next/link";

import { CommunicationAutomationControls } from "@/components/communication-automation-controls";
import { CommunicationThreadControls } from "@/components/communication-thread-controls";
import { createAdminServerClient } from "@/lib/supabase/admin-server";
import {
  automatedConversationLabel,
  findInternalThreadParticipant,
  findVendorThreadParticipant,
  threadCounterpartyAddresses,
  type VendorParticipant,
} from "@/lib/communications/thread-classification";

export const dynamic = "force-dynamic";

type CommunicationsPageProps = {
  searchParams: Promise<{
    view?: string;
    q?: string;
    channel?: string;
    department?: string;
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

const folders = [
  ["inbox", "Inbox"],
  ["sent", "Sent"],
  ["attention", "Needs attention"],
  ["archived", "Archived"],
] as const;

const views = [
  ["unread", "Unread"],
  ["closed", "Closed"],
  ["customers", "Customers"],
  ["vendors", "Vendors"],
  ["internal", "Internal"],
  ["automated", "Automated"],
  ["review", "Review"],
  ["sales", "Sales"],
  ["estimating", "Estimating"],
  ["operations", "Operations"],
  ["billing", "Billing"],
] as const;

const channels = new Set(["all", "email", "sms"]);
const departments = new Set(["all", "general", "sales", "estimating", "operations", "billing"]);

function inboxHref({
  view,
  query,
  channel,
  department,
}: {
  view: string;
  query: string;
  channel: string;
  department: string;
}) {
  const params = new URLSearchParams();
  if (view !== "inbox") params.set("view", view);
  if (query) params.set("q", query);
  if (channel !== "all") params.set("channel", channel);
  if (department !== "all") params.set("department", department);
  const suffix = params.toString();
  return suffix ? `/communications?${suffix}` : "/communications";
}

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
  const {
    view: rawView,
    q: rawQuery,
    channel: rawChannel,
    department: rawDepartment,
  } = await searchParams;
  const availableViews = [...folders, ...views];
  const view = availableViews.some(([value]) => value === rawView) ? rawView! : "inbox";
  const query = (rawQuery ?? "").trim().slice(0, 120);
  const channel = channels.has(rawChannel ?? "") ? rawChannel! : "all";
  const department = departments.has(rawDepartment ?? "") ? rawDepartment! : "all";
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
  const selectedDepartment = department !== "all"
    ? department
    : ["sales", "estimating", "operations", "billing"].includes(view)
      ? view
      : null;
  if (selectedDepartment) threadQuery = threadQuery.eq("department", selectedDepartment);
  if (channel === "sms") threadQuery = threadQuery.eq("provider", "twilio");
  if (channel === "email") threadQuery = threadQuery.neq("provider", "twilio");

  const [threadsResult, messagesResult, outboxResult, mailboxResult, teamResult, suppliersResult] = await Promise.all([
    threadQuery,
    supabase
      .from("communication_messages")
      .select("id,channel,thread_id,direction,sender,recipient,subject,body,status,department,lead_id,is_read,has_attachments,received_at,sent_at,created_at")
      .order("created_at", { ascending: false })
      .limit(150),
    supabase
      .from("communication_outbox")
      .select("id,channel,recipient,sender,subject,body,status,lead_id,source_type,source_id,created_at")
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
      .select("id,name,email")
      .eq("status", "active")
      .order("name", { ascending: true }),
    supabase
      .from("suppliers")
      .select("id,name,supplier_locations(email,contact_email,is_active)")
      .eq("is_active", true),
  ]);

  if (threadsResult.error || messagesResult.error || outboxResult.error || mailboxResult.error || teamResult.error || suppliersResult.error) {
    return <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <p className="text-xs font-bold uppercase tracking-[.18em] text-blue-400">Sales</p>
      <h1 className="mt-2 text-3xl font-bold">Company Inbox</h1>
      <div className="mt-7 rounded-2xl border border-amber-700/40 bg-amber-950/20 p-6 text-amber-100">
        <h2 className="font-bold">Local Microsoft inbox migration required</h2>
        <p className="mt-2 text-sm text-amber-200/80">Apply the local Microsoft 365 inbox migration before using this screen. No remote database was changed.</p>
      </div>
    </main>;
  }

  const activeTeam = (teamResult.data ?? []).map((member) => ({
    id: String(member.id),
    name: String(member.name),
    email: String(member.email ?? ""),
  }));
  const mailboxAddress = mailboxResult.data?.address ?? null;
  const rawThreads = (threadsResult.data ?? []) as InboxThread[];
  const allInboxMessages = (messagesResult.data ?? []) as Message[];
  const rawLatestByThread = new Map<string, Message>();
  for (const message of allInboxMessages) {
    if (message.thread_id && !rawLatestByThread.has(message.thread_id)) rawLatestByThread.set(message.thread_id, message);
  }
  const vendors: VendorParticipant[] = (suppliersResult.data ?? []).map((supplier) => ({
    id: String(supplier.id),
    name: String(supplier.name),
    emails: (supplier.supplier_locations ?? []).flatMap((location) => location.is_active === false
      ? []
      : [location.email, location.contact_email].filter((email): email is string => Boolean(email))),
  }));
  const triageByThread = new Map(rawThreads.map((thread) => {
    const latest = rawLatestByThread.get(thread.id);
    const counterpart = threadCounterpartyAddresses(latest);
    const internal = !thread.lead_id && !thread.customer_id
      ? findInternalThreadParticipant(counterpart, activeTeam, [mailboxAddress])
      : null;
    const vendor = !thread.lead_id && !thread.customer_id && !internal
      ? findVendorThreadParticipant(counterpart, vendors)
      : null;
    const automated = !thread.lead_id && !thread.customer_id && !internal && !vendor
      ? automatedConversationLabel(latest)
      : null;
    const kind = thread.lead_id || thread.customer_id
      ? "customer"
      : internal
        ? "internal"
        : vendor
          ? "vendor"
          : automated
            ? "automated"
            : "review";
    return [thread.id, { kind, internal, vendor, automated }] as const;
  }));
  const viewKind = view === "customers"
    ? "customer"
    : view === "vendors"
      ? "vendor"
      : view === "internal" || view === "automated" || view === "review"
      ? view
        : null;
  const pendingMessages: Message[] = (outboxResult.data ?? []).map((message) => ({
    id: message.id,
    channel: message.channel,
    thread_id: ["inbox_reply", "inbox_compose"].includes(message.source_type) ? message.source_id : null,
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
  const sentThreadIds = new Set(allInboxMessages
    .filter((message) => message.direction === "outbound" && message.thread_id)
    .map((message) => message.thread_id!));
  for (const message of pendingMessages) {
    if (message.thread_id) sentThreadIds.add(message.thread_id);
  }
  const attentionThreadIds = new Set([...allInboxMessages, ...pendingMessages]
    .filter((message) => ["failed", "undelivered", "canceled"].includes(message.status) && message.thread_id)
    .map((message) => message.thread_id!));
  let candidateThreads = viewKind
    ? rawThreads.filter((thread) => triageByThread.get(thread.id)?.kind === viewKind)
    : rawThreads;
  if (view === "sent") candidateThreads = candidateThreads.filter((thread) => sentThreadIds.has(thread.id));
  if (view === "attention") {
    candidateThreads = candidateThreads.filter((thread) =>
      thread.unread_count > 0 ||
      attentionThreadIds.has(thread.id) ||
      triageByThread.get(thread.id)?.kind === "review",
    );
  }
  const candidateLeadIds = [...new Set(candidateThreads.map((thread) => thread.lead_id).filter((id): id is string => Boolean(id)))];
  const leadsResult = candidateLeadIds.length
    ? await supabase.from("leads").select("id,name,email,phone").in("id", candidateLeadIds)
    : { data: [], error: null };
  const candidateCustomerIds = [...new Set(candidateThreads.map((thread) => thread.customer_id).filter((id): id is string => Boolean(id)))];
  const customersResult = candidateCustomerIds.length
    ? await supabase.from("customers").select("id,customer_name,email,phone").in("id", candidateCustomerIds)
    : { data: [], error: null };
  const leads = new Map((leadsResult.data ?? []).map((lead) => [String(lead.id), lead]));
  const customers = new Map((customersResult.data ?? []).map((customer) => [String(customer.id), customer]));
  const searchTextByThread = new Map<string, string[]>();
  for (const message of allInboxMessages) {
    if (!message.thread_id) continue;
    const values = searchTextByThread.get(message.thread_id) ?? [];
    values.push(message.subject ?? "", message.body, message.sender, message.recipient);
    searchTextByThread.set(message.thread_id, values);
  }
  const normalizedQuery = query.toLocaleLowerCase("en-US");
  const threads = normalizedQuery
    ? candidateThreads.filter((thread) => {
      const triage = triageByThread.get(thread.id);
      const lead = thread.lead_id ? leads.get(thread.lead_id) : null;
      const customer = thread.customer_id ? customers.get(thread.customer_id) : null;
      return [
        thread.subject ?? "",
        ...thread.participant_addresses,
        lead?.name ?? "",
        lead?.email ?? "",
        customer?.customer_name ?? "",
        customer?.email ?? "",
        triage?.internal?.name ?? "",
        triage?.vendor?.name ?? "",
        triage?.automated ?? "",
        ...(searchTextByThread.get(thread.id) ?? []),
      ].join(" ").toLocaleLowerCase("en-US").includes(normalizedQuery);
    })
    : candidateThreads;
  const matchedThreadIds = new Set(
    threads.map((thread) => thread.id),
  );
  const matchedInboxMessages = allInboxMessages
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
  const unread = threads.reduce((total, thread) => total + thread.unread_count, 0);
  const openConversations = threads.filter((thread) => thread.status === "open" || thread.status === "waiting").length;
  const matchedRecords = new Set(
    threads.flatMap((thread) => thread.lead_id
      ? [`lead:${thread.lead_id}`]
      : thread.customer_id
        ? [`customer:${thread.customer_id}`]
        : []),
  ).size;
  const needsAttention = threads.filter((thread) =>
    thread.unread_count > 0 ||
    attentionThreadIds.has(thread.id) ||
    triageByThread.get(thread.id)?.kind === "review",
  ).length;
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
  const teamMembers = activeTeam.map((member) => ({ id: member.id, name: member.name }));
  const teamById = new Map(teamMembers.map((member) => [member.id, member.name]));

  return <main className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6"><div className="mx-auto max-w-7xl">
    <div className="flex flex-wrap items-end justify-between gap-5">
      <div><p className="text-[11px] font-semibold uppercase tracking-[.18em] text-slate-500">Mission Control</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Company Inbox</h1><p className="mt-2 max-w-2xl text-sm text-slate-600">Email and text conversations from across the company in one place. Lead, customer, and project cards show filtered views of this history.</p></div>
      <div className="flex flex-wrap gap-2"><Link href="/communications/new" className="min-h-10 rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800">New email</Link><Link href="/admin/settings/communications" className="min-h-10 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:border-slate-400">Integration settings</Link></div>
    </div>

    <section className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {[['Unread', unread], ['Open', openConversations], ['Matched', matchedRecords], ['Needs attention', needsAttention]].map(([label, value]) => <article key={String(label)} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</p><p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">{value}</p></article>)}
    </section>

    <section className="mt-5 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 sm:px-5">
        <nav aria-label="Mailbox folders" className="flex flex-wrap gap-1">{folders.map(([value, label]) => <Link key={value} href={inboxHref({ view: value, query, channel, department })} className={`rounded-md px-3 py-2 text-sm font-semibold ${view === value ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"}`}>{label}</Link>)}</nav>
        <div className="text-right"><p className="text-sm font-semibold text-slate-900">{mailbox?.address ?? "Microsoft 365 mailbox not configured"}</p><p className="mt-0.5 text-xs text-slate-500">{mailbox?.last_sync_at ? `Last synchronized ${timestamp(mailbox.last_sync_at)}` : "Synchronization has not run yet"} · {titleCase(mailbox?.last_sync_status ?? "not configured")}</p></div>
      </div>
      <form action="/communications" method="get" className="grid gap-3 border-b border-slate-200 bg-slate-50 px-4 py-4 sm:grid-cols-[minmax(220px,1fr)_150px_170px_auto] sm:px-5">
        {view !== "inbox" ? <input type="hidden" name="view" value={view} /> : null}
        <label><span className="sr-only">Search conversations</span><input type="search" name="q" defaultValue={query} maxLength={120} placeholder="Search people, addresses, subjects, or messages" className="min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none placeholder:text-slate-400 focus:border-blue-500" /></label>
        <label><span className="sr-only">Channel</span><select name="channel" defaultValue={channel} className="min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-800"><option value="all">Email and text</option><option value="email">Email only</option><option value="sms">Text only</option></select></label>
        <label><span className="sr-only">Department</span><select name="department" defaultValue={department} className="min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-800"><option value="all">All departments</option><option value="general">General</option><option value="sales">Sales</option><option value="estimating">Estimating</option><option value="operations">Operations</option><option value="billing">Billing</option></select></label>
        <div className="flex gap-2"><button type="submit" className="min-h-10 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800">Search</button>{query || channel !== "all" || department !== "all" ? <Link href={inboxHref({ view, query: "", channel: "all", department: "all" })} className="inline-flex min-h-10 items-center rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-600 hover:text-slate-950">Clear</Link> : null}</div>
      </form>
      <p className="border-b border-slate-200 bg-slate-50 px-4 pb-3 text-xs text-slate-500 sm:px-5">Search covers the 100 most recent conversations and 150 recent message records in this Preview.</p>
      <div className="flex flex-wrap gap-1 px-4 py-3 sm:px-5"><span className="mr-1 self-center text-xs font-semibold uppercase tracking-wider text-slate-400">View</span>{views.map(([value, label]) => <Link key={value} href={inboxHref({ view: value, query, channel, department })} className={`rounded-md px-2.5 py-1.5 text-xs font-semibold ${view === value ? "bg-blue-50 text-blue-800" : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"}`}>{label}</Link>)}</div>
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
          const triage = triageByThread.get(thread.id);
          const internalMember = triage?.internal ?? null;
          const vendor = triage?.vendor ?? null;
          const automated = triage?.automated ?? null;
          const phone = lead?.phone ?? customer?.phone ?? null;
          const matchedName = customer?.customer_name ?? lead?.name ?? internalMember?.name ?? vendor?.name ?? latest?.sender ?? thread.participant_addresses[0] ?? "Conversation";
          return <article key={thread.id} className="grid gap-3 px-5 py-5 transition hover:bg-slate-50 lg:grid-cols-[170px_1fr_280px]">
            <div><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-slate-950 px-2 py-0.5 text-[10px] font-semibold uppercase text-white">{thread.provider === "twilio" ? "Text" : "Email"}</span><span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{thread.department}</span>{thread.unread_count ? <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-semibold text-white">{thread.unread_count} new</span> : null}</div><p className="mt-2 text-xs text-slate-500">{timestamp(thread.last_message_at)}</p>{thread.assigned_to_id ? <p className="mt-1 text-xs text-slate-500">{teamById.get(thread.assigned_to_id) ?? "Assigned"}</p> : null}</div>
            <div className="min-w-0"><Link href={`/communications/${thread.id}`} className="truncate font-semibold text-slate-950 hover:text-blue-700">{thread.subject || "Conversation"}</Link><p className="mt-1 text-sm text-slate-600">{matchedName}</p>{internalMember ? <p className="mt-1 text-xs font-semibold text-blue-700">Internal team conversation</p> : vendor ? <p className="mt-1 text-xs font-semibold text-violet-700">Vendor conversation</p> : automated ? <p className="mt-1 text-xs font-semibold text-slate-600">{automated}</p> : !lead && !customer ? <p className="mt-1 text-xs font-semibold text-amber-700">Needs review before matching</p> : null}{latest ? <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-500">{latest.body}</p> : null}</div>
            <div className="flex flex-wrap items-start justify-end gap-2">{phone ? <a href={`tel:${phone}`} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-600">Device call</a> : null}<Link href={`/communications/${thread.id}${lead || customer ? "#reply" : ""}`} className="rounded-lg bg-slate-950 px-3 py-2 text-xs font-semibold text-white">{lead || customer ? "Reply" : "Open"}</Link><CommunicationThreadControls compact mailboxOnly={!lead && !customer} threadId={thread.id} status={thread.status} unreadCount={thread.unread_count} assignedToId={thread.assigned_to_id} teamMembers={teamMembers} /></div>
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
