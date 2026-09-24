# @priemskiyyy/trace-heap

Send [Trace](../../core) events to Heap in the browser. You pass in the heap.js global your page loaded, so this package imports no SDK. Each event is one `track` call with its context under its properties, and the user and their traits become Heap's own identity and user properties.

## Installation

```sh
pnpm add @priemskiyyy/trace @priemskiyyy/trace-heap
```

Heap has no npm package for the browser. Load heap.js with Heap's snippet, which calls `heap.load("YOUR_ENVIRONMENT_ID")`.

## Create a Trace

heap.js replaces the snippet's `window.heap` with a new object when it loads, and a call made on the old one after that is never sent. So give the adapter an object that reads the current `window.heap` on every call, and start Trace again once Heap is ready:

```ts
import { event, Trace } from "@priemskiyyy/trace";
import { heap } from "@priemskiyyy/trace-heap";
import type { HeapLike } from "@priemskiyyy/trace-heap";

const currentHeap: HeapLike = {
  get loaded() {
    return window.heap.loaded;
  },
  track: (name, properties) => window.heap.track(name, properties),
  identify: (identity) => window.heap.identify(identity),
  addUserProperties: (properties) => window.heap.addUserProperties(properties),
  resetIdentity: () => window.heap.resetIdentity(),
};

const trace = new Trace({
  events: {
    "Checkout Started": event<{ cart_id: string; value: number }>(),
  },
  destinations: { product: heap({ sdk: currentHeap }) },
});

trace.start();
window.heap.onReady(trace.start);

trace.user({ id: "user_42", traits: { plan: "pro" } });
trace.track("Checkout Started", { cart_id: "cart_1", value: 49.5 });
```

Until heap.js has loaded, the destination's start fails with `NOT_INITIALIZED` and Trace holds its events in its buffer; the start from `onReady` opens it and sends them. When your code runs after heap.js has loaded, `heap({ sdk: window.heap })` works as well.

## Options

| Option | Default  | Meaning                                                                                                           |
| ------ | -------- | ----------------------------------------------------------------------------------------------------------------- |
| `sdk`  | required | The heap.js global once it has loaded, or an object that reads the current `window.heap` on every call, as above. |

## How an event is mapped

Each event is one `track(name, properties)` call.

| Trace        | Heap                                                                                                                                         |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`       | the event name, unchanged                                                                                                                    |
| `properties` | event properties, which heap.js sends as text; Heap reads numeric text as a number                                                           |
| `context`    | event properties under the event's own; a context key a property shadows is an `omitted` loss                                                |
| `identity`   | not on the event: Heap files it under the identity it holds, which Trace sets before the event, see Identity                                 |
| `id`         | not sent: heap.js gives each event an id of its own and takes none for deduplication                                                         |
| `timestamp`  | not sent: heap.js stamps the event when it takes the call, so every submitted outcome carries `{ path: "timestamp", reason: "unsupported" }` |

An event whose name has more than 255 characters, or is one of the names Heap reserves, `click`, `change`, `pageview` and `submit`, is not sent. It is `dropped` as `provider-filtered`, with `{ path: "name", reason: "invalid" }` first and then the losses it would have carried if sent. Otherwise the losses come in order: the event's properties, then its context, then the timestamp.

- `invalid`: a property name of 512 characters or more, or of more than 512 bytes, which heap.js drops with its value.
- `unsupported`: an empty string, `null`, an object, or an array holding anything but text, numbers and booleans. Heap has no notion of a blank or nested value, and heap.js drops them.
- `coerced`: a boolean, which heap.js sends as the text `true` or `false`, and an array of text, numbers and booleans, which heap.js joins with `||` into one text. A number is not reported: Heap reads numeric text as a number.
- `truncated`: text of 1024 characters or more, and an array whose joined text reaches 1024 characters. Heap keeps the value and cuts it.
- `omitted`: a context key a property shadows.

The adapter sends the properties as they are, and heap.js drops, joins or cuts what these losses name. Characters are counted as JavaScript counts them, in UTF-16 code units, and names are also measured in UTF-8 bytes, as heap.js measures them. Heap's documented limits, and what the adapter does at each:

| Limit                  | Heap                                                                                                             | The adapter                                                                                         | Source                                             |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Event name             | 255 characters; heap.js 5.3.16 drops a name over 1024 bytes without a word                                       | drops the event as `provider-filtered`, `invalid` on `name`                                         | [track][track]                                     |
| Reserved event name    | `track` cannot take `click`, `change`, `pageview` or `submit`                                                    | drops the event as `provider-filtered`, `invalid` on `name`                                         | [track][track]                                     |
| Property name          | fewer than 512 characters; heap.js 5.3.16 drops a name over 512 bytes                                            | `invalid` from 512 characters or over 512 bytes                                                     | [track][track]                                     |
| Property value         | text, a number, a boolean or an array of them, fewer than 1024 characters                                        | `unsupported` for anything else, `truncated` from 1024 characters                                   | [track][track], [arrays][arrays]                   |
| Property `screen_name` | conflicts with Heap's autocaptured screen name on mobile                                                         | not checked: the conflict is on mobile                                                              | [track][track]                                     |
| Identity               | fewer than 255 characters; heap.js 5.3.16 ignores placeholders such as `anonymous`                               | fails the change, and the user's events are skipped, see Identity                                   | [identify][api]                                    |
| User property value    | a number or text of 255 characters or fewer on one page, a boolean, number or text of fewer than 1024 on another | keeps numbers, booleans and text of up to 255 characters; leaves the rest out, the step unsupported | [addUserProperties][adduserproperties], [API][api] |

[api]: https://developers.heap.io/docs/api-reference
[track]: https://developers.heap.io/reference/track
[arrays]: https://developers.heap.io/reference/track-1
[adduserproperties]: https://developers.heap.io/reference/adduserproperties

## Identity

- `identify` calls `identify(user.id)`. heap.js ignores an identity it takes for a placeholder: `undefined`, `anonymous`, `true`, `false`, `not_authenticated`, `NaN`, `NA`, `Na`, `unique_identifier`, `0`, `""`, `[object Object]`, `{{ customer.email }}`, `{{ email }}` and `hashed_user_id`, and `email`, `none`, `unknown`, `guest` and `null` in any letter case. It cuts an identity past 255 characters, so two users who share its first 255 characters would become one, and Heap documents identities of fewer than 255. For such a user the adapter's `identify` fails with a `TraceError` whose code is `DELIVERY_FAILED`, before Heap sees the identity. Sending a placeholder anyway would file that user's events under Heap's anonymous user, which `resetIdentity` cannot replace, and the next user's `identify` would take them over; sending a long identity would file them under one another user may share. So Trace skips the user's events as `identity-failed`, never sends their traits, and records the diagnostic `identity step failed`. Use an opaque, stable user id, never an email address, even though Heap's own guide suggests one.
- Heap keeps what a visitor did before signing in on its anonymous user, and the first identity Heap accepts on that browser takes it over. When the user who signed in was one Heap refuses, that earlier anonymous history goes to the next user Heap identifies.
- Traits call `addUserProperties` with the values Heap keeps: numbers, booleans and text of up to 255 characters. A blank, nested or longer value, and a name Heap refuses, are left out, because heap.js would drop or cut them, and a removal is not sent, because Heap has no call that removes a user property. The rest is set, and then the step throws `TraceError` `UNSUPPORTED`, which Trace reports as the diagnostic `identity step unsupported` and counts as done. heap.js stores every user property as text.
- There are no groups. Heap's browser API documents none.
- `reset` calls `resetIdentity()`, which starts a new anonymous user. Trace resets before it identifies a different user and when the user signs out, so an event of one user is never filed under the next.
- Heap keeps its identity in a cookie across page loads. When your application signs a user out while no Trace runs, such as on another page or on the server, call `window.heap.resetIdentity()` at that boundary yourself.

## Consent

Heap has no switch Trace can turn both ways: `stopTracking` cannot be undone without reloading the page, and with an argument it deletes Heap's identity and cookies. So the session has no `collection`, and a gated destination only stops receiving Trace's events while its purposes are not granted. Heap's own autocapture of clicks, page views and form changes runs outside Trace's consent and privacy. When consent gates Heap, call `heap.load` only once it is granted, and `window.heap.onReady(trace.start)` after it: heap.js then collects nothing before, and the snippet defines `onReady` only in `load`.

## Behavior

- Platforms and versions: browsers, with heap.js 5, the version Heap's snippet loads. It is modelled on heap.js 5.3.16, which Heap's loader served on 2026-09-23. React Native has another SDK with another API.
- Initialization is yours. Trace never calls `load`, `init`, `stopTracking`, `startTracking` or anything that writes Heap's super properties, such as `addEventProperties`. `open` reads only `loaded` and fails the destination with a `TraceError` whose code is `NOT_INITIALIZED` until heap.js has initialized, and again after `stopTracking`. Call `trace.start()` from `heap.onReady` and it opens.
- Evidence is `sdk-call-returned`: every heap.js call answers nothing, and heap.js batches, retries and uploads on its own, so `submitted` does not mean Heap stored the event.
- Flush: there is none, and `trace.flush()` reports `unsupported`. heap.js sends its queue on its own schedule and flushes it when the page is hidden or closed.
- Quirks:
  - heap.js drops or changes values silently, since its default log level is `none`. The losses on each receipt say what it dropped or changed.
  - heap.js identifies the next user as a new user and clears the previous one's user properties, so the reset Trace sends first changes nothing Heap would not do.
  - Heap is one global per page. Register it under one destination name: two destinations over it track every event twice.
- `native` is the `sdk` you passed in: the object that reads `window.heap` in the example above, or `window.heap` itself. Calls made on it bypass Trace's routing, consent, receipts and privacy.

## Tests

- Beside each helper in `src/utils/`: the property name rule in `isPropertyName`, every value rule in `getLossReason`, the losses and their order in `getEventLosses`, the user property rules in `getUserProperties`, and heap.js's refused identities in `isRefusedIdentity`.
- Against an in-process fake modelled on heap.js 5.3.16 (`src/fakeHeap.fixture.ts`): it keeps Heap's users, so an identity taken on an anonymous user takes its history over, identifying someone else starts a new user and a reset of an anonymous user does nothing; it keeps what heap.js's own sanitizer keeps and sends it as text, ignores the identities heap.js refuses, cuts long ones, and drops an event name over 1024 bytes. The tests cover coldness, the `loaded` check and a start after Heap loaded, the event mapping and every loss, long and reserved event names, identify and its failures, traits and their refusals, reset, and through a real `Trace` a user switch and a sign-out resetting Heap between users, a refused user followed by a sign-out and by a direct switch with none of their events or traits reaching the next user, a removed trait reported as unsupported, consent, flush, `native`, and that Trace never loads, stops or restarts Heap.
- Conformance: `src/conformance.test.ts` runs the core's `testAnalyticsAdapter` over the fake.
- Never: heap.js itself. Heap publishes no npm package and no types, so there is no real-SDK test and no typecheck contract against Heap's own types: the fake is modelled on the heap.js 5.3.16 bundle, read from Heap's CDN. No event is sent to Heap, so Heap's server-side merges are not observed.

## License

[MIT](LICENSE)
