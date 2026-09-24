# @priemskiyyy/trace-amplitude-node

Send [Trace](../../core) events to Amplitude from a server. You pass in the `@amplitude/analytics-node` SDK your application initialized, and its `Identify` class, so this package imports no SDK. A server builds one Trace per request or job over that shared SDK, and each event is one `track` call for its user and the visitor's device, with its time and its id as `insert_id`; traits and groups become `identify`, `setGroup` and `groupIdentify` calls for the same ids. In the browser or on React Native, use [`@priemskiyyy/trace-amplitude`](../amplitude).

## Installation

```sh
pnpm add @priemskiyyy/trace @priemskiyyy/trace-amplitude-node @amplitude/analytics-node
```

## Create a Trace

One SDK for the process, one Trace per request or job. A Trace is cheap to build, and a Trace per request never mixes two users:

```ts
import * as Amplitude from "@amplitude/analytics-node";
import { event, Trace } from "@priemskiyyy/trace";
import { amplitude } from "@priemskiyyy/trace-amplitude-node";

Amplitude.init("amplitude_api_key");

const events = {
  "Checkout Started": event<{ cart: { id: string }; value: number }>(),
};

export const trackCheckout = async (
  visitorId: string,
  user: { id: string; plan: string },
  cart: { id: string; value: number },
) => {
  const trace = new Trace({
    events,
    destinations: {
      product: amplitude({
        sdk: Amplitude,
        Identify: Amplitude.Identify,
        anonymousId: visitorId,
      }),
    },
  });

  trace.start();
  trace.user({ id: user.id, traits: { plan: user.plan } });
  trace.track("Checkout Started", { cart: { id: cart.id }, value: cart.value });

  await trace.flush();
  trace.dispose();
};
```

`visitorId` is the visitor id your application already keeps for signed-out traffic, such as a cookie; the device id Amplitude's browser SDK keeps in the same browser is a good one. The SDK keeps its queue in memory and uploads it every 10 seconds. Flush every request where one request runs at a time, as in a serverless function; a server that handles requests concurrently reads the flush bullet under Behavior first.

## Options

| Option        | Default  | Meaning                                                                                                                                                                                                                                   |
| ------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sdk`         | required | The Node SDK your application initialized: the module namespace or an instance from `createInstance()`. The browser and React Native SDKs are refused by the types, because they keep a user and fill it into every call that names none. |
| `Identify`    | required | Amplitude's `Identify` class, from the same SDK. User and group properties travel through it, and this package cannot import it.                                                                                                          |
| `anonymousId` | none     | The visitor id of the request. Every call carries it as `device_id`, beside the user's `user_id` once there is one.                                                                                                                       |

## How an event is mapped

Each event is one `track(name, properties, { user_id, device_id, time, insert_id })` call.

| Trace                            | Amplitude                                                                                                                                            |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `event.name`                     | the event type, unchanged                                                                                                                            |
| `event.properties`               | `event_properties`                                                                                                                                   |
| `event.context`                  | `event_properties` too, under the event's own properties                                                                                             |
| `event.id`                       | `insert_id`: Amplitude ignores a repeated insert id from the same device for 7 days                                                                  |
| `event.timestamp`                | `time`                                                                                                                                               |
| `event.identity.user`            | `user_id`, the user the event was accepted with, however long it waited                                                                              |
| the `anonymousId` option         | `device_id`                                                                                                                                          |
| neither a user nor `anonymousId` | nothing: the event is `skipped` as `unidentified`, because Amplitude "can reject the event with a 400 status" when it has neither ([HTTP API][http]) |

A context key that a property of the event shadows is left out, an `omitted` loss at `context.<key>`. Losses are listed in the order of the event: properties, then context.

The Node SDK fills in no user and no device of its own: its context plugin builds each event from its `time`, `insert_id`, `plan` and `ingestion_metadata` and then spreads the call's own fields over them (`@amplitude/analytics-node` 1.5.73, `lib/esm/plugins/context.js:19-24`), and `init` adds only that plugin and its destination (`lib/esm/node-client.js:29-32`). So each call carries exactly the ids the adapter gives it, whatever other requests do over the same SDK at the same moment, and a server needs no identity plugin, unlike [`@priemskiyyy/trace-amplitude`](../amplitude). The adapter never calls `setUserId` or any identity of the SDK's own, and the Node SDK has none.

The adapter checks every limit Amplitude documents that it can check on the server, in Amplitude's own unit. Where Amplitude cuts a value itself, the value is sent and reported `truncated`. String lengths are counted in UTF-16 code units, JavaScript's `length`.

| Limit                             | Amplitude's documentation                                                                                                                                                                                                                                   | What the adapter does                                                                                                                                                                                                                                                                                                 | Loss                                 |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| A property value's length         | "Amplitude limits most property values to 1,024 characters" and "Amplitude truncates values that exceed these limits" ([limits][limits])                                                                                                                    | sends it whole, for Amplitude to cut                                                                                                                                                                                                                                                                                  | `truncated` past 1,024 characters    |
| Nesting                           | "Object depth may not exceed 40 layers", for event and user properties ([HTTP API][http])                                                                                                                                                                   | leaves out an object or list past the 40th layer, counting `event_properties` as the first                                                                                                                                                                                                                            | `unsupported` per value left out     |
| What `Identify` takes             | analytics-core 2.57 `utils/valid-properties.js` drops a whole user property holding a `null`, a boolean or list inside a list, or an object of more than 1,000 keys                                                                                         | strips a `null` inside an object in a value and sends the rest of it; leaves out whole a value holding a `null` in a list, whose later items stripping it would shift, any of the others, or anything past the 40th layer, as `Identify` would; sends the rest and throws `TraceError` `UNSUPPORTED` naming each path | none: identity calls have no receipt |
| A user or group property's length | the 1,024 characters above, which Amplitude cuts                                                                                                                                                                                                            | leaves out a value holding a string over 1,024 characters, so no stored value is cut, sends the rest, and throws `TraceError` `UNSUPPORTED`                                                                                                                                                                           | none: identity calls have no receipt |
| User and device ids               | "Device IDs and User IDs must be strings of 5 characters or more", "If an event contains a device ID or user ID that's too short, Amplitude removes the ID value from the event", and ids such as `null`, `unknown` or `-1` answer a 400 ([HTTP API][http]) | checks neither: `init` can lower the minimum with `minIdLength`, and the page does not say how it compares case                                                                                                                                                                                                       | none                                 |
| A request's size                  | "Keep request sizes under 1 MB" ([HTTP API][http])                                                                                                                                                                                                          | nothing: the SDK builds its batches of `flushQueueSize` events                                                                                                                                                                                                                                                        | none                                 |

Amplitude takes a `min_id_length` option that lowers the minimum, and the SDK sends your `minIdLength` with every upload, so the adapter checks no id length, as [`@priemskiyyy/trace-amplitude`](../amplitude) does. Amplitude removes an id shorter than the minimum from the event: an event whose user id is too short is filed under the visitor's device alone, and one left with no id is refused with a 400, which the next flush reports as `failed`. Keep user and visitor ids at least 5 characters long, or lower the minimum at `init`. What is not verified: what Amplitude does with an event type or a user id over 1,024 characters, which the [HTTP API][http] page limits without saying whether it cuts or refuses them, and whether Amplitude counts its 1,024 characters in UTF-16 code units, as the adapter does.

[limits]: https://amplitude.com/docs/faq/limits
[http]: https://amplitude.com/docs/apis/analytics/http-v2

## Identity

The Node SDK holds no user between calls: every call carries its own ids. So the session has no `identify` and no `reset`, Trace plans no identity switch for it, and a user switch in a Trace needs no reset: each event and each update names its own user.

- Traits are one `Identify` per change: an `unset` for each removed trait and a `set` for each value, sent with `identify(identify, { user_id, device_id })` for the user the change names, or for the visitor's device alone while signed out. A value `Identify` refuses, or one past a limit, is left out, the rest is sent, and the change is reported as unsupported, the diagnostic `identity step unsupported`. Without a user or a visitor id, traits send nothing and are reported as unsupported.
- A group membership is `setGroup(type, id, { user_id, device_id })`, and its traits a `groupIdentify(type, id, identify, ...)` with the same ids; a group trait set to `null` is an `unset` on the group. Leaving a group is `setGroup(type, [])`: Amplitude documents no way to leave one, so this is best effort, and it overwrites the value held under that group type.
- A call that carries both a user and the visitor links the visitor's device to that user in Amplitude. Give a visitor a new anonymous id when a user signs out, as Amplitude's browser SDK does at a reset, or the next person on that browser shares the previous user's device.
- An event keeps the user it was accepted with. The Trace drops a signed-out user's waiting events at the switch, and one handed over is sent under its own ids whatever the Trace holds by then, so there is no `auth-subject-mismatch` to check: the SDK authenticates with your API key, never as a user.

## Consent

The SDK collects nothing on its own for Trace, so there is nothing to initialize opted out, and its `setOptOut` switches the whole SDK, for every request over it: one visitor's refusal would silence every other visitor's events. This session has no `collection`, and Trace calls nothing on Amplitude for consent. Each per-request Trace gates its own destination: set the request's consent decisions with `trace.consent.set(...)` before `trace.start()`; while a purpose the destination needs is not granted, Trace hands Amplitude nothing, and every event is dropped for it as `consent`. An upload your own code skipped with `setOptOut(true)` answers code 0, which `trace.flush()` counts as refused.

## Behavior

- Platforms and versions: Node, with `@amplitude/analytics-node` 1.5 or later within 1.x, an optional peer dependency, typed structurally through `AmplitudeLike`. The SDK uploads through Node's `http` and `https`, so it runs in Node only.
- Initialization is yours, and Trace never initializes the SDK. Calls made before `init` wait in the SDK's queue and are processed once it has run, so `open` never refuses; the Node SDK exposes nothing that says whether `init` ran.
- Evidence is `sdk-call-returned`: `track` answers once Amplitude took the call. The upload follows at `flushQueueSize` events or every `flushIntervalMillis`, 10 seconds by default, longer than Trace's `timeout`, and only a flush reads its result.
- Flush: `trace.flush()` calls the SDK's `flush()` and then waits for the upload of every call this destination made that is still in flight, events, traits and group changes alike, within the time `trace.flush()` gives it, because the SDK's flush can answer while an upload is in flight and never rejects. It answers `flushed` when Amplitude accepted all of them, and `failed` with a `TraceError` whose code is `DELIVERY_FAILED` when Amplitude answered any of this destination's uploads outside 2xx since the last flush that answered in time, so a refusal that lands after a flush ran out of time goes to the next one, and each of two overlapping flushes reports the refusals it saw. The SDK's `flush()` sends the events every Trace over the SDK has queued, not only this one's, and sends them without retries, so a flush can turn a passing server error into a lost event. The SDK runs one flush at a time: a flush that overlaps another Trace's is skipped, its events wait for the SDK's own timer (`flushIntervalMillis`, 10 seconds by default), and `trace.flush()` answers `timeout` unless its time outlasts that timer. On a server that handles requests concurrently, let the SDK send on its own schedule and flush once at shutdown; flush every request where one request runs at a time, as in a serverless function. The SDK has no `shutdown`: flush before the process or a serverless handler ends, since its queue lives in memory.
- `native` is the SDK you passed in, fully typed, for everything Trace does not wrap, such as `revenue`. Calls made on it bypass Trace's routing, consent, receipts and privacy.

## Tests

- Against a fake modelled on `@amplitude/analytics-node` 1.5.73 (`src/fakeAmplitude.fixture.ts`), with every member typed as the real SDK types it: each call builds the event the SDK builds and answers at once, the event is processed as the SDK's context plugin does, its own `time` and `insert_id` giving way to the call's and no user or device filled in, nothing is processed before `init`, and `flush` answers before the uploads. User properties go through the SDK's own `Identify`.
  - The session: coldness, the name `amplitude-node`, `open` never refusing, the mapping, the user and device of every call, `unidentified`, ids shorter than 5 characters sent as they are, the losses, an event keeping its user after a later switch, traits, groups, leaving a group, the refusals, flush waiting for every upload of its own session, an upload refused before the flush reported by the next flush and by no later one, the absence of `identify`, `reset`, `collection` and `dispose`, `native`, and that Trace never initializes the SDK.
  - A real `Trace` over the fake: receipts combining the sanitizer's losses with Amplitude's, a user switch without a reset, a sign-out with and without a visitor id, traits set while signed out, a consent-gated destination, per-request Traces over one SDK interleaving sign-ins, traits, memberships, a sign-out and events, per-request Traces sharing one adapter, and a flush that answers `flushed`, then `failed`.
  - `testAnalyticsAdapter`, the conformance suite, without options and with a visitor id.
- Beside each helper in `src/utils/`: the ids of a call, the properties over the context, each property value, what `Identify` takes, and the uploads a flush waits for and reports, a flush that ran out of time and overlapping flushes included. All but the first are the browser package's own helpers, copied.
- Against the real SDK: `src/amplitude.sdk.test.ts` initializes the installed `@amplitude/analytics-node` 1.5.73 with its `transportProvider` option in place of the network, the SDK's own transport building every answer, and reads every upload: the event with its user, device, time and insert id; a call that names no id uploaded without any, since no plugin fills one in; two Traces over one SDK, one per request, keeping their own users in the same tick; traits and a membership as `$identify` and `$groupidentify`; what the real `Identify` drops of a trait; a flush that answers `flushed` after a 2xx and `failed` after a 500; an upload refused in another Trace's flush, which this Trace's next flush reports; a refusal that lands after a flush ran out of time, which the next flush reports; a flush that overlaps another Trace's, which answers `timeout` while its event waits for the SDK's timer; an SDK your code opted out; and a user switch through a Trace. The conformance suite runs over the real SDK as well.
- Typecheck only (`src/amplitude.contracts.ts`): the module namespace and `createInstance()` assigned to `AmplitudeLike`, the real `Identify` to `AmplitudeIdentifyLike`, the fake pinned to the SDK's `NodeClient`, `native` keeping the real type through a `Trace`, and a wrong object, the browser and React Native SDKs, an `Identify` instance, a missing `Identify` and an anonymous id that is not a string refused.
- Never: nothing reaches Amplitude, so no test proves what its servers keep, deduplicate, throttle or refuse, or how its identity resolution links a device to a user. Retries after a scheduled upload and the `minIdLength` option are not exercised.

## License

[MIT](LICENSE)
