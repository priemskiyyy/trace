# @priemskiyyy/trace-react

React bindings for [Trace](../core): a provider, `useTrace`, and three hooks that observe the Trace's status, one destination's status and consent. They are deliberately thin. Events are tracked with `trace.track`, and the bindings never start, dispose or track anything.

Works in React 19.2 or newer, in the browser and in React Native.

## Installation

```sh
pnpm add @priemskiyyy/trace @priemskiyyy/trace-react
```

## Set it up

Create and start the Trace outside React, as early as your application allows, register it, then publish it:

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

The console destination needs the `analytics` purpose, so it receives events once the visitor grants it, as the banner under [useConsent](#useconsent) does.

## TraceProvider

<!-- snippet: fragment -->

```tsx
<TraceProvider trace={trace}>{children}</TraceProvider>
```

Publishes one Trace to the tree below, and does nothing else. The Trace owns its own lifetime. Mounting the provider opens no destination and unmounting it disposes nothing, so a remount, React Strict Mode or a fast refresh can never close the SDKs your application initialized.

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

Returns the nearest provider's Trace, and throws a `TraceError` with the code `INVALID_CONFIGURATION`, `Trace hooks must be used within a TraceProvider.`, when there is none. Its members are bound, so they can be passed around. Track in event handlers: rendering never tracks, and there is no hook that tracks on mount. In React Native, track screen views from React Navigation's or Expo Router's state listeners.

## useTraceStatus

```ts
import { useTraceStatus } from "@priemskiyyy/trace-react";

const status = useTraceStatus(); // { state: "idle" | "started" | "disposed" }
```

## useDestinationStatus

```ts
import { useDestinationStatus } from "@priemskiyyy/trace-react";

const destination = useDestinationStatus("console");

if (destination.state === "failed") {
  console.warn("The console destination did not open", destination.error);
}
```

One destination's status: `idle`, `ready`, `failed` or `disposed`. `ready` means locally usable, not that a network is reachable. A name the Trace was not built with throws the core's `TraceError` `INVALID_CONFIGURATION` while rendering; once the Trace is registered, the types refuse such a name.

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

The decision for each purpose the `consent` option names: `unknown`, `granted` or `denied`. Decisions are set with `trace.consent.set`, and the hook rerenders with each one.

The three hooks observe only. Rendering them opens no destination and tracks nothing. Each accepts an optional callback that is told about every change after the render it follows, even one made before its listener attached; it always sees the latest callback, and it gets a listener of its own, so a callback that throws cannot disturb what React renders. On the server and during the hydrating render the statuses read `idle` and every purpose reads `unknown`, so server and client markup match even when the client has already started the Trace or restored consent.

## Tests

The tests render real React with Testing Library in jsdom, over a real Trace and the core's mock adapter. They spy on the Trace to prove that mounting and unmounting call nothing but the subscriptions the hooks ask for, count live listeners to prove that Strict Mode, a remount and an unmount leave none behind, tell a callback exactly once about a change made before its listener attached, Strict Mode included, render on the server and hydrate to prove that doing so is inert and mismatch free, and render a component that calls `useTrace` to prove it dispatches no event. A typecheck-only contracts file pins the unregistered types; the registered path is not checked inside the package, because a module augmentation there would retype every test. Nothing here runs in a browser or on a device.

## License

[MIT](LICENSE)
