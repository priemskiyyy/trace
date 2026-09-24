import { render } from "solid-js/web";

import { Application } from "src/Application";
import { startBoutique } from "src/utils/startBoutique";
import "src/styles.css";

const root = document.getElementById("root");

if (root === null) {
  throw new Error("The page has no #root element.");
}

const runtime = startBoutique({ latency: 400 });
const dispose = render(() => <Application runtime={runtime} />, root);

const disposeHost = () => {
  window.removeEventListener("pagehide", disposeHost);
  dispose();
  runtime.dispose();
};

window.addEventListener("pagehide", disposeHost, { once: true });
import.meta.hot?.dispose(disposeHost);
