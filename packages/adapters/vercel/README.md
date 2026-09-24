# @priemskiyyy/trace-vercel

Send [Trace](../../core) events to Vercel Web Analytics as custom events. You pass in the `track` of `@vercel/analytics` your application injected, so this package imports no SDK. Each event is one custom event with as many of its flat properties as your plan keeps. Its context is not sent, because it would take those few places.

## Installation

```sh
pnpm add @priemskiyyy/trace @priemskiyyy/trace-vercel @vercel/analytics
```

## Create a Trace

```ts
import { event, Trace } from "@priemskiyyy/trace";
import { vercel } from "@priemskiyyy/trace-vercel";
import { inject, track } from "@vercel/analytics";

inject();

const trace = new Trace({
  events: {
    "Signup Completed": event<{ plan: string; seats: number }>(),
  },
  destinations: { site: vercel({ sdk: { track } }) },
});

trace.start();
trace.track("Signup Completed", { plan: "pro", seats: 3 });
```

With a framework, the `<Analytics />` component of `@vercel/analytics` injects the script in place of `inject()`. Custom events need a Pro or Enterprise plan.

## Options

| Option              | Default  | Meaning                                                                                                                                 |
| ------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `sdk`               | required | The browser `track` of `@vercel/analytics`, as `{ track }`, or the module itself.                                                       |
| `limits.properties` | `2`      | The custom properties your plan keeps on one event: `2` on Pro, or `8` with Web Analytics Plus or Enterprise. No other number compiles. |

## How an event is mapped

Each event is one `track(name, properties)` call.

| Trace        | Vercel                                                                                                                               |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `name`       | the event name, unchanged                                                                                                            |
| `properties` | custom data, up to `limits.properties` of them, in the order the event holds them                                                    |
| `context`    | not sent, each key an `omitted` loss, because it would take the plan's few places                                                    |
| `identity`   | never sent: Vercel counts visitors by a hash of the request, and the adapter never moves a user, trait or group into custom data     |
| `id`         | not sent: Vercel has no deduplication                                                                                                |
| `timestamp`  | not sent: Vercel stamps the event when it is sent, so every submitted outcome carries `{ path: "timestamp", reason: "unsupported" }` |

An event whose name has more than 255 characters is not sent: Vercel would drop it, so it is `dropped` as `provider-filtered`, with `{ path: "name", reason: "invalid" }` first and then the losses it would have carried if sent. Otherwise the losses come in order: the event's properties, then its context, then the timestamp.

- `truncated`: every property past `limits.properties`, left out, and text over 255 characters, cut to 255.
- `unsupported`: an object or an array, left out, taking no place. `@vercel/analytics` strips such a value in production but drops the whole event in development, so the adapter leaves it out itself and both see the same event.
- `invalid`: a property name over 255 characters, left out.
- `omitted`: every context key.

Each 255 is counted in UTF-16 code units, as JavaScript's `length` counts them and as `@vercel/analytics` measures them. Vercel's documented limits, and what the adapter does at each:

| Limit                | Vercel                                                      | The adapter                                                          | Source                                     |
| -------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------ |
| Properties per event | 2 on Pro, 8 with Web Analytics Plus or Enterprise           | sends the first `limits.properties`, `truncated` for the rest        | [custom events][events], [limits][pricing] |
| Event name           | 255 characters, and a longer one is dropped                 | drops the event as `provider-filtered`, `invalid` on `name`          | [custom events][events]                    |
| Property name        | 255 characters                                              | leaves the property out, `invalid`                                   | [custom events][events]                    |
| Property value       | text, a number, a boolean or `null`, 255 characters at most | leaves objects and arrays out, `unsupported`; cuts text, `truncated` | [custom events][events]                    |
| Custom events        | not on Hobby                                                | not checked: the plan is not visible from the browser                | [limits][pricing]                          |

[events]: https://vercel.com/docs/analytics/custom-events
[pricing]: https://vercel.com/docs/analytics/limits-and-pricing

## Identity

There is none. The session has no `identify`, `traits`, `group` or `reset`, so Trace never sends Vercel a user, a trait or a group.

## Consent

`@vercel/analytics` has no switch Trace could turn, so the session has no `collection`, and a gated destination only stops receiving Trace's events while its purposes are not granted. Vercel's page views run outside Trace's consent. When consent gates Vercel, call `inject` only once consent is granted, or cancel events in your own `beforeSend` while it is not, as Vercel's opt-out recipe does with a `va-disable` key in `localStorage`.

## Behavior

- Platforms and versions: browsers, with `@vercel/analytics` 2 or later within 2.x, an optional peer dependency, typed structurally through `VercelLike`. The server `track` of `@vercel/analytics/server` takes the same arguments, so the types cannot refuse it, but this adapter is for the browser.
- Initialization is yours. Trace never calls `inject` or `pageview`, and `open` checks nothing. Before `inject`, `track` does nothing at all, and the event still reads `submitted`.
- Outside a browser, in development and test, `@vercel/analytics` throws, and Trace answers the event as `failed` with that error. In production it only warns, and the event reads `submitted` though nothing was queued. Create this destination in the browser only.
- Evidence is `sdk-call-returned`. `track` answers nothing, and it queues the event in `window.vaq` until Vercel's script has loaded.
- Flush: there is none, and `trace.flush()` reports `unsupported`. Vercel's script sends each event on its own.
- Quirks:
  - Vercel attributes an event to the page it is sent from, so an event Trace held in its buffer while the page changed lands on the new page.
  - Your `beforeSend` can rewrite or cancel an event after Trace handed it over.
  - Vercel Web Analytics is one script per page. Register it under one destination name: two destinations over it send every event twice.
- `native` is the `sdk` you passed in, for everything Trace does not wrap. Calls made on it bypass Trace's routing, consent, receipts and privacy.

## Tests

- Beside the helper in `src/utils/`: every property rule above, the context and the order of the losses in `getVercelProperties`.
- Against an in-process fake modelled on `@vercel/analytics` 2.0.1 (`src/fakeVercel.fixture.ts`): it throws outside a browser in development and warns in production, does nothing before `inject`, drops an event that carries an object in development and strips the object in production, and queues what `window.vaq` would hold. The tests cover coldness, the mapping, the limit of 8 and the default of 2, an object in development, a long event name and the losses its drop carries, a throwing `track` reaching the core, a `track` that sends nothing, and through a real `Trace` a submitted event with no identifier, consent, flush, `native`, and that Trace never injects the script or tracks a page view.
- Conformance: `src/conformance.test.ts` runs the core's `testAnalyticsAdapter` over the fake, with the default limit and with eight properties.
- Against the real SDK: `src/vercel.sdk.test.ts` runs the installed `@vercel/analytics` 2.0.1 in jsdom after `inject`, reading each event from its own `window.vaq` queue: the event with its first two properties, development dropping an event that carries an object while the adapter's event arrives without it, and, with `window` removed, the throw in development answered as `failed` and the warning in production.
- Typecheck only: `src/vercel.contracts.ts` assigns the real module and its `track` to `VercelLike`, pins the fake and the property values to the real types, reads `native` as the module through a `Trace`, records that the server `track` fits the same type, and refuses the Fathom client and a limit other than 2 or 8.
- Never: Vercel's script and servers. No event is sent to Vercel.

## License

[MIT](LICENSE)
