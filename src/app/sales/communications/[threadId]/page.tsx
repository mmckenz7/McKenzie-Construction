import Link from "next/link";
import { notFound } from "next/navigation";

import { createAdminServerClient } from "@/lib/supabase/admin-server";
import { CommunicationReplyComposer } from "@/components/communication-reply-composer";
import { CommunicationThreadMatch } from "@/components/communication-thread-match";
import { CommunicationThreadControls } from "@/components/communication-thread-controls";
import { CommunicationThreadMessages } from "@/components/communication-thread-messages";
import { TextMessageComposer } from "@/components/text-message-composer";
import {
  automatedConversationLabel,
  findInternalThreadParticipant,
  findVendorThreadParticipant,
  threadCounterpartyAddresses,
  type VendorParticipant,
} from "@/lib/communications/thread-classification";
import { emailRecipientsFromMetadata } from "@/lib/communications/email-recipients";

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
  const threadResult = await supabase.from("communication_threads").select("id,provider,subject,department,status,lead_id,customer_id,assigned_to_id,participant_addresses,unread_count,last_message_at").eq("id", threadId).eq("security_disposition", "normal").maybeSingle();

  if (threadResult.error || !threadResult.data) notFound();

  const [messagesResult, leadResult, customerResult, teamResult, mailboxResult, matchLeadsResult, matchCustomersResult, suppliersResult] = await Promise.all([
    supabase.from("communication_messages").select("id,channel,direction,sender,recipient,subject,body,status,provider,metadata,is_read,has_attachments,received_at,sent_at,created_at").eq("thread_id", threadId).eq("security_disposition", "normal").order("created_at", { ascending: false }),
    threadResult.data.lead_id
      ? supabase.from("leads").select("id,name,email,phone,project_type").eq("id", threadResult.data.lead_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    threadResult.data.customer_id
      ? supabase.from("customers").select("id,customer_name,email,phone,project_type,source_lead_id").eq("id", threadResult.data.customer_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase.from("team_members").select("id,name,email").eq("status", "active").order("name", { ascending: true }),
    supabase.from("communication_mailboxes").select("address").eq("is_active", true).order("created_at", { ascending: true }).limit(1).maybeSingle(),
    !threadResult.data.lead_id && !threadResult.data.customer_id
      ? supabase.from("leads").select("id,name,email,phone,status").neq("status", "lost").order("name", { ascending: true }).limit(250)
      : Promise.resolve({ data: [], error: null }),
    !threadResult.data.lead_id && !threadResult.data.customer_id
      ? supabase.from("customers").select("id,customer_name,email,phone,status").neq("status", "inactive").order("customer_name", { ascending: true }).limit(250)
      : Promise.resolve({ data: [], error: null }),
    supabase.from("suppliers").select("id,name,supplier_locations(email,contact_email,is_active)").eq("is_active", true),
  ]);

  const hubThreads = new Map<string, { id: string; provider: string; subject: string | null; last_message_at: string }>([
    [threadResult.data.id, { id: threadResult.data.id, provider: threadResult.data.provider, subject: threadResult.data.subject, last_message_at: threadResult.data.last_message_at }],
  ]);
  const hubThreadQueries = [
    threadResult.data.customer_id
      ? supabase.from("communication_threads").select("id,provider,subject,last_message_at").eq("customer_id", threadResult.data.customer_id).eq("security_disposition", "normal")
      : null,
    threadResult.data.lead_id
      ? supabase.from("communication_threads").select("id,provider,subject,last_message_at").eq("lead_id", threadResult.data.lead_id).eq("security_disposition", "normal")
      : null,
    customerResult.data?.source_lead_id
      ? supabase.from("communication_threads").select("id,provider,subject,last_message_at").eq("lead_id", customerResult.data.source_lead_id).eq("security_disposition", "normal")
      : null,
  ].filter((query) => query !== null);
  for (const query of hubThreadQueries) {
    const result = await query;
    if (!result.error) for (const thread of result.data ?? []) hubThreads.set(String(thread.id), {
      id: String(thread.id), provider: String(thread.provider), subject: thread.subject ? String(thread.subject) : null, last_message_at: String(thread.last_message_at),
    });
  }
  const orderedHubThreads = [...hubThreads.values()].sort((left, right) => Date.parse(right.last_message_at) - Date.parse(left.last_message_at));
  const hubMessagesResult = orderedHubThreads.length > 1
    ? await supabase.from("communication_messages").select("id,channel,direction,sender,recipient,subject,body,status,provider,metadata,is_read,has_attachments,received_at,sent_at,created_at").in("thread_id", orderedHubThreads.map((thread) => thread.id)).eq("security_disposition", "normal").order("created_at", { ascending: false })
    : messagesResult;

  const matchedRecord = customerResult.data ?? leadResult.data;
  const isTextThread = threadResult.data.provider === "twilio";
  const activeTeam = (teamResult.data ?? []).map((member) => ({ id: String(member.id), name: String(member.name), email: String(member.email ?? "") }));
  const teamMembers = activeTeam.map((member) => ({ id: member.id, name: member.name }));
  const latestMessage = messagesResult.data?.[0];
  const counterparties = threadCounterpartyAddresses(latestMessage);
  const recipient = isTextThread
    ? matchedRecord?.phone ?? threadResult.data.participant_addresses.at(-1) ?? null
    : matchedRecord?.email ?? counterparties[0] ?? null;
  const emailThread = orderedHubThreads.find((thread) => thread.provider !== "twilio") ?? null;
  const textThread = orderedHubThreads.find((thread) => thread.provider === "twilio") ?? null;
  const emailRecipient = matchedRecord?.email ?? (!isTextThread ? counterparties[0] : null) ?? null;
  const textRecipient = matchedRecord?.phone ?? (isTextThread ? threadResult.data.participant_addresses.at(-1) : null) ?? null;
  const internalMember = !matchedRecord
    ? findInternalThreadParticipant(threadCounterpartyAddresses(latestMessage), activeTeam, [mailboxResult.data?.address])
    : null;
  const vendors: VendorParticipant[] = (suppliersResult.data ?? []).map((supplier) => ({
    id: String(supplier.id),
    name: String(supplier.name),
    emails: (supplier.supplier_locations ?? []).flatMap((location) => location.is_active === false
      ? []
      : [location.email, location.contact_email].filter((email): email is string => Boolean(email))),
  }));
  const vendor = !matchedRecord && !internalMember
    ? findVendorThreadParticipant(threadCounterpartyAddresses(latestMessage), vendors)
    : null;
  const automated = !matchedRecord && !internalMember && !vendor
    ? automatedConversationLabel(latestMessage)
    : null;
  const messages = (hubMessagesResult.data ?? []).map((message) => ({
    id: String(message.id),
    direction: String(message.direction),
    sender: String(message.sender),
    recipient: String(message.recipient),
    body: String(message.body),
    provider: String(message.provider),
    channel: message.channel === "sms" ? "sms" as const : "email" as const,
    isRead: Boolean(message.is_read),
    hasAttachments: Boolean(message.has_attachments),
    occurredAt: String(message.received_at ?? message.sent_at ?? message.created_at),
    sentAttachments: message.direction === "outbound" && message.has_attachments ? sentAttachments(message.metadata) : [],
    ccRecipients: message.direction === "outbound" ? emailRecipientsFromMetadata(message.metadata, "cc_recipients") : [],
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
    <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_240px]"><div><div className="flex flex-wrap items-center gap-2">{[...new Set(orderedHubThreads.map((thread) => thread.provider === "twilio" ? "Text" : "Email"))].map((label) => <span key={label} className="rounded-full bg-slate-900 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-white">{label}</span>)}<span className="text-xs font-semibold uppercase tracking-[.16em] text-slate-500">{threadResult.data.department} · {threadResult.data.status}</span></div><h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{matchedRecord ? `${"customer_name" in matchedRecord ? matchedRecord.customer_name : matchedRecord.name} communication hub` : threadResult.data.subject || "Conversation"}</h1><p className="mt-2 text-sm text-slate-500">{matchedRecord ? `${messages.length} messages across ${orderedHubThreads.length} provider ${orderedHubThreads.length === 1 ? "thread" : "threads"}` : threadResult.data.participant_addresses.join(" · ")}</p><div className="mt-4">{customerResult.data ? <Link href={`/sales/customers/${customerResult.data.id}`} className="inline-flex min-h-9 items-center rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800 shadow-sm hover:border-slate-400">Open {customerResult.data.customer_name}</Link> : leadResult.data ? <Link href={`/sales/leads/${leadResult.data.id}`} className="inline-flex min-h-9 items-center rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800 shadow-sm hover:border-slate-400">Open {leadResult.data.name}</Link> : internalMember ? <span className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-800">Internal · {internalMember.name} · Unassigned</span> : vendor ? <span className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-semibold text-violet-800">Vendor · {vendor.name} · Unassigned</span> : automated ? <span className="rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700">{automated}</span> : <span className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">Review before matching</span>}</div></div>{orderedHubThreads.length === 1 ? <aside className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><CommunicationThreadControls threadId={threadId} status={threadResult.data.status} unreadCount={threadResult.data.unread_count} assignedToId={threadResult.data.assigned_to_id} teamMembers={teamMembers} mailboxOnly={!matchedRecord} /></aside> : <aside className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600 shadow-sm"><p className="font-semibold text-slate-900">Unified customer history</p><p className="mt-2">{orderedHubThreads.length} source threads are retained separately for provider delivery and audit safety.</p></aside>}</div>

    <CommunicationThreadMessages messages={messages} />

    {matchedRecord ? <section id="reply" className="mt-7 scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-semibold text-slate-950">Continue this customer conversation</h2><p className="mt-1 text-sm text-slate-500">Choose the channel that fits this message. Email and text remain together in the customer history.</p><div className="mt-5 grid gap-5 xl:grid-cols-2">{emailRecipient ? <div className="rounded-xl border border-slate-200 p-4"><h3 className="mb-4 font-semibold text-slate-900">Reply by email</h3><CommunicationReplyComposer recipient={emailRecipient} threadId={emailThread?.id} leadId={threadResult.data.lead_id} customerId={threadResult.data.customer_id} initialSubject={emailThread?.subject ?? null} /></div> : null}{textRecipient ? <div className="rounded-xl border border-slate-200 p-4"><h3 className="mb-4 font-semibold text-slate-900">Reply by text</h3><TextMessageComposer recipient={textRecipient} threadId={textThread?.id} leadId={threadResult.data.lead_id} customerId={threadResult.data.customer_id} /></div> : null}</div></section> : automated ? <section className="mt-7 rounded-2xl border border-slate-200 bg-slate-100 p-5"><h2 className="font-semibold text-slate-950">{automated}</h2><p className="mt-1 text-sm text-slate-700">Kept in the company inbox without creating an assignment or CRM record. Automated notifications are not replyable here.</p></section> : recipient ? <><section id="reply" className="mt-7 scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-semibold text-slate-950">Reply from Company Inbox</h2><p className="mt-1 text-sm text-slate-500">{internalMember ? `Reply to ${internalMember.name} without assigning this internal conversation.` : vendor ? `Reply to ${vendor.name} without assigning this vendor conversation.` : "Reply now without forcing a lead, customer, or project assignment."}</p><div className="mt-5">{isTextThread ? <TextMessageComposer recipient={recipient} threadId={threadId} /> : <CommunicationReplyComposer recipient={recipient} threadId={threadId} initialSubject={threadResult.data.subject} />}</div></section>{!internalMember && !vendor ? <CommunicationThreadMatch threadId={threadId} leads={matchLeads} customers={matchCustomers} canCreateLead={isTextThread} /> : null}</> : <CommunicationThreadMatch threadId={threadId} leads={matchLeads} customers={matchCustomers} canCreateLead={isTextThread} />}
    <div id="thread-bottom" className="flex justify-end py-5"><a href="#thread-messages-top" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:text-slate-950">↑ Back to top</a></div>
    </div>
  </main>;
}
