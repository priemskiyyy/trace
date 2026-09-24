# @priemskiyyy/trace-umami

Send [Trace](../../core) events to Umami as custom events. You pass in the `window.umami` tracker your page loaded, so this package imports no SDK. Each event is one `track` call in its function form, carrying its data and the id of the user it was tracked for, so identity travels with each event and never sticks to the page.

## Installation

```sh
pnpm add @priemskiyyy/trace @priemskiyyy/trace-umami
```

Umami's tracker is a script, not an npm package. For its types, add `@types/umami-browser` and list `"umami-browser"` in your `tsconfig.json`'s `types`.

## Create a Trace

Load the tracker with `defer` before your application's script, so `window.umami` exists when the Trace is created:

```html
<script
  defer
  src="https://cloud.umami.is/script.js"
  data-website-id="YOUR_WEBSITE_ID"
></script>
<script type="module" src="/src/main.ts"></script>
```

```ts
import { event, Trace } from "@priemskiyyy/trace";
import { umami } from "@priemskiyyy/trace-umami";

const trace = new Trace({
  events: {
    "Signup Completed": event<{ plan: string; seats: number }>(),
  },
  destinations: { site: umami({ sdk: window.umami }) },
});

trace.start();
trace.user({ id: "user_42" });
trace.track("Signup Completed", { plan: "pro", seats: 3 });
```

## Options

| Option | Default  | Meaning                                         |
| ------ | -------- | ----------------------------------------------- |
| `sdk`  | required | `window.umami` once the tracker script has run. |

## How an event is mapped

Each event is one `track((payload) => ({ ...payload, name, data, id }))` call: the page's own payload from the tracker, with the event's name, data and id over it.

| Trace           | Umami                                                                                                                                                   |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`          | the event name, unchanged                                                                                                                               |
| `properties`    | `data`                                                                                                                                                  |
| `context`       | `data` too, under the event's properties                                                                                                                |
| `identity.user` | `id`, the distinct id of this event alone; an anonymous event carries none, even when the page's tracker holds one                                      |
| traits, groups  | not sent, see Identity                                                                                                                                  |
| `id`            | not sent: Umami has no deduplication                                                                                                                    |
| `timestamp`     | not sent: the tracker sends no time and Umami stamps the event when it arrives, so every outcome carries `{ path: "timestamp", reason: "unsupported" }` |

Losses come in order: the name, then the event's properties, then its context, then the timestamp and the user id.

- `truncated`: an event name over 50 characters and text over 500 characters at any depth, which Umami cuts when it stores the event; a number past four decimal places, which Umami rounds to four; and every property past the 50th of one object, which the adapter leaves out. At the top level the context counts after the event's properties.
- `coerced`: `null` or an array, which Umami stores as its JSON text.
- `invalid`: an array whose JSON text passes 500 characters, which Umami drops, and a user id over 50 characters, which the adapter leaves out of the event: Umami would cut it, and two users who share its first 50 characters would become one.
- `omitted`: a context key a property shadows.

Umami stores a nested object under dotted keys, such as `cart.id`, which is how it shows event data; that is not a loss. Lengths are counted in UTF-16 code units, as JavaScript's `length` counts them. Umami does not name its unit, and this is the stricter reading: a loss may name text Umami keeps whole, never the other way round. Umami's documented limits, and what the adapter does at each:

| Limit       | Umami                                    | The adapter                                                         | Source                         |
| ----------- | ---------------------------------------- | ------------------------------------------------------------------- | ------------------------------ |
| Event name  | cut past 50 characters                   | sends it whole, `truncated`                                         | [track events][events]         |
| Text        | 500 characters                           | sends it whole, `truncated`                                         | [tracker functions][functions] |
| Numbers     | four decimal places                      | sends them whole, `truncated`                                       | [tracker functions][functions] |
| Arrays      | stored as text of at most 500 characters | sends them whole, `coerced`, or `invalid` past 500 characters       | [tracker functions][functions] |
| Objects     | 50 properties, an array counting as one  | leaves out every property past the 50th of each object, `truncated` | [tracker functions][functions] |
| Distinct id | cut past 50 characters                   | leaves it out of the event, `invalid`                               | [distinct IDs][ids]            |

[events]: https://docs.umami.is/docs/track-events
[functions]: https://docs.umami.is/docs/tracker-functions
[ids]: https://docs.umami.is/docs/distinct-ids

## Identity

The session has no `identify`, `traits`, `group` or `reset`: the user's id travels on each event instead, read from the identity the event was accepted with. An event tracked before a sign-in and sent after it carries no id, and an event of one user is never filed under the next. Trace never calls `umami.identify`, which would store a distinct id for the whole page, with no call that clears it after a sign-out, and would attach traits to the page's session rather than to the user. If your application calls `umami.identify` itself, the adapter's events still carry their own user's id, or none.

## Consent

The tracker has no switch Trace could turn both ways. Its only one is the `umami.disabled` flag in `localStorage`, which Umami documents for excluding your own visits, so the session has no `collection`, and a gated destination only stops receiving Trace's events while its purposes are not granted. The tracker's automatic page views and `data-umami-event` clicks run outside Trace's consent. When consent gates Umami, add `data-auto-track="false"` to its script tag, which also stops its page views, or load the script only once consent is granted.

## Behavior

- Platforms and versions: browsers, with the Umami tracker 3, modelled on the tracker 3.4.0, and typed structurally through `UmamiLike`, which `@types/umami-browser` 2.18 satisfies. React Native and servers are not covered: Umami's `/api/send` needs the visitor's own user agent.
- Initialization is yours. The tracker script defines `window.umami` when it runs and not before, so load it with `defer` ahead of your application's script, or create the Trace once it has run. `open` checks nothing, and Trace never calls `identify`.
- Evidence is `sdk-call-returned`. `track` sends one `keepalive` request per event and resolves after it, a failed one too, and at once when tracking is disabled, so the adapter does not wait for it. It only observes the promise's rejection, such as a throwing `data-before-send` function, so that nothing reaches your application. Umami also answers 200 to bots.
- Flush: there is none, and `trace.flush()` reports `unsupported`. Each event is its own request.
- Quirks:
  - The tracker's payload carries the page's current address, so an event Trace held in its buffer while the page changed is attributed to the page it was sent from.
  - Umami's server refuses an event whose name starts with `=`, `+`, `-`, `@`, a tab or a carriage return, to keep formulas out of exports. Its documentation does not say so, and the adapter does not check it.
  - Umami is one tracker per page. Register it under one destination name: two destinations over it send every event twice.
- `native` is the `sdk` you passed in, for everything Trace does not wrap. Calls made on it bypass Trace's routing, consent, receipts and privacy.

## Tests

- Beside the helpers in `src/utils/`: every data rule above and the 50 properties of each object in `getUmamiData`, and the name, the user id rule and the order of the losses in `getUmamiEvent`.
- Against an in-process fake modelled on the Umami tracker 3.4.0 (`src/fakeUmami.fixture.ts`): it takes each form of `track`, passes the function form the page's payload with the distinct id `identify` set, sends nothing while tracking is disabled, resolves after a failed request, and can reject. The tests cover coldness, the payload of each event, an anonymous event on an identified page, a long user id, a disabled tracker, a rejection that never escapes, and through a real `Trace` each event keeping its own user across a sign-in and a sign-out, consent, flush, `native`, and that Trace never calls `identify`.
- Conformance: `src/conformance.test.ts` runs the core's `testAnalyticsAdapter` over the fake.
- Typecheck only: `src/umami.contracts.ts` assigns the global `umami` of `@types/umami-browser` 2.18.1 to `UmamiLike`, pins the function form's payload and the fake to it, reads `native` as the tracker through a `Trace`, and refuses Vercel's `track`. It records two gaps in those types as negative cases: event data without `null` or mixed arrays, which the tracker sends as given, and no `id` on a payload, which the tracker 3.4.0 sends. Umami's Node client is not installed here, so it is not refused.
- Never: the tracker itself, which is not on npm, so there is no real-SDK test, and Umami's server. No event is sent to Umami.

## License

[MIT](LICENSE)
