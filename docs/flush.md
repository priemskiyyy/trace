---
description: "Start the destinations, give Trace and the provider SDKs a bounded moment to hand off events before a page hides, an app goes to the background or a request ends, and dispose of a Trace."
---

# Flush and the application lifecycle

## start

`start()` opens every destination. It returns nothing and never throws.

```ts
trace.start();
```

Until a destination is ready, its events wait in a buffer, so an event tracked during startup is not lost. Opening is synchronous: each adapter checks that its SDK is ready and answers a session over it, or throws.

Calling `start()` again is safe. It retries only the destinations whose start failed, and a call made while a destination is opening retries it once that attempt ends. A start fails because the provider SDK is not initialized yet, with a `TraceError` whose code is `NOT_INITIALIZED`, or because it is configured in a way the adapter cannot honor, with `UNSUPPORTED`, never because of the network. So initialize the SDK, then call `start()` again:

```ts
import posthogJs from "posthog-js";

trace.start();

if (trace.destination("research").status.get().state === "failed") {
  posthogJs.init("phc_project_api_key", {
    api_host: "https://eu.i.posthog.com",
  });
  trace.start();
}
```

The events tracked meanwhile reach the destination once it opens, as long as they are still in its buffer. `start()` after `dispose()` does nothing.

| Status of `trace.destination(name).status` | Meaning                                                                                |
| ------------------------------------------ | -------------------------------------------------------------------------------------- |
| `idle`                                     | Not opened yet.                                                                        |
| `ready`                                    | Its session opened. It says nothing about whether a network or a backend is reachable. |
| `failed`                                   | Its `open` threw, and `error` holds what it threw, until a later `start()` opens it.   |
| `disposed`                                 | The Trace was disposed.                                                                |

## flush

`flush()` waits for the work that was accepted before the call, then asks each provider SDK to flush what it holds.

```ts
const result = await trace.flush({ timeout: 1_000 });

result.drained; // false when a destination ran out of time or was not ready
result.destinations.research; // { status: "unsupported" }
```

1. Each ready destination first hands off what it held from before the call.
2. Then it calls its provider's flush, with the time left and a signal, so an SDK that batches sends at once.
3. It waits for those hand-offs and for the provider's answer, bounded by the timeout.

The timeout, two seconds by default, bounds the wait and nothing else. It cancels nothing, and it proves nothing about delivery. Events tracked after the call do not extend the wait, and a provider's own flush gets what is left of the timeout, not all of it again. `flush` never rejects: a timeout outside 0 to 2147483647 ms is brought into that range. Unlike Trace's other timers, a pending flush keeps a Node process alive, because its caller is waiting for it.

| Status        | Meaning                                                                                                                        |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `flushed`     | The provider's own flush completed.                                                                                            |
| `timeout`     | Time ran out first.                                                                                                            |
| `failed`      | The provider's flush threw, rejected or reported a failure, or answered with no status its contract allows (`INVALID_ANSWER`). |
| `unsupported` | The provider has no flush. Trace's own work for it did drain: every event accepted before the call has its outcome.            |
| `not-ready`   | The destination is not open, so there was nothing to flush. What waits in its buffer stays there.                              |

`drained` is `false` when a destination answered `timeout` or `not-ready`, and `true` otherwise, `failed` included: every event accepted before the call has its outcome there, and it is the provider's own flush that failed.

What `flushed` means depends on the provider:

| Destination                        | A completed flush means                                                                                                                                                                                                                                                 |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Amplitude and Ampli                | Amplitude answered 2xx for every upload of this destination since the last flush that answered in time. An upload Amplitude refused or that failed, including one that settled after an earlier flush ran out of time, makes the flush `failed` with `DELIVERY_FAILED`. |
| PostHog on React Native            | PostHog accepted every batch the client had queued when the flush started.                                                                                                                                                                                              |
| Segment on React Native            | The client's upload attempt left no event pending. One kept for a retry makes the flush `failed`.                                                                                                                                                                       |
| PostHog on a server                | PostHog answered 2xx for the batches this flush sent, other requests' events included. A batch sent earlier, by another flush or on the client's own schedule, reports a failure only there or to the console, so events can be lost under `flushed`.                   |
| Segment on a server                | analytics-node sent or gave up on everything the shared client held, other requests' events included. It does not say whether Segment accepted them.                                                                                                                    |
| Mixpanel and Amplitude on a server | This destination's requests from before the call were answered, and the provider refused none since the last flush that answered in time. A refusal that settled after an earlier flush ran out of time makes the next flush `failed`.                                  |
| every other adapter                | Nothing: there is no provider flush, and the result is `unsupported`.                                                                                                                                                                                                   |

Each provider's page has the details, including how its SDK sends on its own schedule. See [choose an adapter](adapters.md).

## When to flush

In a browser, flush when the page is being hidden. It is the last event a mobile browser reliably fires:

```ts
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    trace.flush({ timeout: 1_000 });
  }
});
```

In React Native, flush when the app goes to the background. See [React Native and Expo](react-native.md).

On a server, one Trace serves one request or job. Flush before the job ends or a serverless handler returns, then dispose of the Trace:

```ts
import { Trace } from "@priemskiyyy/trace";
import { segment } from "@priemskiyyy/trace-segment-node";
import { Analytics } from "@segment/analytics-node";

const analytics = new Analytics({ writeKey: "YOUR_WRITE_KEY" });

export const trackCheckout = async (
  visitorId: string,
  user: { id: string },
) => {
  const trace = new Trace({
    events,
    destinations: {
      segment: segment({ sdk: analytics, anonymousId: visitorId }),
    },
  });

  trace.start();
  trace.user(user);
  trace.track("Checkout Started", {
    cart: { id: "cart_1" },
    value: 49.5,
    currency: "EUR",
  });

  await trace.flush();
  trace.dispose();
};
```

A server that handles requests concurrently over one shared client should read its adapter's flush notes first: a PostHog, Segment or Amplitude flush sends everything that client holds, analytics-node answers a flush that overlaps another at once, and the Amplitude Node SDK skips such a flush and leaves its events to its own 10-second timer, so that `trace.flush()` answers `timeout` unless its time outlasts that timer. See [servers and serverless](servers.md).

## dispose

`dispose()` releases every destination. It is synchronous, returns nothing and is safe to call twice.

```ts
trace.dispose();
```

After it:

- events still waiting in a buffer settle as `dropped` with the reason `disposed`
- events in flight settle as `indeterminate` with the reason `disposed`, because they may already have left, and their signal aborts
- each session's own `dispose` runs once, while the SDK itself keeps running: Trace never closes it
- new events are dropped with the reason `disposed`, and `flush` answers `not-ready` for every destination
- diagnostics record a final `trace disposed`, and every listener is released

A disposed Trace cannot be started again: create a new one. In an application that lives as long as the page, you never need to dispose. It matters in tests, in hot module replacement, and on a server, where each request or job gets a Trace of its own.
