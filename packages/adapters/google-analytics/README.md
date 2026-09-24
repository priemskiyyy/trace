# @priemskiyyy/trace-google-analytics

Send [Trace](../../core) events to Google Analytics 4 on the web through the Google tag. You inject the `gtag` function your page's Google tag already defined and the measurement id of your GA4 data stream, so this package imports nothing. A map typed by your event registry turns each event into the GA4 event you choose, such as `begin_checkout` with its `items`, or keeps it from GA4. The adapter checks what the map built against Google's rules, lists on the receipt everything that did not fit, and sets the user id and user properties on the measurement before the events that need them.

## Installation

```sh
pnpm add @priemskiyyy/trace @priemskiyyy/trace-google-analytics
```

gtag.js is not an npm package: your page loads it with the Google tag snippet. Add `@types/gtag.js` as a dev dependency to type the global `gtag`. On a page where the Firebase SDK runs, use `@priemskiyyy/trace-firebase` instead, and on React Native, `@priemskiyyy/trace-firebase-react-native`.

## Create a Trace

The Google tag, opted out until consent is granted:

```html
<script
  async
  src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXX"
></script>
<script>
  window["ga-disable-G-XXXXXXX"] = true;
  window.dataLayer = window.dataLayer || [];
  function gtag() {
    dataLayer.push(arguments);
  }
  gtag("js", new Date());
  gtag("config", "G-XXXXXXX");
</script>
```

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
  "Search Performed": event<{ query: string }>(),
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
        "Search Performed": ({ properties }) =>
          ({
            name: "search",
            parameters: { search_term: properties.query },
          }) satisfies Ga4Event,
        "Internal Ping": () => null,
      }),
    }),
  },
  consent: { web: ["analytics"] },
});

trace.start();
trace.consent.set({ analytics: "granted" });
trace.user({ id: "user_42" });
trace.track("Checkout Started", {
  total: 49.5,
  currency: "EUR",
  lines: [{ sku: "sku_1", name: "Tee", price: 49.5, quantity: 1 }],
});
```

## Options

| Option        | Default  | Meaning                                                                                                                                 |
| ------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `sdk`         | required | The `gtag` function your Google tag snippet defined, usually `window.gtag`. It queues every command in `dataLayer` until gtag.js loads. |
| `measurement` | required | `{ id }`, the measurement id of the GA4 web data stream every event goes to and every user change applies to, such as `G-XXXXXXX`.      |
| `map`         | required | The GA4 event each Trace event becomes, or `null` to keep it from GA4. Build it with `ga4(events, mappings)`.                           |

`ga4(events, mappings)` takes one mapping per declared event, typed by that event's properties: a newly declared event does not compile until it is mapped or answered `null`, and an event the registry does not declare cannot be mapped. A mapping answers `{ name, parameters, items? }`:

- `name` suggests GA4's recommended events (`begin_checkout`, `purchase`, `login`, `sign_up` and the rest) and accepts any other.
- `parameters` holds flat values: text, numbers, booleans or `null`, never `undefined` or a nested object.
- `items` is GA4's ecommerce list, each item typed with the item fields gtag.js knows by name. Only GA4's 14 ecommerce events carry it, as the parameters below say.

TypeScript does not check extra fields in an object an arrow function returns, so a mapping still compiles when its answer has a field `Ga4Event` does not have, such as a misspelled `item`, or an item has a field `Ga4Item` does not type. End each answer with `satisfies Ga4Event`, as the example does, to have those fields refused in the answer and in the items written in it; an item built in a callback of its own, such as the one `.map()` takes, needs its own `satisfies Ga4Item`. At runtime the adapter reads only `name`, `parameters` and `items`, so any other field of an answer is ignored without a loss; inside `items`, it leaves out each item's custom parameters past GA4's 27 and every nested value, each with a loss. `satisfies Ga4Item` also refuses the custom item parameters GA4 accepts, so an item that carries them goes without it.

A mapping receives the frozen, sanitized event every destination sees and answers synchronously. An answer of `null` keeps the event from GA4 as `dropped: provider-filtered`; a mapping that throws fails the event with its error, which Trace contains.

## How an event is mapped

Each event is one `gtag("event", name, parameters)` call whose `send_to` is the measurement id, so it reaches that measurement and no other tag on the page.

| Trace              | Google Analytics                                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `event.name`       | picks the mapping; the GA4 name is the one the mapping answered, sent as it is and never converted                       |
| `event.properties` | what the mapping built from them: its `parameters` and `items`                                                           |
| `event.context`    | event parameters under the mapping's parameters; a context key a parameter already uses is `omitted`                     |
| `event.identity`   | not sent with the event: the user id and user properties are set on the measurement before it, see Identity              |
| `event.id`         | not sent: GA4 has no deduplication id for web events                                                                     |
| `event.timestamp`  | not sent: gtag.js stamps its own time, so every submitted outcome carries `{ path: "timestamp", reason: "unsupported" }` |

A mapped name that breaks GA4's rule in the table below, or that GA4 reserves for its own measurement on a web stream (`ad_impression`, `app_remove`, `app_store_refund`, `error`, `first_open`, `first_visit`, `in_app_purchase`, `session_start`, `user_engagement`), is not sent: the event is `dropped: provider-filtered` with `{ path: "name", reason: "invalid" }`. A name is never converted, so a typo in a mapping shows on the receipt instead of reaching GA4 under another name. `page_view` is not reserved here, because single-page applications send it themselves.

Parameters, each loss on its own path such as `parameters.coupon`, `context.app` or `items.0`:

- `items` go only with GA4's ecommerce events (`add_payment_info`, `add_shipping_info`, `add_to_cart`, `add_to_wishlist`, `begin_checkout`, `purchase`, `refund`, `remove_from_cart`, `select_item`, `select_promotion`, `view_cart`, `view_item`, `view_item_list`, `view_promotion`), where they take the first of the 25 slots, the mapping's parameters the next, the context the rest. gtag.js drops `items` from any other event without a word, so the adapter leaves them out as `unsupported` at `items`.
- A name already sent is `omitted`, so the mapping's `items` and parameters win over the context. So is every field gtag.js reads as its own instead of sending it as an event parameter, because it would move, redirect or reconfigure the event: `user_id`, `client_id`, `session_id` and the other user and session fields set whose event it is, and a `client_id` moves every later event too; `transport_url` and `server_container_url` send it, with the user id and the page, to another host, and `tracking_id` to another GA4 property; `allow_ad_personalization_signals` turns ad personalization back on, and `traffic_type` marks it internal; `engagement_time_msec`, `event_id` and `event_developer_id_string` replace the engagement time and ids gtag.js sends with the event; `url_passthrough` sets the request's `gtm_up` while consent to analytics storage is denied, and a `user_data` sets its `ec_mode` through a server container; a `cookie_domain` other than the page's loses the event. gtag.js drops several of them without a word, so the `omitted` loss is what shows them. The whole list, 92 names read from the gtag.js source: `_extracted_data`, `_fpm_parameters`, `_google_ng`, `_ip_override`, `_is_fpm`, `_is_passthrough_cid`, `_lps`, `_platinum_request_status`, `_protected_audience_enabled`, `_sst_parameters`, `_user_agent_architecture`, `_user_agent_bitness`, `_user_agent_full_version_list`, `_user_agent_mobile`, `_user_agent_model`, `_user_agent_platform`, `_user_agent_platform_version`, `_user_agent_wow64`, `_user_region`, `allow_ad_personalization_signals`, `allow_display_features`, `allow_enhanced_conversions`, `allow_google_signals`, `client_id`, `consent_update_type`, `conversion_api`, `cookie_deprecation`, `cookie_domain`, `cookie_expires`, `cookie_flags`, `cookie_name`, `cookie_path`, `cookie_prefix`, `cookie_update`, `custom_map`, `delivery_postal_code`, `developer_id`, `dynamic_event_settings`, `engagement_time_msec`, `enhanced_client_id`, `event_callback`, `event_developer_id_string`, `event_id`, `event_settings`, `event_timeout`, `ext_client_id`, `firebase_id`, `first_party_collection`, `ga_restrict_domain`, `gclgs`, `gcllp`, `gclst`, `geo_granularity`, `global_developer_id_string`, `google_analysis_params`, `google_signals`, `google_tld`, `groups`, `gtag_event_feature_usage`, `iframe_state`, `ignore_referrer`, `internal_traffic_results`, `is_legacy_converted`, `is_legacy_loaded`, `items`, `language`, `linker`, `non_interaction`, `redact_device_info`, `referral_exclusion_definition`, `restricted_data_processing`, `screen_resolution`, `send_page_view`, `send_to`, `server_container_3p_enrichment`, `server_container_url`, `session_duration`, `session_engaged`, `session_engaged_time`, `session_id`, `session_number`, `testonly`, `tracking_id`, `traffic_type`, `transport_url`, `update`, `url_passthrough`, `user_data`, `user_data_mode`, `user_data_settings`, `user_id` and `user_properties`.
- So no mapping and no context can send an event to another host or GA4 property, file it under another user, visitor or session, or change the request's own settings. The only fields gtag.js reads as its own and still takes from an event are the 11 GA4 documents as the event's page, campaign and currency, which it sends under fields of its own: `page_location`, `page_referrer`, `page_title`, `page_path`, `currency`, `campaign_content`, `campaign_id`, `campaign_medium`, `campaign_name`, `campaign_source` and `campaign_term`.
- Numbers, booleans and `null` are sent as they are, and text is measured in characters. A nested value, in the context or inside an item, is `unsupported`, because gtag.js flattens it to `[object Object]`: a context such as `{ app: { version } }` is lost as `context.app`. Keep context meant for GA4 flat, such as `{ app_version }`.

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

The adapter counts 27 per item, so an event whose items carry different custom fields can exceed a per-event count.

[names]: https://support.google.com/analytics/answer/13316687
[limits]: https://support.google.com/analytics/answer/9267744
[ecommerce]: https://developers.google.com/analytics/devguides/collection/ga4/ecommerce

## Identity

- `identify` sends `gtag("config", id, { update: true, user_id })`, which sets the user id of a measurement the page configured without sending a `page_view`. The adapter's first `config` also carries `send_page_view: false`, so even before the page's own `config` it never sends one. A user id longer than GA4 keeps is refused as unsupported before gtag sees it, so the events that follow carry no user id rather than a cut one.
- `traits` sends `gtag("config", id, { update: true, user_properties })`, with `null` for a removed trait. A trait GA4 would ignore is left out and never cut, because GA4 ignores such a change rather than keeping part of it: a name that breaks the rule in the table or is one of the 20 names Google reserves (`cid`, `customer_id`, `customerid`, `first_open_after_install`, `first_open_time`, `first_visit_time`, `google_allow_ad_personalization_signals`, `last_advertising_id_reset`, `last_deep_link_referrer`, `last_gclid`, `lifetime_user_engagement`, `non_personalized_ads`, `session_id`, `session_number`, `sessionid`, `sfmc_id`, `sid`, `uid`, `user_id`, `userid`), a nested value, or text over the limit. The rest of the update is set, and the step is reported unsupported, which appears as the diagnostic `identity step unsupported`.
- There are no groups. GA4 has no group analytics, and gtag's `groups` parameter routes tags.
- `reset` sets the user id to `null` and nulls every user property name this adapter sent since the last reset, removed ones included. gtag.js keeps its client id after a sign-out, and nothing in gtag.js starts a new anonymous visitor.
- gtag.js applies commands in the order they arrive, queued in `dataLayer` before it has loaded and at once after, and sends each event with the user id and user properties set before it. So every identity change is sent at once, and a user switched right after an event never reaches that event.
- Each change goes to this measurement only. Trace never sends `gtag("set", ...)`, which would reach every tag on the page.

## Consent

`collection` flips gtag.js's own `ga-disable-<measurement id>` switch on `window`, both ways, as Google's Firebase SDK does: while it is `true`, gtag.js sends nothing to that measurement. A destination the `consent` option does not name never touches it.

Initialize the Google tag opted out when consent gates this destination: set `window["ga-disable-<measurement id>"] = true` before the snippet's first `gtag()` call, as in the example above. Trace sets it to `false` once every purpose is granted, and to `true` again when one is withdrawn. Trace never sends `gtag("consent", ...)`: Google's consent mode belongs to your consent platform.

## Behavior

- Platforms and versions: the browser, with gtag.js as Google serves it, which carries no version. The types are checked against `@types/gtag.js` 0.0.20.
- Initialization is yours. The Google tag snippet loads gtag.js, defines `gtag` and `dataLayer`, and sends `js` and `config`. Trace sends only `event` and `config` with `update: true`, never `js`, a plain `config`, `set`, `get` or `consent`. Opening the destination reads nothing: gtag queues every command until gtag.js has loaded.
- A plain `gtag("config", id, ...)` sent by your page after Trace set a user replaces the measurement's settings: the user id and user properties are gone from every later event until the next change of user. Send later page views with `gtag("event", "page_view", ...)` or through Trace.
- Evidence is `sdk-call-returned`: `gtag` returns nothing, and gtag.js sends events in batches later. The adapter sets no `event_callback`, because gtag.js also runs it when `event_timeout` passes and while the `ga-disable` switch is on, so it proves nothing about delivery.
- Flush: none. gtag.js sends on its own schedule.
- The Firebase SDK replaces `window.gtag` with a wrapper that lets a user id set after an event reach gtag.js before that event. On a page where it runs, use `@priemskiyyy/trace-firebase`, which waits for that wrapper, and do not register both over one measurement.
- The Google tag's own `config` sends a `page_view` unless `send_page_view` is `false`. Turn it off when Trace tracks page views, or GA4 counts them twice.
- Register one measurement id under one destination; two destinations over it send every event twice.
- `native` is the `gtag` function you passed in, for everything Trace does not wrap, such as `native("get", "G-XXXXXXX", "client_id", callback)`. Commands sent through it bypass Trace's routing, consent, ordering and receipts.

## Tests

- Beside each helper in `src/utils/`: every parameter rule above in `getEventParameters`, with a row for each of the 14 ecommerce events and each of the 92 fields gtag.js reads as its own; every item rule in `getItems`, the 27 counted per item; every user property rule in `getUserProperties`; and in `createConfigUpdate`, `send_page_view: false` on the first `config` only. `src/ga4.test.ts` covers the map itself: each event answered by its own mapping, `null`, and an undeclared or inherited name answered `null`.
- Against an in-process fake `gtag` (`src/fakeGtag.fixture.ts`) that records every command in `dataLayer`, as the snippet's `gtag` does, and records each event with the user id and the user properties in effect before it: the session's event mapping and name rules, `items` left out of an event outside the ecommerce set, the identity commands, the measurement id read once, and collection. Through a real `Trace` over the fake: a user switch and a sign-out sending each event under its own user, an over-long user id and an ignored trait reported as unsupported steps, consent opening and closing the switch and an ungated destination never touching it, a throwing mapping and a throwing `gtag` answered `failed`, `native`, and that Trace sends no command but events and `config` updates. The fake does not model page views, batching, `event_callback` or the `ga-disable` switch.
- Conformance: `src/conformance.test.ts` runs the core's `testAnalyticsAdapter` over the fake, with a `ga4()` map of the suite's own event.
- Typecheck only: `src/googleAnalytics.contracts.ts` assigns the `gtag` global of `@types/gtag.js` to `GtagLike`, assigns the fake to the real `gtag` type, pins `Ga4Item` to gtag's `Item` without its `currency`, which gtag.js sends as a custom item parameter, reads `trace.destination("web").native` as the real `gtag` type and sends a command through it that `GtagLike` does not name, and refuses a missing map or measurement, an object that is not a `gtag` function, Firebase's `logEvent` and the React Native Firebase instance. It pins the typing of `ga4` as `trace-firebase` does: a missing or undeclared mapping, a nested or `undefined` parameter, an item with none of the item fields, an item field of another type, an answer without parameters and a property the event does not declare are each refused, and `satisfies Ga4Event` and `satisfies Ga4Item` refuse what compiles without them.
- Never: gtag.js is a script Google serves, not an npm package, so no test here runs it, nor a GA4 property, a browser or the network. What the fake models, and the claims above about gtag.js (command order, the user each event keeps, a first `config` sending a `page_view` unless `send_page_view` is `false`, a page's plain `config` dropping the user id, `null` clearing a user property, the fields it reads as its own, `tracking_id` changing the property, `session_id` and `session_number` dropped, the `ga-disable` switch, which events carry `items`), were observed against gtag.js as served on 2026-09-24, run in jsdom with every network path stubbed, outside this package. The 92 control fields and the 14 ecommerce events are read from that gtag.js build's source: its hit builder's skipped fields, its request fields, its event fields, its user and session fields, and the two fields that set request fields under consent mode or a server container. Which names and values GA4 finally keeps is Google's rule as documented; nothing here can observe it.

## License

[MIT](LICENSE)
