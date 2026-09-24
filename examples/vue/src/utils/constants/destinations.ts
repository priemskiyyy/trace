import type { RegisteredDestinationName } from "@priemskiyyy/trace-vue";

import type { DestinationGuide } from "src/types/DestinationGuide";

export const DESTINATION_NAMES: RegisteredDestinationName[] = [
  "amplitude",
  "posthog",
  "mixpanel",
  "googleAnalytics",
  "segment",
  "backend",
];

export const DESTINATION_GUIDES: Record<
  RegisteredDestinationName,
  DestinationGuide
> = {
  amplitude: {
    name: "Amplitude",
    provider: "@priemskiyyy/trace-amplitude over a simulated device",
    evidence: "SDK call returned",
    consent: "Gated: analytics",
  },
  posthog: {
    name: "PostHog",
    provider: "@priemskiyyy/trace-posthog over a simulated instance",
    evidence: "SDK call returned, with its own uuid",
    consent: "Gated: analytics",
  },
  mixpanel: {
    name: "Mixpanel",
    provider: "@priemskiyyy/trace-mixpanel over a simulated instance",
    evidence: "SDK call returned",
    consent: "Gated: analytics",
  },
  googleAnalytics: {
    name: "Google Analytics",
    provider: "@priemskiyyy/trace-google-analytics over a simulated gtag",
    evidence: "SDK call returned",
    consent: "Gated: analytics",
  },
  segment: {
    name: "Segment",
    provider: "@priemskiyyy/trace-segment over a simulated instance",
    evidence: "SDK call returned",
    consent: "Ungated: analytics-next has no collection switch",
  },
  backend: {
    name: "Your API",
    provider: "@priemskiyyy/trace-http over the in-page backend",
    evidence: "Backend acknowledged",
    consent: "Ungated: it is Boutique's own API",
  },
};
