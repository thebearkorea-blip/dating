# 주간 지표 (LLM 호출 비용 기록)

> 도구가 호출마다 한 행씩 append한다. 비용은 `estimateCostUsd` 추정치(USD).

| 날짜 | 도구 | 모델 | 입력토큰 | 출력토큰 | 비용(USD) |
|---|---|---|---|---|---|
| 2026-11-13 | review-golden | anthropic/claude-haiku-5.5 | 87139 | 2505 | 0.009966 |
| 2026-11-13 | face-candidates (24장, t2i 8 + edit 16, 시험 1장 포함 25회 호출) | bfl/flux-3-image-klein + bfl/flux-kontext-pro | - | - | 0.721 (단가표 계산, 응답에 usage 없음) |
