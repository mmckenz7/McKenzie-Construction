function safeNotificationDestination(value) {
  if (value === "/communications") return value;
  return typeof value === "string" &&
    /^\/communications\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null;
}

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    return;
  }
  const titles = {
    inbound_text: "New McKenzie text",
    incoming_call: "Incoming McKenzie call",
    missed_call: "Missed McKenzie call",
    test: "McKenzie notifications",
  };
  const title = titles[payload.kind];
  const identity = typeof payload.identity === "string" && payload.identity.length <= 80
    ? payload.identity
    : "Unknown number";
  const preview = payload.kind === "inbound_text" &&
    typeof payload.preview === "string" && payload.preview.length <= 72
    ? payload.preview
    : null;
  const exactThread = safeNotificationDestination(payload.url);
  const destination = payload.kind === "test" && payload.url === "/communications"
    ? "/communications"
    : exactThread === "/communications" ? null : exactThread;
  if (!title || !destination) return;
  event.waitUntil(self.registration.showNotification(
    title,
    {
      body: preview ? `${identity}\n${preview}` : identity,
      icon: "/branding/mckenzie-app-icon-512.png",
      badge: "/branding/mckenzie-app-icon-512.png",
      tag: `${payload.kind}:${destination}`,
      renotify: true,
      data: { url: destination },
    },
  ));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const destination = safeNotificationDestination(event.notification.data?.url) ?? "/communications";
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if ("navigate" in client) await client.navigate(destination);
      if ("focus" in client) return client.focus();
    }
    return self.clients.openWindow(destination);
  })());
});
