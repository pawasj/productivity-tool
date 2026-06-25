import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root to this project so Next.js does not pick up
  // the stray lockfile in the parent (C:\wamp64\www) directory.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
