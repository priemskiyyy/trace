# @priemskiyyy/trace-posthog-react-native

Send [Trace](../../core) events to PostHog from React Native through the posthog-react-native client your application created. Each event is one `capture` with its timestamp and its id as `uuid`, made once the client has loaded its storage. Identity, person properties, groups and consent use PostHog's own calls, and the package imports no SDK. In the browser, use [`@priemskiyyy/trace-posthog`](../posthog); on a server, [`@priemskiyyy/trace-posthog-node`](../posthog-node).

Version 0.1.0 is an initial preview. APIs may change before 1.0. See the [verification limits](https://github.com/priemskiyyy/trace/blob/main/docs/verification.md) before adopting an adapter.

## Installation

```sh
pnpm add @priemskiyyy/trace @priemskiyyy/trace-posthog-react-native posthog-react-native
```

## Create a Trace

```ts
import { event, Trace } from "@priemskiyyy/trace";
import { posthog } from "@priemskiyyy/trace-posthog-react-native";
import PostHog from "posthog-react-native";

const client = new PostHog("phc_project_api_key", {
  host: "https://eu.i.posthog.com",
  defaultOptIn: false,
  captureAppLifecycleEvents: false,
});

const trace = new Trace({
  events: {
    "Checkout Started": event<{ cart: { id: string }; value: number }>(),
  },
  destinations: { research: posthog({ sdk: client }) },
  consent: { research: ["analytics"] },
});

trace.start();
trace.consent.set({ analytics: "granted" });
trace.user({ id: "user_42", traits: { plan: "pro" } });
trace.track("Checkout Started", { cart: { id: "cart_1" }, value: 49.5 });
```

## Options

| Option | Default  | Meaning                                                                            |
| ------ | -------- | ---------------------------------------------------------------------------------- |
| `sdk`  | required | The `PostHog` client your application created with `new PostHog(apiKey, options)`. |

## How an event is mapped

Each event is one `capture(name, properties, { timestamp, uuid })` call, made once the client's `ready()` has settled.

| Trace        | PostHog                                                                                                           |
| ------------ | ----------------------------------------------------------------------------------------------------------------- |
| `name`       | the event name, unchanged                                                                                         |
| `properties` | the event's properties                                                                                            |
| `context`    | the event's properties too, under the event's own                                                                 |
| `id`         | `uuid`, which PostHog keeps as the event's id when it is a UUID, as Trace's ids are                               |
| `timestamp`  | `timestamp`                                                                                                       |
| `identity`   | the person the client holds, which Trace moved there through `identify` and `reset` before handing the event over |

A context key that a property of the event shadows is left out, an `omitted` loss at `context.<key>`. PostHog's own names are left out wherever they appear, each an `omitted` loss: every name that begins with `$`, since PostHog reads `$set`, `$set_once` and `$unset` as changes to the person and `$groups` as its groups, and posthog-react-native overwrites others such as `$session_id`; and `distinct_id` and `token`, PostHog's names for an event's person and project, which its [capture API][capture] also reads from an event's properties. An event named `$identify`, `$create_alias` or `$merge_dangerously`, PostHog's own events that name a person or merge one into another, is `skipped` as `unsupported`, because Trace moves identity through `identify` and `reset` only. Losses are listed in the order of the event: properties, then context.

The limits PostHog documents, and what the adapter does with each:

| Limit                  | PostHog's documentation                                                                                                                                                                                                                                                                                                                             | What the adapter does                                                                                                                                                                                                                                                                                                            | Loss                                 |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| A string's length      | none: posthog-react-native 4.77.0 and the `@posthog/core` 1.55.1 it runs on cut no string, and PostHog documents no limit on a property's length                                                                                                                                                                                                    | sends every string whole, in properties, person properties and groups alike                                                                                                                                                                                                                                                      | none                                 |
| A distinct id's length | "PostHog shortens any `distinct_id` longer than 200 characters to its first 200 characters" ([ingestion warnings][warnings])                                                                                                                                                                                                                        | `identify` fails with `TraceError` `DELIVERY_FAILED` past 200, because two users sharing the kept prefix would share one person; Trace skips that user's events as `identity-failed`                                                                                                                                             | none: identity calls have no receipt |
| Placeholder ids        | "We do not allow identifying users with the following strings (case insensitive): `anonymous`, `guest`, `distinctid`, `distinct_id`, `id`, `not_authenticated`, `email`, `undefined`, `true`, `false`", the case-sensitive `[object Object]`, `NaN`, `None`, `none`, `null` and `0`, and "empty space strings of any length" ([identify][identify]) | never sends the identify and reports it unsupported, so the person stays anonymous rather than joining everyone else who got the same placeholder                                                                                                                                                                                | none: identity calls have no receipt |
| An event's size        | "PostHog discards events exceeding 1 megabyte in size after processing" ([ingestion warnings][warnings])                                                                                                                                                                                                                                            | cannot count what posthog-react-native adds; Trace's own `totalSize` keeps most events below it, but properties and context each get their own budget, 200,000 serialized characters by default, so an event that fills both with characters of three UTF-8 bytes, such as most Chinese, Japanese and Korean text, can pass 1 MB | none                                 |

The 200 characters are counted in UTF-16 code units, JavaScript's `length`, the stricter reading, in which most emoji count as two. What is not verified: what PostHog's servers do past the limits above, and whether they count a distinct id's characters in code units or in code points; if in code points, the adapter refuses some ids outside the Basic Multilingual Plane that PostHog would keep whole.

[capture]: https://posthog.com/docs/api/capture
[identify]: https://posthog.com/docs/product-analytics/identify
[warnings]: https://posthog.com/docs/data/ingestion-warnings

## Identity

- Every call waits for the client's `ready()`, which settles once posthog-react-native has loaded its storage, and reaches the client in the order Trace made it. Until then the client holds no person and no memberships, so nothing Trace sends can be filed under an empty one.
- A user is `identify(id)`. An id PostHog refuses to identify a person by, one of the placeholders above, is never sent: the adapter reports it as unsupported, which Trace records as an `identity step unsupported` diagnostic, and the events stay with the anonymous person. An id past 200 characters fails the step, which Trace records as an `identity step failed` diagnostic, and it skips that user's events as `identity-failed`; the next user is unaffected.
- Traits are `unsetPersonProperties` with the removed names, then `setPersonProperties` with the values. posthog-react-native ignores an empty list or update, and an update identical to the last one it sent for the same person.
- A group membership is `group(type, id, traits)`, with no properties when it has no traits, because posthog-react-native sends a `$groupidentify` whenever it is passed an object, even an empty one for a membership it already holds. posthog-react-native cannot unset a group property, so a group trait set to `null` arrives as `null`.
- Leaving a group: posthog-react-native has no call that leaves one type, so the adapter reads the memberships the client holds from its storage, those it restored from an earlier launch included, and registers `$groups` again without the one it left.
- A sign-out or an account switch is `reset()`, after which the last collection choice is applied again, because the reset forgets it and returns to `defaultOptIn`. Trace resets before a different user is identified, so PostHog is never asked to merge one user into the next.
- With `personProfiles: "never"`, posthog-react-native ignores identify, person properties and groups and only logs an error, and nothing public tells the adapter that it was created that way: those steps count as done, and events stay with the anonymous person.

## Consent

Create the client with `defaultOptIn: false` and `captureAppLifecycleEvents: false` when a consent purpose gates this destination, because posthog-react-native opts in and records its own lifecycle events from its creation. Trace calls `optIn()` once every purpose the destination needs is granted and `optOut()` when one is withdrawn, and waits for the promise each answers; a gated destination that opens while its purpose is still unknown is opted out at once. posthog-react-native keeps the choice in its storage across launches. Screen views, autocapture, session replay, surveys and feature flags are PostHog's own and run outside Trace's consent, privacy and receipts, so configure them when you create the client.

## Behavior

- Platforms and versions: iOS and Android, and wherever else posthog-react-native runs, Expo included, with `posthog-react-native` 4.77 or later within 4.x, an optional peer dependency, typed structurally through `PostHogLike`.
- Initialization is yours, and Trace never creates, initializes or shuts the client down. Opening the destination fails with `TraceError` `UNSUPPORTED` over a disabled client, one created with `disabled: true` or without an API key, since it sends and flushes nothing. It checks nothing else: posthog-react-native takes calls from its creation, and the adapter waits for its storage in every call instead, through `ready()`, which posthog-react-native marks internal. An event whose handoff Trace gave up on while the client was loading, at its timeout or on disposal, is never captured.
- Evidence is `sdk-call-returned`, and there is no event id: `capture` answers nothing. An opted-out client and `before_send` drop an event without saying so, and its receipt still says `submitted`.
- Flush: `trace.flush()` calls the client's `flush()`, which settles once PostHog accepted every batch queued when it started, answering `flushed`, and rejects with the first batch it refused, answering `failed`. The client also sends on its own: at every change of the app's state, every 10 seconds and every 20 events.
- posthog-react-native keeps one storage file per app, so two clients share one person. Create one client and register it under one destination name: two destinations over the same client capture every event twice.
- `native` is the client you passed in, fully typed, for everything Trace does not wrap, such as feature flags and `screen`. Calls made on it bypass Trace's validation, consent, privacy and receipts.

## Tests

- Against an in-process fake modelled on `posthog-react-native` 4.77.0 on `@posthog/core` 1.55.1 (`src/fakePostHog.fixture.ts`), which records every call with its arguments in order and reproduces the client's quirks: storage that loads after the client is created, with `ready()` waiting and every other call held in call order until then; `capture` answering nothing and queueing the event under the person the client holds, over its `$groups`, unless it is opted out; a `$groups` property registering memberships; a `uuid` that is not a UUID replaced; empty and repeated person updates ignored; `group` sending its properties only for a new membership or with properties, an empty object included; `reset` forgetting the person, the memberships and the opt-in choice; `personProfiles: "never"` ignoring every person call; and promises a test can hold or reject.
  - The session: coldness, an `open` that calls nothing and refuses a disabled client, the mapping, PostHog's own names and events, every call waiting for the storage and keeping its order, an event abandoned while the client loaded, an opted-out client, identify with placeholder and long ids, traits, groups and a leave that keeps the other memberships, reset re-applying collection and waiting for it, collection and its promises, flush, and `native`.
  - A real `Trace` over the fake: calls made before the storage loads keeping their order, so an event tracked before a sign-in stays anonymous; an event in flight at a user switch keeping its user; a leave before the storage loads keeping the memberships it restores; a switch with consent applied again; consent opening and closing a gated destination; a placeholder id, an id PostHog would shorten and `personProfiles: "never"`; a receipt combining the sanitizer's losses with PostHog's; flush; `native`; and that Trace never shuts PostHog down.
  - `testAnalyticsAdapter`, the conformance suite.
- Beside the helpers in `src/utils/`: the properties and their losses, PostHog's own names, the ids PostHog refuses and the 200-character boundary, groups with and without traits and leaving one, and collection.
- Typecheck only (`src/posthog.contracts.ts`): the real `PostHog` and a `new PostHog(...)` are assigned to `PostHogLike`, the fake is pinned to the real client's members, a Trace over the adapter keeps the real type on `native`, and a wrong object, posthog-js and the Node client are refused.
- Never: posthog-react-native itself, which needs a React Native runtime, a device, or PostHog's servers, so no test proves what they keep, refuse or deduplicate. There is no test against the real SDK.

## License

[MIT](LICENSE)
