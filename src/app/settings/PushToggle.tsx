"use client";
import { useEffect, useState } from "react";
import { removePushSubscription, savePushSubscription } from "./actions";

function b64ToBytes(s: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** 푸시 구독 토글. 공개키가 없거나 브라우저가 Push를 지원하지 않으면 비활성. */
export function PushToggle({ publicKey }: { publicKey: string }) {
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const supported = typeof navigator !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && publicKey !== "";

  useEffect(() => {
    if (!supported) return;
    void navigator.serviceWorker.getRegistration("/sw.js").then(async (reg) => setOn(Boolean(reg && (await reg.pushManager.getSubscription()))));
  }, [supported]);

  async function toggle() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const cur = await reg.pushManager.getSubscription();
      if (cur) {
        await removePushSubscription(cur.endpoint);
        await cur.unsubscribe();
        setOn(false);
      } else if ((await Notification.requestPermission()) === "granted") {
        const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(publicKey) });
        const j = sub.toJSON();
        const r = await savePushSubscription({ endpoint: sub.endpoint, keys: { p256dh: j.keys?.p256dh ?? "", auth: j.keys?.auth ?? "" } });
        setOn(r.ok);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <label className="flex items-center gap-2">
      <input type="checkbox" checked={on} disabled={!supported || busy} onChange={() => void toggle()} />
      <span>Notifications{supported ? "" : " (not available in this browser)"}</span>
    </label>
  );
}
