"use client";

import { useMemo, useState } from "react";

import { CommunicationAttachments } from "@/components/communication-attachments";

type SentAttachment = {
  filename: string;
  size: number;
};

export type CommunicationThreadMessage = {
  id: string;
  direction: string;
  sender: string;
  recipient: string;
  body: string;
  provider: string;
  isRead: boolean;
  hasAttachments: boolean;
  occurredAt: string;
  sentAttachments: SentAttachment[];
  ccRecipients: string[];
};

function timestamp(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function attachmentSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function CommunicationThreadMessages({ messages }: { messages: CommunicationThreadMessage[] }) {
  const [order, setOrder] = useState<"newest" | "oldest">("newest");
  const newestMessages = useMemo(
    () => [...messages].sort((left, right) => new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime()),
    [messages],
  );
  const orderedMessages = order === "newest" ? newestMessages : [...newestMessages].reverse();

  return <section id="thread-messages-top" className="mt-7 scroll-mt-24">
    <div className="sticky top-3 z-10 mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white/95 p-3 shadow-sm backdrop-blur">
      <div>
        <p className="text-sm font-semibold text-slate-950">Conversation</p>
        <p className="mt-0.5 text-xs text-slate-500">{messages.length} {messages.length === 1 ? "message" : "messages"} · {order === "newest" ? "Newest first" : "Oldest first"}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-xs font-semibold text-slate-500">
          <span>Message order</span>
          <select
            aria-label="Message order"
            value={order}
            onChange={(event) => setOrder(event.target.value === "oldest" ? "oldest" : "newest")}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 outline-none focus:border-slate-500"
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </select>
        </label>
        <a href="#thread-bottom" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:text-slate-950">Jump to bottom ↓</a>
      </div>
    </div>

    {orderedMessages.length ? <div className="space-y-4">{orderedMessages.map((message) => {
      const inbound = message.direction === "inbound";
      return <article key={message.id} className={`max-w-4xl rounded-2xl border p-5 shadow-sm ${inbound ? "mr-auto border-slate-200 bg-white" : "ml-auto border-slate-300 bg-slate-100"}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><p className="text-sm font-semibold text-slate-950">{inbound ? message.sender : `To: ${message.recipient}`}</p><p className="mt-1 text-xs text-slate-500">{inbound ? "Incoming message" : "McKenzie Construction"}</p>{!inbound && message.ccRecipients.length ? <p className="mt-1 text-xs text-slate-500">Cc: {message.ccRecipients.join(", ")}</p> : null}</div>
          <div className="text-right"><p className="text-xs text-slate-500">{timestamp(message.occurredAt)}</p>{inbound && !message.isRead ? <p className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-blue-700">Unread</p> : null}</div>
        </div>
        <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-slate-700">{message.body}</p>
        {message.hasAttachments && message.provider === "microsoft_graph" ? <CommunicationAttachments messageId={message.id} /> : null}
        {!inbound && message.hasAttachments ? <div className="mt-4 rounded-lg border border-slate-200 bg-white p-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-600">Sent attachments</p>
          {message.sentAttachments.length ? <ul className="mt-2 space-y-1">{message.sentAttachments.map((attachment) => <li key={`${attachment.filename}:${attachment.size}`} className="flex justify-between gap-3 text-xs text-slate-500"><span className="truncate">{attachment.filename}</span><span>{attachmentSize(attachment.size)}</span></li>)}</ul> : <p className="mt-2 text-xs text-slate-500">Attachments were included with this email.</p>}
        </div> : null}
      </article>;
    })}</div> : <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">No messages are in this conversation yet.</div>}
  </section>;
}
