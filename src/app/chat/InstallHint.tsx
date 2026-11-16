"use client";

import { useEffect, useState } from "react";

type Strings = { installHintTitle: string; installHintBody: string; installHintDismiss: string };

const DEFAULTS: Strings = {
  installHintTitle: "Add to Home Screen",
  installHintBody: "Tap Share, then Add to Home Screen to get his messages.",
  installHintDismiss: "Not now",
};

const VISITS_KEY = "chatVisits";
const HIDE_UNTIL_KEY = "installHintHideUntil";
const HIDE_MS = 7 * 24 * 60 * 60 * 1000;

function isIosSafariBrowser() {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const safari = !/CriOS|FxiOS|EdgiOS|OPiOS|GSA/.test(ua);
  const standalone = (navigator as Navigator & { standalone?: boolean }).standalone === true || window.matchMedia("(display-mode: standalone)").matches;
  return ios && safari && !standalone;
}

export function InstallHint({ strings }: { strings?: Partial<Strings> }) {
  const [show, setShow] = useState(false);
  const s = { ...DEFAULTS, ...strings };

  useEffect(() => {
    try {
      const visits = Number(localStorage.getItem(VISITS_KEY) || "0") + 1;
      localStorage.setItem(VISITS_KEY, String(visits));
      const hideUntil = Number(localStorage.getItem(HIDE_UNTIL_KEY) || "0");
      if (visits >= 3 && Date.now() >= hideUntil && isIosSafariBrowser()) setShow(true);
    } catch {}
  }, []);

  if (!show) return null;

  function dismiss() {
    try {
      localStorage.setItem(HIDE_UNTIL_KEY, String(Date.now() + HIDE_MS));
    } catch {}
    setShow(false);
  }

  return (
    <div role="status" className="mx-3 mt-2 flex items-start gap-3 rounded-2xl border border-black/10 bg-white p-3 text-sm shadow-sm">
      <div className="min-w-0 flex-1">
        <p className="font-medium">{s.installHintTitle}</p>
        <p className="mt-0.5 text-black/60">{s.installHintBody}</p>
      </div>
      <button type="button" onClick={dismiss} className="shrink-0 rounded-lg px-2 py-1 text-black/60 active:bg-black/5">
        {s.installHintDismiss}
      </button>
    </div>
  );
}
