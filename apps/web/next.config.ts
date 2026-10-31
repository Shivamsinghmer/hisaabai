import type { NextConfig } from "next";

// Env lives in the repo root (.env.local, written by `neon deploy`);
// scripts/next.mjs loads it before starting Next.
const API_URL = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const nextConfig: NextConfig = {
  experimental: {
    // Voice clips go through a Server Action (≤ 30 s of opus is ~200 KB).
    serverActions: { bodySizeLimit: "6mb" },
  },
  // Spoken replies are served by the API; proxy them so the browser only ever
  // talks to this origin (one tunnel for the phone demo).
  async rewrites() {
    return [{ source: "/media/:path*", destination: `${API_URL}/media/:path*` }];
  },
};

export default nextConfig;
