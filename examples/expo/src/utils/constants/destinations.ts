import type { RegisteredDestinationName } from "@priemskiyyy/trace-react";

import type { DestinationGuide } from "src/types/DestinationGuide";

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
    consent: "Gated: analytics",
  },
  firebase: {
    name: "Firebase",
    provider:
      "@priemskiyyy/trace-firebase-react-native over a simulated Analytics instance",
    evidence: "SDK call returned",
    consent: "Gated: analytics",
  },
  mixpanel: {
    name: "Mixpanel",
    provider:
      "@priemskiyyy/trace-mixpanel-react-native over a simulated instance",
    evidence: "SDK call returned",
    consent: "Gated: analytics",
  },
  segment: {
    name: "Segment",
    provider: "@priemskiyyy/trace-segment-react-native over a simulated client",
    evidence: "SDK call returned",
    consent: "Gated: analytics",
  },
};
