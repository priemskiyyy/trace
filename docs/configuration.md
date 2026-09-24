---
description: "Every option a Trace takes, with its default and unit, and what the constructor refuses."
---

# Configuration

Everything is set when the Trace is constructed, and durations are in milliseconds everywhere.

```ts
import { isSensitiveKey, Trace } from "@priemskiyyy/trace";
import { console } from "@priemskiyyy/trace-console";
import { http } from "@priemskiyyy/trace-http";
import { posthog } from "@priemskiyyy/trace-posthog";
import posthogJs from "posthog-js";
import { z } from "zod";

export const trace = new Trace({
  events,
  destinations: {
    research: posthog({ sdk: posthogJs }),
    backend: http({ request: sendEvent }),
    console: console(),
  },
  schema: {
    traits: { plan: z.enum(["free", "pro"]), seats: z.number() },
    groups: { workspace: { plan: z.string() } },
  },
  defaults: {
    to: ({ name }) =>
      name === "Checkout Started" ? ["research", "backend"] : ["research"],
    context: { app: { version: "2.4.0" } },
  },
  consent: { research: ["analytics"] },
  privacy: {
    redact: (key) => isSensitiveKey(key) || key === "iban",
    limits: { depth: 4 },
  },
  buffer: { capacity: 200, maxAge: 60_000 },
  timeout: 3_000,
});
```

| Option             | Default                                                              | Meaning                                                                                                                                                 |
| ------------------ | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `events`           | required                                                             | The registry: event names as keys, each declared with `event()`, `event<TProperties>()` or `event(schema)`. See [events and schemas](events.md).        |
| `destinations`     | required                                                             | Adapters by destination name. The names type `to`, `consent`, receipts and `destination(name)`.                                                         |
| `schema.traits`    | none                                                                 | A Standard Schema validator for each user trait. It types `user()` and `traits()`, and refuses a key it does not declare. See [users](users.md#traits). |
| `schema.groups`    | none                                                                 | For each group type, a validator for each group trait. It types `group()`, and refuses a type it does not declare. See [groups](groups.md).             |
| `defaults.to`      | every destination                                                    | Where an event goes unless its own `to` says otherwise: a list of names, or a function of the finished event. See [routing](routing.md).                |
| `defaults.context` | none                                                                 | Context every event carries, across user changes. See [context and scopes](context-and-scopes.md).                                                      |
| `consent`          | none                                                                 | The purposes each destination needs, by destination name. A destination the option does not name is never gated. See [consent](consent.md).             |
| `privacy.redact`   | `isSensitiveKey`                                                     | `(key, path) => boolean`: a key it names is removed wherever it appears. See [privacy and redaction](privacy.md).                                       |
| `privacy.limits`   | `depth: 6`, `breadth: 50`, `stringLength: 2000`, `totalSize: 200000` | Bounds on properties, context, traits and group traits. See [bounds](privacy.md#bounds).                                                                |
| `buffer.capacity`  | 100                                                                  | Events each destination holds until it is ready. Past it, the oldest is dropped as `buffer-overflow`.                                                   |
| `buffer.maxAge`    | 30000                                                                | How long an event may wait there before it is dropped as `buffer-expired`.                                                                              |
| `timeout`          | 5000                                                                 | How long one provider call may take. An event past it is `indeterminate`, and an identity step past it has failed.                                      |
| `now`              | `Date.now`                                                           | The clock, for tests. One that throws or answers no finite number gives way to `Date.now` for that reading.                                             |

`trace.flush({ timeout })` waits 2000 ms unless told otherwise. See [flush](flush.md).

## What the constructor refuses

A Trace that cannot work throws a `TraceError` with the code `INVALID_CONFIGURATION` from its constructor, so you find the mistake at startup. The message names the option, or says that the options could not be read.

- `events` that is not a plain object, or that declares an event under the empty name.
- `destinations` that is not an object or is a list, or a destination that is not an adapter: an object with a `name` string and an `open` function.
- `consent` that is not an object, that names a destination you never configured, or whose entry for a destination is not that destination's own list of purpose strings.
- `defaults.to` that is neither a list nor a function, or a list that names a destination you never configured.
- A `redact` that is not a function.
- A count that is not a whole number of 0 or more: `buffer.capacity` and every entry of `privacy.limits`.
- A duration that is not a whole number from 0 to 2147483647 ms, the longest delay a timer can hold: `buffer.maxAge` and `timeout`.
- `schema`, `schema.traits`, `schema.groups` or the validators of one group type, present and not an object, `null` included.
- `defaults.context` that is not an object, that `redact` throws on, or that holds a value the sanitizer refuses, such as a function or `NaN`.
- Options that cannot be read at all, such as a getter that throws.

When the failure came from your own code, a `redact` that threw on `defaults.context` or a getter that threw, the error keeps it as its `cause`.

An option set to `undefined` keeps its default. Every option is read once, so changing an object after you passed it changes nothing. Constructing a Trace opens nothing, starts no timer and registers no listener, so it is safe at module scope and on a server.
