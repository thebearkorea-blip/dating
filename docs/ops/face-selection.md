# 기준 얼굴 선택 (W5a)

상태: 생성 대기 — fal 잔액 소진(403 "Exhausted balance")으로 후보 24장 미생성 (2026-11-13).
도구: `node src/tools/face-candidates.ts --character ihan|isol --n 4 --shots 3 [--dry-run]` (tsx는 샌드박스 IPC 제한으로 `node` 직접 실행)
모델: FLUX.2 [klein] 4B(`fal-ai/flux-2/klein/4b` 정면) + `.../edit`(45°·웃음, 정면 참조). 이미지는 `.data/photos/candidates/<id>/`, 매니페스트는 `content/characters/<id>/photos/candidates.jsonl`.

## 후보 표 (생성 후 채움)

| 캐릭터 | 후보 | 경로 | 프롬프트 요약 |
|---|---|---|---|
| ihan | A~D | (미생성) | 24세 한국 남성·햇볕에 탄 피부·짧은 머리, 얼굴 특징 4종 |
| isol | A~D | (미생성) | 25세 한국 여성·생활감 있는 성인, 얼굴 특징 4종 |

## 검수자 선택 칸

| 캐릭터 | 선택(또는 혼합 지시) | 근거 한 줄 | 날짜 |
|---|---|---|---|
| ihan | | | |
| isol | | | |
