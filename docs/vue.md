---
description: "Use Trace in Vue: publish it with a provider, track in handlers with useTrace, and read status and consent with composables that start nothing."
---

# Vue

`@priemskiyyy/trace-vue` is a provider, `useTrace`, and three composables that observe the Trace's status, one destination's status and consent, for Vue 3.5 or newer. It is deliberately thin: tracking is `trace.value.track`, which needs no composable.

```sh
pnpm add @priemskiyyy/trace @priemskiyyy/trace-vue
```

## Set it up

Create and start the Trace outside Vue, register it, then publish it:

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

## TraceProvider

Publishes one Trace to the components below, and does nothing else. The Trace owns its own lifetime: mounting the provider opens no destination, and unmounting it disposes nothing, so a remount or a hot update can never close the SDKs your application initialized. The `trace` prop is required, and Vue warns in development when it is missing.

## useTrace

```ts
import { useTrace } from "@priemskiyyy/trace-vue";

const trace = useTrace(); // a computed ref of the provider's Trace

const handleCheckoutClick = (cart: { id: string }) => {
  trace.value.track("Checkout Started", { cart: { id: cart.id } });
};
```

Returns a computed ref of the nearest provider's Trace, and throws `TraceError` `INVALID_CONFIGURATION` when there is none. Call it in `setup`, like any injection. Track in event handlers: rendering never tracks, and there is no composable that tracks on mount. See [where to track](tracking.md#where-to-track).

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

One destination's status: `idle`, `ready`, `failed` or `disposed`. `ready` means locally usable, not that a network is reachable. The name may be a string, a ref or a getter, and a name that changes is followed. A name the Trace was not built with throws `TraceError` `INVALID_CONFIGURATION` in `setup`; once the Trace is registered, the types refuse such a name.

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

The decision for each purpose the `consent` option names: `unknown`, `granted` or `denied`. Decisions are set with `trace.value.consent.set`, and the ref follows each one. See [consent](consent.md).

The three composables observe only, and return read-only refs over the Trace's own objects. Using one opens no destination and tracks nothing. Each accepts an optional callback told about every change after its component mounts, even one made between `setup` and the mount, and it gets a listener of its own, so a callback that throws cannot disturb what Vue renders. On the server and until the component mounts, the statuses read `idle` and every purpose reads `unknown`, so server and client markup match even when the client has already started the Trace or restored consent. See [server rendering](server-rendering.md).

The [package README](https://github.com/priemskiyyy/trace/tree/main/packages/vue#readme) is the full reference. For the inspector, see [devtools](devtools.md).
