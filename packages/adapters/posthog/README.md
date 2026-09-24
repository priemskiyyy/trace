# @priemskiyyy/trace-posthog

Send [Trace](../../core) events to PostHog through the posthog-js instance your application already initialized. Each event is one `capture` with its timestamp and its id as `uuid`. Identity, person properties, groups and consent use PostHog's own calls, and the package imports no SDK. On React Native, use [`@priemskiyyy/trace-posthog-react-native`](../posthog-react-native); on a server, [`@priemskiyyy/trace-posthog-node`](../posthog-node).

## Installation

```sh
pnpm add @priemskiyyy/trace @priemskiyyy/trace-posthog posthog-js
```

## Create a Trace

```ts
import { event, Trace } from "@priemskiyyy/trace";
import { posthog } from "@priemskiyyy/trace-posthog";
import posthogJs from "posthog-js";

posthogJs.init("phc_project_api_key", {
  api_host: "https://eu.i.posthog.com",
  opt_out_capturing_by_default: true,
});

const trace = new Trace({
  events: {
    "Checkout Started": event<{ cart: { id: string }; value: number }>(),
  },
  destinations: { research: posthog({ sdk: posthogJs }) },
  consent: { research: ["analytics"] },
});

trace.start();
trace.consent.set({ analytics: "granted" });
trace.user({ id: "user_42", traits: { plan: "pro" } });
trace.track("Checkout Started", { cart: { id: "cart_1" }, value: 49.5 });
```

## Options

| Option | Default  | Meaning                                                                                               |
| ------ | -------- | ----------------------------------------------------------------------------------------------------- |
| `sdk`  | required | The posthog-js instance your application initialized: the default export or one from `new PostHog()`. |

## How an event is mapped

| Trace        | PostHog                                                                                                        |
| ------------ | -------------------------------------------------------------------------------------------------------------- |
| `name`       | the event name, unchanged                                                                                      |
| `properties` | the event's properties                                                                                         |
| `context`    | the event's properties too, under the event's own                                                              |
| `id`         | `uuid`, which PostHog keeps and deduplicates on; the receipt's `event.id` is the uuid posthog-js answers       |
| `timestamp`  | `timestamp`                                                                                                    |
| `identity`   | the person PostHog holds, which Trace moved there through `identify` and `reset` before handing the event over |

A context key that a property of the event shadows is left out, an `omitted` loss at `context.<key>`. PostHog's own names are left out wherever they appear, each an `omitted` loss, because posthog-js merges an event's properties over its own: every name that begins with `$`, since "Properties starting with `$` are PostHog defaults" ([events][events]) and posthog-js reads `$set`, `$set_once` and `$unset` as changes to the person, `$groups` as its groups, and overwrites others such as `$session_id`; `distinct_id`, which would move the event to another person; and `token`, which posthog-js overwrites with the project's. An event named `$identify`, `$create_alias` or `$merge_dangerously`, PostHog's own events that name a person or merge one into another, is `skipped` as `unsupported`, because Trace moves identity through `identify` and `reset` only. Losses are listed in the order of the event: the name, then properties, then context.

The adapter checks every limit it can check in the browser, as posthog-js enforces it: `capture` in posthog-js 1.434.2 (`lib/src/posthog-core.js`) passes every event it sends through `_copyAndTruncateStrings` from `@posthog/browser-common` 0.9.0 (`dist/utils/general-utils.js`), which cuts each string value, at any depth and never a key, with `value.slice(0, properties_string_max_length)`, so in UTF-16 code units, JavaScript's `length`. `setPersonProperties` sends its values in a `$set` event, and `group` sends a group's in a `$groupidentify` event, so the same cut reaches person and group properties.

| Limit                               | PostHog's documentation                                                                                                                                                                                          | What the adapter does                                                                                                                                                                                   | Loss                                                          |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| A string's length                   | posthog-js's `properties_string_max_length`, "the maximum length of the properties string that can be sent with capture calls", 65,535 by default ([config][config]), applied by `_copyAndTruncateStrings` above | sends it; posthog-js cuts every string it sends to that length, the event's name included                                                                                                               | `truncated` past the limit, the name's at `name`              |
| A person or group property's length | the same cut, on the `$set` and `$groupidentify` events                                                                                                                                                          | leaves out whole a property holding a string past the limit anywhere in it, so no stored value is cut or sent in part, sends the others, and throws `TraceError` `UNSUPPORTED`                          | none: identity calls have no receipt                          |
| A group's type and key              | the same cut, on the `$groups` of every event and on `$groupidentify`                                                                                                                                            | leaves the membership out when its type or key is past the limit, so two groups sharing the kept prefix never merge, and throws `TraceError` `UNSUPPORTED`; the user's events go on without that group  | none: identity calls have no receipt                          |
| The event's uuid                    | the same limit cuts a uuid when it is set below 36; posthog-js then sends a new uuid when `before_send` is set, and the cut one otherwise                                                                        | sends the event's id                                                                                                                                                                                    | none: the receipt's `event.id` is the uuid posthog-js answers |
| A distinct id's length              | "PostHog shortens any `distinct_id` longer than 200 characters to its first 200 characters" ([ingestion warnings][warnings]), and posthog-js cuts it with every other string past `properties_string_max_length` | `identify` fails with `TraceError` `DELIVERY_FAILED` past the smaller of the two, because two users sharing the kept prefix would share one person; Trace skips that user's events as `identity-failed` | none: identity calls have no receipt                          |
| An event's size                     | "PostHog discards events exceeding 1 megabyte in size after processing" ([ingestion warnings][warnings])                                                                                                         | cannot count what posthog-js adds after it; Trace's own `totalSize` keeps events far below it                                                                                                           | none                                                          |

Trace's own `stringLength`, 2,000 by default, keeps strings far below posthog-js's limit unless you raise it. What is not verified: what PostHog's servers do with an event whose uuid posthog-js cut, which it sends when `before_send` is not set, and whether PostHog counts a distinct id's 200 characters in UTF-16 code units, as the adapter does; if it counts code points, the adapter refuses some ids outside the Basic Multilingual Plane that PostHog would keep whole.

[events]: https://posthog.com/docs/data/events
[config]: https://github.com/PostHog/posthog-js/blob/main/packages/types/src/posthog-config.ts
[warnings]: https://posthog.com/docs/data/ingestion-warnings

An event PostHog does not capture, because it is opted out, rate limited, taken for a bot or dropped by `before_send`, is `dropped` with the reason `provider-filtered`.

## Identity

- A user is `identify(id)`. posthog-js refuses the ids `distinct_id`, `distinctid`, `undefined` and `null` in any case, and its cookieless placeholder `$posthog_cookieless` in that exact spelling. The adapter reports such a user as unsupported without sending it, which Trace records as an `identity step unsupported` diagnostic; the events stay with the anonymous person.
- An id longer than PostHog keeps, 200 characters or `properties_string_max_length` if that is shorter, is never sent: `identify` fails with `TraceError` `DELIVERY_FAILED`, which Trace records as an `identity step failed` diagnostic, and it skips that user's events as `identity-failed`, because PostHog would file them under whoever shares the kept prefix. The next user is unaffected.
- Traits are `unsetPersonProperties` with the removed names, then `setPersonProperties` with the values. A trait holding a string posthog-js would cut anywhere in it is left out whole, the others are set, and the change is reported as unsupported.
- A group membership is `group(type, id, traits)`, a group trait holding a string posthog-js would cut left out whole the same way. A membership whose type or key posthog-js would cut is left out whole and reported as unsupported, so the user's events go on without that group rather than into another group sharing the kept prefix. posthog-js cannot unset a group property, so a group trait set to `null` arrives as `null`.
- Leaving a group: posthog-js has no call that leaves one type, so the adapter registers `$groups` again with the memberships posthog-js holds, read with `getGroups()`, without the one it left. The memberships posthog-js restored from its storage on an earlier page load stay.
- A sign-out or an account switch is `reset()`, after which the last collection choice is applied again, because PostHog's reset returns consent to its configured default.
- With `person_profiles: "never"`, PostHog keeps no person: the adapter reports each user, trait change and group change as unsupported and sends none of them, while a sign-out still resets, because the distinct id still rotates.

## Consent

Initialize posthog-js opted out when the destination is gated by consent, with `opt_out_capturing_by_default: true`, because PostHog can collect before Trace starts. Trace calls `opt_in_capturing({ captureEventName: false })` once every purpose the destination needs is granted, so no `$opt_in` event is sent, and `opt_out_capturing()` when one is withdrawn; a gated destination that opens while its purpose is still unknown is opted out at once. PostHog's reset logs a warning when it turns capturing off this way, and the adapter opts in again right after it.

The cookieless modes cannot be gated, so `trace.start()` fails the destination with a `TraceError` whose code is `UNSUPPORTED`: `cookieless_mode: "always"` ignores opting in and out, and `"on_reject"` replaces the person on every consent change and keeps capturing without cookies after a refusal. Autocapture, page views, session replay, surveys and feature flags are PostHog's own and run outside Trace's consent, privacy and receipts, so configure them in `init`.

## Behavior

- Versions: `posthog-js` 1.434 or later within 1.x, an optional peer dependency, typed structurally through `PostHogLike`.
- Initialization is yours, and Trace never initializes or shuts PostHog down. An instance that `posthog.init` has not run on fails the destination's start with a `TraceError` whose code is `NOT_INITIALIZED`. Call `trace.start()` again after `init` and it succeeds, and the events tracked meanwhile are delivered while they are still in Trace's buffer.
- Evidence is `sdk-call-returned`: `capture` answers once PostHog queued the event, so `submitted` does not mean PostHog stored it.
- Flush: there is none, and `trace.flush()` reports `unsupported` for this destination. posthog-js sends its batches on its own schedule.
- PostHog is one instance per application. Register it under one destination name: two destinations over the same instance send every event twice.
- `native` is the instance you passed in, fully typed, for everything Trace does not wrap, such as feature flags. Calls made on it bypass Trace's validation, consent, privacy and receipts.

## Tests

- Against an in-process fake modelled on `posthog-js` 1.434.2, with every member typed as the real `PostHog` types it and with its quirks: properties merged over the distinct id and the registered `$groups`, so PostHog's own names act on the event, every string cut past `properties_string_max_length`, the uuid included, `undefined` answered for a filtered event, a `uuid` that is not a UUID replaced, `register` replacing `$groups` whole and `getGroups` answering the memberships held, the ids `identify` refuses, a reset that clears the memberships and returns consent to its default, and `person_profiles: "never"` ignoring every person call. The tests cover the event mapping, PostHog's own names and events, the losses, identity, groups, collection, the receipt's uuid, trait and group trait strings past the limit, the refused configurations and that creating the adapter calls nothing, both on the session and through a real `Trace`: a failed start and its retry, a cookieless instance, a user switch with consent applied again, consent opening and closing the destination, `person_profiles: "never"`, a refused id, an id PostHog would shorten and the absent flush.
- The conformance suite, `testAnalyticsAdapter`, over the same fake, as configured and under `person_profiles: "never"`.
- Against the real `posthog-js` 1.434.2 in jsdom, with `fetch` stubbed and each event read through `before_send`: the captured event, PostHog's own names, `before_send` filtering, person properties, leaving one group, leaving a group while keeping the memberships restored from an earlier page load in `localStorage`, collection after a reset, strings and names past the limit, the uuid posthog-js sends in place of one it cut, none of a person property holding a string it would cut, a refused id and one that only resembles the cookieless placeholder, an id PostHog would shorten through a real `Trace`, `person_profiles: "never"`, the refused configurations, and a user switch through a real `Trace` with consent that the reset forgot.
- Typecheck only: the default export and `new PostHog()` assigned to `PostHogLike`, the fake pinned to the real `PostHog` and its configuration, `native` keeping the real type through a `Trace`, and the React Native and Node clients refused.
- Never: no event is sent to PostHog.

## License

[MIT](LICENSE)
