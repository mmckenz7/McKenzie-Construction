import type { Metadata } from "next";

import FenceDesignerApp from "../../../../prototypes/fence-designer/src/App";
import "../../../../prototypes/fence-designer/src/styles.css";

export const metadata: Metadata = {
  title: "Fence Visual Measure",
  description: "Internal plan-view fence measurement workspace.",
  robots: { index: false, follow: false },
};

export default function FenceDesignerPage() {
  return <FenceDesignerApp />;
}
