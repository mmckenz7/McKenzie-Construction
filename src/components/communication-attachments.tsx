"use client";

import { useState } from "react";

type Attachment = {
  id: string;
  name: string;
  contentType: string;
  size: number;
  isInline: boolean;
  kind: string;
  canDownload: boolean;
};

function fileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function CommunicationAttachments({ messageId }: { messageId: string }) {
  const [attachments, setAttachments] = useState<Attachment[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/communications/messages/${messageId}/attachments`, { cache: "no-store" });
      const result = await response.json() as { success?: boolean; attachments?: Attachment[]; error?: string };
      if (!response.ok || !result.success) {
        setError(result.error ?? "Attachments could not be loaded.");
        return;
      }
      setAttachments(result.attachments ?? []);
    } catch {
      setError("Attachments could not be loaded. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  if (attachments === null) {
    return <div className="mt-4"><button type="button" disabled={loading} onClick={load} className="rounded-lg border border-blue-900/60 bg-blue-950/30 px-3 py-2 text-xs font-bold text-blue-300 disabled:opacity-50">{loading ? "Loading attachments…" : "View attachments"}</button>{error ? <p role="alert" className="mt-2 text-xs font-semibold text-rose-400">{error}</p> : null}</div>;
  }

  return <div className="mt-4 rounded-lg border border-blue-900/60 bg-blue-950/20 p-3">
    <p className="text-xs font-bold uppercase tracking-wider text-blue-300">Attachments</p>
    {attachments.length === 0 ? <p className="mt-2 text-xs text-slate-400">Microsoft 365 reported no downloadable attachments.</p> : <ul className="mt-2 space-y-2">{attachments.map((attachment) => <li key={attachment.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-950/60 px-3 py-2"><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-200">{attachment.name}</p><p className="mt-0.5 text-xs text-slate-500">{fileSize(attachment.size)}{attachment.isInline ? " · Inline" : ""}</p></div>{attachment.canDownload ? <a href={`/api/communications/messages/${messageId}/attachments/${encodeURIComponent(attachment.id)}`} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-bold text-blue-300">Download</a> : <span className="text-xs font-semibold text-slate-500">Cloud link</span>}</li>)}</ul>}
  </div>;
}
