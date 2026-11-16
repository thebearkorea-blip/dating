/** 그의 쪽 입력 중 점 3개. aria-label은 문구 사전(status.typingLabel)에서 받는다. reduced-motion이면 정지. */
export function TypingStatus({ typing, label }: { typing: boolean; label?: string }) {
  if (!typing) return null;
  return (
    <div className="mt-2 flex items-start" role="status" aria-label={label ?? "Typing"}>
      <style>{`
        .typing-dot{width:7px;height:7px;border-radius:9999px;background:var(--color-ink-soft);opacity:.55;animation:typing-bounce 1.2s ease-in-out infinite}
        @keyframes typing-bounce{0%,60%,100%{opacity:.35;transform:translateY(0)}30%{opacity:.9;transform:translateY(-3px)}}
        @media (prefers-reduced-motion: reduce){.typing-dot{animation:none}}
      `}</style>
      <div className="flex items-center gap-1 rounded-[var(--radius-bubble)] bg-[var(--color-bubble-his)] px-3.5 py-3" aria-hidden="true">
        <span className="typing-dot" />
        <span className="typing-dot" style={{ animationDelay: "160ms" }} />
        <span className="typing-dot" style={{ animationDelay: "320ms" }} />
      </div>
    </div>
  );
}
