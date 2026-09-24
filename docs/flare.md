---
description: "Turn selected Trace events into Flare breadcrumbs with @priemskiyyy/flare-trace, so an error report shows what the user did just before it, without leaking analytics data."
---

# The Flare bridge

`@priemskiyyy/flare-trace` turns the events you choose from `trace.events` into breadcrumbs on a [Flare](https://github.com/priemskiyyy/flare). Neither library depends on the other, and Trace ships no code for this: the bridge is a separate package that subscribes to the stream every destination already sees after it is sanitized.

```sh
pnpm add @priemskiyyy/flare @priemskiyyy/flare-trace
```

<!-- snippet: fragment -->

```ts
import { traceBreadcrumbs } from "@priemskiyyy/flare-trace";

const stop = traceBreadcrumbs({
  source: trace.events,
  flare,
  map: {
    "Checkout Started": ({ cart }) => ({
      name: "checkoutStarted",
      data: { cartId: cart.id },
    }),
    "Search Performed": ({ query }) => {
      // Admin-only searches leave no trail.
      if (query.startsWith("admin:")) {
        return null;
      }

      return { name: "searchPerformed", data: { query } };
    },
  },
});

// Later, for example when the visitor opts out:
stop();
```

`trace.events` satisfies the small subscription interface Flare's package owns, `TraceEventSource`, so no adapter code sits between them: anything with a `subscribe(listener)` that returns its unsubscriber and delivers `{ name, properties, timestamp }` works.

## The rules

- **Only mapped events are bridged**, and only what the mapper returns is copied. There is no option to pass every event through: properties are collected for analytics and often hold data that does not belong in an error report.
- **A bridged breadcrumb is an ordinary breadcrumb.** Flare validates, redacts, scrubs and bounds it before it is kept, the same as one your own code adds.
- **It keeps the time the event occurred**, not the time it was delivered, so a breadcrumb from an event that waited in Trace's buffer still lines up with what happened.
- **History is not replayed.** An event tracked before the bridge started is ignored, however late it arrives; Trace's own buffer can hold and later deliver events from before `start()`.
- **Account boundaries hold.** A breadcrumb from before the current account signed in is refused, and Flare clears its session breadcrumbs on every identity change, the same as any other source.
- **A mapper that throws costs its own breadcrumb** and nothing else: the next event maps normally.

## What to bridge

Bridge what a provider cannot already tell Flare: the product step a user was in, a flag or plan that changed the flow, a search that came up empty. A destination such as Google Analytics or a provider whose SDK Flare also wraps may already add its own automatic breadcrumbs; bridging the same events again only doubles them.

The [package README](https://github.com/priemskiyyy/flare/tree/main/packages/trace#readme) is the full reference for `traceBreadcrumbs`'s options. See [tracking and receipts](tracking.md#the-events-stream) for what `trace.events` delivers and when, and [diagnostics and devtools](devtools.md) for the other subscriber of the same stream.
