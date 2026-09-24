# @priemskiyyy/trace-plausible

Send [Trace](../../core) events to Plausible as custom events. You pass in the tracker your application initialized from `@plausible-analytics/tracker`, so this package imports no SDK. Each event becomes one custom event whose props are its flat properties and context as text, and the adapter answers once Plausible's callback reports the request. No user, trait or group ever reaches Plausible, which forbids identifiers.

## Installation

```sh
pnpm add @priemskiyyy/trace @priemskiyyy/trace-plausible @plausible-analytics/tracker
```

## Create a Trace

```ts
import { init, track } from "@plausible-analytics/tracker";
import { event, Trace } from "@priemskiyyy/trace";
import { plausible } from "@priemskiyyy/trace-plausible";

init({ domain: "example.com" });

const trace = new Trace({
  events: {
    "Signup Completed": event<{ plan: string; seats: number }>(),
  },
  destinations: { site: plausible({ sdk: { track } }) },
});

trace.start();
trace.track("Signup Completed", { plan: "pro", seats: 3 });
```

Plausible shows a custom event once a goal with its name exists in the site's settings.

## Options

| Option | Default  | Meaning                                                                                                          |
| ------ | -------- | ---------------------------------------------------------------------------------------------------------------- |
| `sdk`  | required | The tracker your application initialized: `{ track }` from `@plausible-analytics/tracker`, or the module itself. |

## How an event is mapped

Each event is one `track(name, { props, callback })` call.

| Trace        | Plausible                                                                                                                              |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `name`       | the custom event's name, unchanged                                                                                                     |
| `properties` | `props`, each value as text                                                                                                            |
| `context`    | `props` too, under the event's own properties                                                                                          |
| `identity`   | never sent: Plausible forbids identifiers, and the adapter never moves a user, trait or group into `props`                             |
| `id`         | not sent: Plausible has no deduplication                                                                                               |
| `timestamp`  | not sent: Plausible stamps the event when its request arrives, so every outcome carries `{ path: "timestamp", reason: "unsupported" }` |

Losses come in order: the event's properties, then its context, then the timestamp.

- `coerced`: a number or a boolean, which Plausible's props take as text.
- `unsupported`: an object, an array or `null`, left out, because Plausible takes scalar values only.
- `truncated`: every prop past the 30th, left out, and a value over 2000 characters, cut to 2000.
- `invalid`: a name over 300 characters, left out.
- `omitted`: a context key a property shadows.

Plausible gives its limits in characters. The adapter counts UTF-16 code units, as JavaScript's `length` does, the stricter reading of a character: it may cut or leave out text Plausible would keep whole, never the other way round. Plausible's documented limits, and what the adapter does at each:

| Limit           | Plausible                                           | The adapter                                                                    | Source                               |
| --------------- | --------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------ |
| Props per event | 30; the Events API discards the rest                | sends the first 30, `truncated` for the rest                                   | [custom props][props], [Events][api] |
| Prop name       | 300 characters                                      | leaves the prop out, `invalid`                                                 | [custom props][props]                |
| Prop value      | 2000 characters                                     | cuts the text, `truncated`                                                     | [custom props][props]                |
| Prop value type | strings, numbers and booleans; no objects or arrays | numbers and booleans as text, `coerced`; anything else left out, `unsupported` | [custom props][props]                |

[props]: https://plausible.io/docs/custom-props/introduction
[api]: https://plausible.io/docs/events-api

The tracker merges the `customProperties` you give `init` under each event's props, and those count towards Plausible's 30 as well. The adapter cannot see them.

## Identity

There is none. The session has no `identify`, `traits`, `group` or `reset`, so Trace never sends Plausible a user, a trait or a group, and an event's identity stays out of its props. Plausible tells visitors apart by a daily hash it computes from the IP address and the user agent.

## Consent

The tracker has no switch Trace could turn both ways. Its only one is the `plausible_ignore` flag in `localStorage`, which Plausible documents for excluding your own visits, so the session has no `collection`, and a gated destination only stops receiving Trace's events while its purposes are not granted. The tracker's own page views, and the outbound link, file download and form tracking you can turn on, run outside Trace's consent. When consent gates Plausible, call `init` once consent is granted and before `trace.consent.set` opens the destination, or initialize with `autoCapturePageviews: false` and leave the other automatic tracking off.

## Behavior

- Platforms and versions: browsers, with `@plausible-analytics/tracker` 0.4 or later within 0.x, an optional peer dependency, typed structurally through `PlausibleLike`. The script-tag installation defines a `window.plausible` of another shape; use the npm tracker. React Native and servers are not covered: Plausible's Events API needs the visitor's own user agent and IP address.
- Initialization is yours. Trace never calls `init`, and nothing tells `open` whether `init` ran, so it checks nothing. Before `init` the tracker throws on every `track`, which Trace answers as `failed` with that error. Call `init` before `trace.start()`.
- Evidence is `sdk-callback-completed`. The adapter waits for the tracker's callback, bounded by Trace's `timeout`, and answers once the request completed with a 2xx status. Plausible answers 202 to events it drops too, such as a bot's, so nothing stronger is claimed. A status outside 2xx fails the event with a `TraceError` whose code is `DELIVERY_FAILED`, and a network error fails it with that error. An event the tracker ignores, for the `plausible_ignore` flag, `localhost` without `captureOnLocalhost`, an automated browser or a `transformRequest` that returns nothing, is `dropped` as `provider-filtered`. In a browser without `fetch` the callback never comes, so the event ends `indeterminate` at the timeout.
- Flush: there is none, and `trace.flush()` reports `unsupported`. Each event is its own `keepalive` request.
- Quirks:
  - The tracker sends the page's current address with each event, so an event Trace held in its buffer while the page changed is attributed to the page it was sent from.
  - Plausible is one tracker per page. Register it under one destination name: two destinations over it send every event twice.
- `native` is the `sdk` you passed in, for everything Trace does not wrap. Calls made on it bypass Trace's routing, consent, receipts and privacy.

## Tests

- Beside each helper in `src/utils/`: every prop rule above in `getPlausibleProps`, and every answer of the callback in `getTrackResult`.
- Against an in-process fake modelled on `@plausible-analytics/tracker` 0.4.6 (`src/fakePlausible.fixture.ts`): it throws before `init`, answers nothing for an event it ignores, answers each request's status or network error once the request completes, never answers without `fetch`, and can hold its answers. The tests cover coldness, the mapping, the wait for the callback, each answer, a throw before `init`, the timeout, and through a real `Trace` a submitted event, that no identifier reaches Plausible, consent, flush, `native`, and that Trace never initializes Plausible.
- Conformance: `src/conformance.test.ts` runs the core's `testAnalyticsAdapter` over the fake.
- Against the real SDK: `src/plausible.sdk.test.ts` runs the installed `@plausible-analytics/tracker` 0.4.6 in jsdom with `fetch` stubbed, reading each request through the tracker's own `transformRequest` hook: the payload with its props and the context under them, a 202, a 500 and a network error, the `plausible_ignore` flag, a request `transformRequest` drops, and a tracker without `fetch` timing out. `init` configures the module once per test file, so the throw before `init` is covered by the fake only.
- Typecheck only: `src/plausible.contracts.ts` assigns the real module and its `track` to `PlausibleLike`, pins the fake and the props and callback types to the real ones, reads `native` as the module through a `Trace`, and refuses the Fathom client and a tracker that takes numeric props. Plausible has no other SDK to refuse.
- Never: Plausible's servers. No event is sent to Plausible.

## License

[MIT](LICENSE)
