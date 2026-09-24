import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { Application } from "src/Application";
import { startBoutique } from "src/utils/startBoutique";
import "src/styles.css";

const root = document.getElementById("root");

if (root === null) {
  throw new Error("The page has no #root element.");
}

const runtime = startBoutique({ latency: 400 });

createRoot(root).render(
  <StrictMode>
    <Application runtime={runtime} />
  </StrictMode>,
);
