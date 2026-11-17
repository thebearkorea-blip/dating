"use client";

import { getStrings } from "@/product";

// 루트 레이아웃까지 실패한 경우라 토큰 CSS가 없을 수 있다. 인라인 스타일만 쓴다.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const s = getStrings();
  return (
    <html>
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#f6f3f8", color: "#1d1a24" }}>
        <main style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: 24, textAlign: "center" }}>
          <h1 style={{ fontSize: 20, margin: 0 }}>{s["err.error.title"]}</h1>
          <p style={{ fontSize: 14, margin: 0, color: "#6b6577" }}>{s["err.error.body"]}</p>
          <button type="button" onClick={reset} style={{ background: "#5b4bdb", color: "#fff", border: 0, borderRadius: 12, padding: "12px 24px", fontWeight: 600, fontSize: 16 }}>
            {s["err.error.retry"]}
          </button>
        </main>
      </body>
    </html>
  );
}
