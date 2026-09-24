---
description: "Google Analytics 4 through gtag.js or Firebase Analytics, on the web and in React Native: the ga4() mapping, GA4's naming and parameter rules, and identity ordering."
---

# Google Analytics and Firebase

GA4 has no client library of its own; you reach it either through the Google tag (`gtag.js`) directly, or through Firebase Analytics, which wraps it. Both packages share the same `ga4(events, mappings)` helper that turns one Trace event into one GA4 event, typed by your registry.

| Package                                    | Reaches GA4 through                  | Platform     |
| ------------------------------------------ | ------------------------------------ | ------------ |
| `@priemskiyyy/trace-google-analytics`      | `gtag.js`, injected as `window.gtag` | browser      |
| `@priemskiyyy/trace-firebase`              | the Firebase modular web SDK         | browser      |
| `@priemskiyyy/trace-firebase-react-native` | `@react-native-firebase/analytics`   | React Native |

## The ga4() mapping

```ts
import { event, Trace } from "@priemskiyyy/trace";
import { ga4, googleAnalytics } from "@priemskiyyy/trace-google-analytics";
import type { Ga4Event, Ga4Item } from "@priemskiyyy/trace-google-analytics";

const events = {
  "Checkout Started": event<{
    total: number;
    currency: string;
    lines: { sku: string; name: string; price: number; quantity: number }[];
  }>(),
  "Internal Ping": event(),
};

const trace = new Trace({
  events,
  destinations: {
    web: googleAnalytics({
      sdk: window.gtag,
      measurement: { id: "G-XXXXXXX" },
      map: ga4(events, {
        "Checkout Started": ({ properties }) =>
          ({
            name: "begin_checkout",
            parameters: {
              value: properties.total,
              currency: properties.currency,
            },
            items: properties.lines.map(
              (line) =>
                ({
                  item_id: line.sku,
                  item_name: line.name,
                  price: line.price,
                  quantity: line.quantity,
                }) satisfies Ga4Item,
            ),
          }) satisfies Ga4Event,
        "Internal Ping": () => null,
      }),
    }),
  },
});
```

`ga4` takes one mapping per declared event: a newly declared event does not compile until it is mapped or answered `null` to keep it out of GA4. End every answer with `satisfies Ga4Event`, and every item built in a callback with `satisfies Ga4Item`, because TypeScript does not check extra fields in a returned object otherwise, and a misspelled field would compile and be silently dropped at runtime.

## Browser, through gtag.js

```sh
pnpm add @priemskiyyy/trace @priemskiyyy/trace-google-analytics
```

gtag.js is not an npm package; your page loads it with the Google tag snippet. Add `@types/gtag.js` as a dev dependency to type `window.gtag`.

| Option        | Default  | Meaning                                                                     |
| ------------- | -------- | --------------------------------------------------------------------------- |
| `sdk`         | required | The `gtag` function your Google tag snippet defined, usually `window.gtag`. |
| `measurement` | required | `{ id }`, the GA4 web data stream's measurement id.                         |
| `map`         | required | The GA4 event each Trace event becomes, built with `ga4(events, mappings)`. |

## Browser, through Firebase

```sh
pnpm add @priemskiyyy/trace @priemskiyyy/trace-firebase firebase
```

```ts
import { event, Trace } from "@priemskiyyy/trace";
import { firebase, ga4 } from "@priemskiyyy/trace-firebase";
import type { Ga4Event } from "@priemskiyyy/trace-firebase";
import * as FirebaseAnalytics from "firebase/analytics";

const events = { "Search Performed": event<{ query: string }>() };

const trace = new Trace({
  events,
  destinations: {
    product: firebase({
      sdk: FirebaseAnalytics,
      analytics: FirebaseAnalytics.getAnalytics(),
      map: ga4(events, {
        "Search Performed": ({ properties }) =>
          ({
            name: "search",
            parameters: { search_term: properties.query },
          }) satisfies Ga4Event,
      }),
    }),
  },
});
```

| Option      | Default  | Meaning                                                                                                                                            |
| ----------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sdk`       | required | The Firebase modular analytics API, imported as a namespace.                                                                                       |
| `analytics` | required | The `Analytics` instance from `getAnalytics(app)`, after `isSupported()` answered true. Called with no argument, it uses the default Firebase app. |
| `map`       | required | Built with `ga4(events, mappings)`.                                                                                                                |

Use this package, not `trace-google-analytics`, on a page where the Firebase SDK runs: it replaces `window.gtag` with a wrapper that can apply a later user id to an earlier event, and this adapter holds each identity change back behind the events tracked before it, through an `event_callback`, for up to the Trace's `timeout`.

## React Native, through Firebase

```sh
pnpm add @priemskiyyy/trace @priemskiyyy/trace-firebase-react-native @react-native-firebase/app @react-native-firebase/analytics
```

```ts
import { event, Trace } from "@priemskiyyy/trace";
import { firebase, ga4 } from "@priemskiyyy/trace-firebase-react-native";
import type { Ga4Event } from "@priemskiyyy/trace-firebase-react-native";
import * as FirebaseAnalytics from "@react-native-firebase/analytics";

const events = { "Search Performed": event<{ query: string }>() };

const trace = new Trace({
  events,
  destinations: {
    product: firebase({
      sdk: FirebaseAnalytics,
      analytics: FirebaseAnalytics.getAnalytics(),
      map: ga4(events, {
        "Search Performed": ({ properties }) =>
          ({
            name: "search",
            parameters: { search_term: properties.query },
          }) satisfies Ga4Event,
      }),
    }),
  },
});
```

Needs a development build or a bare app, never Expo Go. Unlike the web package, it holds no identity change behind earlier events: React Native Firebase hands every call to its native module in the order it is made, so no barrier is needed.

## How events are mapped

Each event becomes one GA4 event through `gtag("event", name, parameters)` or `logEvent`. A mapped name that breaks GA4's naming rule, or one GA4 reserves for its own measurement, is never sent: `dropped: provider-filtered`. `items` rides only with GA4's ecommerce events; every other field the mapping does not set falls out of the event as `unsupported`, because GA4 parameters are flat. Neither `id` nor `timestamp` is sent: GA4 has no per-event dedup id, and gtag.js or Firebase stamps its own time, so every submitted outcome carries `{ path: "timestamp", reason: "unsupported" }`.

## Identity

`identify` calls `setUserId` (through `gtag("config", id, { update: true, user_id })` for the gtag package); `traits` calls `setUserProperties`, `null` clearing a value. A user id over 256 characters, or a user property GA4 would ignore rather than cut (a reserved name, a nested value, text over 36 characters), is reported as an unsupported step and never sent, because GA4 ignores such a change rather than keeping part of it. There are no groups: GA4 has none. `reset` clears the user id and nulls every user property this adapter set since the last reset.

## Consent

`collection` flips gtag.js's own `ga-disable-<measurement id>` switch on `window`, the same way in all three packages. Set `window["ga-disable-<measurement id>"] = true` before the Google tag snippet's first call (or before `getAnalytics(app)`, or in `firebase.json` on React Native) so nothing collects before Trace starts. Trace never calls `gtag("consent", ...)` or `setConsent`: Google's consent mode belongs to your consent platform, not to Trace.

## Behavior

- Evidence is `sdk-call-returned` everywhere: gtag.js and Firebase return before anything is sent, and batch on their own schedule.
- None of the three packages has a flush; GA4 sends on its own schedule.
- `native` is the `gtag` function or the `Analytics` instance you passed in, for anything Trace does not wrap, such as reading the client id.

See [provider limitations](../provider-limitations.md) for GA4's full parameter, item and user property limits and what is not verified, and [choose an adapter](../adapters.md) for how these compare to the rest.
