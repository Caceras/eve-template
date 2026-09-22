import type { NextConfig } from "next";
import { withEve } from "eve/next";

const nextConfig: NextConfig = {
  cacheComponents: true,
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
