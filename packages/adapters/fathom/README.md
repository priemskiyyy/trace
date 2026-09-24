# @priemskiyyy/trace-fathom

Send [Trace](../../core) events to Fathom. You pass in `fathom-client`, which your application loads, so this package imports no SDK. Fathom keeps an event's name and, when it has one, its value in cents, and nothing else: the value comes from a function you give the adapter, and every property is reported as lost.

## Installation

```sh
pnpm add @priemskiyyy/trace @priemskiyyy/trace-fathom fathom-client
```

## Create a Trace

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

## Options

| Option  | Default  | Meaning                                                                                                                                                                                                                                                  |
| ------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sdk`   | required | `fathom-client`, or an object holding its `trackEvent`.                                                                                                                                                                                                  |
| `value` | none     | `(event) => number \| null`: the event's value in whole cents, sent as `_value`, or `null` for an event without one. Any other number is left out, see the limits. It receives the frozen, sanitized event, and a function that throws fails that event. |

## How an event is mapped

Each event is one `trackEvent(name, { _value })` call, or `trackEvent(name)` when there is no value.

| Trace        | Fathom                                                                                                                                        |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`       | the event name, unchanged                                                                                                                     |
| `properties` | not sent, each an `unsupported` loss; `value` can make one of them the event's value                                                          |
| `context`    | not sent, each an `unsupported` loss                                                                                                          |
| `identity`   | never sent: Fathom takes no identifiers, and its terms forbid personal data                                                                   |
| `id`         | not sent: Fathom has no deduplication                                                                                                         |
| `timestamp`  | not sent: Fathom stamps the event when its request arrives, so every submitted outcome carries `{ path: "timestamp", reason: "unsupported" }` |

Losses come in order: the event's properties, then its context, then the timestamp, then the value when it was left out. Keep event names static. Putting ids or emails into a name, to make up for the lost properties, breaches Fathom's terms and multiplies the names in your dashboard.

Fathom's documented limits, and what the adapter does at each:

| Limit         | Fathom                                                        | The adapter                                                                                                   | Source           |
| ------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ---------------- |
| Event name    | no special characters or emoji; no length limit is documented | not checked: the name is sent unchanged                                                                       | [events][events] |
| Event value   | an integer number of cents                                    | leaves out any other value, never rounded, as `{ path: "value", reason: "invalid" }`; the event is still sent | [events][events] |
| Properties    | an event takes none                                           | every property and context key is an `unsupported` loss                                                       | [events][events] |
| Personal data | Fathom's terms forbid tracking it                             | not checked: no identity is sent, and names and values are yours                                              | [terms][terms]   |

[events]: https://usefathom.com/docs/events/overview
[terms]: https://usefathom.com/legal/terms

## Identity

There is none. The session has no `identify`, `traits`, `group` or `reset`, so Trace never sends Fathom a user, a trait or a group, and never moves one into an event's name or value.

## Consent

Fathom's only switch is `blockTrackingForMe` and `enableTrackingForMe`, which Fathom documents for excluding your own visits and keeps in `localStorage`. Trace does not use it, because enabling tracking on consent would clear a site owner's own exclusion, so the session has no `collection`, and a gated destination only stops receiving Trace's events while its purposes are not granted. Fathom's automatic page views run outside Trace's consent. When consent gates Fathom, call `Fathom.load` only once consent is granted, or load with `auto: false` and track page views yourself.

## Behavior

- Platforms and versions: browsers, with `fathom-client` 3.7 or later within 3.x, an optional peer dependency, which loads Fathom's script. It is typed structurally through `FathomLike`.
- Initialization is yours. Trace never calls `load`, `setSite`, `trackPageview`, `trackGoal`, `blockTrackingForMe` or `enableTrackingForMe`. `open` checks nothing: `fathom-client` queues each event until Fathom's script has loaded, and hands the queue to it then.
- Evidence is `sdk-call-returned`: `trackEvent` answers nothing. While a content blocker keeps Fathom's script from loading, events wait in `fathom-client`'s queue for the life of the page, and `submitted` still describes only the handoff.
- The value is sent as `value` answers it when it is a whole number of cents that JavaScript holds exactly, up to `Number.MAX_SAFE_INTEGER`. Any other value, such as `1998.9999999999998` from `19.99 * 100`, is left out and never rounded: the event is still sent without a value, and its outcome ends with `{ path: "value", reason: "invalid" }`. Round in `value` yourself, as the example does.
- Flush: there is none, and `trace.flush()` reports `unsupported`. Fathom's script sends each event on its own.
- Quirks:
  - Fathom attributes an event to the page it is sent from, so an event Trace held in its buffer while the page changed lands on the new page.
  - Fathom is one client per page. Register it under one destination name: two destinations over it send every event twice.
- `native` is the `sdk` you passed in, for everything Trace does not wrap, such as `trackPageview`. Calls made on it bypass Trace's routing, consent, receipts and privacy.

## Tests

- Beside the helper in `src/utils/`: `getFathomEvent`, every loss and its order, the whole cents that travel as `_value`, and the values it leaves out.
- Against an in-process fake modelled on `fathom-client` 3.7.2 with Fathom's script (`src/fakeFathom.fixture.ts`): it queues events until the script loads and hands them over then, drops them while tracking is blocked, and counts the calls Trace must never make. The tests cover coldness, the name, the value and its absence, a value that is not whole cents, the losses and their order, a throwing `value`, an event queued before the script loaded, and through a real `Trace` that no identifier reaches Fathom, consent, flush, `native`, and that Trace never loads Fathom or switches its tracking.
- Conformance: `src/conformance.test.ts` runs the core's `testAnalyticsAdapter` over the fake, with and without `value`.
- Against the real SDK: `src/fathom.sdk.test.ts` runs the installed `fathom-client` 3.7.2 in jsdom: the queue it keeps before Fathom's script loads, read through its own `window.__fathomClientQueue`, each event handed to the script once `window.fathom` exists, and the queue handed over when the application's `load` finishes. An object that records the calls stands in for Fathom's script.
- Typecheck only: `src/fathom.contracts.ts` assigns the real module and its `trackEvent` to `FathomLike`, pins the fake and the options to the real types, reads `native` as the module through a `Trace`, and refuses Plausible's tracker and a value that is not a number. Fathom has no other SDK to refuse.
- Never: Fathom's script and servers. No event is sent to Fathom.

## License

[MIT](LICENSE)
