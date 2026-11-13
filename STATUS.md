# STATUS — 지금 어디까지 했나 (빈 줄 제외 15줄, 항목당 한 줄. 배포 이력은 `docs/deploy-log.md`)

## 진행 중 (상태: 설계·구현·배포·확인대기 — 3줄이면 새 작업은 백로그 기록만)
- 첫 캐릭터 설계서 `docs/work-plans/2026-11-13-첫캐릭터-설계서.md` — 확인대기. 이한 바이블·일기 30편 + 여성 이솔(HALFTONE) 바이블·일기 14편 완료. 남은 것: 검수자 선별 W1c, 핸들 확정·계정 개설(W6)
- W2 검수 CLI `docs/work-plans/2026-11-13-W2-검수-CLI.md` — 구현(AI Gateway 연결 + 2단 실검증 중, implementer)
- 앱 ① 뼈대 `docs/work-plans/2026-11-13-앱①-뼈대.md` — 설계. Vercel 프로젝트 `onday`(팀 easyonechon) 연결됨. 남은 것: Neon·Clerk 약관 승인 → 설치 → 구현

## 막힌 것 / 사람 확인 필요
- **사용자 브라우저 승인 2개**: Neon https://vercel.com/easyonechon/~/integrations/accept-terms/neon?source=cli · Clerk https://vercel.com/easyonechon/~/integrations/accept-terms/clerk?source=cli → 승인 후 메인이 설치 재시도
- **사용자: fal.ai 가입·API 키** → `.env.local`에 `FAL_KEY=` (Marketplace에 fal 없음). 그 뒤 W5 기준 얼굴 생성
- 기본값 확인: 이솔 23세·HALFTONE 5인·탈락 없음 / 이한 8명 중 은찬 탈락 / D1 = 2026-11-17 / SNS 규칙 5개 / 계정 핸들 2개(가칭)

## 다음 할 일
1. 2단 검수 실측 결과 → 커밋. 이솔 canon-pending 병합 방식 결정(멀티 그룹 스키마는 백로그)
2. Neon·Clerk 설치 → `vercel env pull` → 앱 ① 구현(implementer, 패키지 설치 포함)
3. W5 기준 얼굴 후보(FAL_KEY 뒤) · W6 틱톡 계정 2개 개설·첫 게시(핸들 확정 뒤)
