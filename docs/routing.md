---
description: "Send an event to one destination, to several, or decide per event, and see what happens when routing itself fails or consent closes a destination."
---

# Routing

Destinations have names. The names are typed, so routing to a destination that does not exist is a compile error.

```ts
import { Trace } from "@priemskiyyy/trace";
import { console } from "@priemskiyyy/trace-console";
import { http } from "@priemskiyyy/trace-http";
import { posthog } from "@priemskiyyy/trace-posthog";
import posthogJs from "posthog-js";

const trace = new Trace({
  events,
  destinations: {
    research: posthog({ sdk: posthogJs }),
    backend: http({ request: sendEvent }),
    console: console(),
  },
  defaults: { to: ["research", "backend"] },
});
```

## Choosing destinations

**`defaults.to`** says where an event goes unless the event says otherwise. Without it, an event goes to every destination. A list that names a destination you never configured throws a `TraceError` with the code `INVALID_CONFIGURATION` from the constructor.

**`to`** on one event replaces `defaults.to` for that event. It never merges with it:

```ts
trace.track("App Opened", undefined, { to: ["console"] });
```

**`defaults.to`** can also be a function that decides per event. It receives the finished, frozen event, its properties validated and sanitized, and returns names:

```ts
import { Trace } from "@priemskiyyy/trace";
import { console } from "@priemskiyyy/trace-console";
import { http } from "@priemskiyyy/trace-http";

const trace = new Trace({
  events,
  destinations: {
    backend: http({ request: sendEvent }),
    console: console(),
  },
  defaults: {
    to: (event) => {
      if (event.name === "Checkout Started" && event.properties.value >= 100) {
        return ["backend", "console"];
      }

      return ["console"];
    },
  },
});
```

An event's own `to` wins over the function too, and the function is not called for it. Returning an empty list drops the event as `not-routed`, which is how you filter an event out entirely.

An event's `to` is not checked against `defaults.to`: it replaces it. Keep what must never reach a destination out of the event with [redaction](privacy.md), which runs before any destination sees the event, however it was chosen.

## Routing fails closed

A broken rule must never widen the audience. The event is dropped as `not-routed`, and sent nowhere else, when:

- a `defaults.to` function throws, or answers something that is not a list;
- an event's `to` is not a list, other than `null`, which counts as absent;
- the route names no destination this Trace has.

A name in an event's `to` that no destination has, which TypeScript already refuses, is ignored, and the rest of the list still counts. A destination named twice receives the event once.

## Routing and consent

Routing chooses, and consent closes. Destinations that consent closes are left out of the route, and an event whose whole route is closed is dropped as `consent`, not as `not-routed`. When every destination the event could reach is closed, it is dropped before it is validated, sanitized or kept. A `defaults.to` function is only asked once the event exists, so until then every destination counts as one it could reach. See [consent](consent.md).

## Fan-out is independent

Each destination gets the same frozen event and gives its own outcome. A destination that is slow, down or throwing does not delay or affect the others. A destination that does not answer within `timeout`, 5000 ms by default, settles as `indeterminate` with the reason `timeout`, because the event may or may not have arrived. There is no failover: an event one destination failed is not sent to another.

```ts
const receipt = trace.track("Search Performed", { query: "shoes" });
const status = await receipt.settled;

if (status.state === "settled") {
  console.log(
    status.outcomes.research?.status,
    status.outcomes.backend?.status,
  );
}
```

See [receipts and evidence](receipts.md).

## Per environment

Routing is ordinary configuration, so choosing destinations per environment is ordinary code:

```ts
import { Trace } from "@priemskiyyy/trace";
import { console } from "@priemskiyyy/trace-console";
import { http } from "@priemskiyyy/trace-http";

const getDefaultDestinations = (): Array<"backend" | "console"> => {
  if (import.meta.env.PROD) {
    return ["backend"];
  }

  return ["console"];
};

const trace = new Trace({
  events,
  destinations: {
    backend: http({ request: sendEvent }),
    console: console(),
  },
  defaults: { to: getDefaultDestinations() },
});
```
