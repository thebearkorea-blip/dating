"use server";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/auth/index";
import { getDb } from "@/db/client";
import { submitSupportRequest } from "@/engine/support";

/** 문의 양식. 로그인 필요. 결과는 쿼리(?sent=1 / ?error=1)로 돌려 같은 화면에 안내한다. */
export async function sendSupportRequest(formData: FormData): Promise<void> {
  let result: "ok" | "invalid" | "failed" = "failed";
  try {
    const user = await getCurrentUser();
    if (user) result = await submitSupportRequest(getDb(), user.id, formData.get("category"), formData.get("message"));
  } catch {
    result = "failed";
  }
  redirect(result === "ok" ? "/support?sent=1" : "/support?error=1");
}
