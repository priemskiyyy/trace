import { mount, unmount } from "svelte";

import { startBoutique } from "example-shared/boutique/reporting/startBoutique";
import Application from "src/Application.svelte";
import "src/styles.css";

const target = document.getElementById("root");

if (target === null) {
  throw new Error("The page has no #root element.");
}

const { runtime } = startBoutique({ latency: 400 });
const application = mount(Application, { target, props: { runtime } });

const disposeHost = () => {
  window.removeEventListener("pagehide", disposeHost);
  unmount(application);
  runtime.dispose();
};

window.addEventListener("pagehide", disposeHost, { once: true });
import.meta.hot?.dispose(disposeHost);
