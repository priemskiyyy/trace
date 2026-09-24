---
description: "Short recipes with Trace's public API: tracking in handlers, keeping provider SDKs out of application code, screen views, a consent banner, revenue and migrating from direct provider calls."
---

# Recipes

Short answers to common tasks. Each one uses only the public API.

## Track in handlers, never in render

Wrap the side effect so a component's own logic stays free of tracking calls, and the wrapper is the one place that can track:

```ts
declare const submitOrder: () => void;

export const withTracking =
  <TArgs extends unknown[]>(
    action: (...args: TArgs) => void,
    track: () => void,
  ) =>
  (...args: TArgs) => {
    action(...args);
    track();
  };

const handleCheckoutPress = withTracking(
  () => submitOrder(),
  () =>
    trace.track("Checkout Started", {
      cart: { id: "cart_1" },
      value: 49.5,
      currency: "EUR",
    }),
);
```

`action` runs first, so tracking never masks a thrown error from the real handler. See [where to track](tracking.md#where-to-track).

## Keep provider SDKs out of application code

Only the module that builds your Trace should import a provider SDK. An ESLint rule catches an import that leaks past it:

```js
{
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            group: ["posthog-js", "mixpanel-browser", "@amplitude/analytics-browser", "@segment/analytics-next"],
            message: "Call the provider through a Trace destination, not directly. Use useTrace() or trace.track().",
          },
        ],
      },
    ],
  },
}
```

Everywhere else, `useTrace()` (or the equivalent for your framework) is the only thing application code calls. Reaching a provider's own features Trace does not wrap still goes through `trace.destination(name).native`, one narrow escape hatch instead of a second import path; see [native provider access](native-access.md).

## Screen views

There is no hook or adapter method that tracks on navigation, on any platform. Track from your router's own listener:

```ts
import { Trace, event } from "@priemskiyyy/trace";
import { console } from "@priemskiyyy/trace-console";

const trace = new Trace({
  events: { "Screen Viewed": event<{ path: string }>() },
  destinations: { console: console() },
});

declare const router: {
  subscribe: (listener: (location: { pathname: string }) => void) => () => void;
};

const stopListening = router.subscribe((location) => {
  trace.track("Screen Viewed", { path: location.pathname });
});
```

On the web, subscribe to your router (a Next.js `usePathname` effect, a React Router `useLocation` listener) outside any component's render. On React Native, see [React Native and Expo](react-native.md#screen-views).

## A consent banner

Route the gated destination only behind the purpose it needs, gate the SDK's own collection the same way at start, and show the banner while the decision is `unknown`:

```ts
declare const showConsentBanner: (options: {
  onAccept: () => void;
  onDecline: () => void;
}) => void;

if (trace.consent.get().analytics === "unknown") {
  showConsentBanner({
    onAccept: () => trace.consent.set({ analytics: "granted" }),
    onDecline: () => trace.consent.set({ analytics: "denied" }),
  });
}
```

Persisting the visitor's choice and restoring it before `trace.start()` is your application's job; Trace never stores a decision. See [consent](consent.md).

## Revenue

There is no dedicated revenue call: send it as properties on the event that carries it, typed once in your registry:

```ts
import { Trace, event } from "@priemskiyyy/trace";
import { console } from "@priemskiyyy/trace-console";

const trace = new Trace({
  events: {
    "Order Completed": event<{
      orderId: string;
      total: number;
      currency: "EUR" | "USD";
      lines: { sku: string; name: string; price: number; quantity: number }[];
    }>(),
  },
  destinations: { console: console() },
});

trace.track("Order Completed", {
  orderId: "order_42",
  total: 129.5,
  currency: "EUR",
  lines: [{ sku: "sku_1", name: "Tee", price: 49.5, quantity: 1 }],
});
```

A provider with ecommerce reporting reads it from its own mapping: GA4 and Firebase take `lines` as `items` in a `ga4()` mapping (see [Google Analytics and Firebase](adapters/google-analytics.md)); every other provider takes `total` and `currency` as plain properties.

## Server-side tracking per request

Build one Trace per request over a shared SDK client, gate its consent, track, then flush before the response or the process ends. See [servers and serverless](servers.md) for the full pattern and the per-provider flush rules.

## Migrating from direct provider calls

Replace one provider call with one typed `track`, routed to every destination configured for that event:

```ts
declare const posthogJs: {
  capture: (name: string, properties: Record<string, unknown>) => void;
};
declare const cart: { id: string; total: number };

// Before: the component calls PostHog directly.
posthogJs.capture("checkout_started", { cart_id: cart.id });

// After: one call, typed against the registry, routed by configuration.
trace.track("Checkout Started", {
  cart: { id: cart.id },
  value: cart.total,
  currency: "EUR",
});
```

For a generated Ampli wrapper, `fromAmpli` declares your registry straight from the generated classes, so a call that used to read `ampli.checkoutStarted({ cartId })` becomes `trace.track("Checkout Started", { cartId })` with the same properties; see [Amplitude and Ampli](adapters/amplitude.md). Migrate one event at a time: an event not yet moved keeps calling the SDK directly, outside Trace's consent, privacy and receipts, until it is.
