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
    <div className="sticky top-3 z-10 mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/95 p-3 shadow-xl shadow-slate-950/30 backdrop-blur">
      <div>
        <p className="text-sm font-bold text-slate-200">Conversation</p>
        <p className="mt-0.5 text-xs text-slate-500">{messages.length} {messages.length === 1 ? "message" : "messages"} · {order === "newest" ? "Newest first" : "Oldest first"}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-xs font-bold text-slate-400">
          <span>Message order</span>
          <select
            aria-label="Message order"
            value={order}
            onChange={(event) => setOrder(event.target.value === "oldest" ? "oldest" : "newest")}
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-semibold text-slate-100 outline-none focus:border-blue-500"
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </select>
        </label>
        <a href="#thread-bottom" className="rounded-lg border border-blue-800 bg-blue-950/40 px-3 py-2 text-xs font-bold text-blue-300 hover:bg-blue-950/70">Jump to bottom ↓</a>
      </div>
    </div>

    {orderedMessages.length ? <div className="space-y-4">{orderedMessages.map((message) => {
      const inbound = message.direction === "inbound";
      return <article key={message.id} className={`max-w-4xl border p-5 ${inbound ? "mr-auto border-slate-800 bg-slate-950/70" : "ml-auto border-blue-900 bg-blue-950/30"}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><p className="text-sm font-bold text-slate-200">{inbound ? message.sender : message.recipient}</p><p className="mt-1 text-xs text-slate-500">{inbound ? "Customer reply" : "McKenzie Construction"}</p></div>
          <div className="text-right"><p className="text-xs text-slate-500">{timestamp(message.occurredAt)}</p>{inbound && !message.isRead ? <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-blue-400">Unread</p> : null}</div>
        </div>
        <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-slate-300">{message.body}</p>
        {message.hasAttachments && message.provider === "microsoft_graph" ? <CommunicationAttachments messageId={message.id} /> : null}
        {!inbound && message.hasAttachments ? <div className="mt-4 rounded-lg border border-blue-900/60 bg-blue-950/20 p-3">
          <p className="text-xs font-bold uppercase tracking-wider text-blue-300">Sent attachments</p>
          {message.sentAttachments.length ? <ul className="mt-2 space-y-1">{message.sentAttachments.map((attachment) => <li key={`${attachment.filename}:${attachment.size}`} className="flex justify-between gap-3 text-xs text-slate-400"><span className="truncate">{attachment.filename}</span><span>{attachmentSize(attachment.size)}</span></li>)}</ul> : <p className="mt-2 text-xs text-slate-400">Attachments were included with this email.</p>}
        </div> : null}
      </article>;
    })}</div> : <div className="border border-dashed border-slate-800 bg-slate-950/40 p-6 text-sm text-slate-500">No messages are in this conversation yet.</div>}
  </section>;
}
