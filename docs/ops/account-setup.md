# 계정 개설 순서 (사용자가 직접 — 본인 인증·결제가 필요한 것만)

> 2026-11-13 메인 작성. 규칙 원본은 `docs/ops/sns-rules.md`·`sns-rules-isol.md`. 핸들은 가칭이며 점유 상태에 따라 바꾼다(바꾸면 두 규칙 문서의 핸들만 갱신).

## 1. 틱톡 (1순위) — 캐릭터당 1개, 총 2개
| 항목 | 이한(ONDAY) | 이솔(HALFTONE) |
|---|---|---|
| 핸들 | `@seeihan_onday` **개설됨(2026-11-14, 개인 계정 전환)** | `@kangisol_halftone` 가칭 |
| 표시 이름 | Seo Ihan | Kang Isol |
| 프로필 문구(영어) | `sns-rules.md` §1 문구 그대로(AI 캐릭터 표시 포함) | `sns-rules-isol.md` §1 |
| AI 라벨 | 설정에서 AI 생성 콘텐츠 라벨 켬(게시마다 "AI-generated" 토글) | 동일 |
| 프로필 링크 | 대기 명단(M1) → 앱(M3). 임시로 저장소 README 금지 — 링크 없으면 비워 둠 | 동일 |
| 계정 종류 | 개인 → 크리에이터 계정으로 전환(분석 지표 열람용) | 동일 |

## 2. 인스타그램 (2순위) — 교차 게시용 2개
- 같은 핸들·표시 이름. **프로페셔널(크리에이터) 계정**으로 전환. 이한: `@seeihan_onday` 개설·크리에이터 전환·AI 라벨·소개·사진 완료(2026-11-14).
- 프로필 편집 → "AI-generated profile" 라벨 토글 켬(2026-08-31 의무, 조사B §4).
- 바이오에 AI 캐릭터 표시 문구 1줄 + 링크(틱톡과 동일).

## 3. 유튜브·페이스북 — 교차 게시(M2부터)
- 유튜브 채널 1개(ONDAY 가칭, 두 캐릭터 쇼츠 모두). 업로드 시 "altered or synthetic content" 속성 켬.
- 페이스북 페이지 1개. 지금은 만들지 않아도 됨.

## 4. 서비스 계정·키 (앱·제작용)
| 서비스 | 용도 | 상태 | 할 일 |
|---|---|---|---|
| fal.ai | LoRA 학습·LoRA 추론(얼굴 컷) | 키 있음, 충전됨(2026-11-14) | 이한 v1·v2, 은찬 LoRA 학습 완료(`.data/photos/lora/`). 얼굴 없는 컷·참조 편집은 Gateway. 잔액은 fal 대시보드에서 확인 |
| Vercel 팀 `easyonechon` | 앱 배포·**AI Gateway(Claude + 이미지 생성)**·Neon·Clerk | 로그인됨, 프로젝트 `onday` | **1순위: 카드 등록**(Settings → Billing; AI Gateway 403 해제, 무료 크레딧 개방) · Neon·Clerk 약관 승인(링크는 STATUS) |
| Stripe | 결제(M3) | 미신청 | 등록 명칭 "AI 컴패니언·인터랙티브 엔터테인먼트 구독", 데이팅 아님 — `legal-checklist.md` 12 |
| AWS | 유사도 검사(Rekognition) | 미생성 | W5d 전 IAM 키 1개(권한 Rekognition만) |

## 5. 개설 뒤 메인이 하는 것
- 핸들 확정값을 규칙 문서에 반영 → 첫 7일 큐(`content/characters/*/sns/queue.jsonl`)의 캡션을 플랫폼에 수동 게시(사용자) → 게시 로그 `sns/posts.jsonl`에 메인이 기록 → 주간 지표 `docs/ops/weekly-metrics.md`.
