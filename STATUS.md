# STATUS — 지금 어디까지 했나 (빈 줄 제외 15줄, 항목당 한 줄. 배포 이력은 `docs/deploy-log.md`)

## 진행 중 (상태: 설계·구현·배포·확인대기 — 3줄이면 새 작업은 백로그 기록만)
- 앱 ⑤ 애정도·토라짐·이별/사과·2층 굳히기 `docs/work-plans/2026-11-13-앱⑤-애정도-토라짐-이별.md` — 구현(implementer). 남은 것: 실화면(시각 조작) 확인
- 앱 ④ 선톡·사진·푸시 `docs/work-plans/2026-11-13-앱④-선톡-사진-푸시.md` — 확인대기. 남은 것: 창 안 실시간 틱에서 선톡 말풍선·푸시 수신 1회
- 1단계 콘텐츠·W5 사진 `docs/work-plans/2026-11-13-W5-얼굴고정-사진.md` — 확인대기. 일기 44편·장면 8개·SNS 7일 큐 완료. 남은 것: fal 충전 → 후보 24장 → 검수자 선택 → LoRA → 100장

## 막힌 것 / 사람 확인 필요 (`docs/ops/account-setup.md`에 순서 정리)
- **사용자**: fal.ai 충전($5~10) · Vercel 팀 카드 등록(AI Gateway) · Neon·Clerk 약관 승인 · 틱톡·인스타 계정 4개 개설(핸들 가칭) — 로컬 개발은 영향 없음
- 기본값 확인: 이솔 23세·HALFTONE / 은찬 탈락(D-90) / D1 = 2026-11-17 / 운영 시작 전 Q1(평가 시점·요일) 정리
- 로컬 실행: `LLM_PROVIDER=mock REPLY_DELAY_SCALE=0.01 npx next dev --webpack -p 3100` → `/dev-login`. 마이그레이션 `node --import tsx src/db/migrate.ts`

## 다음 할 일
1. ⑤ 검증·커밋 → ⑦ 베타 평가·admin·지표(계획서 있음) → 로컬 M1 앱 범위 완료
2. 2단 LLM 검수 실측·AI Gateway 실호출(카드 뒤) → 일기·캡션 2단 검수 → W6 첫 게시(계정 뒤)
3. Neon·Clerk 연결 + Vercel 프리뷰 배포(`docs/deploy-log.md` 1행) + `sql/roles.sql` 격리 테스트
