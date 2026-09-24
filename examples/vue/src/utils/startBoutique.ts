import { createOrdersBackend } from "example-shared/backend/createOrdersBackend";
import { createSimulatedProviders } from "example-shared/simulated/createSimulatedProviders";
import { createBoutiqueTrace } from "src/trace/createBoutiqueTrace";

/**
 * The backend, the SDKs and Boutique's Trace, started. It runs once, outside
 * Vue, before the app mounts.
 */
export const startBoutique = ({ latency }: { latency: number }) => {
  const backend = createOrdersBackend({ latency });
  const providers = createSimulatedProviders();

  // This example has no lab to retry a failed start, so Segment loads ready.
  providers.segment.setReady(true);

  const trace = createBoutiqueTrace({ backend, providers });

  trace.start();

  return {
    backend,
    providers,
    trace,
    dispose: () => {
      trace.dispose();
    },
  };
};
