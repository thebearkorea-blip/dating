import { ImageResponse } from "next/og";
import { characterName } from "@/engine/character-profile";
import { fmt, getStrings } from "@/product";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "ONDAY";

export default function OpengraphImage() {
  const str = getStrings();
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 24,
          background: "linear-gradient(135deg, #8b7cf0 0%, #5b4bdb 100%)",
          color: "#ffffff",
        }}
      >
        <div style={{ fontSize: 120, fontWeight: 700 }}>{str["app.name"]}</div>
        <div style={{ fontSize: 40, maxWidth: 900, textAlign: "center" }}>{fmt(str["land.intro"], { name: characterName(null) })}</div>
      </div>
    ),
    size,
  );
}
