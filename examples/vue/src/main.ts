import { createApp } from "vue";

import { startBoutique } from "example-shared/boutique/reporting/startBoutique";
import Application from "src/Application.vue";
import "src/styles.css";

const root = document.getElementById("root");

if (root === null) {
  throw new Error("The page has no #root element.");
}

const { runtime } = startBoutique({ latency: 400 });
const application = createApp(Application, { runtime });

application.mount(root);

const disposeHost = () => {
  window.removeEventListener("pagehide", disposeHost);
  application.unmount();
  runtime.dispose();
};

window.addEventListener("pagehide", disposeHost, { once: true });
import.meta.hot?.dispose(disposeHost);
