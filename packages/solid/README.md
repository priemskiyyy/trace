# @priemskiyyy/trace-solid

Solid bindings for [Trace](../core): a provider, `useTrace`, and three primitives that observe the Trace's status, one destination's status and consent. They are deliberately thin. Events are tracked with `trace().track`, and the bindings never start, dispose or track anything.

Version 0.1.0 is an initial preview. APIs may change before 1.0. See the [verification limits](https://github.com/priemskiyyy/trace/blob/main/docs/verification.md) before adopting an adapter.

Works in Solid 1.9 or newer.

## Installation

```sh
pnpm add @priemskiyyy/trace @priemskiyyy/trace-solid
```

## Set it up

Create and start the Trace outside Solid, as early as your application allows, register it, then publish it:

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
import { TraceProvider } from "@priemskiyyy/trace-solid";

export const Root = () => (
  <TraceProvider trace={trace}>
    <Application />
  </TraceProvider>
);
```

The `Register` augmentation types every primitive with this Trace: its events, its destination names and its purposes. Without it, the provider takes only an untyped Trace and refuses one that declares its events.

The console destination needs the `analytics` purpose, so it receives events once the visitor grants it, as the banner under [useConsent](#useconsent) does.

## TraceProvider

<!-- snippet: fragment -->

```tsx
<TraceProvider trace={trace}>{props.children}</TraceProvider>
```

Publishes one Trace to the tree below, and does nothing else. The Trace owns its own lifetime. Mounting the provider opens no destination and unmounting it disposes nothing, so a remount or a hot update can never close the SDKs your application initialized.

## useTrace

```tsx
import { useTrace } from "@priemskiyyy/trace-solid";

export const CheckoutButton = (props: { cart: { id: string } }) => {
  const trace = useTrace();

  const handleCheckoutClick = () => {
    trace().track("Checkout Started", { cart: { id: props.cart.id } });
  };

  return <button onClick={handleCheckoutClick}>Check out</button>;
};
```

Returns an accessor of the nearest provider's Trace, which follows a provider given another Trace, and throws a `TraceError` with the code `INVALID_CONFIGURATION`, `Trace primitives must be used within a TraceProvider.`, when there is none. Track in event handlers: rendering never tracks, and there is no primitive that tracks on mount.

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

One destination's status: `idle`, `ready`, `failed` or `disposed`. `ready` means locally usable, not that a network is reachable. The name may be a string or an accessor, and a name that changes is followed; a name that recomputes to the same destination keeps its listeners. A name the Trace was not built with throws the core's `TraceError` `INVALID_CONFIGURATION` while the component is created; once the Trace is registered, the types refuse such a name.

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

The decision for each purpose the `consent` option names: `unknown`, `granted` or `denied`. Decisions are set with `trace().consent.set`, and the accessor follows each one.

The three primitives observe only, and their accessors return the Trace's own objects. Using them opens no destination and tracks nothing. Each accepts an optional callback that is told about every change after its component mounts, even one made between creating the component and mounting it, and it gets a listener of its own, so a callback that throws cannot disturb what Solid renders. On the server and until the component is mounted the statuses read `idle` and every purpose reads `unknown`: Solid claims server markup as it is while hydrating, so a different first value would stay on screen until the next change.

## Tests

The tests render real Solid components with Solid Testing Library in jsdom, over a real Trace and the core's mock adapter. They spy on the Trace to prove that mounting and unmounting call nothing but the subscriptions the primitives ask for, count live listeners to prove that a remount, a replaced Trace, a renamed destination and an unmount leave none behind, tell a callback exactly once about a change made before its listener attached, render on the server to prove that doing so is inert, callbacks included, hydrate the markup the server test pins, in a project that compiles Solid's hydratable output, to prove there is no mismatch, that the server's node is kept and that no callback hears of the state the client already had, and render a component that calls `useTrace` to prove it dispatches no event. A typecheck-only contracts file pins the unregistered types; the registered path is not checked inside the package, because a module augmentation there would retype every test. Nothing here runs in a browser.

## License

[MIT](LICENSE)
