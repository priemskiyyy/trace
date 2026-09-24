import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { startBoutique } from "example-shared/boutique/reporting/startBoutique";
import { Application } from "src/Application";
import "src/styles.css";

const root = document.getElementById("root");

if (root === null) {
  throw new Error("The page has no #root element.");
}

const { backend, providers, runtime } = startBoutique({ latency: 400 });

runtime.track(
  runtime.trace.track("Storefront Opened"),
  "Open the storefront",
  null,
);

createRoot(root).render(
  <StrictMode>
    <Application backend={backend} providers={providers} runtime={runtime} />
  </StrictMode>,
);
