import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { V5App } from "./V5App";
import { loadDeckDesignV5 } from "./storageV5";
import { resolveV5Startup } from "./startupV5";
import "./styles.css";

const startup = resolveV5Startup(loadDeckDesignV5(localStorage));

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <V5App initialDesign={startup.design} initialMessage={startup.message} />
  </StrictMode>,
);
