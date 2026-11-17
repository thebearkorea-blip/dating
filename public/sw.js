// 최소 서비스워커: 푸시 수신 → 알림, 클릭 → /chat. 탐색 요청만 network-first, 실패 시 /offline.html.
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open("offline-v1").then((c) => c.add(OFFLINE_URL)));
  self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(fetch(event.request).catch(() => caches.match(OFFLINE_URL).then((r) => r || Response.error())));
});

self.addEventListener("push", (event) => {
  let d = {};
  try {
    d = event.data ? event.data.json() : {};
  } catch {}
  const options = {
    body: d.body || "",
    icon: "/pwa-icon/192",
    badge: "/pwa-icon/192",
    // 같은 관계의 알림은 하나로 묶는다(tag). 서버가 relId/tag를 안 보내면 기본 tag.
    tag: d.tag || (d.relId ? "rel-" + d.relId : "chat"),
    renotify: true,
    data: { url: d.url || "/chat" },
  };
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(d.title || "", options),
      self.navigator && self.navigator.setAppBadge ? self.navigator.setAppBadge().catch(() => {}) : null,
    ]),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/chat";
  const clear = self.navigator && self.navigator.clearAppBadge ? self.navigator.clearAppBadge().catch(() => {}) : null;
  event.waitUntil(
    Promise.all([
      clear,
      self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
        for (const c of list) if ("focus" in c) return c.navigate(url).then((x) => (x || c).focus());
        return self.clients.openWindow(url);
      }),
    ]),
  );
});
