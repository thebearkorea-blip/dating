import { ImageResponse } from "next/og";

// 서비스 로고(그의 얼굴 아님): 보라 그라데이션 위 이니셜. 로고 확정 시 교체. TODO: 이니셜은 src/product에서 가져온다.
// maskable은 안전영역(중앙 80%)에 맞춰 글자를 작게 그리고 배경을 가득 채운다.
export function renderIcon(size: number, maskable: boolean) {
  const fontSize = Math.round(size * (maskable ? 0.4 : 0.56));
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #8b7cf0 0%, #5b4bdb 100%)",
          color: "#ffffff",
          fontSize,
          fontWeight: 700,
        }}
      >
        O
      </div>
    ),
    { width: size, height: size },
  );
}
