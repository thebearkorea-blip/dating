# 주간 지표 (LLM 호출 비용 기록)

> 도구가 호출마다 한 행씩 append한다. 비용은 `estimateCostUsd` 추정치(USD).

| 날짜 | 도구 | 모델 | 입력토큰 | 출력토큰 | 비용(USD) |
|---|---|---|---|---|---|
| 2026-11-13 | review-golden | anthropic/claude-haiku-5.5 | 87139 | 2505 | 0.009966 |
| 2026-11-13 | face-candidates (24장, t2i 8 + edit 16, 시험 1장 포함 25회 호출) | bfl/flux-3-image-klein + bfl/flux-kontext-pro | - | - | 0.721 (단가표 계산, 응답에 usage 없음) |
| 2026-11-13 | face-candidates 3차 (flux-2-pro 8장 + seedream-4.5 워터마크 시험 1장) | bfl/flux-2-pro + bytedance/seedream-4.5 | - | - | 0.04 + flux-2-pro 8장(단가 미공개, 메인 확인 필요) |
| 2026-11-13 | consistency-test (ihan 10 + isol 11 kontext-pro, ihan 10 flux-2-pro) | bfl/flux-kontext-pro + bfl/flux-2-pro | - | - | 0.84 + flux-2-pro 10장(단가 미공개, $0.04 가정 시 0.40) |
