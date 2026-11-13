import { notFound, redirect } from "next/navigation";
import { devLogin } from "@/auth/index";
import { devOnlyEnabled } from "@/dev-only";
import { AppVoice } from "../../_components/AppVoice";
import { DevBanner } from "../../_components/DevBanner";

async function login(formData: FormData) {
  "use server";
  await devLogin(String(formData.get("displayName") ?? ""), { beta: formData.get("beta") === "on", admin: formData.get("admin") === "on" });
  redirect("/onboarding");
}

export default function DevLogin() {
  if (!devOnlyEnabled()) notFound();
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-4 px-6">
      <AppVoice screen="dev_banner">개발 전용 로그인입니다. 출시 빌드에서는 Clerk로 교체됩니다.</AppVoice>
      <DevBanner />
      <form action={login} className="flex flex-col gap-3">
        <label htmlFor="displayName">이름</label>
        <input id="displayName" name="displayName" required maxLength={40} className="field" />
        <label className="flex items-center gap-2">
          <input type="checkbox" name="beta" /> beta
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="admin" /> admin
        </label>
        <button type="submit" className="btn">
          계속
        </button>
      </form>
    </main>
  );
}
