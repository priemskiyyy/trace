# @priemskiyyy/trace-posthog-node

Send [Trace](../../core) events to PostHog from a server. You pass in the `posthog-node` client your application constructed, so this package imports no SDK. A server builds one Trace per request or job over that shared client, and each event is one `capture` for its user or the visitor's anonymous id, with its memberships as groups, its time and its id as `uuid`; traits and group traits become updates for the same distinct id, and a sign-in merges the visitor into the user. In the browser, use [`@priemskiyyy/trace-posthog`](../posthog); on React Native, [`@priemskiyyy/trace-posthog-react-native`](../posthog-react-native).

Version 0.1.0 is an initial preview. APIs may change before 1.0. See the [verification limits](https://github.com/priemskiyyy/trace/blob/main/docs/verification.md) before adopting an adapter.

## Installation

```sh
pnpm add @priemskiyyy/trace @priemskiyyy/trace-posthog-node posthog-node
```

## Create a Trace

One client for the process, one Trace per request or job. A Trace is cheap to build, and a Trace per request never mixes two users:

```ts
import { event, Trace } from "@priemskiyyy/trace";
import { posthog } from "@priemskiyyy/trace-posthog-node";
import { PostHog } from "posthog-node";

const client = new PostHog("phc_project_api_key", {
  host: "https://eu.i.posthog.com",
});

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
      research: posthog({ sdk: client, anonymousId: visitorId }),
    },
  });

  trace.start();
  trace.user({ id: user.id, traits: { plan: user.plan } });
  trace.track("Checkout Started", { cart: { id: cart.id }, value: cart.value });

  await trace.flush();
  trace.dispose();
};
```

`visitorId` is the visitor id your application already keeps for signed-out traffic, such as a cookie; the distinct id posthog-js uses in the same browser is a good one. posthog-node keeps its queue in memory. Flush every request where one request runs at a time, as in a serverless function; a server that handles requests concurrently reads the flush bullet under Behavior first. Shut the client down yourself when the process ends, with `await client.shutdown()`; Trace never does.

## Options

| Option        | Default  | Meaning                                                                                                                                                                                                                                                   |
| ------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sdk`         | required | The `PostHog` client your application constructed. posthog-js and posthog-react-native are refused by the types.                                                                                                                                          |
| `anonymousId` | none     | The visitor id of the request. A call without a user goes under it, and a sign-in merges it into the user. A blank one, or one longer than the 200 characters PostHog keeps whole, is never sent. Without it, a call without a user cannot reach PostHog. |

## How an event is mapped

Each event is one `capture({ distinctId, event, properties, groups, timestamp, uuid })` call.

| Trace                            | PostHog                                                                                                                                                |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `event.name`                     | `event`, unchanged                                                                                                                                     |
| `event.properties`               | `properties`, nested values and `null` included                                                                                                        |
| `event.context`                  | `properties` under the event's own: a context key a property shadows is an `omitted` loss                                                              |
| `event.timestamp`                | `timestamp`, as a `Date`                                                                                                                               |
| `event.id`                       | `uuid`, which PostHog keeps and deduplicates on; posthog-node answers nothing, so the receipt names no provider event, and its own `id` is that uuid   |
| `event.identity.user`            | `distinctId`, the user the event was accepted with, however long it waited                                                                             |
| the `anonymousId` option         | `distinctId` of an event without a user                                                                                                                |
| `event.identity.groups`          | `groups`, the type and id of each membership, which posthog-node sends as `$groups`                                                                    |
| neither a user nor `anonymousId` | nothing: the event is `skipped` as `unidentified`, because posthog-node would file it under an enclosing `withContext` id or record it under no person |

PostHog's own names are left out wherever they appear, each an `omitted` loss: every name that begins with `$`, since "Properties starting with `$` are PostHog defaults" ([events][events]), PostHog reads `$set`, `$set_once` and `$unset` on any event as changes to its person, posthog-node takes a `$groups` property as the event's memberships when the event has none, and it overwrites `$lib`, `$lib_version`, `$is_server` and `$geoip_disable`; `distinct_id`, which PostHog reads as the event's person when the event names none at its top level ([capture API][capture]); and `token`, its name for the project. An event named `$identify`, `$create_alias` or `$merge_dangerously`, PostHog's own events that name a person or merge one into another, is `skipped` as `unsupported`, because Trace merges identity through `identify` only. Losses are listed in the order of the event: properties, then context.

The limits PostHog documents, counted in UTF-16 code units, JavaScript's `length`:

| Limit                     | PostHog's documentation                                                                                                                                                                                                                                                                                    | What the adapter does                                                                                                                                                                                                                                           | Loss                                                                  |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| A distinct id's length    | "PostHog shortens any `distinct_id` longer than 200 characters to its first 200 characters and ingests the event under the shortened ID" ([ingestion warnings][warnings])                                                                                                                                  | `identify` fails with `TraceError` `DELIVERY_FAILED` for a user id past 200 characters, because two users sharing the kept prefix would share a person, and Trace skips that user's events as `identity-failed`; a visitor id past 200 characters is never sent | none: identity calls have no receipt, and the visitor id is an option |
| A blank distinct id       | PostHog discards an event whose distinct id is empty or only whitespace ([ingestion warnings][warnings]), and posthog-node takes an empty one for none                                                                                                                                                     | a blank visitor id is never sent; Trace never accepts a blank user id                                                                                                                                                                                           | none                                                                  |
| A placeholder distinct id | "We do not allow identifying users with the following strings (case insensitive): `anonymous`, `guest`, `distinctid`, `distinct_id`, `id`, `not_authenticated`, `email`, `undefined`, `true`, `false`", the case-sensitive `[object Object]`, `NaN`, `None`, `none`, `null` and `0` ([identify][identify]) | `identify` fails with `TraceError` `DELIVERY_FAILED`, because PostHog accepts the placeholder for events like any other id, so every user who sends it would share one person, and Trace skips that user's events as `identity-failed`                          | none: identity calls have no receipt                                  |
| A string's length         | none: posthog-node cuts no string, unlike posthog-js, and PostHog documents no limit on a property value                                                                                                                                                                                                   | sends it whole                                                                                                                                                                                                                                                  | none                                                                  |
| An event's size           | "PostHog discards events exceeding 1 megabyte in size after processing" ([ingestion warnings][warnings])                                                                                                                                                                                                   | cannot count what posthog-node and PostHog add to an event; Trace's own `totalSize` keeps events far below it                                                                                                                                                   | none                                                                  |
| A request's size          | "less than 20MB by default" ([capture API][capture])                                                                                                                                                                                                                                                       | nothing: posthog-node builds its batches, and halves one PostHog answers with a 413                                                                                                                                                                             | none                                                                  |

What is not verified: what PostHog's servers do with an event past a limit, how they count a distinct id's 200 characters (if they count code points, the adapter refuses some ids outside the Basic Multilingual Plane that PostHog would keep whole), and PostHog's limit of five group types per project, which the adapter cannot see.

[events]: https://posthog.com/docs/data/events
[capture]: https://posthog.com/docs/api/capture
[warnings]: https://posthog.com/docs/data/ingestion-warnings
[identify]: https://posthog.com/docs/product-analytics/identify

## Identity

posthog-node holds no person between calls: every call names its own distinct id. So the session has no `reset`, and a user switch in a Trace needs none: each event and each update names its own user.

- A sign-in, when a visitor id is known, is an `$identify` for the user with `$anon_distinct_id` naming the visitor, which merges the visitor's person, and the events and traits it gathered while signed out, into the user's. Without a visitor id there is nobody to merge, and nothing is sent. Each Trace that signs a user in sends one such `$identify`, so a server with a Trace per request sends one for every request with a user and a visitor id; PostHog merges the visitor once, and each one is an event in PostHog.
- PostHog refuses to merge a visitor that already belongs to another user. Give a visitor a new anonymous id when a user signs out, as posthog-js does at a reset, or the next person on that browser starts out as the previous user's visitor.
- A user id longer than 200 characters is never sent: `identify` fails with `TraceError` `DELIVERY_FAILED`, which Trace records as an `identity step failed` diagnostic, and it skips that user's events as `identity-failed`, because PostHog would file them under whoever shares the kept prefix. The next user is unaffected.
- Traits are `unsetPersonProperties` with the removed names, then `setPersonProperties` with the values, for the user, or for the visitor while signed out. Both calls are made even when one is empty, because posthog-node sends nothing for an empty one. posthog-node drops the removal of a blank trait name in silence, so such a removal is reported as unsupported once the rest was sent, the diagnostic `identity step unsupported`. Without a user and without a visitor id, traits send nothing and are reported as unsupported.
- A group membership rides on every later event as `groups`, so a join without traits sends nothing. Its traits are a `groupIdentify` under the user, or the visitor, with a removed group trait as `null`, because PostHog cannot unset a group property. Leaving a group sends nothing: the next event simply carries it no more. Without a user and without a visitor id, the group's traits are refused as unsupported, because posthog-node would file them under a stand-in person, `$<type>_<key>`.
- An event keeps the user it was accepted with. The Trace drops a signed-out user's waiting events at the switch, and one handed over is sent under its own distinct id whatever the Trace holds by then, so there is no `auth-subject-mismatch` to check: posthog-node authenticates with your project key, never as a user.

## Consent

posthog-node collects nothing on its own for Trace, so there is nothing to construct opted out, and its `disable()` switches the whole client, for every request over it: one visitor's refusal would silence every other visitor's events. This session has no `collection`, and Trace calls nothing on PostHog for consent. Each per-request Trace gates its own destination: set the request's consent decisions with `trace.consent.set(...)` before `trace.start()`; while a purpose the destination needs is not granted, Trace hands posthog-node nothing, and every event is dropped for it as `consent`.

## Behavior

- Platforms and versions: Node and the edge runtimes posthog-node supports, with `posthog-node` 5.52 or later within 5.x, an optional peer dependency, typed structurally through `PostHogLike`.
- Initialization is yours. Trace never constructs, configures or shuts down the client. The client takes calls from the moment it is constructed, so `open` never refuses.
- Evidence is `sdk-call-returned`: `capture` queued the event and answered nothing. posthog-node sends a batch at `flushAt` events or after `flushInterval`, and says nothing per event, so `submitted` does not mean PostHog stored it. It also drops without a word an event given while the client is disabled or opted out, and one its `before_send` drops, and the receipt still says `submitted`.
- Flush: `trace.flush()` calls the client's `flush()`, which waits for a flush in flight and then sends everything the client still holds, other Traces' events and your own included. It answers `flushed` once PostHog answered 2xx for the batches this flush sent, and `failed` with the client's first error. A batch sent earlier, by another Trace's flush or by the client's own `flushAt` or `flushInterval`, reports its failure only there, to that flush or to the console. A batch that failed on the network stays queued, and a later flush sends it again; one PostHog refused is dropped, so on a server that handles requests concurrently a Trace's events can be lost under `flushed`. There, let the client send on its own schedule and flush once at shutdown; flush every request where one request runs at a time, as in a serverless function. The flush's own deadline stops the wait and never the send. The adapter never calls `shutdown()`, which is for the end of the process.
- Quirks:
  - posthog-node merges the properties you registered with `register()`, and those of an enclosing `withContext`, under each event's own. An explicit distinct id wins over `withContext`'s, and the adapter always passes one.
  - posthog-node fills in neither `$session_id` nor `$current_url`, which PostHog uses to link an event to a web session, and Trace leaves out every `$` name. To link a server event to the session, make the request's Trace calls inside `client.withContext({ sessionId, properties: { $current_url } }, ...)`: each capture made inside it carries both.
  - PostHog answers 2xx for a batch before it has ingested it, so `flushed` says the batch was accepted, not that each event was kept ([capture API][capture]).
- `native` is the `PostHog` client you passed in, fully typed, for everything Trace does not wrap, such as feature flags and `captureException`. Calls made on it bypass Trace's routing, consent, receipts and privacy.

## Tests

- Against a fake modelled on posthog-node 5.52.6 (`src/fakePostHog.fixture.ts`), which records every call in order and reproduces the client's rules: a distinct id taken from each call and held nowhere, an event without one recorded under no person, `$groups` taken from `groups` only when that holds a membership, the library's own properties written over the caller's, a `uuid` that is not a UUID replaced, nothing sent for an empty set or unset, blank names left out of an unset, a group without a distinct id sent under `$<type>_<key>`, and a queue that a flush waits for until the test answers it or refuses it.
  - The session: coldness, the name `posthog-node`, `open` never refusing, the mapping, PostHog's own names and events, the distinct id of every call, `unidentified`, the visitor id's limits, an event keeping its user after a later switch, the merge at sign-in, the 200-character user id, traits, the blank removal, groups, a join without traits, leaving a group, the refusals, flush and its rejection, the absence of `reset`, `collection` and `dispose`, `native`, and that Trace never constructs or shuts down the client.
  - A real `Trace` over the fake: receipts combining the sanitizer's losses with PostHog's, a user switch without a reset, a sign-out with and without a visitor id, a user id PostHog would shorten, traits set while signed out, memberships on later events, a consent-gated destination, per-request Traces over one client interleaving sign-ins, traits, memberships, a sign-out and events, per-request Traces sharing one adapter, and a flush that answers `flushed`, then `failed`.
  - `testAnalyticsAdapter`, the conformance suite, without options and with a visitor id.
- Beside each helper in `src/utils/`: the distinct id of a call, the properties over the context, and PostHog's own names.
- Against the real SDK: `src/posthog.sdk.test.ts` constructs the installed `posthog-node` 5.52.6 with its `fetch` option in place of the network and reads every batch it sends: the event with its distinct id, uuid, time, properties over its context and `$groups`; what the client does with a `$groups` and a `$set` property the adapter leaves out; an event without a distinct id filed under an enclosing `withContext` id or under no person, which the adapter skips; the merge at sign-in, traits as `$unset` and `$set`, and group traits as `$groupidentify`; nothing sent for an empty update and a blank removal dropped; a web session's fields added by `withContext`; per-request Traces over one client, some calls inside another request's `withContext`, each keeping its own users and visitors; a flush through a Trace that answers `flushed` after a 2xx and `failed` with the client's error after a 500; a flush that answers `flushed` after another Trace's refused flush dropped its events; and a user switch through a Trace. The conformance suite runs over the real SDK as well.
- Typecheck only (`src/posthog.contracts.ts`): the real `PostHog` client is assigned to `PostHogLike`, the fake's members are pinned to the real client's, a capture cannot leave out its distinct id, a Trace over the adapter keeps the real type on `native`, and a wrong object, posthog-js, the React Native client and an anonymous id that is not a string are refused.
- Never: nothing reaches PostHog, so no test proves what its servers keep, merge, deduplicate or refuse. Retries, `before_send`, feature flags, `register()` and the edge runtimes are not exercised.

## License

[MIT](LICENSE)
