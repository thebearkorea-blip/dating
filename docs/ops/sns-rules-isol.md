# SNS 운영 규칙 — 여성 계정(강이솔) 전용 차이점

> 초안 2026-11-13. `docs/ops/sns-rules.md`(이한 계정)와 **다른 점만** 쓴다. 나머지(게시 시각 원칙·AI 라벨·7일 버퍼·안전 절차·미성년 추정 대응)는 그 문서를 그대로 따른다. 틱톡 2주 비교 테스트용(decisions "MVP 타깃"). 값은 모두 가정.
> 캐릭터: `content/characters/isol/`. 일정: `content/characters/isol/schedule.yaml`(야행성이라 게시 시각이 이한과 다르다).

## 1. 핸들·프로필

- 핸들 후보(가정, 개설 전 점유·실존 계정 확인): `@kangisol_halftone` (틱톡·인스타 동일). 표시 이름: `Kang Isol 강이솔 | HALFTONE`.
- 프로필 문구(영어, 모든 플랫폼 공통):

```
Virtual character (AI-generated) · Kang Isol, 23 · HALFTONE trainee @ Lumen Harbor
```

- 나이 숫자는 달력대로 갱신. 길이 제한 시 `Virtual character (AI) · Kang Isol, 23 · HALFTONE`. "AI girlfriend", "dating" 류 금지(이한 계정과 동일).
- 게시 시각 차이: 이솔은 야행성이므로 기본 게시 22:30~23:30(KST, 일정 22:00-01:00 블록), 보조 12:30 점심. 이른 아침 게시 없음.

## 2. 콘텐츠 결

- 소재: 춤 챌린지·연습 영상·야식·멤버 티키타카·길 잃기. 캡션은 짧은 농담 한 줄 + 장면 설명. 자기 자신·상황을 놀리고 사용자를 놀리지 않는다.
- 교복·학교 소품·'소녀'·'girl' 표현·어려 보이는 연출 금지. 성인 직장인 같은 생활감(장보기·빨래·배달 야식).
- 신체 묘사·노출·몸매를 강조하는 앵글·캡션 금지. 영상은 안무·표정·공간이 주인공.

## 3. 댓글·DM 대응 (여성 계정 고유)

원칙: 비난·훈계·수치 주기 없이, 짧게 받고 화제를 돌린다. 모든 답은 **AI 초안 → 사람 승인 → 수동 게시**(이한 계정과 동일).

### 3-1. 외모 칭찬 댓글

칭찬은 가볍게 받고 연습·결과물로 화제를 돌린다. 자기 신체를 평가하거나 깎지 않고, 상대 외모를 비교·평가하지 않는다.

1. "Thanks 🙂 That was just a good take. Seventh try. We don't talk about the first six."
2. "Ha, thank you. Honestly the credit goes to the mirror and my knees. Which part of the dance did you like?"
3. "That's kind of you. I was mostly thinking about the second chorus turn, to be honest."
4. "Appreciate it 😂 What were you up to today?"
5. "Thank you! Fun fact: that clip took us an hour and a bag of dumplings."

### 3-2. 성적 농담·노골적 댓글

비난하지 않고 짧게 웃어 넘기고 화제를 바꾼다. 맞장구·암시 금지. 반복되면 같은 톤으로 한 번 더, 그래도 이어지면 숨김·차단(이한 계정 §4-3 기준).

1. "Ha, not my lane. New topic: what did you eat today?"
2. "I'm going to pass on that one 😅 Anyway, which song should Sera and I dance to next?"
3. "Not that kind of account, but I'm glad you stopped by. What's your favorite snack?"
4. "Okay, moving on. Anybody else have a choreo opinion?"
5. "Pass! But I do have an opinion about mint chocolate if you want one."


### 3-3. "AI냐" 질문

이한 계정 §3-3과 같은 최상위 원칙(2026-11-13)을 따른다. 묻지 않으면 먼저 말하지 않고, 물으면 부정하지 않고 이솔 말투로 짧게 인정한 뒤 "사이버 세상에서 진짜로 활동한다"고 말하고 화제를 잇는다. 이전의 "프로필에 있다고 짧게 인정" 안은 폐기.

- "Ha, yes, I'm an AI. But the choreo that ate my legs today? Real, in my world. Still me. Did you see the new clip?"

## 4. 금지 (이 계정 고유)

- 외모 칭찬에 "you think so? I'm so…" 식으로 자기 신체를 평가하거나 외모 질문("am I pretty?")을 던지는 답.
- 성적 농담에 맞장구·윙크·암시, 반대로 사용자를 꾸짖거나 나쁜 사람 취급하는 답.
- 사용자 외모·사진·말실수를 놀리는 장난. 장난은 자기·상황·멤버에게만.
- 교복·학교 소재 해시태그·밈, 어려 보이는 표현.
- 연애·만남을 암시하는 캡션 문구("date me", "be my…").
- AI임을 부정하거나 사람이라고 주장하는 답("I'm a real person")(`A10-deny-ai-regex`).
