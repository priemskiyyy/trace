---
description: "Use Trace in Solid: publish it with a provider, track in handlers with useTrace, and read status and consent with primitives that start nothing."
---

# Solid

`@priemskiyyy/trace-solid` is a provider, `useTrace`, and three primitives that observe the Trace's status, one destination's status and consent, for Solid 1.9 or newer. It is deliberately thin: tracking is `trace().track`, which needs no primitive.

```sh
pnpm add @priemskiyyy/trace @priemskiyyy/trace-solid
```

## Set it up

Create and start the Trace outside Solid, register it, then publish it:

```ts
import { Trace, event } from "@priemskiyyy/trace";
import { console } from "@priemskiyyy/trace-console";

export const trace = new Trace({
  events: {
    "App Opened": event(),
    "Checkout Started": event<{ cart: { id: string } }>(),
  },
  destinations: { console: console() },
  consent: { console: ["analytics"] },
});

declare module "@priemskiyyy/trace-solid" {
  interface Register {
    trace: typeof trace;
  }
}

trace.start();
```

<!-- snippet: fragment -->

```tsx
export const Root = () => (
  <TraceProvider trace={trace}>
    <Application />
  </TraceProvider>
);
```

The `Register` augmentation types every primitive with this Trace: its events, its destination names and its purposes. Without it, the provider takes only an untyped Trace and refuses one that declares its events.

## TraceProvider

Publishes one Trace to the tree below, and does nothing else. The Trace owns its own lifetime: mounting the provider opens no destination, and unmounting it disposes nothing, so a remount or a hot update can never close the SDKs your application initialized.

## useTrace

```ts
import { useTrace } from "@priemskiyyy/trace-solid";

const trace = useTrace();

const handleCheckoutClick = (cartId: string) => {
  trace().track("Checkout Started", { cart: { id: cartId } });
};
```

Returns an accessor of the nearest provider's Trace, and throws `TraceError` `INVALID_CONFIGURATION` when there is none. Call it while a component is being created, like any Solid primitive. Track in event handlers: rendering never tracks, and there is no primitive that tracks on mount. See [where to track](tracking.md#where-to-track).

## useTraceStatus

```ts
import { useTraceStatus } from "@priemskiyyy/trace-solid";

const status = useTraceStatus(); // status().state: "idle" | "started" | "disposed"
```

## useDestinationStatus

```ts
import { useDestinationStatus } from "@priemskiyyy/trace-solid";
import { createEffect } from "solid-js";

const destination = useDestinationStatus("console");

createEffect(() => {
  const status = destination();

  if (status.state === "failed") {
    console.warn("The console destination did not open", status.error);
  }
});
```

One destination's status: `idle`, `ready`, `failed` or `disposed`. `ready` means locally usable, not that a network is reachable. The name may be a string or an accessor, and a name that changes is followed; one that recomputes to the same destination keeps its listeners. A name the Trace was not built with throws `TraceError` `INVALID_CONFIGURATION` while the component is created; once the Trace is registered, the types refuse such a name.

## useConsent

<!-- snippet: fragment -->

```tsx
import { useConsent, useTrace } from "@priemskiyyy/trace-solid";
import { Show } from "solid-js";

export const ConsentBanner = () => {
  const trace = useTrace();
  const consent = useConsent();

  const handleAcceptClick = () => {
    trace().consent.set({ analytics: "granted" });
  };

  const handleDeclineClick = () => {
    trace().consent.set({ analytics: "denied" });
  };

  return (
    <Show when={consent().analytics === "unknown"}>
      <p>
        May we measure how the shop is used?
        <button onClick={handleAcceptClick}>Accept</button>
        <button onClick={handleDeclineClick}>Decline</button>
      </p>
    </Show>
  );
};
```

The decision for each purpose the `consent` option names: `unknown`, `granted` or `denied`. Decisions are set with `trace().consent.set`, and the accessor follows each one. See [consent](consent.md).

The three primitives observe only, and their accessors return the Trace's own objects. Using one opens no destination and tracks nothing. Each accepts an optional callback told about every change after its component mounts, even one made between creating the component and mounting it, and it gets a listener of its own, so a callback that throws cannot disturb what Solid renders. On the server and until the component mounts, the statuses read `idle` and every purpose reads `unknown`: Solid claims server markup as it is while hydrating, so a different first value would stay on screen until the next change. See [server rendering](server-rendering.md).

The [package README](https://github.com/priemskiyyy/trace/tree/main/packages/solid#readme) is the full reference. For the inspector, see [devtools](devtools.md).
