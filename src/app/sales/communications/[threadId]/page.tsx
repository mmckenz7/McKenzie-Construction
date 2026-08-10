import Link from "next/link";
import { notFound } from "next/navigation";

import { createAdminServerClient } from "@/lib/supabase/admin-server";
import { CommunicationReplyComposer } from "@/components/communication-reply-composer";
import { CommunicationThreadControls } from "@/components/communication-thread-controls";
import { CommunicationThreadMessages } from "@/components/communication-thread-messages";

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
  const threadResult = await supabase.from("communication_threads").select("id,subject,department,status,lead_id,customer_id,assigned_to_id,participant_addresses,unread_count,last_message_at").eq("id", threadId).or("lead_id.not.is.null,customer_id.not.is.null").maybeSingle();

  if (threadResult.error || !threadResult.data) notFound();

  const [messagesResult, leadResult, customerResult, teamResult] = await Promise.all([
    supabase.from("communication_messages").select("id,direction,sender,recipient,subject,body,status,provider,metadata,is_read,has_attachments,received_at,sent_at,created_at").eq("thread_id", threadId).order("created_at", { ascending: false }),
    threadResult.data.lead_id
      ? supabase.from("leads").select("id,name,email,phone,project_type").eq("id", threadResult.data.lead_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    threadResult.data.customer_id
      ? supabase.from("customers").select("id,customer_name,email,phone,project_type").eq("id", threadResult.data.customer_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase.from("team_members").select("id,name").eq("status", "active").order("name", { ascending: true }),
  ]);

  const matchedRecord = leadResult.data ?? customerResult.data;
  const recipient = matchedRecord?.email ?? threadResult.data.participant_addresses[0] ?? null;
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

  return <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
    <Link href="/sales/communications" className="text-sm font-bold text-blue-400">← Back to Customer Inbox</Link>
    <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_240px]"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-blue-400">{threadResult.data.department} · {threadResult.data.status}</p><h1 className="mt-2 text-3xl font-bold text-white">{threadResult.data.subject || "(No subject)"}</h1><p className="mt-2 text-sm text-slate-400">{threadResult.data.participant_addresses.join(" · ")}</p><div className="mt-4">{leadResult.data ? <Link href={`/sales/leads/${leadResult.data.id}`} className="inline-flex rounded-lg border border-emerald-800 bg-emerald-950/40 px-4 py-2 text-sm font-bold text-emerald-300">Open {leadResult.data.name}</Link> : customerResult.data ? <Link href={`/sales/customers/${customerResult.data.id}`} className="inline-flex rounded-lg border border-emerald-800 bg-emerald-950/40 px-4 py-2 text-sm font-bold text-emerald-300">Open {customerResult.data.customer_name}</Link> : <span className="rounded-lg border border-amber-800 bg-amber-950/40 px-4 py-2 text-sm font-bold text-amber-300">Customer match needed</span>}</div></div><aside className="rounded-xl border border-slate-800 bg-slate-950/60 p-4"><CommunicationThreadControls threadId={threadId} status={threadResult.data.status} unreadCount={threadResult.data.unread_count} assignedToId={threadResult.data.assigned_to_id} teamMembers={teamMembers} /></aside></div>

    <CommunicationThreadMessages messages={messages} />

    <section id="reply" className="mt-7 scroll-mt-24 border border-slate-800 bg-slate-950/50 p-5"><h2 className="font-bold text-slate-200">Reply from Mission Control</h2><p className="mt-2 text-sm text-slate-500">Your reply will stay attached to this matched customer conversation.</p><div className="mt-5"><CommunicationReplyComposer tone="dark" recipient={recipient} threadId={threadId} leadId={threadResult.data.lead_id} customerId={threadResult.data.customer_id} initialSubject={threadResult.data.subject} /></div></section>
    <div id="thread-bottom" className="flex justify-end py-5"><a href="#thread-messages-top" className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-bold text-slate-300 hover:border-blue-700 hover:text-blue-300">↑ Back to top</a></div>
  </main>;
}
