---
description: "Use Trace in React: publish it with a provider, track in handlers with useTrace, and read status and consent with hooks that start nothing."
---

# React

`@priemskiyyy/trace-react` is a provider, `useTrace`, and three hooks that observe the Trace's status, one destination's status and consent. It is deliberately thin: tracking is `trace.track`, and the bindings never start, dispose or track anything.

```sh
pnpm add @priemskiyyy/trace @priemskiyyy/trace-react
```

## Set it up

Create and start the Trace outside React, register it, then publish it:

<!-- snippet: fragment -->

```tsx
import { Trace, event } from "@priemskiyyy/trace";
import { console } from "@priemskiyyy/trace-console";
import { TraceProvider } from "@priemskiyyy/trace-react";

export const trace = new Trace({
  events: {
    "App Opened": event(),
    "Checkout Started": event<{ cart: { id: string } }>(),
  },
  destinations: { console: console() },
  consent: { console: ["analytics"] },
});

declare module "@priemskiyyy/trace-react" {
  interface Register {
    trace: typeof trace;
  }
}

trace.start();

export const Root = () => (
  <TraceProvider trace={trace}>
    <Application />
  </TraceProvider>
);
```

The `Register` augmentation types every hook with this Trace: its events, its destination names and its purposes. Without it, the provider takes only an untyped Trace and refuses one that declares its events.

## TraceProvider

Publishes one Trace to the tree below, and does nothing else. The Trace owns its own lifetime: mounting the provider opens no destination, and unmounting it disposes nothing, so React Strict Mode, a remount or a fast refresh can never close the SDKs your application initialized.

## useTrace

```tsx
import { useTrace } from "@priemskiyyy/trace-react";

export const CheckoutButton = ({
  cart,
}: {
  cart: { id: string; value: number };
}) => {
  const trace = useTrace();

  const handleCheckoutPress = () => {
    trace.track("Checkout Started", {
      cart: { id: cart.id },
      value: cart.value,
      currency: "EUR",
    });
  };

  return <button onClick={handleCheckoutPress}>Check out</button>;
};
```

Returns the nearest provider's Trace, and throws a `TraceError` with the code `INVALID_CONFIGURATION` when there is none. Its members are bound, so they can be passed around. Track in event handlers: rendering never tracks, and there is no hook that tracks on mount, because a render can run more than once. See [where to track](tracking.md#where-to-track).

## useTraceStatus

```ts
import { useTraceStatus } from "@priemskiyyy/trace-react";

const status = useTraceStatus(); // { state: "idle" | "started" | "disposed" }
```

## useDestinationStatus

```ts
import { useDestinationStatus } from "@priemskiyyy/trace-react";

const status = useDestinationStatus("console");

if (status.state === "failed") {
  console.warn("The console destination did not open", status.error);
}
```

| State      | Meaning                                                           |
| ---------- | ----------------------------------------------------------------- |
| `idle`     | Not open yet. Also what the server and the hydrating render read. |
| `ready`    | Locally usable, not that a network is reachable.                  |
| `failed`   | Its `open` threw; `error` holds what.                             |
| `disposed` | The Trace was disposed.                                           |

A name the Trace was not built with throws `TraceError` `INVALID_CONFIGURATION` while rendering; once the Trace is registered, the types refuse such a name.

## useConsent

```tsx
import { useConsent, useTrace } from "@priemskiyyy/trace-react";

export const ConsentBanner = () => {
  const trace = useTrace();
  const consent = useConsent();

  const handleAcceptPress = () => {
    trace.consent.set({ analytics: "granted" });
  };

  const handleDeclinePress = () => {
    trace.consent.set({ analytics: "denied" });
  };

  if (consent.analytics !== "unknown") {
    return null;
  }

  return (
    <p>
      May we measure how the shop is used?
      <button onClick={handleAcceptPress}>Accept</button>
      <button onClick={handleDeclinePress}>Decline</button>
    </p>
  );
};
```

The decision for each purpose the `consent` option names: `unknown`, `granted` or `denied`. Decisions are set with `trace.consent.set`, and the hook rerenders with each one. See [consent](consent.md).

Every hook observes only. Rendering one opens no destination and tracks nothing. Each accepts an optional callback told about every change after the render it follows, even one made before its listener attached, and it gets a listener of its own, so a callback that throws cannot disturb what React renders. On the server and during the hydrating render, statuses read `idle` and every purpose reads `unknown`, so server and client markup match even when the client has already started the Trace or restored consent. See [server rendering](server-rendering.md).

## Screen views

There is no hook that tracks on navigation. Track a page or screen view from your router's own listener, such as a Next.js `usePathname` effect or a React Router `useLocation` subscription, calling `trace.track` from inside it, never from a component body. On React Native, see [React Native and Expo](react-native.md).

## Peers and entries

`trace-react` needs `react >=19.2 <20`, for `useEffectEvent`. Every entry the package exports starts with a `"use client"` directive through the bundler's banner, so it can be imported from a React Server Components tree without forcing the whole module graph to the client, and the directive never reaches the published declaration files.

The [Flare bridge](flare.md) subscribes to `trace.events` the same way the devtools do, outside these bindings. See the [package README](https://github.com/priemskiyyy/trace/tree/main/packages/react#readme) for every prop and hook.
