// 사용법: node --import tsx src/tools/vapid.ts
// VAPID 키 한 쌍을 만들어 .env.local에 붙여 넣을 줄로 출력한다. 파일·로그에는 쓰지 않는다. 키를 커밋하지 않는다.
import { generateVapidKeys } from "../jobs/push.js";

const { publicKey, privateKey } = generateVapidKeys();
console.log("# 아래 3줄을 .env.local에 붙여 넣는다(VAPID_SUBJECT는 본인 메일로 바꾼다)");
console.log(`VAPID_PUBLIC_KEY=${publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${privateKey}`);
console.log("VAPID_SUBJECT=mailto:you@example.com");
