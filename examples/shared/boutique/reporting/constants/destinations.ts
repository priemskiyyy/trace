import type { BoutiqueDestination } from "example-shared/boutique/reporting/types/BoutiqueDestination";
import type { DestinationGuide } from "example-shared/boutique/reporting/types/DestinationGuide";

/** Boutique's six destinations, in the order the page lists them. */
export const DESTINATION_NAMES: BoutiqueDestination[] = [
  "amplitude",
  "posthog",
  "mixpanel",
  "googleAnalytics",
  "segment",
  "backend",
];

/** What each destination is, the evidence its outcome rests on, and how consent reaches it. */
export const DESTINATION_GUIDES: Record<BoutiqueDestination, DestinationGuide> =
  {
    amplitude: {
      name: "Amplitude",
      provider: "@priemskiyyy/trace-amplitude over a simulated device",
      evidence: "SDK call returned",
      consent: { gated: true, ownSwitch: true },
    },
    posthog: {
      name: "PostHog",
      provider: "@priemskiyyy/trace-posthog over a simulated instance",
      evidence: "SDK call returned, with its own uuid",
      consent: { gated: true, ownSwitch: true },
    },
    mixpanel: {
      name: "Mixpanel",
      provider: "@priemskiyyy/trace-mixpanel over a simulated instance",
      evidence: "SDK call returned",
      consent: { gated: true, ownSwitch: true },
    },
    googleAnalytics: {
      name: "Google Analytics",
      provider: "@priemskiyyy/trace-google-analytics over a simulated gtag",
      evidence: "SDK call returned",
      consent: { gated: true, ownSwitch: true },
    },
    segment: {
      name: "Segment",
      provider: "@priemskiyyy/trace-segment over a simulated instance",
      evidence: "SDK call returned",
      consent: { gated: true, ownSwitch: false },
    },
    backend: {
      name: "Your API",
      provider: "@priemskiyyy/trace-http over the in-page backend",
      evidence: "Backend acknowledged",
      consent: { gated: false, ownSwitch: false },
    },
  };
