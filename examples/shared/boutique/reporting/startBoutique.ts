import { createOrdersBackend } from "example-shared/backend/createOrdersBackend";
import { createBoutiqueRuntime } from "example-shared/boutique/reporting/createBoutiqueRuntime";
import { createSimulatedProviders } from "example-shared/simulated/createSimulatedProviders";

/**
 * The backend, the SDKs and the first runtime, started. It runs once, before
 * the app mounts, where Strict Mode cannot start a runtime twice.
 */
export const startBoutique = ({ latency }: { latency: number }) => {
  const backend = createOrdersBackend({ latency });
  const providers = createSimulatedProviders();
  const runtime = createBoutiqueRuntime({ backend, providers });

  runtime.trace.start();

  return { backend, providers, runtime };
};
