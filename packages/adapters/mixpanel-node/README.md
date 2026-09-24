# @priemskiyyy/trace-mixpanel-node

Send [Trace](../../core) events to Mixpanel from a server. You pass in the client that the `mixpanel` package's `init` returned, so this package imports no SDK. A server builds one Trace per request or job over that shared client, and each event is one request for its user and the visitor's anonymous id, carrying its time and its id, answered once Mixpanel accepted it; traits and groups become profile and group updates for the user each update names. In the browser, use `@priemskiyyy/trace-mixpanel`; on React Native, `@priemskiyyy/trace-mixpanel-react-native`.

## Installation

```sh
pnpm add @priemskiyyy/trace @priemskiyyy/trace-mixpanel-node mixpanel
```

## Create a Trace

One client for the process, one Trace per request or job. A Trace is cheap to build, and a Trace per request never mixes two users:

```ts
import { event, Trace } from "@priemskiyyy/trace";
import { mixpanel } from "@priemskiyyy/trace-mixpanel-node";
import Mixpanel from "mixpanel";

const client = Mixpanel.init("YOUR_PROJECT_TOKEN");

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
      product: mixpanel({ sdk: client, anonymousId: visitorId }),
    },
  });

  trace.start();
  trace.user({ id: user.id, traits: { plan: user.plan } });
  trace.track("Checkout Started", { cart: { id: cart.id }, value: cart.value });

  await trace.flush();
  trace.dispose();
};
```

`visitorId` is the visitor id your application already keeps for signed-out traffic, such as a cookie. The client holds no queue: every call is one request. Events are sent at once, and a Trace's profile updates one after another. `await trace.flush()` waits for this Trace's requests, profile updates included, so a serverless handler can return safely after it.

## Options

| Option        | Default  | Meaning                                                                                                                                                                           |
| ------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sdk`         | required | The client `Mixpanel.init` returned. Mixpanel's browser and React Native SDKs are refused by the types.                                                                           |
| `anonymousId` | none     | The visitor id of the request. Every event carries it as `$device_id`, beside the user's `$user_id` once there is one. Without it, an event without a user cannot reach Mixpanel. |

## How an event is mapped

Each event is one `track(name, properties, callback)` call, which the client sends as one request.

| Trace                            | Mixpanel                                                                                                                                                                      |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `event.name`                     | the event name, unchanged                                                                                                                                                     |
| `event.properties`               | event properties                                                                                                                                                              |
| `event.context`                  | event properties under the event's own: a context key a property shadows is an `omitted` loss                                                                                 |
| `event.timestamp`                | `time`, in milliseconds                                                                                                                                                       |
| `event.id`                       | `$insert_id`, which Mixpanel deduplicates on together with the name, the time and the distinct id                                                                             |
| `event.identity.user`            | `$user_id`, the user the event was accepted with, however long it waited                                                                                                      |
| the `anonymousId` option         | `$device_id`: Mixpanel files an event with only a `$device_id` under that device, and merges the device into the user on the first event that carries both                    |
| `event.identity.groups`          | one property per membership, named for its type and holding its id, which is how Mixpanel attributes an event to a group; a property or context key of that name is `omitted` |
| neither a user nor `anonymousId` | nothing: the event is `skipped` as `unidentified`, because the client would send it with no id, filed under nobody                                                            |

The client writes its token, its library and its version into the object `track` is given, so the adapter hands it a fresh one; given a frozen object, those writes fail without a word and Mixpanel refuses the event.

The adapter checks every limit Mixpanel documents that it can check on the server, in the unit Mixpanel documents; the client itself checks nothing. Where Mixpanel cuts a value itself, the value is sent and reported `truncated`. Where Mixpanel's documentation gives a limit and not what happens past it, the adapter leaves the part out and reports it, so what Trace sends stays inside every documented limit. The five-day window runs on the Trace's clock, the `now` option, which is the clock that stamped the event. Losses follow the event's shape: the properties first, then the context, then the memberships, and the size of the whole event last.

| Limit                                     | Mixpanel's documentation                                                                                                 | What the adapter does                                                                                                                                                                  | Loss                                                        |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| An event older than five days             | `/track` takes the "Last 5 days only" ([Track events][track])                                                            | never sends it                                                                                                                                                                         | `dropped` as `provider-filtered`, `timestamp` `unsupported` |
| An event's size                           | "Must be smaller than 1MB of uncompressed JSON" ([Track events][track])                                                  | never sends an event of 1,000,000 bytes of JSON or more                                                                                                                                | `dropped` as `provider-filtered`, `properties` `invalid`    |
| Properties per event                      | "Must have fewer than 255 properties" ([Track events][track])                                                            | keeps 254, `time`, `$insert_id`, `$user_id` and `$device_id` among them, so memberships and then context go first                                                                      | `truncated` per key left out                                |
| Keys in a nested object                   | "must have fewer than 255 keys" ([Track events][track], [data types][types])                                             | keeps the first 254                                                                                                                                                                    | `truncated` per key left out                                |
| Nesting                                   | "max nesting depth is 3" ([Track events][track], [data types][types])                                                    | leaves out an object below the third level; a list is not a level                                                                                                                      | `unsupported` per object left out                           |
| Items in a list                           | "must have fewer than 255 elements" ([Track events][track])                                                              | keeps the first 254                                                                                                                                                                    | `truncated` per item left out                               |
| Objects in a list                         | "max 255 keys and no nesting" ([data types][types])                                                                      | leaves out an object or list inside an object that is a list item                                                                                                                      | `unsupported` per value left out                            |
| A list or object property's size          | "Event Property = 8KB" ([data types][types])                                                                             | leaves out a property over 8,000 bytes of JSON                                                                                                                                         | `invalid`                                                   |
| A string value                            | "at most 255 characters" ([events and properties][events])                                                               | sends it for Mixpanel to cut                                                                                                                                                           | `truncated` past 255 characters                             |
| A property name                           | "at most 255 characters in length (longer names are truncated)" ([events and properties][events])                        | sends it                                                                                                                                                                               | `truncated` past 255 characters                             |
| Reserved names                            | the `$` and `mp_` prefixes, `time`, `distinct_id`, `token`, `ip`, `alias` and `bucket` ([reserved properties][reserved]) | leaves them out of properties, context and group types, so an event can neither move to another person nor change its time, project or geolocation                                     | `omitted`                                                   |
| `$insert_id`                              | "≤ 36 bytes and contain only alphanumeric characters or '-'" ([Import events][import])                                   | sends the event's id, a UUID, which always fits                                                                                                                                        | none                                                        |
| A profile property (traits, group traits) | "User Profile Property = 256KB", with the string, name, nesting, key and list limits above ([data types][types])         | leaves out whole any name or value Mixpanel would cut or refuse, a removal's name included, sends the rest, and throws `TraceError` `UNSUPPORTED`, which Trace reports as a diagnostic | none: identity calls have no receipt                        |

String values and names are counted in UTF-16 code units, so most emoji count as two characters. The 8 KB, 256 KB and 1 MB limits do not say whether a kilobyte is 1,000 or 1,024 bytes, so the adapter takes the stricter reading: 8,000, 256,000 and 1,000,000 bytes. The client adds its token, its library and its version to each event, which the adapter does not count, so an event near 1 MB or near 255 properties can still pass the limit once they are added.

What is not verified:

- what Mixpanel's servers do past the limits they document without saying what happens: the property, key, item, nesting and size limits;
- whether the string limit counts characters or bytes, since the [data types][types] page speaks of "a limit of 255 bytes";
- that Mixpanel replaces a time in the future "with the current present time at ingestion" ([Track events][track]), judged on its own clock; the adapter sends the time as it is;
- how long a request may be: mixpanel 0.24.0 sends every event and profile update as base64 JSON in the query string of a GET request, and Mixpanel documents no limit on its length, so a large event may be refused below 1 MB;
- the soft limits of 5,000 distinct event names and 5,000 distinct properties per project;
- deduplication, how Mixpanel merges a device into a user, and how a project still on Original ID Merge, which expects `distinct_id`, files events that carry only `$user_id` and `$device_id`.

[track]: https://docs.mixpanel.com/reference/track-event
[types]: https://docs.mixpanel.com/docs/data-structure/property-reference/data-type
[events]: https://docs.mixpanel.com/docs/data-structure/events-and-properties
[reserved]: https://docs.mixpanel.com/docs/data-structure/property-reference/reserved-properties
[import]: https://docs.mixpanel.com/reference/import-events

## Identity

The client holds no user between calls: identity travels on every event, as Mixpanel's own guidance for servers asks, with `$user_id` and `$device_id` and no `distinct_id`. So the session has no `identify` and no `reset`, Trace plans no identity switch for it, and a user switch in a Trace needs no reset: each event and each update names its own user.

- Traits call `people.set(user.id, values)` and `people.unset(user.id, names)` for the user the update names. Mixpanel keeps traits on a user's profile, so traits set while signed out are reported as an unsupported step, the diagnostic `identity step unsupported`, and reach the user's profile once the user signs in.
- A trait, a group trait or a membership whose name or value Mixpanel would cut or refuse, such as a name or a group id over 255 characters on the user's profile, is left out whole, the rest of the update is sent, and the step throws `TraceError` `UNSUPPORTED`, so no stored profile value is ever altered silently. So is a removal whose name is over 255 characters, since Mixpanel would cut the name and remove another property; a name of 255 characters is removed. So are `ip` and `$ignore_time` set as values: the client moves them out of the update into the request's own fields, where `ip` places the profile and `$ignore_time` keeps its last-seen time. A removal of either is sent as it is, because the client moves them only out of a set.
- Groups call `groups.set(type, id, values)` and `groups.unset(type, id, names)` for the group's own traits, and `people.set(user.id, { [type]: [id] })` for the membership on the user's profile; every later event carries `{ [type]: id }`. Leaving a group calls `people.unset(user.id, [type])`; a type over 255 characters is refused as unsupported and removes nothing, since Mixpanel would cut it and remove another property. A membership while signed out still sets the group's traits and is reported as an unsupported step, because the membership lives on a user's profile. Group profiles need Mixpanel's Group Analytics add-on; without it the membership still arrives as an event and profile property.
- A group type that is a name Mixpanel owns, such as `distinct_id`, `$device_id` or `bucket`, is refused with `TraceError` `UNSUPPORTED` before any call, joining and leaving alike, because the membership would overwrite Mixpanel's own property on the user's profile, and is left out of every event as an `omitted` loss at `identity.groups.<type>`.
- An event that carries both `$user_id` and `$device_id` merges the device into the user. Mixpanel files a device's later events under the user it was merged into, so give a visitor a new anonymous id when a user signs out, as Mixpanel's browser SDK does on `reset`.
- An event keeps the user it was accepted with. The Trace drops a signed-out user's waiting events at the switch, and one handed over is sent under its own `$user_id` whatever the Trace holds by then, so there is no `auth-subject-mismatch` to check: the client authenticates with your project token, never as a user.
- A Trace's profile updates reach Mixpanel one at a time, each once Mixpanel answered the one before it, so a later update never overtakes an earlier one: a removed trait cannot come back, and a left group cannot stay. A traits or group step answers as soon as its requests are queued, and no event waits for a profile update; every event carries its own user, so the early answer cannot file one under anyone else. A refused update skips nothing, and the next `trace.flush()` reports it. An update Mixpanel never answers holds the Trace's later updates, and a flush then answers `timeout`.

## Consent

The client collects nothing on its own, so there is nothing to initialize opted out, and it has no opt-out of its own. This session has no `collection`, and Trace calls nothing on Mixpanel for consent. Set the request's consent decisions with `trace.consent.set(...)` before `trace.start()`; while a purpose the destination needs is not granted, Trace hands Mixpanel nothing, and every event is dropped for it as `consent`. The client sends `ip=0` by default, so Mixpanel does not place users by the server's address.

## Behavior

- Platforms and versions: Node, with `mixpanel` 0.24 or later within 0.x, an optional peer dependency, typed structurally through `MixpanelLike`.
- Initialization is yours. Trace never initializes or configures the client, and the client has nothing to close. It sends from the moment `init` returns it, so `open` never refuses.
- Evidence is `backend-acknowledged`: each event is its own request, and Mixpanel's answer `1` to it means Mixpanel accepted that event. Any other answer, or a network error, is `failed` with the client's own error. An event whose request outlives Trace's `timeout` is `indeterminate`; the request goes on, and nothing retries it.
- Flush: `trace.flush()` waits for the requests this Trace's session sent or queued before the call, events and profile updates alike, until its queue of profile updates has drained, and answers `failed` with `TraceError` `DELIVERY_FAILED` when Mixpanel refused any request since the last flush that answered in time, one refused before this flush began, or after a flush ran out of time, included; each of two overlapping flushes reports the refusals it saw. The client has no queue, so this is the whole boundary, and a Trace never waits for another Trace's requests.
- Quirks:
  - A group type is also a profile property named after it, as Mixpanel's own group calls do, so a trait of the same name and the membership overwrite each other.
  - `test: true` in the client's configuration marks every request as a test, `test=1`, which the adapter cannot see.
- `native` is the client you passed in, fully typed, for everything Trace does not wrap, such as `import` for events older than five days, `alias` and `track_batch`. Calls made on it bypass Trace's routing, consent, receipts and privacy.

## Tests

- Against a fake modelled on mixpanel 0.24.0 (`src/fakeMixpanel.fixture.ts`), which records every call with its arguments and every request it sends, and reproduces the client's quirks: one request per call answered through its callback, held answers released oldest or newest first, the token, library and version written into the object `track` is given and lost on a frozen one, `time` checked and rewritten, and `ip` and `$ignore_time` moved out of profile and group updates.
  - The session: coldness, `open` never refusing, the mapping, `$user_id` and `$device_id`, `unidentified`, an answer that waits for Mixpanel's own, a refusal, the fresh object, an event keeping its user after a later switch, the five-day window, the event size at 999,999 and 1,000,000 bytes, traits, groups, profile requests sent one after another by steps that answer at the call, owned group types, a `__proto__` group type, the profile limits, removals and a left group type over 255 characters left out, the absence of `identify`, `reset`, `collection` and `dispose`, a flush that waits for queued requests, `native`, and that Trace never initializes the client.
  - A real `Trace` over the fake: receipts combining the sanitizer's losses with Mixpanel's, a refused event settling `failed`, a user switch without a reset, a removal that never reaches Mixpanel before its set, an event sent while the profile update before it waits for Mixpanel, a flush that waits for the profile updates made after the last event, a sign-out with and without `anonymousId`, anonymous traits reaching the user who signs in, groups through the planner with an owned type reported as an unsupported step, consent, the five-day window on the Trace's clock, an event outliving the timeout while a later flush still waits for it, a refused profile update that skips no event and that the next flush reports, a profile request never answered that skips no event, and per-request Traces over one shared client, with an adapter each or one shared, whose interleaved events, traits and groups never carry the other request's user or visitor whatever order Mixpanel answers in.
  - `testAnalyticsAdapter`, the conformance suite, without and with an anonymous id.
- Each limit at its boundary, in the helpers' own tests (`src/utils/*.test.ts`), with the request tracker: events sent at once, profile requests one after another, and a flush that reports every refusal since the last one that answered in time, a flush that ran out of time and overlapping flushes included.
- Against the real SDK: `src/mixpanel.sdk.test.ts` points the installed `mixpanel` 0.24.0 client at a `node:http` server on `127.0.0.1`, which answers `1` or `0` as Mixpanel does, and reads every request: the event with its ids, time, token and properties over its context; a refusal failing an event through a Trace; the token lost on a frozen object; an event with no id at all that the adapter never sends; the `/engage` and `/groups` updates, each arriving once the one before it was answered; `ip` moved into `$ip`, and a removal of `ip` or `$ignore_time` sent as it is; a flush that waits for a held answer; a user switch through a Trace; a removal that arrives only once its set was answered, with a flush that waits for it; a flush that waits for the three requests of updates made after the last event; and per-request Traces over one client, answered newest first, that never mix their ids. The conformance suite runs over the real client as well.
- Typecheck only (`src/mixpanel.contracts.ts`): the real client is assigned to `MixpanelLike`, the fake's members and their parameters are pinned to the real client's overloads, a drifted parameter refused, a Trace over the adapter keeps the real type on `native`, and a wrong object, the browser and React Native SDKs and an anonymous id that is not a string are refused.
- Never: nothing reaches Mixpanel, so no test proves what its servers keep, refuse or deduplicate, or how they merge a device into a user.

## License

[MIT](LICENSE)
