import { createSimulatedReactNativeProviders } from "example-shared/simulated/createSimulatedReactNativeProviders";
import { createBoutiqueTrace } from "src/trace/createBoutiqueTrace";

/**
 * The four provider SDKs and Boutique's Trace, started. It runs once,
 * outside React, before the app mounts.
 */
export const startBoutique = () => {
  const providers = createSimulatedReactNativeProviders();
  const trace = createBoutiqueTrace({ providers });

  trace.start();

  return {
    providers,
    trace,
    dispose: () => {
      trace.dispose();
    },
  };
};
