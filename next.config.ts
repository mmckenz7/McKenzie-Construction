import type { NextConfig } from "next";

const codespaceOrigin =
  "supreme-lamp-p7gj7p4jvx7p374w-3000.app.github.dev";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    codespaceOrigin,
    "*.app.github.dev",
  ],

  experimental: {
    serverActions: {
      allowedOrigins: [
        "localhost:3000",
        codespaceOrigin,
        "*.app.github.dev",
      ],
    },
  },
};

export default nextConfig;
