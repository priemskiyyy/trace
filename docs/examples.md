---
description: "Boutique, a small shop with sign-in, a team plan and a consent banner, built for React, Vue, Solid, Svelte and Expo, with a Node server: six destinations, receipts, accounts, consent and a fault lab, all without an account."
---

<script setup>
import { withBase } from "vitepress";
</script>

# Example applications

Every example is the same product. Boutique is a small shop with sign-in, a team plan and a consent banner. Browse, check out, switch accounts or refuse consent, and follow each event: validated by its schema, redacted, filed under the right user, and settled with an outcome for each destination.

The destinations are real Trace adapters: Amplitude, PostHog, Mixpanel, Google Analytics and Segment over SDKs simulated in the page, and your API through `@priemskiyyy/trace-http` over an in-page backend. Nothing leaves your browser, and no provider account is needed.

## Run it

From the repository root:

```sh
pnpm install
pnpm build
pnpm dev
```

`pnpm dev` starts the React tour. The examples use the built packages, so build them first. <a :href="withBase('/demo/')" target="_blank" rel="noreferrer">The live demo</a> is the same React example, running entirely in the page.

## Six applications

| Example           | What it shows                                                                                                                                                                                |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `examples/react`  | The full tour below: typed events and receipts, accounts, teams, the consent banner, six destinations, a fault lab, a timeline and the devtools.                                             |
| `examples/vue`    | The shop with the provider, status, consent and the devtools, in Vue's idiom.                                                                                                                |
| `examples/solid`  | The same, in Solid's idiom.                                                                                                                                                                  |
| `examples/svelte` | The same, in Svelte's idiom.                                                                                                                                                                 |
| `examples/expo`   | The shop on React Native, over the React Native adapters and simulated SDKs, flushing when the app goes to the background.                                                                   |
| `examples/server` | A Node server that receives the HTTP destination's events, validates each with Zod, and forwards each request through a Trace of its own to simulated posthog-node and segment-node clients. |

The domain lives in `examples/shared`: the event registry with its Zod schemas, the catalog, the cart and the checkout, one simulated SDK per provider, typed by the adapter's own `*Like` type, the in-page backend and the lab. Each web example is its own workspace package, so `pnpm --filter example-vue dev` starts the Vue shop, and so on.

## The tour

The React example walks through five sections, each with a "Try this" hint:

1. **One checkout, six answers.** Every search, view and checkout is one typed event, and its receipt answers an outcome for every destination, its evidence, what Trace removed before any destination saw it, and anything a provider could not carry.
2. **Every event keeps its shopper.** Sign in, switch accounts and sign out: every receipt stays under the shopper it was tracked with, and a legend says what each outcome claims.
3. **Consent reaches every destination.** Nothing reaches a gated destination while its purposes are unknown, each simulated SDK with a switch turns its own collection off and on, and Segment, which has none, is held at Trace's door. A crew joined shows on Segment's card as its group.
4. **Break one destination.** Slow your API past the timeout, take it offline, make PostHog filter every event, or stall Segment and retry its start, and read what each receipt says. Only the broken destination's answer changes.
5. **Watch it happen.** The timeline is Trace's diagnostics stream, in words, and the [devtools](devtools.md) are mounted over the same runtime.

## Tests

`pnpm test:unit` runs the examples' tests with the rest of the workspace. The React example's drive each flow of the tour through its buttons in jsdom, and the server example's call its endpoint.

`pnpm test:examples` builds the packages and drives the built pages in Chromium with Playwright, at 375 and 1280 pixels wide: one flow per section, with no page errors and no horizontal scroll, and the devtools listing every destination. It is not part of `pnpm check`. The Expo example is typechecked and bundled by `pnpm check:release`, and it has not run on a device.
