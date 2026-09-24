# @priemskiyyy/trace-ampli

Send [Trace](../../core) events through the Ampli wrapper Amplitude generated from your tracking plan. `fromAmpli` declares the events from the generated classes, so the canonical names, required and optional properties, literal unions and the constants a generated constructor injects all come from the generated code and are never redefined. You pass in the `ampli` object your application loaded, so this package imports no SDK.

## Installation

```sh
pnpm add @priemskiyyy/trace @priemskiyyy/trace-ampli @amplitude/analytics-browser
```

Generate the wrapper with `ampli pull`, as Amplitude documents.

## Create a Trace

```ts
import * as amplitude from "@amplitude/analytics-browser";
import { Trace } from "@priemskiyyy/trace";
import { ampli, fromAmpli, identityPlugin } from "@priemskiyyy/trace-ampli";
import * as Ampli from "./ampli";

await Ampli.ampli.load({ environment: "production" }).promise;

const plugin = identityPlugin();

Ampli.ampli.client.add(plugin);

const trace = new Trace({
  events: fromAmpli({
    "Checkout Started": Ampli.CheckoutStarted,
    "Song Played": Ampli.SongPlayed,
  }),
  destinations: {
    product: ampli({ sdk: Ampli.ampli, Identify: amplitude.Identify, plugin }),
  },
});

trace.start();
trace.user({ id: "user_42" });
trace.track("Checkout Started", { cartId: "cart_1" });
```

The generated module exports an `ampli` of its own. Import it as a namespace, as above, or rename it, and keep `ampli` for the adapter.

Create one plugin per wrapper and add it to `ampli.client` once `ampli.load()` has finished. Amplitude keeps one plugin per name, so a second `identityPlugin()` added to the same client is never set up, and a destination given it fails with `NOT_INITIALIZED`; destinations over the same wrapper share one plugin. Keep the plugin added: Amplitude takes it out on `ampli.client.remove()` and on every new `ampli.client.init()`, and Trace then sends nothing until you add the same plugin again. Add it to `ampli.client` and to no other Amplitude instance: on another instance that has been initialized it is set up without seeing the wrapper's calls, which the adapter cannot tell apart, so those calls go out as Amplitude files them.

## Options

| Option     | Default  | Meaning                                                                                                                                       |
| ---------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `sdk`      | required | The generated `ampli` object, loaded by your application.                                                                                     |
| `Identify` | required | Amplitude's `Identify` class from `@amplitude/analytics-browser`, which carries trait changes.                                                |
| `plugin`   | required | The plugin from `identityPlugin()`, added to `ampli.client` with `add(plugin)`. It files each call under the user and device it was made for. |

## Events from the tracking plan

- `fromAmpli` takes the generated classes keyed by their canonical names, each class's `event_type`. It constructs each class once, without arguments, to read that name, and a key that differs throws `TraceError` `INVALID_CONFIGURATION` naming both, because a generated class declares its name as a mutable field that TypeScript cannot check.
- `trace.track` takes exactly what the generated constructor takes: required properties are required, optional ones optional, a class without a constructor argument takes no properties, a literal union keeps its members, and an unknown key or an unknown event name is refused.
- An event's properties, as `trace.events` and `defaults.to` see them, are what the constructed class holds, the injected constants included.
- Every event constructs its class again, so the constants a generated constructor injects are sent, and a constant is never caller input.
- The registry is frozen.

## How an event is mapped

Each event is one `ampli.track({ event_type, event_properties }, { time, insert_id, user_id, device_id, extra })` call.

| Trace       | Amplitude                                                                                                                                                                                                                                                                   |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`      | `event_type`                                                                                                                                                                                                                                                                |
| properties  | `event_properties`                                                                                                                                                                                                                                                          |
| context     | `event_properties`, under the properties: a property wins, and each context key it shadows is an `omitted` loss                                                                                                                                                             |
| `id`        | `insert_id`, which Amplitude uses to drop a duplicate from the same device for seven days                                                                                                                                                                                   |
| `timestamp` | `time`                                                                                                                                                                                                                                                                      |
| identity    | `user_id` from the event's identity and the `device_id` Amplitude held when the event was tracked, in the options, where Amplitude keeps them, and again in `extra` for the plugin; an anonymous event carries no user, and the plugin takes out the one Amplitude fills in |

The losses follow the event's shape: the properties' first, then the context's.

### Limits

The adapter checks every limit Amplitude documents that it can check in the application, in Amplitude's own unit. A string's length is counted in UTF-16 code units, JavaScript's `length`, so most emoji count as two characters.

| Limit                     | Amplitude's documentation                                                                                                                                           | What the adapter does                                                                                                                                                                | Loss                                         |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------- |
| A property value's length | "Amplitude limits most property values to 1,024 characters" and "Amplitude truncates values that exceed these limits" ([limits][limits])                            | sends an event property whole, for Amplitude to cut                                                                                                                                  | `truncated` past 1,024 characters            |
| Nesting                   | "Object depth may not exceed 40 layers", for event and user properties ([HTTP API][http])                                                                           | leaves out an object or list past the 40th layer of an event, counting `event_properties` as the first, and a whole trait holding one, counting `user_properties` as the first       | `unsupported` per value left out of an event |
| What `Identify` takes     | analytics-core 2.56 `utils/valid-properties.js` drops a whole user property holding a `null`, a boolean or list inside a list, or an object of more than 1,000 keys | strips a `null` under an object key and sends the rest of the trait, leaves out a whole trait holding a `null` in a list or any of the others, and throws `TraceError` `UNSUPPORTED` | none: an identity step has no receipt        |
| A trait's length          | the 1,024 characters above, which Amplitude would cut                                                                                                               | leaves out a whole trait holding a string past 1,024 characters at any depth, sends the other traits, and throws `TraceError` `UNSUPPORTED`                                          | none: an identity step has no receipt        |
| User and device ids       | "Device IDs and User IDs must be strings of 5 characters or more", and the page lists ids it refuses, such as `null`, `unknown` and `-1` ([HTTP API][http])         | checks neither: `init` can change the minimum with `minIdLength`                                                                                                                     | none                                         |

What is not verified:

- what Amplitude does with an event type or a user id over 1,024 characters: the [HTTP API][http] page gives "All string values, like `user_id`, event, or user property values" that limit without saying whether it cuts or refuses them, so the adapter sends both as they are;
- what Amplitude's servers do with an object past the 40th layer, which the adapter never sends;
- whether Amplitude counts the 1,024 characters in UTF-16 code units, as the adapter does, or otherwise.

[limits]: https://amplitude.com/docs/faq/limits
[http]: https://amplitude.com/docs/apis/analytics/http-v2
[plugins]: https://amplitude.com/docs/sdks/sdk-plugins

## Identity

| Trace      | Ampli                                                                                                                                                       |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `identify` | `ampli.identify(user.id, undefined, { user_id, device_id, extra })`, Ampli's own identify: it sets the user id on the client and sends an `$identify` event |
| `traits`   | `ampli.client.identify(identify, { user_id, device_id, extra })`, one `Identify` that sets and unsets the keys that changed                                 |
| `group`    | none: the generated wrapper has no group call, so Trace plans no group step for this destination                                                            |
| `reset`    | `ampli.client.reset()`, which clears the user id and starts a new device id                                                                                 |

Amplitude fills in the user and device of a call when its timeline processes it, a timer tick after the call, so it would give an event whichever user it holds by then. The plugin is an enrichment plugin, which Amplitude runs after its own context plugin has filled in the user and device. Every call Trace makes, events, identifies and traits alike, carries the user it was made for, if any, and its device at the top level of its options, where Amplitude keeps a call's own over what it fills in, and again in its `extra`, under the key `@priemskiyyy/trace-ampli`. The plugin sets them on the call and removes the user Amplitude fills into an anonymous one, keeping no pin of its own. Amplitude documents `extra` as the way to hand a plugin data through Ampli ("Pass the event level groups info though middleware extra when calling the tracking plan", [SDK plugins][plugins]); that its destination strips `extra` before upload is read from analytics-core 2.56 `plugins/destination.js` and shown by a test against the real SDK, not documented. So an event tracked for one user keeps that user and device, and an event tracked while nobody was signed in is never filed under a user, whatever Amplitude holds when it processes the event, and whatever other plugins run before it. Identity changes take effect at once, with nothing to wait for. Events your application sends to Amplitude itself, through `native` or the generated methods, and the events Amplitude sends of its own, such as a session start, pass through the plugin untouched.

An identity call does not wait for its own upload: the client holds the change when the call returns. Amplitude's `identify` also moves the client to the user and device its options name, which are the ones it holds when the call is made, since the sign-in comes first and the device is read at the call.

Amplitude takes the plugin out on `ampli.client.remove()` and on every new `ampli.client.init()`, and tells it so. From then on nothing can take out the user Amplitude fills into an anonymous call, so Trace sends no call at all: each event fails with a `TraceError` whose code is `NOT_INITIALIZED`, and each sign-in and each change of traits fails the same way, so the events that need them are skipped as `identity-failed`. Once you add the same plugin again, the next event applies its identity again and goes out filed as it was made. A call Amplitude still holds when it takes the plugin out keeps its pin, which travels with the call. A call made for a user keeps that user and its device even while the plugin is out, since both ride at the top level of its options. An anonymous call keeps its device, but one Amplitude processes while the plugin is out is filed under the user Amplitude fills in, which can be the next user; once the plugin is added again, it goes out with no user, whatever user a new `init` gave Amplitude. Take the plugin out only while no event is in flight, for example never at all.

A plugin of your own that throws stops Amplitude's timeline: Amplitude never settles the call it threw on, so from then on every `trace.flush()` waits for that upload until its timeout, for as long as the page lives, and from then on Amplitude processes a later call only when it is flushed, until a new `init` restarts the timeline. The dropped call leaves nothing behind in the identity plugin, and the calls queued behind it keep their pins until a flush sends them.

Amplitude's `Identify` drops a whole trait for a `null` anywhere inside it, a boolean or an array inside an array, or an object of more than 1000 keys, and Amplitude takes no object deeper than 40 layers and cuts a string longer than 1024 characters. A `null` under an object key in a trait is stripped and the rest of the trait is sent; a trait holding a `null` in a list, whose later items stripping it would shift, or any of the others is left out whole, so no stored value is ever cut or sent in part. The identity step then reports `UNSUPPORTED` naming every path left out, which Trace records as an `identity step unsupported` diagnostic and counts as done. A trait set to `null` in Trace is a removal, sent as an unset.

## Consent

Amplitude collects from `ampli.load()` on, so when consent gates this destination, load the wrapper opted out:

```ts
await Ampli.ampli.load({
  environment: "production",
  client: { configuration: { optOut: true } },
}).promise;
```

Trace then calls `ampli.client.setOptOut(false)` when the destination's purposes are granted, and `setOptOut(true)` while they are not, including when the destination opens with them still unknown. Amplitude keeps the opt-out across page loads.

## Behavior

- Platforms and versions: the browser wrapper `ampli pull` generates over `@amplitude/analytics-browser`, an optional peer dependency (`>=2.45.0 <3`), typed structurally through `AmpliLike`.
- Initialization is yours. Opening fails with a `TraceError` whose code is `NOT_INITIALIZED` until `ampli.load()` has run, Amplitude's init has finished and the plugin is set up, because until then there is no device to pin and nothing to keep an anonymous call anonymous; once Amplitude takes the plugin out, each call fails the same way until it is added again. Await `ampli.load(...).promise`, add the plugin and call `trace.start()`, or call `trace.start()` again once they are done: the events tracked meanwhile are delivered while they are still in Trace's buffer, and a sign-out made meanwhile drops the previous user's. The plugin can only be added once `ampli.load()` has created the client, so Trace never sends anything while Amplitude is still adding its own destination. Trace never loads the wrapper, never initializes its client and never reads `ampli.client` before the wrapper is loaded, which would log an error.
- Evidence is `sdk-call-returned`: `ampli.track` returned. Its promise settles only once Amplitude's upload settled, often after Trace's `timeout`, so no event and no identity step waits for it.
- Flush: `trace.flush()` calls `ampli.client.flush()`, because the generated wrapper has no flush of its own, and then waits, within the flush's time, for this destination's uploads still in flight when it began, because Amplitude's manual flush can return while an upload is in flight and never rejects. It answers `flushed` when Amplitude accepted every one with a 2xx code, `failed` with a `TraceError` `DELIVERY_FAILED` when it answered any of this destination's uploads with another code or nothing (an opted-out event is answered `0`, a disabled wrapper nothing) since the last flush that answered in time, so a refusal that lands after a flush ran out of time goes to the next one, and `timeout` when the flush's time runs out, which Trace keeps. A manual flush sends with retries off, so a `429` or `5xx` answer settles those events with that code instead of retrying them.
- Amplitude's HTTP API answers `400` for an event whose user id or device id is shorter than `minIdLength`, 5 characters by default, and the SDK drops that event, so a flush that waited for it answers `DELIVERY_FAILED`. Trace checks no length, because `init` can change the minimum.
- `ampli.load({ disabled: true })` is Ampli's own switch and private to the wrapper. Trace cannot see it: a disabled wrapper opens, its events are answered `submitted` while nothing is sent, the next flush answers `failed`, and its `client` still takes traits, resets and the opt-out.
- `native` is the `ampli` object you passed in, with every generated method, never `ampli.client`.

## Tests

- Against a fake: `fakeAmpli.fixture.ts` models the generated browser wrapper (Ampli Build 1.0.0) over `@amplitude/analytics-browser` 2.45.10: `isLoaded`, the error logged when `client` is read before `load`, no device until the client's init has finished, a disabled wrapper, uploads that settle with a result code and never reject, the opted-out code `0`, a manual flush that returns while uploads are in flight, and a call filed under the user and device the client holds when its timeline processes it, one queued call per macrotask, the call's options winning, before it passes through every plugin added. A test completes each upload itself. The session is tested directly for mapping, and through a real `Trace` for identity planning, consent, timeouts and flush. `testAnalyticsAdapter` runs over it. The plugin and each helper in `src/utils/` have tests of their own. Trait changes go through the real `Identify` from `@amplitude/analytics-browser`.
- Against the real SDK: `ampli.sdk.test.ts` runs the real generated wrapper over `@amplitude/analytics-browser` 2.45.10 in jsdom, with `fetch` stubbed, the plugin added after `load`, and a destination plugin reading each event as it leaves the pipeline. It covers an event's canonical name, constants, time, insert id and user; a user switch, after which every call is still filed under the user and device it was made for; an event tracked before a sign-in, which stays anonymous through a sign-in and a switch made in the same tick, behind a slow application plugin of each type, with every receipt submitted; an identity change applied at once; a Trace event that keeps its user and device while the application's own event, sent in the same tick, passes through untouched; an anonymous event behind six calls the application sent through `native`, or behind the session events Amplitude queues itself; `open` refusing until the plugin is added; a second plugin, which Amplitude never sets up; a start before Amplitude's init has finished, which fails until the next start, so that a sign-out made meanwhile sends none of the previous user's calls; the plugin taken out by `remove()` and by a new `init`, after which an anonymous event and a sign-in both fail, so nothing lands under the user, until the plugin is added again; calls Amplitude still holds when `remove()` or a new `init` takes the plugin out in the same tick as a switch, where each identified call keeps its user and device, and an anonymous one is filed under the user Amplitude fills in; the pin in each call's `extra`, which the plugins see and the uploaded events do not carry; calls Amplitude still holds at a new `init` that names another user, filed as they were made once the plugin is added back; an application plugin that throws, after which the calls queued behind it keep their pins through Amplitude's next flush; a `null` under an object key, stripped, and a trait holding text Amplitude would cut, left out whole; an upload answered `400`; a flush that waits for an upload still in flight; and consent through Amplitude's own opt-out.
- Against the real generated code: `fromAmpli.test.ts` constructs the real classes of `ampli-v2-generated.ts`, and `ampli.contracts.ts` typechecks the real wrapper, the real `Identify` and both real Amplitude SDKs against `AmpliLike`, the plugin against Amplitude's `add`, pins the fake to the members of the real wrapper it models, and proves through a real `Trace` that the generated property types reach `track` unchanged and that `native` keeps the generated type.
- Never: no request leaves the process, since every upload goes to the stubbed `fetch`, and no test runs a browser other than jsdom or a wrapper generated by a later Ampli build.

`ampli-v2-generated.ts` is a real generated wrapper, kept byte for byte; see [its notice](src/ampli-v2-generated.NOTICE.md).

## License

[MIT](LICENSE)
