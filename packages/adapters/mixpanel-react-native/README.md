# @priemskiyyy/trace-mixpanel-react-native

Send [Trace](../../core) events to Mixpanel from React Native. You pass in the mixpanel-react-native instance your application created and initialized, so this package imports no SDK. Each event is one `track` call carrying its time and its id, and the user, their traits and their group memberships become Mixpanel's own identify, profile and group calls. In the browser, use `@priemskiyyy/trace-mixpanel`; on a server, `@priemskiyyy/trace-mixpanel-node`.

Version 0.1.0 is an initial preview. APIs may change before 1.0. See the [verification limits](https://github.com/priemskiyyy/trace/blob/main/docs/verification.md) before adopting an adapter.

## Installation

```sh
pnpm add @priemskiyyy/trace @priemskiyyy/trace-mixpanel-react-native mixpanel-react-native
```

## Create a Trace

```ts
import { event, Trace } from "@priemskiyyy/trace";
import { mixpanel } from "@priemskiyyy/trace-mixpanel-react-native";
import { Mixpanel } from "mixpanel-react-native";

const client = new Mixpanel("YOUR_PROJECT_TOKEN", false);

await client.init();

const trace = new Trace({
  events: {
    "Checkout Started": event<{ cart: { id: string }; value: number }>(),
  },
  destinations: { product: mixpanel({ sdk: client }) },
  consent: { product: ["analytics"] },
});

trace.consent.set({ analytics: "granted" });
trace.start();
trace.user({ id: "user_42", traits: { plan: "pro" } });
trace.group("workspace", { id: "workspace_1" });
trace.track("Checkout Started", { cart: { id: "cart_1" }, value: 49.5 });
```

## Options

| Option | Default  | Meaning                                                                                            |
| ------ | -------- | -------------------------------------------------------------------------------------------------- |
| `sdk`  | required | The mixpanel-react-native `Mixpanel` your application created and initialized with `await init()`. |

## How an event is mapped

Each event is one `sdk.track(name, properties)` call.

| Trace        | Mixpanel                                                                                          |
| ------------ | ------------------------------------------------------------------------------------------------- |
| `name`       | the event name                                                                                    |
| `properties` | event properties                                                                                  |
| `context`    | event properties under the event's own: a context key a property shadows is an `omitted` loss     |
| `timestamp`  | `time`, in milliseconds                                                                           |
| `id`         | `$insert_id`, which Mixpanel deduplicates on together with the name, the time and the distinct id |
| `identity`   | nothing on the event: Mixpanel files it under the user it identifies, as described below          |

The adapter checks every limit Mixpanel documents that it can check on the device, in the unit Mixpanel documents. mixpanel-react-native cuts nothing itself, so where Mixpanel cuts a value, the value is sent whole and reported `truncated`. Where Mixpanel's documentation gives a limit and not what happens past it, the adapter leaves the part out and reports it, so what Trace sends stays inside every documented limit. The five-day window runs on the Trace's clock, the `now` option, which is the clock that stamped the event. Losses are listed in the order of the event: properties, then context, then the rest.

| Limit                            | Mixpanel's documentation                                                                                                 | What the adapter does                                                                                                                                                          | Loss                                                        |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| An event older than five days    | `/track` takes the "Last 5 days only" ([Track events][track])                                                            | never sends it                                                                                                                                                                 | `dropped` as `provider-filtered`, `timestamp` `unsupported` |
| An event's size                  | "Must be smaller than 1MB of uncompressed JSON" ([Track events][track])                                                  | never sends an event of 1,000,000 bytes of JSON or more, measured as mixpanel-react-native sends it                                                                            | `dropped` as `provider-filtered`, `properties` `invalid`    |
| Properties per event             | "Must have fewer than 255 properties" ([Track events][track])                                                            | keeps 254, `time` and `$insert_id` among them, so context goes first                                                                                                           | `truncated` per key left out                                |
| Keys in a nested object          | "must have fewer than 255 keys" ([Track events][track], [data types][types])                                             | keeps the first 254                                                                                                                                                            | `truncated` per key left out                                |
| Nesting                          | "max nesting depth is 3" ([Track events][track], [data types][types])                                                    | leaves out an object below the third level; a list is not a level                                                                                                              | `unsupported` per object left out                           |
| Items in a list                  | "must have fewer than 255 elements" ([Track events][track])                                                              | keeps the first 254                                                                                                                                                            | `truncated` per item left out                               |
| Objects in a list                | "max 255 keys and no nesting" ([data types][types])                                                                      | leaves out an object or list inside an object that is a list item                                                                                                              | `unsupported` per value left out                            |
| A list or object property's size | "Event Property = 8KB" ([data types][types])                                                                             | leaves out a property over 8,000 bytes of JSON as sent                                                                                                                         | `invalid`                                                   |
| A string value                   | "at most 255 characters" ([events and properties][events])                                                               | sends it whole                                                                                                                                                                 | `truncated` past 255 characters                             |
| A property name                  | "at most 255 characters in length (longer names are truncated)" ([events and properties][events])                        | sends it                                                                                                                                                                       | `truncated` past 255 characters                             |
| Reserved names                   | the `$` and `mp_` prefixes, `time`, `distinct_id`, `token`, `ip`, `alias` and `bucket` ([reserved properties][reserved]) | leaves them out, so an event can neither move to another person nor change its time, project or geolocation                                                                    | `omitted`                                                   |
| `$insert_id`                     | "≤ 36 bytes and contain only alphanumeric characters or '-'" ([Import events][import])                                   | sends the event's id, a UUID, which always fits                                                                                                                                | none                                                        |
| A profile property (traits)      | "User Profile Property = 256KB", with the string, name, nesting, key and list limits above ([data types][types])         | leaves out a trait Mixpanel would not keep exactly, sends the rest, and throws `TraceError` `UNSUPPORTED`, which Trace reports as a diagnostic                                 | none: identity calls have no receipt                        |
| A user id                        | "at most 255 characters" ([events and properties][events]), the distinct id's own value                                  | never identifies an id over 255 characters: `identify` throws `TraceError` `DELIVERY_FAILED` before any call, so two users who share the first 255 never become one            | that user's events are `skipped` as `identity-failed`       |
| A group type or id               | "at most 255 characters in length (longer names are truncated)" ([events and properties][events])                        | sends no group request for a type or id over 255 characters: a type throws `TraceError` `UNSUPPORTED` before any call, an id after leaving; events flow without the membership | none: identity calls have no receipt                        |

The documentation says characters without saying how it counts an emoji, so string values and names are counted in UTF-16 code units, the stricter reading, in which most emoji count as two. The 8 KB, 256 KB and 1 MB limits do not say whether a kilobyte is 1,000 or 1,024 bytes, so the adapter takes the stricter reading: 8,000, 256,000 and 1,000,000 bytes. mixpanel-react-native adds its own properties to each event, such as the library version and your super properties, and the adapter cannot count them, so an event near 1 MB or near 255 properties can still pass the limit once they are added.

What is not verified:

- what Mixpanel's servers do past the limits they document without saying what happens: the property, key, item, nesting and size limits;
- whether the string limit counts characters or bytes, since the [data types][types] page speaks of "a limit of 255 bytes";
- the event name: Mixpanel documents no length for it and mixpanel-react-native cuts nothing, so the adapter sends it whole and reports nothing;
- whether the native SDKs cut long strings before sending;
- that the native SDKs apply calls in the order they arrive, which native mode's identity order below relies on: it is read from their source, not run on a device;
- that Mixpanel replaces a time in the future "with the current present time at ingestion" ([Track events][track]), judged on its own clock; the adapter sends the time as it is;
- the soft limits of 5,000 distinct event names and 5,000 distinct properties per project;
- deduplication.

[track]: https://docs.mixpanel.com/reference/track-event
[types]: https://docs.mixpanel.com/docs/data-structure/property-reference/data-type
[events]: https://docs.mixpanel.com/docs/data-structure/events-and-properties
[reserved]: https://docs.mixpanel.com/docs/data-structure/property-reference/reserved-properties
[import]: https://docs.mixpanel.com/reference/import-events

## Identity

Mixpanel holds one user per app install, and Trace's planner sends it what it needs before each event it hands off:

- `identify` calls `identify(user.id)` and answers its promise, so Trace waits until Mixpanel has switched its user before it hands over the events that need it. Identifying the user Mixpanel already holds changes nothing. If Mixpanel rejects the identify, the step fails, and the event that needed it is skipped as `identity-failed`, never sent under the previous user. A user id over 255 characters never reaches Mixpanel: since Mixpanel keeps only the first 255 characters of a distinct id, two users who share that prefix would become one, so `identify` throws `TraceError` `DELIVERY_FAILED` before any call.
- Traits call `getPeople().set(...)` for the values and `getPeople().unset(name)` once per removed trait, because mixpanel-react-native's `unset` takes one name. Traits set while anonymous wait in Mixpanel until a user is identified. A trait Mixpanel would not keep exactly as given is left out whole: one holding text or a name over 255 characters, which Mixpanel would cut, or a part past the nesting, key, list or 256 KB limits. A blank or empty trait name, set or removed, is left out the same way, because mixpanel-react-native's `unset` throws on it, so a trait set under it could never be removed. The rest of the update is sent, and the step throws `TraceError` `UNSUPPORTED`: identity calls have no receipt to name a cut on, so no stored profile value is ever changed without a word.
- Groups call `setGroup(type, id)`, which registers the membership as a super property that every later event carries and sets it on the user's profile. A group's own traits are refused with `TraceError` `UNSUPPORTED` once the membership is set, because mixpanel-react-native's `getGroup` answers the first group it created for every later key and id, so the traits of any other group would land on that first one. Leaving a group calls `unregisterSuperProperty(type)` and `getPeople().unset(type)`, never `removeGroup`, which needs the id being left. A type over 255 characters is refused as unsupported before any call, since Mixpanel would cut it. A group id over 255 characters sends no group request at all, because a cut id would file the group's events under whichever group shares the kept prefix: the step leaves the type, through the same `unregisterSuperProperty` and `unset`, then throws `TraceError` `UNSUPPORTED`.
- A group type that is a name Mixpanel owns, such as `distinct_id`, `$device_id` or `bucket`, is refused with `TraceError` `UNSUPPORTED` before any call, both joining and leaving: as a super property it would overwrite Mixpanel's own on every later event.
- `reset` calls `reset()`, which answers nothing: mixpanel-react-native does not return its promise, so Trace cannot wait for it. Mixpanel forgets the user and every super property, including the ones your application registered, which it has to register again, and starts a new anonymous id.
- In native mode the native SDKs apply calls in the order they arrive, so the identify and the events after a reset follow it. In JavaScript mode, which mixpanel-react-native falls back to when its native module is missing, as in Expo Go, or with `useNative: false`, `reset()` rewrites the stored identity in several storage steps after it returns: an identify or an event that follows at once can land on the previous user's identity, and its `$identify` event can name the previous user. Use native mode where accounts switch on one device.

## Consent

The session has no `collection`: mixpanel-react-native's only opt-out, `optOutTracking()`, deletes the identified user's profile on the native SDKs, drops the events not yet sent and wipes the identity, and `optInTracking()` tracks an `$opt_in` event. That cannot serve as a switch Trace turns off and on as consent changes. Trace's own gating holds: while consent is closed, Trace hands Mixpanel nothing.

Create the instance with `trackAutomaticEvents` set to `false`, the second argument of `new Mixpanel(token, trackAutomaticEvents)`, when a consent purpose gates this destination, so Mixpanel records no automatic events of its own before consent. Do not initialize it opted out with `init(true)`: Trace never opts it back in, so Mixpanel would drop every event while its receipt says `submitted`.

## Behavior

- Platforms and versions: iOS and Android, with `mixpanel-react-native` 3.8 or later within 3.x, an optional peer dependency, typed structurally through `MixpanelLike`, and an engine that provides `TextEncoder`, such as Hermes in React Native 0.74 or later. It runs over the native Mixpanel-swift and mixpanel-android SDKs, or in JavaScript mode where the native module is missing.
- Initialization is yours. Trace never creates, initializes, opts out or flushes Mixpanel. Create the instance and `await init()` before `trace.start()`: mixpanel-react-native gives no sign that it was initialized, so opening the destination checks nothing, and before `init` iOS drops every call while Android creates an instance with default settings.
- Evidence is `sdk-call-returned`: `track` answers nothing, so `submitted` proves only that the call returned. Mixpanel drops an event while it is opted out without saying so.
- A blank event name makes mixpanel-react-native throw, which fails that event with its error.
- Flush: there is none, and `trace.flush()` reports `unsupported`. mixpanel-react-native's `flush()` returns nothing and proves nothing, and the native SDKs send on their own schedule.
- Quirks:
  - Every change of user costs one `$identify` event.
  - A property named like a group type replaces the membership on its own event, as it does in Mixpanel.
  - Register the instance under one destination name: two destinations over the same instance track every event twice.
- `native` is the instance you passed in, fully typed, for everything Trace does not wrap, such as feature flags and `timeEvent`. Calls made on it bypass Trace's routing, consent, receipts and privacy.

## Tests

- Against a fake modelled on the JavaScript wrapper of `mixpanel-react-native` 3.8.0 over a native module that keeps the order of its calls (`src/fakeMixpanel.fixture.ts`), which records every call with its arguments: `track` throwing on a blank name and keeping nothing while opted out, `identify` answering a promise that a test can hold, `unset` taking one name and throwing on a blank one, `setGroup` registering a super property and setting it on the profile, and `reset` answering nothing.
  - The session: coldness, the mapping, the five-day window and a time ahead of the clock, the event size at 999,999 and 1,000,000 bytes, a blank name, an event an opted-out Mixpanel drops, identify and its promise, traits with their profile limits and blank names, groups, a group's own traits, owned group types, leaving, reset, the absent collection and flush, `native`, and that Trace never initializes, opts out or flushes Mixpanel.
  - A real `Trace` over the fake: a user switch resetting before the next user is identified, an event waiting for identify, anonymous traits before a sign-in, a blank trait name set and removed as unsupported steps while the user's events are submitted, a sign-out, a group joined with traits and left, an owned group type reported as an unsupported step, a gated destination sent nothing while consent is closed, the five-day window on the Trace's clock, a receipt combining the sanitizer's losses with Mixpanel's, `native` and `flush`.
  - `testAnalyticsAdapter`, the conformance suite.
- Each limit at its boundary, in the helpers' own tests (`src/utils/*.test.ts`).
- Typecheck only (`src/mixpanel.contracts.ts`): the real `Mixpanel` is assigned to `MixpanelLike`, a Trace over the adapter keeps the real type on `native` with its `getDistinctId`, the fake's members are pinned to the real SDK's, and a wrong object, an `identify` that answers no promise and the browser SDK are refused.
- Never: mixpanel-react-native itself, which needs a React Native runtime for its native module and its JavaScript mode alike, a device, or Mixpanel's servers, so no test proves what they keep, refuse or deduplicate. JavaScript mode's reset race is read from the source, not reproduced.

## License

[MIT](LICENSE)
