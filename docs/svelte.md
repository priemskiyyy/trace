---
description: "Use Trace in Svelte 5: publish it with a provider, track in handlers with useTrace, and read status and consent with utilities that start nothing."
---

# Svelte

`@priemskiyyy/trace-svelte` is a provider, `useTrace`, and three utilities that observe the Trace's status, one destination's status and consent, for Svelte 5.7 or newer. It ships Svelte sources, so your application's own Svelte compiles it. It is deliberately thin: tracking is `trace.current.track`, which needs no utility.

```sh
pnpm add @priemskiyyy/trace @priemskiyyy/trace-svelte
```

## Set it up

Create and start the Trace outside Svelte, register it, then publish it:

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

declare module "@priemskiyyy/trace-svelte" {
  interface Register {
    trace: typeof trace;
  }
}

trace.start();
```

```svelte
<script lang="ts">
  import { TraceProvider } from "@priemskiyyy/trace-svelte";
  import { trace } from "./trace";
</script>

<TraceProvider {trace}>
  <Application />
</TraceProvider>
```

The `Register` augmentation types every utility with this Trace: its events, its destination names and its purposes. Without it, the provider takes only an untyped Trace and refuses one that declares its events.

## TraceProvider

Publishes one Trace to the components below, and does nothing else. The Trace owns its own lifetime: mounting the provider opens no destination, and unmounting it disposes nothing, so a remount or a hot update can never close the SDKs your application initialized.

## useTrace

Call the utilities while a component is being created, like any Svelte context reader:

```svelte
<script lang="ts">
  import { useTrace } from "@priemskiyyy/trace-svelte";

  const props: { cart: { id: string } } = $props();
  const trace = useTrace();

  const handleCheckoutClick = () => {
    trace.current.track("Checkout Started", { cart: { id: props.cart.id } });
  };
</script>

<button type="button" onclick={handleCheckoutClick}>Check out</button>
```

Returns the nearest provider's Trace through `current`, and throws `TraceError` `INVALID_CONFIGURATION` when there is none, with the component stack Svelte appends in development. Track in event handlers: rendering never tracks, and there is no utility that tracks on mount. See [where to track](tracking.md#where-to-track).

## useTraceStatus

```ts
import { useTraceStatus } from "@priemskiyyy/trace-svelte";

const status = useTraceStatus(); // status.current.state: "idle" | "started" | "disposed"
```

## useDestinationStatus

```svelte
<script lang="ts">
  import { useDestinationStatus } from "@priemskiyyy/trace-svelte";

  const destination = useDestinationStatus("console");
</script>

{#if destination.current.state === "failed"}
  <p>The console destination did not open.</p>
{/if}
```

One destination's status: `idle`, `ready`, `failed` or `disposed`. `ready` means locally usable, not that a network is reachable. The name may be a string or a getter, and a name that changes is followed; one that recomputes to the same destination keeps its listeners. A name the Trace was not built with throws `TraceError` `INVALID_CONFIGURATION` while the component is created; once the Trace is registered, the types refuse such a name.

## useConsent

```svelte
<script lang="ts">
  import { useConsent, useTrace } from "@priemskiyyy/trace-svelte";

  const trace = useTrace();
  const consent = useConsent();

  const handleAcceptClick = () => {
    trace.current.consent.set({ analytics: "granted" });
  };

  const handleDeclineClick = () => {
    trace.current.consent.set({ analytics: "denied" });
  };
</script>

{#if consent.current.analytics === "unknown"}
  <p>
    May we measure how the shop is used?
    <button type="button" onclick={handleAcceptClick}>Accept</button>
    <button type="button" onclick={handleDeclineClick}>Decline</button>
  </p>
{/if}
```

The decision for each purpose the `consent` option names: `unknown`, `granted` or `denied`. Decisions are set with `trace.current.consent.set`, and `current` follows each one. See [consent](consent.md).

The three utilities observe only, and `current` holds the Trace's own objects, read and never written. Using one opens no destination and tracks nothing. Each accepts an optional callback told about every change after its component mounts, even one made between creating the component and mounting it, and it gets a listener of its own, so a callback that throws cannot disturb what Svelte renders. On the server and until the component mounts, the statuses read `idle` and every purpose reads `unknown`, so server markup and the hydrating render match even when the client has already started the Trace or restored consent. See [server rendering](server-rendering.md).

The [package README](https://github.com/priemskiyyy/trace/tree/main/packages/svelte#readme) is the full reference. For the inspector, see [devtools](devtools.md).
