import { ImageResponse } from "next/og";
import type { ReactNode } from "react";
import { AegenticaImageMark } from "@/app/_components/aegentica-image-mark";

// Lucide glyphs (24×24, stroked) matching the sidebar, for the app shortcuts
// a long-press on the home-screen icon shows.
const GLYPHS = {
  chat: [
    "M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z",
    "M12 8v6",
    "M9 11h6",
  ],
  agents: [
    "M12 8V4H8",
    "M6 8h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2z",
    "M2 14h2",
    "M20 14h2",
    "M15 13v2",
    "M9 13v2",
  ],
  tasks: [
    "M16 14v2.2l1.6 1",
    "M16 2v3",
    "M21 7.338V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2h2.338",
    "M3 9h5.859",
    "M8 2v3",
    "M10 16a6 6 0 1 0 12 0a6 6 0 1 0-12 0",
  ],
  settings: [
    "M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915",
    "M9 12a3 3 0 1 0 6 0a3 3 0 1 0-6 0",
  ],
} as const;

type Icon = {
  size: number;
  /** Share of the canvas the glyph or mark fills. */
  mark: number;
  round: boolean;
  /** White on transparency: notification badges and Android's themed icons. */
  silhouette?: boolean;
  glyph?: keyof typeof GLYPHS;
};

// Maskable and themed icons keep their content inside the central 80% safe
// zone; launchers crop the rest to their own shape.
const ICONS: Record<string, Icon> = {
  "icon-192.png": { size: 192, mark: 0.7, round: true },
  "icon-512.png": { size: 512, mark: 0.7, round: true },
  "maskable-512.png": { size: 512, mark: 0.5, round: false },
  "monochrome-512.png": { size: 512, mark: 0.5, round: false, silhouette: true },
  "badge-96.png": { size: 96, mark: 1, round: false, silhouette: true },
  ...Object.fromEntries(
    Object.keys(GLYPHS).map((glyph) => [
      `shortcut-${glyph}.png`,
      { size: 192, mark: 0.42, round: false, glyph: glyph as keyof typeof GLYPHS },
    ]),
  ),
};

export function generateStaticParams() {
  return Object.keys(ICONS).map((file) => ({ file }));
}

function Glyph({ name, size }: { readonly name: keyof typeof GLYPHS; readonly size: number }) {
  return (
    <svg
      fill="none"
      height={size}
      stroke="white"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.75}
      viewBox="0 0 24 24"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
    >
      {GLYPHS[name].map((d) => (
        <path d={d} key={d} />
      ))}
    </svg>
  );
}

export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const icon = ICONS[file];
  if (!icon) return new Response("Not found", { status: 404 });
  const content: ReactNode = icon.glyph ? (
    <Glyph name={icon.glyph} size={Math.round(icon.size * icon.mark)} />
  ) : (
    <AegenticaImageMark size={Math.round(icon.size * icon.mark)} />
  );
  const response = new ImageResponse(
    <div
      style={{
        alignItems: "center",
        background: icon.silhouette ? "transparent" : "#050505",
        borderRadius: icon.round ? icon.size * 0.22 : 0,
        display: "flex",
        height: "100%",
        justifyContent: "center",
        width: "100%",
      }}
    >
      {content}
    </div>,
    { width: icon.size, height: icon.size },
  );
  response.headers.set("Cache-Control", "public, max-age=604800, immutable");
  return response;
}
