// @ts-ignore The production root intentionally does not install this isolated prototype package's build tooling.
import { defineConfig } from "vite";
// @ts-ignore The production root intentionally does not install this isolated prototype package's build tooling.
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./",
  build: {
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (["LandingConnectionsEditor", "LevelCutoutControls", "HouseConnectionEditor", "RailingStageControls", "FinishStageControls", "PhotoIntakeDialog", "platformCommandsV3", "levelConnectionAlignmentV3", "connectedStairAssemblyV3"].some((name) => id.includes(`/${name}.`))) return "designer-controls";
        },
      },
    },
  },
  test: {
    environment: "node",
  },
});
