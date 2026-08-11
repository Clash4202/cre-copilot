import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Matches MAX_FILE_BYTES in src/app/vault/actions.ts — Next's own default (1MB)
      // is well below what the app already validates and accepts.
      bodySizeLimit: "50mb",
    },
  },
};

export default nextConfig;
