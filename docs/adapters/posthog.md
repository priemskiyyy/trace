---
description: "PostHog in the browser, React Native and Node: person profiles, groups, placeholder and over-long ids, consent and flush for each platform."
---

# PostHog

Three packages, one per platform:

| Package                                   | SDK                    | Platform     |
| ----------------------------------------- | ---------------------- | ------------ |
| `@priemskiyyy/trace-posthog`              | `posthog-js`           | browser      |
| `@priemskiyyy/trace-posthog-react-native` | `posthog-react-native` | React Native |
| `@priemskiyyy/trace-posthog-node`         | `posthog-node`         | server       |

## Browser

```sh
pnpm add @priemskiyyy/trace @priemskiyyy/trace-posthog posthog-js
```

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

| Option | Default  | Meaning                                                                                               |
| ------ | -------- | ----------------------------------------------------------------------------------------------------- |
| `sdk`  | required | The posthog-js instance your application initialized: the default export or one from `new PostHog()`. |

## React Native

```sh
pnpm add @priemskiyyy/trace @priemskiyyy/trace-posthog-react-native posthog-react-native
```

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
```

Every call first waits for the client's `ready()`, which settles once posthog-react-native has loaded its storage, so nothing is filed under an empty person.

## Server

```sh
pnpm add @priemskiyyy/trace @priemskiyyy/trace-posthog-node posthog-node
```

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

| Option        | Default  | Meaning                                                                                                                   |
| ------------- | -------- | ------------------------------------------------------------------------------------------------------------------------- |
| `sdk`         | required | The `PostHog` client your application constructed. posthog-js and posthog-react-native are refused by the types.          |
| `anonymousId` | none     | The visitor id of the request. Without it, a call without a user cannot reach PostHog, and a sign-in has nobody to merge. |

posthog-node holds no person between calls: every call names its own `distinctId`, so this session has no `reset`. A sign-in sends `$identify` with `$anon_distinct_id` to merge the visitor's history into the user.

## How events are mapped

Each event is one `capture(name, properties, { timestamp, uuid })` call: `event.id` travels as `uuid`, which PostHog keeps and deduplicates on, and `event.timestamp` as `timestamp`. Context goes under properties, a property winning where it shadows a context key. Every PostHog-owned name (`$set`, `$groups`, `distinct_id`, `token`, and the rest) is removed as `omitted`, because each would change the person or move the event to another one, and an event named `$identify`, `$create_alias` or `$merge_dangerously` is `skipped: unsupported`.

## Identity

`identify(id)` moves the SDK's person. In the browser and on React Native, posthog-js and posthog-react-native refuse a placeholder id such as `anonymous` or `guest` on their own, which the adapter reports as an unsupported step rather than sending; an id longer than PostHog keeps (200 characters, or posthog-js's own cut if that is shorter) fails the step outright, because two users sharing the kept prefix would share one person, and the user's events are skipped as `identity-failed`. On the server, posthog-node accepts a placeholder id like any other, so it is PostHog itself that would merge every user who sends the same one: `identify` fails there too, with `TraceError` `DELIVERY_FAILED`, the same treatment as an over-length id, and that user's events are skipped as `identity-failed`. Traits are `setPersonProperties` and `unsetPersonProperties`; groups are `group(type, id, traits)`, and leaving one re-registers `$groups` without it, since posthog-js and posthog-react-native have no call that leaves a single type. Under `person_profiles: "never"`, identity, trait and group steps are reported unsupported while `reset` still rotates the distinct id.

## Consent

Initialize opted out (`opt_out_capturing_by_default: true`, or `defaultOptIn: false` on React Native) when consent gates the destination. Trace calls `opt_in_capturing` and `opt_out_capturing` (`optIn()`/`optOut()` on React Native) as purposes change; PostHog keeps the choice across page loads and app launches. The cookieless web modes (`cookieless_mode: "always"` or `"on_reject"`) cannot be gated and fail the start with `UNSUPPORTED`. posthog-node has no switch of its own: each per-request Trace gates its own destination.

## Behavior

- Evidence is `sdk-call-returned` everywhere: `capture` answers once PostHog queued the event, never once it was stored.
- Flush exists only on React Native and the server, where `flush()` reports whether every queued batch was accepted; the browser package has no flush, because posthog-js sends on its own schedule.
- `native` is the client you passed in, for anything Trace does not wrap, such as feature flags.

See [provider limitations](../provider-limitations.md) for every documented limit and what is not verified, and [choose an adapter](../adapters.md) for how PostHog compares to the rest.
