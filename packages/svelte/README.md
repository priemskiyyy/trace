# @priemskiyyy/trace-svelte

Svelte bindings for [Trace](../core): a provider, `useTrace`, and three utilities that observe the Trace's status, one destination's status and consent. They are deliberately thin. Events are tracked with `trace.current.track`, and the bindings never start, dispose or track anything.

Works in Svelte 5.7 or newer. The package ships Svelte sources, so it is compiled by your application's own Svelte.

## Installation

```sh
pnpm add @priemskiyyy/trace @priemskiyyy/trace-svelte
```

## Set it up

Create and start the Trace outside Svelte, as early as your application allows, register it, then publish it:

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

The console destination needs the `analytics` purpose, so it receives events once the visitor grants it, as the banner under [useConsent](#useconsent) does.

## TraceProvider

<!-- snippet: fragment -->

```svelte
<TraceProvider {trace}><Application /></TraceProvider>
```

Publishes one Trace to the components below, and does nothing else. The Trace owns its own lifetime. Mounting the provider opens no destination and unmounting it disposes nothing, so a remount or a hot update can never close the SDKs your application initialized.

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

Returns the nearest provider's Trace through `current`, which follows a provider given another Trace, and throws a `TraceError` with the code `INVALID_CONFIGURATION`, `Trace utilities must be used within a TraceProvider.`, when there is none. Svelte appends the component stack to that message in development. Track in event handlers: rendering never tracks, and there is no utility that tracks on mount.

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

One destination's status: `idle`, `ready`, `failed` or `disposed`. `ready` means locally usable, not that a network is reachable. The name may be a string or a getter, and a name that changes is followed; a name that recomputes to the same destination keeps its listeners. A name the Trace was not built with throws the core's `TraceError` `INVALID_CONFIGURATION` while the component is created; once the Trace is registered, the types refuse such a name.

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

The decision for each purpose the `consent` option names: `unknown`, `granted` or `denied`. Decisions are set with `trace.current.consent.set`, and `current` follows each one.

The three utilities observe only, and `current` holds the Trace's own objects, read and never written. Using them opens no destination and tracks nothing. Each accepts an optional callback that is told about every change after its component mounts, even one made between creating the component and mounting it, and it gets a listener of its own, so a callback that throws cannot disturb what Svelte renders. On the server and until the component is mounted the statuses read `idle` and every purpose reads `unknown`, so server markup and the hydrating render match even when the client has already started the Trace or restored consent.

## Tests

The tests render real Svelte components with Svelte Testing Library in jsdom, over a real Trace and the core's mock adapter, and call the internal observer inside `$effect.root`. They spy on the Trace to prove that mounting and unmounting call nothing but the subscriptions the utilities ask for, count live listeners to prove that a remount, a replaced Trace, a renamed destination, a rerender and an unmount leave none behind or repeated, tell a callback exactly once about a change made before its listener attached, render on the server to prove that doing so is inert, callbacks included, hydrate the markup the server test pins to prove there is no mismatch and that no callback hears of the state the client already had, and render a component that calls `useTrace` to prove it dispatches no event. A typecheck-only contracts file pins the unregistered types; the registered path is not checked inside the package, because a module augmentation there would retype every test. Nothing here runs in a browser.

## License

[MIT](LICENSE)
