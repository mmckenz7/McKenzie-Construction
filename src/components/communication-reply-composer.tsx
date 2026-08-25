"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import {
  MAX_OUTBOUND_ATTACHMENTS,
  MAX_OUTBOUND_ATTACHMENT_BYTES,
  outboundAttachmentError,
} from "@/lib/communications/outbound-attachment-core";
import { prepareSecondaryEmailRecipients } from "@/lib/communications/email-recipients";

type CommunicationReplyComposerProps = {
  recipient: string | null;
  threadId?: string | null;
  leadId?: string | null;
  customerId?: string | null;
  initialSubject?: string | null;
  tone?: "light" | "dark";
  editableRecipient?: boolean;
};

function replySubject(subject: string | null | undefined) {
  const value = subject?.trim() ?? "";
  if (!value) return "";
  return /^re:/i.test(value) ? value : `Re: ${value}`;
}

export function CommunicationReplyComposer({
  recipient,
  threadId = null,
  leadId = null,
  customerId = null,
  initialSubject = null,
  tone = "light",
  editableRecipient = false,
}: CommunicationReplyComposerProps) {
  const router = useRouter();
  const [to, setTo] = useState(recipient ?? "");
  const [subject, setSubject] = useState(replySubject(initialSubject));
  const [body, setBody] = useState("");
  const [attachments, setAttachments] = useState<File[]>([]);
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const dark = tone === "dark";
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function submitReply(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const effectiveRecipient = editableRecipient ? to.trim() : recipient;
    if (!effectiveRecipient || submitting) return;
    setSubmitting(true);
    setNotice(null);

    try {
      const validationError = outboundAttachmentError(attachments);
      if (validationError) throw new Error(validationError);
      const preparedRecipients = prepareSecondaryEmailRecipients(effectiveRecipient, cc, bcc);
      if (preparedRecipients.error) throw new Error(preparedRecipients.error);
      const form = new FormData();
      if (threadId) {
        form.set("threadId", threadId);
      } else {
        if (leadId) form.set("leadId", leadId);
        if (customerId) form.set("customerId", customerId);
      }
      if (editableRecipient) form.set("recipient", effectiveRecipient);
      form.set("subject", subject);
      form.set("body", body);
      form.set("ccRecipients", cc);
      form.set("bccRecipients", bcc);
      attachments.forEach((file) => form.append("attachments", file));
      const response = await fetch("/api/communications/replies", {
        method: "POST",
        body: form,
      });
      const result = await response.json() as { success?: boolean; error?: string };
      if (!response.ok || !result.success) {
        throw new Error(result.error || "The reply could not be sent.");
      }
      setBody("");
      setAttachments([]);
      setCc("");
      setBcc("");
      if (editableRecipient) {
        setTo("");
        setSubject("");
      }
      if (fileInputRef.current) fileInputRef.current.value = "";
      setNotice({ kind: "success", text: editableRecipient ? "Email sent and added to the company inbox." : "Reply sent and added to this conversation." });
      router.refresh();
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "The reply could not be sent.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  const inputClass = dark
    ? "border-slate-700 bg-slate-900 text-slate-100 placeholder:text-slate-600"
    : "border-slate-300 bg-white text-slate-950 placeholder:text-slate-400";
  const effectiveRecipient = editableRecipient ? to.trim() : recipient;

  return <form onSubmit={submitReply} className="space-y-4">
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1"><p className={`text-xs font-bold uppercase tracking-widest ${dark ? "text-slate-500" : "text-slate-500"}`}>To</p>{editableRecipient ? <input aria-label="To" type="email" className={`mt-1 w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:border-blue-500 ${inputClass}`} value={to} onChange={(event) => setTo(event.target.value)} placeholder="name@example.com" required disabled={submitting} /> : <p className={`mt-1 break-all text-sm font-semibold ${dark ? "text-slate-300" : "text-slate-800"}`}>{recipient || "No email recipient is available"}</p>}</div>
        <div className="flex gap-2"><button type="button" onClick={() => setShowCc(true)} className={`text-xs font-bold ${dark ? "text-blue-400" : "text-blue-700"}`}>Cc</button><button type="button" onClick={() => setShowBcc(true)} className={`text-xs font-bold ${dark ? "text-blue-400" : "text-blue-700"}`}>Bcc</button></div>
      </div>
    </div>
    {showCc ? <label className="block"><span className={`mb-1 block text-xs font-bold uppercase tracking-widest ${dark ? "text-slate-500" : "text-slate-500"}`}>Cc</span><input className={`w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:border-blue-500 ${inputClass}`} value={cc} onChange={(event) => setCc(event.target.value)} placeholder="name@example.com, another@example.com" disabled={!effectiveRecipient || submitting} /></label> : null}
    {showBcc ? <label className="block"><span className={`mb-1 block text-xs font-bold uppercase tracking-widest ${dark ? "text-slate-500" : "text-slate-500"}`}>Bcc</span><input className={`w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:border-blue-500 ${inputClass}`} value={bcc} onChange={(event) => setBcc(event.target.value)} placeholder="private-copy@example.com" disabled={!effectiveRecipient || submitting} /><span className={`mt-1 block text-xs ${dark ? "text-slate-600" : "text-slate-500"}`}>Bcc recipients are hidden from everyone else on the email.</span></label> : null}
    <label className="block">
      <span className={`mb-1 block text-xs font-bold uppercase tracking-widest ${dark ? "text-slate-500" : "text-slate-500"}`}>Subject</span>
      <input className={`w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:border-blue-500 read-only:cursor-not-allowed read-only:opacity-75 ${inputClass}`} value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={300} required readOnly={Boolean(threadId)} disabled={!effectiveRecipient || submitting} />
      {threadId ? <span className={`mt-1 block text-xs ${dark ? "text-slate-600" : "text-slate-500"}`}>The subject stays locked so Outlook keeps this reply in the same conversation.</span> : null}
    </label>
    <div>
      <label className="block">
        <span className={`mb-1 block text-xs font-bold uppercase tracking-widest ${dark ? "text-slate-500" : "text-slate-500"}`}>Attachments</span>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif"
          disabled={!effectiveRecipient || submitting}
          className={`block w-full rounded-lg border px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-blue-600 file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-white ${inputClass}`}
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            const validationError = outboundAttachmentError(files);
            if (validationError) {
              setAttachments([]);
              event.target.value = "";
              setNotice({ kind: "error", text: validationError });
              return;
            }
            setAttachments(files);
            setNotice(null);
          }}
        />
      </label>
      <p className={`mt-1 text-xs ${dark ? "text-slate-600" : "text-slate-500"}`}>Up to {MAX_OUTBOUND_ATTACHMENTS} PDF or image files, {MAX_OUTBOUND_ATTACHMENT_BYTES / 1024 / 1024} MB total.</p>
      {attachments.length ? <ul className="mt-2 space-y-1">{attachments.map((file) => <li key={`${file.name}:${file.size}`} className={`flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-xs ${dark ? "bg-slate-900 text-slate-300" : "bg-slate-100 text-slate-700"}`}><span className="truncate">{file.name}</span><button type="button" disabled={submitting} onClick={() => setAttachments((current) => current.filter((candidate) => candidate !== file))} className="font-bold text-rose-500">Remove</button></li>)}</ul> : null}
    </div>
    <label className="block">
      <span className={`mb-1 block text-xs font-bold uppercase tracking-widest ${dark ? "text-slate-500" : "text-slate-500"}`}>Message</span>
      <textarea className={`min-h-36 w-full resize-y rounded-lg border px-3 py-3 text-sm leading-6 outline-none focus:border-blue-500 ${inputClass}`} value={body} onChange={(event) => setBody(event.target.value)} maxLength={20000} placeholder={editableRecipient ? "Write your email…" : "Write your reply…"} required disabled={!effectiveRecipient || submitting} />
    </label>
    {notice ? <p role="status" className={`rounded-lg border px-3 py-2 text-sm font-semibold ${notice.kind === "success" ? "border-emerald-700/40 bg-emerald-950/30 text-emerald-500" : "border-red-700/40 bg-red-950/30 text-red-500"}`}>{notice.text}</p> : null}
    <div className="flex flex-wrap items-center gap-3">
      <button type="submit" disabled={!effectiveRecipient || submitting} className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50">{submitting ? "Sending…" : editableRecipient ? "Send email" : "Send reply"}</button>
      <p className={`text-xs ${dark ? "text-slate-500" : "text-slate-500"}`}>Sending follows the company sandbox and delivery settings.</p>
    </div>
  </form>;
}
