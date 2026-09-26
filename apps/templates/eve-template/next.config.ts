import type { NextConfig } from "next";
import { withEve } from "eve/next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  experimental: {
    serverActions: {
      // A saved turn carries its attachments (up to 6 MB of files, sent as data
      // URLs); the 1 MB default would silently stop such a chat from saving.
      bodySizeLimit: "16mb",
    },
  },
  poweredByHeader: false,
  async headers() {
    return [
      {
        // Baseline hardening for every response: no framing by other sites
        // (clickjacking), HTTPS only, no MIME sniffing, a quiet referrer, and
        // only the device features the app uses (the microphone for dictation).
        // Images load only from the app itself, data: and blob: (attachments),
        // plus the Sign in with Vercel avatar, so text a model was tricked into
        // writing cannot send data out through an image URL.
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value:
              "frame-ancestors 'self'; base-uri 'self'; object-src 'none'; form-action 'self'; img-src 'self' data: blob: https://api.vercel.com/www/avatar/",
          },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Strict-Transport-Security", value: "max-age=31536000" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), geolocation=(), payment=(), usb=(), microphone=(self)",
          },
        ],
      },
      {
        // The service worker must always be revalidated so fixes reach installed apps.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
  turbopack: {
    root: process.cwd(),
  },
};

export default withEve(nextConfig);
