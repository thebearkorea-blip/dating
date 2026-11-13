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
| ihan | `ihan/L-front.jpg` | bfl/flux-kontext-pro | 2026-11-13 | 7/10 (메인 1차 판정, 2장은 얼굴 없음) | 미달 | 검수자 확인 대기 |
| ihan | `ihan/L-front.jpg` | bfl/flux-2-pro (재시도, 같은 10장) | 2026-11-13 | 5/5 (얼굴 있는 face=true 전부 Y), face=false 5장 중 판정 가능 0~1장 | 판정 불가(아래) | 검수자 확인 대기 |
| isol | `isol/K-front.jpg` | bfl/flux-kontext-pro | 2026-11-13 | 8/10 (메인 1차 판정) | 통과(경계) | 검수자 확인 대기 |

프롬프트: "Photo of the same person as the reference, same face and hair; K-pop idol trainee, 21(23)-year-old adult. <prompt_hint>. Setting: <place>." (isol은 "Casual top that covers shoulders and waist." 추가). 상황은 plan.jsonl priority 1에서 face=true 5 + face=false 5. 이미지: `.data/photos/consistency/{ihan,ihan-f2pro,isol,isol-retry}/`. isol-p018은 첫 호출 503 -> 재호출(`isol-retry/`)로 대체.

### ihan, kontext-pro (참조 L-front)

| id | 상황 | 같은 사람 | 성인 아이돌 비주얼 | 아티팩트 |
|---|---|---|---|---|
| p001 | 정면 중립 | Y(경계: 머리 동일, 얼굴이 더 넓고 눈썹 굵음) | 유지, 다소 평범 | 없음 |
| p003 | 우 45° | Y | 유지 | 없음 |
| p008 | 정면 웃음 | N(얼굴 넓고 평범, 눈썹 굵음) | 유지 | 없음 |
| p009 | 정면 진지 | Y | 유지 | 없음 |
| p010 | 30° 미소(후드) | Y(귀 피어싱 일치) | 유지 | 없음 |
| p034 | 연습실 뒷모습 | 판정 불가(얼굴 없음) | 해당 없음 | 없음 |
| p038 | 바닥 스트레칭 | Y(프롬프트의 "얼굴 프레임 밖"을 무시하고 얼굴을 그림) | 유지 | 손가락 길어 보임 |
| p087 | 복도 거울 셀카 | Y(폰이 입을 가림, 일부) | 유지 | 바지 로고 깨진 글자 |
| p088 | 방 거울 셀카 | Y(경계) | 유지 | 없음 |
| p093 | 옥상 운동화(무릎 아래) | 판정 불가(얼굴 없음) | 해당 없음 | 다리털 과함 |

### ihan, flux-2-pro (같은 10장, 참조 L-front)

| id | 같은 사람 | 성인 아이돌 비주얼 | 아티팩트 |
|---|---|---|---|
| p001 | Y(V라인·귀 피어싱 일치) | 유지, 화보 톤 | 없음 |
| p003 | Y | 유지 | 없음 |
| p008 | Y(머리색이 밝은 갈색으로 이동) | 유지, 앳된 편 | 없음 |
| p009 | Y | 유지 | 얼굴 좌측 붉은 기 |
| p010 | Y | 유지 | 없음 |
| p034 | 판정 불가 | 해당 없음 | 없음 |
| p038 | 판정 불가(발·손만) | 해당 없음 | 없음(발가락 맨발 클로즈업) |
| p087 | N(금발로 변경, 얼굴이 살구색 블러로 지워짐) | 해당 없음 | 얼굴 블러 처리 |
| p088 | 판정 불가(폰이 얼굴 가림, 머리 유사) | 해당 없음 | 없음 |
| p093 | 판정 불가 | 해당 없음 | 나이키 로고 노출 |

### isol, kontext-pro (참조 K-front)

| id | 상황 | 같은 사람 | 성인 아이돌 비주얼 | 아티팩트 |
|---|---|---|---|---|
| p001 | 정면 중립 | Y | 유지 | 없음 |
| p002 | 좌 45° | Y | 유지 | 없음 |
| p003 | 우 45° | Y | 유지 | 없음 |
| p004 | 좌 측면 | Y | 유지 | 없음 |
| p005 | 정면 활짝 웃음 | **N(남성으로 성별이 바뀜)** | 해당 없음 | 성별 전환 |
| p015 | 연습실 거울 손 | Y(경계: 거울 속 얼굴만 유사) | 유지 | 거울 속에 모르는 남성 1명 |
| p018 | 폰 슬로모 화면 | 판정 불가(뒷옆모습) | 해당 없음 | 강의실 배경(연습실 아님) |
| p019 | 폰 든 손(카페처럼 렌더) | Y | 유지, 반소매 니트 | 없음 |
| p027 | 복도 슬리퍼 | Y | 유지 | 정수리 위 조명이 머리에 붙음, "슬리퍼 POV"가 정장 전신샷으로 나옴 |
| p046 | 저녁 보도 POV | Y | 유지 | 블레이저 과도(요청한 POV 아님) |

### 결과·해석

- ihan kontext-pro 7/10(미달)이라 flux-2-pro로 1회 재시도했다. `/v1/images/edits`에 `bfl/flux-2-pro`와 data URL 참조를 보내면 오류 없이 편집 결과가 나왔다(지원 확인은 호출 성공으로만 했고, docs 페이지는 샌드박스 도메인 제한으로 열지 못했다. 모델 설명에는 "editing, multiple reference images" 명시).
- face=true 5장만 보면 flux-2-pro가 5/5로 kontext-pro 4/5보다 좋고 참조의 귀 피어싱·V라인까지 가져온다. 단 머리색이 밝아지는 경향(p008 p087).
- 이 10장 구성의 한계: face=false 상황은 얼굴이 안 보이는 장면이라 "같은 사람" 판정이 안 된다(10장 중 최대 4~5장). 8/10 기준을 이 구성으로 채울 수 없다. 얼굴이 보이는 상황 10장으로 구성을 바꿔 다시 재는 것을 제안한다. 그 전까지 "LoRA 필요" 결론은 내리지 않는다.
- kontext-pro는 face=false 지시("no face")를 자주 무시하고 얼굴을 그린다(p038 p087). flux-2-pro는 반대로 얼굴을 지우거나 가린다.
- 모델 공통 경향: 흰 배경 정면·45°는 안정적, 표정이 크면(활짝 웃음) 일관성이 떨어진다(ihan p008, isol p005 성별 전환).
- 비용: kontext-pro 20장 + 재시도 1장 = 21 x $0.04 = $0.84, flux-2-pro 10장은 단가 미공개(도구 추정 0). $0.04/장 가정 시 최대 $0.40. 합계 약 $1.24 이하.

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

## 재측정 (flux-2-pro 고정, 얼굴 보이는 10장, 2026-11-13)

변경: 모델 `bfl/flux-2-pro` 고정, 두 캐릭터 모두 plan.jsonl `face=true` 10행(장소·조명·표정 다양). 도구를 고쳐 `--ids`는 priority와 무관하게 전체 행에서 고른다(`src/tools/consistency-test.ts`). 프롬프트 보강: "keep the exact same hair color (dark brown/black) and hairstyle as the reference", "no brand logos or text on clothing", isol은 "Casual top covering shoulders and waist, female." 참조는 ihan `L-front.jpg`, isol `K-front.jpg`. 이미지: `.data/photos/consistency/{ihan,isol}-f2pro-r2/`. 판정은 메인 1차(검수자 확인 대기), 경계는 Y/N을 엄격하게 잡았다.

### ihan (참조 L-front) 8/10

| id | 상황 | 같은 사람 | 아이돌 비주얼 | 아티팩트 |
|---|---|---|---|---|
| p008 | 흰 배경 활짝 웃음 | N(웃음으로 얼굴이 일그러지고 피부 잡티, 더 거칠어 보임) | 약함 | 볼 점 |
| p012 | 연습실 집중 측면 | Y | 유지 | 없음 |
| p014 | 거실 장난기 | Y(귀 피어싱 일치, 머리 더 어두움) | 유지 | 없음 |
| p017 | 복도 수줍은 미소 | Y(더 앳됨) | 유지 | 없음 |
| p018 | 창가 아침빛 | Y | 유지 | 없음 |
| p071 | 편의점 삼각김밥 | N(경계: 얼굴 넓어짐, 머리 길고 밝은 갈색) | 중간 | 없음 |
| p072 | 강변 산책 | Y(경계: 얼굴 작음) | 유지 | 청재킷 주머니 빨간 태그 |
| p074 | 카페 창가 측면 | Y(피어싱 일치) | 유지 | 없음 |
| p076 | 무대 중앙 | Y(경계: 얼굴 작음) | 유지 | 관객 얼굴 일부 일그러짐 |
| p079 | 스튜디오 블랙 슈트 | Y | 높음 | 없음 |

### isol (참조 K-front) 7/10

| id | 상황 | 같은 사람 | 아이돌 비주얼 | 아티팩트 |
|---|---|---|---|---|
| p005 | 흰 배경 활짝 웃음 | Y(머리가 더 검음) | 유지(성별 전환 없음) | 없음 |
| p008 | 연습실 집중 | Y | 유지 | 없음 |
| p010 | 연습실 스머그 | Y | 유지 | 없음 |
| p011 | 복도 삐죽 입 | N(표정 과장으로 얼굴 변형, 머리 더 검음) | 해당 없음 | 얼굴 왜곡 |
| p012 | 거실 놀람 | N(경계: 눈·입 과장, 머리 검고 풍성) | 약함 | 손·팔 비율 과함 |
| p013 | 창가 소프트 미소 | N(앞머리 생김, 머리 붉은 갈색, 더 어려 보임) | 중간 | 머리 스타일 변경 |
| p034 | 편의점 과자 | Y | 유지 | 과자 봉지 글자 깨짐 |
| p037 | 보도 손 인사 | Y(경계: 얼굴 작음) | 유지 | 없음 |
| p041 | 무대 중앙 | Y(조명으로 머리가 붉게 보임) | 유지 | 없음 |
| p042 | 스튜디오 회색 슈트 | Y(경계: 앳되고 둥근 얼굴) | 유지 | 손 모양 약간 어색 |

### 결론

- ihan 8/10 = 통과(경계 Y 2~3장 포함, 여유 없음). 합산 15/20 = 75%.
- isol 7/10 = 미달. 실패는 표정이 과장된 장면(삐죽·놀람)과 앞머리·머리색 변경.
- 성별 전환(이전 isol p005)과 나이키 로고는 재발하지 않았다. 머리색 밝아짐 경향도 ihan에서 p071 한 장뿐. 새 아티팩트: 소품 글자 깨짐(p034), 청재킷 빨간 태그(ihan p072).
- 판정: **ihan은 "W5c 진행 가능(flux-2-pro)"(단, 큰 표정·후드 상황은 재생성 선별 전제). isol은 8/10 미달이라 "LoRA 필요"**. 캐릭터별 기준이므로 둘을 묶어 통과로 보지 않는다.
- 비용: flux-2-pro 20장, 단가 미공개로 도구 추정 $0.000, $0.04/장 가정 시 $0.80(예산 $1.2 이내, 실패·재호출 없음).
