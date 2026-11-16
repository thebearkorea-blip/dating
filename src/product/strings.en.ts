/** 영어(us) UI 문구. 키 목록의 기준 — strings.ja.ts는 같은 키를 모두 가져야 한다(타입으로 강제). `{name}` 같은 자리표시자는 fmt()로 채운다. */
export const en = {
  // 앱 이름(PWA 홈 화면 이름·manifest)
  "app.name": "ONDAY",
  // 캐릭터 DB 행이 없을 때(jp 콘텐츠 준비 전) 쓰는 이름
  "character.fallbackName": "Ihan",
  // 헤더
  "header.openProfile": "View {name}'s profile",
  "header.memories": "Memories",
  "header.settings": "Settings",
  "header.search": "Search",
  "header.back": "Back",
  // 입력창
  "composer.placeholder": "Message",
  "composer.label": "Message",
  "composer.send": "Send",
  "composer.replyingTo": "Replying to {name}",
  "composer.replyingToYourself": "Replying to yourself",
  "composer.cancelReply": "Cancel reply",
  "composer.photo": "Photo",
  // 전달·읽음·입력 중
  "status.delivered": "Delivered",
  "status.read": "Read {time}",
  "status.typingLabel": "{name} is typing",
  // 전송 실패
  "message.failed": "Not delivered · Tap to retry",
  "message.sending": "Sending",
  "message.retry": "Retry",
  // 목록
  "list.newMessage": "New message",
  "list.loadingEarlier": "Loading earlier messages",
  "list.liveRegionFrom": "{name}: {text}",
  "list.photoFrom": "Photo from {name}",
  "list.offline": "You're offline. Messages will send when you're back.",
  "list.empty": "{name} will say hi soon.",
  "list.emptyHint": "He'll message you first. Keep this tab or app handy.",
  // 날짜 구분선
  "date.today": "Today",
  "date.yesterday": "Yesterday",
  // 사진 뷰어
  "photo.alt": "Photo from {name}",
  "photo.close": "Close",
  "photo.reply": "Reply",
  // 프로필(/him)
  "him.title": "Profile",
  "him.aiTag": "AI character",
  "him.photos": "Photos from {name}",
  "him.noPhotos": "No photos yet.",
  "him.debutIn": "Debut in {days} days",
  "him.debutTomorrow": "Debut tomorrow",
  "him.debutToday": "Debut day",
  "him.today": "Today",
  "him.group": "Group",
  "him.position": "Position",
  "him.age": "Age",
  // 말풍선 메뉴·반응
  "menu.messageActions": "Message actions",
  "menu.react": "React",
  "menu.reply": "Reply",
  "menu.copy": "Copy",
  "menu.close": "Close menu",
  "menu.copied": "Copied",
  "reaction.menuLabel": "Reactions",
  "reaction.add": "React with {emoji}",
  "reaction.remove": "Remove your {emoji} reaction",
  "reaction.yours": "You reacted {emoji}",
  "reaction.his": "{name} reacted {emoji}",
  // 인용
  "quote.jump": "Go to original message",
  "quote.photo": "Photo",
  "quote.you": "You",
  // 검색
  "search.placeholder": "Search messages",
  "search.label": "Search messages",
  "search.noResults": "No messages found",
  "search.searching": "Searching",
  "search.error": "Search failed. Please try again.",
  // 설치 안내
  "install.hint": "Add to Home Screen to get his messages",
  "install.steps": "Tap Share, then Add to Home Screen.",
  "install.dismiss": "Dismiss",
  // 일반 오류
  "error.generic": "Something went wrong. Please try again.",
} as const;

export type StringKey = keyof typeof en;
export type Strings = Record<StringKey, string>;
