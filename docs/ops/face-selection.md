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
