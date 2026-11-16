"use client";

/**
 * 말풍선 모서리의 반응 칩. 그의 말풍선에는 내 반응(탭하면 취소), 내 말풍선에는 그의 반응.
 * pop=true면 처음 나타날 때 톡 튀어나온다(reduced-motion이면 정지, globals.css).
 */
export function ReactionBar({
  reactions,
  mine,
  pop,
  yoursLabel,
  removeLabel,
  hisLabel,
  onRemove,
}: {
  reactions: { user?: string; char?: string };
  /** 이 말풍선이 내 메시지면 true. */
  mine: boolean;
  pop?: boolean;
  /** "{emoji}" 자리표시자 포함 문구. */
  yoursLabel: string;
  removeLabel: string;
  hisLabel: string;
  onRemove?: () => void;
}) {
  const fill = (tpl: string, emoji: string) => tpl.replace("{emoji}", emoji);
  if (mine) {
    const e = reactions.char;
    if (!e) return null;
    return (
      <span role="img" aria-label={fill(hisLabel, e)} className={`reaction-chip -left-2 ${pop ? "reaction-pop" : ""}`}>
        {e}
      </span>
    );
  }
  const e = reactions.user;
  if (!e) return null;
  return (
    <button
      type="button"
      aria-label={`${fill(yoursLabel, e)}. ${fill(removeLabel, e)}`}
      className="reaction-chip -right-2"
      onClick={(ev) => {
        ev.stopPropagation();
        onRemove?.();
      }}
      onKeyDown={(ev) => ev.stopPropagation()}
    >
      {e}
    </button>
  );
}
