import type { NextConfig } from "next";
import { withEve } from "eve/next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  async headers() {
    return [
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
  async rewrites() {
    return [
      {
        source: "/.well-known/workflow/:path*",
        destination: "http://127.0.0.1:4274/.well-known/workflow/:path*",
      },
    ];
  },
  turbopack: {
    root: process.cwd(),
  },
};

export default withEve(nextConfig);
