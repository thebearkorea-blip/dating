// 삶 원장(M3): 읽기(eventAt·eventsBetween)·검사기(허용 목록·사람인 척·일정 일치)·소비처 일치(§4-4 20/20)·원장 없을 때 폴백.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { validateLedgerText } from "../../src/content/load.js";
import { namesAllowSchema, scheduleSchema, type LedgerEvent } from "../../src/content/schemas/index.js";
import { gapEvents, gapLedger } from "../../src/engine/absence.js";
import { activityLine } from "../../src/engine/chat.js";
import { allowedNames, allowListFindings, pretendHumanFindings, properNounFindings, scheduleFindings } from "../../src/engine/ledger-check.js";
import { eventAt, eventsBetween, isoWeekMonday, isoWeekOf, publicEventAt, publicEventsBetween, withLedger } from "../../src/engine/ledger.js";
import { buildPersona } from "../../src/engine/persona.js";
import { activityAt, kstParts } from "../../src/engine/schedule.js";
import { proactiveMaterial } from "../../src/jobs/proactive.js";
import { bible, character, voiceMd } from "./helpers.js";

const ROOT = join(import.meta.dirname, "../fixtures/ledger-example");
const EMPTY = join(import.meta.dirname, "../fixtures/content-example");
const C = join(import.meta.dirname, "../../content");
const allow = namesAllowSchema.parse(parse(readFileSync(join(C, "world/names-allow.yaml"), "utf8")));
const IHAN = allowedNames(allow, "ihan");
const YEONHU = allowedNames(allow, "yeonhu");
const kst = (s: string): Date => new Date(`${s}+09:00`);

describe("ISO 주(KST)", () => {
  it("KST 날짜 기준으로 주를 고른다", () => {
    expect(isoWeekOf(kst("2026-11-17T12:00:00"))).toBe("2026-W47");
    expect(isoWeekOf(kst("2026-11-22T23:59:00"))).toBe("2026-W47");
    expect(isoWeekOf(kst("2026-11-23T00:00:00"))).toBe("2026-W48");
    // UTC로는 일요일이지만 KST로는 월요일
    expect(isoWeekOf(new Date("2026-11-22T15:30:00Z"))).toBe("2026-W48");
    expect(isoWeekOf(kst("2027-01-01T10:00:00"))).toBe("2026-W53");
    expect(kstParts(new Date(isoWeekMonday("2026-W47") * 86400000)).date).toBe("2026-11-16");
  });
});

/** §4-4 미리 고정한 시각 20개(블록 경계·no-until 사건 이어짐·KST 자정·주 경계·취침 포함) → 기대 사건 id */
const FIXED: [string, string | null][] = [
  ["2026-11-21T09:59:00", null],
  ["2026-11-21T10:00:00", "ihan-2026-W47-01"],
  ["2026-11-21T14:59:00", "ihan-2026-W47-01"],
  ["2026-11-21T15:00:00", null],
  ["2026-11-21T15:30:00", "ihan-2026-W47-02"],
  ["2026-11-21T18:59:00", "ihan-2026-W47-02"],
  ["2026-11-21T19:00:00", "ihan-2026-W47-03"],
  ["2026-11-21T22:59:00", "ihan-2026-W47-03"],
  ["2026-11-21T23:30:00", null],
  ["2026-11-22T00:00:00", null],
  ["2026-11-22T09:00:00", "ihan-2026-W47-04"],
  ["2026-11-22T12:30:00", "ihan-2026-W47-05"],
  ["2026-11-22T22:59:00", "ihan-2026-W47-05"],
  ["2026-11-22T23:00:00", "ihan-2026-W47-06"],
  ["2026-11-23T00:00:00", "ihan-2026-W47-06"],
  ["2026-11-23T00:29:00", "ihan-2026-W47-06"],
  ["2026-11-23T00:30:00", null],
  ["2026-11-23T05:30:00", "ihan-2026-W48-01"],
  ["2026-11-23T12:00:00", "ihan-2026-W48-02"],
  ["2026-11-23T21:59:00", "ihan-2026-W48-03"],
];

describe("eventAt", () => {
  it.each(FIXED)("%s KST → %s", (t, id) => {
    expect(eventAt("ihan", kst(t), ROOT)?.id ?? null).toBe(id);
  });
  it("원장이 없으면 null/[]", () => {
    expect(eventAt("ihan", kst("2026-11-21T10:00:00"), EMPTY)).toBeNull();
    expect(eventsBetween("ihan", kst("2026-11-20T00:00:00"), kst("2026-11-24T00:00:00"), EMPTY)).toEqual([]);
  });
});

describe("eventsBetween·publicEventsBetween", () => {
  it("(from, to] 구간, 주 경계를 넘어 시각 순", () => {
    const ids = eventsBetween("ihan", kst("2026-11-22T09:00:00"), kst("2026-11-23T12:00:00"), ROOT).map((e) => e.id);
    expect(ids).toEqual(["ihan-2026-W47-05", "ihan-2026-W47-06", "ihan-2026-W48-01", "ihan-2026-W48-02"]);
    const pub = publicEventsBetween("ihan", kst("2026-11-20T00:00:00"), kst("2026-11-24T00:00:00"), ROOT).map((e) => e.id);
    expect(pub).toEqual(["ihan-2026-W47-01", "ihan-2026-W47-02", "ihan-2026-W47-04", "ihan-2026-W48-02"]);
  });
});

describe("소비처가 같은 시각에 같은 사건을 고른다(§4-4 20/20)", () => {
  const summaries = [...eventsBetween("ihan", kst("2026-11-16T00:00:00"), kst("2026-11-30T00:00:00"), ROOT)].map((e) => e.summary);
  let matched = 0;
  it.each(FIXED)("%s", (t, id) => {
    const now = kst(t);
    const a = withLedger(activityAt(character, now, { relDay: -150, stage: 3 }), "ihan", now, ROOT);
    const ev = a.ledgerEvent ?? null;
    expect(ev?.id ?? null).toBe(id);
    const persona = buildPersona({ bible, voiceMd, canon: [], activity: a, stage: 3 }).dynamic_suffix;
    const material = proactiveMaterial(a, null, null)[0] as string;
    const gapIds = gapLedger("ihan", new Date(now.getTime() - 25 * 3600000), now, ROOT).map((e) => e.id);
    if (ev) {
      expect(activityLine(a)).toBe(ev.summary);
      expect(persona).toContain(`지금 일(삶 원장): ${ev.summary}`);
      expect(persona).toContain(`- 장소: ${ev.place}`);
      for (const s of summaries) if (s !== ev.summary) expect(persona).not.toContain(s);
      expect(material).toContain(ev.summary);
      expect(publicEventAt("ihan", now, ROOT)?.id ?? null).toBe(ev.public ? ev.id : null);
      expect(gapIds).toContain(ev.id);
    } else {
      expect(persona).not.toContain("지금 일(삶 원장)");
      expect(material).toBe(`- What you are doing today: ${a.activity}`);
      expect(publicEventAt("ihan", now, ROOT)).toBeNull();
    }
    matched++;
  });
  it("20/20", () => expect(matched).toBe(20));
});

describe("원장이 없을 때 폴백", () => {
  it("활동·persona·선톡·부재가 기존 동작 그대로", () => {
    const now = kst("2026-11-21T10:00:00");
    const base = activityAt(character, now, { relDay: -150, stage: 3 });
    const a = withLedger(base, "ihan", now, EMPTY);
    expect(a).toBe(base);
    expect(a.ledgerEvent).toBeUndefined();
    expect(buildPersona({ bible, voiceMd, canon: [], activity: a, stage: 3 }).dynamic_suffix).not.toContain("삶 원장");
    expect(proactiveMaterial(a, null, null)[0]).toBe(`- What you are doing today: ${base.activity}`);
    const from = kst("2026-11-20T10:00:00");
    expect(gapLedger("ihan", from, now, EMPTY)).toEqual([]);
    expect(gapEvents(character, from, now, -150, 3, [], gapLedger("ihan", from, now, EMPTY))[0]?.source).toBe("routine");
  });
  it("persona에는 원장 유무와 상관없이 지어내기 금지 지시가 있다", () => {
    const a = activityAt(character, kst("2026-11-21T10:00:00"), { relDay: -150, stage: 3 });
    expect(buildPersona({ bible, voiceMd, canon: [], activity: a, stage: 3 }).dynamic_suffix).toContain(
      "Do not invent places, people or times that are not in your current event or known facts",
    );
  });
  it("부재 복귀: 원장 사건이 있으면 일기보다 먼저, id를 단다", () => {
    const from = kst("2026-11-21T09:00:00");
    const to = kst("2026-11-22T13:00:00");
    const ev = gapEvents(character, from, to, -150, 3, [{ date: "2026-11-22", body: "diary" }], gapLedger("ihan", from, to, ROOT));
    expect(ev.map((e) => e.source)).toEqual(Array(5).fill("ledger"));
    expect(ev[0]).toMatchObject({ id: "ihan-2026-W47-01", date: "2026-11-21" });
    expect(ev[0]!.text).toBe("Running the full group choreography (the practice room; with Dohyun, Rui)");
  });
});

const ev = (p: Partial<LedgerEvent>): LedgerEvent => ({
  id: "ihan-2026-W48-01",
  at: "2026-11-23T12:10:00+09:00",
  place: "the dorm",
  with: [],
  items: [],
  summary: "Eating lunch",
  public: false,
  ...p,
});

describe("허용 목록 검사기", () => {
  it("en: 허용 이름·흔한 첫 단어·소유격은 통과, 그 밖 대문자 단어는 걸림", () => {
    expect(properNounFindings("Running the bridge choreography with Dohyun and Rui", IHAN)).toEqual([]);
    expect(properNounFindings("Borrowing Dohyun's jacket. Rehearsal ran late on Monday.", IHAN)).toEqual([]);
    expect(properNounFindings("Calling his parents in Busan", IHAN)).toEqual([]);
    expect(properNounFindings("Grabbing coffee with Jake at Starbucks", IHAN)).toEqual(["Jake", "Starbucks"]);
    expect(properNounFindings("Watching NewJeans videos with Lumen Harbor staff", IHAN)).toEqual(["NewJeans"]);
    expect(properNounFindings("Minho stopped by the practice room", IHAN)).toEqual(["Minho"]);
  });
  it("ja: 가타카나 전체 이름·호칭 붙은 이름·『』·地名은 허용 목록 밖이면 걸림", () => {
    expect(properNounFindings("ト・ソクファン室長の車で『冬芽』の撮影現場へ移動している", YEONHU)).toEqual([]);
    expect(properNounFindings("皆さんにお茶を配り、お母さんに電話する", YEONHU)).toEqual([]);
    expect(properNounFindings("南山の道を歩きながらセリフを覚えている", YEONHU)).toEqual([]);
    expect(properNounFindings("田中さんと打ち合わせ", YEONHU)).toEqual(["田中"]);
    expect(properNounFindings("キム・スヒョンと食事", YEONHU)).toEqual(["キム・スヒョン"]);
    expect(properNounFindings("『愛の不時着』を見返している", YEONHU)).toEqual(["『愛の不時着』"]);
    expect(properNounFindings("渋谷駅で降りる", YEONHU)).toEqual(["渋谷駅"]);
  });
  it("ko: 호칭 붙은 한글 이름·《》", () => {
    expect(properNounFindings("부모님께 전화하고 도현이랑 연습", IHAN)).toEqual([]);
    expect(properNounFindings("민수씨와 연습", IHAN)).toEqual(["민수"]);
    expect(properNounFindings("《눈물의 여왕》 다시 보기", YEONHU)).toEqual(["《눈물의 여왕》"]);
  });
  it("with는 허용 목록과 정확히 같아야 한다", () => {
    expect(allowListFindings(ev({ with: ["Hajun"] }), IHAN)).toEqual([]);
    expect(allowListFindings(ev({ with: ["Jake"], place: "Starbucks" }), IHAN)).toEqual(["names:with:Jake", "names:place:Starbucks"]);
  });
});

describe("사람인 척 거부", () => {
  it.each([
    ["Meeting a fan in person after practice"],
    ["Video calling you before bed"],
    ["Sending proof that he is real"],
    ["あなたと電話する"],
    ["ファンと直接会う約束"],
    ["사용자와 영상통화"],
  ])("%s", (summary) => {
    expect(pretendHumanFindings(ev({ summary })).length).toBeGreaterThan(0);
  });
  it("사용자가 with에 있으면 거부", () => {
    expect(pretendHumanFindings(ev({ with: ["user"] }))).toContain("pretend_human:with:user");
  });
  it("가족·멤버와의 일상은 통과", () => {
    expect(pretendHumanFindings(ev({ summary: "Video calling his siblings", with: ["Dohyun"] }))).toEqual([]);
    expect(pretendHumanFindings(ev({ summary: "妹のウヌと電話している" }))).toEqual([]);
    expect(pretendHumanFindings(ev({ summary: "ジフ君と練習している" }))).toEqual([]);
  });
});

describe("일정 일치", () => {
  const ihanSchedule = character.schedule;
  const yeonhuSchedule = scheduleSchema.parse(parse(readFileSync(join(C, "characters/yeonhu/schedule.yaml"), "utf8")));
  const rel = () => -150;
  it("블록 안이면 통과, 취침이면 거부", () => {
    expect(scheduleFindings(ev({ at: "2026-11-23T12:10:00+09:00", until: "2026-11-23T12:50:00+09:00" }), ihanSchedule, rel, "12:00-13:00")).toEqual([]);
    expect(scheduleFindings(ev({ at: "2026-11-23T03:00:00+09:00" }), ihanSchedule, rel)).toEqual(["schedule:sleep:24:00-05:30"]);
  });
  it("모델이 고른 블록과 실제 블록이 다르면 거부", () => {
    expect(scheduleFindings(ev({ at: "2026-11-23T12:10:00+09:00" }), ihanSchedule, rel, "13:00-18:00")).toEqual(["schedule:block_mismatch:13:00-18:00!=12:00-13:00"]);
  });
  it("until이 취침 블록으로 넘어가면 거부, 자정을 넘는 블록 안에서 끝나면 통과", () => {
    expect(scheduleFindings(ev({ at: "2026-11-23T22:30:00+09:00", until: "2026-11-24T00:40:00+09:00" }), ihanSchedule, rel)).toEqual(["schedule:until_in_sleep:24:00-05:30"]);
    // 연후 토요일 22:00-01:00 블록(다음 날 일정표는 00:00부터 취침)
    expect(scheduleFindings(ev({ at: "2026-12-05T22:30:00+09:00", until: "2026-12-06T00:50:00+09:00" }), yeonhuSchedule, () => -176)).toEqual([]);
  });
});

describe("validate-content: 원장 파일", () => {
  it("예시 원장은 통과", () => {
    for (const w of ["2026-W47", "2026-W48"]) {
      expect(validateLedgerText(readFileSync(join(ROOT, `characters/ihan/ledger/${w}.jsonl`), "utf8"), "ihan", w, allow)).toEqual([]);
    }
  });
  it("주 밖·id 중복·허용 목록 밖·사람인 척·허용 목록 항목 없음을 잡는다", () => {
    const rows = [ev({ id: "ihan-2026-W48-01", at: "2026-11-30T12:00:00+09:00" }), ev({ id: "ihan-2026-W48-01", summary: "Meeting Jake in person" })];
    const out = validateLedgerText(rows.map((r) => JSON.stringify(r)).join("\n"), "ihan", "2026-W48", allow);
    expect(out.some((m) => m.includes("2026-W48 밖"))).toBe(true);
    expect(out.some((m) => m.includes("id 중복"))).toBe(true);
    expect(out.some((m) => m.includes("names:summary:Jake"))).toBe(true);
    expect(out.some((m) => m.includes("pretend_human:in person"))).toBe(true);
    expect(validateLedgerText(JSON.stringify(ev({})), "isol", "2026-W48", allow).some((m) => m.includes("isol 항목 없음"))).toBe(true);
  });
});
