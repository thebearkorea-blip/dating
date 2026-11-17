import { SignOutButton } from "@clerk/nextjs";
import { getStrings } from "@/product";
import { AppVoice } from "../../_components/AppVoice";
import { deleteAccount } from "../../settings/actions";
import { ConfirmDelete } from "../../settings/ConfirmDelete";

export default function Preparing() {
  const str = getStrings();
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-4 px-6">
      <AppVoice screen="age">{str["onboarding.preparing"]}</AppVoice>
      <SignOutButton redirectUrl="/">
        <button type="button" className="btn">
          {str["settings.signOut"]}
        </button>
      </SignOutButton>
      <ConfirmDelete action={deleteAccount} label={str["settings.deleteAccount"]} confirmLabel={str["settings.deleteAccountConfirm"]} keepLabel={str["settings.keep"]} />
    </main>
  );
}
