# 기준 얼굴 선택 (W5a)

상태: 후보 24장 생성 완료(Gateway, 2026-11-13) — 검수자 선택 대기. 비용 $0.712(+ 시험 호출 1장 $0.009 폐기).
도구: `node src/tools/face-candidates.ts --character ihan|isol --n 4 --shots 3 [--dry-run]` (tsx는 샌드박스 IPC 제한으로 `node` 직접 실행)
모델: Gateway `bfl/flux-3-image-klein`(정면, $0.009) + `bfl/flux-kontext-pro`(45°·웃음, 정면 참조 편집, $0.04). 도구 실행은 `NODE_USE_ENV_PROXY=1 node --import tsx src/tools/face-candidates.ts ...`. 이미지는 `.data/photos/candidates/<id>/`, 매니페스트는 `content/characters/<id>/photos/candidates.jsonl`.

## 후보 표

| 캐릭터 | 후보 | 경로(정면/45°/웃음, `.data/photos/candidates/<id>/`) | 프롬프트 요약 | 검수자 선택 |
|---|---|---|---|---|
| ihan | A | `ihan/A-front.jpg`, `A-angle45.png`, `A-smile.png` | 한국 남성 21세·햇볕에 탄 피부·짧은 머리·성인; strong rounded jaw, gentle kind eyes, thick straight eyebrows; 장소 dance practice room | |
| ihan | B | `ihan/B-front.jpg`, `B-angle45.png`, `B-smile.png` | 한국 남성 21세·햇볕에 탄 피부·짧은 머리·성인; defined jawline, slightly upturned eyes, small mole under left eye; 장소 dormitory room | |
| ihan | C | `ihan/C-front.jpg`, `C-angle45.png`, `C-smile.png` | 한국 남성 21세·햇볕에 탄 피부·짧은 머리·성인; oval face, high cheekbones, relaxed warm look, faint stubble; 장소 city street at dusk | |
| ihan | D | `ihan/D-front.jpg`, `D-angle45.png`, `D-smile.png` | 한국 남성 21세·햇볕에 탄 피부·짧은 머리·성인; broad forehead, strong nose bridge, full lips, buzzed short hair; 장소 dance practice room | |
| isol | A | `isol/A-front.jpg`, `A-angle45.png`, `A-smile.png` | 한국 여성 23세·성숙한 성인; oval face, large expressive eyes, straight eyebrows, light freckles; 장소 dance practice room | |
| isol | B | `isol/B-front.jpg`, `B-angle45.png`, `B-smile.png` | 한국 여성 23세·성숙한 성인; sharp chin, single eyelids, wide mouth, confident look; 장소 dormitory room | |
| isol | C | `isol/C-front.jpg`, `C-angle45.png`, `C-smile.png` | 한국 여성 23세·성숙한 성인; defined cheekbones, double eyelids, straight nose, quick knowing smile; 장소 city street at dusk | |
| isol | D | `isol/D-front.jpg`, `D-angle45.png`, `D-smile.png` | 한국 여성 23세·성숙한 성인; long face, defined cheekbones, thick eyebrows, tired-but-bright look; 장소 dormitory room | |
| ihan | E | `ihan/E-front.jpg`, `E-angle45.png`, `E-smile.png` | [2차] 한국 남성 20대 초중반·K-팝 연습생 비주얼·성인; sharp jawline, double eyelids, straight thick brows, warm smile lines; 장소 dance practice room | |
| ihan | F | `ihan/F-front.jpg`, `F-angle45.png`, `F-smile.png` | [2차] 한국 남성 20대 초중반·K-팝 연습생 비주얼·성인; soft V-line jaw, monolid eyes, pale clear skin, two-block haircut; 장소 dormitory room | |
| ihan | G | `ihan/G-front.jpg`, `G-angle45.png`, `G-smile.png` | [2차] 한국 남성 20대 초중반·K-팝 연습생 비주얼·성인; high nose bridge, deep-set eyes, athletic shoulders, sun-kissed skin, bright grin; 장소 city rooftop | |
| ihan | H | `ihan/H-front.jpg`, `H-angle45.png`, `H-smile.png` | [2차] 한국 남성 20대 초중반·K-팝 연습생 비주얼·성인; oval face, dimples, wavy dark hair, calm gaze; 장소 cafe | |
| isol | E | `isol/E-front.jpg`, `E-angle45.png`, `E-smile.png` | [2차] 한국 여성 20대 중반·K-팝 연습생 비주얼·성인; sharp features, double eyelids, sleek straight hair, polished natural makeup; 장소 dance practice room | |
| isol | F | `isol/F-front.jpg`, `F-angle45.png`, `F-smile.png` | [2차] 한국 여성 20대 중반·K-팝 연습생 비주얼·성인; slim V-line jaw, monolid eyes, low ponytail, luminous skin; 장소 dormitory room | |
| isol | G | `isol/G-front.jpg`, `G-angle45.png`, `G-smile.png` | [2차] 한국 여성 20대 중반·K-팝 연습생 비주얼·성인; high cheekbones, layered shoulder-length hair, playful smile; 장소 city street golden hour | |
| isol | H | `isol/H-front.jpg`, `H-angle45.png`, `H-smile.png` | [2차] 한국 여성 20대 중반·K-팝 연습생 비주얼·성인; oval face, arched brows, wavy hair with curtain bangs, composed gaze; 장소 cafe | |

## 검수자 선택 칸

| 캐릭터 | 선택(또는 혼합 지시) | 근거 한 줄 | 날짜 |
|---|---|---|---|
| ihan | | | |
| isol | | | |

## 일관성 테스트 (참조 1장 -> 10장, 검수자 "같은 사람" 8/10 이상이면 통과)

도구: `node --import tsx src/tools/consistency-test.ts --character ihan --ref <경로|URL> --n 10 [--provider gateway|fal|mock] [--dry-run]`
결과: `.data/photos/consistency/<id>/` (이미지 + `results.jsonl`). 8/10 미만이면 fal LoRA로 보강한다(W5 §0 생성 경로).

| 캐릭터 | 참조 이미지 | 모델 | 생성일 | 같은 사람 판정(n/10) | 통과(8/10) | 검수자 메모 |
|---|---|---|---|---|---|---|
| ihan | | | | | | |
| isol | | | | | | |

## 2차 생성 (2026-11-13)

공통 문구 COMMON2(K-pop trainee visual, 부드러운 창광+림라이트, 85mm). 정면 klein + 45°·웃음 kontext-pro. 비용 $0.712(24장). 메인 평가(정면 기준, 45°·웃음 16장은 미검수): ihan E·isol H가 가장 나음, 나머지는 여전히 "평범한 얼굴 + 다큐 질감"이라 아이돌 비주얼 미달. isol E~H는 20대 후반~30대로 보임.

## 모델 비교 (2026-11-13)

`--model <id> --label <이름> --shots 1`로 정면 1컷만. 문구는 아이돌 화보형 통짜 문구(후보 문구 대체). 장소: ihan 연습실, isol 카페. 네거티브 문구는 Gateway 요청에 지원 필드가 없어 미적용. 파일 `.data/photos/candidates/<id>/M*-front.*`, 매니페스트 `candidates.jsonl`에 cand=M1~M3로 append.

| 라벨 | 모델 | 장당 | ihan 평 | isol 평 |
|---|---|---|---|---|
| M1-seedream | bytedance/seedream-4.5 (3.69MP 이상 필요, 1664x2216) | $0.04 | 가장 아이돌다움, 10대 후반~20대 초로 어림(앳된 편), 머리 옆 흰 아티팩트 | 가장 아이돌다움, 20대 초, 크롭탑·오렌지 립으로 노출·'귀여움' 쪽, 성인성은 무난 |
| M2-flux3 | bfl/flux-3-image | $0.048 | 깨끗한 20대, 아이돌 느낌 중간, 얼굴 평범 | 무난한 20대 초중반, 아이돌 느낌 약함 |
| M3-flux2pro | bfl/flux-2-pro | 단가 미공개(도구 추정 0) | 화장 짙은 아이돌 톤, 20대 초, 앳된 편 | 과한 메이크업·선명, 아이돌 느낌 강하나 인위적 |

## 3차 생성 (2026-11-13)

정면만 각 4종(I~L). 문구 IDOL3(IDOL_PROMPT 계열 + "university-aged adult, mature adult shoulder/neck line" 성인 단서) + 변주(눈매·턱선·머리·분위기)와 장소(I 연습실·J 옥상·K 카페·L 거리). 두 캐릭터 모두 `bfl/flux-2-pro`, 3:4, seed 7000. 파일 `.data/photos/candidates/<id>/{I,J,K,L}-front.jpg`.

Seedream 워터마크: 요청에 `watermark:false`를 넣어 isol I 1장 시험 -> 우하단 "AI generated" 그대로 남음. Gateway가 필드를 버리거나 Seedream이 무시한 것으로, 어느 쪽인지는 미확인. 결론: isol도 flux-2-pro 사용. 시험본은 `isol/WMTEST-seedream-I.jpg`(매니페스트에서 제외).

| 후보 | (a) 성인 | (b) 아이돌 비주얼 | (c) 아티팩트 | 판정 |
|---|---|---|---|---|
| ihan I 연습실·쌍꺼풀·투블럭·청량 | 10대 후반으로 보임 | 청량, 무난 | 머리 윗부분 잔머리만 | **폐기(앳됨)** |
| ihan J 옥상·속쌍꺼풀·댄디컷·시크 | 20 안팎, 턱선 날카로워 성인에 가까우나 여전히 어린 편 | 높음(역광, 화보) | 귀 붉은 톤 과함 | 보류 |
| ihan K 카페·쌍꺼풀·가르마펌·따뜻 | 20대 초 | 중상, 부드러움 | 없음 | 후보 |
| ihan L 거리·속쌍꺼풀·투블럭·장난 | 20대 초, 가장 성인스러움 | 높음, 미소 자연스러움 | 귀 피어싱 한쪽, 이상 없음 | **유력** |
| isol I 연습실·쌍꺼풀·긴 생머리·청량 | 20대 초중반 성인 | 높음, 코랄 립·블러셔 짙음 | 크롭탑으로 노출 큼, 정수리 가닥 | 후보 |
| isol J 옥상·속쌍꺼풀·단발·시크 | 20대 초 성인 | 높음, 표정이 뾰루퉁 | 입술·블러셔 과함, 잔머리 흩날림 | 후보 |
| isol K 카페·쌍꺼풀·C컬 긴머리·따뜻 | 가장 분명한 20대 중반 성인 | 높음, 안정적 | 없음 | **유력** |
| isol L 거리·속쌍꺼풀·단발·장난 | 20대 성인 | 중간, 입 벌린 표정이 어색 | 입 모양·눈 화장 인위적, 점 | 보류 |

비용: flux-2-pro 단가 대시보드 미공개라 도구 추정은 0. 메인이 Gateway 로그에서 확인 필요. 이번 호출은 flux-2-pro 8장 + seedream 시험 1장($0.04, 단가표).

### 3차 선택 칸 (검수자)

| 캐릭터 | 선택 후보 | 메모 |
|---|---|---|
| ihan | | |
| isol | | |
