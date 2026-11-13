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
