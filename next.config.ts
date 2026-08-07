import type { NextConfig } from "next";

const previewServerActionOrigins =
  process.env.CODEX_PREVIEW_SERVER_ACTION_ORIGIN === "localhost:3100"
    ? ["localhost:3100"]
    : [];

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins: previewServerActionOrigins,
    },
  },
};

export default nextConfig;
