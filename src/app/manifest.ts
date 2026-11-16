import type { MetadataRoute } from "next";
import { getStrings } from "@/product";

export default function manifest(): MetadataRoute.Manifest {
  const appName = getStrings()["app.name"];
  return {
    name: appName,
    short_name: appName,
    start_url: "/",
    display: "standalone",
    background_color: "#f6f3f8",
    theme_color: "#5b4bdb",
    icons: [
      { src: "/pwa-icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/maskable-512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
