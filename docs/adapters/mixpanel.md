---
description: "Mixpanel in the browser, React Native and Node: the five-day window, profile and group limits, and how each platform waits for its own answer."
---

# Mixpanel

Three packages, one per platform:

| Package                                    | SDK                     | Platform     |
| ------------------------------------------ | ----------------------- | ------------ |
| `@priemskiyyy/trace-mixpanel`              | `mixpanel-browser`      | browser      |
| `@priemskiyyy/trace-mixpanel-react-native` | `mixpanel-react-native` | React Native |
| `@priemskiyyy/trace-mixpanel-node`         | `mixpanel`              | server       |

## Browser

```sh
pnpm add @priemskiyyy/trace @priemskiyyy/trace-mixpanel mixpanel-browser
```

```ts
import { event, Trace } from "@priemskiyyy/trace";
import { mixpanel } from "@priemskiyyy/trace-mixpanel";
import mixpanelBrowser from "mixpanel-browser";

mixpanelBrowser.init("YOUR_PROJECT_TOKEN", {
  opt_out_tracking_by_default: true,
  opt_out_persistence_by_default: true,
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

| Option | Default  | Meaning                                                                                              |
| ------ | -------- | ---------------------------------------------------------------------------------------------------- |
| `sdk`  | required | The mixpanel-browser instance your application initialized: the default export, or a named instance. |

## React Native

```sh
pnpm add @priemskiyyy/trace @priemskiyyy/trace-mixpanel-react-native mixpanel-react-native
```

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
});

trace.start();
```

| Option | Default  | Meaning                                                                               |
| ------ | -------- | ------------------------------------------------------------------------------------- |
| `sdk`  | required | The `Mixpanel` instance your application created and initialized with `await init()`. |

Needs `TextEncoder`, which Hermes provides in React Native 0.74 and later. Use native mode, not JavaScript mode, where accounts switch on one device: JavaScript mode's `reset()` rewrites storage in several steps and can let an identify or an event land on the previous user.

## Server

```sh
pnpm add @priemskiyyy/trace @priemskiyyy/trace-mixpanel-node mixpanel
```

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

| Option        | Default  | Meaning                                                                                                                                    |
| ------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `sdk`         | required | The client `Mixpanel.init` returned. The browser and React Native SDKs are refused by the types.                                           |
| `anonymousId` | none     | The visitor id of the request, sent as `$device_id`. Without it, an event without a user cannot reach Mixpanel, skipped as `unidentified`. |

The client holds no user between calls: identity travels on every event as `$user_id` and `$device_id`, so this session has no `identify` and no `reset`.

## How events are mapped

Each event is one `track(name, properties)` call carrying `time` and `$insert_id`, which Mixpanel deduplicates on together with the name, the time and the distinct id. An event older than five days, judged on the Trace's own clock, or 1,000,000 bytes of JSON or more, is never sent and `dropped: provider-filtered`. Mixpanel keeps at most 254 properties, 254 keys per nested object, 254 items per list and 3 levels of nesting; every string is cut at 255 characters. The `$` and `mp_` prefixes, `time`, `distinct_id`, `token`, `ip`, `alias` and `bucket` are reserved and left out as `omitted`.

## Identity

`identify(user.id)` moves the SDK's user. An id over 255 characters is never sent: `identify` fails outright, because two users sharing the kept prefix would become one, and the user's events are skipped as `identity-failed`. Traits queue behind `identify` in the browser (`people.set`/`people.unset`), on the server they name their own user (`people.set(user.id, ...)`). Groups are `set_group`/`get_group(...).set(...)` plus a profile property named for the type, so a group type that is itself a Mixpanel-owned name, or over 255 characters, is refused as unsupported before any call. Leaving a group never calls `remove_group`, which leaves a stray super property; it unregisters the type instead.

## Consent

Initialize opted out in the browser (`opt_out_tracking_by_default: true`, `opt_out_persistence_by_default: true`). Trace calls `opt_out_tracking({ delete_user: false })` and `opt_in_tracking({ track: () => {} })` as purposes change, overriding Mixpanel's destructive defaults. React Native's only opt-out deletes the profile, so this session has no `collection`; Mixpanel's own gating still holds, because Trace never hands it an event while consent is closed. The Node client has no switch of its own either.

## Behavior

- Evidence is `sdk-call-returned` in the browser and on React Native, `backend-acknowledged` on the server, where each event is its own request answered by Mixpanel.
- Flush exists only on the server, waiting for the requests and profile updates this session made; the browser and React Native packages have no flush.
- `native` is the SDK you passed in, for anything Trace does not wrap, such as `alias` and `track_batch`.

See [provider limitations](../provider-limitations.md) for every documented limit and what is not verified, and [choose an adapter](../adapters.md) for how Mixpanel compares to the rest.
