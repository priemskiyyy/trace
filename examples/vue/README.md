# Boutique on Vue

The Boutique shop from the [React example](../react/README.md), rebuilt with
[`@priemskiyyy/trace-vue`](../../packages/vue). It reports through the same
six destinations at once (Amplitude, PostHog, Mixpanel, Google Analytics,
Segment and its own API) over the same simulated SDKs and backend from
`example-shared`, with a provider, a status badge, the consent banner, the
shop and the devtools in Vue's own idiom.

```sh
pnpm install
pnpm build
pnpm --filter example-vue dev
```

The packages are linked from the workspace, so build them first. The
boundary file is `src/trace/createBoutiqueTrace.ts`: everything above it is
Boutique's own domain and simulated SDKs, and everything it constructs is
real Trace and adapter code.

`src/types/Register.d.ts` registers Boutique's Trace once, and
`Application.vue` puts it in a `<TraceProvider>`. From there every component
reads it with `useTrace`, `useTraceStatus` and `useConsent`, typed with the
events, destinations and purposes the registration carries. Add the Suede
Boots to your cart and check out: the receipt beside it lists every
destination, its evidence and its losses. Decline consent first and only
your own API receives the event; accept it and the other five open too.

## How it fits together

| File                                       | Role                                                                                                               |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `src/main.ts`                              | Starts Boutique once, outside Vue, mounts the app and the devtools, and disposes both when the page goes away.     |
| `src/utils/startBoutique.ts`               | Creates the backend, the SDKs and Boutique's Trace, then starts it.                                                |
| `src/trace/createBoutiqueTrace.ts`         | The boundary file: every destination, the Zod schema for traits and group traits, consent and the timeout.         |
| `src/composables/useObservable.ts`         | Reads one of the core's own `ObservableValue`s (the cart, a receipt) as a ref, for state this example owns itself. |
| `src/components/Shop/`                     | The catalog, the cart and the latest receipt's destination list.                                                   |
| `src/components/Consent/ConsentBanner.vue` | Accepts or declines the `analytics` purpose.                                                                       |
| `../shared/formatting/formatOutcome.ts`    | A destination's outcome in plain words; `submitted` never claims delivery.                                         |
| `src/Application.test.ts`                  | The checkout and consent flows driven through the rendered page.                                                   |

Styling is Tailwind with the `class-variance-authority` recipes in
`../shared/ui/`, shared with every other Boutique example. This example has
no accounts, teams, lab or timeline: see the React tour for those.

## Tests

`pnpm vitest run --project example-vue` runs this example's tests in jsdom
against the built packages. `pnpm test:examples` builds the packages and
drives the built page in Chromium with Playwright (`../frameworks.spec.ts`),
alongside the Solid and Svelte examples.
