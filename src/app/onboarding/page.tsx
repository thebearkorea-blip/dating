import { redirect } from "next/navigation";
import { getCurrentUser } from "@/auth/index";
import { AppVoice } from "../_components/AppVoice";
import { completeOnboarding } from "./actions";
import { CITIES } from "./cities";
import { TimezoneField } from "./TimezoneField";

const ERRORS: Record<string, string> = {
  invalid: "모든 칸을 채우고 동의에 체크해 주세요.",
  underage: "죄송하지만 이용할 수 없는 연령이에요.",
  no_content: "개발 환경에 캐릭터 데이터가 없어요. load-content를 먼저 실행하세요.",
};

export default async function Onboarding({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/dev-login");
  const { error } = await searchParams;
  const year = new Date().getFullYear();

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-4 px-6 py-8">
      {error && ERRORS[error] ? <AppVoice screen="signup">{ERRORS[error]}</AppVoice> : null}
      <form action={completeOnboarding} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          <span>What should he call you?</span>
          <input name="displayName" defaultValue={user.displayName} required maxLength={40} className="field" />
        </label>
        <label className="flex flex-col gap-1">
          <span>City</span>
          <select name="city" required defaultValue="seoul" className="field">
            {CITIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <TimezoneField />
        <label className="flex flex-col gap-1">
          <span>Birth year</span>
          <input name="birthYear" type="number" required min={year - 100} max={year} className="field" />
        </label>
        <AppVoice screen="ai_notice">그는 AI 캐릭터예요. 실제 사람이 아니며, 이야기는 모두 지어낸 것입니다.</AppVoice>
        <label className="flex items-start gap-2">
          <input type="checkbox" name="aiNotice" required />
          <span>He is an AI character, and I understand that.</span>
        </label>
        <button type="submit" className="btn">
          Continue
        </button>
      </form>
    </main>
  );
}
