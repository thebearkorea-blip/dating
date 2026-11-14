# STATUS — 지금 어디까지 했나 (빈 줄 제외 15줄, 항목당 한 줄. 배포 이력은 `docs/deploy-log.md`)

## 진행 중 (상태: 설계·구현·배포·확인대기 — 3줄이면 새 작업은 백로그 기록만)
- 앱 ④⑤ 확인대기 `docs/work-plans/2026-11-13-앱④-선톡-사진-푸시.md`·`앱⑤-애정도-토라짐-이별.md` — 로컬 ①~⑦ 구현 완료, Neon·Clerk 연결, 첫 배포됨(`deploy-log.md`). 남은 것: Deployment Protection 해제 뒤 Clerk 로그인·푸시 실검증, 선톡 외부 스케줄러, 사진 호스팅(Blob)
- W5 사진 `docs/work-plans/2026-11-13-W5-얼굴고정-사진.md` — 확인대기. LoRA 이한 v1·v2·은찬 학습 완료, 얼굴 없는 컷 84장 flux-2-pro 재생성(83 통과), 실사진·스톡 도구(`ingest-photos`·`stock-fetch`) 완료. 이한 LoRA v1·캔디드 문구 확정. 남은 것: 사용자 육안 확인(아래 1), 거울 상황 문구 보강
- 첫 캐릭터 설계서 `docs/work-plans/2026-11-13-첫캐릭터-설계서.md` — 확인대기. 남은 것: 검수자 선별 W1c, SNS 계정 개설(`docs/ops/account-setup.md`), 고정 코너 2개를 큐 `series` 필드로 반영

## 막힌 것 / 사람 확인 필요
- **사용자**: ① Vercel 프로젝트 `onday` Settings → Deployment Protection → Vercel Authentication **Disabled**(안 끄면 모든 경로가 vercel.com 로그인으로 302) ② `PEXELS_API_KEY` 무료 발급 → `.env.local` ③ 틱톡·인스타 계정 4개 ④ 실사진은 `.data/photos/own/<ihan|isol>/`에 넣기(`sns-rules.md` §8)
- 레퍼런스 조사는 **"레퍼런스" 세션**이 담당(이 세션은 결정·규칙 반영만). **사용자 확인 대기**: 쇼츠 1차 실험(Kling motion-control·i2v 12클립 약 $10, 사용자 촬영 영상 1~2개 필요) 실행 여부 — 결정 "쇼츠 영상 제작 경로"
- 로컬 실행: `REPLY_DELAY_SCALE=0.01 NODE_USE_ENV_PROXY=1 npx next dev --webpack -p 3100` → `/dev-login`. DB 스크립트는 dev 서버 끄고(Neon은 샌드박스 밖에서만 WebSocket 연결됨). 테스트 통과
- 로컬 Gateway 인증 OIDC(12시간 만료) `vercel env pull`로 갱신 — API 키 전환 여부 사용자 결정. 푸시 대기: 로컬 main이 origin/main보다 앞섬(사용자 OK 시 `git branch -f main HEAD && git push origin main`)

## 다음 할 일
1. 사용자: `.data/photos/{ihan,isol}` 재생성분 육안 확인(삭제 = 폐기) · Deployment Protection 해제 · Pexels 키
2. 메인: Deployment Protection 해제 뒤 Clerk·푸시 실검증 → Vercel env(`VAPID_*`·`CRON_SECRET`) → 선톡 스케줄러 → 사진 Blob 호스팅
3. 메인: 쇼츠 1차 실험(사용자 OK + 촬영 영상 받은 뒤) · 큐 `series` 필드 · 실사진·스톡 1차 수집(Pexels 키 받은 뒤)
