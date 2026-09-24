# Boutique on Expo

The Boutique shop from the [React example](../react/README.md), rebuilt on
React Native with [`@priemskiyyy/trace-react`](../../packages/react), the
same provider and hooks the web binding uses: there is no separate React
Native binding to install. It reports through four destinations at once
(PostHog, Firebase, Mixpanel and Segment) over simulated SDKs from
`example-shared`, and flushes when the app goes to the background.

```sh
pnpm install
pnpm --filter example-expo dev
```

The packages are linked from the workspace, so build them first. The
boundary file is `src/trace/createBoutiqueTrace.ts`: everything above it is
Boutique's own domain and simulated SDKs, and everything it constructs is
real Trace and adapter code.

`src/types/Register.d.ts` registers Boutique's Trace once, and
`Application.tsx` puts it in a `<TraceProvider>`. From there every component
reads it with `useTrace` and `useConsent`, typed with the events, destinations
and purposes the registration carries. Add a product to your cart and check
out: the receipt lists every destination, its evidence and its losses.
Decline consent first and none of the four receive anything; accept it and
all four open.

## How it fits together

| File                                       | Role                                                                                                                             |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `index.tsx`                                | Starts Boutique once, flushes on `AppState` background, and retries `trace.start()` once Segment's client reports it is running. |
| `src/utils/startBoutique.ts`               | Creates the four simulated SDKs and Boutique's Trace, then starts it.                                                            |
| `src/trace/createBoutiqueTrace.ts`         | The boundary file: every destination, consent and the timeout.                                                                   |
| `src/hooks/useObservable.ts`               | Reads one of the core's own `ObservableValue`s (the cart, a receipt) as state.                                                   |
| `src/components/Shop/`                     | The catalog and the cart, in React Native's own primitives.                                                                      |
| `src/components/Consent/ConsentBanner.tsx` | Accepts or declines the `analytics` purpose.                                                                                     |
| `../shared/formatting/formatOutcome.ts`    | A destination's outcome in plain words; `submitted` never claims delivery.                                                       |

This example has no accounts, teams, lab, timeline or devtools: see the React
tour for those, and Vue, Solid and Svelte for the same shop on the web.
Segment's client is not ready when it is created, so `trace.start()` fails
once and `index.tsx` starts it again from `client.running.onChange`, the way
[`@priemskiyyy/trace-segment-react-native`](../../packages/adapters/segment-react-native)'s
README describes.

## Tests

None: Expo is typechecked and bundled for web in `check:release`
(`pnpm --filter example-expo build`), never run on a device or in `pnpm check`.
`build:native` bundles iOS and Android too, for `check:release` alone.
