// @ts-ignore The production root intentionally does not install this isolated prototype package's build tooling.
import { defineConfig } from "vite";
// @ts-ignore The production root intentionally does not install this isolated prototype package's build tooling.
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./",
  test: {
    environment: "node",
  },
});
