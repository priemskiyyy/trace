---
description: "Declare every event once in a typed registry, with a type argument or a Standard Schema validator such as Zod, and see what happens to an event its declaration refuses."
---

# Events and schemas

Every event is declared once, in a plain object whose keys are the event names. `track` accepts only those names, each with the properties its declaration gives it.

```ts
import { event, Trace } from "@priemskiyyy/trace";
import { console } from "@priemskiyyy/trace-console";
import { z } from "zod";

export const events = {
  "App Opened": event(),
  "Checkout Started": event(
    z.object({
      cart: z.object({ id: z.string() }),
      value: z.number().nonnegative(),
      currency: z.enum(["EUR", "USD"]),
    }),
  ),
  "Search Performed": event<{ query: string }>(),
};

const trace = new Trace({ events, destinations: { console: console() } });

trace.start();
trace.track("App Opened");
trace.track("Search Performed", { query: "shoes" });
trace.track("Checkout Started", {
  cart: { id: "cart_1" },
  value: 49.5,
  currency: "EUR",
});
```

## Three ways to declare an event

| Declaration            | `track` takes           | Checked when it is tracked                                                              |
| ---------------------- | ----------------------- | --------------------------------------------------------------------------------------- |
| `event()`              | no properties           | that nothing, or a plain object, was given                                              |
| `event<TProperties>()` | `TProperties`           | the same: that nothing, or a plain object, was given                                    |
| `event(schema)`        | the schema's input type | the schema validates them, synchronously, and its output is what every destination gets |

A type argument costs nothing at runtime and types every call site. A schema also refuses what TypeScript cannot see: data from outside, a value out of range, a string that is not one of a list. Use either per event, and mix them in one registry.

## Names

The key is the name, and a name is any non-empty string. `"Checkout Started"` and `"checkout_started"` are both fine: choose the convention your dashboards should show. Providers receive the name unchanged. The exception is Google Analytics and Firebase, whose adapters take a map from each of your events to a GA4 event, because GA4 has recommended names of its own. See [Google Analytics and Firebase](adapters/google-analytics.md).

A name a provider refuses or keeps for itself is never renamed on the quiet: its adapter reports it on the receipt, as a loss or as an event it skipped. See [receipts and evidence](receipts.md#losses).

## Validating with a schema

`event(schema)` takes any validator that implements [Standard Schema](https://standardschema.dev), such as Zod, Valibot or ArkType. The core depends on none of them. The schema runs when the event is tracked, and an event it refuses is dropped at once as `invalid`, with the issues:

```ts
const receipt = trace.track("Checkout Started", {
  cart: { id: "cart_1" },
  value: -5,
  currency: "EUR",
});

receipt.status.get();
// { state: "dropped", reason: "invalid", issues: [{ path: "value", message: "Too small: expected number to be >=0" }] }
```

Each issue has a dotted `path`, empty for the properties as a whole, and the schema's own `message`. A refused event reaches no destination, no `trace.events` listener and no buffer.

- **It must answer synchronously.** `track` is synchronous, so a schema that answers with a promise, such as a Zod schema with an async refinement, drops the event as `invalid`.
- **Its output is what Trace keeps.** A default or a transform applies before anything else, and destinations, the `events` stream and a `defaults.to` function all see the output. Trace then sanitizes the output and never runs the schema again, because sanitizing turns a `Date` into a string and a schema's output is not always valid input.
- **It cannot take your application down.** A schema that throws drops the event as `invalid`, and so does one whose output is not a plain object.

Validation runs after consent. An event that every destination it could reach refuses by consent is dropped as `consent` before its schema runs, so a validator never sees data that goes nowhere.

## Names Trace does not know

A name the registry does not declare needs JavaScript or a cast to get past TypeScript. Such an event is dropped as `invalid`, with the issue `Trace has no event named "..."`, and a name that is not a string at all is dropped the same way.

## Types from the registry

```ts
import type { EventName, TrackedEventOf } from "@priemskiyyy/trace";

type Boutique = typeof events;

const featured: EventName<Boutique>[] = ["App Opened", "Search Performed"];

const handleEvent = (event: TrackedEventOf<Boutique>) => {
  if (event.name === "Checkout Started") {
    console.log(featured, event.properties.cart.id);
  }
};

trace.events.subscribe(handleEvent);
```

| Type                                                   | What it is                                                                                                      |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `EventName<typeof events>`                             | The declared names.                                                                                             |
| `EventProperties<(typeof events)["Checkout Started"]>` | The properties one event carries once parsed: its schema's output, or its type argument.                        |
| `TrackedEventOf<typeof events>`                        | The union of accepted events, discriminated by `name`, as `trace.events` and a `defaults.to` function see them. |

## From an Ampli tracking plan

If Amplitude's Ampli generates your tracking plan, `fromAmpli` from `@priemskiyyy/trace-ampli` builds the registry from the generated classes. The canonical names, the required and optional properties and the constants a generated constructor injects all come from the generated code and are never declared twice. See [Amplitude and Ampli](adapters/amplitude.md).
