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

## 4차 생성 (2026-11-13)

사용자 요청: 더 어린 외모, 신체 강조 완화(`docs/decisions.md` "외모 나이·신체 강조(4차 생성)"). 정면만 각 4종(M~P), 문구 IDOL4(앳된 외모 + 일상 패션 수준 복장, 이솔은 "no sexualized pose, no chest or waist close-up, waist-up or three-quarter framing"). `bfl/flux-2-pro`, 3:4, seed 7000. 파일 `.data/photos/candidates/<id>/{M,N,O,P}-front.jpg`. 목표 외모 나이: ihan 19~20(18 미만 폐기), isol 21~22(20 미만 폐기).

| 후보 | (a) 외모 나이 | (b) 아이돌 비주얼 | (c) 복장 | (d) 아티팩트 | 판정 |
|---|---|---|---|---|---|
| ihan M 연습실·투블럭 | 전신 컷, 18~19 | 중간, 얼굴 작아 판단 어려움 | 파스텔 스웨트셔츠, 일상 | 없음 | 경계(18 안팎, 얼굴 확대 시 재판정) |
| ihan N 옥상·웨이브 펌 | 19 안팎 | 높음(역광, 화보) | 라벤더 스웨트셔츠 | 귀걸이 양쪽 비대칭 가능성 | **유력** |
| ihan O 편의점 밤·울프컷 | 19~20 | 중상, 시크 | 베이지 스웨트셔츠 | 배경 편의점 간판이 실존 체인 로고와 유사(브랜드 로고 금지 위반 소지) | 보류(로고 때문에 재생성 또는 배경 교체) |
| ihan P 거리·내추럴 뱅 | 17~18로 보임 | 높음 | 아이보리 스웨트셔츠 | 손 일부만 보임 | **폐기(18 미만 인상)** |
| isol M 연습실·긴 레이어드 | 22~23 | 높음, 코랄 립 | 민소매 연습복 크롭, 상체 윤곽이 다소 밀착 | 없음 | 후보(복장 밀착 경계, 상반신 노출 큼) |
| isol N 옥상·C컬 | 21 안팎 | 높음 | 민소매 탑, 일상 수준 | 없음 | **유력** |
| isol O 카페·낮은 포니테일 | 21 안팎 | 높음 | 크롭 티, 배 일부 노출·상체 밀착 | 앞머리 가닥 | 후보(복장 경계) |
| isol P 거리·단발 뱅 | 21~22 | 높음 | 민소매 탑 | 머리가 밝은 갈색(설정과 다름) | 후보 |

성적 구도로 보이는 컷은 없음(모두 허리 위 또는 3/4 프레이밍). 다만 isol M·O는 몸에 붙는 상의라 사람 검수에서 한 번 더 확인 요망.

비용: flux-2-pro 8장, 단가 미공개로 도구 추정 $0.000, $0.04/장 가정 시 $0.32(예산 $0.6 이내, 실패·재호출 없음). 메인이 Gateway 로그에서 실단가 확인 필요.

### 4차 선택 칸 (검수자)

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

## 메인 기본값 선택 (2026-11-13)
- 이한: **N**(옥상, 19~20 외모, 화보 느낌) — 대안 L(3차). P 폐기(17~18), O 보류(간판 로고).
- 이솔: **N**(옥상, 21 외모, 민소매 일상 수준) — 대안 K(3차)·M. 사용자/검수자가 바꾸면 LoRA 참조만 교체.

## LoRA 파이프라인 도구 (W5b~c, 코드만·미실행)

순서: `lora-refs`(참조 30장) -> 사람 검수 -> `--keep`으로 zip -> `lora-train` -> `generate-photos`. 모든 도구에 `--dry-run`(호출 수·예상 비용만 출력). 산출물은 `.data/photos/`(gitignore), 매니페스트만 `content/characters/<id>/photos/manifest.jsonl`.

1. `node --import tsx src/tools/lora-refs.ts --character ihan --ref <정면 참조> --n 30 [--model bfl/flux-2-pro]` -> `.data/photos/lora-refs/<id>/NN.jpg` + `refs.jsonl`. 검수 뒤 `--keep 01,03,...`로 `<id>-refs.zip` 생성.
2. `node --import tsx src/tools/lora-train.ts --character ihan --zip <zip> [--steps 1000] [--trigger "ihanx person"]` -> `.data/photos/lora/<id>.json`.
3. `node --import tsx src/tools/generate-photos.ts --character ihan --plan content/characters/ihan/photos/plan.jsonl [--priority 1] [--dry-run]` (이어하기 지원).

fal 확인(2026-11-13, openapi `https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=<id>`):
- **fal에 FLUX.2 klein 4B 트레이너는 없다**(`fal-ai/flux-2-klein-4b-base-trainer` = null). 있는 것은 9B(`fal-ai/flux-2-klein-9b-base-trainer`, 9B는 BFL 비상업 라이선스라 제외)와 FLUX 3 klein(`blackforestlabs/flux-3/klein/base/trainer`, fal 표기 licenseType commercial).
- 기본 트레이너 `blackforestlabs/flux-3/klein/base/trainer`: 필수 `images_data_url`(zip URL), 선택 `steps`(100~10000, 기본 1000)·`learning_rate`(1e-4)·`resolution`(512/768/1024)·`trigger_phrase`(캡션 없는 이미지 전부의 캡션)·`enable_safety_checker`. 출력 `lora_file.url`·`config_file.url`. 단가 $0.0043/step(1000step $4.30).
- 추론 `blackforestlabs/flux-3/klein/base/text-to-image/lora`: `prompt`·`loras[{path,scale}]`(최대 3)·`image_size`·`num_inference_steps`(기본 50)·`output_format`. $0.035/MP. 트레이너와 같은 base라 이 쌍을 쓴다. (4B LoRA 추론 `fal-ai/flux-2/klein/4b/base/lora`는 있으나 맞는 트레이너가 없어 쓰지 않는다.)
- FLUX 3 klein의 BFL 라이선스(상업 이용·출력물 조건)는 fal 표기만 확인했고 원문 미확인 -> 학습 전에 확인.

## 이솔 50장 (Gateway 참조 편집, 2026-11-13)

LoRA 없이 `bfl/flux-2-pro` 참조 편집. 참조 `.data/photos/candidates/isol/N-front.jpg`, 계획 `content/characters/isol/photos/plan.jsonl` 50행. 도구: `node --import tsx src/tools/generate-photos.ts --character isol --plan content/characters/isol/photos/plan.jsonl --provider gateway --ref .data/photos/candidates/isol/N-front.jpg --model bfl/flux-2-pro` (4:5, 이어하기 지원). 문구: "same person as the reference, same dark hair color and wavy bob, female, 23-year-old adult who looks 21-22, K-pop idol trainee. <prompt_hint>. Setting: <place>. no logos or text." + K-팝 음악방송 심의 수준 복장 문구(성적 구도·가슴/허리 클로즈업 금지). 이미지 `.data/photos/isol/<id>.jpg`, 매니페스트 50행(`validate-content content` OK). 호출 51회 중 503 1회(p017은 재호출로 성공). 판정은 메인 1차(저해상도 8장 시트 확인, 검수자 확인 대기).

| 항목 | 결과 |
|---|---|
| 같은 사람(face=true 24장) | 대체로 같음. 의심: p006(표정 과장·얼굴 달라 보임), p009·p022(앞머리 생김, 참조는 앞머리 없음), p050(머리색 밝은 갈색) |
| 성인 외모 | 모두 20대 초중반으로 보임, 미성년 인상 없음 |
| 복장 수위 | 대체로 연습복·민소매·크롭 수준. 경계: p010(스포츠브라+수건), p017·p018·p019·p043·p048(허리·다리 위주 크롭), p029·p030(가슴 높이까지 토르소 크롭), p039 |
| face=false 위반 | 얼굴이 보임: p021, p032, p033, p049. 빈 무대여야 하나 인물이 있음: p038 |
| 아티팩트 | p044 얼굴이 뭉개짐, p046 소매 형태 깨짐, p040 실루엣 5명(계획 8명)+타이트한 뒷모습, p034 한글 비슷한 과자 포장 글자, p033 가격표 글자 깨짐, p037 모자 로고 |

폐기(매니페스트 `used`에 `{"where":"rejected","at":"2026-11-13"}`): isol-p021, p032, p033, p038, p040, p044, p046, p049 (8장, 확정 가능 수 42장). 보류(검수자 판단): p006, p009, p022, p050, p029, p030, p034, p037, p010, p018, p048.

## LoRA 검증·생성 (ihan, 2026-11-13)

LoRA: `blackforestlabs/flux-3/klein/base/trainer` 1000step, 트리거 "ihanx person". 추론 `.../text-to-image/lora`, scale 1, $0.035/MP. 프롬프트 = 트리거 + prompt_hint + "Setting" + "21-year-old adult Korean male idol trainee, same dark hair, no logos or text" (`generate-photos.ts`에 `--ids` 추가).

### 검증 10장 (참조 N-front)

plan에서 face=true·priority 1은 p001~p010 10행뿐이고 전부 흰 배경 기준 시트라 장소 다양성은 없다(각도·표정으로 대체). 10행 전부 생성.

| id | 상황 | 같은 사람 | 성인 외모 | 아티팩트 |
|---|---|---|---|---|
| p001 | 정면 무표정 | Y(경계: 참조보다 둥글고 어림) | 경계(18~19) | 없음 |
| p002 | 좌 45도 | Y | Y | 없음 |
| p003 | 우 45도 | Y | Y | 없음 |
| p004 | 좌측면 | Y | Y | 없음 |
| p005 | 우측면 | Y | Y | 없음 |
| p006 | 전신 정면 | Y(얼굴 작음) | Y | 없음 |
| p007 | 전신 3/4 | Y | Y | 없음 |
| p008 | 활짝 웃음 | Y | 경계(18) | 없음 |
| p009 | 진지 정면 | Y | Y | 없음 |
| p010 | 45도 옅은 미소 | Y | 경계(17~19) | 없음 |

같은 사람 10/10(참조의 귀걸이·점은 학습에 안 남음), 아티팩트 0, 성인 외모 경계 3장(p001·p008·p010). 9/10 이상이라 통과. 참조보다 전반적으로 얼굴이 둥글고 어려 보이는 경향은 있다.

### priority 1 전체 43행 (이어하기 33행 추가)

생성 43/43 성공, 실패 0. 전수 확인:
- face=true 10장: 위 표. 교복·로고 없음.
- face=false 33장 중 **18장 폐기**(매니페스트 `used`에 `{"where":"rejected","at":"2026-11-13"}`): 얼굴이 보이는 것 14장(p027 p029 p036 p043 p045 p051 p052 p053 p060 p062 p066 p067 p069 p070), 얼굴 보임+기타 4장(p086 누운 인물 비율 깨짐, p089 신발 크기 비현실, p093 얼굴 일부, p094 정면 얼굴). 트리거 "ihanx person"이 인물을 끌어오는 경향이 원인 — prompt_hint의 "얼굴 제외"가 안 먹는다.
- 통과 15장: p026 p030 p031 p034 p038 p039 p042 p054(턱·입만) p055 p063 p087 p088(휴대폰으로 얼굴 가림) p090(뒷모습 측면) p091 p096. 경계: p034(거울 속 동일 인물 복제), p088(눈썹 일부 노출), p054.
- 로고: p043 반바지 작은 로고(폐기됨) 외 없음. 교복 없음. 성인 외모 이슈 없음(face=true 외는 얼굴이 거의 안 나옴).
- 결과: 사용 가능 25장(face=true 10 + face=false 15).
- 개선안: face=false 행은 트리거 없이 생성(예: 인물 없는 프롬프트, 또는 scale 낮춤)하는 재생성 필요.

비용: 추론 43장 $1.516(검증 10장 $0.351 + 33장 $1.165, 도구 추정, fal 페이지 단가 $0.035/MP).

## priority 2·3 (ihan, 2026-11-14)

plan priority 2 = 35행(face=true 18 + false 17), priority 3 = 22행(true 14 + false 8). 총 57행 중 **face=true 32행만 생성, face=false 25행은 미생성**(Gateway 401: `.env.local`의 VERCEL_OIDC_TOKEN이 2026-11-13T18:50Z에 만료. 갱신은 `.env.local` 변경이라 하지 않음 -> 메인이 토큰 갱신 후 `--provider gateway --no-lora --ids ...`로 25행 실행 필요, 매니페스트 행은 이 경로가 추가하지 않으므로 별도 append).

face=true 32장(LoRA, scale 1): 생성 32/32, 실패 0. 전수 확인 결과 **통과 24, 폐기 8**(매니페스트 `used`에 `{"where":"rejected","at":"2026-11-14"}`).
- 폐기: p015(눈이 푸른색으로 변함+앳됨), p016(눈 과장 왜곡+앳됨), p017(17~18로 보임), p024(흰 셔츠 교복 인상+17 안팎), p048(젖은 흰 티+흰 반바지 다리 벌린 구도, 수위 경계), p076(10대 중반 인상), p078(17~18 인상), p079(머리·몸 비율 어색, 앳됨).
- 통과 경계: p011·p018·p023·p071·p081(18~19로 보이나 허용), p011 거울 속 복제 인물, p073 뒷모습 타인 1명(배경).
- 같은 사람: 전부 동일 인물로 보임(머리색은 일부 갈색 쪽 이동: p073). 로고·글자 아티팩트 없음(p071 편의점 간판 글자는 판독 불가 수준). 교복 없음(p024 폐기).
- 프롬프트에 "defined jawline"이 빠진 채 생성됨(sed 오류로 첫 실행 뒤에야 `generate-photos.ts`에 반영). 이번 32장은 그 문구 없이 생성.
- 비용: fal LoRA 32장 $1.124(도구 추정). Gateway 0.

## 은찬 후보 (2026-11-14, M2 앞당김)

입력: `content/world/group.yaml` 은찬 행(age 21, 보컬, 아키타입 "몽상가 감성 동생", look "thin pale build, long soft bangs, gentle tired eyes, oversized plain knit sweater"). 외모 목표 20~21 성인(18 미만 폐기). 이한(또렷한 투블럭·황혼 역광)과 구분되도록 부드러운 인상·긴 앞머리·창가 자연광. 정면만 4종(A~D), `bfl/flux-2-pro`, 3:4, seed 7000, 문구 `src/tools/face-candidates.ts` IDOL5(`--cands A,B,C,D --shots 1 --model bfl/flux-2-pro`). 파일 `.data/photos/candidates/eunchan/{A,B,C,D}-front.jpg`, 매니페스트 `content/characters/eunchan/photos/candidates.jsonl`. 교복·학교·성적 요소·로고·글자 없음(전원 니트 스웨터).

| 후보 | 변주(눈매·머리·장소) | (a) 외모 나이 | (b) 아이돌 비주얼 | (c) 이한과 구분 | 판정 |
|---|---|---|---|---|---|
| A | 처진 눈·긴 앞머리 레이어드·침실 창가 흐린 빛 | 19~20 | 높음, 무표정이 몽상가 톤 | 좁은 타원형 얼굴·눈 가리는 앞머리로 구분됨 | 후보(나이 경계) |
| B | 외까풀 피곤한 눈·중단발 웨이브·기숙사 책상 창가 | 20~21 | 높음, 화보 느낌 | 하트형 얼굴·웨이브 머리로 가장 뚜렷이 구분 | **유력** |
| C | 속쌍꺼풀·가운데 가르마 울프형·연습실 창가 | 18~19(앳됨) | 높음 | 머리 모양은 다르나 얼굴이 어림 | 경계(얼굴 확대 시 재판정, 18 미만 인상이면 폐기) |
| D | 속쌍꺼풀·커튼뱅·계단 낮빛 | 19~20 | 높음 | 투블럭에 가까워 이한과 비슷해질 소지 | 보류(구분 약함) |

비교: 이한 후보는 투블럭·또렷한 이목구비·역광, 은찬은 전원 부드러운 앞머리·창가 확산광·니트. 아티팩트: 크게 눈에 띄는 것 없음(B 창가 화분 라벨 글자 판독 불가 수준).

비용: flux-2-pro 4장, 도구 추정 $0.000(단가 미공개), $0.04/장 가정 시 $0.16(예산 $0.4 이내, 실패·재호출 없음). 실단가는 Gateway 로그 확인 필요.

### 은찬 선택 칸 (검수자)

| 캐릭터 | 선택 후보 | 메모 |
|---|---|---|
| eunchan | | |

## LoRA 2차 참조 (ihan, 2026-11-14)

1차 LoRA 결과 얼굴이 기준(`N-front`, 19~20)보다 어려 보여(17~19 컷 다수 폐기) 성인 단서를 강화한 참조 세트를 다시 만든다. **학습은 fal 잔액 부족으로 대기**(lora-train 미실행).

생성: `NODE_USE_ENV_PROXY=1 node --env-file=.env.local --import tsx src/tools/lora-refs.ts --character ihan --ref .data/photos/candidates/ihan/N-front.jpg --n 30 --model bfl/flux-2-pro --out-suffix v2 --lead "Photo of the same person as the reference, 21-year-old adult Korean man, university-age, defined jawline and adult facial proportions, same dark hair and style, no logos or text on clothing, plain background, face large in frame, head and shoulders, sharp focus, photorealistic"` (도구에 `--out-suffix`·`--lead` 추가. 시점·표정·조명·옷 변주는 1차와 같은 주기). 출력 `.data/photos/lora-refs/ihan-v2/01~30.jpg`, 호출 30회 실패 0.

선별(메인 1차, 같은 사람 Y/N · 외모 나이 19~22만 통과 · 아티팩트): **통과 15 / 폐기 15**.

| 구분 | 번호 | 사유 |
|---|---|---|
| 통과 | 02 03 04 05 08 11 12 14 23 24 26 28 30 | 같은 사람, 19~22 |
| 통과(경계) | 15 16 | 18~19로 보이나 허용 |
| 폐기: 다른 사람(서구형 얼굴) | 01 09 10 17 22 27 29 | 한국인 외모 아님, 01은 17 안팎, 29는 수염 |
| 폐기: 앳됨(17~18) | 06 18 20 21 25 | 매끈하고 어려 보임 |
| 폐기: 기타 | 07 13 19 | 07 둥글고 18, 13 피부 트러블 강조·얼굴 다름, 19 30대로 보임 |

성인 단서 강화만으로는 서구형 얼굴로 흐르는 컷이 7장 나왔다(참조 이미지 영향이 약해짐). 통과 15장이라 20장에 5장 부족 -> 추가 생성은 예산($1.5, 30장 추정 $1.2) 때문에 하지 않고 **1차 zip의 성인 외모 통과 컷 5장을 섞었다**: 1차 03 05 19 23 24 -> v2 `31~35.jpg`로 복사(`refs.jsonl`에 source 기록). 1차 zip 24장 중 나머지는 어려 보이거나 앳된 컷이라 제외.

zip: `.data/photos/lora-refs/ihan-v2-refs.zip` = v2 통과 15(02 03 04 05 08 11 12 14 15 16 23 24 26 28 30) + 1차 5(31~35) = **20장**. 학습 대기: fal 충전 뒤 `lora-train --character ihan --zip .data/photos/lora-refs/ihan-v2-refs.zip` (검수자 최종 확인 권장: 15·16·04의 나이, 33의 같은 사람 여부).

비용: Gateway `bfl/flux-2-pro` 30장 도구 추정 $1.20(단가 미확인 $0.04/장 가정, 실제 청구는 Gateway 대시보드 확인).

## 은찬 참조 선별 (2026-11-14, LoRA 학습용)

참조 `.data/photos/candidates/eunchan/B-front.jpg`(메인 기본값: 중단발 웨이브·하트형). `lora-refs.ts --character eunchan --n 30 --lead "same person as the reference, 21-year-old adult Korean man, university-age, soft dreamy look but adult facial proportions, same wavy medium-length dark hair, no logos, plain background, face large in frame"`, `bfl/flux-2-pro`, 4:5, 각도 6·표정 7·조명 5·옷 4 변주. 출력 `.data/photos/lora-refs/eunchan/01~30.jpg`(실패·재호출 없음). 판정은 메인 지시에 따라 에이전트 1차(10장 시트 3장, 저해상도 대조, 검수자 확인 대기).

| 구분 | 번호 | 사유 |
|---|---|---|
| 통과 21장 | 01 02 03 04 05 09 10 11 15 16 17 18 19 20 22 23 25 26 27 28 29 | 같은 사람 인상, 성인 20~22, 큰 아티팩트 없음. 경계: 18(앳된 편), 28(극단 측면) |
| 제외 9장 | 06, 07 | 외모 18~19로 앳됨 |
| | 08, 13, 24, 30 | 다른 사람 인상(서구적 코·각진 얼굴·넓은 얼굴·곱슬 머리) |
| | 12, 14, 21 | 머리 길이·톤 이탈 또는 표정 과장·얼굴 변형 |

산출: `.data/photos/lora-refs/eunchan-refs.zip`(21장, 5.5MB). 비용: 30호출 x $0.04 가정 = $1.20(도구 추정, 실단가 Gateway 로그 확인 필요). 학습은 미실행.

## 얼굴 없는 컷 재생성 (flux-2-pro, 2026-11-14)

사용자 검수: klein으로 만든 face=false 컷이 사물 개수·크기 오류로 조잡함(바지 하나에 신발 3개, 쇼핑봉투 야채 크기, 회식 콜라잔 2개). `--no-lora` 경로 기본 모델을 `bfl/flux-2-pro`로 바꾸고 프롬프트에 사물 정합성 지시(개수·상대 크기·원근·중복 금지)를 넣었다. 단체·다인 컷(ihan-p034·p082, isol-p040)은 2~3명으로, 테이블 컷(ihan-p061, isol-p032)은 컵·소스 개수를 줄이는 힌트 덮어쓰기(`NOFACE_HINT_OVERRIDE`)로 단순화. 매니페스트 행은 `source:"ai"`·`model` 기록, 재생성 행의 이전 rejected 표시는 지움.

- 대상: ihan 58행 + isol 26행 = 84행(`--force`, 이전 rejected 5행 포함). 1차 84장 전수 확인(4장씩 묶음 시트).
- 1차 결과: 통과 77, 오류 7(재생성). 재생성 7장 중 6장 통과, 1장 폐기. **최종 통과 83, 폐기 1**(isol-p043 `rejected`, reason `artifact`).
- 대표 오류 유형: ① 양말 "짝" 요청인데 한 짝씩 3개만 나옴(isol-p043, 재생성도 동일 -> 폐기) ② 성별 불일치 몸(ihan-p041 여성 상체) ③ 휴대폰 화면의 판독 가능한 채팅 글자(ihan-p069) ④ 눈에 띄는 로고(isol-p044 후디, ihan-p094 바지·ihan-p033 신발 스우시) ⑤ 장터 가격표 글자(isol-p033, 숫자·한자 수준이라 통과).
- 통과 경계(허용): ihan-p034 거울 속 멀리 흐릿한 사람 1명, p060·isol-p032 하단에 얼굴 없는 사람 몸 일부, p082·isol-p040 실루엣이 남성 밴드처럼 보임(얼굴 식별 불가), 작은 로고(ihan-p090 가방, p094 신발, isol-p047 모자).
- 사물 개수 오류(신발 한 켤레 초과, 컵 수 불일치)는 1차 84장에서 재현되지 않음. 문제가 컸던 klein 대비 개선 확인.
- 비용: 84장 $3.36 + 재생성 7장 $0.28 = $3.64 (flux-2-pro $0.04/장 가정, 예산 $4 이내).


## LoRA v1/v2 비교·은찬 검증 (2026-11-14)

설정: 추론 `blackforestlabs/flux-3/klein/base/text-to-image/lora`, scale 1, 1024x1280, 상황 5종(mirror 연습실 거울 셀카·conv 편의점 야식·bed 숙소 침대·hall 회사 복도·walk 밤 산책) x seed 1101·2202 = 그룹당 10장. 이한 v1/v2는 프롬프트·seed 동일(트리거 "ihanx person" + 상황 + generate-photos와 같은 성인 단서 "21-year-old adult ... defined jawline, mature facial structure, university-age man"). 은찬은 트리거 "eunchanx person" + group.yaml look(thin pale build, long soft bangs, gentle tired eyes, oversized plain knit sweater). 일회성 스크립트로 실행(저장소 도구 수정 없음). 이미지 `.data/photos/consistency/lora-compare/{ihan-v1,ihan-v2,eunchan}/<상황>-<seed>.jpg`, 점수 `lora-compare/scores.json`.
채점: Gateway `anthropic/claude-haiku-5.5` 비전(참조: ihan `candidates/ihan/N-front.jpg`, eunchan `candidates/eunchan/B-front.jpg`). 모델 추정이라 사람 검수 대체 불가. "닮음 -"는 모델이 판정 거부/불가(null).

| 그룹 | 평균 나이 | 최소~최대 | 평균 닮음(유효 n) |
|---|---|---|---|
| ihan-v1 | 20.1 | 19~21 | 3.00 (10) |
| ihan-v2 | 20.2 | 19~21 | 2.75 (8) |
| eunchan | 20.4 | 19~22 | 3.50 (8) |

| 그룹 | 파일 | seed | 추정 나이 | 닮음(1~5) |
|---|---|---|---|---|
| ihan-v1 | `ihan-v1/bed-1101.jpg` | 1101 | 19 | 3 |
| ihan-v1 | `ihan-v1/bed-2202.jpg` | 2202 | 20 | 3 |
| ihan-v1 | `ihan-v1/conv-1101.jpg` | 1101 | 20 | 3 |
| ihan-v1 | `ihan-v1/conv-2202.jpg` | 2202 | 21 | 4 |
| ihan-v1 | `ihan-v1/hall-1101.jpg` | 1101 | 19 | 3 |
| ihan-v1 | `ihan-v1/hall-2202.jpg` | 2202 | 20 | 3 |
| ihan-v1 | `ihan-v1/mirror-1101.jpg` | 1101 | 20 | 3 |
| ihan-v1 | `ihan-v1/mirror-2202.jpg` | 2202 | 21 | 2 |
| ihan-v1 | `ihan-v1/walk-1101.jpg` | 1101 | 21 | 3 |
| ihan-v1 | `ihan-v1/walk-2202.jpg` | 2202 | 20 | 3 |
| ihan-v2 | `ihan-v2/bed-1101.jpg` | 1101 | 20 | 3 |
| ihan-v2 | `ihan-v2/bed-2202.jpg` | 2202 | 19 | 2 |
| ihan-v2 | `ihan-v2/conv-1101.jpg` | 1101 | 20 | 3 |
| ihan-v2 | `ihan-v2/conv-2202.jpg` | 2202 | 19 | - |
| ihan-v2 | `ihan-v2/hall-1101.jpg` | 1101 | 20 | 3 |
| ihan-v2 | `ihan-v2/hall-2202.jpg` | 2202 | 20 | 2 |
| ihan-v2 | `ihan-v2/mirror-1101.jpg` | 1101 | 21 | - |
| ihan-v2 | `ihan-v2/mirror-2202.jpg` | 2202 | 21 | 3 |
| ihan-v2 | `ihan-v2/walk-1101.jpg` | 1101 | 21 | 3 |
| ihan-v2 | `ihan-v2/walk-2202.jpg` | 2202 | 21 | 3 |
| eunchan | `eunchan/bed-1101.jpg` | 1101 | 20 | 3 |
| eunchan | `eunchan/bed-2202.jpg` | 2202 | 20 | 4 |
| eunchan | `eunchan/conv-1101.jpg` | 1101 | 20 | 3 |
| eunchan | `eunchan/conv-2202.jpg` | 2202 | 20 | 4 |
| eunchan | `eunchan/hall-1101.jpg` | 1101 | 21 | - |
| eunchan | `eunchan/hall-2202.jpg` | 2202 | 19 | 3 |
| eunchan | `eunchan/mirror-1101.jpg` | 1101 | 22 | - |
| eunchan | `eunchan/mirror-2202.jpg` | 2202 | 20 | 4 |
| eunchan | `eunchan/walk-1101.jpg` | 1101 | 21 | 4 |
| eunchan | `eunchan/walk-2202.jpg` | 2202 | 21 | 3 |

비용(fal, 1.31MP x $0.035 = $0.0459/장 x 30장): **$1.38**(Gateway haiku 채점 별도, 소액·미집계). 일시 fetch 실패 4건은 재호출로 채움(실패분 과금 여부 미확인).
판독: 이한 v1 vs v2 평균 추정 나이 차이는 모델 오차 안(0.1세)이라 모델 기준으로는 드리프트 개선이 확인되지 않는다. 사람 눈 검수 필요(저연령 컷 여부). 은찬은 닮음이 상대적으로 높고 나이 19~22로 성인 범위.

## 캔디드 스마트폰 문구 A/B(2026-11-14)
- 명령: `NODE_USE_ENV_PROXY=1 node --env-file=.env.local --import tsx src/tools/generate-photos.ts --character ihan --plan content/characters/ihan/photos/plan.jsonl --ids ihan-p049,ihan-p071,ihan-p020,ihan-p017 --style candid --out-dir .data/photos/consistency/candid-test/ihan-v2-candid --seed 1101` (ihan-v2 LoRA, 4장). 옵션 `--style candid|editorial`(기본 editorial), `--out-dir`(매니페스트 기록 생략), `--seed` 추가.
- 상황은 plan face=true 행에 mirror selfie·bed가 없어 근접 행으로 대체(p049 거울 앞, p071 편의점, p020 침대 방, p017 복도). 비교군 lora-compare/ihan-v2 *-1101은 임시 프롬프트라 상황·의상이 다름(엄밀한 동일 조건 비교 아님).
- 대조 시트: `.data/photos/consistency/candid-test/sheet.jpg` (위 candid, 아래 editorial 비교군). 비용 약 $0.28(첫 실행에 trigger 중복 "person person"이 있어 4장 재생성, 최종 문구는 수정본).
- 소견 ① 셀카 느낌: candid는 조명·배경이 평범해 일상 스냅에 가깝고(편의점·침대·복도) 화보 느낌이 줄었으나, p049는 거울 속 뒷모습/정면이 함께 나와 어색함. 비교군은 선명·연출감이 강함.
- 소견 ② 얼굴 일치: candid 4장은 서로 같은 인물로 보이나 비교군보다 얼굴이 더 둥글고 순한 인상. 판단 보류, 추가 seed 필요.
- 소견 ③ 나이 인상: candid는 십대 후반~20대 초로 약간 어려 보임(p071, p017). 비교군은 20대 초중반. 성인 단서는 유지했으나 어린 쪽 리스크 있음.
