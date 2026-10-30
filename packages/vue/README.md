# @priemskiyyy/trace-vue

Vue bindings for [Trace](../core): a provider, `useTrace`, and three composables that observe the Trace's status, one destination's status and consent. They are deliberately thin. Events are tracked with `trace.value.track`, and the bindings never start, dispose or track anything.

Version 0.1.0 is an initial preview. APIs may change before 1.0. See the [verification limits](https://github.com/priemskiyyy/trace/blob/main/docs/verification.md) before adopting an adapter.

Works in Vue 3.5 or newer.

## Installation

```sh
pnpm add @priemskiyyy/trace @priemskiyyy/trace-vue
```

## Set it up

Create and start the Trace outside Vue, as early as your application allows, register it, then publish it:

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

declare module "@priemskiyyy/trace-vue" {
  interface Register {
    trace: typeof trace;
  }
}

trace.start();
```

```vue
<script setup lang="ts">
import { TraceProvider } from "@priemskiyyy/trace-vue";
import { trace } from "./trace";
</script>

<template>
  <TraceProvider :trace="trace">
    <Application />
  </TraceProvider>
</template>
```

The `Register` augmentation types every composable with this Trace: its events, its destination names and its purposes. Without it, the provider takes only an untyped Trace and refuses one that declares its events.

The console destination needs the `analytics` purpose, so it receives events once the visitor grants it, as the banner under [useConsent](#useconsent) does.

## TraceProvider

<!-- snippet: fragment -->

```vue
<TraceProvider :trace="trace"><Application /></TraceProvider>
```

Publishes one Trace to the components below, and does nothing else. The Trace owns its own lifetime. Mounting the provider opens no destination and unmounting it disposes nothing, so a remount or a hot update can never close the SDKs your application initialized. The `trace` prop is required, and Vue warns in development when it is missing.

## useTrace

```ts
import { useTrace } from "@priemskiyyy/trace-vue";

const trace = useTrace(); // a computed ref of the provider's Trace

const handleCheckoutClick = (cart: { id: string }) => {
  trace.value.track("Checkout Started", { cart: { id: cart.id } });
};
```

Returns a computed ref of the nearest provider's Trace, which follows a provider given another Trace, and throws a `TraceError` with the code `INVALID_CONFIGURATION`, `Trace composables must be used within a TraceProvider.`, when there is none. Call it in `setup`, like any injection. Track in event handlers: rendering never tracks, and there is no composable that tracks on mount.

## useTraceStatus

```ts
import { useTraceStatus } from "@priemskiyyy/trace-vue";

const status = useTraceStatus(); // status.value.state: "idle" | "started" | "disposed"
```

## useDestinationStatus

```ts
import { useDestinationStatus } from "@priemskiyyy/trace-vue";
import { watch } from "vue";

const destination = useDestinationStatus("console");

watch(destination, (status) => {
  if (status.state === "failed") {
    console.warn("The console destination did not open", status.error);
  }
});
```

One destination's status: `idle`, `ready`, `failed` or `disposed`. `ready` means locally usable, not that a network is reachable. The name may be a string, a ref or a getter, and a name that changes is followed. A name the Trace was not built with throws the core's `TraceError` `INVALID_CONFIGURATION` in `setup`; once the Trace is registered, the types refuse such a name.

## useConsent

```vue
<script setup lang="ts">
import { useConsent, useTrace } from "@priemskiyyy/trace-vue";

const trace = useTrace();
const consent = useConsent();

const handleAcceptClick = () => {
  trace.value.consent.set({ analytics: "granted" });
};

const handleDeclineClick = () => {
  trace.value.consent.set({ analytics: "denied" });
};
</script>

<template>
  <p v-if="consent.analytics === 'unknown'">
    May we measure how the shop is used?
    <button type="button" @click="handleAcceptClick">Accept</button>
    <button type="button" @click="handleDeclineClick">Decline</button>
  </p>
</template>
```

The decision for each purpose the `consent` option names: `unknown`, `granted` or `denied`. Decisions are set with `trace.value.consent.set`, and the ref follows each one.

The three composables observe only, and return read-only refs that keep the Trace's own objects. Using them opens no destination and tracks nothing. Each accepts an optional callback that is told about every change after its component mounts, even one made between `setup` and the mount, and it gets a listener of its own, so a callback that throws cannot disturb what Vue renders. On the server and until the component is mounted the statuses read `idle` and every purpose reads `unknown`, so server and client markup match even when the client has already started the Trace or restored consent.

## Tests

The tests mount real Vue components with Vue Test Utils in jsdom, over a real Trace and the core's mock adapter. They spy on the Trace to prove that mounting and unmounting call nothing but the subscriptions the composables ask for, count live listeners to prove that a remount, a replaced Trace, a renamed destination and an unmount leave none behind, tell a callback exactly once about a change made before its listener attached, render on the server to prove that doing so is inert, callbacks included, hydrate server markup to prove there is no mismatch and that no callback hears of the state the client already had, and mount a component that calls `useTrace` to prove it dispatches no event. A typecheck-only contracts file pins the unregistered types; the registered path is not checked inside the package, because a module augmentation there would retype every test. Nothing here runs in a browser.

## License

[MIT](LICENSE)
