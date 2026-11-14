# 운영 배포 로그

한 배포 = 한 줄. 롤백할 때 이 표만 보면 되게 쓴다. STATUS.md에는 배포 이력을 쓰지 않는다. 절차(백업·배포 순서·마이그레이션)는 (프로젝트 배포 문서 경로)에 둔다.

| 날짜 | 커밋 | 백업 | DB 리비전 | 내용 | 프런트 |
|---|---|---|---|---|---|

## 운영 환경 메모 (배포가 아닌 상태)

- (환경변수 추가, 타이머 설치, 정리 후보 등 한 줄씩)

| 2026-11-14 | 77b34c5+cron | — | Neon 0006 + roles.sql | 첫 프리뷰/프로덕션 배포(Hobby, 커스텀 도메인 없음): https://onday-f0divzlj7-easyonechon.vercel.app — Clerk·Neon·AI Gateway(OIDC). 선톡 cron 제외(Hobby) | Next 16 |
