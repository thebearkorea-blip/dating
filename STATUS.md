# STATUS — 지금 어디까지 했나 (빈 줄 제외 15줄, 항목당 한 줄. 배포 이력은 `docs/deploy-log.md`)

## 진행 중 (상태: 설계·구현·배포·확인대기 — 3줄이면 새 작업은 백로그 기록만)
- 앱 ②③ 채팅·기억 `docs/work-plans/2026-11-13-앱②-채팅루프.md` — 확인대기(로컬 mock으로 4왕복·자동 갱신 확인). 남은 것: 기억 추출 임계치 조정 후 `/me` 1건 확인(implementer 진행 중)
- W5 얼굴 고정 `docs/work-plans/2026-11-13-W5-얼굴고정-사진.md` — 구현(도구 완료). 남은 것: **fal 잔액 충전** → 후보 24장 → 검수자 선택 → LoRA
- 첫 캐릭터 설계서 `docs/work-plans/2026-11-13-첫캐릭터-설계서.md` — 확인대기. 이한 30편·이솔 14편 일기, 정체성 원칙 반영. 남은 것: 검수자 선별 W1c, 틱톡 계정 2개 개설(W6)

## 막힌 것 / 사람 확인 필요
- **사용자**: fal.ai 잔액 충전($5~10) · Vercel 팀 카드 등록(AI Gateway 403) · Neon·Clerk 약관 승인(URL은 이전 STATUS/대화) — 로컬 진행에는 영향 없음
- 기본값 확인: 이솔 23세·HALFTONE / 이한 8명 중 은찬 탈락 / D1 = 2026-11-17 / 핸들 2개 가칭 / Vercel 프로젝트 `onday`(팀 easyonechon)
- 알려진 결함: Q1(평가 시점·요일 불일치, decisions), `/me` 개발 오버레이 issue 1건(조사 중)

## 다음 할 일
1. ②③ 확인 마무리 → 앱 ④ 선톡·사진·Web Push 작업계획서(로컬: cron 대신 수동 트리거 스크립트)
2. ⑥ 결제 자리(Stripe 심사 전까지 mock 결제) + 출시 체크리스트 `docs/ops/legal-checklist.md`
3. 충전·승인 뒤: W5 얼굴 생성 → LoRA, Neon·Clerk 연결, AI Gateway 2단 검수 실측
