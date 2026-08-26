self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    return;
  }
  event.waitUntil(self.registration.showNotification(
    typeof payload.title === "string" ? payload.title : "McKenzie Company Inbox",
    {
      body: typeof payload.body === "string" ? payload.body : "A new message arrived.",
      icon: "/branding/mckenzie-app-icon-512.png",
      badge: "/branding/mckenzie-app-icon-512.png",
      tag: "mckenzie-inbound-text",
      renotify: true,
      data: { url: "/communications?channel=sms" },
    },
  ));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const destination = "/communications?channel=sms";
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if ("navigate" in client) await client.navigate(destination);
      if ("focus" in client) return client.focus();
    }
    return self.clients.openWindow(destination);
  })());
});
