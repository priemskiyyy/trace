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

The React example walks through six sections, each with a "Try this" hint:

1. **Browse and check out.** Every event is declared once and typed. Each checkout answers a receipt with an outcome for every destination, its evidence and anything the provider could not carry.
2. **Accounts.** Sign in, switch accounts and sign out, and the timeline shows that no event of one account reached another.
3. **Teams.** Join a team, switch to another and leave it.
4. **Consent.** The banner asks for purposes. Nothing reaches a gated destination while its purposes are unknown, and each simulated SDK with a switch has its own collection switched off and on.
5. **Break the destinations.** Make a provider slow, take it offline, start it uninitialized and retry, make it filter events, or slow the HTTP backend past the timeout, and read what each receipt says.
6. **Watch it happen.** The timeline is Trace's diagnostics stream, in words, and the [devtools](devtools.md) are mounted over the same runtime.

## Tests

`pnpm test:unit` runs the examples' tests with the rest of the workspace. The React example's drive each flow of the tour through its buttons in jsdom, and the server example's call its endpoint.

`pnpm test:examples` builds the packages and drives the built pages in Chromium with Playwright, at 375 and 1280 pixels wide: one flow per section, with no page errors and no horizontal scroll, and the devtools listing every destination. It is not part of `pnpm check`. The Expo example is typechecked and bundled by `pnpm check:release`, and it has not run on a device.
