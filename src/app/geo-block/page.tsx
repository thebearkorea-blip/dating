import { AppVoice } from "../_components/AppVoice";

export default function GeoBlock() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6">
      <AppVoice screen="geo_block">아직 이 지역에서는 이용할 수 없어요.</AppVoice>
    </main>
  );
}
