---
description: "One Trace per request or job over a shared, application-owned SDK client: the four server adapters, the anonymousId option, and flushing before the process ends."
---

# Servers and serverless

A server builds one Trace per request or job, over an SDK client the application constructs once for the process. A Trace is cheap to construct, and a per-request one never mixes two users:

```ts
import { event, Trace } from "@priemskiyyy/trace";
import { posthog } from "@priemskiyyy/trace-posthog-node";
import { PostHog } from "posthog-node";

const client = new PostHog("phc_project_api_key");

const events = {
  "Checkout Started": event<{ cart: { id: string }; value: number }>(),
};

export const trackCheckout = async (
  visitorId: string,
  user: { id: string; plan: string },
  cart: { id: string; value: number },
) => {
  const trace = new Trace({
    events,
    destinations: {
      research: posthog({ sdk: client, anonymousId: visitorId }),
    },
  });

  trace.start();
  trace.user({ id: user.id, traits: { plan: user.plan } });
  trace.track("Checkout Started", { cart: { id: cart.id }, value: cart.value });

  await trace.flush();
  trace.dispose();
};
```

## The four server adapters

| Provider  | Package                | Holds a user between calls                       | `anonymousId`                                          |
| --------- | ---------------------- | ------------------------------------------------ | ------------------------------------------------------ |
| PostHog   | `trace-posthog-node`   | no: every call names its own `distinctId`        | merges into the user at sign-in                        |
| Amplitude | `trace-amplitude-node` | no: every call carries `user_id` and `device_id` | sent as `device_id`                                    |
| Segment   | `trace-segment-node`   | no: every call carries `userId`/`anonymousId`    | links to the user in Segment                           |
| Mixpanel  | `trace-mixpanel-node`  | no: every call carries `$user_id`/`$device_id`   | sent as `$device_id`                                   |
| HTTP      | `trace-http`           | no: your `request` reads `event.identity`        | not applicable; add your own visitor id in your client |

None of the four SDK-backed server sessions has `reset`: since the client holds nothing between calls, Trace plans no identity switch when a per-request Trace's user differs from the previous request's. PostHog Node is the one exception with an identity method at all: it keeps `identify`, not to hold a user between calls, but to send the `$identify` that merges a visitor's history into the user at sign-in; Amplitude, Segment and Mixpanel's server packages have neither `identify` nor `reset`. `anonymousId` is the visitor id your application already keeps for signed-out traffic, such as a cookie; without it, an event with no signed-in user cannot reach PostHog, Amplitude, Segment or Mixpanel, and is `skipped: unidentified`. See each provider's page under [Destinations](adapters.md) for its exact mapping.

## Flushing and concurrency

Every server adapter has a `flush`, because a server must know its work is done before it answers or the process ends:

```ts
await trace.flush();
trace.dispose();
```

- **One request at a time**, such as a serverless function: flush every request, as the example above does.
- **Requests handled concurrently**, such as a long-running Node server: the underlying SDK client is shared, so one Trace's `flush()` can wait for, or report, another request's events too (PostHog, Segment) or overlap with the SDK's own timer (Amplitude, Mixpanel). Let the client send on its own schedule and flush once at shutdown instead; each provider's page states the exact overlap rule.

The HTTP adapter has no queue of its own: each event is one request, already done by the time `track` returns, so its `flush()` only waits for requests still in flight.

## Consent per request

None of the four SDK-backed server sessions has a `collection` switch: the client is shared across requests, so a provider-level opt-out would silence other visitors. Gate each request's own destination instead, before `trace.start()`:

```ts
import { Trace, event } from "@priemskiyyy/trace";
import { posthog } from "@priemskiyyy/trace-posthog-node";
import type { PostHog } from "posthog-node";

const events = {
  "Checkout Started": event<{ cart: { id: string }; value: number }>(),
};

const startForRequest = (client: PostHog, hasConsent: boolean) => {
  const trace = new Trace({
    events,
    destinations: { research: posthog({ sdk: client }) },
    consent: { research: ["analytics"] },
  });

  trace.consent.set({ analytics: hasConsent ? "granted" : "denied" });
  trace.start();

  return trace;
};
```

While a purpose a destination needs is not granted, Trace hands that destination nothing for this request; every other request over the same client is unaffected. See [consent](consent.md).

## Shutting the client down

Trace never constructs, configures or closes a provider SDK, on a server as everywhere else: your application owns `client.shutdown()`, `client.closeAndFlush()` or the equivalent, called once when the process ends, never by a per-request Trace. See [flush and the application lifecycle](flush.md) and [server rendering](server-rendering.md) for constructing a Trace during a server render.
