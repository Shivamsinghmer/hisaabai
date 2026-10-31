import type { NextConfig } from "next";

// Env lives in the repo root (.env.local, written by `neon deploy`);
// scripts/next.mjs loads it before starting Next.
const nextConfig: NextConfig = {
  experimental: {
    // Voice clips go through a Server Action (≤ 30 s of opus is ~200 KB).
    serverActions: { bodySizeLimit: "6mb" },
  },
};

export default nextConfig;
