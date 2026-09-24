# Changelog

## @priemskiyyy/trace 0.1.0 - 2026-09-24

- First release. `Trace` declares events, sanitizes them, plans identity, gates them by consent, routes them and hands each one to the destinations it was routed to, then answers a receipt for what each destination did.
- Events are declared once as a typed registry, `event()`, `event<TProperties>()` or `event(schema)`; an event a schema refuses never reaches a destination.
- An identity generation starts whenever the user changes or signs out. A destination that holds an identity is reset before the next user is identified, and pending work from the previous generation is dropped instead of sent under the next one.
- `track()` is synchronous and returns a receipt whose `settled` promise never rejects. Outcomes are `submitted`, `dropped`, `skipped`, `failed` and `indeterminate`, each naming the evidence it rests on.
- Consent gates delivery by purpose: a destination receives nothing until every purpose it needs is granted, and where its SDK has a reversible switch, its own collection is off while they are not.
- Redaction by a `redact(key, path)` predicate and size `limits` run before anything is kept, buffered, observed or sent.
- An adapter is a plain `{ name, open }`, and the runtime owns the session's lifecycle. `createMockAdapter` is under `./mock`, and the `testAnalyticsAdapter` conformance suite under `./testing`.
- Trace's own errors are `TraceError`s with a `code`: `INVALID_CONFIGURATION`, `NOT_INITIALIZED`, `UNSUPPORTED`, `INVALID_ANSWER` or `DELIVERY_FAILED`. Only misconfiguration throws.
- Passive, payload-free diagnostics: a snapshot and an event stream that cost nothing while nobody observes them.

## @priemskiyyy/trace-react 0.1.0 - 2026-09-24

- First release. `TraceProvider`, `useTrace`, `useTraceStatus`, `useDestinationStatus` and `useConsent`.
- The provider owns no lifetime: it never starts, disposes or tracks anything. The status hooks observe only, and read `idle` on the server, with every purpose `unknown`.
- Requires `@priemskiyyy/trace` 0.1 and React 19.2.

## @priemskiyyy/trace-vue 0.1.0 - 2026-09-24

- First release. `TraceProvider`, `useTrace`, `useTraceStatus`, `useDestinationStatus` and `useConsent`, in Vue's composable idiom.
- The provider owns no lifetime. The status composables observe only, and read `idle` on the server and until mounted, so hydration never mismatches.
- Requires `@priemskiyyy/trace` 0.1 and Vue 3.5.

## @priemskiyyy/trace-solid 0.1.0 - 2026-09-24

- First release. `TraceProvider`, `useTrace`, `useTraceStatus`, `useDestinationStatus` and `useConsent`, as Solid primitives.
- The provider owns no lifetime. The status primitives observe only, and read `idle` on the server and until mounted.
- Requires `@priemskiyyy/trace` 0.1 and Solid 1.9.

## @priemskiyyy/trace-svelte 0.1.0 - 2026-09-24

- First release. `TraceProvider`, `useTrace`, `useTraceStatus`, `useDestinationStatus` and `useConsent`, over Svelte 5 runes. Ships Svelte sources for the application's compiler.
- The provider owns no lifetime. The status utilities observe only, and read `idle` on the server and until mounted.
- Requires `@priemskiyyy/trace` 0.1 and Svelte 5.7.

## @priemskiyyy/trace-devtools 0.1.0 - 2026-09-24

- First release. A framework-independent inspector in a shadow root: destinations with their status, consent decisions by purpose, and a searchable, filterable timeline of every accepted event and what each destination did with it, carrying no event content until values are shown.
- Wrappers under `./react`, `./vue`, `./solid` and `./svelte` that read the Trace from their provider.
- Requires `@priemskiyyy/trace` 0.1 and Svelte 5.29 where the Svelte wrapper is used.

## @priemskiyyy/trace-ampli 0.1.0 - 2026-09-24

- First release. `fromAmpli` declares events from the Ampli wrapper Amplitude generated from your tracking plan, so canonical names, required and optional properties, literal unions and generated constants are never redefined.
- You pass in the `ampli` object your application loaded; the package imports no SDK.
- Requires `@priemskiyyy/trace` 0.1.

## @priemskiyyy/trace-amplitude 0.1.0 - 2026-09-24

- First release, for the browser and React Native, which share an API. Each event is one `track` call with its time and its id as `insert_id`, and a plugin added to the SDK files it under the user and device it was tracked with. Identity, groups, consent and flush use Amplitude's own calls.
- Requires `@priemskiyyy/trace` 0.1.

## @priemskiyyy/trace-amplitude-node 0.1.0 - 2026-09-24

- First release, for `@amplitude/analytics-node`. A server builds one Trace per request or job over the shared SDK; each event is one `track` call for its user and the visitor's device, with its time and its id as `insert_id`, and traits and groups become `identify`, `setGroup` and `groupIdentify` calls for the same ids.
- Requires `@priemskiyyy/trace` 0.1.

## @priemskiyyy/trace-posthog 0.1.0 - 2026-09-24

- First release, for posthog-js in the browser. Each event is one `capture` with its timestamp and its id as `uuid`. Identity, person properties, groups and consent use PostHog's own calls.
- Requires `@priemskiyyy/trace` 0.1.

## @priemskiyyy/trace-posthog-node 0.1.0 - 2026-09-24

- First release, for posthog-node. A server builds one Trace per request or job over the shared client; each event is one `capture` for its user or the visitor's anonymous id, with its memberships as groups, its time and its id as `uuid`, and a sign-in merges the visitor into the user.
- Requires `@priemskiyyy/trace` 0.1.

## @priemskiyyy/trace-posthog-react-native 0.1.0 - 2026-09-24

- First release, for posthog-react-native. Maps each event as `@priemskiyyy/trace-posthog` does, waiting until the client has loaded its storage before it captures.
- Requires `@priemskiyyy/trace` 0.1.

## @priemskiyyy/trace-mixpanel 0.1.0 - 2026-09-24

- First release, for mixpanel-browser. Each event is one `track` call carrying its time and its id, and the user, their traits and their groups become Mixpanel's own identify, profile and group calls.
- Requires `@priemskiyyy/trace` 0.1.

## @priemskiyyy/trace-mixpanel-node 0.1.0 - 2026-09-24

- First release, for the `mixpanel` package. A server builds one Trace per request or job over the client `init` returned; each event is one request for its user and the visitor's anonymous id, answered once Mixpanel accepted it, and traits and groups become profile and group updates for the user each update names.
- Requires `@priemskiyyy/trace` 0.1.

## @priemskiyyy/trace-mixpanel-react-native 0.1.0 - 2026-09-24

- First release, for mixpanel-react-native. Each event is one `track` call carrying its time and its id, and the user, their traits and their group memberships become Mixpanel's own identify, profile and group calls.
- Requires `@priemskiyyy/trace` 0.1.

## @priemskiyyy/trace-segment 0.1.0 - 2026-09-24

- First release, for analytics-next in the browser. Each event is one `track` call carrying its time and its id as the message id, and the user, their traits and one group type become Segment's own `identify` and `group` calls.
- Requires `@priemskiyyy/trace` 0.1.

## @priemskiyyy/trace-segment-node 0.1.0 - 2026-09-24

- First release, for `@segment/analytics-node`. A server builds one Trace per request or job over the shared client; each event is one `track` call for its user and the visitor's anonymous id, carrying its time and its id as the message id.
- Requires `@priemskiyyy/trace` 0.1.

## @priemskiyyy/trace-segment-react-native 0.1.0 - 2026-09-24

- First release, for analytics-react-native. Each event is one `track` call whose enrichment sets its time and its id as the message id, and the user, their traits and one group type become Segment's own `identify` and `group` calls.
- Requires `@priemskiyyy/trace` 0.1.

## @priemskiyyy/trace-rudderstack 0.1.0 - 2026-09-24

- First release, for the `RudderAnalytics` browser SDK. Each event is one `track` call carrying its time as the original timestamp, and the user, their traits and one group type become RudderStack's own `identify` and `group` calls.
- Requires `@priemskiyyy/trace` 0.1.

## @priemskiyyy/trace-google-analytics 0.1.0 - 2026-09-24

- First release, for Google Analytics 4 through the `gtag` function and a measurement id. A map typed by your event registry turns each event into the GA4 event you choose, or keeps it from GA4, and every part the map produced that does not fit Google's rules is a loss on the receipt.
- Requires `@priemskiyyy/trace` 0.1.

## @priemskiyyy/trace-firebase 0.1.0 - 2026-09-24

- First release, for Firebase Analytics on the web. Maps each event to a GA4 event as `@priemskiyyy/trace-google-analytics` does, and holds every user change until Firebase has processed the events tracked before it.
- Requires `@priemskiyyy/trace` 0.1.

## @priemskiyyy/trace-firebase-react-native 0.1.0 - 2026-09-24

- First release, for React Native Firebase's modular analytics API. Maps each event to a GA4 event as `@priemskiyyy/trace-firebase` does, and answers once the native SDK has taken each event.
- Requires `@priemskiyyy/trace` 0.1.

## @priemskiyyy/trace-heap 0.1.0 - 2026-09-24

- First release, for the heap.js global. Each event is one `track` call with its context under its properties, and the user and their traits become Heap's own identity and user properties.
- Requires `@priemskiyyy/trace` 0.1.

## @priemskiyyy/trace-plausible 0.1.0 - 2026-09-24

- First release, for `@plausible-analytics/tracker`. Each event becomes one custom event whose props are its flat properties and context as text. No user, trait or group ever reaches Plausible, which forbids identifiers.
- Requires `@priemskiyyy/trace` 0.1.

## @priemskiyyy/trace-umami 0.1.0 - 2026-09-24

- First release, for `window.umami`. Each event is one `track` call in its function form, carrying its data and the id of the user it was tracked for, so identity travels with each event and never sticks to the page.
- Requires `@priemskiyyy/trace` 0.1.

## @priemskiyyy/trace-fathom 0.1.0 - 2026-09-24

- First release, for fathom-client. Fathom keeps an event's name and, when it has one, its value in cents from a function you give the adapter; every property is reported as lost.
- Requires `@priemskiyyy/trace` 0.1.

## @priemskiyyy/trace-vercel 0.1.0 - 2026-09-24

- First release, for `@vercel/analytics`. Each event is one custom event with as many of its flat properties as your plan keeps; context is not sent.
- Requires `@priemskiyyy/trace` 0.1.

## @priemskiyyy/trace-console 0.1.0 - 2026-09-24

- First release. `console()` prints each event through the console or an injected writer, exactly as sanitized and redacted as every other destination receives it.
- Requires `@priemskiyyy/trace` 0.1.

## @priemskiyyy/trace-http 0.1.0 - 2026-09-24

- First release. `http({ request })` sends each event once through your own client, and a resolved request is `backend-acknowledged` evidence. Your client keeps the address, authentication, headers, batching, retries and response handling.
- Requires `@priemskiyyy/trace` 0.1.
