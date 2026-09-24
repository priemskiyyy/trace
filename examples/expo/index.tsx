import { registerRootComponent } from "expo";
import type React from "react";
import { AppState } from "react-native";

import { Application } from "src/Application";
import { startBoutique } from "src/utils/startBoutique";

const boutique = startBoutique();

const lifecycle = AppState.addEventListener("change", (state) => {
  if (state !== "background") {
    return;
  }

  boutique.trace.flush();
});

boutique.providers.segment.sdk.running.onChange((running) => {
  if (running) {
    boutique.trace.start();
  }
});

const Root: React.FunctionComponent = () => <Application runtime={boutique} />;

registerRootComponent(Root);

export const disposeHost = () => {
  lifecycle.remove();
  boutique.dispose();
};
