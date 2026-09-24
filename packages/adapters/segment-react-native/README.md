# @priemskiyyy/trace-segment-react-native

Send [Trace](../../core) events to Segment from React Native. You pass in the analytics-react-native client your application created, so this package imports no SDK. Each event is one `track` call whose enrichment sets its time and its id as the message id, and the user, their traits and one group type become Segment's own `identify` and `group` calls. In the browser, use `@priemskiyyy/trace-segment`; on a server, `@priemskiyyy/trace-segment-node`.

## Installation

```sh
pnpm add @priemskiyyy/trace @priemskiyyy/trace-segment-react-native @segment/analytics-react-native
```

analytics-react-native also needs the native packages its own installation guide lists, such as `@segment/sovran-react-native`.

## Create a Trace

```ts
import { event, Trace } from "@priemskiyyy/trace";
import { segment } from "@priemskiyyy/trace-segment-react-native";
import { createClient } from "@segment/analytics-react-native";

const client = createClient({ writeKey: "YOUR_WRITE_KEY" });

const trace = new Trace({
  events: {
    "Checkout Started": event<{ cart: { id: string }; value: number }>(),
  },
  destinations: {
    segment: segment({ sdk: client, group: { type: "workspace" } }),
  },
});

trace.start();
client.running.onChange((running) => {
  if (running) {
    trace.start();
  }
});

trace.user({ id: "user_42", traits: { plan: "pro" } });
trace.group("workspace", { id: "workspace_1", traits: { seats: 12 } });
trace.track("Checkout Started", { cart: { id: "cart_1" }, value: 49.5 });
```

`createClient` starts initializing the client without waiting for it, and the destination opens only once `client.isReady.value` and `client.running.get()` are both true: until then the client holds events, `identify` calls and `group` calls and files each under whoever it holds when it gets to them, while `reset` applies at once. The client turns `running` on when its initialization ends, after `isReady`, and `client.running.onChange` reports it. Until then the first `start()` fails and the events wait in Trace's buffer, and the start from the listener delivers them. The listener also opens the destination when a plugin of yours that paused processing before initialization ended resumes it.

## Options

| Option  | Default  | Meaning                                                                                              |
| ------- | -------- | ---------------------------------------------------------------------------------------------------- |
| `sdk`   | required | The `SegmentClient` that `createClient` answered.                                                    |
| `group` | none     | `{ type }`: the Trace group type sent as Segment's group. Without it, no membership reaches Segment. |

## How an event is mapped

Each event is one `track(name, properties, enrichment)` call, and the adapter answers once analytics-react-native has queued it.

| Trace        | Segment                                                                                                                      |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `name`       | the event name, unchanged                                                                                                    |
| `properties` | event properties, nested values and `null` included                                                                          |
| `context`    | event properties under the event's own: a context key a property shadows is an `omitted` loss                                |
| `timestamp`  | `timestamp`, as an ISO string, set by the enrichment over the time the client stamped                                        |
| `id`         | `messageId`, set by the enrichment over the one the client made, which Segment deduplicates on for at least 24 hours         |
| `identity`   | nothing on the event: the client stamps it with the user and anonymous id it holds when it processes the event, see Identity |

Segment takes any JSON, `null` included, so nothing is lost on values. The limits Segment documents:

| Limit           | Segment's documentation                                                                                             | What the adapter does                                                                                   | Loss                                                     |
| --------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| An event's size | 32 KB per call, refused with a 400 ([HTTP API][http-api]); Segment's own Node SDK checks it as 32,768 bytes of JSON | measures the name and properties it hands over as UTF-8 JSON and never sends an event past 32,768 bytes | `dropped` as `provider-filtered`, `properties` `invalid` |
| `messageId`     | under 100 characters ([HTTP API][http-api])                                                                         | sends the event's id, a 36-character UUID, which always fits                                            | none                                                     |
| A batch         | 500 KB and 2,500 events ([HTTP API][http-api])                                                                      | nothing: analytics-react-native builds its own batches, at most 500 KB each                             | none                                                     |

analytics-react-native does not check an event's size before it uploads it: it drops an event Segment refuses with a 400 as a permanent error and reports that only to its own `errorHandler`, which is why the adapter checks the size first. The client adds its own context, such as the device, the app and the library, which the adapter cannot count, so the measure is a lower bound, and an event just under the limit can still be refused. What Segment's servers do past a limit is not verified here.

Losses follow the event's shape: the properties first, then the context, and the size of the whole event last.

[http-api]: https://www.twilio.com/docs/segment/connections/sources/catalog/libraries/server/http-api

## Identity

- `identify` calls `identify(user.id)` and answers its promise, so Trace hands over the events that need the user only once the client has queued the identify.
- Traits call `identify(undefined, traits)`, which keeps the user the client holds, with a removed trait as `null`, which Segment removes from the profile. The client merges the traits into those it keeps and sends the whole set with every identify.
- Groups: Segment keeps no group type and has no call to leave a group. With `group: { type }`, a membership of that type is one `group(id, traits)` call, and its promise is answered too. A membership of any other type, and leaving the group, send nothing and are reported as unsupported steps, the diagnostic `identity step unsupported`. Without `group`, the session has no group method.
- `reset` calls `reset()` and answers its promise, which settles once the client has forgotten the user and the traits and started a new anonymous id. Trace resets before a different user is identified and at sign-out, so an identified event never carries the next user's ids.
- Whom an event is filed under: analytics-react-native stamps an event with the user and anonymous id it holds when it processes the event. While the client is ready and running, that is at the call, because the client reads its user from the same store, and in the same order, as `identify` and `reset` write it. So an event tracked before a sign-in stays anonymous, and an event in flight when the user switches keeps its user. No per-call option could pin the user otherwise: the enrichment runs after the stamp, and Trace does not know the client's anonymous id to pin it to. The one exception is a plugin of yours that pauses event processing, a `WaitingPlugin`: while processing is paused, the client holds events, `identify` calls and `group` calls and processes them in order when processing resumes, stamping each event with whoever it holds by then, but `reset` takes effect at once. So the events held across a sign-in keep the user each was tracked for, but one held across a sign-out or a switch is filed under the anonymous id the reset started, without its user, and a sign-in held from before that reset is applied after it, to the events that follow. A client that is not ready and running yet holds calls the same way, which is why the destination opens only once it is both.

## Consent

Trace switches Segment's collection with `client.enabled.set(...)`. While it is `false`, analytics-react-native drops `track`, `identify` and `group` at the call, so a dropped `identify` leaves the user it holds unchanged, and the events it queued before still upload. The client takes a new setting a microtask after the call, so Trace waits for the switch to settle, up to its `timeout`, before it sends Segment anything more: the user, the traits and the events that follow a grant reach an enabled client. A switch that rejects or outlasts the timeout is the diagnostic `destination collection failed`, and Trace goes on. The client keeps the setting in its storage across launches, so it outlives Trace: if you stop using Trace for Segment, set `client.enabled` back yourself. A gated destination is disabled as soon as it opens while its purpose is unknown, enabled once every purpose it needs is granted, and disabled again when one is withdrawn.

analytics-react-native records no event of its own unless you ask it to: keep `trackAppLifecycleEvents` and `trackDeepLinks` off, their defaults, when consent gates Segment, or those events are sent outside Trace's consent. The device-mode destinations your Segment settings enable run outside it too.

## Behavior

- Platforms and versions: iOS and Android, with `@segment/analytics-react-native` 2.24 or later within 2.x, an optional peer dependency, typed structurally through `SegmentLike`, and an engine that provides `TextEncoder`, such as Hermes in React Native 0.74 or later. The client needs its native modules, so it runs in development builds and in Expo builds with them, not in Expo Go.
- Initialization is yours. Trace never creates, initializes or cleans up the client. Opening the destination fails with `TraceError` `NOT_INITIALIZED` until `client.isReady.value` and `client.running.get()` are both true; call `trace.start()` again from `client.running.onChange`, as above, and the events that waited in Trace's buffer are delivered.
- Evidence is `sdk-call-returned`: `track` settles once the client has queued the event, or held it while processing is paused, which proves nothing about its upload. A client that is disabled when an event reaches it, by you or because a switch of Trace's did not settle within the timeout, drops the event without saying so, and the receipt still says `submitted`.
- Flush: `trace.flush()` calls the client's `flush()`, which never rejects and settles after its upload attempt, then counts `pendingEvents()`: none left answers `flushed`, and any left, kept for a retry, answers `failed` with `TraceError` `DELIVERY_FAILED`. The count covers every queued event, including ones your application tracked through the client while the flush ran. The client's `flush()` first waits for its settings with no time limit of its own; Trace's timeout bounds the wait.
- Quirks:
  - Segment is a router. An event Trace sends both to Segment and straight to a provider Segment also forwards to is ingested there twice, so send each provider's events through one path.
  - The client's storage is keyed by its write key, so clients with the same key share their user. Create one client and register it under one destination name: two destinations over the same client track every event twice.
- `native` is the `SegmentClient` you passed in, fully typed, for everything Trace does not wrap, such as `screen()`. Calls made on it bypass Trace's routing, consent, receipts and privacy.

## Tests

- Against a fake modelled on `@segment/analytics-react-native` 2.24.1 (`src/fakeSegment.fixture.ts`), which records every call with its arguments in order and reproduces the client's identity rules: while it is ready and running, an event stamped at the call with a message id and time of its own and with the user and anonymous id held then, a track's enrichment answering the event that is queued, and identify holding its user or keeping the one it holds for `undefined` and merging traits; until then, and while paused, events, identify and group held and processed in order once `running` turns on; `reset` writing a microtask after the call, even then; `enabled.set` taking effect a microtask after the call, and a disabled client dropping calls; promises a test can hold; and a flush that keeps the queue while offline. It works through the calls it held before any later call, where the real client can let a later call overtake them.
  - The session: coldness, `NOT_INITIALIZED` before the client is ready and before it runs, the mapping, the call made before anything is awaited, an answer that waits for the queue, the 32 KB limit at its boundary and counted in UTF-8 bytes, the order of losses, a rejected track, a disabled client, identify, traits, groups, reset and their promises, collection, flush, and `native`.
  - A real `Trace` over the fake: a start that fails until the client is ready and a retry, a first launch whose start fails until the client runs and whose start from `running.onChange` delivers each event under its user, a receipt combining the sanitizer's losses with Segment's, an event tracked before a sign-in with the identify held, an event in flight at a user switch with the reset held, a sign-out, a paused client holding events and identify in order while `reset` applies at once, the configured group with its call held and another type reported as an unsupported step, consent, with an event tracked in the tick of the grant and a user who signed in before it, flush, `native`, and that Trace never initializes or cleans up the client.
  - `testAnalyticsAdapter`, the conformance suite, with and without a group type.
- Beside the helper in `src/utils/`: the properties over the context and the losses in `getSegmentProperties`.
- Typecheck only (`src/segment.contracts.ts`): the real `SegmentClient`, and one from `createClient`, are assigned to `SegmentLike`, the fake is pinned to the real client's members, `running` included, `track` through `SegmentLike`, a Trace over the adapter keeps the real type on `native`, and a wrong object, analytics-next, the Node client and a group option that is not an object are refused.
- Never: analytics-react-native itself, which needs a React Native runtime and its native modules, a device, or Segment's servers, so no test proves what they keep, refuse or deduplicate. How the real client works through the calls it held, which lets a later call overtake them, is read from the source, not run. There is no test against the real SDK.

## License

[MIT](LICENSE)
