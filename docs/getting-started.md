---
description: "Track your first event with Trace, say who the user is, send events to PostHog behind a consent purpose, read a receipt, and mount the React bindings."
---

# Getting started

## Track to the console

Install the core and the console destination:

```sh
pnpm add @priemskiyyy/trace @priemskiyyy/trace-console
```

Declare your events, create one Trace for the application, start it, and track:

```ts
import { event, Trace } from "@priemskiyyy/trace";
import { console } from "@priemskiyyy/trace-console";

export const trace = new Trace({
  events: {
    "App Opened": event(),
    "Search Performed": event<{ query: string }>(),
  },
  destinations: { console: console() },
});

trace.start();
trace.track("Search Performed", { query: "shoes" });
// [trace] track "Search Performed" ["query"] { id, name, properties, context, identity, timestamp }
```

The keys of `events` are the event names, and each declaration types the properties its event takes, so `trace.track("Search Performed")` without a query does not compile. Creating a Trace is cheap and opens nothing, so it is safe at module scope and on a server. `start()` opens the destinations. An event tracked before `start()` waits for its destination in a small buffer.

## Say who and where

```ts
trace.user({ id: "user_42", traits: { plan: "pro" } });
trace.group("workspace", { id: "workspace_1", traits: { seats: 12 } });
trace.context({ screen: "search" });

trace.track("Search Performed", { query: "boots" });
```

The user, the traits and the group membership say who is tracking. Every later event carries them, and Trace tells each provider through the provider's own identify, profile and group calls. The context says where, and every later event carries it too. Signing out is `trace.user(null)`: it starts a clean identity, so nothing of the previous user reaches the next one. See [users and account switching](users.md), [groups](groups.md) and [context and scopes](context-and-scopes.md).

## Send it to a provider

Add a destination over the SDK your application already initializes. This one sends events to PostHog once the visitor consents:

```sh
pnpm add @priemskiyyy/trace-posthog posthog-js
```

```ts
import { event, Trace } from "@priemskiyyy/trace";
import { console } from "@priemskiyyy/trace-console";
import { posthog } from "@priemskiyyy/trace-posthog";
import posthogJs from "posthog-js";

posthogJs.init("phc_project_api_key", {
  api_host: "https://eu.i.posthog.com",
  opt_out_capturing_by_default: true,
});

export const trace = new Trace({
  events: {
    "App Opened": event(),
    "Search Performed": event<{ query: string }>(),
  },
  destinations: {
    research: posthog({ sdk: posthogJs }),
    console: console(),
  },
  consent: { research: ["analytics"] },
});

trace.start();
```

You pass the SDK in, initialized and configured the way you want it. Trace never initializes or closes it, and no adapter imports its provider's SDK, so a browser bundle never pulls in a server or React Native SDK. See [choose an adapter](adapters.md).

The `consent` option gates `research` behind the `analytics` purpose, which starts `unknown`. Until the visitor grants it, events are dropped for PostHog at once rather than buffered, while the console, which the option does not name, keeps receiving them. PostHog is initialized opted out because it can collect on its own before Trace starts. When the visitor answers your banner:

```ts
trace.consent.set({ analytics: "granted" });
```

Trace opts PostHog in, and the events tracked from then on reach it. Trace keeps no decision across page loads: store the answer yourself and set it again before `trace.start()` on the next visit. See [consent](consent.md).

## Know what happened

`track()` is synchronous and never throws. Most code ignores what it returns. When you need to know, the receipt tells you:

```ts
const receipt = trace.track("Search Performed", { query: "shoes" });
const status = await receipt.settled;

if (
  status.state === "settled" &&
  status.outcomes.research?.status === "failed"
) {
  showOfflineBanner();
}
```

See [tracking and receipts](tracking.md) and [receipts and evidence](receipts.md).

## In React

```sh
pnpm add @priemskiyyy/trace-react
```

```tsx
import { TraceProvider, useTrace } from "@priemskiyyy/trace-react";

declare module "@priemskiyyy/trace-react" {
  interface Register {
    trace: typeof trace;
  }
}

const SearchButton = ({ query }: { query: string }) => {
  const trace = useTrace();

  const handleSearchPress = () => {
    trace.track("Search Performed", { query });
  };

  return <button onClick={handleSearchPress}>Search</button>;
};

export const Root = () => (
  <TraceProvider trace={trace}>
    <SearchButton query="shoes" />
  </TraceProvider>
);
```

`trace` is the Trace you created above. The `Register` block types every hook with it, so `useTrace().track` knows your events. The provider only publishes the Trace: mounting it opens nothing and unmounting it disposes nothing, so `trace.start()` stays where you created the Trace. Track in event handlers, never while rendering. See [React](react.md) and [React Native and Expo](react-native.md). The same provider and hooks exist for [Vue](vue.md), [Solid](solid.md) and [Svelte](svelte.md).
