"use client";
import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type Ref } from "react";
import type { MessageDto } from "@/engine/chat-view";
import { reportMessage, setReaction } from "./actions";
import { MessageMenu } from "./MessageMenu";
import { PHOTO_BUBBLE_IMPLEMENTED, PhotoBubble } from "./PhotoBubble";
import { PhotoViewer } from "./PhotoViewer";
import { QuotePreview } from "./QuotePreview";
import { Rate } from "./Rate";
import { ReactionBar } from "./ReactionBar";
import { TypingStatus } from "./TypingStatus";

/** 서버 컴포넌트에서 클라이언트로 함수는 못 넘기므로 문구는 사전, 시각·날짜 형식은 Intl 옵션(직렬화 가능)으로 받는다. */
export interface ChatListStrings {
  today: string;
  yesterday: string;
  newMessage: string;
  empty: string;
  notDelivered: string;
  sending: string;
  delivered: string;
  read: string;
  photoAlt: string;
  photoAnnounce: string;
  loadingOlder: string;
  photoReply?: string;
  photoClose?: string;
  /** 입력 중 점의 aria-label(status.typingLabel). */
  typingLabel?: string;
  // 말풍선 메뉴·반응·인용(W9~W11). "{emoji}"는 클라이언트가 채운다.
  menuLabel?: string;
  menuReply?: string;
  menuCopy?: string;
  menuCopied?: string;
  reactionMenu?: string;
  reactionAdd?: string;
  reactionRemove?: string;
  reactionYours?: string;
  reactionHis?: string;
  quoteJump?: string;
  quotePhoto?: string;
  quoteYou?: string;
  quoteHim?: string;
  // 베타 평가(Rate)
  rateGood?: string;
  rateBad?: string;
  rateSaved?: string;
  rateNote?: string;
  rateSave?: string;
  // --- W4 --- 답장 신고
  reportAction?: string;
  reportTitle?: string;
  reportInappropriate?: string;
  reportHurtful?: string;
  reportOutOfCharacter?: string;
  reportOther?: string;
  reportThanks?: string;
}

export const DEFAULT_STRINGS: Required<ChatListStrings> = {
  today: "Today",
  yesterday: "Yesterday",
  newMessage: "New message ↓",
  empty: "He'll say hi soon.",
  notDelivered: "Not delivered · Tap to retry",
  sending: "Sending…",
  delivered: "Delivered",
  read: "Read",
  photoAlt: "Photo",
  photoAnnounce: "Sent a photo",
  loadingOlder: "Loading earlier messages…",
  photoReply: "Reply",
  photoClose: "Close",
  typingLabel: "Typing",
  menuLabel: "Message actions",
  menuReply: "Reply",
  menuCopy: "Copy",
  menuCopied: "Copied",
  reactionMenu: "Reactions",
  reactionAdd: "React with {emoji}",
  reactionRemove: "Remove your {emoji} reaction",
  reactionYours: "You reacted {emoji}",
  reactionHis: "He reacted {emoji}",
  quoteJump: "Go to original message",
  quotePhoto: "Photo",
  quoteYou: "You",
  quoteHim: "Him",
  rateGood: "good",
  rateBad: "bad",
  rateSaved: "saved",
  rateNote: "note",
  rateSave: "Save",
  reportAction: "Report",
  reportTitle: "What was wrong with this message?",
  reportInappropriate: "Inappropriate",
  reportHurtful: "Hurtful",
  reportOutOfCharacter: "Out of character",
  reportOther: "Something else",
  reportThanks: "Thanks, we'll take a look.",
};

/** 인용 답장 대상(입력창 위 띠·낙관적 말풍선). DTO의 replyTo와 같은 모양. */
export type ReplyTarget = NonNullable<MessageDto["replyTo"]>;

export interface ChatMeta {
  serverNow: string;
  wakeAt: string | null;
  typing: boolean;
  activity: string;
  hasMoreBefore: boolean;
  /** 내 마지막 메시지의 Delivered/Read(서버 판정). after 응답에 그 메시지가 없어도 갱신된다. */
  mine?: { id: string; status: "read" | "delivered"; readAt: string | null } | null;
}

export interface MessageListProps {
  initialMessages: MessageDto[];
  initialMeta: ChatMeta;
  /** 진입 시 이 메시지로 스크롤하고 잠깐 강조한다(검색 결과). */
  highlightId?: string | null;
  /** IANA 시간대. */
  tz: string;
  /** 기본 "en-US". 일본판은 "ja-JP". */
  locale?: string;
  /** 기본 { hour: "numeric", minute: "2-digit" }. */
  timeOptions?: Intl.DateTimeFormatOptions;
  /** 기본 { weekday: "short", month: "short", day: "numeric" } → "Mon, Nov 17". */
  dayOptions?: Intl.DateTimeFormatOptions;
  strings?: Partial<ChatListStrings>;
  /** 베타 테스터에게만 true. 그의 말풍선 안에 평가(👍/👎)를 그린다. */
  isBeta?: boolean;
  /** 메시지 id → 내 평가. isBeta일 때만 채워서 넘긴다. */
  ratings?: Record<string, 1 | -1>;
  /** 전송 실패 말풍선을 탭했을 때. Composer가 같은 id(와 인용 대상)로 다시 보낸다. */
  onRetry?: (id: string, text: string, replyTo: string | null) => void;
  /** 쓸기·메뉴 "Reply"·사진 "Reply" → 입력창 위 인용 띠. */
  onReply?: (target: ReplyTarget) => void;
  /** 활동 문구가 바뀔 때(헤더 갱신용, 선택). */
  onMeta?: (meta: ChatMeta) => void;
  ref?: Ref<MessageListHandle>;
}

export interface MessageListHandle {
  /** 낙관적 말풍선 추가(status pending). id는 클라이언트 crypto.randomUUID(), 서버 insert id와 같아야 한다. */
  addOptimistic(item: { id: string; text: string; replyTo?: ReplyTarget | null }): void;
  /** 서버 액션 실패 → "Not delivered · Tap to retry". 글자는 유지. */
  markFailed(id: string): void;
  /** 재시도 시작 → 다시 "Sending…". */
  markPending(id: string): void;
  /** 즉시 1회 조회(전송 직후 호출). 답장 생성 중이면 1→2→4초 백오프로 이어진다. */
  refetch(): void;
}

type Item = MessageDto & { local?: "pending" | "failed" };
type Resp = ChatMeta & { messages: MessageDto[]; charReactions?: { id: string; emoji: string }[] };
type Anchor = { top: number; bottom: number; left: number; right: number };

const FIVE_MIN = 5 * 60000;
const AWAIT_REPLY_MS = 2 * 60000;
const SAFETY_NET_MS = 60000;
const NEAR_BOTTOM_PX = 80;
const NEAR_TOP_PX = 200;
const HANGUL = /[ㄱ-ㆎ가-힣]/;
const LONG_PRESS_MS = 400;
/** 화면 왼쪽 가장자리에서 시작한 쓸기는 브라우저 뒤로 가기 몫이라 무시한다. */
const EDGE_PX = 24;
const SWIPE_REPLY_PX = 56;
const SWIPE_MAX_PX = 72;

const byOrder = (a: Item, b: Item) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

function sorted(map: Map<string, Item>): Item[] {
  const real: Item[] = [];
  const local: Item[] = [];
  for (const m of map.values()) (m.local ? local : real).push(m);
  return [...real.sort(byOrder), ...local.sort(byOrder)];
}

export function MessageList(props: MessageListProps) {
  const { initialMessages, initialMeta, tz, locale = "en-US", onRetry, onMeta } = props;
  const s = useMemo(() => ({ ...DEFAULT_STRINGS, ...props.strings }) as Required<ChatListStrings>, [props.strings]);
  const timeFmt = useMemo(
    () => new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", ...props.timeOptions, timeZone: tz }),
    [locale, tz, props.timeOptions],
  );
  const dayFmt = useMemo(
    () => new Intl.DateTimeFormat(locale, { weekday: "short", month: "short", day: "numeric", ...props.dayOptions, timeZone: tz }),
    [locale, tz, props.dayOptions],
  );
  const dayKey = useMemo(() => new Intl.DateTimeFormat("en-CA", { timeZone: tz }), [tz]);

  const [byId, setById] = useState<Map<string, Item>>(() => new Map(initialMessages.map((m) => [m.id, m])));
  const byIdRef = useRef(byId);
  const [meta, setMeta] = useState<ChatMeta>(initialMeta);
  const [announce, setAnnounce] = useState("");
  const [viewer, setViewer] = useState<string | null>(null);
  const [chip, setChip] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [flashId, setFlashId] = useState<string | null>(props.highlightId ?? null);
  const [tapped, setTapped] = useState<Set<string>>(() => new Set());
  const [menu, setMenu] = useState<{ id: string; anchor: Anchor } | null>(null);
  /** 이번 화면에서 새로 나타난 그의 반응(톡 튀어나오는 애니메이션 대상). */
  const [popIds, setPopIds] = useState<Set<string>>(() => new Set());
  /** 서버 응답을 기다리는 내 반응(조회 결과가 덮어쓰지 않게). */
  const pendingReact = useRef(new Map<string, string | null>());
  const press = useRef<{ id: string; x: number; y: number; el: HTMLElement; edge: boolean; touch: boolean; timer?: ReturnType<typeof setTimeout>; long: boolean; dx: number } | null>(null);
  const suppressClick = useRef(false);
  const menuTrigger = useRef<HTMLElement | null>(null);

  const scroller = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  /** 이전 대화 로드 직전에 보던 말풍선(id)과 스크롤 영역 위쪽 기준 오프셋. */
  const restore = useRef<{ id: string; top: number } | null>(null);
  const hasMoreBefore = useRef(initialMeta.hasMoreBefore);
  const loadingOlderRef = useRef(false);
  const inflight = useRef(false);
  const queued = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const backoff = useRef(0);
  const refreshRef = useRef<() => void>(() => {});
  const lastKey = useRef<string | null>(null);

  const commit = useCallback((next: Map<string, Item>) => {
    byIdRef.current = next;
    setById(next);
  }, []);

  /**
   * 서버 응답을 Map에 합친다(id 중복 제거). 새로 생긴 상대 메시지를 돌려준다.
   * charReactions: 이미 있는 말풍선에 나중에 붙은 그의 반응. 새로 붙은 것은 pop 대상.
   */
  const ingest = useCallback(
    (list: MessageDto[], charReactions: { id: string; emoji: string }[] = []): Item[] => {
      const next = new Map(byIdRef.current);
      const fresh: Item[] = [];
      const popped: string[] = [];
      for (const m of list) {
        const prev = next.get(m.id);
        if (!prev || prev.local) {
          if (m.sender !== "user" && !prev) fresh.push(m);
        }
        const reactions = { ...m.reactions };
        if (pendingReact.current.has(m.id)) reactions.user = pendingReact.current.get(m.id) ?? undefined;
        if (prev && reactions.char && prev.reactions.char !== reactions.char) popped.push(m.id);
        next.set(m.id, { ...m, reactions, status: undefined });
      }
      for (const r of charReactions) {
        const cur = next.get(r.id);
        if (!cur || cur.reactions.char === r.emoji) continue;
        next.set(r.id, { ...cur, reactions: { ...cur.reactions, char: r.emoji } });
        popped.push(r.id);
      }
      commit(next);
      if (popped.length) setPopIds((p) => new Set([...p, ...popped]));
      return fresh;
    },
    [commit],
  );

  const schedule = useCallback((data: Resp | null) => {
    clearTimeout(timer.current);
    let delay: number | null = null;
    if (!data) {
      delay = 4000; // 네트워크 실패: 잠시 뒤 재시도(online 이벤트가 오면 더 빠르다)
    } else {
      if (data.wakeAt) {
        backoff.current = 0;
        delay = Math.max(0, Date.parse(data.wakeAt) - Date.parse(data.serverNow)) + 250;
      } else {
        const all = sorted(byIdRef.current);
        const last = all.at(-1);
        const generating =
          !!last && (last.local === "pending" || (last.sender === "user" && Date.parse(data.serverNow) - Date.parse(last.at) < AWAIT_REPLY_MS));
        if (generating) {
          backoff.current = backoff.current ? Math.min(backoff.current * 2, 4000) : 1000;
          delay = backoff.current;
        } else backoff.current = 0;
      }
    }
    if (delay !== null) timer.current = setTimeout(() => refreshRef.current(), delay);
  }, []);

  const refresh = useCallback(async () => {
    if (inflight.current) {
      queued.current = true;
      return;
    }
    inflight.current = true;
    try {
      const real = sorted(byIdRef.current).filter((m) => !m.local);
      const afterId = real.at(-1)?.id;
      const res = await fetch(`/api/chat/messages${afterId ? `?after=${afterId}` : ""}`, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as Resp;
      const fresh = ingest(data.messages, data.charReactions);
      if (fresh.length) {
        backoff.current = 0;
        setAnnounce(fresh.map((m) => m.text || s.photoAnnounce).join(" "));
      }
      const m: ChatMeta = { serverNow: data.serverNow, wakeAt: data.wakeAt, typing: data.typing, activity: data.activity, hasMoreBefore: hasMoreBefore.current, mine: data.mine };
      setMeta(m);
      onMeta?.(m);
      schedule(data);
    } catch {
      schedule(null);
    } finally {
      inflight.current = false;
      if (queued.current) {
        queued.current = false;
        void refresh();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ingest, schedule, onMeta, s.photoAnnounce]);
  refreshRef.current = () => void refresh();

  useImperativeHandle(
    props.ref,
    () => ({
      addOptimistic: ({ id, text, replyTo }) => {
        const next = new Map(byIdRef.current);
        next.set(id, { id, sender: "user", text, mediaId: null, at: new Date().toISOString(), replyTo: replyTo ?? null, reactions: {}, local: "pending" });
        commit(next);
      },
      markFailed: (id) => {
        const cur = byIdRef.current.get(id);
        if (!cur?.local) return;
        commit(new Map(byIdRef.current).set(id, { ...cur, local: "failed" }));
      },
      markPending: (id) => {
        const cur = byIdRef.current.get(id);
        if (!cur?.local) return;
        commit(new Map(byIdRef.current).set(id, { ...cur, local: "pending" }));
      },
      refetch: () => {
        backoff.current = 0;
        void refresh();
      },
    }),
    [commit, refresh],
  );

  // 예약 조회: 첫 예약 + 60초 안전망 + 복귀 이벤트 즉시 1회.
  useEffect(() => {
    schedule({ ...initialMeta, messages: [] });
    const net = setInterval(() => refreshRef.current(), SAFETY_NET_MS);
    const wake = () => {
      if (document.visibilityState === "visible") refreshRef.current();
    };
    const wakeAlways = () => refreshRef.current();
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("pageshow", wakeAlways);
    window.addEventListener("online", wakeAlways);
    return () => {
      clearTimeout(timer.current);
      clearInterval(net);
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("pageshow", wakeAlways);
      window.removeEventListener("online", wakeAlways);
    };
    // 마운트 1회. initialMeta는 첫 예약에만 쓴다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const items = useMemo(() => sorted(byId), [byId]);
  useEffect(() => {
    if (!flashId) return;
    const t = setTimeout(() => setFlashId(null), 2000);
    return () => clearTimeout(t);
  }, [flashId]);

  // 맨 아래로: 진입 시, 맨 아래 근처일 때 새 메시지, 내가 보낸 메시지. 이전 대화 로드 직후에는 위치만 복원한다.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (restore.current) {
      const bubble = el.querySelector<HTMLElement>(`[data-mid="${restore.current.id}"] [data-bubble]`);
      if (bubble) el.scrollTop += bubble.getBoundingClientRect().top - el.getBoundingClientRect().top - restore.current.top;
      restore.current = null;
      return;
    }
    const last = items.at(-1);
    const key = last ? last.id : "";
    if (lastKey.current === key) return;
    const first = lastKey.current === null;
    lastKey.current = key;
    if (first && props.highlightId) {
      el.querySelector(`[data-mid="${props.highlightId}"]`)?.scrollIntoView({ block: "center" });
      nearBottom.current = false;
      return;
    }
    if (first || nearBottom.current || last?.sender === "user") {
      el.scrollTop = el.scrollHeight;
      nearBottom.current = true;
      setChip(false);
    } else setChip(true);
  }, [items]);

  const loadOlder = useCallback(async () => {
    if (loadingOlderRef.current || !hasMoreBefore.current) return;
    const firstReal = sorted(byIdRef.current).find((m) => !m.local);
    if (!firstReal) return;
    loadingOlderRef.current = true;
    setLoadingOlder(true);
    try {
      const res = await fetch(`/api/chat/messages?before=${firstReal.id}&limit=50`, { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as Resp;
      const el = scroller.current;
      if (el) {
        // 보이는 첫 말풍선을 기준점으로. 위쪽에 생기고 사라지는 것(날짜 구분선·간격)은 말풍선 위치로 보정된다.
        const edge = el.getBoundingClientRect().top;
        for (const b of el.querySelectorAll<HTMLElement>("[data-mid] [data-bubble]")) {
          const r = b.getBoundingClientRect();
          if (r.bottom > edge) {
            restore.current = { id: b.closest<HTMLElement>("[data-mid]")!.dataset.mid!, top: r.top - edge };
            break;
          }
        }
      }
      hasMoreBefore.current = data.hasMoreBefore;
      const next = new Map(byIdRef.current);
      for (const m of data.messages) if (!next.has(m.id)) next.set(m.id, m);
      commit(next);
    } catch {
      // 다음 스크롤에서 다시 시도
    } finally {
      loadingOlderRef.current = false;
      setLoadingOlder(false);
    }
  }, [commit]);

  // ---------- 반응·메뉴·인용(W9·W10) ----------

  const setUserReactionLocal = useCallback(
    (id: string, emoji: string | null) => {
      const cur = byIdRef.current.get(id);
      if (!cur) return;
      commit(new Map(byIdRef.current).set(id, { ...cur, reactions: { ...cur.reactions, user: emoji ?? undefined } }));
    },
    [commit],
  );

  /** 낙관적 반응. 같은 이모지를 다시 고르면 취소. 서버가 거부하면 되돌린다. */
  const react = useCallback(
    async (id: string, emoji: string) => {
      const cur = byIdRef.current.get(id);
      if (!cur) return;
      const prev = cur.reactions.user ?? null;
      const value = prev === emoji ? null : emoji;
      setUserReactionLocal(id, value);
      pendingReact.current.set(id, value);
      let ok = false;
      try {
        ok = (await setReaction(id, value)).ok;
      } catch {
        ok = false;
      }
      if (pendingReact.current.get(id) === value) pendingReact.current.delete(id);
      if (!ok && (byIdRef.current.get(id)?.reactions.user ?? null) === value) setUserReactionLocal(id, prev);
    },
    [setUserReactionLocal],
  );

  const openMenu = (id: string, anchorEl: HTMLElement, trigger: HTMLElement) => {
    menuTrigger.current = trigger;
    const r = anchorEl.getBoundingClientRect();
    setMenu({ id, anchor: { top: r.top, bottom: r.bottom, left: r.left, right: r.right } });
  };
  const closeMenu = (restoreFocus: boolean) => {
    setMenu(null);
    if (restoreFocus) menuTrigger.current?.focus({ preventScroll: true });
  };

  const startReply = (m: Item) => {
    closeMenu(false);
    if (m.local) return;
    props.onReply?.({ id: m.id, sender: m.sender, text: m.text.slice(0, 200), mediaId: m.mediaId });
  };

  const copy = (m: Item) => {
    closeMenu(true);
    void navigator.clipboard
      ?.writeText(m.text)
      .then(() => setAnnounce(s.menuCopied))
      .catch(() => {});
  };

  /** 인용 탭 → 원 메시지로. 목록에 없으면 around 화면(검색과 같은 경로)으로 연다. */
  const jump = (id: string) => {
    const el = scroller.current?.querySelector<HTMLElement>(`[data-mid="${id}"]`);
    if (el) {
      nearBottom.current = false;
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      setFlashId(id);
      return;
    }
    window.location.assign(`/chat?around=${encodeURIComponent(id)}`);
  };

  // 길게 누르기(터치 400ms) → 메뉴, 오른쪽 쓸기(터치, 왼쪽 가장자리 24px 제외) → 인용 답장.
  const onPointerDown = (e: React.PointerEvent<HTMLElement>, m: Item) => {
    suppressClick.current = false; // 길게 누른 뒤 click이 안 온 경우(iOS) 다음 탭을 삼키지 않게
    if (m.local || (e.pointerType === "mouse" && e.button !== 0)) return;
    const el = e.currentTarget;
    const touch = e.pointerType !== "mouse";
    const p: NonNullable<typeof press.current> = { id: m.id, x: e.clientX, y: e.clientY, el, edge: e.clientX < EDGE_PX, touch, long: false, dx: 0 };
    if (touch)
      p.timer = setTimeout(() => {
        p.long = true;
        navigator.vibrate?.(10);
        openMenu(m.id, el, el);
      }, LONG_PRESS_MS);
    press.current = p;
  };
  const onPointerMove = (e: React.PointerEvent<HTMLElement>) => {
    const p = press.current;
    if (!p) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) clearTimeout(p.timer);
    if (!p.touch || p.edge || p.long) return;
    if (Math.abs(dy) > 30) {
      p.dx = 0;
      p.el.style.transform = "";
      return;
    }
    p.dx = Math.max(0, Math.min(dx, SWIPE_MAX_PX));
    p.el.style.transition = "none";
    p.el.style.transform = p.dx ? `translateX(${p.dx}px)` : "";
  };
  const endPress = (m: Item, cancelled: boolean) => {
    const p = press.current;
    if (!p) return;
    press.current = null;
    clearTimeout(p.timer);
    p.el.style.transition = "transform 150ms ease-out";
    p.el.style.transform = "";
    if (p.long) {
      suppressClick.current = true;
      return;
    }
    if (!cancelled && p.dx >= SWIPE_REPLY_PX && props.onReply) {
      suppressClick.current = true;
      startReply(m);
    }
  };

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    if (menu) closeMenu(false);
    nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
    if (nearBottom.current) setChip(false);
    if (el.scrollTop < NEAR_TOP_PX) void loadOlder();
  };

  const toBottom = () => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    setChip(false);
  };

  const today = dayKey.format(new Date(meta.serverNow));
  const yesterday = dayKey.format(new Date(Date.parse(meta.serverNow) - 86400000));
  const dayLabel = (d: Date) => {
    const k = dayKey.format(d);
    return k === today ? s.today : k === yesterday ? s.yesterday : dayFmt.format(d);
  };

  // 내 마지막 실제 메시지의 상태: 뒤에 그의 메시지가 있으면 Read, 없으면 Delivered.
  const lastMineIdx = items.findLastIndex((m) => m.sender === "user" && !m.local);
  const lastMine = lastMineIdx < 0 ? null : items[lastMineIdx]!;
  const serverMine = lastMine && meta.mine?.id === lastMine.id ? meta.mine : null;
  const derivedRead = lastMineIdx >= 0 && items.slice(lastMineIdx + 1).some((m) => m.sender !== "user" && !m.local);
  const isRead = serverMine ? serverMine.status === "read" : derivedRead;
  // 읽음 시각이 있으면 "Read 6:17 AM"만 보여 시각을 두 번 쓰지 않는다.
  const readHasTime = isRead && !!serverMine?.readAt;
  const mineStatus = lastMineIdx < 0 ? null : isRead ? (serverMine?.readAt ? `${s.read} ${timeFmt.format(new Date(serverMine.readAt))}` : s.read) : s.delivered;

  const menuItem = menu ? byId.get(menu.id) : undefined;

  const toggleTap = (id: string) =>
    setTapped((prev) => {
      const n = new Set(prev);
      if (!n.delete(id)) n.add(id);
      return n;
    });

  return (
    <div className="relative min-h-0 flex-1">
      {/* 흐름 밖(overlay): 나타나고 사라져도 목록 위치가 밀리지 않는다. */}
      {loadingOlder ? <p className="pointer-events-none absolute inset-x-0 top-1 z-10 text-center text-xs text-[var(--color-ink-soft)]">{s.loadingOlder}</p> : null}
      <div ref={scroller} onScroll={onScroll} className="h-full overflow-y-auto overscroll-contain px-4 py-3">
        {items.length === 0 ? (
          <p className="py-16 text-center text-sm text-[var(--color-ink-soft)]">{s.empty}</p>
        ) : (
          <ul className="flex flex-col">
            {items.map((m, i) => {
              const d = new Date(m.at);
              const prev = items[i - 1];
              const next = items[i + 1];
              const newDay = !prev || dayKey.format(new Date(prev.at)) !== dayKey.format(d);
              const joins = (a: Item | undefined, b: Item) =>
                !!a && a.sender === b.sender && Math.abs(Date.parse(b.at) - Date.parse(a.at)) <= FIVE_MIN && dayKey.format(new Date(a.at)) === dayKey.format(new Date(b.at));
              const contPrev = !newDay && joins(prev, m);
              const groupEnd = !(next && joins(m, next));
              const mine = m.sender === "user";
              const lang = HANGUL.test(m.text) ? "ko" : undefined;
              const showTime = !m.local && (groupEnd || tapped.has(m.id));
              const hasReaction = mine ? !!m.reactions.char : !!m.reactions.user;
              return (
                <li key={m.id} data-mid={m.id} className={`group flex flex-col ${flashId === m.id ? "bg-[var(--color-surface)] transition-colors " : ""}${mine ? "items-end" : "items-start"} ${contPrev ? "mt-0.5" : "mt-2"}`}>
                  {newDay ? <p className="mx-auto my-2 text-xs text-[var(--color-ink-soft)]">{dayLabel(d)}</p> : null}
                  <div className={`flex max-w-[88%] items-center gap-1 ${mine ? "flex-row-reverse" : ""} ${hasReaction ? "mb-3.5" : ""}`}>
                    <div
                      role="button"
                      tabIndex={0}
                      data-bubble=""
                      onClick={() => {
                        if (suppressClick.current) {
                          suppressClick.current = false;
                          return;
                        }
                        if (m.local === "failed") onRetry?.(m.id, m.text, m.replyTo?.id ?? null);
                        else toggleTap(m.id);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          if (m.local === "failed") onRetry?.(m.id, m.text, m.replyTo?.id ?? null);
                          else toggleTap(m.id);
                        } else if (!m.local && (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10"))) {
                          e.preventDefault();
                          openMenu(m.id, e.currentTarget, e.currentTarget);
                        }
                      }}
                      onPointerDown={(e) => onPointerDown(e, m)}
                      onPointerMove={onPointerMove}
                      onPointerUp={() => endPress(m, false)}
                      onPointerCancel={() => endPress(m, true)}
                      onContextMenu={(e) => {
                        if (m.local) return;
                        e.preventDefault();
                        if (!menu) openMenu(m.id, e.currentTarget, e.currentTarget);
                      }}
                      lang={lang}
                      className={`bubble-press relative min-w-0 break-words whitespace-pre-wrap px-4 py-2 ${
                        mine
                          ? "rounded-[var(--radius-bubble-mine)] bg-[var(--color-bubble-mine)] text-[var(--color-bubble-mine-ink)]"
                          : "rounded-[var(--radius-bubble)] bg-[var(--color-bubble-his)] text-[var(--color-bubble-his-ink)]"
                      } ${m.local === "pending" ? "opacity-70" : ""}`}
                    >
                      {m.replyTo ? (
                        <QuotePreview replyTo={m.replyTo} onJump={jump} youLabel={s.quoteYou} himLabel={s.quoteHim} photoLabel={s.quotePhoto} jumpLabel={s.quoteJump} mine={mine} />
                      ) : null}
                      {m.mediaId ? (
                        PHOTO_BUBBLE_IMPLEMENTED ? (
                          <PhotoBubble mediaId={m.mediaId} alt={s.photoAlt} replyLabel={s.photoReply} onOpen={() => setViewer(m.mediaId)} onReply={() => startReply(m)} />
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={`/api/media/${m.mediaId}`} alt={s.photoAlt} className="mb-2 w-full rounded-[var(--radius-control)]" />
                        )
                      ) : null}
                      {m.text}
                      <ReactionBar
                        reactions={m.reactions}
                        mine={mine}
                        pop={popIds.has(m.id)}
                        yoursLabel={s.reactionYours}
                        removeLabel={s.reactionRemove}
                        hisLabel={s.reactionHis}
                        onRemove={() => {
                          if (m.reactions.user) void react(m.id, m.reactions.user);
                        }}
                      />
                      {props.isBeta && m.sender === "char" ? (
                        <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                          <Rate msgId={m.id} initial={props.ratings?.[m.id] ?? null} strings={{ good: s.rateGood, bad: s.rateBad, saved: s.rateSaved, note: s.rateNote, save: s.rateSave }} />
                        </div>
                      ) : null}
                    </div>
                    {!m.local ? (
                      <button
                        type="button"
                        aria-label={s.menuLabel}
                        aria-haspopup="menu"
                        aria-expanded={menu?.id === m.id}
                        onClick={(e) => {
                          const bubble = e.currentTarget.parentElement?.querySelector<HTMLElement>("[data-bubble]");
                          if (bubble) openMenu(m.id, bubble, e.currentTarget);
                        }}
                        className={`flex h-8 w-8 flex-none items-center justify-center rounded-full text-lg leading-none text-[var(--color-ink-soft)] hover:bg-[var(--color-surface)] ${
                          tapped.has(m.id) || menu?.id === m.id ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                        }`}
                      >
                        <span aria-hidden="true">⋯</span>
                      </button>
                    ) : null}
                  </div>
                  {m.local === "pending" ? <p className="mt-0.5 text-xs text-[var(--color-ink-soft)]">{s.sending}</p> : null}
                  {m.local === "failed" ? <p className="mt-0.5 text-xs text-red-600">{s.notDelivered}</p> : null}
                  {showTime || (i === lastMineIdx && mineStatus) ? (
                    <p className="mt-0.5 text-xs text-[var(--color-ink-soft)]">
                      {showTime && !(i === lastMineIdx && readHasTime) ? timeFmt.format(d) : null}
                      {showTime && i === lastMineIdx && mineStatus && !readHasTime ? " · " : null}
                      {i === lastMineIdx ? mineStatus : null}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
        <TypingStatus typing={meta.typing} label={s.typingLabel} />
      </div>
      {chip ? (
        <button type="button" onClick={toBottom} className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-[var(--color-accent)] px-4 py-1.5 text-sm text-[var(--color-accent-ink)] shadow">
          {s.newMessage}
        </button>
      ) : null}
      <div aria-live="polite" role="status" className="sr-only">
        {announce}
      </div>
      {menu && menuItem ? (
        <MessageMenu
          anchor={menu.anchor}
          alignEnd={menuItem.sender === "user"}
          canReact={menuItem.sender === "char"}
          canReply={!!props.onReply}
          canCopy={!!menuItem.text.trim()}
          canReport={menuItem.sender === "char" && !menuItem.local}
          current={menuItem.reactions.user}
          labels={{ menu: s.menuLabel, reactions: s.reactionMenu, add: s.reactionAdd, remove: s.reactionRemove, reply: s.menuReply,
            copy: s.menuCopy,
            report: s.reportAction,
            reportTitle: s.reportTitle,
            reportReasons: [s.reportInappropriate, s.reportHurtful, s.reportOutOfCharacter, s.reportOther],
            reportThanks: s.reportThanks,
          }}
          onReport={(reason) => void reportMessage(menu.id, reason)}
          onReact={(e) => {
            void react(menu.id, e);
            closeMenu(true);
          }}
          onReply={() => startReply(menuItem)}
          onCopy={() => copy(menuItem)}
          onClose={closeMenu}
        />
      ) : null}
      {viewer ? <PhotoViewer mediaId={viewer} alt={s.photoAlt} closeLabel={s.photoClose} onClose={() => setViewer(null)} /> : null}
    </div>
  );
}
