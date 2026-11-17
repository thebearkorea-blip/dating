import { en, type Strings, type StringKey } from "./strings.en";
import { ja } from "./strings.ja";

/** 제품 변형 한 곳. 제품별 분기는 이 폴더 밖에 두지 않는다. */
export type Product = "us" | "jp";
export type { Strings, StringKey };

export function getProduct(): Product {
  return process.env.PRODUCT === "jp" ? "jp" : "us";
}

/** 제품별 캐릭터 id. */
export const CHARACTER_IDS: Record<Product, string> = { us: "ihan", jp: "yeonhu" };
export function getCharacterId(p: Product = getProduct()): string {
  return CHARACTER_IDS[p];
}

/** 제품별 프로필 사진(공개 Blob URL). SNS 프로필 사진 = ihan-p008(decisions). null이면 이니셜 대체. /api/media는 대화에 실린 사진만 내주므로 쓰지 않는다. */
export const AVATAR_URLS: Record<Product, string | null> = {
  us: "https://yuqwz3rujgoacxgf.public.blob.vercel-storage.com/photos/ihan/ihan-p008-2fsfsfIb8Lwimu5ZpCFBCDIRmklRhK.jpg",
  jp: null,
};
export function getAvatarUrl(p: Product = getProduct()): string | null {
  return AVATAR_URLS[p];
}

/** html lang 값. */
export function getLang(p: Product = getProduct()): "en" | "ja" {
  return p === "jp" ? "ja" : "en";
}

export function getStrings(p: Product = getProduct()): Strings {
  return p === "jp" ? ja : en;
}

/** "{name}" 자리표시자 치환. */
export function fmt(template: string, vars: Record<string, string | number> = {}): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => (k in vars ? String(vars[k]) : `{${k}}`));
}

/** 문구 한 개를 바로 얻는 편의 함수. */
export function t(key: StringKey, vars?: Record<string, string | number>, p: Product = getProduct()): string {
  return fmt(getStrings(p)[key], vars);
}

/** 잘못된 IANA 시간대면 UTC가 아니라 Asia/Seoul(기존 동작). */
export function safeTz(tz: string | null | undefined): string {
  const v = tz || "Asia/Seoul";
  try {
    new Intl.DateTimeFormat("en", { timeZone: v });
    return v;
  } catch {
    return "Asia/Seoul";
  }
}

function locale(p: Product): string {
  return p === "jp" ? "ja-JP" : "en-US";
}

/** 시각: us "9:41 PM", jp "午後9:41". */
export function formatTime(d: Date | string | number, tz: string, p: Product = getProduct()): string {
  return new Intl.DateTimeFormat(locale(p), { hour: "numeric", minute: "2-digit", hour12: true, timeZone: safeTz(tz) }).format(new Date(d));
}

/** 시간대 기준 날짜 키(YYYY-MM-DD). 날짜 구분선 비교용. */
export function dayKey(d: Date | string | number, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: safeTz(tz) }).format(new Date(d));
}

function dayLabelAbsolute(d: Date, tz: string, p: Product): string {
  const parts = new Intl.DateTimeFormat(locale(p), { month: p === "jp" ? "numeric" : "short", day: "numeric", weekday: "short", timeZone: safeTz(tz) }).formatToParts(d);
  const g = (type: string) => parts.find((x) => x.type === type)?.value ?? "";
  return p === "jp" ? `${g("month")}月${g("day")}日(${g("weekday")})` : `${g("weekday")}, ${g("month")} ${g("day")}`;
}

/** 날짜 구분선: Today / Yesterday / "Mon, Nov 17" (jp: 今日 / 昨日 / 11月17日(月)). now는 테스트용 주입. */
export function formatDaySeparator(d: Date | string | number, tz: string, now: Date = new Date(), p: Product = getProduct()): string {
  const date = new Date(d);
  const key = dayKey(date, tz);
  if (key === dayKey(now, tz)) return getStrings(p)["date.today"];
  if (key === dayKey(new Date(now.getTime() - 24 * 3600_000), tz)) return getStrings(p)["date.yesterday"];
  return dayLabelAbsolute(date, tz, p);
}

/** 하단 탭바(클라이언트 컴포넌트)에 넘기는 문구. */
export function tabBarLabels(p: Product = getProduct()) {
  const s = getStrings(p);
  return { nav: s["tab.nav"], chat: s["tab.chat"], him: s["tab.him"], memories: s["tab.memories"], settings: s["tab.settings"] };
}

/** 채팅 목록(클라이언트 컴포넌트)에 넘기는 직렬화 가능한 문구. 키는 MessageList의 ChatListStrings와 같다. */
export function chatListStrings(name: string, p: Product = getProduct()) {
  const s = getStrings(p);
  return {
    today: s["date.today"],
    yesterday: s["date.yesterday"],
    newMessage: s["list.newMessage"],
    empty: fmt(s["list.empty"], { name }),
    notDelivered: s["message.failed"],
    sending: s["message.sending"],
    delivered: s["status.delivered"],
    read: fmt(s["status.read"], { time: "" }).trim(),
    photoAlt: fmt(s["photo.alt"], { name }),
    photoAnnounce: fmt(s["list.photoFrom"], { name }),
    loadingOlder: s["list.loadingEarlier"],
    photoReply: s["photo.reply"],
    photoClose: s["photo.close"],
    typingLabel: fmt(s["status.typingLabel"], { name }),
    menuLabel: s["menu.messageActions"],
    menuReply: s["menu.reply"],
    menuCopy: s["menu.copy"],
    menuCopied: s["menu.copied"],
    reactionMenu: s["reaction.menuLabel"],
    reactionAdd: s["reaction.add"],
    reactionRemove: s["reaction.remove"],
    reactionYours: s["reaction.yours"],
    reactionHis: fmt(s["reaction.his"], { name }),
    quoteJump: s["quote.jump"],
    quotePhoto: s["quote.photo"],
    quoteYou: s["quote.you"],
    quoteHim: name,
    rateGood: s["rate.good"],
    rateBad: s["rate.bad"],
    rateSaved: s["rate.saved"],
    rateNote: s["rate.note"],
    rateSave: s["rate.save"],
    // --- W4 ---
    reportAction: s["report.action"],
    reportTitle: s["report.title"],
    reportInappropriate: s["report.inappropriate"],
    reportHurtful: s["report.hurtful"],
    reportOutOfCharacter: s["report.outOfCharacter"],
    reportOther: s["report.other"],
    reportThanks: s["report.thanks"],
  };
}

/** 입력창 위 인용 띠 문구(직렬화 가능). */
export function replyStripStrings(name: string, p: Product = getProduct()) {
  const s = getStrings(p);
  return {
    replyingTo: fmt(s["composer.replyingTo"], { name }),
    replyingToYourself: s["composer.replyingToYourself"],
    cancelReply: s["composer.cancelReply"],
    photo: s["composer.photo"],
  };
}

/** 채팅 목록의 Intl 형식(직렬화 가능). formatTime·formatDaySeparator와 같은 모양. */
export function chatFormat(p: Product = getProduct()): { locale: string; timeOptions: Intl.DateTimeFormatOptions; dayOptions: Intl.DateTimeFormatOptions } {
  return {
    locale: locale(p),
    timeOptions: { hour: "numeric", minute: "2-digit", hour12: true },
    dayOptions: p === "jp" ? { month: "numeric", day: "numeric", weekday: "short" } : { month: "short", day: "numeric", weekday: "short" },
  };
}
