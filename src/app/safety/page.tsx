import Link from "next/link";
import { getStrings } from "@/product";
import { AppVoice } from "../_components/AppVoice";

export default function Safety() {
  const str = getStrings();
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 p-4">
      <header className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">{str["safety.title"]}</h1>
        <Link href="/settings" className="text-sm underline">
          {str["header.back"]}
        </Link>
      </header>
      <AppVoice screen="safety">
        <p>{str["safety.intro"]}</p>
        <ul className="list-disc pl-5">
          <li>{str["safety.line1"]}</li>
          <li>{str["safety.line2"]}</li>
          <li>{str["safety.line3"]}</li>
        </ul>
        <p>{str["safety.aiLine"]}</p>
      </AppVoice>
    </main>
  );
}
