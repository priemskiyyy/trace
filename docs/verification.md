---
description: "Exactly what Trace's test suite proves and what it does not: which behavior runs against fakes, which against real SDK types, which against a real SDK's source, and what has never run on a device or a real backend."
---

# Verification matrix

A library about honest [receipts](receipts.md) should be honest about its own evidence. This page says what has been exercised, how, and what has not. See [application testing](testing.md) to write your own tests over the same mock, and [writing an adapter](writing-an-adapter.md) for the conformance suite every row's adapter passes.

```ts
const status = await trace.track("Checkout Started", {
  cart: { id: "cart_1" },
  value: 49.5,
  currency: "EUR",
}).settled;

if (status.state === "settled") {
  status.outcomes.research?.status; // proven only as far as `evidence` says
}
```

## How each layer is tested

| Layer                              | How it is tested                                                                                                                                                                                                                                                                  | What that does not cover                                                                             |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Core                               | Themed behavior files over the mock adapter (identity, consent, privacy, routing, delivery, flush, diagnostics), the pure planner's exhaustive table, an isolation suite with seeded sweeps of interleaved users and consent changes, and an edge matrix.                         | Real timers under load, real memory pressure.                                                        |
| Types                              | A consumer-facing `public-api.ts`, a `.contracts.ts` beside every adapter, and a generated 500-event registry compiled against `track`.                                                                                                                                           | TypeScript versions other than the one this repository pins.                                         |
| Adapters                           | Conformance (`testAnalyticsAdapter`), a fake modeled on a named SDK version that reproduces its quirks, and a typecheck-only contract against the real SDK. Most also have a real-SDK test where the SDK can run in Node or jsdom.                                                | Provider backends, and native SDK behavior nothing here can run.                                     |
| React, Vue, Solid, Svelte bindings | Real framework testing libraries in jsdom: passivity outside the provider, status and consent following changes, no listener left after unmount, Strict Mode or its framework's equivalent opening nothing twice, a server render and its hydration in a separate Vitest project. | A real browser, React Native's renderer, the meta-frameworks (Next.js, Nuxt, SolidStart, SvelteKit). |
| Devtools                           | A real shadow root in jsdom, queried by role: no value in the markup until Show values is on, live listeners counted to prove pausing and unmounting release what they subscribed, each wrapper rendered through its own binding, a server render of every wrapper.               | Resizing and pointer dragging in a real browser.                                                     |
| Packages                           | The packed tarballs installed into a clean consumer, typechecked, imported and run end to end.                                                                                                                                                                                    | Bundlers other than the ones checked, and Metro specifically.                                        |
| Docs                               | Every TypeScript fence, except the few marked fragments, typechecked against the built packages; the built site's dead links, headings and frontmatter.                                                                                                                           | Whether an example's own comment matches what it would print.                                        |
| Examples                           | Vitest drives each example through its buttons; Playwright drives the built React example in Chromium at 375 and 1280 pixels, outside `pnpm check`.                                                                                                                               | Other browsers, and every real provider SDK, since the examples simulate them.                       |

## Every adapter

| Adapter               | Conformance                                          | Fake modeled on                                                            | Real SDK test                                                                    | Contract vs the real SDK            | Device or backend run                                      |
| --------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------- | ---------------------------------------------------------- |
| console               | yes                                                  | an injected writer, and the global console                                 | no SDK                                                                           | none: there is no SDK               | never                                                      |
| ampli                 | yes                                                  | Ampli Build 1.0.0 over `@amplitude/analytics-browser` 2.45.10              | yes, the real generated wrapper and SDK in jsdom                                 | yes                                 | never                                                      |
| amplitude             | yes                                                  | `@amplitude/analytics-browser` 2.45.10 and `-react-native` 1.10.0          | yes, the browser SDK in Node                                                     | yes                                 | never; the React Native SDK itself is not run              |
| amplitude-node        | yes, without and with a visitor id                   | `@amplitude/analytics-node` 1.5.73                                         | yes, the installed SDK with its transport stubbed                                | yes                                 | never                                                      |
| posthog               | yes, configured and under `person_profiles: "never"` | posthog-js 1.434.2                                                         | yes, the installed SDK in jsdom                                                  | yes                                 | never                                                      |
| posthog-node          | yes, without and with a visitor id                   | posthog-node 5.52.6                                                        | yes, the installed SDK with `fetch` stubbed                                      | yes                                 | never                                                      |
| posthog-react-native  | yes                                                  | posthog-react-native 4.77.0 on `@posthog/core` 1.55.1                      | no                                                                               | yes                                 | never; needs a React Native runtime and a device           |
| mixpanel              | yes                                                  | mixpanel-browser 2.83.0, from its source                                   | yes, the installed SDK in jsdom, batch mode off                                  | yes                                 | never                                                      |
| mixpanel-node         | yes, without and with an anonymous id                | mixpanel 0.24.0                                                            | yes, the installed client against a local `node:http` server                     | yes                                 | never                                                      |
| mixpanel-react-native | yes                                                  | the JavaScript wrapper of mixpanel-react-native 3.8.0 over a native module | no                                                                               | yes                                 | never; needs a React Native runtime and a device           |
| segment               | yes, with and without a group type                   | analytics-next 1.84.3                                                      | yes, the installed SDK in jsdom with `fetch` stubbed                             | yes                                 | never                                                      |
| segment-node          | yes, without and with a group and an anonymous id    | analytics-node 3.1.0                                                       | yes, the installed SDK with its `httpClient` stubbed                             | yes                                 | never                                                      |
| segment-react-native  | yes, with and without a group type                   | `@segment/analytics-react-native` 2.24.1                                   | no                                                                               | yes                                 | never; needs a React Native runtime and its native modules |
| rudderstack           | yes, with and without a group type                   | `@rudderstack/analytics-js` 3.34.1                                         | yes, the installed SDK's bundled build in jsdom                                  | yes                                 | never                                                      |
| google-analytics      | yes, over the fake `gtag`                            | an in-process fake `gtag`                                                  | no npm package to run; gtag.js behavior was probed in jsdom outside this package | yes, against `@types/gtag.js`       | never                                                      |
| firebase              | yes                                                  | `firebase` 12.19.0                                                         | yes, the installed SDK in Node with a `gtag.js` stand-in                         | yes                                 | never                                                      |
| firebase-react-native | yes                                                  | `@react-native-firebase/analytics` 26.4.0                                  | no                                                                               | yes                                 | never; needs a device or a simulator                       |
| heap                  | yes                                                  | the heap.js 5.3.16 bundle, read from Heap's CDN                            | no npm package, so no real-SDK test                                              | none: Heap publishes no types       | never                                                      |
| plausible             | yes                                                  | `@plausible-analytics/tracker` 0.4.6                                       | yes, the installed tracker in jsdom with `fetch` stubbed                         | yes                                 | never                                                      |
| umami                 | yes                                                  | the Umami tracker 3.4.0                                                    | no npm package, so no real-SDK test                                              | yes, against `@types/umami-browser` | never                                                      |
| fathom                | yes, with and without `value`                        | fathom-client 3.7.2 with Fathom's script                                   | yes, the installed client in jsdom                                               | yes                                 | never                                                      |
| vercel                | yes, default and eight properties                    | `@vercel/analytics` 2.0.1                                                  | yes, the installed package in jsdom after `inject`                               | yes                                 | never                                                      |
| http                  | yes                                                  | an in-process fake `request`                                               | not applicable: there is no SDK                                                  | none: there is no SDK               | never; no request leaves this repository                   |

## SDK behavior the adapters rely on

These were confirmed by reading the installed SDK's own source, not only its documentation, because a fake can only be as honest as what it is modeled on:

- Amplitude's browser and React Native SDKs strip a call's `extra` before upload (`analytics-core`'s destination plugin), which the plugin relies on to hold no state of its own; the real-SDK tests pin it.
- posthog-js cuts every string it sends, the event name included, through `_copyAndTruncateStrings` in `@posthog/browser-common`, at `properties_string_max_length`.
- gtag.js reorders identity changes ahead of events queued before them only when the Firebase SDK has replaced `window.gtag` with its own wrapper; plain gtag.js keeps call order, which is why only the Firebase adapter needs an ordering barrier.
- React Native Firebase's native bridges coerce seven parameter names to whole numbers and `success` to `1` or `0` before the native SDK sees them.
- Mixpanel's Node client mutates the object `track` is given, so the adapter always sends a fresh one, and its profile requests arrive in the order they were made, one answered before the next is sent.
- posthog-node's `withContext` fills a distinct id that an explicit one always wins over, which is why the adapter always passes one.

Reading source is weaker than running it: a fake can share its author's misreading of the SDK. Where a claim about a provider's own script, such as gtag.js's control field list, could not be pinned by an installed package, it was probed once in jsdom and dated in that adapter's README, not proven by a test that runs on every `pnpm check`.

## Hydration

Every binding's status readers read `idle` on the server and until the component is mounted, so server markup and the first client render agree; `useConsent` reads `unknown` for every purpose the same way. React and Vue hydrate real server markup in a test and assert there is no mismatch. Solid and Svelte pin the two halves separately, one test for what the server renders and one for the first client value, because their test setups compile a component for one side only.

## What none of this proves

- No adapter has been run against its provider's real backend from this repository. What a provider's servers keep, merge, deduplicate or refuse past a documented limit is outside what any test here can observe.
- Nothing has run on an iOS or Android device, in a simulator, in Hermes or in Expo. Every React Native claim rests on a fake typechecked against the real SDK's declarations, or on reading that SDK's source.
- Only the example application has run in a real browser, in Chromium, over simulated provider SDKs; the devtools' resizing and pointer dragging have not been exercised in a browser at all.
- No binding has run inside its meta-framework: Next.js, Nuxt, SolidStart or SvelteKit.
- Heap and Umami publish no npm package for the browser, so neither has a real-SDK test or a typecheck contract against Heap's; the fakes are modeled on their CDN bundles read on the date each README states.
- gtag.js is a script Google serves, not a package this repository installs; its documented and observed behavior is probed once outside the package, not re-verified on every run.
- The HTTP adapter has never sent a request over a real network from this repository.

## Checking it yourself

```sh
pnpm install
pnpm check
pnpm check:release
pnpm test:examples
```

The first command builds the packages and runs formatting, types, lint and the unit tests. The second adds the documentation checks, the packed-consumer check, the release metadata check and mutation testing. The third builds the packages and runs the examples' browser tests in Chromium through Playwright.
