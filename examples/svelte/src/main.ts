import { mount, unmount } from "svelte";

import Application from "src/Application.svelte";
import { startBoutique } from "src/utils/startBoutique";
import "src/styles.css";

const target = document.getElementById("root");

if (target === null) {
  throw new Error("The page has no #root element.");
}

const runtime = startBoutique({ latency: 400 });
const application = mount(Application, { target, props: { runtime } });

const disposeHost = () => {
  window.removeEventListener("pagehide", disposeHost);
  unmount(application);
  runtime.dispose();
};

window.addEventListener("pagehide", disposeHost, { once: true });
import.meta.hot?.dispose(disposeHost);
