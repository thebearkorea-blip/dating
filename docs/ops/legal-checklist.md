# 출시 체크리스트 (법·플랫폼·결제) — 2단계 첫 출시 전

> 작성 2026-11-13 메인. 근거는 `docs/research/2026-11-13-외부서비스-조사.md`(조사A)·`docs/research/2026-11-13-광고·게시API-조사.md`(조사B)·`docs/decisions.md`. 변호사 검토 없음(decisions "법률 검토" — 사용자가 생기면). 상태: ✅ 코드에 있음 / 🔧 구현 예정(단위) / ❓ 확인 필요.

| # | 항목 | 요건·근거 | 코드·문서 위치 | 상태 |
|---|---|---|---|---|
| 1 | AI 고지 — 가입 시 1회 | Anthropic AUP(세션 시작 또는 제품 인터페이스), EU AI법 50조, SB 243(고지) | `src/app/onboarding/page.tsx` 체크박스 "He is an AI character." | ✅ |
| 2 | AI 고지 — 프로필 상시 표시 | 공통 원칙 ①(법 최소) + 플랫폼 정책 | 앱 프로필 화면(⑤ 이후) / SNS 계정 라벨(`docs/ops/sns-rules.md` §1) | 🔧 ⑤ |
| 3 | 캐릭터는 AI임을 부정하지 않음 | 최상위 원칙(decisions "원칙 ①②의 적용") | bible `never`, `guards.yaml` A10, voice 예문 21·22 | ✅ |
| 4 | 지역 차단 — 캘리포니아·뉴욕 | SB 243(2026-01-01 시행, 사적 소송권), NY GBL Art.47 — 조사A §6 | `src/proxy.ts`(`x-vercel-ip-country`=US ∧ region CA/NY → `/geo-block`) | ✅ (배포 환경에서 1회 검증 ❓) |
| 5 | 연령 — 18+ 연애 모드, 13 미만 거부, 14~17 준비 중 | COPPA, SB 243 미성년 요건, 스토어 등급 | `src/policy/age-gate.ts`, 온보딩 생년 자기 신고. 결제 수단 보유는 ⑥ Stripe 연결 시 | ✅ / 🔧 ⑥ |
| 6 | 연령 확인 강화(외부 검증) | 자기 신고 충분성 미확인(조사A §7, Ofcom·텍사스 사례) | 사용자 생기면 Stripe Identity 등 — 백로그 | ❓ |
| 7 | 데이터 열람·삭제 | 미국·EU 개인정보법, 기획서 "넘지 않을 선" | `/me`(기억 열람·삭제 `deleted_at`). 계정 삭제·대화 전체 삭제는 ⑤ `/settings` | ✅ 부분 / 🔧 ⑤ |
| 8 | 개인정보 수집 항목 최소 | 이름·도시(시간대)·생년·대화·푸시 구독. 외부 데이터 연동 없음 | 온보딩·`personal.users`·`push_subscriptions`(④). 개인정보 고지문은 `/settings`에 링크(⑤) | ✅ / 🔧 ⑤ |
| 9 | 자해·위기 신호 대응 | SB 243 프로토콜, 기획서 안전장치 | `src/policy/input-guard.ts`(regex → 고정 안전 대본 즉시 저장). 지역별 상담 번호·`content/policy/safety/*.md` 교체 필요 | ✅ 임시 / 🔧 대본 |
| 10 | 성적 콘텐츠 없음(비성적 고정) | Anthropic AUP, Stripe 금지 업종, Google·Meta 광고 정책(조사B §1·2) | `guards.yaml` 출력 규칙, bible `never`, 이솔 고유 규칙 16 | ✅ |
| 11 | 사용자 비난·교정 금지(무조건적 수용) | 공통 원칙 ③ | `guards.yaml` C2·C3, `never` | ✅ |
| 12 | 결제사 등록 명칭 | "AI 컴패니언·인터랙티브 엔터테인먼트 구독", 데이팅 아님(조사A §1) | Stripe 심사 신청 시(사용자 계정) | ❓ 신청 전 |
| 13 | 결제가 성장에 영향 없음 | 기획 고정 규칙, 전체구조 §2.5 | `sql/roles.sql`(Neon에서만), `src/billing` → `world`/`collective` import 0 테스트(⑥) | 🔧 ⑥ |
| 14 | 이별은 결제·방치로 발생하지 않음 | decisions "이별" | `guards.yaml` D2, `src/policy/breakers.ts` 로그만(종료 전이는 ⑤) | ✅ |
| 15 | 한도 도달 시 결제창 없음, 유료 안내는 다음날 아침 1회 | 기획서 과금 원칙 | `busy-overlay`(②), `paywall_morning`(⑥) | ✅ / 🔧 ⑥ |
| 16 | 환불·취소 정책 문구 | Stripe 요구, 지역법 | `/settings` 취소(⑥), 문구 ❓ | 🔧 ⑥ / ❓ |
| 17 | 플랫폼 AI 라벨(인스타 AI 프로필·틱톡·유튜브 합성 속성) | 조사B §4 | `docs/ops/sns-rules.md` §1·§6 | ✅ 문서 / 🔧 계정 개설 시 |
| 18 | 광고 소재·업종 | 콘텐츠 광고만, 데이팅 업종 미신청, 18+ 타깃(조사B §1·2) | `docs/decisions.md` "광고 프레임" | ✅ 결정 |
| 19 | 실존 인물 유사도 검사 | 넘지 않을 선, 조사(LoRA) §4 | W5d(AWS Rekognition + 수동) | 🔧 W5 |
| 20 | 미성년 외형 금지·교복 규칙 | decisions "외형 규칙"·"교복" | W5 프롬프트 고정, 검수자 전수, 이솔 전면 금지 | 🔧 W5 |
| 21 | 카톡·라인 디자인 복제 금지 | 부정경쟁방지법 | `src/app/tokens.css` 독자 팔레트, UI 조사 (b)표 | ✅ |
| 22 | 개발 전용 요소 출시 차단 | — | `LLM_PROVIDER=mock`·`/dev-login`·`/billing/mock-checkout`·DevBanner는 `NODE_ENV=production`에서 비활성(⑥에서 테스트) | 🔧 ⑥ |

❓ 항목(6·12·16·4 배포 검증)은 `docs/decisions.md` 백로그에 한 줄씩.
