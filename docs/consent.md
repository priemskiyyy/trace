---
description: "Gate each destination behind consent purposes, set the visitor's decisions, and see what Trace drops, holds back and switches off while a purpose is not granted."
---

# Consent

```ts
import { Trace } from "@priemskiyyy/trace";
import { http } from "@priemskiyyy/trace-http";
import { mixpanel } from "@priemskiyyy/trace-mixpanel";
import { posthog } from "@priemskiyyy/trace-posthog";
import mixpanelBrowser from "mixpanel-browser";
import posthogJs from "posthog-js";

posthogJs.init("phc_project_api_key", {
  api_host: "https://eu.i.posthog.com",
  opt_out_capturing_by_default: true,
});

mixpanelBrowser.init("YOUR_PROJECT_TOKEN", {
  opt_out_tracking_by_default: true,
});

const trace = new Trace({
  events,
  destinations: {
    research: posthog({ sdk: posthogJs }),
    marketing: mixpanel({ sdk: mixpanelBrowser }),
    backend: http({ request: sendEvent }),
  },
  consent: { research: ["analytics"], marketing: ["analytics", "advertising"] },
});

trace.consent.set({ analytics: "granted", advertising: "denied" });
trace.start();
```

The `consent` option names the purposes each destination needs. Here PostHog needs `analytics`, Mixpanel needs `analytics` and `advertising`, and the backend, which the option does not name, is never gated. With these decisions PostHog receives events and Mixpanel does not. Each entry must be the destination's own list of purpose strings: one that is not, or one that names a destination you never configured, throws `TraceError` `INVALID_CONFIGURATION` from the constructor.

## Decisions

- Every purpose starts `unknown`. The purposes are typed from the `consent` option, so a misspelled purpose does not compile.
- `trace.consent.set(decisions)` changes the purposes it names and leaves the others. `trace.consent.get()` answers the current decisions, and `trace.consent.subscribe(listener)` hears each change once every destination has been told of it.
- A decision other than `unknown`, `granted` or `denied` is taken as `denied`, so it fails closed, and a purpose the option never named changes nothing. Both are reported in the `consent changed` diagnostic.
- Trace keeps no decision across page loads or app launches. Store the visitor's answer, or let your consent platform do it, and set it again before `trace.start()`, so a gated destination opens with the decision it will keep.

```ts
const stop = trace.consent.subscribe(() => {
  console.log(`analytics: ${trace.consent.get().analytics}`);
});

trace.consent.set({ analytics: "granted" });
```

The framework bindings read the decisions for you, such as `useConsent()` in [React](react.md).

## What a gate does

A destination is open while every purpose it needs is `granted`, and closed otherwise. Gating fails closed: `unknown` and `denied` close it.

| While a destination is closed              | Trace                                                                                                                    |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| an event is tracked                        | drops it for that destination at acceptance and holds nothing for it, so the receipt has no slot for that destination    |
| every destination it could reach is closed | drops the event as `consent` before it is validated, sanitized or kept, so it never reaches the `events` stream either   |
| the user or the traits change              | plans no identity step for it; the provider catches up when the destination opens again                                  |
| a purpose is revoked                       | drops what was waiting for that destination as `consent`, and switches the provider's own collection off                 |
| every purpose is granted                   | switches the provider's own collection on, then brings its identity up to date, and events tracked from then on reach it |

Consent is checked again right before each hand-off, so a revocation that lands between `track` and the hand-off wins. An event already handed to a provider is not recalled.

## The provider's own collection

An SDK can collect on its own before Trace starts and outside Trace's calls: page views, autocapture, sessions, lifecycle events. So initialize a consent-gated SDK opted out, and let Trace switch it where the adapter has a reversible `collection` switch:

- A gated destination that opens while its consent is closed gets `collection(false)` at once. One that opens while its consent is open gets `collection(true)` at once, because its SDK was initialized opted out.
- Closing a destination calls `collection(false)`, and opening it calls `collection(true)` before it plans the provider's identity again.
- A switch that answers a promise is awaited, bounded by `timeout`, before the destination plans or hands anything more to its provider. A switch that throws or rejects is recorded as the diagnostic `destination collection failed`, whenever it rejects, and the destination goes on. One that outlasts `timeout` releases the destination without a diagnostic, because the switch may still land, as a slow storage load makes PostHog's `optIn()` on React Native do.
- A destination the `consent` option does not name never receives `collection`, so an SDK you gate yourself stays yours to switch.

| Adapter                  | Its switch                                                                                   | Initialize it opted out with                                                                                                            |
| ------------------------ | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Amplitude                | `setOptOut`                                                                                  | `optOut: true` in the `init` options                                                                                                    |
| Ampli                    | `setOptOut` on the wrapper's client                                                          | `client: { configuration: { optOut: true } }` in `ampli.load`                                                                           |
| PostHog                  | `opt_in_capturing` and `opt_out_capturing`, without an `$opt_in` event                       | `opt_out_capturing_by_default: true`                                                                                                    |
| PostHog on React Native  | `optIn` and `optOut`                                                                         | `defaultOptIn: false` and `captureAppLifecycleEvents: false`                                                                            |
| Mixpanel                 | `opt_in_tracking` and `opt_out_tracking`, without deleting the profile or an `$opt_in` event | `opt_out_tracking_by_default: true`                                                                                                     |
| Segment on React Native  | `client.enabled`                                                                             | no opted-out start: keep `trackAppLifecycleEvents` and `trackDeepLinks` off, their defaults; the client keeps `enabled` across launches |
| Google Analytics         | the `ga-disable-<measurement id>` flag on `window`                                           | `window["ga-disable-<measurement id>"] = true` before the first `gtag` call                                                             |
| Firebase                 | `setAnalyticsCollectionEnabled`                                                              | `window["ga-disable-<measurement id>"] = true` before `getAnalytics`                                                                    |
| Firebase on React Native | `setAnalyticsCollectionEnabled`                                                              | `"analytics_auto_collection_enabled": false` in `firebase.json`                                                                         |

Every other adapter has no `collection`, because its SDK has no switch that Trace can turn off and on again without harm, such as one that deletes the profile or cannot be undone: Segment and RudderStack in the browser, Heap, Plausible, Umami, Fathom, Vercel and Mixpanel on React Native. The console and the HTTP destination have nothing to switch. For those, Trace's own gate is the whole gate: while consent is closed, Trace hands the provider nothing, and what the SDK collects by itself depends on how you load it, which its page describes. Trace never calls a provider's consent mode, such as Google's `gtag("consent", ...)`: that belongs to your consent platform.

## On a server

The server adapters, for PostHog, Segment, Mixpanel and Amplitude, have no `collection`. One client serves every request, so its switch would silence other visitors. Each per-request Trace gates its own destination instead: set that request's decisions with `trace.consent.set(...)` before `trace.start()`, and a destination whose purposes are not granted receives nothing from that Trace. See [servers and serverless](servers.md).

## Consent and identity

While a destination is closed, Trace sends its provider no identity step, and it brings the provider up to date when the destination opens again. A revocation that lands while a provider still has identity steps to run leaves its identity unknown, so the next grant resets the provider before identifying again. For an anonymous visitor, that reset starts a new device id. See [users and account switching](users.md#what-each-provider-receives).
