# @priemskiyyy/trace-segment-node

Send [Trace](../../core) events to Segment from a server. You pass in the `@segment/analytics-node` client your application constructed, so this package imports no SDK. A server builds one Trace per request or job over that shared client, and each event is one `track` call for its user and the visitor's anonymous id, carrying its time and its id as the message id; traits and one group type become Segment's own `identify` and `group` calls for the same ids. In the browser, use `@priemskiyyy/trace-segment`; on React Native, `@priemskiyyy/trace-segment-react-native`.

## Installation

```sh
pnpm add @priemskiyyy/trace @priemskiyyy/trace-segment-node @segment/analytics-node
```

## Create a Trace

One client for the process, one Trace per request or job. A Trace is cheap to build, and a Trace per request never mixes two users:

```ts
import { event, Trace } from "@priemskiyyy/trace";
import { segment } from "@priemskiyyy/trace-segment-node";
import { Analytics } from "@segment/analytics-node";

const analytics = new Analytics({ writeKey: "YOUR_WRITE_KEY" });

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
      segment: segment({
        sdk: analytics,
        group: { type: "workspace" },
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

`visitorId` is the visitor id your application already keeps for signed-out traffic, such as a cookie. Flush every request where one request runs at a time, as in a serverless function; a server that handles requests concurrently reads the flush bullet under Behavior first. Close the client yourself when the process ends, with `await analytics.closeAndFlush()`; Trace never does.

## Options

| Option        | Default  | Meaning                                                                                                                                                                      |
| ------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sdk`         | required | The `Analytics` client your application constructed. Segment's browser and React Native SDKs are refused by the types.                                                       |
| `group`       | none     | `{ type }`: the Trace group type sent as Segment's one group. Without it, no membership reaches Segment.                                                                     |
| `anonymousId` | none     | The visitor id of the request. Every call carries it as `anonymousId`, beside the user's `userId` once there is one. Without it, a call without a user cannot reach Segment. |

## How an event is mapped

Each event is one `track({ userId, anonymousId, event, properties, timestamp, messageId })` call.

| Trace                            | Segment                                                                                                   |
| -------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `event.name`                     | `event`, unchanged                                                                                        |
| `event.properties`               | `properties`, nested values and `null` included                                                           |
| `event.context`                  | `properties` under the event's own: a context key a property shadows is an `omitted` loss                 |
| `event.timestamp`                | `timestamp`, as a `Date`                                                                                  |
| `event.id`                       | `messageId`, which Segment deduplicates on for at least 24 hours                                          |
| `event.identity.user`            | `userId`, the user the event was accepted with, however long it waited                                    |
| the `anonymousId` option         | `anonymousId`                                                                                             |
| `event.identity.traits`          | nothing on the event: traits reach Segment as `identify` calls, see Identity                              |
| `event.identity.groups`          | nothing on the event: a membership reaches Segment as a `group` call, see Identity                        |
| neither a user nor `anonymousId` | nothing: the event is `skipped` as `unidentified`, because analytics-node throws on a call without either |

Segment takes any JSON, `null` included, so nothing is lost on values. The limits Segment documents:

| Limit           | Segment's documentation                                                                           | What the adapter does                                                                                   | Loss                                                     |
| --------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| An event's size | 32 KB per call, refused with a 400 ([HTTP API][http-api]); analytics-node sets it at 32,768 bytes | measures the name and properties it hands over as UTF-8 JSON and never sends an event past 32,768 bytes | `dropped` as `provider-filtered`, `properties` `invalid` |
| `messageId`     | under 100 characters ([HTTP API][http-api])                                                       | sends the event's id, a 36-character UUID, which always fits                                            | none                                                     |
| A batch         | 500 KB and 2,500 events ([HTTP API][http-api])                                                    | nothing: analytics-node builds its own batches, at most 480 KB                                          | none                                                     |

analytics-node 3.1.0 checks the 32 KB itself, but its measure counts the characters `encodeURI` escapes and the letter `i`, not the event's bytes, so it lets most oversized events into a batch. A 400 answer then fails the whole batch, the other events in it included, which is why the adapter checks the size first. analytics-node adds its own context, such as the library and the runtime, which the adapter cannot count, so the measure is a lower bound, and an event just under the limit can still be refused. What Segment's servers do past a limit is not verified here.

Losses follow the event's shape: the properties first, then the context, and the size of the whole event last.

[http-api]: https://www.twilio.com/docs/segment/connections/sources/catalog/libraries/server/http-api

## Identity

analytics-node holds no user between calls: identity travels on every call. So the session has no `identify` and no `reset`, Trace plans no identity switch for it, and a user switch in a Trace needs no reset: each event and each update names its own user.

- Traits call `identify({ userId, anonymousId, traits })` for the user the update names, with a removed trait as `null`, which Segment removes from the profile. Traits set while signed out go to the anonymous id, and reach the user's profile with both ids once the user signs in. Without a user and without `anonymousId`, traits send nothing and are reported as an unsupported step, the diagnostic `identity step unsupported`.
- Groups: Segment keeps one group per user, with no type and no call to leave it. With `group: { type }`, a membership of that type is one `group({ userId, anonymousId, groupId, traits })` call. A membership of any other type, leaving the group, and a membership with neither a user nor `anonymousId` send nothing and are reported as unsupported steps. Without `group`, the session has no group method.
- A call that carries both a user and the anonymous id links the visitor to that user in Segment. Give a visitor a new anonymous id when a user signs out, as Segment's browser SDK does, or the next person on that browser is linked to the same visitor.
- An event keeps the user it was accepted with. The Trace drops a signed-out user's waiting events at the switch, and one handed over is sent under its own `userId` whatever the Trace holds by then, so there is no `auth-subject-mismatch` to check: analytics-node authenticates with your write key, never as a user.

## Consent

analytics-node collects nothing on its own, so there is nothing to initialize opted out, and it has no switch to turn off and on again once constructed: `disable` is a constructor option for the whole client and every user. This session has no `collection`, and Trace calls nothing on Segment for consent. Set the request's consent decisions with `trace.consent.set(...)` before `trace.start()`; while a purpose the destination needs is not granted, Trace hands Segment nothing, and every event is dropped for it as `consent`.

## Behavior

- Platforms and versions: Node and the edge runtimes analytics-node supports, with `@segment/analytics-node` 3.1 or later within 3.x, an optional peer dependency, typed structurally through `SegmentLike`.
- Initialization is yours. Trace never constructs, configures or closes the client, and never calls `closeAndFlush()`, which is permanent. The client takes calls from the moment it is constructed, so `open` never refuses.
- Evidence is `sdk-call-returned`: `track` queued the event for its next batch when it returned. analytics-node sends a batch when it holds `flushAt` events or after `flushInterval`, 10 seconds by default, longer than Trace's `timeout`, so the adapter answers at the call and never waits for the batch.
- Flush: `trace.flush()` calls the client's `flush()` without a timeout, because a timeout aborts the batches in flight. Trace's own `timeout` ends the wait with `timeout` and never the batch, which analytics-node goes on sending and retrying. `flushed` means analytics-node has sent or failed every event it held, those of other Traces included; it does not say whether Segment accepted them. analytics-node runs one flush at a time and answers a flush that overlaps a running one at once, before anything was sent, with a console warning. Every Trace over one adapter shares that adapter's pending flush, so their flushes wait for each other, but separate adapters over one client do not know of each other's flush: a flush that overlaps another adapter's answers `flushed` at once. On a server that handles requests concurrently, let analytics-node send on its own schedule and flush once at shutdown; flush every request where one request runs at a time, as in a serverless function.
- Quirks:
  - A client constructed with `disable: true`, or closed with `closeAndFlush()`, sends nothing. The adapter cannot tell, so its receipts say `submitted`.
  - Segment is a router. An event Trace sends both to Segment and straight to a provider Segment also forwards to is ingested there twice, so send each provider's events through one path.
- `native` is the `Analytics` client you passed in, fully typed, for everything Trace does not wrap, such as `page()`, `alias()` and `closeAndFlush()`. Calls made on it bypass Trace's routing, consent, receipts and privacy.

## Tests

- Against a fake modelled on analytics-node 3.1.0 (`src/fakeSegment.fixture.ts`), which records every call in order and reproduces the client's rules: ids taken from each call and held nowhere, the throw on a `track` or `identify` without either id, calls queued until the test sends them as one batch, and a `flush()` that resolves once the queue was sent, at once when it is empty, and at once with a warning while another flush runs.
  - The session: coldness, `open` never refusing, the mapping, the user and anonymous id on every call, `unidentified`, the 32 KB limit at its boundary and counted in UTF-8 bytes, the order of losses, an event keeping its user after a later switch, traits, groups, the refusals, the absence of `identify`, `reset`, `collection` and `dispose`, the shared flush across sessions, a flush that waits for analytics-node whatever becomes of its signal, `native`, and that Trace never constructs or closes the client.
  - A real `Trace` over the fake: receipts combining the sanitizer's losses with Segment's, a user switch without a reset, a sign-out with and without `anonymousId`, anonymous traits reaching the user who signs in, groups through the planner with another type reported as an unsupported step, consent, a flush that answers `timeout`, then `flushed` once the queue was sent, and per-request Traces over one shared client, each with its own adapter or sharing one, whose interleaved events, traits and groups never carry the other request's user or visitor.
  - `testAnalyticsAdapter`, the conformance suite, without options and with a group type and an anonymous id.
- Beside each helper in `src/utils/`: the properties over the context, the ids of a call, and the flush shared by overlapping calls.
- Against the real SDK: `src/segment.sdk.test.ts` constructs the installed `@segment/analytics-node` 3.1.0 with its `httpClient` option in place of the network and reads every batch it sends: the event with its ids, message id, timestamp and properties over its context; the throw on a call without ids that the adapter never makes; traits with a `null` removal and a group; an event far over 32 KB that the client's own check lets through; a flush that waits for its batch while the client's own second flush warns and resolves at once; a Trace flush that times out while the batch goes on, is refused once, retried and delivered; two adapters over one client whose flushes cannot see each other; a user switch through a Trace; and per-request Traces over one client that never mix their ids. The conformance suite runs over the real SDK as well.
- Typecheck only (`src/segment.contracts.ts`): the real `Analytics` client is assigned to `SegmentLike`, the fake's members and their parameters are pinned to the real client's, the adapter cannot pass a flush timeout, a Trace over the adapter keeps the real type on `native`, and a wrong object, the browser and React Native SDKs, a group option that is not an object, an anonymous id that is not a string and a call without ids are refused.
- Never: nothing reaches Segment, so no test proves what its servers keep, refuse or deduplicate, or how its identity resolution links a visitor to a user. Retries, rate limits and `disable` are not exercised.

## License

[MIT](LICENSE)
