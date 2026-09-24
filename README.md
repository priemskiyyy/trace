# Trace

**Typed, provider-independent product analytics for TypeScript.**

Track events through one small API. Configuration decides whether they go to Amplitude, PostHog, Mixpanel, Segment, Google Analytics, Firebase, your own backend, the console, or several of them at once.

```ts
import { event, Trace } from "@priemskiyyy/trace";
import { console } from "@priemskiyyy/trace-console";
import { posthog } from "@priemskiyyy/trace-posthog";
import posthogJs from "posthog-js";

posthogJs.init("phc_project_api_key");

export const trace = new Trace({
  events: {
    "Checkout Started": event<{ cart: { id: string }; value: number }>(),
  },
  destinations: {
    research: posthog({ sdk: posthogJs }),
    debug: console(),
  },
});

trace.start();
trace.track("Checkout Started", { cart: { id: "cart_1" }, value: 49.5 });
```

## Why not call the provider SDK directly

Renaming `analytics.track` would not be worth a library. Trace owns what surrounds the call:

- **Typed events.** One registry declares every event and its properties, optionally with a Standard Schema validator. A misspelled name or a missing property is a compile error, and an event its schema refuses is dropped before any provider sees it.
- **Identity.** Changing the user starts a new identity generation. An event keeps the user it was tracked with, a provider that holds a user is reset before the next one is identified, and what the previous user left waiting is dropped instead of sent under the next one.
- **Consent.** Purposes gate destinations. A gated destination receives nothing until every purpose it needs is granted, and where its SDK has a reversible switch, its own collection is off while they are not.
- **Privacy first.** Redaction and size limits run before anything is kept, buffered, observed or sent.
- **Typed routing.** Destinations have typed names, one event can go to several providers, and one destination's failure never affects another.
- **Honest receipts.** Every event answers what happened at each destination, and on what evidence.
- **No lock-in, no bundling.** Adapters import no provider SDK. You pass in the one you already use.

Trace guarantees how an event is declared, validated, sanitized, given its identity, gated by consent, routed and handed to each destination. It does not claim that a provider stored, processed or displayed an event, unless that destination gives evidence for that exact boundary.

## What Trace is not

Trace is not a tag manager, a customer data platform, a consent management platform or an SDK loader. It never initializes, configures or closes a provider SDK: your application does, and Trace only calls it. Autocapture, page views, session replay, feature flags and dashboards stay with your provider, outside Trace's consent, privacy and receipts. Trace does not batch, retry or store events offline either; the SDKs do that, and your own client does it for your backend.

## Packages

| Package                                                                               | What it is                                             |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| [`@priemskiyyy/trace`](packages/core)                                                 | The runtime, the mock adapter and the adapter test kit |
| [`@priemskiyyy/trace-react`](packages/react)                                          | Provider, status hooks and consent                     |
| [`@priemskiyyy/trace-vue`](packages/vue)                                              | The same for Vue                                       |
| [`@priemskiyyy/trace-solid`](packages/solid)                                          | The same for Solid                                     |
| [`@priemskiyyy/trace-svelte`](packages/svelte)                                        | The same for Svelte 5                                  |
| [`@priemskiyyy/trace-devtools`](packages/devtools)                                    | In-page inspector, with a wrapper for each binding     |
| [`@priemskiyyy/trace-ampli`](packages/adapters/ampli)                                 | Amplitude, from a generated Ampli wrapper              |
| [`@priemskiyyy/trace-amplitude`](packages/adapters/amplitude)                         | Amplitude, browser and React Native                    |
| [`@priemskiyyy/trace-amplitude-node`](packages/adapters/amplitude-node)               | Amplitude, server                                      |
| [`@priemskiyyy/trace-posthog`](packages/adapters/posthog)                             | PostHog, browser                                       |
| [`@priemskiyyy/trace-posthog-node`](packages/adapters/posthog-node)                   | PostHog, server                                        |
| [`@priemskiyyy/trace-posthog-react-native`](packages/adapters/posthog-react-native)   | PostHog, React Native                                  |
| [`@priemskiyyy/trace-mixpanel`](packages/adapters/mixpanel)                           | Mixpanel, browser                                      |
| [`@priemskiyyy/trace-mixpanel-node`](packages/adapters/mixpanel-node)                 | Mixpanel, server                                       |
| [`@priemskiyyy/trace-mixpanel-react-native`](packages/adapters/mixpanel-react-native) | Mixpanel, React Native                                 |
| [`@priemskiyyy/trace-segment`](packages/adapters/segment)                             | Segment, browser                                       |
| [`@priemskiyyy/trace-segment-node`](packages/adapters/segment-node)                   | Segment, server                                        |
| [`@priemskiyyy/trace-segment-react-native`](packages/adapters/segment-react-native)   | Segment, React Native                                  |
| [`@priemskiyyy/trace-rudderstack`](packages/adapters/rudderstack)                     | RudderStack, browser                                   |
| [`@priemskiyyy/trace-google-analytics`](packages/adapters/google-analytics)           | Google Analytics 4, browser                            |
| [`@priemskiyyy/trace-firebase`](packages/adapters/firebase)                           | Firebase Analytics, browser                            |
| [`@priemskiyyy/trace-firebase-react-native`](packages/adapters/firebase-react-native) | Firebase Analytics, React Native                       |
| [`@priemskiyyy/trace-heap`](packages/adapters/heap)                                   | Heap, browser                                          |
| [`@priemskiyyy/trace-plausible`](packages/adapters/plausible)                         | Plausible, browser                                     |
| [`@priemskiyyy/trace-umami`](packages/adapters/umami)                                 | Umami, browser                                         |
| [`@priemskiyyy/trace-fathom`](packages/adapters/fathom)                               | Fathom, browser                                        |
| [`@priemskiyyy/trace-vercel`](packages/adapters/vercel)                               | Vercel Web Analytics, browser                          |
| [`@priemskiyyy/trace-console`](packages/adapters/console)                             | The console, for development                           |
| [`@priemskiyyy/trace-http`](packages/adapters/http)                                   | Your own backend                                       |

Every package is ESM only, side-effect free and typed. The core has no dependencies.

## Documentation

- [What Trace is](docs/index.md), [getting started](docs/getting-started.md), [installation](docs/installation.md), [the mental model](docs/mental-model.md) and [configuration](docs/configuration.md)
- [Events and schemas](docs/events.md), [tracking and receipts](docs/tracking.md), [users and account switching](docs/users.md), [groups](docs/groups.md), [context and scopes](docs/context-and-scopes.md), [consent](docs/consent.md), [privacy and redaction](docs/privacy.md), [routing](docs/routing.md)
- [Receipts and evidence](docs/receipts.md), [flush and lifecycle](docs/flush.md)
- [Choose an adapter](docs/adapters.md), [the HTTP backend contract](docs/http-backend.md) and [provider limitations](docs/provider-limitations.md)
- [React](docs/react.md), [Vue](docs/vue.md), [Solid](docs/solid.md), [Svelte](docs/svelte.md), [React Native and Expo](docs/react-native.md), [servers](docs/servers.md), [server rendering](docs/server-rendering.md)
- [Diagnostics and devtools](docs/devtools.md), [application testing](docs/testing.md), [recipes](docs/recipes.md), [verification matrix](docs/verification.md), [troubleshooting](docs/troubleshooting.md)
- [API reference](docs/api.md), [writing an adapter](docs/writing-an-adapter.md) and the [runtime architecture](docs/internals/architecture.md)

[Boutique](docs/examples.md), a small shop built for every binding, shows where each event goes and needs no provider account.

## Status

Nothing is published yet, and the API may still change before the first release.

The adapters are tested against fakes that are typechecked against the real provider SDKs. None has been run against a provider's real backend or on a device from this repository. The [verification matrix](docs/verification.md) says exactly what has been exercised and what has not.

## Development

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm check:release
```

`pnpm check` builds every package, then runs the TypeScript, ESLint and Prettier checks and the unit tests. `pnpm check:release` adds the documentation checks and installs the packed tarballs into a clean consumer. See [CONTRIBUTING.md](CONTRIBUTING.md) for the layout and the code rules, [SUPPORT.md](SUPPORT.md) for what a bug report needs, and [RELEASING.md](RELEASING.md) for publication.

## License

[MIT](LICENSE)
