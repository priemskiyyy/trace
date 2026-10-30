# @priemskiyyy/trace-segment

Send [Trace](../../core) events to Segment in the browser. You pass in the analytics-next `Analytics` your application loaded, so this package imports no SDK. Each event is one `track` call carrying its time and its id as the message id, and the user, their traits and one group type become Segment's own `identify` and `group` calls. On React Native, use `@priemskiyyy/trace-segment-react-native`; on a server, `@priemskiyyy/trace-segment-node`.

Version 0.1.0 is an initial preview. APIs may change before 1.0. See the [verification limits](https://github.com/priemskiyyy/trace/blob/main/docs/verification.md) before adopting an adapter.

## Installation

```sh
pnpm add @priemskiyyy/trace @priemskiyyy/trace-segment @segment/analytics-next
```

## Create a Trace

```ts
import { event, Trace } from "@priemskiyyy/trace";
import { segment } from "@priemskiyyy/trace-segment";
import { AnalyticsBrowser } from "@segment/analytics-next";

const [analytics] = await AnalyticsBrowser.load({ writeKey: "YOUR_WRITE_KEY" });

const trace = new Trace({
  events: {
    "Checkout Started": event<{ cart: { id: string }; value: number }>(),
  },
  destinations: {
    segment: segment({ sdk: analytics, group: { type: "workspace" } }),
  },
});

trace.start();
trace.user({ id: "user_42", traits: { plan: "pro" } });
trace.group("workspace", { id: "workspace_1", traits: { seats: 12 } });
trace.track("Checkout Started", { cart: { id: "cart_1" }, value: 49.5 });
```

## Options

| Option  | Default  | Meaning                                                                                                                                                                    |
| ------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sdk`   | required | The `Analytics` that `AnalyticsBrowser.load` resolved with, or the wrapper's `instance` once it has loaded. The `AnalyticsBrowser` wrapper itself is refused by the types. |
| `group` | none     | `{ type }`: the Trace group type sent as Segment's one group. Without it, no membership reaches Segment.                                                                   |

## How an event is mapped

Each event is one `track(name, properties, { timestamp, messageId })` call.

| Trace              | Segment                                                                                                                                                                                               |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `event.name`       | the event name, unchanged                                                                                                                                                                             |
| `event.properties` | event properties, nested values and `null` included                                                                                                                                                   |
| `event.context`    | event properties under the event's own: a context key a property shadows is an `omitted` loss                                                                                                         |
| `event.timestamp`  | `timestamp`, as a `Date`                                                                                                                                                                              |
| `event.id`         | `messageId`, which Segment deduplicates on for at least 24 hours                                                                                                                                      |
| `event.identity`   | nothing on the event: analytics-next stamps it at the call with its anonymous id and the user it holds, which Trace set before it; an anonymous event takes a user only when it is sent, see Identity |

Segment takes any JSON, `null` included, so nothing is lost on values. The limits Segment documents:

| Limit           | Segment's documentation                                                                                             | What the adapter does                                                                                   | Loss                                                     |
| --------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| An event's size | 32 KB per call, refused with a 400 ([HTTP API][http-api]); Segment's own Node SDK checks it as 32,768 bytes of JSON | measures the name and properties it hands over as UTF-8 JSON and never sends an event past 32,768 bytes | `dropped` as `provider-filtered`, `properties` `invalid` |
| `messageId`     | under 100 characters ([HTTP API][http-api])                                                                         | sends the event's id, a 36-character UUID, which always fits                                            | none                                                     |
| A batch         | 500 KB and 2,500 events ([HTTP API][http-api])                                                                      | nothing: analytics-next builds its own batches                                                          | none                                                     |

analytics-next reports a refused event only through its own `delivery_failure` error event, never to the caller, which is why the adapter checks the size first. It adds its own context, such as the page, the user agent and the library, which the adapter cannot count, so the measure is a lower bound, and an event just under the limit can still be refused. What Segment's servers do past a limit is not verified here.

Losses follow the event's shape: the properties first, then the context, then the whole event's size last.

[http-api]: https://www.twilio.com/docs/segment/connections/sources/catalog/libraries/server/http-api

## Identity

- `identify` calls `identify(user.id)`. analytics-next holds the user as soon as the call returns and stamps every later event with it. Its promise settles after the first attempt to send the identify event and proves no more, so the adapter does not wait for it, and a rejection never reaches your application as an unhandled rejection.
- Traits call `identify(traits)` for the user analytics-next holds, with a removed trait as `null`, which Segment removes from the profile. analytics-next merges the traits under the same user and sends the whole set with every identify.
- Groups: Segment keeps one group per user, with no type and no call to leave it. With `group: { type }`, a membership of that type is one `group(id, traits)` call. A membership of any other type, and leaving the group, send nothing and are reported as unsupported steps, the diagnostic `identity step unsupported`. Without `group`, the session has no group method.
- `reset` calls `reset()`, which forgets the user, the anonymous id, the traits and the group; analytics-next makes a new anonymous id for the next event. Trace resets before a different user is identified and at sign-out, so an identified event never carries the next user's ids.
- An anonymous event carries its anonymous id from the call, but analytics-next gives it a user only when it sends it, at every attempt: its Segment.io plugin fills a missing `userId` with the user it holds by then. No per-call option pins it: a `userId` option is replaced by the user analytics-next holds when it sends and survives only while it holds none, and an `anonymousId` option changes the anonymous id of every later call. So an anonymous event still in analytics-next's pipeline when someone signs in is filed under that user, and after a switch under the next one, with the anonymous id from before the sign-in, which links the two. The same holds for an identify or group call made while anonymous. Online, the window is the tick in which the event was handed over; the offline buffer and the retry queue stretch it to minutes. On a shared device, load analytics-next with `retryQueue: false`: an event whose request fails is then dropped instead of retried, and nothing is buffered offline, which leaves only that tick. An identified event keeps its user however long it waits.

## Consent

analytics-next has no switch to turn its collection off and back on once it has loaded, only `disable` at load, so this session has no `collection` and Trace calls nothing on Segment for consent. While a purpose the destination needs is not granted, Trace hands Segment nothing: every event is dropped for it as `consent`.

What analytics-next sends without Trace is outside that gate: the device-mode destinations your Segment settings enable, an `initialPageview`, and your own `page()` calls. When consent gates Segment, load analytics-next only once consent allows it, for example through Segment's `@segment/analytics-consent-tools`, and create the Trace over the loaded instance. Or load it at once with `disableClientPersistence: true` and without `initialPageview`, so it stores no identifier in cookies or localStorage and sends no page view of its own, at the cost of a new anonymous id on every page load. Either way, the device-mode destinations your Segment settings enable still load and may collect.

## Behavior

- Platforms and versions: the browser, with `@segment/analytics-next` 1.84 or later within 1.x, an optional peer dependency, typed structurally through `SegmentLike`. Customer.io's browser client, `@customerio/cdp-analytics-browser`, has the same surface, but it ignores `messageId`, so deduplication does not apply there; it is not installed here, so no contract checks it.
- Initialization is yours. Trace never loads analytics-next and never calls `init`, `initialize`, `register` or `page`. An `Analytics` that `AnalyticsBrowser.load` has not finished fails the destination's start with `TraceError` `NOT_INITIALIZED`; call `trace.start()` again once it has loaded, and the events that waited in Trace's buffer are delivered.
- Evidence is `sdk-call-returned`: `track` had queued the event, stamped with its anonymous id and any user it holds, when it returned. Its promise settles after the first attempt, a failed one queued for a retry included, at once while offline, and at enqueue in batching mode, so it proves no more and the adapter answers without waiting for it.
- Flush: there is none, and `trace.flush()` reports `unsupported`. analytics-next delivers on its own schedule and keeps its retry queue in localStorage.
- Quirks:
  - An analytics-next loaded with `disable` is a stand-in that reports it has loaded and sends nothing. The adapter cannot tell it apart, so its receipts say `submitted`.
  - Segment is a router. An event Trace sends both to Segment and straight to a provider Segment also forwards to is ingested there twice, so send each provider's events through one path.
  - analytics-next is one instance per page. Register it under one destination name: two destinations over the same instance send every event twice.
- `native` is the `Analytics` you passed in, fully typed, for everything Trace does not wrap, such as `page()`. Calls made on it bypass Trace's routing, consent, receipts and privacy.

## Tests

- Against a fake modelled on analytics-next 1.84.3 (`src/fakeSegment.fixture.ts`), which records every call in order and reproduces the SDK's identity rules: the anonymous id and any user stamped at the call, a missing user filled when the test sends the event, traits merged under the same user and replaced with a new anonymous id for the next, one group replaced by the next, everything forgotten on `reset`, and promises that reject when the SDK refuses a call.
  - The session: coldness, `NOT_INITIALIZED`, the mapping, the 32 KB limit at its boundary and counted in UTF-8 bytes, the order of losses, rejections contained, identify, traits, groups, reset, the absence of `collection`, `flush` and `dispose`, `native`, and that Trace never initializes the SDK.
  - A real `Trace` over the fake: a start that fails until analytics-next has loaded and a retry, a receipt combining the sanitizer's losses with Segment's, a user switch, a sign-out, an anonymous event sent after a sign-in and after a switch, groups through the planner with another type reported as an unsupported step, and consent.
  - `testAnalyticsAdapter`, the conformance suite, with and without a group type.
- Beside the helper in `src/utils/`: the properties over the context and the losses in `getSegmentProperties`.
- Against the real SDK: `src/segment.sdk.test.ts` loads the installed `@segment/analytics-next` 1.84.3 in jsdom, with `cdnSettings` in place of the CDN and `fetch` stubbed, and reads every request it sends: the track with its message id, timestamp and properties over its context, identify, traits with a `null` removal, the group, a user switch through a Trace that changes the anonymous id, an anonymous event sent after a sign-in under the user who signed in, an anonymous event retried after a failed attempt under the user held by then, the same event dropped instead with `retryQueue: false`, and the readiness flag of an `Analytics` that has not loaded. The conformance suite runs over the real SDK as well.
- Typecheck only (`src/segment.contracts.ts`): the real `Analytics` is assigned to `SegmentLike`, the fake's calls are pinned to analytics-next's parameters, a Trace over the adapter keeps the real type on `native`, and a wrong object, the `AnalyticsBrowser` wrapper, the React Native and Node clients and a group option that is not an object are refused.
- Never: nothing reaches Segment, so no test proves what its servers keep, refuse or deduplicate. Batching, the offline buffer, device-mode destinations and `disable` are not exercised.

## License

[MIT](LICENSE)
