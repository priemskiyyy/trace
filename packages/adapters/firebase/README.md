# @priemskiyyy/trace-firebase

Send [Trace](../../core) events to Google Analytics through Firebase Analytics on the web. You inject the Firebase modular SDK and the `Analytics` instance your application already created, so this package imports neither. A map typed by your event registry turns each event into the GA4 event you choose, such as `begin_checkout` with its `items`, or keeps it from GA4. The adapter checks what the map built against Google's rules, lists on the receipt everything that did not fit, and holds every change of user until Firebase has processed the events tracked before it.

## Installation

```sh
pnpm add @priemskiyyy/trace @priemskiyyy/trace-firebase firebase
```

On React Native, use `@priemskiyyy/trace-firebase-react-native` over `@react-native-firebase/analytics` instead.

## Create a Trace

```ts
import { event, Trace } from "@priemskiyyy/trace";
import { firebase, ga4 } from "@priemskiyyy/trace-firebase";
import type { Ga4Event, Ga4Item } from "@priemskiyyy/trace-firebase";
import * as FirebaseAnalytics from "firebase/analytics";
import { initializeApp } from "firebase/app";

const events = {
  "Checkout Started": event<{
    total: number;
    currency: string;
    lines: { sku: string; name: string; price: number; quantity: number }[];
  }>(),
  "Search Performed": event<{ query: string }>(),
  "Internal Ping": event(),
};

const app = initializeApp(firebaseConfig);

// Opted out until the consent below is granted.
Object.assign(window, { [`ga-disable-${firebaseConfig.measurementId}`]: true });

if (await FirebaseAnalytics.isSupported()) {
  const trace = new Trace({
    events,
    destinations: {
      product: firebase({
        sdk: FirebaseAnalytics,
        analytics: FirebaseAnalytics.getAnalytics(app),
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

  trace.start();
  trace.consent.set({ analytics: "granted" });
  trace.user({ id: "user_42" });
  trace.track("Checkout Started", {
    total: 49.5,
    currency: "EUR",
    lines: [{ sku: "sku_1", name: "Tee", price: 49.5, quantity: 1 }],
  });
}
```

## Options

| Option      | Default  | Meaning                                                                                                                                                  |
| ----------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sdk`       | required | The Firebase modular analytics API, passed as its namespace: `import * as FirebaseAnalytics from "firebase/analytics"`.                                  |
| `analytics` | required | The `Analytics` instance your application created with `getAnalytics(app)` or `initializeAnalytics(app, settings)`, after `isSupported()` answered true. |
| `map`       | required | The GA4 event each Trace event becomes, or `null` to keep it from GA4. Build it with `ga4(events, mappings)`.                                            |

`ga4(events, mappings)` takes one mapping per declared event, typed by that event's properties: a newly declared event does not compile until it is mapped or answered `null`, and an event the registry does not declare cannot be mapped. A mapping answers `{ name, parameters, items? }`:

- `name` suggests GA4's recommended events (`begin_checkout`, `purchase`, `login`, `sign_up` and the rest) and accepts any other.
- `parameters` holds flat values: text, numbers, booleans or `null`, never `undefined` or a nested object.
- `items` is GA4's ecommerce list, each item typed as Firebase types its `Item`.

TypeScript does not check extra fields in an object an arrow function returns, so a mapping still compiles when its answer has a field `Ga4Event` does not have, such as a misspelled `item`, or an item has a field Firebase does not type. End each answer with `satisfies Ga4Event`, as the example does, to have those fields refused in the answer and in the items written in it; an item built in a callback of its own, such as the one `.map()` takes, needs its own `satisfies Ga4Item`. At runtime the adapter reads only `name`, `parameters` and `items`, so any other field of an answer is ignored without a loss; inside `items`, it leaves out each item's custom parameters past GA4's 27 and every nested value, each with a loss. `satisfies Ga4Item` also refuses the custom item parameters GA4 accepts, so an item that carries them goes without it.

A mapping receives the frozen, sanitized event every destination sees and answers synchronously. An answer of `null` keeps the event from GA4 as `dropped: provider-filtered`; a mapping that throws fails the event with its error, which Trace contains.

## How an event is mapped

Each event is one `logEvent(analytics, name, parameters)` call.

| Trace              | Firebase                                                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `event.name`       | picks the mapping; the GA4 name is the one the mapping answered, sent as it is and never converted                        |
| `event.properties` | what the mapping built from them: its `parameters` and `items`                                                            |
| `event.context`    | event parameters under the mapping's parameters; a context key a parameter already uses is `omitted`                      |
| `event.identity`   | not sent with the event: the user id and user properties are set on Firebase before it, see Identity                      |
| `event.id`         | not sent: GA4 has no deduplication id for web events                                                                      |
| `event.timestamp`  | not sent: Firebase stamps its own time, so every submitted outcome carries `{ path: "timestamp", reason: "unsupported" }` |

A mapped name that breaks GA4's rule in the table below, or that GA4 reserves for its own measurement on a web stream (`ad_impression`, `app_remove`, `app_store_refund`, `error`, `first_open`, `first_visit`, `in_app_purchase`, `session_start`, `user_engagement`), is not sent: the event is `dropped: provider-filtered` with `{ path: "name", reason: "invalid" }`. A name is never converted, so a typo in a mapping shows on the receipt instead of reaching GA4 under another name. `page_view` is not reserved here, because single-page applications send it themselves.

Parameters, each loss on its own path such as `parameters.coupon`, `context.app` or `items.0`:

- `items` go only with GA4's ecommerce events (`add_payment_info`, `add_shipping_info`, `add_to_cart`, `add_to_wishlist`, `begin_checkout`, `purchase`, `refund`, `remove_from_cart`, `select_item`, `select_promotion`, `view_cart`, `view_item`, `view_item_list`, `view_promotion`), where they take the first of the 25 slots, the mapping's parameters the next, the context the rest. gtag.js drops `items` from any other event without a word, so the adapter leaves them out as `unsupported` at `items`.
- A name already sent is `omitted`, so the mapping's `items` and parameters win over the context. So is every field gtag.js reads as its own instead of sending it as an event parameter, because it would move, redirect or reconfigure the event: `user_id`, `client_id`, `session_id` and the other user and session fields set whose event it is, and a `client_id` moves every later event too; `transport_url` and `server_container_url` send it, with the user id and the page, to another host, and `tracking_id` to another GA4 property; `allow_ad_personalization_signals` turns ad personalization back on, and `traffic_type` marks it internal; `engagement_time_msec`, `event_id` and `event_developer_id_string` replace the engagement time and ids gtag.js sends with the event; `url_passthrough` sets the request's `gtm_up` while consent to analytics storage is denied, and a `user_data` sets its `ec_mode` through a server container; a `cookie_domain` other than the page's loses the event. gtag.js drops several of them without a word, so the `omitted` loss is what shows them. The whole list, 92 names read from the gtag.js source: `_extracted_data`, `_fpm_parameters`, `_google_ng`, `_ip_override`, `_is_fpm`, `_is_passthrough_cid`, `_lps`, `_platinum_request_status`, `_protected_audience_enabled`, `_sst_parameters`, `_user_agent_architecture`, `_user_agent_bitness`, `_user_agent_full_version_list`, `_user_agent_mobile`, `_user_agent_model`, `_user_agent_platform`, `_user_agent_platform_version`, `_user_agent_wow64`, `_user_region`, `allow_ad_personalization_signals`, `allow_display_features`, `allow_enhanced_conversions`, `allow_google_signals`, `client_id`, `consent_update_type`, `conversion_api`, `cookie_deprecation`, `cookie_domain`, `cookie_expires`, `cookie_flags`, `cookie_name`, `cookie_path`, `cookie_prefix`, `cookie_update`, `custom_map`, `delivery_postal_code`, `developer_id`, `dynamic_event_settings`, `engagement_time_msec`, `enhanced_client_id`, `event_callback`, `event_developer_id_string`, `event_id`, `event_settings`, `event_timeout`, `ext_client_id`, `firebase_id`, `first_party_collection`, `ga_restrict_domain`, `gclgs`, `gcllp`, `gclst`, `geo_granularity`, `global_developer_id_string`, `google_analysis_params`, `google_signals`, `google_tld`, `groups`, `gtag_event_feature_usage`, `iframe_state`, `ignore_referrer`, `internal_traffic_results`, `is_legacy_converted`, `is_legacy_loaded`, `items`, `language`, `linker`, `non_interaction`, `redact_device_info`, `referral_exclusion_definition`, `restricted_data_processing`, `screen_resolution`, `send_page_view`, `send_to`, `server_container_3p_enrichment`, `server_container_url`, `session_duration`, `session_engaged`, `session_engaged_time`, `session_id`, `session_number`, `testonly`, `tracking_id`, `traffic_type`, `transport_url`, `update`, `url_passthrough`, `user_data`, `user_data_mode`, `user_data_settings`, `user_id` and `user_properties`.
- So no mapping and no context can send an event to another host or GA4 property, file it under another user, visitor or session, or change the request's own settings. The only fields gtag.js reads as its own and still takes from an event are the 11 GA4 documents as the event's page, campaign and currency, which it sends under fields of its own: `page_location`, `page_referrer`, `page_title`, `page_path`, `currency`, `campaign_content`, `campaign_id`, `campaign_medium`, `campaign_name`, `campaign_source` and `campaign_term`.
- Numbers, booleans and `null` are sent as they are, and text is measured in characters. A nested value, in the context or inside an item, is `unsupported`, because GA4 parameters are flat: a context such as `{ app: { version } }` is lost as `context.app`. Keep context meant for GA4 flat, such as `{ app_version }`.

GA4's limits as Google documents them, and what the adapter does at each:

| Limit                  | GA4                                                                                                                                                                                          | The adapter                                                     | Source                                              |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------- |
| Event name             | a letter, then letters, digits and `_`; 40 characters; no `query_id` prefix                                                                                                                  | drops the event as `provider-filtered`, `invalid` on `name`     | [naming rules][names], [collection limits][limits]  |
| Parameters per event   | 25                                                                                                                                                                                           | sends the first 25, `truncated` for each one past               | [collection limits][limits]                         |
| Parameter name         | the event name rule; no `firebase_`, `google_` or `ga_` prefix                                                                                                                               | `invalid`                                                       | [naming rules][names], [collection limits][limits]  |
| Parameter value        | 100 characters; `page_title` 300, `page_referrer` 420, `page_location` 1000                                                                                                                  | cuts the text, `truncated`                                      | [collection limits][limits]                         |
| Items                  | 200 per event                                                                                                                                                                                | sends the first 200, `truncated` on `items`                     | [ecommerce][ecommerce]                              |
| Custom item parameters | ecommerce guide: "up to 27 custom parameters in the items array, in addition to the prescribed parameters"; collection limits: "up to 27 item-level custom parameters in an ecommerce event" | keeps the first 27 on each item, `truncated` on `items.<index>` | [ecommerce][ecommerce], [collection limits][limits] |
| User id                | 256 characters                                                                                                                                                                               | refuses the change as unsupported                               | [collection limits][limits]                         |
| User property name     | the parameter name rule within 24 characters; not one of the 20 reserved names below                                                                                                         | leaves it out, the step unsupported                             | [naming rules][names], [collection limits][limits]  |
| User property value    | 36 characters                                                                                                                                                                                | leaves it out, the step unsupported                             | [collection limits][limits]                         |
| User properties        | 25 per property                                                                                                                                                                              | not checked: GA4 counts them across every user                  | [collection limits][limits]                         |

[names]: https://support.google.com/analytics/answer/13316687
[limits]: https://support.google.com/analytics/answer/9267744
[ecommerce]: https://developers.google.com/analytics/devguides/collection/ga4/ecommerce

## Identity

- `identify` calls `setUserId`. A user id longer than GA4 keeps is refused as unsupported before Firebase sees it, so the events that follow carry no user id rather than a cut one.
- `traits` calls `setUserProperties`, with `null` for a removed trait. A trait GA4 would ignore is left out and never cut, because GA4 ignores such a change rather than keeping part of it: a name that breaks the rule in the table or is one of the 20 names Google reserves (`cid`, `customer_id`, `customerid`, `first_open_after_install`, `first_open_time`, `first_visit_time`, `google_allow_ad_personalization_signals`, `last_advertising_id_reset`, `last_deep_link_referrer`, `last_gclid`, `lifetime_user_engagement`, `non_personalized_ads`, `session_id`, `session_number`, `sessionid`, `sfmc_id`, `sid`, `uid`, `user_id`, `userid`), a nested value, or text over the limit. The rest of the update is set, and the step is reported unsupported, which appears as the diagnostic `identity step unsupported`.
- There are no groups. GA4 has no group analytics, and its `groups` parameter routes tags.
- `reset` sets the user id to `null` and nulls every user property name this adapter sent since the last reset, removed ones included. Firebase has no call that starts a new anonymous visitor on the web, so the GA4 client id stays after a sign-out.
- Firebase's modular functions return before the command reaches gtag, and a user id set right after an event can reach gtag before that event, so the event would count for the next user. Every event therefore carries an `event_callback`, and an identity change waits until every earlier event has called back, for at most Trace's `timeout`.
- When gtag.js never runs, for example under a content blocker, no event calls back. An identity change then times out, and the event that needed it is skipped as `identity-failed`, never sent under the wrong user. Trace starts every later event from a reset, which times out the same way, so each later event is skipped after one `timeout`; gtag.js would not have sent it either.
- One identity change waits at a time. Trace awaits each identity step before the next, so a new change meets a waiting one only after that step timed out, and replaces it. A change replaced this way, or withdrawn by switching collection off or disposing, fails with `DELIVERY_FAILED` and never reaches Firebase.

## Consent

`collection` calls `setAnalyticsCollectionEnabled`, which flips Firebase's own `ga-disable-<measurement id>` switch, both ways. Switching collection off also withdraws an identity change still waiting for earlier events, so it never reaches Firebase afterwards.

Initialize Firebase opted out when consent gates this destination: set `window["ga-disable-<measurement id>"] = true` before `getAnalytics(app)`, as in the example above, and pass `config: { send_page_view: false }` to `initializeAnalytics` if the first page view must wait as well. Trace opts in with `setAnalyticsCollectionEnabled(analytics, true)` once every purpose is granted. Trace never calls `setConsent`: Google's consent mode belongs to your consent platform.

## Behavior

- Platforms and versions: the browser, with the modular API of `firebase` 12.19 or newer within 12. It is checked against `firebase` 12.19.0, which bundles `@firebase/analytics` 0.10.25.
- Initialization is yours. Trace never calls `initializeApp`, `getAnalytics`, `initializeAnalytics`, `isSupported`, `settings`, `setConsent`, `setDefaultEventParameters` or `deleteApp`. Opening the destination reads nothing: Firebase holds the calls it receives while it initializes and sends them once it has.
- Evidence is `sdk-call-returned`. `logEvent` returns before anything happens and logs its own failures instead of throwing. `event_callback` also runs when gtag's `event_timeout` passes, so it orders identity changes and proves nothing more.
- Flush: none. Firebase and gtag.js send on their own schedule.
- The ordering covers the calls of one adapter. Two adapters over one `Analytics` instance, or your own calls to `setUserId`, bypass it. Register the instance under one destination; two destinations over it log every event twice.
- Firebase's initialization sends a `page_view` unless `send_page_view` is `false`. Turn it off when Trace tracks page views, or GA4 counts them twice.
- `native` is the `Analytics` instance you passed in, for everything Trace does not wrap, such as `getGoogleAnalyticsClientId(native)`. Calls made on it bypass Trace's routing, consent, ordering and receipts.

## Tests

- Beside each helper in `src/utils/`: every parameter rule above in `getEventParameters`, every item rule in `getItems`, every user property rule in `getUserProperties`, and the ordering of identity changes behind `event_callback` in `createProcessingBarrier`. `src/ga4.test.ts` covers the map itself: each event answered by its own mapping, `null`, and an undeclared or inherited name answered `null`.
- Against an in-process fake modelled on `firebase` 12.19.0 (`src/fakeFirebase.fixture.ts`): the session's event mapping and name rules, the identity methods and their ordering, collection and disposal. Through a real `Trace` over the fake: a user switch waiting for Firebase's callback and resetting between the users, identity changes timing out while Firebase never calls back and the event skipped as `identity-failed`, the next event starting over from a reset, an over-long user id and an ignored trait reported as unsupported steps, consent opening and closing collection and withdrawing a waiting change, a throwing mapping answered `failed`, `native`, and that Trace calls none of Firebase's initialization functions. The fake runs or holds each `event_callback` and throws after its app was deleted; it does not model Firebase's queue before initialization or its reordering, which the real SDK shows.
- Conformance: `src/conformance.test.ts` runs the core's `testAnalyticsAdapter` over the fake, with a `ga4()` map of the suite's own event.
- Against the real SDK: `src/firebase.sdk.test.ts` runs `firebase` 12.19.0 in Node, with `window`, `document`, `navigator` and `fetch` stubbed and a stand-in for gtag.js that runs `event_callback`. It shows the SDK itself applying a later user id to an earlier event, then each event reaching gtag under its own user through the adapter and a typed `ga4` map, and through a real `Trace` switching users, user properties, their removal and a reset reaching gtag as sent, and the `ga-disable` switch flipping both ways.
- Typecheck only: `src/firebase.contracts.ts` assigns the real `firebase/analytics` API to `FirebaseLike`, checks that every function the fake models exists on it, pins `Ga4Item` to Firebase's `Item`, reads `trace.destination("product").native` as `Analytics | null` with its real `app`, and refuses an object that is not the API, an object that is not an `Analytics` instance and the React Native SDK. It pins the typing of `ga4`: a missing map, a missing or undeclared mapping, a nested or `undefined` parameter, an item with none of Firebase's item fields, an item field of another type, an answer without parameters and a property the event does not declare are each refused. A field `Ga4Event` does not have and an item field Firebase does not type both compile inside a mapping; `satisfies Ga4Event` refuses them in the answer and in the items written in it, and `satisfies Ga4Item` in an item a callback builds.
- Never: gtag.js itself, a GA4 property, a browser or the network. Which names and values GA4 finally keeps is Google's rule as documented; nothing here can observe it.

## License

[MIT](LICENSE)
