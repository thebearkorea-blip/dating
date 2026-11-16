// 반응 이모지 허용 목록(순수, 클라이언트·서버 공용). 서버는 이 목록 밖의 값을 저장하지 않는다.

/** 사용자가 그의 메시지에 달 수 있는 6종. 순서 = 메뉴 순서. */
export const USER_REACTIONS = ["❤️", "😂", "😮", "😢", "👍", "🥺"] as const;
export type UserReaction = (typeof USER_REACTIONS)[number];

/** 그가 내 메시지에 다는 반응: 6종 + 👀(읽었지만 바로 답 못 할 때). */
export const BUSY_REACTION = "👀";
export const CHAR_REACTIONS = [...USER_REACTIONS, BUSY_REACTION] as const;

export const isUserReaction = (e: unknown): e is UserReaction => typeof e === "string" && (USER_REACTIONS as readonly string[]).includes(e);
export const isCharReaction = (e: unknown): e is (typeof CHAR_REACTIONS)[number] => typeof e === "string" && (CHAR_REACTIONS as readonly string[]).includes(e);
