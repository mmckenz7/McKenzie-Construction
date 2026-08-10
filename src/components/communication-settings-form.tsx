"use client";

import { useState, type FormEvent } from "react";

type Props = {
  initial: {
    emailDeliveryProvider: "manual" | "resend";
    smsDeliveryProvider: "manual" | "twilio";
    autoSendApprovedEmail: boolean;
    autoSendSmsFollowups: boolean;
    fromEmail: string;
    replyToEmail: string;
    fromPhone: string;
    resendReady: boolean;
    twilioReady: boolean;
    microsoftInboxEnabled: boolean;
    microsoftTenantId: string;
    microsoftClientId: string;
    microsoftMailboxAddress: string;
    microsoftSecretReady: boolean;
    microsoftLastSyncStatus: string;
    microsoftLastSyncAt: string;
    sandboxMode: boolean;
    testRecipients: string[];
  };
};

export function CommunicationSettingsForm({ initial }: Props) {
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [syncingInbox, setSyncingInbox] = useState(false);
  const [recipientText, setRecipientText] = useState(initial.testRecipients.join("\n"));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/communications/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emailDeliveryProvider: form.emailDeliveryProvider,
          smsDeliveryProvider: form.smsDeliveryProvider,
          autoSendApprovedEmail: form.autoSendApprovedEmail,
          autoSendSmsFollowups: form.autoSendSmsFollowups,
          fromEmail: form.fromEmail,
          replyToEmail: form.replyToEmail,
          fromPhone: form.fromPhone,
          microsoftInboxEnabled: form.microsoftInboxEnabled,
          microsoftTenantId: form.microsoftTenantId,
          microsoftClientId: form.microsoftClientId,
          microsoftMailboxAddress: form.microsoftMailboxAddress,
          sandboxMode: form.sandboxMode,
          testRecipients: recipientText.split(/[\n,]/).map((value) => value.trim()).filter(Boolean),
        }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Settings could not be saved.");
      setMessage("Communication settings saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Settings could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function syncMicrosoftInbox() {
    setSyncingInbox(true);
    setMessage("");

    try {
      const response = await fetch(
        "/api/communications/microsoft/sync",
        { method: "POST" },
      );
      const result = (await response.json()) as {
        error?: string;
        synchronized?: number;
      };

      if (!response.ok) {
        throw new Error(
          result.error ??
            "Microsoft inbox could not be synchronized.",
        );
      }

      setMessage(
        `Microsoft inbox synchronized. ${result.synchronized ?? 0} message updates processed.`,
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Microsoft inbox could not be synchronized.",
      );
    } finally {
      setSyncingInbox(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-7 space-y-6">
      <section className="border border-blue-800/50 bg-blue-950/30 p-6 shadow-sm">
        <div className="flex items-start gap-3"><input type="checkbox" checked={form.sandboxMode} onChange={(event) => setForm({ ...form, sandboxMode: event.target.checked })} /><div><h2 className="text-lg font-bold">Communication sandbox</h2><p className="mt-1 text-sm text-slate-400">While enabled, the processor cancels every message whose destination is not on the test list.</p></div></div>
        <label className="mt-5 block"><span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-400">Allowed test emails and phone numbers</span><textarea className="input min-h-28" value={recipientText} onChange={(event) => setRecipientText(event.target.value)} placeholder={"you@example.com\n+18655551212"} /><span className="mt-1 block text-xs text-slate-500">Enter one destination per line. Keep sandbox mode on until the complete workflow has been tested.</span></label>
      </section>
      <section className="border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div><h2 className="text-xl font-bold">Email delivery</h2><p className="mt-1 text-sm text-slate-600">Approved drafts can enter the delivery outbox. Manual remains the safe sandbox default.</p></div>
          <span className={`rounded-full px-3 py-1 text-xs font-bold ${form.resendReady ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}`}>{form.resendReady ? "Server key ready" : "Server key missing"}</span>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <label><span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Provider</span><select className="input" value={form.emailDeliveryProvider} onChange={(event) => setForm({ ...form, emailDeliveryProvider: event.target.value as "manual" | "resend" })}><option value="manual">Manual</option><option value="resend">Resend</option></select></label>
          <label><span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">From email</span><input className="input" value={form.fromEmail} onChange={(event) => setForm({ ...form, fromEmail: event.target.value })} placeholder="McKenzie Construction <estimates@example.com>" /></label>
          <label><span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Reply-to email</span><input className="input" type="email" value={form.replyToEmail} onChange={(event) => setForm({ ...form, replyToEmail: event.target.value })} placeholder="info@example.com" /><span className="mt-1 block text-xs text-slate-500">Customer replies go to this business inbox.</span></label>
        </div>
        <label className="mt-4 flex gap-3 border border-slate-200 bg-slate-50 p-4"><input type="checkbox" checked={form.autoSendApprovedEmail} onChange={(event) => setForm({ ...form, autoSendApprovedEmail: event.target.checked })} /><span><strong className="block text-sm">Queue approved email automatically</strong><span className="text-xs text-slate-500">Delivery still requires the Resend server key and an enabled outbox processor.</span></span></label>
      </section>

      <section className="border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><h2 className="text-xl font-bold">Microsoft 365 inbox</h2><p className="mt-1 max-w-2xl text-sm text-slate-600">Customer replies remain in Microsoft 365 and can be synchronized into Mission Control. The application secret stays in the protected server environment.</p></div>
          <span className={`rounded-full px-3 py-1 text-xs font-bold ${form.microsoftSecretReady ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}`}>{form.microsoftSecretReady ? "Server secret ready" : "Server secret missing"}</span>
        </div>
        <label className="mt-5 flex gap-3 border border-slate-200 bg-slate-50 p-4"><input type="checkbox" checked={form.microsoftInboxEnabled} onChange={(event) => setForm({ ...form, microsoftInboxEnabled: event.target.checked })} /><span><strong className="block text-sm">Enable Microsoft inbox synchronization</strong><span className="text-xs text-slate-500">Leave disabled until the Entra application has mailbox-restricted Graph permission.</span></span></label>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <label><span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Directory (tenant) ID</span><input className="input" value={form.microsoftTenantId} onChange={(event) => setForm({ ...form, microsoftTenantId: event.target.value })} placeholder="00000000-0000-0000-0000-000000000000" /></label>
          <label><span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Application (client) ID</span><input className="input" value={form.microsoftClientId} onChange={(event) => setForm({ ...form, microsoftClientId: event.target.value })} placeholder="00000000-0000-0000-0000-000000000000" /></label>
          <label><span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Mailbox to synchronize</span><input className="input" type="email" value={form.microsoftMailboxAddress} onChange={(event) => setForm({ ...form, microsoftMailboxAddress: event.target.value })} placeholder="info@example.com" /></label>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => void syncMicrosoftInbox()} disabled={syncingInbox || !form.microsoftInboxEnabled || !form.microsoftSecretReady} className="border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-800 disabled:opacity-50">{syncingInbox ? "Synchronizing…" : "Synchronize inbox now"}</button>
          <p className="text-xs text-slate-500">Status: {form.microsoftLastSyncStatus.replaceAll("_", " ")}{form.microsoftLastSyncAt ? ` · Last synchronized ${new Date(form.microsoftLastSyncAt).toLocaleString()}` : ""}</p>
        </div>
      </section>

      <section className="border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div><h2 className="text-xl font-bold">Phone and SMS</h2><p className="mt-1 text-sm text-slate-600">SMS automation is separated from voice calls. Automated voice calling remains off until consent and scripts are defined.</p></div>
          <span className={`rounded-full px-3 py-1 text-xs font-bold ${form.twilioReady ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}`}>{form.twilioReady ? "Server key ready" : "Server key missing"}</span>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <label><span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">SMS provider</span><select className="input" value={form.smsDeliveryProvider} onChange={(event) => setForm({ ...form, smsDeliveryProvider: event.target.value as "manual" | "twilio" })}><option value="manual">Manual</option><option value="twilio">Twilio</option></select></label>
          <label><span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">From phone</span><input className="input" value={form.fromPhone} onChange={(event) => setForm({ ...form, fromPhone: event.target.value })} placeholder="+18655551212" /></label>
        </div>
        <label className="mt-4 flex gap-3 border border-slate-200 bg-slate-50 p-4"><input type="checkbox" checked={form.autoSendSmsFollowups} onChange={(event) => setForm({ ...form, autoSendSmsFollowups: event.target.checked })} /><span><strong className="block text-sm">Allow automated SMS follow-ups</strong><span className="text-xs text-slate-500">No message is sent until a reviewed workflow template is connected.</span></span></label>
      </section>

      <div className="flex items-center gap-4"><button disabled={saving} className="bg-blue-600 px-5 py-3 text-sm font-bold text-white disabled:opacity-50">{saving ? "Saving…" : "Save communication settings"}</button>{message ? <p className="text-sm font-semibold text-slate-600">{message}</p> : null}</div>
    </form>
  );
}
