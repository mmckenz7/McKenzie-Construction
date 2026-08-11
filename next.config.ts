import type { NextConfig } from "next";

const previewServerActionOrigins =
  process.env.CODEX_PREVIEW_SERVER_ACTION_ORIGIN === "localhost:3100"
    ? ["localhost:3100"]
    : [];
const localSandbox = process.env.MCKENZIE_LOCAL_SANDBOX === "1";

const nextConfig: NextConfig = {
  distDir: localSandbox ? ".next-sandbox" : ".next",
  experimental: {
    serverActions: {
      allowedOrigins: localSandbox
        ? [...previewServerActionOrigins, "localhost:3002"]
        : previewServerActionOrigins,
    },
  },
};

export default nextConfig;
