// 최소 서비스워커: 푸시 수신 → 알림, 클릭 → /chat.
self.addEventListener("push", (event) => {
  let d = {};
  try {
    d = event.data ? event.data.json() : {};
  } catch {}
  event.waitUntil(self.registration.showNotification(d.title || "", { body: d.body || "", data: { url: d.url || "/chat" } }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/chat";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) if ("focus" in c) return c.navigate(url).then((x) => (x || c).focus());
      return self.clients.openWindow(url);
    }),
  );
});
