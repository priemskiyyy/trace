---
description: "Amplitude in the browser, React Native and Node, and the generated Ampli wrapper: identity through an enrichment plugin, groups, consent and flush."
---

# Amplitude and Ampli

Three packages, one for the browser and React Native SDKs, one for the generated Ampli wrapper, one for the server:

| Package                             | SDK                                                                 | Platform              |
| ----------------------------------- | ------------------------------------------------------------------- | --------------------- |
| `@priemskiyyy/trace-amplitude`      | `@amplitude/analytics-browser`, `@amplitude/analytics-react-native` | browser, React Native |
| `@priemskiyyy/trace-ampli`          | your generated `ampli` wrapper over `@amplitude/analytics-browser`  | browser               |
| `@priemskiyyy/trace-amplitude-node` | `@amplitude/analytics-node`                                         | server                |

## Amplitude

```sh
pnpm add @priemskiyyy/trace @priemskiyyy/trace-amplitude @amplitude/analytics-browser
```

```ts
import * as Amplitude from "@amplitude/analytics-browser";
import { event, Trace } from "@priemskiyyy/trace";
import { amplitude, identityPlugin } from "@priemskiyyy/trace-amplitude";

await Amplitude.init("amplitude_api_key", { autocapture: false }).promise;

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
});

trace.start();
trace.user({ id: "user_42", traits: { plan: "pro" } });
trace.track("Checkout Started", { cart: { id: "cart_1" }, value: 49.5 });
```

| Option     | Default  | Meaning                                                                                                                               |
| ---------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `sdk`      | required | The Amplitude SDK your application initialized: the module namespace or an instance from `createInstance()`, browser or React Native. |
| `Identify` | required | Amplitude's `Identify` class, from the same SDK.                                                                                      |
| `plugin`   | required | The plugin from `identityPlugin()`, added to the same SDK with `Amplitude.add(plugin)`.                                               |

On React Native, import the SDK from `@amplitude/analytics-react-native` instead; its `init` takes the user id second. Create one plugin per SDK, add it once `init` has finished, and keep it added: Amplitude takes it out on `remove()` and on every later `init()`, and every call fails with `NOT_INITIALIZED` until it is added again.

## Ampli

```sh
pnpm add @priemskiyyy/trace @priemskiyyy/trace-ampli @amplitude/analytics-browser
```

<!-- snippet: fragment -->

```ts
import * as amplitude from "@amplitude/analytics-browser";
import { Trace } from "@priemskiyyy/trace";
import { ampli, fromAmpli, identityPlugin } from "@priemskiyyy/trace-ampli";
import * as Ampli from "./ampli";

await Ampli.ampli.load({ environment: "production" }).promise;

const plugin = identityPlugin();

Ampli.ampli.client.add(plugin);

const trace = new Trace({
  events: fromAmpli({ "Checkout Started": Ampli.CheckoutStarted }),
  destinations: {
    product: ampli({ sdk: Ampli.ampli, Identify: amplitude.Identify, plugin }),
  },
});

trace.start();
trace.track("Checkout Started", { cartId: "cart_1" });
```

`fromAmpli` declares your registry from the classes `ampli pull` generated, keyed by their canonical `event_type`, so the required and optional properties, literal unions and injected constants all come from the generated code. A key that does not match its class's `event_type` throws `TraceError` `INVALID_CONFIGURATION` at the call, naming both. The generated wrapper has no group call, so `ampli()` sessions have no `group` step.

| Option     | Default  | Meaning                                                            |
| ---------- | -------- | ------------------------------------------------------------------ |
| `sdk`      | required | The generated `ampli` object, loaded by your application.          |
| `Identify` | required | Amplitude's `Identify` class, from `@amplitude/analytics-browser`. |
| `plugin`   | required | The plugin from `identityPlugin()`, added to `ampli.client`.       |

## Amplitude on a server

```sh
pnpm add @priemskiyyy/trace @priemskiyyy/trace-amplitude-node @amplitude/analytics-node
```

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

| Option        | Default  | Meaning                                                                                                         |
| ------------- | -------- | --------------------------------------------------------------------------------------------------------------- |
| `sdk`         | required | The Node SDK your application initialized. The browser and React Native SDKs are refused by the types.          |
| `Identify`    | required | Amplitude's `Identify` class, from the same SDK.                                                                |
| `anonymousId` | none     | The visitor id of the request, sent as `device_id`. Without it, an event without a user cannot reach Amplitude. |

One SDK for the process, one Trace per request or job. The Node SDK holds no user between calls: every call carries its own `user_id` and `device_id`, so this session has no `identify` and no `reset`.

## How events are mapped

Each event is one `track(name, properties, { time, insert_id, ... })` call: `event.id` travels as `insert_id`, the dedup id Amplitude keeps for seven days from the same device, and `event.timestamp` as `time`. Context goes under properties, a property winning where it shadows a context key. Amplitude cuts a property value at 1,024 characters, refuses an object past 40 layers of nesting, and `Identify` drops a whole trait holding a `null` in a list, a boolean or an array inside an array, or an object of more than 1,000 keys; the adapter leaves such a trait out whole rather than send it cut.

## Identity

Amplitude's browser and React Native SDKs fill in the user and device of a call when their timeline processes it, a tick after the call, which could give an event whichever user the SDK holds by then. The `identityPlugin()` enrichment plugin removes that ambiguity: every call Trace makes carries the user it was made for and its device at the call, so an event tracked for one user keeps that user however long Amplitude takes to process it, and an anonymous event is never filed under whoever signs in meanwhile. Groups are `setGroup` plus `groupIdentify`, and leaving a group is best effort (`setGroup(type, [])`), because Amplitude documents no leave call. Amplitude's Node SDK needs no plugin: every call already carries its own ids.

## Consent

Initialize opted out (`optOut: true` in `init`, or load Ampli with `client.configuration.optOut: true`) when consent gates the destination, because Amplitude can collect before Trace starts. Trace calls `setOptOut(false)` once every purpose is granted and `setOptOut(true)` while one is not; Amplitude keeps the setting across page loads. The Node SDK has no switch of its own: each per-request Trace gates its own destination through `consent.set(...)`.

## Behavior

- Evidence is `sdk-call-returned`: `track` answers once Amplitude queued the call, before its upload.
- Flush calls the SDK's own `flush()`, which can return while an upload is in flight, and then waits for this destination's uploads within the flush's time; `flushed` means every one answered 2xx.
- `native` is the SDK (or the `ampli` object) you passed in, for anything Trace does not wrap, such as `revenue`.

See [provider limitations](../provider-limitations.md) for every documented limit and what is not verified, and [choose an adapter](../adapters.md) for how Amplitude compares to the rest.
