# Boutique, a Trace example

Boutique is a small shop that reports through [Trace](../../README.md) to six destinations at once: Amplitude, PostHog, Mixpanel, Google Analytics, Segment and its own API. Every destination is a real Trace adapter; the SDKs and the backend behind them are simulated in the page. Nothing leaves your browser, and no provider account is needed.

```sh
pnpm install
pnpm build
pnpm --filter example-react dev
```

The packages are linked from the workspace, so build them first. The boundary file is `../shared/boutique/reporting/createBoutiqueTrace.ts`: everything above it is Boutique's own domain and simulated SDKs, and everything it constructs is real Trace and adapter code.

## The tour

The page walks through five sections, each with a "Try this" hint:

1. **One checkout, six answers.** Boutique is one app: an account switcher, a crew picker, the consent banner, a search box, the products, the cart and a status bar read from Trace's diagnostics. Every search, view and checkout is one typed event, and the receipt beside the shop says what each destination did with it and on what evidence. `Checkout Completed` is validated by a Zod schema; its card token is redacted and its gift note truncated before any destination sees them, and the receipt lists both under "Removed before any destination saw it". A destination that consent held back says so.
2. **Every event keeps its shopper.** The receipts list keeps each event under the shopper it was tracked with. Sign in as Nora Fields and check out, then switch to Isabella Cruz: Nora's checkout still says Nora. Open a receipt for each destination's answer; the legend says what each outcome claims.
3. **Consent reaches every destination.** While the banner is unanswered, Amplitude, PostHog, Mixpanel, Google Analytics and Segment receive nothing; Boutique's own API always does, because the `consent` option never names it. Each destination card shows the decision and the SDK's own switch: Amplitude, PostHog, Mixpanel and Google Analytics turn their collection off and on, and Segment, which has no switch, is held at Trace's door. A crew shows on Segment's card as its one group; leaving is refused there as unsupported, because Segment has no call to leave a group.
4. **Break one destination.** Slow Boutique's own API past its three second timeout and its outcome turns unconfirmed rather than failed. Take it offline and only its outcome fails. Make PostHog's own filters drop every event. Stall Segment: Trace restarts while Segment is still loading, its events wait in the buffer until Retry start opens it, and a change of shopper drops what was waiting instead of sending it as the next shopper's.
5. **Watch it happen.** The timeline is Trace's diagnostics stream, in words: destinations opening, events accepted and each answer, never an event's values. The Trace devtools are mounted in the corner over the same runtime.

**Reset demo** in the header starts over.

## How it fits together

| File                                                    | Role                                                                                                        |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `src/main.tsx`                                          | Starts Boutique once, outside React, tracks the storefront opening and renders it.                          |
| `../shared/boutique/reporting/startBoutique.ts`         | Creates the backend, the SDKs and the first runtime, then starts it.                                        |
| `../shared/boutique/reporting/createBoutiqueRuntime.ts` | One Trace and what the page shows about it: its receipts and its timeline. A restart replaces it.           |
| `../shared/boutique/reporting/createBoutiqueTrace.ts`   | The boundary file: every destination, the Zod schema for traits and group traits, consent and the timeout.  |
| `../shared/backend/createOrdersBackend.ts`              | Boutique's own API and its client: latency, an outage, a single failure, and the network log.               |
| `../shared/simulated/`                                  | The simulated SDKs, each typed `satisfies` its adapter's own `*Like`.                                       |
| `../shared/boutique/reporting/switchAccount.ts`         | What the app does on sign-in, a switch or a sign-out: one `trace.user()` call. `switchCrew.ts` is its twin. |
| `src/components/Boutique/`                              | The shop: accounts, crews, the consent banner, search, products, the cart and the session status bar.       |
| `src/components/Receipt/`, `Receipts/`                  | The latest receipt, every receipt, and what each answer means.                                              |
| `src/components/Destinations/`                          | Every destination with its status, consent, own switch and the last event it received.                      |
| `src/components/Lab/`                                   | Breaking a destination, and the network log of your own API.                                                |
| `src/components/Timeline/`                              | Trace's diagnostics stream, read with `useSyncExternalStore`.                                               |
| `../shared/formatting/formatOutcome.ts`                 | A destination's outcome in plain words; `submitted` never claims delivery.                                  |
| `src/Application.test.tsx`                              | Every flow driven through the buttons, with a fresh runtime per test.                                       |

Styling is Tailwind with a few `class-variance-authority` recipes in `../shared/ui/`, shared with every other Boutique example, and icons come from Phosphor, as in the sibling libraries' examples.

## Using a real provider

Swap a simulated SDK for the real one your application initializes, such as `posthog({ sdk: posthogJs })` after `posthogJs.init(...)`, and give the HTTP adapter a `request` over your own API client. Nothing else in the app changes.

## Tests

`pnpm test:unit` runs the example's tests in jsdom against the built packages. They start Boutique the way the page does and drive every flow through the buttons, with a fresh runtime per test: the same accepted event reaching every destination, a receipt for every search and view, redaction, account isolation, groups and Segment's refusal to leave one, consent gating five destinations and never the sixth, every SDK switch following consent, the lab's filters, outage and timeout, a restart that keeps the shopper's choices, a waiting event dropped rather than sent as the next shopper's, and the timeline's wording.

`pnpm test:examples` builds the packages and drives the built page in Chromium with Playwright (`../boutique.spec.ts`). At 375 and 1280 px wide, a checkout settles with no page errors and no horizontal scroll; it also checks what Trace removed, account isolation, a crew joined, consent gating, an offline outage, a stalled Segment that delivers once its start is retried, and that the devtools open and list all six destinations. It is not part of `pnpm check`.
