---
description: "Segment in the browser, React Native and Node, and RudderStack in the browser: one configured group type, the 32 KB event limit and where an anonymous event can land."
---

# Segment and RudderStack

Four packages: Segment's three platforms, and RudderStack's browser SDK, which follows the same shape.

| Package                                   | SDK                               | Platform     |
| ----------------------------------------- | --------------------------------- | ------------ |
| `@priemskiyyy/trace-segment`              | `@segment/analytics-next`         | browser      |
| `@priemskiyyy/trace-segment-react-native` | `@segment/analytics-react-native` | React Native |
| `@priemskiyyy/trace-segment-node`         | `@segment/analytics-node`         | server       |
| `@priemskiyyy/trace-rudderstack`          | `@rudderstack/analytics-js`       | browser      |

## Segment, browser

```sh
pnpm add @priemskiyyy/trace @priemskiyyy/trace-segment @segment/analytics-next
```

```ts
import { event, Trace } from "@priemskiyyy/trace";
import { segment } from "@priemskiyyy/trace-segment";
import { AnalyticsBrowser } from "@segment/analytics-next";

const [analytics] = await AnalyticsBrowser.load({ writeKey: "YOUR_WRITE_KEY" });

const trace = new Trace({
  events: {
    "Checkout Started": event<{ cart: { id: string }; value: number }>(),
  },
  destinations: {
    segment: segment({ sdk: analytics, group: { type: "workspace" } }),
  },
});

trace.start();
trace.user({ id: "user_42", traits: { plan: "pro" } });
trace.group("workspace", { id: "workspace_1", traits: { seats: 12 } });
trace.track("Checkout Started", { cart: { id: "cart_1" }, value: 49.5 });
```

| Option  | Default  | Meaning                                                                                                  |
| ------- | -------- | -------------------------------------------------------------------------------------------------------- |
| `sdk`   | required | The `Analytics` that `AnalyticsBrowser.load` resolved with.                                              |
| `group` | none     | `{ type }`: the Trace group type sent as Segment's one group. Without it, no membership reaches Segment. |

analytics-next stamps an event with whoever it holds when it _sends_, not when you call `track`, so an anonymous event still in its pipeline at a sign-in can be filed under that user; the retry queue and offline buffer stretch that window to minutes. On a shared device, load with `retryQueue: false` to leave only the tick in which the event was handed over.

## Segment, React Native

```sh
pnpm add @priemskiyyy/trace @priemskiyyy/trace-segment-react-native @segment/analytics-react-native
```

```ts
import { event, Trace } from "@priemskiyyy/trace";
import { segment } from "@priemskiyyy/trace-segment-react-native";
import { createClient } from "@segment/analytics-react-native";

const client = createClient({ writeKey: "YOUR_WRITE_KEY" });

const trace = new Trace({
  events: {
    "Checkout Started": event<{ cart: { id: string }; value: number }>(),
  },
  destinations: {
    segment: segment({ sdk: client, group: { type: "workspace" } }),
  },
});

trace.start();
client.running.onChange((running) => {
  if (running) {
    trace.start();
  }
});
```

| Option  | Default  | Meaning                                                   |
| ------- | -------- | --------------------------------------------------------- |
| `sdk`   | required | The `SegmentClient` that `createClient` answered.         |
| `group` | none     | `{ type }`: the Trace group type sent as Segment's group. |

The destination opens only once `client.isReady.value` and `client.running.get()` are both true; restart from `client.running.onChange`, as above. Needs `TextEncoder`, which Hermes provides in React Native 0.74 and later.

## Segment, server

```sh
pnpm add @priemskiyyy/trace @priemskiyyy/trace-segment-node @segment/analytics-node
```

```ts
import { event, Trace } from "@priemskiyyy/trace";
import { segment } from "@priemskiyyy/trace-segment-node";
import { Analytics } from "@segment/analytics-node";

const analytics = new Analytics({ writeKey: "YOUR_WRITE_KEY" });

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
      segment: segment({
        sdk: analytics,
        group: { type: "workspace" },
        anonymousId: visitorId,
      }),
    },
  });

  trace.start();
  trace.user({ id: user.id, traits: { plan: user.plan } });
  trace.track("Checkout Started", { cart: { id: cart.id }, value: cart.value });

  await trace.flush();
  trace.dispose();
};
```

| Option        | Default  | Meaning                                                                                                       |
| ------------- | -------- | ------------------------------------------------------------------------------------------------------------- |
| `sdk`         | required | The `Analytics` client your application constructed.                                                          |
| `group`       | none     | `{ type }`: the Trace group type sent as Segment's one group.                                                 |
| `anonymousId` | none     | The visitor id of the request, sent as `anonymousId`. Without it, a call without a user cannot reach Segment. |

## RudderStack, browser

```sh
pnpm add @priemskiyyy/trace @priemskiyyy/trace-rudderstack @rudderstack/analytics-js
```

```ts
import { event, Trace } from "@priemskiyyy/trace";
import { rudderstack } from "@priemskiyyy/trace-rudderstack";
import { RudderAnalytics } from "@rudderstack/analytics-js";

const rudderanalytics = new RudderAnalytics();

rudderanalytics.load("YOUR_WRITE_KEY", "https://your-data-plane.example.com", {
  preConsent: { enabled: true, events: { delivery: "buffer" } },
});

const trace = new Trace({
  events: {
    "Checkout Started": event<{ cart: { id: string }; value: number }>(),
  },
  destinations: {
    warehouse: rudderstack({
      sdk: rudderanalytics,
      group: { type: "workspace" },
    }),
  },
  consent: { warehouse: ["analytics"] },
});

trace.start();

// Your consent banner, once the visitor agrees:
rudderanalytics.consent();
trace.consent.set({ analytics: "granted" });
```

| Option  | Default  | Meaning                                                                           |
| ------- | -------- | --------------------------------------------------------------------------------- |
| `sdk`   | required | The `RudderAnalytics` instance your application created. It may still be loading. |
| `group` | none     | `{ type }`: the Trace group type sent as RudderStack's one group.                 |

RudderStack's serializer drops every `null` it sends, at any depth, so a trait removal or an object or list trait would silently keep its old value there: the adapter leaves such a trait out and throws `UNSUPPORTED` instead of sending a value RudderStack would not apply.

## How events are mapped

Each event is one `track` call: Segment's carries `{ timestamp, messageId }`, RudderStack's `{ originalTimestamp }` alone, because RudderStack always makes its own message id. `event.id` becomes `messageId` for Segment, which deduplicates on it for at least 24 hours; RudderStack sends none. Context goes under properties, a property winning where it shadows a context key. An event measured past 32,768 bytes of UTF-8 JSON (the name and properties, a lower bound) is never sent and `dropped: provider-filtered`, the limit both Segment and RudderStack document.

## Identity

`identify(user.id)` (RudderStack: `identify(user.id, {})`, so an empty update does not wipe traits it holds) moves the SDK's user; traits are `identify(traits)` with `null` removing a value. Segment and RudderStack each keep one group with no type of their own: without `group: { type }` the session has no `group` method at all, and a membership of any other type, and leaving it, are reported as unsupported steps. RudderStack clears its own group before joining a new one, so an earlier group's traits never bleed into the next. `reset()` clears the user, traits, group and the anonymous id (RudderStack needs `{ entries: { anonymousId: true } }` to match this, since its own default keeps it).

## Consent

analytics-next and analytics-node have no switch after they load, so these sessions have no `collection`; Trace's own gating still holds, because it never hands Segment an event while consent is closed. Load analytics-next only once consent allows it, or with `disableClientPersistence: true` to store no identifier until then. Segment on React Native does have a switch, `client.enabled.set(...)`, which Trace flips as purposes change. RudderStack's `preConsent` mode buffers what it collects until your banner calls `consent()`; there is no way back into it, so this session has no `collection` either.

## Behavior

- Evidence is `sdk-call-returned` everywhere: the SDK queued the call, not that Segment or RudderStack stored it.
- Flush exists on the Node and React Native Segment packages, waiting for the client's queue to drain; the browser Segment package and RudderStack have none.
- `native` is the client you passed in, for anything Trace does not wrap, such as `page()`.

See [provider limitations](../provider-limitations.md) for every documented limit and what is not verified, and [choose an adapter](../adapters.md) for how these compare to the rest.
