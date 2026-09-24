---
description: "Compare every Trace adapter: Amplitude and Ampli, PostHog, Mixpanel, Segment and RudderStack, Google Analytics and Firebase, Heap, Plausible, Umami, Fathom, Vercel, your own backend and the console, with identity, consent and evidence for each."
---

# Choose an adapter

An adapter maps one sanitized event onto one provider and nothing more. You can route an event to several at once, and adding or removing one is a configuration change, not a change to your tracking code.

```ts
import { event, Trace } from "@priemskiyyy/trace";
import { console } from "@priemskiyyy/trace-console";
import { posthog } from "@priemskiyyy/trace-posthog";
import posthogJs from "posthog-js";

posthogJs.init("phc_project_api_key");

const trace = new Trace({
  events: {
    "Checkout Started": event<{ cart: { id: string }; value: number }>(),
  },
  destinations: {
    research: posthog({ sdk: posthogJs }),
    debug: console(),
  },
});

trace.start();
trace.track("Checkout Started", { cart: { id: "cart_1" }, value: 49.5 });
```

| Provider                                         | Package                       | Platform              | Identity                                   | Consent switch | Evidence                 | Flush |
| ------------------------------------------------ | ----------------------------- | --------------------- | ------------------------------------------ | -------------- | ------------------------ | ----- |
| [Ampli](adapters/amplitude.md)                   | `trace-ampli`                 | browser               | identify, traits, reset                    | yes            | `sdk-call-returned`      | yes   |
| [Amplitude](adapters/amplitude.md)               | `trace-amplitude`             | browser, React Native | identify, traits, group, reset             | yes            | `sdk-call-returned`      | yes   |
| [Amplitude](adapters/amplitude.md)               | `trace-amplitude-node`        | server                | traits, group                              | no             | `sdk-call-returned`      | yes   |
| [PostHog](adapters/posthog.md)                   | `trace-posthog`               | browser               | identify, traits, group, reset             | yes            | `sdk-call-returned`      | no    |
| [PostHog](adapters/posthog.md)                   | `trace-posthog-node`          | server                | identify, traits, group                    | no             | `sdk-call-returned`      | yes   |
| [PostHog](adapters/posthog.md)                   | `trace-posthog-react-native`  | React Native          | identify, traits, group, reset             | yes            | `sdk-call-returned`      | yes   |
| [Mixpanel](adapters/mixpanel.md)                 | `trace-mixpanel`              | browser               | identify, traits, group, reset             | yes            | `sdk-call-returned`      | no    |
| [Mixpanel](adapters/mixpanel.md)                 | `trace-mixpanel-node`         | server                | traits, group                              | no             | `backend-acknowledged`   | yes   |
| [Mixpanel](adapters/mixpanel.md)                 | `trace-mixpanel-react-native` | React Native          | identify, traits, group (join only), reset | no             | `sdk-call-returned`      | no    |
| [Segment](adapters/segment.md)                   | `trace-segment`               | browser               | identify, traits, one group type, reset    | no             | `sdk-call-returned`      | no    |
| [Segment](adapters/segment.md)                   | `trace-segment-node`          | server                | traits, one group type                     | no             | `sdk-call-returned`      | yes   |
| [Segment](adapters/segment.md)                   | `trace-segment-react-native`  | React Native          | identify, traits, one group type, reset    | yes            | `sdk-call-returned`      | yes   |
| [RudderStack](adapters/segment.md)               | `trace-rudderstack`           | browser               | identify, traits, one group type, reset    | no             | `sdk-call-returned`      | no    |
| [Google Analytics](adapters/google-analytics.md) | `trace-google-analytics`      | browser               | identify, traits, reset                    | yes            | `sdk-call-returned`      | no    |
| [Firebase](adapters/google-analytics.md)         | `trace-firebase`              | browser               | identify, traits, reset                    | yes            | `sdk-call-returned`      | no    |
| [Firebase](adapters/google-analytics.md)         | `trace-firebase-react-native` | React Native          | identify, traits, reset                    | yes            | `sdk-call-returned`      | no    |
| [Heap](adapters/heap.md)                         | `trace-heap`                  | browser               | identify, traits, reset                    | no             | `sdk-call-returned`      | no    |
| [Plausible](adapters/plausible.md)               | `trace-plausible`             | browser               | none                                       | no             | `sdk-callback-completed` | no    |
| [Umami](adapters/umami.md)                       | `trace-umami`                 | browser               | user id per event                          | no             | `sdk-call-returned`      | no    |
| [Fathom](adapters/fathom.md)                     | `trace-fathom`                | browser               | none                                       | no             | `sdk-call-returned`      | no    |
| [Vercel](adapters/vercel.md)                     | `trace-vercel`                | browser               | none                                       | no             | `sdk-call-returned`      | no    |
| [Console](adapters/console.md)                   | `trace-console`               | anywhere              | identify, traits, group, reset             | no             | `sdk-call-returned`      | no    |
| [HTTP](http-backend.md)                          | `trace-http`                  | anywhere              | none, per event                            | no             | `backend-acknowledged`   | no    |

"Consent switch" means the provider's own SDK has a reversible collection switch Trace can flip; every adapter still refuses to hand an event to a gated destination while consent is closed, switch or none. "Flush" means the session answers `flushed`, `timeout` or `failed`; without one `trace.flush()` reports the destination `unsupported`. See [receipts and evidence](receipts.md) for what each evidence value proves, and [provider limitations](provider-limitations.md) for what each provider cannot carry.

## You own the SDK

Every adapter takes the SDK your application already set up, typed structurally so any object with the right shape works, and imports nothing from the provider at runtime. You initialize it, configure it and close it; Trace only calls it. Where a provider's browser and React Native SDKs share an API, one package serves both, such as `trace-amplitude`. Where they differ, React Native has its own package with a factory of the same name, such as `trace-posthog-react-native`.

## Something else

An adapter is a plain `{ name, open }` object, about as much code as the table above implies. See [writing an adapter](writing-an-adapter.md).
