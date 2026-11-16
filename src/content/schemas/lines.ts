import { z } from "zod";

// 캐릭터별 고정 문장(content/characters/<id>/lines.yaml). LLM 없이 나가는 "그의 사정" 문장과 화면 상단 활동 한 줄.
// 언어별 풀(en·ko·ja). 없는 언어는 엔진이 제품 기본 언어 → 첫 풀 순으로 대신 쓴다.
export const LINE_LANGS = ["en", "ko", "ja"] as const;
export type LineLang = (typeof LINE_LANGS)[number];

const pool = z.array(z.string().min(1)).min(1);

const pools = z
  .object({ en: pool.optional(), ko: pool.optional(), ja: pool.optional() })
  .strict()
  .refine((p) => LINE_LANGS.some((l) => p[l]), { message: "언어 풀이 하나 이상 필요" });

const activity = z
  .object({
    /** busy 3: 손을 뗄 수 없음 */
    busy3: z.string().min(1),
    /** busy 2: 답장이 느림 */
    busy2: z.string().min(1),
    /** busy 1: 할 일이 좀 있음 */
    busy1: z.string().min(1),
    /** busy 0: 한가함 */
    free: z.string().min(1),
  })
  .strict();

export const linesSchema = z
  .object({
    /** 무료 한도 소진 시 답장 대신 나가는 문장(한도·결제·사과 표현 금지) */
    busy_overlay: pools,
    /** LLM 호출 실패 시 문장 */
    unavailable: pools,
    /** 출력 가드가 두 번 막았을 때의 폴백 문장 */
    fallback: pools,
    /** 화면 상단 활동 한 줄(언어별) */
    activity: z
      .object({ en: activity.optional(), ko: activity.optional(), ja: activity.optional() })
      .strict()
      .refine((p) => LINE_LANGS.some((l) => p[l]), { message: "언어 하나 이상 필요" }),
  })
  .strict();

export type Lines = z.infer<typeof linesSchema>;
