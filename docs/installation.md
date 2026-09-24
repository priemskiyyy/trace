---
description: "Every Trace package, what it needs, and which provider SDK versions each adapter is written against."
---

# Installation

Every package is ESM only, has no side effects on import, and ships its own type declarations. The core has no dependencies, and every other package names only peers.

```sh
pnpm add @priemskiyyy/trace
```

## Packages

| Package                                    | What it is                                                                              | Needs                                                                                                                    |
| ------------------------------------------ | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `@priemskiyyy/trace`                       | The runtime, plus `./mock` and `./testing`                                              | nothing, and `vitest` 4 for `./testing`                                                                                  |
| `@priemskiyyy/trace-react`                 | Provider and hooks for the Trace, its status, a destination's status and consent        | `react` 19.2 or newer                                                                                                    |
| `@priemskiyyy/trace-vue`                   | The same as composables                                                                 | `vue` 3.5 or newer                                                                                                       |
| `@priemskiyyy/trace-solid`                 | The same as primitives                                                                  | `solid-js` 1.9 or newer                                                                                                  |
| `@priemskiyyy/trace-svelte`                | The same as utilities                                                                   | `svelte` 5.7 or newer                                                                                                    |
| `@priemskiyyy/trace-devtools`              | The in-page inspector, plus wrappers under `./react`, `./vue`, `./solid` and `./svelte` | nothing, or the binding of the wrapper you use. The Svelte wrapper needs `svelte` 5.29                                   |
| `@priemskiyyy/trace-console`               | Prints events and identity calls, for development                                       | nothing                                                                                                                  |
| `@priemskiyyy/trace-http`                  | Sends events through your own client to your backend                                    | nothing                                                                                                                  |
| `@priemskiyyy/trace-amplitude`             | Amplitude, in the browser and on React Native                                           | `@amplitude/analytics-browser` 2.45 or newer within 2.x, or `@amplitude/analytics-react-native` 1.10 or newer within 1.x |
| `@priemskiyyy/trace-ampli`                 | Amplitude through the Ampli wrapper generated from your tracking plan                   | a browser wrapper from `ampli pull`, over `@amplitude/analytics-browser` 2.45 or newer within 2.x                        |
| `@priemskiyyy/trace-amplitude-node`        | Amplitude, on a server                                                                  | `@amplitude/analytics-node` 1.5 or newer within 1.x                                                                      |
| `@priemskiyyy/trace-posthog`               | PostHog, in the browser                                                                 | `posthog-js` 1.434 or newer within 1.x                                                                                   |
| `@priemskiyyy/trace-posthog-react-native`  | PostHog, on React Native                                                                | `posthog-react-native` 4.77 or newer within 4.x                                                                          |
| `@priemskiyyy/trace-posthog-node`          | PostHog, on a server                                                                    | `posthog-node` 5.52 or newer within 5.x                                                                                  |
| `@priemskiyyy/trace-mixpanel`              | Mixpanel, in the browser                                                                | `mixpanel-browser` 2.83 or newer within 2.x                                                                              |
| `@priemskiyyy/trace-mixpanel-react-native` | Mixpanel, on React Native                                                               | `mixpanel-react-native` 3.8 or newer within 3.x                                                                          |
| `@priemskiyyy/trace-mixpanel-node`         | Mixpanel, on a server                                                                   | `mixpanel` 0.24 or newer within 0.x                                                                                      |
| `@priemskiyyy/trace-segment`               | Segment, in the browser                                                                 | `@segment/analytics-next` 1.84 or newer within 1.x                                                                       |
| `@priemskiyyy/trace-segment-react-native`  | Segment, on React Native                                                                | `@segment/analytics-react-native` 2.24 or newer within 2.x                                                               |
| `@priemskiyyy/trace-segment-node`          | Segment, on a server                                                                    | `@segment/analytics-node` 3.1 or newer within 3.x                                                                        |
| `@priemskiyyy/trace-rudderstack`           | RudderStack, in the browser                                                             | `@rudderstack/analytics-js` 3.34 or newer within 3.x                                                                     |
| `@priemskiyyy/trace-google-analytics`      | Google Analytics 4, through the Google tag                                              | the Google tag on your page, and `@types/gtag.js` for its types                                                          |
| `@priemskiyyy/trace-firebase`              | Firebase Analytics, on the web                                                          | `firebase` 12.19 or newer within 12.x                                                                                    |
| `@priemskiyyy/trace-firebase-react-native` | Firebase Analytics, on React Native                                                     | `@react-native-firebase/analytics` 26.4 or newer within 26.x                                                             |
| `@priemskiyyy/trace-heap`                  | Heap, in the browser                                                                    | heap.js 5, which Heap's snippet loads                                                                                    |
| `@priemskiyyy/trace-plausible`             | Plausible, in the browser                                                               | `@plausible-analytics/tracker` 0.4 or newer within 0.x                                                                   |
| `@priemskiyyy/trace-umami`                 | Umami, in the browser                                                                   | the Umami tracker 3, which its script tag loads                                                                          |
| `@priemskiyyy/trace-fathom`                | Fathom, in the browser                                                                  | `fathom-client` 3.7 or newer within 3.x                                                                                  |
| `@priemskiyyy/trace-vercel`                | Vercel Web Analytics, in the browser                                                    | `@vercel/analytics` 2                                                                                                    |

Every package that builds on the core declares it as a peer dependency, so an application always has exactly one copy of it. See [choose an adapter](adapters.md) for what each provider can and cannot do.

## Provider SDKs are yours

An adapter never imports its provider SDK. You install the SDK your application already uses, initialize it, and pass it in:

```ts
import { posthog } from "@priemskiyyy/trace-posthog";
import posthogJs from "posthog-js";

posthogJs.init("phc_project_api_key", { api_host: "https://eu.i.posthog.com" });

const research = posthog({ sdk: posthogJs });
```

That is why the provider SDKs are optional peer dependencies, and why installing `@priemskiyyy/trace-posthog` in a web application never brings in `posthog-node` or `posthog-react-native`. A provider whose SDK has another API on React Native or on a server has a package of its own for it, whose factory keeps the provider's name. Amplitude's browser and React Native SDKs share their API, so one package serves both.

## Runtime requirements

The packages target ES2022 and the core uses no Node-only API, so it loads in browsers, in React Native with Hermes, in Node and in edge runtimes. Event ids use `crypto.randomUUID` where it exists and fall back to `Math.random` where it does not, as on Hermes: an id is an idempotency key, not a secret. Each adapter runs where its SDK runs, which its page states.

## Typed schemas

Validating event properties, traits and group traits needs a validator that implements [Standard Schema](https://standardschema.dev), such as Zod, Valibot or ArkType. The core depends on none of them, and without one an event is typed by a type argument alone. See [events and schemas](events.md).
