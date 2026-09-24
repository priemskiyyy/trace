import { createSimulatedFirebaseReactNative } from "example-shared/simulated/createSimulatedFirebaseReactNative";
import { createSimulatedMixpanelReactNative } from "example-shared/simulated/createSimulatedMixpanelReactNative";
import { createSimulatedPostHogReactNative } from "example-shared/simulated/createSimulatedPostHogReactNative";
import { createSimulatedSegmentReactNative } from "example-shared/simulated/createSimulatedSegmentReactNative";

/** The four React Native provider SDKs the app would otherwise load, created once and shared by every Trace. */
export const createSimulatedReactNativeProviders = () => ({
  posthog: createSimulatedPostHogReactNative(),
  firebase: createSimulatedFirebaseReactNative(),
  mixpanel: createSimulatedMixpanelReactNative(),
  segment: createSimulatedSegmentReactNative(),
});
