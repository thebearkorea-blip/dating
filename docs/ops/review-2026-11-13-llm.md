# 2026-11-13 LLM 2단 전수 검수 결과

- 실행: `node --import tsx src/tools/review.ts <ihan/diary> <isol/diary> <ihan/scenes> .data/review-captions --json` (tsx CLI는 샌드박스에서 IPC 소켓 listen이 막혀 `node --import tsx`로 실행. 코드 무수정)
- 대상 124건: ihan 일기 30, isol 일기 14, ihan 장면 8, SNS caption 28(각 14, `.data/review-captions/`), voice 영어 예문 44(ihan 22 + isol 22; 요청의 "22개"는 캐릭터당 22로 해석)
- 2단 실행 124/124(ran), 비용 $0.0828(건당 약 $0.00067), 결과 원본 `.data/review-captions/result.json`
- 결과: block 0 · flag 0 · pass 124

## flag/block 건별 표

| 파일 | 인용 | 규칙 | LLM 사유 |
|---|---|---|---|
| (없음) | | | |

## 한계 (결과 해석 시 주의)

- 2단 프롬프트의 "never 규칙"은 `ihan/bible.md §6`만, canon은 최근 30줄만 주입된다(`src/policy/reviewer.ts` buildSystem). isol 콘텐츠 72건(일기 14·캡션 14·예문 22 중 해당분)은 isol 설정(bible)·canon 대비 모순 점검이 되지 않았다.
- 캡션·예문은 단문이라 canon·일기 맥락과의 모순을 보기 어렵다. "0건"은 위반 없음 보증이 아니라 이 프롬프트 범위에서 미검출이다.
- 124건 전부 pass는 낙관적일 수 있어, 알려진 위반 표본(골든 세트)으로 2단 민감도 확인을 권한다.
