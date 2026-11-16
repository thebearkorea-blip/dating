import { devOnlyEnabled } from "@/dev-only";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/auth/index";
import { chatFormat, getProduct, getStrings, safeTz } from "@/product";
import { SearchClient } from "./SearchClient";

export const dynamic = "force-dynamic";

export default async function ChatSearch() {
  const product = getProduct();
  const str = getStrings(product);
  const user = await getCurrentUser();
  if (!user) redirect(devOnlyEnabled() ? "/dev-login" : "/sign-in");
  const f = chatFormat(product);
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-3 p-4">
      <header className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">{str["header.search"]}</h1>
        <Link href="/chat" className="text-sm underline">
          {str["header.back"]}
        </Link>
      </header>
      <SearchClient
        tz={safeTz(user.tz)}
        locale={f.locale}
        dayOptions={{ year: "numeric", month: "short", day: "numeric" }}
        timeOptions={f.timeOptions}
        strings={{ placeholder: str["search.placeholder"], label: str["search.label"], noResults: str["search.noResults"], searching: str["search.searching"], error: str["search.error"] }}
      />
    </main>
  );
}
