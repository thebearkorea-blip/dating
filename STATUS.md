# STATUS — 지금 어디까지 했나 (빈 줄 제외 15줄, 항목당 한 줄. 배포 이력은 `docs/deploy-log.md`)

## 진행 중 (상태: 설계·구현·배포·확인대기 — 3줄이면 새 작업은 백로그 기록만)
- 앱 ④⑤ 확인대기 `docs/work-plans/2026-11-13-앱④-선톡-사진-푸시.md`·`앱⑤-애정도-토라짐-이별.md` — 로컬 ①~⑦ 구현 완료, Neon·Clerk 연결, 첫 배포됨(`deploy-log.md`). 프로덕션 `https://onday-blush.vercel.app`: Clerk 로그인·채팅 실답장 확인(F5 키·F6 thinking 완화), 사진 Blob 58장 호스팅, env(`AI_GATEWAY_API_KEY`·`VAPID_*`·`CRON_SECRET`) 완료. 선톡+사진 생성·`/api/media` 302 확인(11-15 09:30 KST 도착 예정). F6 닫힘(답장 정상·재시도 없음). 남은 것: 푸시 알림 1회(사용자가 Chrome 알림 허용 → 구독 생성), 선톡 외부 스케줄러(15분 틱), Q3 다음 날 일정 인지
- W5 사진 `docs/work-plans/2026-11-13-W5-얼굴고정-사진.md` — 확인대기. LoRA 이한 v1·v2·은찬 학습 완료, 얼굴 없는 컷 84장 flux-2-pro 재생성(83 통과), 실사진·스톡 도구(`ingest-photos`·`stock-fetch`) 완료. 이한 LoRA v1·아이돌 셀카 문구 확정, 얼굴 컷 42장 재생성 완료(Neon 54행). 이솔 LoRA v1 24장 → 폐기 13장을 눈 문구·scale 0.85로 재생성(F3 수정). 남은 것: 이솔 13장 육안 확인(아래 1), 아기 컷은 사용자가 직접 편집해 업로드
- 첫 캐릭터 설계서 `docs/work-plans/2026-11-13-첫캐릭터-설계서.md` — 확인대기. 이한 `@seeihan_onday` 개설 + 첫 게시 2건(11-14, 결정 "첫 게시(이한)"). 남은 것: 7일 큐 재생성(새 얼굴 컷·고정 코너 4개, 11-15부터) + 게시 팩, 검수자 W1c, 이솔 계정, 큐 `series` 필드

## 막힌 것 / 사람 확인 필요
- **사용자**: ① 이솔 계정(인스타·틱톡, 새로 만들어야 함 — 인증 코드 필요) ② 배포본 Clerk 가입 시 이메일 인증 코드 입력 ③ **얼굴 없는 일상 컷(음식·일상·신발·옷)은 AI 포기 → 직접 찍은 사진을 `.data/photos/own/<ihan|isol>/`에 `상황__01.jpg`로 넣기**(상황 목록 `sns-rules.md` §8-3)
- 레퍼런스 조사는 **"레퍼런스" 세션**이 담당(이 세션은 결정·규칙 반영만). **사용자 확인 대기**: 쇼츠 1차 실험(Kling motion-control·i2v 12클립 약 $10, 사용자 촬영 영상 1~2개 필요) 실행 여부 — 결정 "쇼츠 영상 제작 경로"
- 로컬 실행: `REPLY_DELAY_SCALE=0.01 NODE_USE_ENV_PROXY=1 npx next dev --webpack -p 3100` → `/dev-login`. DB 스크립트는 dev 서버 끄고(Neon은 샌드박스 밖에서만 WebSocket 연결됨). 테스트 통과
- 로컬 Gateway 인증 OIDC(12시간 만료) `vercel env pull`로 갱신 — API 키 전환 여부 사용자 결정. 푸시 대기: 로컬 main이 origin/main보다 앞섬(사용자 OK 시 `git branch -f main HEAD && git push origin main`)

## 다음 할 일
1. 사용자: 이솔 13장 시트 `consistency/candid-test/sheet-isol-eyes-13.jpg`·`review/isol-face` 확인(삭제 = 폐기) · 아기 사진 직접 편집 후 `.data/photos/own/ihan/`에 업로드 · 이솔 계정 생성
2. 메인: 선톡 외부 스케줄러(cron-job.org 등, `CRON_SECRET` 헤더, 15분) → 푸시 1회 확인(11-15 09:30 선톡) → Q3 → 7일 SNS 큐 재생성
3. 메인: 쇼츠 1차 실험(사용자 OK + 촬영 영상 받은 뒤) · 큐 `series` 필드 · 실사진·스톡 1차 수집(Pixabay 키 받은 뒤) · 인물 교체 도구화
