import { getStrings } from "@/product";
import { AppVoice } from "../_components/AppVoice";

export default function GeoBlock() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6">
      <AppVoice screen="geo_block">{getStrings()["geo.blocked"]}</AppVoice>
    </main>
  );
}
