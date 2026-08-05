import type { NextConfig } from "next";

const codespaceOrigin =
  "supreme-lamp-p7gj7p4jvx7p374w-3100.app.github.dev";

const previewServerActionOrigins =
  process.env.CODEX_PREVIEW_SERVER_ACTION_ORIGIN === "localhost:3100"
    ? ["localhost:3100"]
    : [];

const nextConfig: NextConfig = {
  allowedDevOrigins: [codespaceOrigin],

  experimental: {
    serverActions: {
      allowedOrigins: previewServerActionOrigins,
    },
  },
};

export default nextConfig;
