# @priemskiyyy/trace-amplitude

Send [Trace](../../core) events to Amplitude through the browser or React Native SDK your application already initialized. Each event is one `track` call with its time and its id as `insert_id`, and a plugin you add to the SDK files it under the user and device it was tracked with. Identity, groups, consent and flush use Amplitude's own calls, and the package imports no SDK. For a generated Ampli wrapper, use [`@priemskiyyy/trace-ampli`](../ampli); on a server, [`@priemskiyyy/trace-amplitude-node`](../amplitude-node).

## Installation

```sh
pnpm add @priemskiyyy/trace @priemskiyyy/trace-amplitude @amplitude/analytics-browser
```

On React Native, install `@amplitude/analytics-react-native` in place of the browser SDK.

## Create a Trace

```ts
import * as Amplitude from "@amplitude/analytics-browser";
import { event, Trace } from "@priemskiyyy/trace";
import { amplitude, identityPlugin } from "@priemskiyyy/trace-amplitude";

await Amplitude.init("amplitude_api_key", { autocapture: false, optOut: true })
  .promise;

const plugin = identityPlugin();

Amplitude.add(plugin);

const trace = new Trace({
  events: {
    "Checkout Started": event<{ cart: { id: string }; value: number }>(),
  },
  destinations: {
    product: amplitude({
      sdk: Amplitude,
      Identify: Amplitude.Identify,
      plugin,
    }),
  },
  consent: { product: ["analytics"] },
});

trace.start();
trace.consent.set({ analytics: "granted" });
trace.user({ id: "user_42", traits: { plan: "pro" } });
trace.group("workspace", { id: "workspace_1", traits: { seats: 12 } });
trace.track("Checkout Started", { cart: { id: "cart_1" }, value: 49.5 });
```

On React Native, import the SDK from `@amplitude/analytics-react-native` and pass it the same way. Its `init` takes the user id second: `Amplitude.init("amplitude_api_key", undefined, { optOut: true })`.

Create one plugin per SDK and add it once `init` has finished. Amplitude keeps one plugin per name, so a second `identityPlugin()` added to the same SDK is never set up, and a destination given it fails with `NOT_INITIALIZED`; destinations over the same SDK share one plugin.

Call `init` once, keep the plugin added, and add it to the SDK you pass as `sdk`: the module namespace and each `createInstance()` are different SDKs. Amplitude takes the plugin out on `remove()` and on every later `init()`. From then until you add it again, each event fails with a `TraceError` whose code is `NOT_INITIALIZED`, and so does every change of traits or groups, rather than going out under whichever user Amplitude holds. A call Amplitude already holds when the plugin is taken out still names its own device and, when it was made for a user, that user, so an identified call keeps its user; an anonymous one is filed as Amplitude fills it, under whichever user it holds when it processes the call, which can be the next user. Take the plugin out only while no event is in flight, for example never at all. A plugin added to another SDK than `sdk` is set up there, which the adapter cannot tell apart, so the adapter's calls go out as Amplitude files them.

## Options

| Option     | Default  | Meaning                                                                                                                                     |
| ---------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `sdk`      | required | The Amplitude SDK your application initialized: the module namespace or an instance from `createInstance()`, browser or React Native.       |
| `Identify` | required | Amplitude's `Identify` class, from the same SDK. User and group properties travel through it, and this package cannot import it.            |
| `plugin`   | required | The plugin from `identityPlugin()`, added to the same SDK with `add(plugin)`. It files each call under the user and device it was made for. |

## How an event is mapped

| Trace           | Amplitude                                                                                                                           |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `name`          | the event type, unchanged                                                                                                           |
| `properties`    | `event_properties`                                                                                                                  |
| `context`       | `event_properties` too, under the event's own properties                                                                            |
| `id`            | `insert_id`: Amplitude ignores a repeated insert id from the same device for 7 days                                                 |
| `timestamp`     | `time`                                                                                                                              |
| `identity.user` | `user_id`, beside `device_id`, the device Amplitude held when the call was made, both named by the call and set again by the plugin |

A context key that a property of the event shadows is left out, an `omitted` loss at `context.<key>`. Losses are listed in the order of the event: properties, then context.

Amplitude fills in the user and device of a call when its timeline processes it, a timer tick after the call and, on React Native, only after a native call, so it would give an event whichever user it holds by then. The plugin is an enrichment plugin, which Amplitude runs after its own context plugin has filled in the user and device, on React Native after that native call too. Each call Trace makes names the user it was made for, if any, and its device at the top of its options, which Amplitude keeps, and carries both again in its `extra`, under `@priemskiyyy/trace-amplitude`: the plugin sets them and removes the user of an anonymous call, which nothing else can. Amplitude hands a call's `extra` to every plugin, as its [plugin guide][plugins] shows an enrichment plugin reading it, and leaves it out of the upload; that it is left out is not documented but read from analytics-core 2.56 (`plugins/destination.js:216`) and shown by the tests on the real SDK. The plugin keeps nothing but whether it is set up, so nothing is left behind when Amplitude drops a call. So an event tracked for one user keeps that user and device, and an event tracked while nobody was signed in is never filed under a user, whatever Amplitude holds when it processes the event, and whatever other plugins run before it. Identity changes take effect at once, with nothing to wait for. Events your application sends to Amplitude itself pass through the plugin untouched.

The adapter checks every limit Amplitude documents that it can check in the application, in Amplitude's own unit. Where Amplitude cuts a value itself, the value is sent and reported `truncated`. String lengths are counted in UTF-16 code units, JavaScript's `length`, so most emoji count as two characters.

| Limit                             | Amplitude's documentation                                                                                                                                           | What the adapter does                                                                                                                                                                                                                                                             | Loss                                 |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| A property value's length         | "Amplitude limits most property values to 1,024 characters" and "Amplitude truncates values that exceed these limits" ([limits][limits])                            | sends it whole, for Amplitude to cut                                                                                                                                                                                                                                              | `truncated` past 1,024 characters    |
| Nesting                           | "Object depth may not exceed 40 layers", for event and user properties ([HTTP API][http])                                                                           | leaves out an object or list past the 40th layer, counting `event_properties` as the first                                                                                                                                                                                        | `unsupported` per value left out     |
| What `Identify` takes             | analytics-core 2.56 `utils/valid-properties.js` drops a whole user property holding a `null`, a boolean or list inside a list, or an object of more than 1,000 keys | strips a `null` inside an object in a trait and sends the rest of it; leaves out whole a trait holding a `null` in a list, whose later items stripping it would shift, any of the others, or anything past the 40th layer, as `Identify` would; throws `TraceError` `UNSUPPORTED` | none: identity calls have no receipt |
| A user or group property's length | the 1,024 characters above, which Amplitude cuts                                                                                                                    | leaves out whole a trait holding a string over 1,024 characters anywhere in it, so no stored value is cut or sent in part, and throws `TraceError` `UNSUPPORTED`                                                                                                                  | none: identity calls have no receipt |
| User and device ids               | "Device IDs and User IDs must be strings of 5 characters or more", and ids such as `null`, `unknown` or `-1` answer a 400 error ([HTTP API][http])                  | checks neither: `init` can change the minimum with `minIdLength`, and the page does not say how it compares case                                                                                                                                                                  | none                                 |

What is not verified:

- what Amplitude does with an event type or a user id over 1,024 characters: the [HTTP API][http] page gives "All string values, like `user_id`, event, or user property values" that limit without saying whether it cuts or refuses them, so the adapter sends both as they are;
- what Amplitude's servers do with an object past the 40th layer, which the adapter never sends;
- whether Amplitude counts the 1,024 characters in UTF-16 code units, as the adapter does, or otherwise.

[limits]: https://amplitude.com/docs/faq/limits
[http]: https://amplitude.com/docs/apis/analytics/http-v2
[plugins]: https://amplitude.com/docs/sdks/sdk-plugins

## Identity

- A user is `setUserId(id)`, which sends no event of its own.
- Traits are one `Identify` per change: an `unset` for each removed trait and a `set` for each value, sent with `identify`. The call names the change's user and device and carries them in its `extra`, so it is filed under them like an event. Amplitude's `identify` also moves the SDK to the user and device its options name, which are the ones it holds when the call is made.
- A group membership is `setGroup(type, id)`, and its traits are a `groupIdentify(type, id, identify)`, each carrying its user and device the same way. A group trait set to `null` is an `unset` on the group.
- Leaving a group is `setGroup(type, [])`. Amplitude documents no way to leave a group, so this is best effort: it overwrites the value held under that group type.
- A sign-out or an account switch is `reset()`, which clears the user id and starts a new device id.
- A trait `Identify` refuses, or one holding a value past a limit anywhere in it, is left out whole and never sent in part; only a `null` inside an object in a trait is stripped, and the rest of that trait sent. A `null` in a list leaves the whole trait out, since stripping it would shift the items after it. The other traits are sent, and the change is reported as unsupported, which Trace records as an `identity step unsupported` diagnostic.

## Consent

Initialize Amplitude opted out when the destination is gated by consent, with `optOut: true` in its init options, because Amplitude can collect before Trace starts. Trace calls `setOptOut(false)` once every purpose the destination needs is granted and `setOptOut(true)` when one is withdrawn, and a gated destination that opens while its purpose is still unknown is opted out at once. Amplitude keeps the setting across page loads. Autocapture, sessions and attribution tracking are Amplitude's own: they run outside Trace's consent, privacy and receipts, so configure them in `init`.

## Behavior

- Versions: `@amplitude/analytics-browser` 2.45 or later within 2.x and `@amplitude/analytics-react-native` 1.10 or later within 1.x, optional peer dependencies, typed structurally through `AmplitudeLike`. The Node SDK holds no user between calls and has its own package.
- Initialization is yours, and Trace never initializes or shuts Amplitude down. Until Amplitude has set up the plugin and knows its device, `trace.start()` fails the destination with a `TraceError` whose code is `NOT_INITIALIZED`. Await `init(...).promise`, add the plugin and call `trace.start()` again; the events tracked meanwhile are delivered while they are still in Trace's buffer. Added after `init` has finished, the plugin also keeps Trace from sending anything while Amplitude is still adding its own destination. Added before `init`, the plugin is set up during `init`, so a `trace.start()` made before `init` has finished can open the destination early; an event it sends then is lost, while its receipt says `submitted`, if Amplitude processes the event before its own destination is added. In Node that never happened, because `init` finished first.
- Evidence is `sdk-call-returned`: `track` answers once Amplitude took the call. The upload happens later, and only a flush reads its result.
- Flush: `trace.flush()` calls Amplitude's `flush()` and then waits for the upload of every event this destination handed over, within the time `trace.flush()` gives it. It answers `flushed` when Amplitude accepted all of them, and `failed` with a `TraceError` whose code is `DELIVERY_FAILED` when Amplitude answered any of this destination's uploads with a status outside 2xx, or one rejected, since the last flush that answered in time, so a refusal that lands after a flush ran out of time goes to the next one. Amplitude's own flush answers while an earlier upload is still in flight and sends without retries, so a flush can turn a passing server error into a lost event.
- A plugin of your application's that throws stops Amplitude's timeline: the call it was processing is dropped without an answer, and later calls wait until Amplitude's next `flush()`, still carrying their user and device. Amplitude gives no signal that it dropped the call, so from then on every `trace.flush()` waits for that upload until its own timeout, for as long as the page lives.
- A second Trace destination over the same SDK sends every event twice. Register one Amplitude instance under one destination name.
- `native` is the SDK you passed in, fully typed, for everything Trace does not wrap. Calls made on it bypass Trace's validation, consent, privacy and receipts.

## Tests

- Against an in-process fake modelled on `@amplitude/analytics-browser` 2.45.10 and `@amplitude/analytics-react-native` 1.10.0, with every member typed as the real SDK types it and with their quirks: a timeline that fills in the user and device only when it processes a call and then runs the plugins added, plugins set up at `add` or at `init` and taken out by `remove` and a later `init` while the calls they held wait on, an upload without `extra`, the answer an opted-out call gets, the new device a reset starts and a `flush` that answers before the uploads. User properties go through the SDK's own `Identify`. The tests cover the plugin, the event mapping, the losses and limits, identity, groups, collection, flush, readiness, the plugin taken out and added again with the calls held meanwhile, and that creating the adapter or the plugin calls nothing, both on the session and through a real `Trace`.
- The conformance suite, `testAnalyticsAdapter`, over the same fake.
- Against the real `@amplitude/analytics-browser` 2.45.10 in Node, with `fetch` stubbed and each event read through a destination plugin: readiness with and without the plugin, one plugin per SDK, a Trace event keeping its user and device while an event of the application's own passes through untouched, an event tracked before a sign-in staying anonymous through a sign-in and a switch in the same tick with and without a slow plugin of the application's before the plugin, an identity change applied at once, an event failing and nothing uploaded once `remove()` or a second `init()` has taken the plugin out, an event of Ada's still uploaded under her after a switch to bob and `remove()` or a new `init()` in the same tick, the calls held at a second `init()` keeping their user and device once the plugin is added again, a throwing plugin of the application's losing only its own call, the payload uploaded with each call's user and device and no `extra`, the uploaded event, a long string sent whole, which traits `Identify` gets, and a refused upload failing the flush.
- Typecheck only: the browser and React Native SDKs, as module namespaces and from `createInstance()`, assigned to `AmplitudeLike` and taking the plugin with `add`, the plugin as an Amplitude enrichment plugin, the fake pinned to both SDKs, `native` keeping each SDK's type through a `Trace`, and the Node SDK, a missing plugin and another plugin refused.
- Never: the React Native SDK at runtime, which needs a React Native host; that its enrichment plugins run after its context plugin is read from its source (`lib/module/plugins/context.js` is a `before` plugin that awaits its native call, and analytics-core 2.57's timeline runs every `before` plugin before any enrichment plugin). Nor the browser SDK with cookie storage or attribution tracking on. No event is sent to Amplitude.

## License

[MIT](LICENSE)
