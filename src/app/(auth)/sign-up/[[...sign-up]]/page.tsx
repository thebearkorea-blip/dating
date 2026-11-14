import { SignUp } from "@clerk/nextjs";
import { AppVoice } from "../../../_components/AppVoice";

export default function SignUpPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-4 px-6">
      <AppVoice screen="signup">Create your account to meet him.</AppVoice>
      <SignUp fallbackRedirectUrl="/onboarding" />
    </main>
  );
}
