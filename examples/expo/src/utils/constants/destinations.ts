import type { RegisteredDestinationName } from "@priemskiyyy/trace-react";

import type { DestinationGuide } from "example-shared/boutique/reporting/types/DestinationGuide";

export const DESTINATION_NAMES: RegisteredDestinationName[] = [
  "posthog",
  "firebase",
  "mixpanel",
  "segment",
];

export const DESTINATION_GUIDES: Record<
  RegisteredDestinationName,
  DestinationGuide
> = {
  posthog: {
    name: "PostHog",
    provider: "@priemskiyyy/trace-posthog-react-native over a simulated client",
    evidence: "SDK call returned, with its own uuid",
    consent: { gated: true, ownSwitch: true },
  },
  firebase: {
    name: "Firebase",
    provider:
      "@priemskiyyy/trace-firebase-react-native over a simulated Analytics instance",
    evidence: "SDK call returned",
    consent: { gated: true, ownSwitch: true },
  },
  mixpanel: {
    name: "Mixpanel",
    provider:
      "@priemskiyyy/trace-mixpanel-react-native over a simulated instance",
    evidence: "SDK call returned",
    consent: { gated: true, ownSwitch: false },
  },
  segment: {
    name: "Segment",
    provider: "@priemskiyyy/trace-segment-react-native over a simulated client",
    evidence: "SDK call returned",
    consent: { gated: true, ownSwitch: true },
  },
};
