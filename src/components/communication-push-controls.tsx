"use client";

import { useEffect, useState } from "react";

type PushConfig = { configured?: boolean; publicKey?: string; error?: string };

function keyBytes(value: string) {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const decoded = window.atob((value + padding).replaceAll("-", "+").replaceAll("_", "/"));
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}

export function CommunicationPushControls() {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [installed, setInstalled] = useState(false);
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [config, setConfig] = useState<PushConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const available = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    setSupported(available);
    setInstalled(window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);
    if (!available) return;
    void (async () => {
      const [response, registration] = await Promise.all([
        fetch("/api/communications/push-subscription", { cache: "no-store" }),
        navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }),
      ]);
      const result = await response.json() as PushConfig;
      if (!response.ok) throw new Error(result.error || "Phone notification status could not be loaded.");
      setConfig(result);
      setSubscription(await registration.pushManager.getSubscription());
    })().catch((error) => setNotice(error instanceof Error ? error.message : "Phone notification status could not be loaded."));
  }, []);

  async function enable() {
    if (!config?.configured || !config.publicKey) return;
    setBusy(true);
    setNotice("");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error("Allow notifications in your phone settings, then try again.");
      const registration = await navigator.serviceWorker.ready;
      const nextSubscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(config.publicKey) });
      const response = await fetch("/api/communications/push-subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nextSubscription),
      });
      const result = await response.json() as PushConfig;
      if (!response.ok) throw new Error(result.error || "Phone notifications could not be enabled.");
      setSubscription(nextSubscription);
      setNotice("Phone notifications are enabled for this device.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Phone notifications could not be enabled.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    if (!subscription) return;
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/communications/push-subscription", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      });
      const result = await response.json() as PushConfig;
      if (!response.ok) throw new Error(result.error || "Phone notifications could not be disabled.");
      await subscription.unsubscribe();
      setSubscription(null);
      setNotice("Phone notifications are disabled for this device.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Phone notifications could not be disabled.");
    } finally {
      setBusy(false);
    }
  }

  async function testNotification() {
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/communications/push-subscription/test", { method: "POST" });
      const result = await response.json() as PushConfig;
      if (!response.ok) throw new Error(result.error || "The test notification could not be sent.");
      setNotice("Test notification sent.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The test notification could not be sent.");
    } finally {
      setBusy(false);
    }
  }

  if (supported === null) return null;
  return <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm" aria-labelledby="phone-notifications-title">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 id="phone-notifications-title" className="font-bold text-slate-950">Phone notifications</h2>
        <p className="mt-1 max-w-2xl text-sm text-slate-600">Get a private alert showing the matched CRM name, or a masked phone number, when a new customer text reaches Company Inbox. Message content is never included.</p>
      </div>
      {subscription
        ? <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">Enabled on this device</span>
        : <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">Not enabled</span>}
    </div>
    {!supported ? <p className="mt-3 text-sm text-amber-700">This browser does not support phone notifications.</p> : null}
    {supported && !installed ? <p className="mt-3 text-sm text-blue-800">On iPhone: open this page in Safari, tap Share, choose Add to Home Screen, then open the installed McKenzie Inbox app and enable notifications.</p> : null}
    {supported && config?.configured === false ? <p className="mt-3 text-sm text-amber-700">Notification delivery is waiting for secure server setup.</p> : null}
    <div className="mt-4 flex flex-wrap gap-2">
      {!subscription
        ? <button type="button" onClick={() => void enable()} disabled={busy || !supported || !config?.configured} className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">{busy ? "Enabling…" : "Enable notifications"}</button>
        : <>
          <button type="button" onClick={() => void testNotification()} disabled={busy} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Send test notification</button>
          <button type="button" onClick={() => void disable()} disabled={busy} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 disabled:opacity-50">Disable on this device</button>
        </>}
    </div>
    {notice ? <p role="status" className="mt-3 text-sm text-slate-700">{notice}</p> : null}
  </section>;
}
