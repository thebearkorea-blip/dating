# STATUS — 지금 어디까지 했나 (빈 줄 제외 15줄, 항목당 한 줄. 배포 이력은 `docs/deploy-log.md`)

## 진행 중 (상태: 설계·구현·배포·확인대기 — 3줄이면 새 작업은 백로그 기록만)
- 앱 ④⑤ 확인대기 `docs/work-plans/2026-11-13-앱④-선톡-사진-푸시.md`·`앱⑤-애정도-토라짐-이별.md` — 로컬 M1 앱 범위 ①~⑦ 구현 완료(①②③⑥⑦ 실화면 완료). 남은 것: 선톡 말풍선·푸시 수신 실시간 1회, 토라짐·재회 30일·보상(시각 조작) 실화면
- W5 사진 `docs/work-plans/2026-11-13-W5-얼굴고정-사진.md` — 구현. 기준 얼굴 이한 N·이솔 N 확정, 이한 LoRA 학습 완료, 사진 이한 42·이솔 42장 확정(폐기 이한 1·이솔 8, 보류 11). 남은 것: 검수자 전수 확인(이한 얼굴이 참조보다 어려 보임), priority 2·3 57장, W5d 유사도 검사(AWS 키 또는 수동 Lens)
- 첫 캐릭터 설계서 `docs/work-plans/2026-11-13-첫캐릭터-설계서.md` — 확인대기. 남은 것: 검수자 선별 W1c, 계정 개설(`docs/ops/account-setup.md`)

## 막힌 것 / 사람 확인 필요
- **사용자**: ① Vercel 팀 카드 등록(Claude + 이미지 생성 모두 여기서) ② Neon·Clerk 약관 승인 ③ 틱톡·인스타 계정 4개 — 순서는 `docs/ops/account-setup.md`. fal 충전은 불필요(예비)
- 로컬 실행: `LLM_PROVIDER=mock REPLY_DELAY_SCALE=0.01 npx next dev --webpack -p 3100` → `/dev-login`(beta·admin 체크 가능) → `/admin`. 마이그레이션 `node --import tsx src/db/migrate.ts`(0005까지 적용됨). 테스트 151건
- 기본값 확인: 이솔 23세·HALFTONE / 은찬 탈락 D-90 / D1 = 2026-11-17 / 핸들 가칭 2개

## 다음 할 일
1. 카드 등록 뒤: AI Gateway 실호출 → W2 2단 골든·일기 44편·캡션 28건 2단 검수 → 실모델 채팅 품질 확인(검수자)
2. 카드 뒤: W5a 후보 24장 → 검수자 선택 → 일관성 테스트(8/10) → W5c 100+50장 → W5d 유사도 검사 → 선톡 사진·틱톡 슬라이드 연결
3. Neon·Clerk 연결 + Vercel 프리뷰 배포 + `roles.sql`(push_subscriptions·review_findings·admin billing 읽기) + 지역 차단 실검증 → `docs/deploy-log.md`
