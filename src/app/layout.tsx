import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { getLang, getProduct, getStrings } from "@/product";
import "./globals.css";

export const metadata: Metadata = {
  title: "ONDAY",
  description: "He is here.",
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
