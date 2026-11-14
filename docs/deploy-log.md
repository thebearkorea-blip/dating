# 운영 배포 로그

한 배포 = 한 줄. 롤백할 때 이 표만 보면 되게 쓴다. STATUS.md에는 배포 이력을 쓰지 않는다. 절차(백업·배포 순서·마이그레이션)는 (프로젝트 배포 문서 경로)에 둔다.

| 날짜 | 커밋 | 백업 | DB 리비전 | 내용 | 프런트 |
|---|---|---|---|---|---|

## 운영 환경 메모 (배포가 아닌 상태)

- (환경변수 추가, 타이머 설치, 정리 후보 등 한 줄씩)

| 2026-11-14 | 77b34c5+cron | — | Neon 0006 + roles.sql | 첫 프리뷰/프로덕션 배포(Hobby, 커스텀 도메인 없음): https://onday-f0divzlj7-easyonechon.vercel.app — Clerk·Neon·AI Gateway(OIDC). 선톡 cron 제외(Hobby) | Next 16 |
| 2026-11-14 | 46c3cd5 | — | 변경 없음 | F4 복구 재배포(build 스크립트·framework nextjs). Deployment Protection 해제. 프로덕션 별칭 https://onday-blush.vercel.app (`/`·`/sign-in` 200) | Next 16 |
| 2026-11-14 | 204945b | — | 변경 없음 | u1: 비로그인 리다이렉트 프로덕션 `/sign-in` 분기 (`/chat` → 307 `/sign-in` 확인) | Next 16 |
| 2026-11-14 | c1fed2e | — | 변경 없음(media 58행 재적재) | 사진 호스팅: Blob 스토어 `onday-photos`(public) + 매니페스트 `public_url` 58장. env 추가: `AI_GATEWAY_API_KEY`(F5), `VAPID_*`, `CRON_SECRET`. 답장 지연 첫 3개 0~2분(u2) | Next 16 |
| 2026-11-14 | e58f0bf | — | 변경 없음 | F6 완화: LLM text 없는 응답 로그 + max_tokens 재시도. 배포본에서 실답장 1건 확인("네, 아까 삼각김밥 하나 먹었어요…") | Next 16 |
| 2026-11-14 | e58f0bf(재배포 2회) | — | 변경 없음 | `CRON_SECRET` 교체(Secret 값은 pull 불가라 로컬 `.data/tmp/cron-secret.txt`에 보관). `/api/cron/proactive` 200 확인. 선톡 1건(사진 ihan-p108 포함)을 11-15 09:30 KST로 수동 틱 생성, `/api/media/ihan-p108` 302→Blob 실화면 확인. 푸시 구독 0(브라우저 알림 허용 대기) | Next 16 |
