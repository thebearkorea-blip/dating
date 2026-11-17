import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { characterName } from "@/engine/character-profile";
import { fmt, getLang, getProduct, getStrings } from "@/product";
import "./globals.css";

const description = fmt(getStrings()["meta.description"], { name: characterName(null) });

export const metadata: Metadata = {
  title: getStrings()["app.name"],
  description,
  openGraph: { title: getStrings()["app.name"], description, type: "website" },
  twitter: { card: "summary_large_image", title: getStrings()["app.name"], description },
  appleWebApp: { capable: true, title: getStrings()["app.name"], statusBarStyle: "default" },
};

export const viewport: Viewport = { themeColor: "#5b4bdb", viewportFit: "cover", interactiveWidget: "resizes-content" };

export default function RootLayout({ children }: { children: ReactNode }) {
  const product = getProduct();
  return (
    <html lang={getLang(product)} data-product={product}>
      <body className="min-h-dvh antialiased">
        <ClerkProvider>{children}</ClerkProvider>
      </body>
    </html>
  );
}
