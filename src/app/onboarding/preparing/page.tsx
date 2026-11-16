import { getStrings } from "@/product";
import { AppVoice } from "../../_components/AppVoice";

export default function Preparing() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6">
      <AppVoice screen="age">{getStrings()["onboarding.preparing"]}</AppVoice>
    </main>
  );
}
