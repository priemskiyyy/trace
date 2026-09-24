# Boutique on Svelte

The Boutique shop from the [React example](../react/README.md), rebuilt with
[`@priemskiyyy/trace-svelte`](../../packages/svelte). It reports through the
same six destinations at once (Amplitude, PostHog, Mixpanel, Google
Analytics, Segment and its own API) over the same simulated SDKs and backend
from `example-shared`, with a provider, a status badge, the consent banner,
the shop and the devtools in Svelte's own idiom.

```sh
pnpm install
pnpm build
pnpm --filter example-svelte dev
```

The packages are linked from the workspace, so build them first. The
boundary file is `src/trace/createBoutiqueTrace.ts`: everything above it is
Boutique's own domain and simulated SDKs, and everything it constructs is
real Trace and adapter code.

`src/types/Register.d.ts` registers Boutique's Trace once, and
`Application.svelte` puts it in a `<TraceProvider trace={runtime.trace}>`.
From there every component reads it with `useTrace`, `useTraceStatus` and
`useConsent`, typed with the events, destinations and purposes the
registration carries. Add the Suede Boots to your cart and check out: the
receipt beside it lists every destination, its evidence and its losses.
Decline consent first and only your own API receives the event; accept it
and the other five open too.

`createDevtools()` is a plain function, not a component, so
`src/components/Devtools/TraceDevtoolsHost.svelte` is a small dedicated
child rendered inside the provider: calling it directly in `Application`'s
own script would run before the provider's context exists.
`ReceiptPanel` remounts `LatestReceipt` inside a `{#key tracked.receipt.id}`
block, so a second checkout observes its own receipt's status instead of the
first one's: Svelte components run their script once, not once per prop
change.

## How it fits together

| File                                          | Role                                                                                                                        |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `src/main.ts`                                 | Starts Boutique once, outside Svelte, mounts the app, and disposes it when the page goes away.                              |
| `src/utils/startBoutique.ts`                  | Creates the backend, the SDKs and Boutique's Trace, then starts it.                                                         |
| `src/trace/createBoutiqueTrace.ts`            | The boundary file: every destination, the Zod schema for traits and group traits, consent and the timeout.                  |
| `src/utilities/useObservable.svelte.ts`       | Reads one of the core's own `ObservableValue`s (the cart, a receipt) through `current`, for state this example owns itself. |
| `src/components/Shop/`                        | The catalog, the cart and the latest receipt's destination list.                                                            |
| `src/components/Consent/ConsentBanner.svelte` | Accepts or declines the `analytics` purpose.                                                                                |
| `../shared/formatting/formatOutcome.ts`       | A destination's outcome in plain words; `submitted` never claims delivery.                                                  |
| `src/Application.test.ts`                     | The checkout and consent flows driven through the rendered page.                                                            |

Styling is Tailwind with the `class-variance-authority` recipes in
`../shared/ui/`, shared with every other Boutique example. This example has
no accounts, teams, lab or timeline: see the React tour for those.

## Tests

`pnpm vitest run --project example-svelte` runs this example's tests in
jsdom against the built packages. `pnpm test:examples` builds the packages
and drives the built page in Chromium with Playwright
(`../frameworks.spec.ts`), alongside the Vue and Solid examples.
