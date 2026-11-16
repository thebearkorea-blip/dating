import { z } from "zod";

// 삶 원장(M3). content/characters/<id>/ledger/<ISO주, 예: 2026-W47>.jsonl 한 줄 = 사건 1개.
// 규칙: 커밋된 사건은 불변. 지난 사건(at < 지금)은 고치지도 지우지도 않는다. 생성 도구(src/tools/ledger-generate.ts)는
// 이미 있는 주 파일을 --force 없이 덮어쓰지 않고, --force여도 지난 사건은 그대로 두고 앞으로의 사건만 바꾼다.

/** KST ISO 시각. 예: 2026-11-16T19:00:00+09:00 */
const kstIso = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?\+09:00$/, "KST ISO(+09:00) 시각이어야 함");

export const ledgerEventSchema = z
  .object({
    /** <캐릭터 id>-<ISO주>-<NN>. 예: ihan-2026-W47-03 */
    id: z.string().regex(/^[a-z0-9-]+-\d{4}-W\d{2}-\d{2,3}$/, "id 형식: <id>-<YYYY-Www>-<NN>"),
    at: kstIso,
    /** 없으면 같은 KST 날짜 안에서 다음 사건 전까지 */
    until: kstIso.optional(),
    /** 가상 장소(또는 일반 명사). 허용 목록 밖 고유명사 금지 */
    place: z.string().min(1),
    /** 함께한 사람. 허용 목록(names-allow.yaml people)에 있는 이름만 */
    with: z.array(z.string().min(1)),
    items: z.array(z.string().min(1)),
    /** 제품 언어(ihan en, yeonhu ja)로 쓴 짧은 현재형 구절 */
    summary: z.string().min(1),
    /** true면 SNS 큐 소재가 될 수 있다 */
    public: z.boolean(),
  })
  .strict()
  .refine((e) => e.until === undefined || Date.parse(e.until) > Date.parse(e.at), { message: "until must be after at" });

export type LedgerEvent = z.infer<typeof ledgerEventSchema>;

const names = z.array(z.string().min(1)).default([]);

/** content/world/names-allow.yaml. 캐릭터별로 허용된 고유명사(사람·장소·작품·단체·기타). 이 밖의 고유명사는 원장 검사에서 걸린다. */
export const namesAllowSchema = z
  .object({
    characters: z.record(
      z.string(),
      z.object({ people: names, places: names, works: names, orgs: names, other: names }).strict(),
    ),
  })
  .strict();

export type NamesAllow = z.infer<typeof namesAllowSchema>;
