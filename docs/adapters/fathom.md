---
description: "Fathom events: a name and, optionally, a value in whole cents from a function you write. Every property is a loss, and there is no identity at all."
---

# Fathom

```sh
pnpm add @priemskiyyy/trace @priemskiyyy/trace-fathom fathom-client
```

```ts
import { event, Trace } from "@priemskiyyy/trace";
import { fathom } from "@priemskiyyy/trace-fathom";
import * as Fathom from "fathom-client";

Fathom.load("YOUR_SITE_ID");

const trace = new Trace({
  events: {
    "Signup Completed": event(),
    "Order Completed": event<{ order_id: string; total: number }>(),
  },
  destinations: {
    site: fathom({
      sdk: Fathom,
      value: ({ name, properties }) =>
        name === "Order Completed" && typeof properties.total === "number"
          ? Math.round(properties.total * 100)
          : null,
    }),
  },
});

trace.start();
trace.track("Order Completed", { order_id: "order_1", total: 49.5 });
```

| Option  | Default  | Meaning                                                                                                          |
| ------- | -------- | ---------------------------------------------------------------------------------------------------------------- |
| `sdk`   | required | `fathom-client`, or an object holding its `trackEvent`.                                                          |
| `value` | none     | `(event) => number \| null`: the event's value in whole cents, or `null` for none. Any other number is left out. |

## How events are mapped

Each event is one `trackEvent(name, { _value })` call, or `trackEvent(name)` with no value. Fathom keeps only a name and that optional value: every property and every context key is an `unsupported` loss. A value `value()` answers that is not a whole number of cents JavaScript holds exactly is left out and never rounded, with `{ path: "value", reason: "invalid" }`; round inside `value` yourself, as the example does. Neither an id nor a timestamp is sent: Fathom has no deduplication and stamps the event when its request arrives.

## Identity

There is none. The session has no `identify`, `traits`, `group` or `reset`, so no user, trait or group ever reaches Fathom, and none is ever folded into an event's name or value, which would breach Fathom's terms.

## Consent

Fathom's only switches, `blockTrackingForMe` and `enableTrackingForMe`, are for excluding your own visits, and enabling tracking on consent would clear a site owner's own exclusion, so Trace never calls them: this session has no `collection`. Trace's own gating still holds. Call `Fathom.load` only once consent is granted, or load with `auto: false` and track page views yourself.

## Behavior

- Evidence is `sdk-call-returned`: `trackEvent` answers nothing, and `fathom-client` queues events until Fathom's script has loaded.
- No flush; Fathom's script sends each event on its own.
- `native` is the `sdk` you passed in, for anything Trace does not wrap, such as `trackPageview`.

See [provider limitations](../provider-limitations.md) for every documented limit, and [choose an adapter](../adapters.md) for how Fathom compares to the rest.
