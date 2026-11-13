// 사용법: node --import tsx src/tools/invite-token.ts --platform tiktok --handle @x --dm "..."
// 토큰 링크(/i/<token>)용 platform_identities 행을 선생성하고 토큰을 출력한다.
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { closeDb, getDb, type Db } from "../db/client";
import { platformIdentities } from "../db/schema/index";

export function newToken(): string {
  return randomBytes(12).toString("base64url");
}

export interface InviteInput {
  platform: string;
  handle: string;
  dm?: string;
}

export async function createInvite(db: Db, input: InviteInput): Promise<string> {
  const token = newToken();
  await db.insert(platformIdentities).values({
    token,
    platform: input.platform,
    handle: input.handle,
    seedMemory: input.dm ?? null,
  });
  return token;
}

if (import.meta.url === `file://${resolve(process.argv[1] ?? "")}`) {
  const { values } = parseArgs({
    options: { platform: { type: "string" }, handle: { type: "string" }, dm: { type: "string" } },
  });
  if (!values.platform || !values.handle) {
    console.error('usage: invite-token.ts --platform tiktok --handle @x --dm "..."');
    process.exit(2);
  }
  const token = await createInvite(getDb(), { platform: values.platform, handle: values.handle, dm: values.dm });
  console.log(token);
  console.log(`/i/${token}`);
  await closeDb();
}
