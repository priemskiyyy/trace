# @priemskiyyy/trace-mixpanel

Send [Trace](../../core) events to Mixpanel in the browser. You pass in the mixpanel-browser instance your application initialized, so this package imports no SDK. Each event is one `track` call carrying its time and its id, and the user, their traits and their groups become Mixpanel's own identify, profile and group calls. On React Native, use `@priemskiyyy/trace-mixpanel-react-native`; on a server, `@priemskiyyy/trace-mixpanel-node`.

## Installation

```sh
pnpm add @priemskiyyy/trace @priemskiyyy/trace-mixpanel mixpanel-browser
```

## Create a Trace

```ts
import { event, Trace } from "@priemskiyyy/trace";
import { mixpanel } from "@priemskiyyy/trace-mixpanel";
import mixpanelBrowser from "mixpanel-browser";

mixpanelBrowser.init("YOUR_PROJECT_TOKEN", {
  opt_out_tracking_by_default: true,
  opt_out_persistence_by_default: true,
  opt_out_tracking_persistence_type: "cookie",
});

const trace = new Trace({
  events: {
    "Checkout Started": event<{ cart: { id: string }; value: number }>(),
  },
  destinations: { product: mixpanel({ sdk: mixpanelBrowser }) },
  consent: { product: ["analytics"] },
});

trace.consent.set({ analytics: "granted" });
trace.start();
trace.user({ id: "user_42", traits: { plan: "pro" } });
trace.group("workspace", { id: "workspace_1", traits: { seats: 12 } });
trace.track("Checkout Started", { cart: { id: "cart_1" }, value: 49.5 });
```

## Options

| Option | Default  | Meaning                                                                                                                               |
| ------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `sdk`  | required | The mixpanel-browser instance your application initialized: the default export, or a named instance from `init(token, config, name)`. |

## How an event is mapped

Each event is one `sdk.track(name, properties)` call.

| Trace        | Mixpanel                                                                                                                                 |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `name`       | the event name                                                                                                                           |
| `properties` | event properties: one named like a group type of the event is an `omitted` loss, because Mixpanel carries the membership under that name |
| `context`    | event properties under the event's own: a context key a property or a group type shadows is an `omitted` loss                            |
| `timestamp`  | `time`, in milliseconds                                                                                                                  |
| `id`         | `$insert_id`, which Mixpanel deduplicates on together with the name, the time and the distinct id                                        |
| `identity`   | nothing on the event: Mixpanel files it under the user it identifies, as described below                                                 |

The adapter checks every limit Mixpanel documents that it can check in the browser, in the unit Mixpanel documents. Where Mixpanel cuts a value itself, the value is sent and reported `truncated`. Where Mixpanel's documentation gives a limit and not what happens past it, the adapter leaves the part out and reports it, so what Trace sends stays inside every documented limit. The five-day window runs on the Trace's clock, the `now` option, which is the clock that stamped the event. Losses are listed in the order of the event: the name, then properties, then context, then the rest.

| Limit                                     | Mixpanel's documentation                                                                                                                              | What the adapter does                                                                                                                                                                                                                                                                      | Loss                                                        |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| An event older than five days             | `/track` takes the "Last 5 days only" ([Track events][track])                                                                                         | never sends it                                                                                                                                                                                                                                                                             | `dropped` as `provider-filtered`, `timestamp` `unsupported` |
| An event's size                           | "Must be smaller than 1MB of uncompressed JSON" ([Track events][track])                                                                               | never sends an event of 1,000,000 bytes of JSON or more, measured as mixpanel-browser sends it                                                                                                                                                                                             | `dropped` as `provider-filtered`, `properties` `invalid`    |
| Properties per event                      | "Must have fewer than 255 properties" ([Track events][track])                                                                                         | keeps 254, `time` and `$insert_id` among them, so context goes first                                                                                                                                                                                                                       | `truncated` per key left out                                |
| Keys in a nested object                   | "must have fewer than 255 keys" ([Track events][track], [data types][types])                                                                          | keeps the first 254                                                                                                                                                                                                                                                                        | `truncated` per key left out                                |
| Nesting                                   | "max nesting depth is 3" ([Track events][track], [data types][types])                                                                                 | leaves out an object below the third level; a list is not a level                                                                                                                                                                                                                          | `unsupported` per object left out                           |
| Items in a list                           | "must have fewer than 255 elements" ([Track events][track])                                                                                           | keeps the first 254                                                                                                                                                                                                                                                                        | `truncated` per item left out                               |
| Objects in a list                         | "max 255 keys and no nesting" ([data types][types])                                                                                                   | leaves out an object or list inside an object that is a list item                                                                                                                                                                                                                          | `unsupported` per value left out                            |
| A list or object property's size          | "Event Property = 8KB" ([data types][types])                                                                                                          | leaves out a property over 8,000 bytes of JSON as sent                                                                                                                                                                                                                                     | `invalid`                                                   |
| A string value                            | "at most 255 characters" ([events and properties][events])                                                                                            | sends it; mixpanel-browser cuts every string to 255 characters                                                                                                                                                                                                                             | `truncated` past 255 characters                             |
| A property name                           | "at most 255 characters in length (longer names are truncated)" ([events and properties][events])                                                     | sends it                                                                                                                                                                                                                                                                                   | `truncated` past 255 characters                             |
| The event name                            | mixpanel-browser cuts it to 255 characters                                                                                                            | sends it                                                                                                                                                                                                                                                                                   | `name` `truncated`                                          |
| Reserved names                            | the `$` and `mp_` prefixes, `time`, `distinct_id`, `token`, `ip`, `alias` and `bucket` ([reserved properties][reserved])                              | leaves them out, so an event can neither move to another person nor change its time, project or geolocation                                                                                                                                                                                | `omitted`                                                   |
| `$insert_id`                              | "≤ 36 bytes and contain only alphanumeric characters or '-'" ([Import events][import])                                                                | sends the event's id, a UUID, which always fits                                                                                                                                                                                                                                            | none                                                        |
| A profile property (traits, group traits) | "User Profile Property = 256KB", with the string, name, nesting, key and list limits above ([data types][types])                                      | leaves out whole a trait whose name or value Mixpanel would not keep exactly, and a removal whose name is over 255 characters, which mixpanel-browser would cut and so remove another property; sends the rest, and throws `TraceError` `UNSUPPORTED`, which Trace reports as a diagnostic | none: identity calls have no receipt                        |
| A user id                                 | mixpanel-browser cuts every string it sends to 255 characters, the distinct id included                                                               | never identifies an id over 255 characters: `identify` throws `TraceError` `DELIVERY_FAILED`, so two users who share the first 255 never become one                                                                                                                                        | that user's events are `skipped` as `identity-failed`       |
| A group type or id                        | mixpanel-browser cuts the id to 255 characters, and the type is a property name, "at most 255 characters in length" ([events and properties][events]) | leaves the membership out and throws `TraceError` `UNSUPPORTED`, which Trace reports as a diagnostic: a type before any call, joining or leaving; an id after leaving any earlier group of that type, as leaving does. Events flow without the membership                                  | none: identity calls have no receipt                        |

String values and names are counted in UTF-16 code units, the unit mixpanel-browser cuts in, so most emoji count as two characters. The 8 KB, 256 KB and 1 MB limits do not say whether a kilobyte is 1,000 or 1,024 bytes, so the adapter takes the stricter reading: 8,000, 256,000 and 1,000,000 bytes. mixpanel-browser adds its own properties to each event, such as the browser, the page and your super properties, and the adapter cannot count them, so an event near 1 MB or near 255 properties can still pass the limit once they are added.

What is not verified:

- what Mixpanel's servers do past the limits they document without saying what happens: the property, key, item, nesting and size limits;
- whether the string limit counts characters or bytes, since the [data types][types] page speaks of "a limit of 255 bytes";
- that Mixpanel replaces a time in the future "with the current present time at ingestion" ([Track events][track]), judged on its own clock; the adapter sends the time as it is;
- the soft limits of 5,000 distinct event names and 5,000 distinct properties per project;
- deduplication.

[track]: https://docs.mixpanel.com/reference/track-event
[types]: https://docs.mixpanel.com/docs/data-structure/property-reference/data-type
[events]: https://docs.mixpanel.com/docs/data-structure/events-and-properties
[reserved]: https://docs.mixpanel.com/docs/data-structure/property-reference/reserved-properties
[import]: https://docs.mixpanel.com/reference/import-events

## Identity

Mixpanel holds one user per browser, and Trace's planner sends it what it needs before each event it hands off:

- `identify` calls `identify(user.id)`. Mixpanel files every later event under that user, keeps its `$device_id`, and tracks an `$identify` event whenever the id changes. An id Mixpanel refuses, one that starts with `$device:` or one your `before_identify` hook refuses by answering `undefined`, throws `TraceError` `UNSUPPORTED`, which Trace reports and counts as done; the event is still sent, under the anonymous id. An id over 255 characters never reaches Mixpanel: mixpanel-browser would cut it, and two users who share the first 255 characters would become one, so `identify` throws `TraceError` `DELIVERY_FAILED` and Trace skips that user's events as `identity-failed` until the next user. In 2.83.0 a `before_identify` hook that answers `null` does not refuse: it sets the distinct id to `null`, and Trace cannot see that it did.
- Traits call `identify(user.id)` first when there is a user, then `people.set` for the values and `people.unset` for the removals. Mixpanel queues profile updates until `identify` runs in the current page load, so without it the traits of a user Mixpanel restored from its storage would wait. Traits set while anonymous stay in that queue until the next user is identified, and a reset discards them.
- Groups call `set_group(type, id)`, which registers the membership as a super property that every later event carries and sets it on the user's profile, then `get_group(type, id).set(...)` and `.unset(key)` for the group's own traits. Leaving a group calls `unregister(type)` and `people.unset(type)`, never `remove_group`, which leaves a stray `group_key` super property behind. Group profiles need Mixpanel's Group Analytics add-on; without it the membership still arrives as an event and profile property.
- A group type that is a name Mixpanel owns, such as `distinct_id`, `$device_id` or `bucket`, is refused with `TraceError` `UNSUPPORTED` before any call, both joining and leaving: as a super property it would overwrite Mixpanel's own on every later event, and `distinct_id` would file every member under the group's id. Mixpanel would cut a group type or id over 255 characters and merge the group with any other that shares its first 255, so both are refused with `TraceError` `UNSUPPORTED`. A type is refused before any call, joining or leaving. An id is refused after the user leaves any earlier group of that type, through `unregister(type)` and `people.unset(type)` as leaving does, so later events carry neither the earlier group nor a cut id. The user's events keep flowing without the membership.
- A trait or group trait Mixpanel would not keep exactly is left out whole, the rest of the update is sent, and the step throws `TraceError` `UNSUPPORTED`, so no stored profile value is ever cut or changed in part: one with text or a name over 255 characters at any depth, which mixpanel-browser or Mixpanel would cut, one with a part past the nesting or count limits, or one over 256 KB. So is a removal whose name is over 255 characters, which mixpanel-browser would cut, so it would remove another property. So is a name mixpanel-browser writes itself and drops from an update without a word: `$distinct_id`, `$token`, `$device_id`, `$user_id` and `$had_persisted_distinct_id` in traits, `$group_key` and `$group_id` in group traits.
- `reset` calls `reset()`. Mixpanel forgets the user and the queued profile updates, starts a new device id, and drops every super property, including the ones your application registered, which it has to register again.

## Consent

Initialize Mixpanel opted out when a consent purpose gates it, because it can collect before Trace starts. `opt_out_tracking_by_default: true` stops it tracking, `opt_out_persistence_by_default: true` also keeps it from storing its identifiers until then, and `opt_out_tracking_persistence_type: "cookie"` keeps its opt-out working where localStorage is unavailable: mixpanel-browser 2.83.0 then records an opt-out in a cookie but checks localStorage before tracking, so its own automatic collection would go on. Trace's own gating holds either way, because Trace never hands Mixpanel an event while consent is closed.

Restore the stored decision with `trace.consent.set(...)` before `trace.start()`. A gated destination that starts while consent is unknown is opted out at once, which removes Mixpanel's stored identifiers and drops the events it still held unsent, only to be opted back in a moment later.

- When consent closes, and at start while it is closed, Trace calls `opt_out_tracking({ delete_user: false })`: Mixpanel's default would delete the identified user's profile. Mixpanel then removes its stored identifiers and drops the events it still held unsent, which were already `submitted`. It keeps the user in memory and stores it again when consent opens, so Trace does not identify the user a second time.
- When consent opens, and at start while it is open, Trace calls `opt_in_tracking({ track: () => {} })`: Mixpanel's default would track an `$opt_in` event.
- A destination the `consent` option does not name never receives these calls, so Mixpanel's own opt-out state stays yours.

While opted out, Mixpanel drops every event, and so does a browser with Do Not Track on unless you initialize with `ignore_dnt: true`. Such an event is `dropped` as `provider-filtered`.

## Behavior

- Platforms and versions: `mixpanel-browser` 2.83 or later within 2.x, an optional peer dependency, typed structurally through `MixpanelLike`. Browsers only.
- Initialization is yours. Trace never initializes, configures or closes Mixpanel. Before `init`, every mixpanel-browser method throws, so `open` reads only the `__loaded` flag that `init` sets, and fails the destination with a `TraceError` whose code is `NOT_INITIALIZED`. Call `trace.start()` again after `init` and it opens.
- Evidence is `sdk-call-returned`: `track` returned the payload once Mixpanel queued or sent it. In batch mode, the default, the payload waits in Mixpanel's localStorage queue, so `submitted` does not mean Mixpanel stored the event. `track` answers nothing when Mixpanel filters an event (opt-out, Do Not Track, a bot user agent, an event passed to `disable()`, a `before_track` hook that answers `undefined`) and `null` when a `before_send_events` hook drops an immediate request; both are `dropped` as `provider-filtered`. In immediate mode, a request the browser refuses to start answers `false`, which is `failed` with a `TraceError` whose code is `DELIVERY_FAILED`.
- Every call is synchronous, so the Trace's `timeout` never applies to Mixpanel.
- Flush: there is none, and `trace.flush()` reports `unsupported`. mixpanel-browser sends its batches on its own schedule and flushes them through `sendBeacon` when the page is hidden.
- Quirks:
  - Every change of user costs one `$identify` event.
  - A hook refuses by answering `undefined`. In 2.83.0 a `before_track` hook that answers `null` does not filter: it sends an event named `null`.
  - `before_track`, `before_send_events` and `property_blacklist` can rewrite or drop an event after Trace handed it off.
  - Mixpanel is one instance per page. Register it under one destination name: two destinations over the same instance track every event twice.
- `native` is the instance you passed in, fully typed, for everything Trace does not wrap, such as feature flags and session replay. Calls made on it bypass Trace's routing, consent, receipts and privacy.

## Tests

- Against a fake modelled on the source of `mixpanel-browser` 2.83.0 (`src/fakeMixpanel.fixture.ts`), which records every call with its arguments and reproduces the SDK's quirks: the caller's properties merged over its defaults and super properties, strings cut to 255, the profile queue that waits for `identify`, the names people and group updates drop without a word, the `$device:` refusal, the stray `group_key` of `remove_group`, and the destructive defaults of opting out and in.
  - The session: coldness, `NOT_INITIALIZED`, the mapping, every answer `track` can give, the five-day window and a time ahead of the clock, the event size at 999,999 and 1,000,000 bytes, identity, a user id over 255 characters, groups, owned group types, group types and ids over 255 characters, traits left out whole and silently dropped names, reset, collection, `native`, and that Trace never initializes or configures Mixpanel.
  - A real `Trace` over the fake: a user switch resets before the next user is identified, a sign-in keeps the anonymous traits, a sign-out resets, groups through the planner, a property named like a group type omitted so the event keeps its membership, an owned group type and a refused id reported as unsupported steps, a move to a group id over 255 characters that leaves the earlier group and is reported as unsupported, a user id over 255 characters failing its step so that user's events are skipped and the next user's flow, consent closed at start, granted, revoked and granted again, a destination consent does not name, the five-day window on the Trace's clock, a receipt combining the sanitizer's losses with Mixpanel's, `native` and `flush`.
  - `testAnalyticsAdapter`, the conformance suite.
- Each limit at its boundary, in the helpers' own tests (`src/utils/*.test.ts`).
- Against the real SDK: the installed `mixpanel-browser` 2.83.0 runs in jsdom with batch mode off and `XMLHttpRequest` and `fetch` stubbed, and the tests read every request it starts: the `/track` payload with its time, id and cut strings, the `null` and `false` answers, `$identify`, the `/engage` and `/groups` updates, the profile queue of a new page load, an owned group type refused before the SDK sees it, a property named like a group type omitted while the membership reaches `/track`, leaving a group, reset, opting out and in, a refused id, and, through a real `Trace`, a user id over 255 characters that never reaches the SDK while the next user's events go under their own id. The conformance suite runs over the real SDK as well.
- Typecheck only (`src/mixpanel.contracts.ts`): the real SDK's default export and a named instance are assigned to `MixpanelLike`, a Trace over the adapter keeps the real SDK's type on `native`, the fake's members are pinned to the real SDK's names and arity, and a wrong object and the React Native SDK are refused.
- Never: nothing is sent to Mixpanel, so no test proves what its servers keep, refuse or deduplicate. Batch mode, `sendBeacon`, Do Not Track and bot filtering are not exercised.

## License

[MIT](LICENSE)
