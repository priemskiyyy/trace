import { createSimulatedAmplitude } from "example-shared/simulated/createSimulatedAmplitude";
import { createSimulatedGtag } from "example-shared/simulated/createSimulatedGtag";
import { createSimulatedMixpanel } from "example-shared/simulated/createSimulatedMixpanel";
import { createSimulatedPostHog } from "example-shared/simulated/createSimulatedPostHog";
import { createSimulatedSegment } from "example-shared/simulated/createSimulatedSegment";

/** The five provider SDKs the page would otherwise load, created once and shared by every Trace. */
export const createSimulatedProviders = () => ({
  amplitude: createSimulatedAmplitude(),
  posthog: createSimulatedPostHog(),
  mixpanel: createSimulatedMixpanel(),
  gtag: createSimulatedGtag(),
  segment: createSimulatedSegment(),
});
