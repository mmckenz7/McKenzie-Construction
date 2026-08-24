"use client";

import Link from "next/link";
import { useState } from "react";

import { CommunicationReplyComposer } from "@/components/communication-reply-composer";
import { TextMessageComposer } from "@/components/text-message-composer";

type CustomerCommunicationPanelProps = {
  email: string | null;
  phone: string | null;
  leadId?: string | null;
  customerId?: string | null;
  emailThreadId?: string | null;
  smsThreadId?: string | null;
  initialSubject: string;
  threads?: Array<{
    id: string;
    subject: string | null;
    provider: string;
    last_message_at: string;
  }>;
};

function formatConversationDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function CustomerCommunicationPanel(props: CustomerCommunicationPanelProps) {
  const initialChannel = props.email ? "email" : "sms";
  const [channel, setChannel] = useState<"email" | "sms">(initialChannel);
  return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 px-5 py-4 sm:px-6">
      <div><p className="text-[11px] font-semibold uppercase tracking-[.16em] text-slate-500">Customer communication</p><h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-950">Start or continue a conversation</h2></div>
      <div className="inline-flex rounded-lg bg-slate-100 p-1" aria-label="Communication channel">
        <button type="button" disabled={!props.email} onClick={() => setChannel("email")} className={`min-h-9 rounded-md px-3 text-sm font-semibold transition ${channel === "email" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-800"} disabled:opacity-35`}>Email</button>
        <button type="button" disabled={!props.phone} onClick={() => setChannel("sms")} className={`min-h-9 rounded-md px-3 text-sm font-semibold transition ${channel === "sms" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-800"} disabled:opacity-35`}>Text</button>
      </div>
    </header>
    <div className="p-5 sm:p-6">
      {channel === "email" ? <CommunicationReplyComposer recipient={props.email} threadId={props.emailThreadId} leadId={props.leadId} customerId={props.customerId} initialSubject={props.initialSubject} /> : <TextMessageComposer recipient={props.phone} threadId={props.smsThreadId} leadId={props.leadId} customerId={props.customerId} />}
      {props.threads?.length ? <div className="mt-5 border-t border-slate-200 pt-4">
        <p className="text-[11px] font-semibold uppercase tracking-[.16em] text-slate-500">Conversation history</p>
        <div className="mt-2 divide-y divide-slate-200 rounded-lg border border-slate-200">
          {props.threads.map((thread) => <Link key={thread.id} href={`/sales/communications/${thread.id}`} className="flex min-h-11 items-center justify-between gap-3 bg-white px-3 py-2 text-sm transition hover:bg-slate-50">
            <span className="min-w-0 truncate font-semibold text-slate-900">{thread.subject || (thread.provider === "twilio" ? "Text conversation" : "Email conversation")}</span>
            <span className="shrink-0 text-xs text-slate-500">{formatConversationDate(thread.last_message_at)}</span>
          </Link>)}
        </div>
      </div> : null}
    </div>
  </section>;
}
