import Link from "next/link";
import { notFound } from "next/navigation";

import { createAdminServerClient } from "@/lib/supabase/admin-server";
import { CommunicationReplyComposer } from "@/components/communication-reply-composer";
import { CommunicationThreadMatch } from "@/components/communication-thread-match";
import { CommunicationThreadControls } from "@/components/communication-thread-controls";
import { CommunicationThreadMessages } from "@/components/communication-thread-messages";
import { TextMessageComposer } from "@/components/text-message-composer";

export const dynamic = "force-dynamic";

type ThreadPageProps = {
  params: Promise<{ threadId: string }>;
};

type SentAttachment = {
  filename: string;
  size: number;
};

function sentAttachments(value: unknown): SentAttachment[] {
  if (!value || typeof value !== "object") return [];
  const attachments = (value as { attachments?: unknown }).attachments;
  if (!Array.isArray(attachments)) return [];
  return attachments.flatMap((attachment) => {
    if (!attachment || typeof attachment !== "object") return [];
    const record = attachment as { filename?: unknown; size?: unknown };
    if (typeof record.filename !== "string" || typeof record.size !== "number") return [];
    return [{ filename: record.filename, size: record.size }];
  });
}

export default async function CommunicationThreadPage({ params }: ThreadPageProps) {
  const { threadId } = await params;
  const supabase = createAdminServerClient();
  const threadResult = await supabase.from("communication_threads").select("id,provider,subject,department,status,lead_id,customer_id,assigned_to_id,participant_addresses,unread_count,last_message_at").eq("id", threadId).maybeSingle();

  if (threadResult.error || !threadResult.data) notFound();

  const [messagesResult, leadResult, customerResult, teamResult, matchLeadsResult, matchCustomersResult] = await Promise.all([
    supabase.from("communication_messages").select("id,direction,sender,recipient,subject,body,status,provider,metadata,is_read,has_attachments,received_at,sent_at,created_at").eq("thread_id", threadId).order("created_at", { ascending: false }),
    threadResult.data.lead_id
      ? supabase.from("leads").select("id,name,email,phone,project_type").eq("id", threadResult.data.lead_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    threadResult.data.customer_id
      ? supabase.from("customers").select("id,customer_name,email,phone,project_type").eq("id", threadResult.data.customer_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase.from("team_members").select("id,name").eq("status", "active").order("name", { ascending: true }),
    !threadResult.data.lead_id && !threadResult.data.customer_id
      ? supabase.from("leads").select("id,name,email,phone,status").neq("status", "lost").order("name", { ascending: true }).limit(250)
      : Promise.resolve({ data: [], error: null }),
    !threadResult.data.lead_id && !threadResult.data.customer_id
      ? supabase.from("customers").select("id,customer_name,email,phone,status").neq("status", "inactive").order("customer_name", { ascending: true }).limit(250)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const matchedRecord = leadResult.data ?? customerResult.data;
  const isTextThread = threadResult.data.provider === "twilio";
  const recipient = isTextThread
    ? matchedRecord?.phone ?? threadResult.data.participant_addresses.at(-1) ?? null
    : matchedRecord?.email ?? threadResult.data.participant_addresses[0] ?? null;
  const teamMembers = (teamResult.data ?? []).map((member) => ({ id: String(member.id), name: String(member.name) }));
  const messages = (messagesResult.data ?? []).map((message) => ({
    id: String(message.id),
    direction: String(message.direction),
    sender: String(message.sender),
    recipient: String(message.recipient),
    body: String(message.body),
    provider: String(message.provider),
    isRead: Boolean(message.is_read),
    hasAttachments: Boolean(message.has_attachments),
    occurredAt: String(message.received_at ?? message.sent_at ?? message.created_at),
    sentAttachments: message.direction === "outbound" && message.has_attachments ? sentAttachments(message.metadata) : [],
  }));
  const matchLeads = (matchLeadsResult.data ?? []).map((lead) => ({
    id: String(lead.id),
    label: String(lead.name),
    detail: String(lead.email ?? lead.phone ?? "No contact detail"),
  }));
  const matchCustomers = (matchCustomersResult.data ?? []).map((customer) => ({
    id: String(customer.id),
    label: String(customer.customer_name),
    detail: String(customer.email ?? customer.phone ?? "No contact detail"),
  }));

  return <main className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6">
    <div className="mx-auto max-w-5xl">
    <Link href="/communications" className="text-sm font-semibold text-slate-600 hover:text-slate-950">← Company Inbox</Link>
    <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_240px]"><div><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-slate-900 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-white">{isTextThread ? "Text" : "Email"}</span><span className="text-xs font-semibold uppercase tracking-[.16em] text-slate-500">{threadResult.data.department} · {threadResult.data.status}</span></div><h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{threadResult.data.subject || "Customer conversation"}</h1><p className="mt-2 text-sm text-slate-500">{threadResult.data.participant_addresses.join(" · ")}</p><div className="mt-4">{leadResult.data ? <Link href={`/sales/leads/${leadResult.data.id}`} className="inline-flex min-h-9 items-center rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800 shadow-sm hover:border-slate-400">Open {leadResult.data.name}</Link> : customerResult.data ? <Link href={`/sales/customers/${customerResult.data.id}`} className="inline-flex min-h-9 items-center rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800 shadow-sm hover:border-slate-400">Open {customerResult.data.customer_name}</Link> : <span className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">Customer match needed</span>}</div></div>{matchedRecord ? <aside className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><CommunicationThreadControls threadId={threadId} status={threadResult.data.status} unreadCount={threadResult.data.unread_count} assignedToId={threadResult.data.assigned_to_id} teamMembers={teamMembers} /></aside> : null}</div>

    <CommunicationThreadMessages messages={messages} />

    {matchedRecord ? <section id="reply" className="mt-7 scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-semibold text-slate-950">Reply from Mission Control</h2><p className="mt-1 text-sm text-slate-500">This reply stays attached to the customer record and conversation history.</p><div className="mt-5">{isTextThread ? <TextMessageComposer recipient={recipient} threadId={threadId} leadId={threadResult.data.lead_id} customerId={threadResult.data.customer_id} /> : <CommunicationReplyComposer recipient={recipient} threadId={threadId} leadId={threadResult.data.lead_id} customerId={threadResult.data.customer_id} initialSubject={threadResult.data.subject} />}</div></section> : <CommunicationThreadMatch threadId={threadId} leads={matchLeads} customers={matchCustomers} />}
    <div id="thread-bottom" className="flex justify-end py-5"><a href="#thread-messages-top" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:text-slate-950">↑ Back to top</a></div>
    </div>
  </main>;
}
