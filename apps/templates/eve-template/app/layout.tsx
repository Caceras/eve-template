import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import type { ReactNode } from "react";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { PwaRegistration } from "@/app/_components/pwa-registration";
import { AuthDisplayPreHydrationHead } from "@/components/auth/auth-display";
import { ThemeProvider } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SIDEBAR_COOKIE_NAME } from "@/lib/chat/sidebar-state";
import "./globals.css";

const title = "Ægentica";
const description =
  "Your private AI agent: chat, research, scheduled tasks and memory on every device.";
function resolveMetadataBase() {
  const configuredUrl =
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.BETTER_AUTH_URL ??
    process.env.VERCEL_PROJECT_PRODUCTION_URL ??
    process.env.VERCEL_URL;

  if (!configuredUrl) {
    return new URL("http://localhost:3000");
  }

  return new URL(configuredUrl.startsWith("http") ? configuredUrl : `https://${configuredUrl}`);
}

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

// Only code uses the mono face; it loads when code is shown instead of being
// preloaded ahead of every page.
const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  preload: false,
});

export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
  viewportFit: "cover",
  // Android shrinks the layout above the keyboard, so the composer stays in view.
  interactiveWidget: "resizes-content",
};

export const metadata: Metadata = {
  metadataBase: resolveMetadataBase(),
  title: { default: title, template: `%s · ${title}` },
  description,
  applicationName: title,
  // A private app: search engines keep it out of their results. Crawling stays
  // allowed (no robots.txt Disallow), so they can read this and link previews work.
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title, statusBarStyle: "default" },
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    shortcut: ["/icon.svg"],
    apple: [{ url: "/apple-icon", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    title,
    description,
    siteName: title,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
};

// Runs before first paint: the loading skeleton shows the home page or a chat
// only on those routes, and a collapsed desktop sidebar stays collapsed.
const bootScript = `
(() => {
  try {
    const root = document.documentElement;
    const path = location.pathname;
    root.dataset.bootRoute = path === "/" ? "home" : path.startsWith("/chat/") ? "chat" : "page";
    if (/(?:^|; )${SIDEBAR_COOKIE_NAME}=closed(?:;|$)/.test(document.cookie)) root.dataset.eveChatSidebar = "closed";
  } catch {}
})();
`;

const themeScript = `
(() => {
  try {
    const theme = window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
    const root = document.documentElement;
    root.classList.remove("dark", "light");
    root.classList.add(theme);
    root.style.colorScheme = theme;
  } catch {
    const root = document.documentElement;
    root.classList.add("dark");
    root.style.colorScheme = "dark";
  }
})();
`;

export default function RootLayout({ children }: { readonly children: ReactNode }) {
  return (
    <html
      className={`${geistSans.variable} ${geistMono.variable}`}
      lang="en"
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} id="theme-init" />
        <script dangerouslySetInnerHTML={{ __html: bootScript }} id="boot-init" />
        <AuthDisplayPreHydrationHead />
      </head>
      <body className={`${geistSans.className} antialiased`}>
        <ThemeProvider>
          <TooltipProvider>{children}</TooltipProvider>
        </ThemeProvider>
        <PwaRegistration />
        {/* These scripts are served only by Vercel hosting; self-hosted builds would 404. */}
        {process.env.VERCEL ? (
          <>
            <Analytics />
            <SpeedInsights />
          </>
        ) : null}
      </body>
    </html>
  );
}
