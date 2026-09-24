import { createSimulatedPostHogNode } from "example-shared/simulated/createSimulatedPostHogNode";
import { createSimulatedSegmentNode } from "example-shared/simulated/createSimulatedSegmentNode";

/** The two server-side provider clients a process would construct once and share across requests. */
export const createSimulatedServerProviders = () => ({
  posthog: createSimulatedPostHogNode(),
  segment: createSimulatedSegmentNode(),
});
