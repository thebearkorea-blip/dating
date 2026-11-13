// complete() 호출의 사용량·비용을 billing.llm_usage에 남기는 공통 래퍼. 호출부는 이 파일만 거친다.
// 기록 실패는 호출 결과에 영향을 주지 않는다.
import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { llmUsage, relationships } from "../db/schema/index";
import { complete, estimateCostUsd, type LlmRequest, type LlmResponse } from "./index.js";

export type LlmPurpose = "chat" | "judge" | "proactive" | "memory" | "review";
export type LlmFn = (req: LlmRequest) => Promise<LlmResponse>;

export async function completeTracked(
  db: Db,
  purpose: LlmPurpose,
  ctx: { relId?: string; userId?: string; now?: Date },
  req: LlmRequest,
  base: LlmFn = complete,
): Promise<LlmResponse> {
  const res = await base(req);
  if (res.usage) {
    try {
      let userId = ctx.userId ?? null;
      if (!userId && ctx.relId) {
        const [r] = await db.select({ u: relationships.userId }).from(relationships).where(eq(relationships.id, ctx.relId)).limit(1);
        userId = r?.u ?? null;
      }
      await db.insert(llmUsage).values({
        relId: ctx.relId ?? null,
        userId,
        purpose,
        model: res.model,
        input: res.usage.inputTokens,
        output: res.usage.outputTokens,
        cacheRead: res.usage.cacheReadTokens ?? 0,
        costUsd: estimateCostUsd(res.model, res.usage),
        at: ctx.now ?? new Date(),
      });
    } catch {
      // 기록 실패는 삼킨다.
    }
  }
  return res;
}

/** purpose·문맥을 묶어 두고 LlmFn 모양으로 쓰는 편의 함수(기존 llm 주입 지점에 그대로 끼운다). */
export function trackedLlm(db: Db, purpose: LlmPurpose, ctx: { relId?: string; userId?: string; now?: Date }, base: LlmFn = complete): LlmFn {
  return (req) => completeTracked(db, purpose, ctx, req, base);
}
