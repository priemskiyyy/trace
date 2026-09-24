# @priemskiyyy/trace-rudderstack

Send [Trace](../../core) events to RudderStack in the browser. You pass in the `RudderAnalytics` instance your application created, so this package imports no SDK. Each event is one `track` call carrying its time as the original timestamp, and the user, their traits and one group type become RudderStack's own `identify` and `group` calls. The adapter reports what RudderStack drops on its own: reserved names, and every `null`.

## Installation

```sh
pnpm add @priemskiyyy/trace @priemskiyyy/trace-rudderstack @rudderstack/analytics-js
```

## Create a Trace

```ts
import { event, Trace } from "@priemskiyyy/trace";
import { rudderstack } from "@priemskiyyy/trace-rudderstack";
import { RudderAnalytics } from "@rudderstack/analytics-js";

const rudderanalytics = new RudderAnalytics();

rudderanalytics.load("YOUR_WRITE_KEY", "https://your-data-plane.example.com", {
  preConsent: { enabled: true, events: { delivery: "buffer" } },
});

const trace = new Trace({
  events: {
    "Checkout Started": event<{ cart: { id: string }; value: number }>(),
  },
  destinations: {
    warehouse: rudderstack({
      sdk: rudderanalytics,
      group: { type: "workspace" },
    }),
  },
  consent: { warehouse: ["analytics"] },
});

trace.start();

// Your consent banner, once the visitor agrees:
rudderanalytics.consent();
trace.consent.set({ analytics: "granted" });

trace.user({ id: "user_42", traits: { plan: "pro" } });
trace.group("workspace", { id: "workspace_1", traits: { seats: 12 } });
trace.track("Checkout Started", { cart: { id: "cart_1" }, value: 49.5 });
```

## Options

| Option  | Default  | Meaning                                                                                                 |
| ------- | -------- | ------------------------------------------------------------------------------------------------------- |
| `sdk`   | required | The `RudderAnalytics` instance your application created. It may still be loading.                       |
| `group` | none     | `{ type }`: the Trace group type sent as RudderStack's one group. Without it, no membership reaches it. |

## How an event is mapped

Each event is one `track(name, properties, { originalTimestamp })` call.

| Trace              | RudderStack                                                                                                            |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `event.name`       | the event name, unchanged                                                                                              |
| `event.properties` | event properties                                                                                                       |
| `event.context`    | event properties under the event's own: a context key a property shadows is an `omitted` loss                          |
| `event.timestamp`  | `originalTimestamp`, as an ISO string                                                                                  |
| `event.id`         | not sent: RudderStack always makes its own `messageId`, and a `messageId` option only lands in the event's context     |
| `event.identity`   | nothing on the event: RudderStack stamps it with the user, anonymous id and traits it holds, which Trace set before it |

RudderStack's SDK leaves out every object member whose value is `null` when it sends an event, at any depth, while a `null` list item stays. The adapter hands the event over as it is and reports each such member as `unsupported` at its path, such as `properties.coupon` or `context.app.build`. The limits RudderStack documents:

| Limit           | RudderStack's documentation                                                                                                                                                                                                                                                                            | What the adapter does                                                                                                                                              | Loss                                                     |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| An event's size | 32 KB per event, refused with a 400 ([HTTP API][http-api]); the SDK only warns past 32,768 characters and sends it anyway                                                                                                                                                                              | measures the name and properties as RudderStack sends them, UTF-8 JSON without the `null` object members it leaves out, and never sends an event past 32,768 bytes | `dropped` as `provider-filtered`, `properties` `invalid` |
| Reserved names  | `id`, `anonymous_id`, `user_id`, `sent_at`, `timestamp`, `received_at`, `original_timestamp`, `event`, `event_text`, `channel`, `context_ip`, `context_request_ip`, `context_passed_ip`, `group_id` and `previous_id`, the warehouse columns the SDK warns about in any case (its `RESERVED_ELEMENTS`) | leaves such a property or context key out                                                                                                                          | `invalid`                                                |
| Nesting depth   | 200 levels ([HTTP API][http-api])                                                                                                                                                                                                                                                                      | nothing: Trace's own `privacy.limits.depth`, 6 by default, keeps events far below it                                                                               | none                                                     |
| A batch         | 4 MB ([HTTP API][http-api])                                                                                                                                                                                                                                                                            | nothing: RudderStack builds its own requests                                                                                                                       | none                                                     |

RudderStack adds its own context to each event, including the user's traits, which the adapter does not count, so the size measure is a lower bound, and an event just under the limit can still be refused. What RudderStack's data plane does past a limit is not verified here.

Losses follow the event's shape: the properties first, then the context.

[http-api]: https://www.rudderstack.com/docs/api/http-api/

## Identity

- `identify` calls `identify(user.id, {})`. RudderStack clears the traits it holds when `identify` names a user without traits, so the empty set keeps the traits set while the visitor was anonymous with the user who signs in, as Trace does. When the id differs from the user RudderStack holds, RudderStack resets on its own first.
- Traits call `identify(traits)` for the user RudderStack holds, which merges them into its traits. Two kinds of change cannot reach RudderStack's profiles as asked, so an update holding either sends the rest and is then reported as an unsupported step, the diagnostic `identity step unsupported`:
  - A removed trait. It is sent as `null`, so RudderStack stops attaching it to later events, but a `null` never reaches RudderStack's servers, and the trait stays on the user's profile there.
  - An object or list trait, such as `address: { city }` or `tags: [...]`. RudderStack merges such a value into the one it holds, an object key by key and a list index by index, and a `null` cannot remove a key from it, so keys the update dropped would stay on every later event. The adapter leaves such a trait out, so RudderStack never holds a merged value Trace did not ask for. Keep traits meant for RudderStack flat, such as `address_city`.
- Groups: RudderStack keeps one group per user, with no type and no call to leave it. With `group: { type }`, a membership of that type clears RudderStack's own group first, with `reset({ entries })` for the group alone, and is then one `group(id, traits)` call carrying the membership's traits. Without that clear, RudderStack would merge the new group's traits into those of the group before. A membership of any other type, and leaving the group, send nothing and are reported as unsupported steps, and so is a removed group trait, sent as `null`. Without `group`, the session has no group method.
- `reset` calls `reset({ entries: { anonymousId: true } })`, which clears the user, the traits, the group, the session and the anonymous id; RudderStack's default would keep the anonymous id. Trace resets before a different user is identified and at sign-out, so one user's events never carry the next one's ids.

## Consent

RudderStack's `consent()` leaves its pre-consent mode for good, and there is no call to enter it again, so this session has no `collection` and Trace never calls `consent()`. While a purpose the destination needs is not granted, Trace hands RudderStack nothing: every event is dropped for it as `consent`.

What RudderStack collects without Trace, such as your own `page()` calls and the device-mode destinations your RudderStack settings enable, is outside that gate. When consent gates RudderStack, load it in pre-consent mode, `preConsent: { enabled: true }`, which persists nothing, and with `events: { delivery: "buffer" }` holds what it collects, until your consent banner calls `rudderanalytics.consent()`, as in the example above.

## Behavior

- Platforms and versions: the browser, with `@rudderstack/analytics-js` 3.34 or later within 3.x, an optional peer dependency, typed structurally through `RudderStackLike`. React Native and Node have their own RudderStack SDKs, which this package does not serve.
- Initialization is yours. Trace never calls `load`. Opening the destination reads nothing and never fails: RudderStack holds every call made before it loads and replays it in order once it has.
- Evidence is `sdk-call-returned`. Every RudderStack call returns nothing, and the callback it offers runs when the event is queued, which proves no more.
- Flush: there is none, and `trace.flush()` reports `unsupported`. RudderStack delivers on its own schedule and keeps a retry queue.
- Quirks:
  - RudderStack sends the traits it holds with every event, under `context.traits`.
  - RudderStack is a router. An event Trace sends both to RudderStack and straight to a provider RudderStack also forwards to is ingested there twice, so send each provider's events through one path.
  - `RudderAnalytics` is one instance per page. Register it under one destination name: two destinations over the same instance send every event twice.
- `native` is the `RudderAnalytics` you passed in, fully typed, for everything Trace does not wrap, such as `page()` and `getAnonymousId()`. Calls made on it bypass Trace's routing, consent, receipts and privacy.

## Tests

- Against a fake modelled on @rudderstack/analytics-js 3.34.1 (`src/fakeRudderStack.fixture.ts`), which records every call in order and reproduces the SDK's quirks: calls held until `load`, its own message id, traits and group traits merged deeply into the ones it holds whichever group they came from, the traits cleared by an `identify` without traits, its own reset on another user, the anonymous id kept through a default reset, and every `null` object member left out of what it sends.
  - The session: coldness, an `open` that never refuses, the mapping, reserved names and `null` members, the 32 KB limit at its boundary, counted in UTF-8 bytes and without the `null` members RudderStack leaves out, the order of losses, identify keeping the traits, traits, their removal and object or list traits left out, groups and the clear before each, reset with the anonymous id, the absence of `collection`, `flush` and `dispose`, `native`, and that Trace never loads the SDK.
  - A real `Trace` over the fake: a receipt combining the sanitizer's losses with RudderStack's, a user switch, anonymous traits kept at sign-in, an object trait that never reaches RudderStack, a removal and another group type reported as unsupported steps, and consent.
  - `testAnalyticsAdapter`, the conformance suite, with and without a group type.
- Beside each helper in `src/utils/`: every rule of the properties over the context in `getRudderStackProperties`, what a traits update can send in `getRudderStackTraits`, and every `null` RudderStack leaves out in `getNullPaths`.
- Against the real SDK: `src/rudderstack.sdk.test.ts` runs the installed `@rudderstack/analytics-js` 3.34.1 in jsdom. It uses the package's `bundled` build, which carries the plugins the default build loads from RudderStack's CDN, answers `getSourceConfig` in place of the control plane, and records every request through a stubbed `XMLHttpRequest`. It shows an event handed over before `load` sent once loaded with its original timestamp, reserved names and `null` members kept off the wire under RudderStack's own message id, the traits kept by `identify` and a removal that never reaches the wire, an object trait through a Trace that never reaches the SDK, a new group carrying only its own traits, and a user switch through a Trace that changes the anonymous id. The conformance suite runs over the real SDK as well.
- Typecheck only (`src/rudderstack.contracts.ts`): the real `RudderAnalytics` is assigned to `RudderStackLike`, every call form the fake models is checked against the real SDK's overloads, a Trace over the adapter keeps the real type on `native`, and a wrong object, `window.rudderanalytics` while it may still be the snippet's buffer, and a group option that is not an object are refused. No other RudderStack platform's SDK is installed, so none is refused here.
- Never: nothing reaches RudderStack, so no test proves what its servers keep, refuse or deduplicate. Pre-consent mode, device-mode destinations, sessions and the retry queue are not exercised.

## License

[MIT](LICENSE)
