# STATUS — 지금 어디까지 했나 (빈 줄 제외 15줄, 항목당 한 줄. 배포 이력은 `docs/deploy-log.md`)

## 진행 중 (상태: 설계·구현·배포·확인대기 — 3줄이면 새 작업은 백로그 기록만)
- 첫 캐릭터 설계서 `docs/work-plans/2026-11-13-첫캐릭터-설계서.md` — 확인대기. 남은 것: 검수자 선별 W1c, "데뷔 직전 출발" 채택 시 timeline·일기 주제 재배치
- W2 검수 CLI `docs/work-plans/2026-11-13-W2-검수-CLI.md` — 확인대기(1단·골든 검증 완료, 2단 LLM은 API 키 대기). W4 일기 도구는 구현 중(implementer)
- W5 얼굴 고정 `docs/work-plans/2026-11-13-W5-얼굴고정-사진.md` — 설계 확정(klein 4B). 남은 것: fal.ai 계정·키 → W5a 기준 얼굴 후보

## 막힌 것 / 사람 확인 필요 (사용자 지시: 질문은 나중에 — 기본값으로 진행 중)
- **사용자가 해야 하는 것**: fal.ai 가입·API 키, LLM API 키(Anthropic 또는 Vercel AI Gateway), AWS 계정(Rekognition) — `.env`에 넣어 주면 W2 2단·W4·W5 실행 가능
- 기본값 확인: A안 서이한 / 2차 가칭 ONDAY·Lumen Harbor·지후(겹침 없음 확인) / 첫 만남 "팬이지만 팬으로 대하지 않는 사람" / SNS 규칙(`docs/ops/sns-rules.md` 끝 5개: "AI냐" 응답 방식·핸들·검수자 주간 부담·게시 시각·위기 대본)
- 검수자 세션(W1c 말투 선별, W5a 기준 얼굴 선택) 일정 — 사용자

## 다음 할 일
1. 이름 교체·W2 결과 검토 → 커밋 → W3(일정 엔진·persona·canon-check) implementer 착수(계획서 있음)
2. 키 확보 후 W4 일기 30일분(계획서 있음) → W6 SNS 개설·첫 게시
3. 2단계 ① 앱 뼈대 작업계획서(Next.js·Clerk·Neon·UI 레퍼런스 조사)
