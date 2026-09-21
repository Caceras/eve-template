import { ImageResponse } from "next/og";
import { AegenticaImageMark } from "./_components/aegentica-image-mark";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        alignItems: "center",
        background: "#050505",
        display: "flex",
        height: "100%",
        justifyContent: "center",
        width: "100%",
      }}
    >
      <div style={{ alignItems: "center", display: "flex", flexDirection: "column", gap: 28 }}>
        <AegenticaImageMark size={310} />
        <div style={{ color: "white", fontSize: 54, fontWeight: 600, letterSpacing: "-0.04em" }}>
          Ægentica
        </div>
      </div>
    </div>,
    size,
  );
}
