# Boutique, a Trace example

Boutique is a small shop that reports through [Trace](../../README.md) to six destinations at once: Amplitude, PostHog, Mixpanel, Google Analytics, Segment and its own API. Every destination is a real Trace adapter; the SDKs and the backend behind them are simulated in the page. Nothing leaves your browser, and no provider account is needed.

```sh
pnpm install
pnpm build
pnpm --filter example-react dev
```

The packages are linked from the workspace, so build them first. The boundary file is `src/trace/createBoutiqueTrace.ts`: everything above it is Boutique's own domain and simulated SDKs, and everything it constructs is real Trace and adapter code.

## The tour

The page walks through six sections, each with a "Try this" hint:

1. **Browse and check out.** Add a product to the cart and check out. `Checkout Started` and `Checkout Completed` are typed events, the second validated by a Zod schema; its payment card token is redacted by Trace's default privacy before any destination sees it, and its gift note is long enough to be truncated. The receipt beside the cart lists every destination, its evidence and its losses.
2. **Accounts.** Sign in as Nora Fields, check out, then switch to Isabella Cruz. The account timeline keeps Nora's event under Nora's name: switching accounts never rewrites what already happened.
3. **Teams.** Join the Night Market Crew, switch to the Boardwalk Regulars, or leave. Segment carries the membership as its one group; leaving is refused there as unsupported, because Segment has no call to leave a group.
4. **Consent.** While the banner's decision is unknown, Amplitude, PostHog, Mixpanel, Google Analytics and Segment receive nothing; Boutique's own API always does, because the `consent` option never names it. Accepting opens the other five, each through its own switch, shown live in the collection panel.
5. **Break the destinations.** Slow Boutique's own API past its three second timeout and its outcome turns unconfirmed rather than failed. Take it offline and only its outcome fails. Make PostHog's own filters drop every event, or turn Segment uninitialized and watch its events wait until Retry start opens it again.
6. **Watch it happen.** The timeline is Trace's diagnostics stream, in words: destinations opening, events accepted and each answer, never an event's values. The Trace devtools are mounted in the corner over the same runtime.

**Reset demo** in the header starts over.

## How it fits together

| File                                             | Role                                                                                                                             |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `src/main.tsx`                                   | Starts Boutique once, outside React, and renders it.                                                                             |
| `src/utils/startBoutique.ts`                     | Creates the backend, the SDKs, Boutique's Trace and its receipt and timeline logs, then starts it.                               |
| `src/trace/createBoutiqueTrace.ts`               | The boundary file: every destination, the Zod schema for traits and group traits, consent and the timeout.                       |
| `../shared/backend/createOrdersBackend.ts`       | Boutique's own API and its client: latency, an outage, a single failure, and the network log.                                    |
| `../shared/simulated/`                           | The simulated Amplitude, PostHog, Mixpanel, Google Analytics and Segment SDKs, each typed `satisfies` its adapter's own `*Like`. |
| `src/utils/switchAccount.ts`                     | What the app does on sign-in, a switch or a sign-out: one `trace.user()` call.                                                   |
| `src/components/Shop/`                           | The catalog, the cart and the latest receipt's detail.                                                                           |
| `src/components/Accounts/`, `Teams/`, `Consent/` | Signing in, joining a crew and the consent banner.                                                                               |
| `src/components/Lab/`                            | Breaking a destination, and every destination's own status.                                                                      |
| `src/components/Timeline/`                       | Trace's diagnostics stream, read with `useSyncExternalStore`.                                                                    |
| `../shared/formatting/formatOutcome.ts`          | A destination's outcome in plain words; `submitted` never claims delivery.                                                       |
| `src/Application.test.tsx`                       | Every flow driven through the buttons, with a fresh runtime per test.                                                            |

Styling is Tailwind with a few `class-variance-authority` recipes in `../shared/ui/`, shared with every other Boutique example, and icons come from Phosphor, as in the sibling libraries' examples.

## Using a real provider

Swap a simulated SDK for the real one your application initializes, such as `posthog({ sdk: posthogJs })` after `posthogJs.init(...)`, and give the HTTP adapter a `request` over your own API client. Nothing else in the app changes.

## Tests

`pnpm test:unit` runs the example's tests in jsdom against the built packages. They start Boutique the way the page does and drive every flow through the buttons, with a fresh runtime per test: the same accepted event reaching every destination, redaction, account isolation, groups and Segment's refusal to leave one, consent gating five destinations and never the sixth, the lab's filters, outage, timeout and retry, and the timeline's wording.

`pnpm test:examples` builds the packages and drives the built page in Chromium with Playwright (`../boutique.spec.ts`). At 375 and 1280 px wide, a checkout settles with no page errors and no horizontal scroll; it also checks account isolation, a crew joined, consent gating, an offline outage, and that the devtools open and list all six destinations. It is not part of `pnpm check`.
