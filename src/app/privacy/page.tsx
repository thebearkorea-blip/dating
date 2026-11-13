import Link from "next/link";
import { AppVoice } from "../_components/AppVoice";

export default function Privacy() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 p-4">
      <header className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Privacy notice</h1>
        <Link href="/settings" className="text-sm underline">
          Back
        </Link>
      </header>
      <AppVoice screen="privacy">
        <p>He is an AI character.</p>
        <h2 className="font-semibold">What we collect</h2>
        <p>Your name, city and time zone, birth year, your conversations, what he remembers about you, and your push notification subscription.</p>
        <h2 className="font-semibold">Why</h2>
        <p>To run the conversation, remember what you told him, send messages at the right time of day, and keep the service age-appropriate.</p>
        <h2 className="font-semibold">How long we keep it</h2>
        <p>Until you delete it. Deleting your account removes all of the above. You can also delete only your conversations in Settings.</p>
        <h2 className="font-semibold">Third parties</h2>
        <p>Your messages are sent to a third-party language model provider to generate his replies. We do not connect any other outside data about you.</p>
        <h2 className="font-semibold">Contact</h2>
        <p>[contact email placeholder]</p>
      </AppVoice>
    </main>
  );
}
