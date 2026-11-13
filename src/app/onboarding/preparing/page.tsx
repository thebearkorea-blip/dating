import { AppVoice } from "../../_components/AppVoice";

export default function Preparing() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6">
      <AppVoice screen="age">이 연령을 위한 모드는 준비 중이에요. 준비되면 알려 드릴게요.</AppVoice>
    </main>
  );
}
