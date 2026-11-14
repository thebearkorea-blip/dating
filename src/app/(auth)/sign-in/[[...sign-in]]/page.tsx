import { SignIn } from "@clerk/nextjs";
import { AppVoice } from "../../../_components/AppVoice";

export default function SignInPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-4 px-6">
      <AppVoice screen="signup">Sign in to continue.</AppVoice>
      <SignIn fallbackRedirectUrl="/chat" />
    </main>
  );
}
