# @priemskiyyy/trace-firebase-react-native

Send [Trace](../../core) events to Google Analytics through React Native Firebase on iOS and Android. You inject the modular `@react-native-firebase/analytics` API and the `Analytics` instance your application already uses, so this package imports neither. A map typed by your event registry turns each event into the GA4 event you choose, such as `begin_checkout` with its `items`, or keeps it from GA4. The adapter checks what the map built against Google's rules and React Native Firebase's own, lists on the receipt everything that did not fit, and answers once the native SDK has taken each event.

Version 0.1.0 is an initial preview. APIs may change before 1.0. See the [verification limits](https://github.com/priemskiyyy/trace/blob/main/docs/verification.md) before adopting an adapter.

## Installation

```sh
pnpm add @priemskiyyy/trace @priemskiyyy/trace-firebase-react-native @react-native-firebase/app @react-native-firebase/analytics
```

React Native Firebase needs its native modules: a development build or a bare app, never Expo Go. In a browser, use `@priemskiyyy/trace-firebase` over the Firebase web SDK instead.

## Create a Trace

Start the native SDK opted out in `firebase.json` at the root of your app, so it collects nothing before consent is granted (see [Consent](#consent)):

```json
{
  "react-native": {
    "analytics_auto_collection_enabled": false
  }
}
```

Then create the Trace:

```ts
import { event, Trace } from "@priemskiyyy/trace";
import { firebase, ga4 } from "@priemskiyyy/trace-firebase-react-native";
import type {
  Ga4Event,
  Ga4Item,
} from "@priemskiyyy/trace-firebase-react-native";
import * as FirebaseAnalytics from "@react-native-firebase/analytics";

const events = {
  "Checkout Started": event<{
    total: number;
    currency: string;
    lines: { sku: string; name: string; price: number; quantity: number }[];
  }>(),
  "Search Performed": event<{ query: string }>(),
  "Internal Ping": event(),
};

const trace = new Trace({
  events,
  destinations: {
    product: firebase({
      sdk: FirebaseAnalytics,
      analytics: FirebaseAnalytics.getAnalytics(),
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
        "Search Performed": ({ properties }) =>
          ({
            name: "search",
            parameters: { search_term: properties.query },
          }) satisfies Ga4Event,
        "Internal Ping": () => null,
      }),
    }),
  },
  consent: { product: ["analytics"] },
});

trace.consent.set({ analytics: "granted" });
trace.start();
trace.user({ id: "user_42" });
trace.track("Checkout Started", {
  total: 49.5,
  currency: "EUR",
  lines: [{ sku: "sku_1", name: "Tee", price: 49.5, quantity: 1 }],
});
```

## Options

| Option      | Default  | Meaning                                                                                                                                            |
| ----------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sdk`       | required | The modular React Native Firebase analytics API, passed as its namespace: `import * as FirebaseAnalytics from "@react-native-firebase/analytics"`. |
| `analytics` | required | The `Analytics` instance `getAnalytics()` answers. Its own `logEvent` is the one the adapter calls.                                                |
| `map`       | required | The GA4 event each Trace event becomes, or `null` to keep it from GA4. Build it with `ga4(events, mappings)`.                                      |

`ga4(events, mappings)` takes one mapping per declared event, typed by that event's properties: a newly declared event does not compile until it is mapped or answered `null`, and an event the registry does not declare cannot be mapped. A mapping answers `{ name, parameters, items? }`:

- `name` suggests GA4's recommended events (`begin_checkout`, `purchase`, `login`, `ad_impression` and the rest) and accepts any other.
- `parameters` holds flat values: text, numbers, booleans or `null`, never `undefined` or a nested object.
- `items` is GA4's ecommerce list, each item typed as React Native Firebase types its `Item`, so `price` and `discount` are numbers.

TypeScript does not check extra fields in an object an arrow function returns, so a mapping still compiles when its answer has a field `Ga4Event` does not have, such as a misspelled `item`, or an item has a field Firebase does not type. End each answer with `satisfies Ga4Event`, as the example does, to have those fields refused in the answer and in the items written in it; an item built in a callback of its own, such as the one `.map()` takes, needs its own `satisfies Ga4Item`. At runtime the adapter reads only `name`, `parameters` and `items`, so any other field of an answer is ignored without a loss; inside `items`, it leaves out each item's custom parameters past GA4's 27 and every nested value, each with a loss. `satisfies Ga4Item` also refuses the custom item parameters GA4 accepts, so an item that carries them goes without it.

A mapping receives the frozen, sanitized event every destination sees and answers synchronously. An answer of `null` keeps the event from GA4 as `dropped: provider-filtered`; a mapping that throws fails the event with its error, which Trace contains.

## How an event is mapped

Each event is one call to the instance's own `analytics.logEvent(name, parameters)`, which answers a promise that settles once the native SDK has logged the event. The modular `logEvent(analytics, ...)` discards that promise, so a failure there would reach your app as an unhandled rejection; the adapter never calls it.

| Trace              | Firebase                                                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `event.name`       | picks the mapping; the GA4 name is the one the mapping answered, sent as it is and never converted                        |
| `event.properties` | what the mapping built from them: its `parameters` and `items`                                                            |
| `event.context`    | event parameters under the mapping's parameters; a context key a parameter already uses is `omitted`                      |
| `event.identity`   | not sent with the event: the user id and user properties are set on Firebase before it, see Identity                      |
| `event.id`         | not sent: Firebase has no deduplication id for app events                                                                 |
| `event.timestamp`  | not sent: Firebase stamps its own time, so every submitted outcome carries `{ path: "timestamp", reason: "unsupported" }` |

React Native Firebase throws on an event name it refuses, so the adapter checks the name first. A mapped name that breaks the rule in the table below, or that React Native Firebase or GA4 reserves for an app stream, is not sent: the event is `dropped: provider-filtered` with `{ path: "name", reason: "invalid" }`. The reserved names are `ad_activeview`, `ad_click`, `ad_exposure`, `ad_query`, `ad_reward`, `adunit_exposure`, `app_background`, `app_clear_data`, `app_exception`, `app_install`, `app_remove`, `app_store_refund`, `app_store_subscription_cancel`, `app_store_subscription_convert`, `app_store_subscription_renew`, `app_update`, `app_upgrade`, `dynamic_link_app_open`, `dynamic_link_app_update`, `dynamic_link_first_open`, `error`, `first_open`, `first_visit`, `in_app_purchase`, `notification_dismiss`, `notification_foreground`, `notification_open`, `notification_receive`, `notification_send`, `os_update`, `session_start`, `session_start_with_rollout` and `user_engagement`. A name is never converted, so a typo in a mapping shows on the receipt instead of reaching GA4 under another name. `ad_impression` is sent: an app stream accepts it.

Parameters, each loss on its own path such as `parameters.coupon`, `context.app` or `items.0`:

- `items` takes the first of the 25 slots, the mapping's parameters the next, the context the rest.
- A name already sent is `omitted`, so the mapping's `items` and parameters win over the context. A parameter or context key named `items` is `omitted` even when the mapping built none, because both bridges read `items` as the ecommerce list on every event, and on iOS anything but a list fails the event. The names gtag.js reads as commands on the web, such as `user_id`, `client_id` or `send_to`, are ordinary parameters here: the native SDKs run no gtag.js, and React Native Firebase passes them on as they are.
- Values are sent as they are, and text is measured in characters. On the way to the native SDK, React Native Firebase turns `quantity`, `index`, `level`, `score`, `number_of_nights`, `number_of_passengers`, `number_of_rooms` and `extend_session` into whole numbers, and `success` into 1 or 0, so each value it changes is `coerced`: a context such as `{ level: "debug" }` is logged as `level: 0`. A whole number a signed 64-bit integer holds, or 1 or 0 under `success`, has no loss, and text under those names is sent whole rather than cut, because it never reaches GA4 as text. Text or `null` under `extend_session` is left out as `invalid` instead, because the iOS bridge throws on it and the event would fail. Inside `items`, only the first seven are converted.
- A nested value, in the context or inside an item, is `unsupported`, because GA4 parameters are flat: a context such as `{ app: { version } }` is lost as `context.app`. Keep context meant for GA4 flat, such as `{ app_version }`.

GA4's limits as Google documents them, React Native Firebase's own, and what the adapter does at each:

| Limit                  | GA4                                                                                                                                                                                                            | The adapter                                                                                                                                                  | Source                                                                                  |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| Event name             | a letter, then letters, digits and `_`; 40 characters; no `query_id` prefix; React Native Firebase also refuses any letter outside ASCII and the `firebase_`, `google_` and `ga_` prefixes                     | drops the event as `provider-filtered`, `invalid` on `name`                                                                                                  | [naming rules][names], React Native Firebase 26.4.0                                     |
| Parameters per event   | 25                                                                                                                                                                                                             | sends the first 25, `truncated` for each one past                                                                                                            | [collection limits][limits]                                                             |
| Parameter name         | the event name rule; no `firebase_`, `google_` or `ga_` prefix                                                                                                                                                 | `invalid`                                                                                                                                                    | [naming rules][names], [collection limits][limits]                                      |
| Parameter value        | 100 characters; `page_title` 300, `page_referrer` 420, `page_location` 1000                                                                                                                                    | cuts the text, `truncated`                                                                                                                                   | [collection limits][limits]                                                             |
| Converted parameters   | whole numbers under `quantity`, `index`, `level`, `score`, `number_of_nights`, `number_of_passengers` and `number_of_rooms`, in the event and in each item, and under `extend_session`; 1 or 0 under `success` | sends the value, `coerced` where React Native Firebase changes it; leaves out text or `null` under `extend_session`, on which iOS fails the event, `invalid` | React Native Firebase 26.4.0: `NativeRNFBTurboAnalytics.java`, `RNFBAnalyticsModule.mm` |
| Items                  | 200 per event                                                                                                                                                                                                  | sends the first 200, `truncated` on `items`                                                                                                                  | [ecommerce][ecommerce]                                                                  |
| Custom item parameters | ecommerce guide: "up to 27 custom parameters in the items array, in addition to the prescribed parameters"; collection limits: "up to 27 item-level custom parameters in an ecommerce event"                   | keeps the first 27 on each item, `truncated` on `items.<index>`                                                                                              | [ecommerce][ecommerce], [collection limits][limits]                                     |
| User id                | 256 characters                                                                                                                                                                                                 | refuses the change as unsupported                                                                                                                            | [collection limits][limits]                                                             |
| User property name     | the parameter name rule within 24 characters; not one of the 20 reserved names below                                                                                                                           | leaves it out, the step unsupported                                                                                                                          | [naming rules][names], [collection limits][limits]                                      |
| User property value    | 36 characters                                                                                                                                                                                                  | leaves it out, the step unsupported                                                                                                                          | [collection limits][limits]                                                             |
| User properties        | 25 per property                                                                                                                                                                                                | not checked: GA4 counts them across every user                                                                                                               | [collection limits][limits]                                                             |

[names]: https://support.google.com/analytics/answer/13316687
[limits]: https://support.google.com/analytics/answer/9267744
[ecommerce]: https://developers.google.com/analytics/devguides/collection/ga4/ecommerce

## Identity

- `identify` calls `setUserId` and answers its promise, so Trace waits until the native SDK has set the user before it hands over the events that need it. A user id longer than GA4 keeps is refused as unsupported before Firebase sees it, so the events that follow carry no user id rather than a cut one.
- `traits` calls `setUserProperties`, with `null` for a removed trait, and answers once the native SDK has set them. React Native Firebase takes only text, so a number or boolean is sent as its text: `4` becomes `"4"` and `true` becomes `"true"`. A trait GA4 would ignore is left out and never cut, because GA4 ignores such a change rather than keeping part of it: a name that breaks the rule in the table or is one of the 20 names Google reserves (`cid`, `customer_id`, `customerid`, `first_open_after_install`, `first_open_time`, `first_visit_time`, `google_allow_ad_personalization_signals`, `last_advertising_id_reset`, `last_deep_link_referrer`, `last_gclid`, `lifetime_user_engagement`, `non_personalized_ads`, `session_id`, `session_number`, `sessionid`, `sfmc_id`, `sid`, `uid`, `user_id`, `userid`), a nested value, or text over the limit. The rest of the update is set, and the step is reported unsupported, which appears as the diagnostic `identity step unsupported`.
- There are no groups. GA4 has no group analytics.
- `reset` sets the user id to `null` and nulls every user property name this adapter sent since the last reset, removed ones included, because user properties outlive a sign-out. A reset the native SDK refuses keeps those names for the next one. The adapter never calls `resetAnalyticsData`, which clears the app instance id and may discard events not yet uploaded; call it yourself through `native` if you want a new app instance at sign-out.
- Unlike `@priemskiyyy/trace-firebase`, the adapter holds no identity change back behind earlier events: `track` hands its event to the native module before it awaits anything, React Native Firebase hands every call to the native module in the order it is made, and Trace awaits each identity step before the next and before the event that needs it. So an event reaches the native module before the reset of a user switch that follows it, even one made in the same tick.

## Consent

`collection` calls `setAnalyticsCollectionEnabled`, both ways. The native SDKs keep that setting across launches, so the next launch starts with the last decision Trace applied.

Start the native SDK opted out when consent gates this destination: set `"analytics_auto_collection_enabled": false` in `firebase.json`, as in the example above, because the native SDK collects from launch, before Trace starts. Restore the stored decision with `trace.consent.set(...)` before `trace.start()`; Trace then opts in with `setAnalyticsCollectionEnabled(analytics, true)` once every purpose is granted. Trace never calls `setConsent`: Google's consent mode belongs to your consent platform.

## Behavior

- Platforms and versions: iOS and Android, with `@react-native-firebase/analytics` 26.4 or newer within 26, where the modular `logEvent` returns nothing. It is checked against 26.4.0.
- Initialization is yours. The native SDK initializes itself at launch from your platform configuration files, and Trace never calls `getAnalytics`, `initializeAnalytics`, `setConsent`, `setDefaultEventParameters`, `resetAnalyticsData` or the modular `logEvent`. Opening the destination reads nothing. Without the native module, as in Expo Go, React Native Firebase throws on every call, so while the destination stays open, an anonymous event fails with its error and a signed-in user's event is skipped as `identity-failed`, because setting the user failed.
- Evidence is `sdk-call-returned`: the promise of `logEvent` settles once the native SDK has logged the event, before any upload. A promise that rejects fails the event with its error.
- Flush: none. The native SDKs upload on their own schedule.
- Quirks: two destinations over one `Analytics` instance log every event twice. Your own calls to `setUserId` or `setUserProperties` bypass Trace's identity planning, and a reset does not clear user properties you set yourself.
- `native` is the `Analytics` instance you passed in, for everything Trace does not wrap, such as `getAppInstanceId(native)`. Calls made on it bypass Trace's routing, consent, ordering and receipts.

## Tests

- Beside each helper in `src/utils/`: every parameter rule above in `getEventParameters`, every item rule in `getItems`, each with the values React Native Firebase converts, the 64-bit range of a whole number in `isWholeNumber`, every user property rule and the conversion to text in `getUserProperties`. `src/ga4.test.ts` covers the map itself: each event answered by its own mapping, `null`, and an undeclared or inherited name answered `null`.
- Against an in-process fake modelled on `@react-native-firebase/analytics` 26.4.0 (`src/fakeFirebase.fixture.ts`), which records every call in order, throws at once on an event name the SDK refuses and on a user property that is not text, and settles, holds or rejects each native promise as a test asks: the session's event mapping and name rules, the answer waiting for the native `logEvent`, the identity methods and their promises, the user properties a reset nulls when a call fails or waits, collection and the session's shape. Through a real `Trace` over the fake: a user switch resetting between the users with each event after its identity, an event reaching the native module before a user switch made in the same tick resets it, an event waiting for the native `setUserId`, an over-long user id and an ignored trait reported as unsupported steps, consent opening and closing collection, a refused collection switch reported as a diagnostic, a throwing mapping and a refused event each answered `failed`, a missing native module failing an anonymous event and skipping a signed-in user's, `native` and `flush`, and that Trace calls none of Firebase's initialization functions.
- Conformance: `src/conformance.test.ts` runs the core's `testAnalyticsAdapter` over the fake, with a `ga4()` map of the suite's own event.
- Typecheck only: `src/firebase.contracts.ts` assigns the real modular API to `FirebaseLike` and the real instance to `AnalyticsLike`, pins the fake's members to the real SDK's, pins `Ga4Item` to React Native Firebase's `Item` without its index signature, reads `trace.destination("product").native` as `Analytics | null` with its real `getAppInstanceId`, and refuses a missing map, an object that is not the API, one that is not an `Analytics` instance, functions or a `logEvent` that answer no promise, and the web SDK. It pins the typing of `ga4` as `@priemskiyyy/trace-firebase` does, and that an item's `price` is a number.
- Never: React Native Firebase itself, whose native modules need a device or a simulator, a GA4 property or the network. Not verified: that the native SDKs keep the order of the calls they receive, as React Native Firebase's modules suggest; what they do with a boolean parameter, with `items` on an event outside GA4's ecommerce events, and with a parameter named `client_id`; and which names and values GA4 finally keeps.

## License

[MIT](LICENSE)
