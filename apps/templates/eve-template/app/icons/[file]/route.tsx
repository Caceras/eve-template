import { ImageResponse } from "next/og";
import { AegenticaImageMark } from "@/app/_components/aegentica-image-mark";

// PNG app icons for the manifest and notifications, rendered from the Æ mark.
// Maskable icons keep the mark inside the central 80% safe zone.
const ICONS = {
  "icon-192.png": { size: 192, mark: 0.7, round: true },
  "icon-512.png": { size: 512, mark: 0.7, round: true },
  "maskable-512.png": { size: 512, mark: 0.5, round: false },
  "badge-96.png": { size: 96, mark: 1, round: false, badge: true },
} as const;

export function generateStaticParams() {
  return Object.keys(ICONS).map((file) => ({ file }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const icon = ICONS[file as keyof typeof ICONS];
  if (!icon) return new Response("Not found", { status: 404 });
  const badge = "badge" in icon;
  const response = new ImageResponse(
    <div
      style={{
        alignItems: "center",
        // Notification badges must be a white silhouette on transparency.
        background: badge ? "transparent" : "#050505",
        borderRadius: icon.round ? icon.size * 0.22 : 0,
        display: "flex",
        height: "100%",
        justifyContent: "center",
        width: "100%",
      }}
    >
      <AegenticaImageMark size={Math.round(icon.size * icon.mark)} />
    </div>,
    { width: icon.size, height: icon.size },
  );
  response.headers.set("Cache-Control", "public, max-age=604800, immutable");
  return response;
}
