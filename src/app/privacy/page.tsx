import Link from "next/link";
import { getStrings } from "@/product";
import { AppVoice } from "../_components/AppVoice";

export default function Privacy() {
  const str = getStrings();
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 p-4">
      <header className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">{str["privacy.title"]}</h1>
        <Link href="/settings" className="text-sm underline">
          {str["header.back"]}
        </Link>
      </header>
      <AppVoice screen="privacy">
        <p>{str["ai.notice"]}</p>
        <h2 className="font-semibold">{str["privacy.collectTitle"]}</h2>
        <p>{str["privacy.collect"]}</p>
        <h2 className="font-semibold">{str["privacy.whyTitle"]}</h2>
        <p>{str["privacy.why"]}</p>
        <h2 className="font-semibold">{str["privacy.keepTitle"]}</h2>
        <p>{str["privacy.keep"]}</p>
        <h2 className="font-semibold">{str["privacy.thirdTitle"]}</h2>
        <p>{str["privacy.third"]}</p>
        <h2 className="font-semibold">{str["privacy.contactTitle"]}</h2>
        <p>{str["privacy.contact"]}</p>
      </AppVoice>
    </main>
  );
}
