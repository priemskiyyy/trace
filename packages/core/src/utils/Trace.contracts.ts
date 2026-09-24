import { expectTypeOf } from "vitest";
import { z } from "zod";

import { createMockAdapter } from "src/mock/createMockAdapter";
import type { MockSession } from "src/mock/types/MockSession";
import type { AnalyticsAdapter } from "src/types/AnalyticsAdapter";
import type { ConsentDecision } from "src/types/ConsentDecision";
import type { Receipt } from "src/types/Receipt";
import type { TraceFlushResult } from "src/types/TraceFlushResult";
import type { TrackOptions } from "src/types/TrackOptions";
import { event } from "src/utils/event";
import { Trace } from "src/utils/Trace";

declare const productAdapter: AnalyticsAdapter<{ sdkVersion: string }>;

const events = {
  "App Opened": event(),
  "Search Performed": event<{ query: string }>(),
  "Checkout Started": event(
    z.object({
      cart: z.object({ id: z.string() }),
      value: z.number(),
      currency: z.enum(["EUR", "USD"]),
    }),
  ),
};

export const typed = new Trace({
  events,
  destinations: {
    product: productAdapter,
    research: createMockAdapter().adapter,
  },
  schema: {
    traits: { plan: z.enum(["free", "pro"]), seats: z.number() },
    groups: { workspace: { plan: z.string() } },
  },
  defaults: { to: ["product"], context: { app: { version: "2.4.0" } } },
  consent: { product: ["analytics"], research: ["analytics", "advertising"] },
});

typed.track("App Opened");
typed.track("Search Performed", { query: "shoes" });
typed.track("Checkout Started", {
  cart: { id: "c_1" },
  value: 49,
  currency: "EUR",
});
typed.track("App Opened", undefined, {
  to: ["research"],
  context: { screen: "home" },
  timestamp: 1_700_000_000_000,
});

// @ts-expect-error "Wishlist Shared" was never declared.
typed.track("Wishlist Shared");

// @ts-expect-error A query is a string.
typed.track("Search Performed", { query: 1 });

// @ts-expect-error Checkout Started requires its properties.
typed.track("Checkout Started");

typed.track("Checkout Started", {
  cart: { id: "c_1" },
  value: 49,
  // @ts-expect-error A currency is one the schema declares.
  currency: "GBP",
});

// @ts-expect-error App Opened takes no properties.
typed.track("App Opened", { screen: "home" });

expectTypeOf(typed.track<"App Opened">).parameters.toEqualTypeOf<
  [
    name: "App Opened",
    properties?: undefined,
    options?: TrackOptions<"product" | "research">,
  ]
>();
expectTypeOf(typed.track<"Search Performed">).parameters.toEqualTypeOf<
  [
    name: "Search Performed",
    properties: { query: string },
    options?: TrackOptions<"product" | "research">,
  ]
>();

// @ts-expect-error "warehouse" is not a configured destination.
typed.track("App Opened", undefined, { to: ["warehouse"] });

// @ts-expect-error "warehouse" is not a configured destination.
typed.destination("warehouse");

export const badDefaultsList = new Trace({
  events,
  destinations: { product: productAdapter },
  // @ts-expect-error A defaults.to list names only configured destinations.
  defaults: { to: ["warehouse"] },
});

export const badDefaultsFunction = new Trace({
  events,
  destinations: { product: productAdapter },
  // @ts-expect-error A defaults.to function answers only configured destinations.
  defaults: { to: () => ["warehouse"] },
});

export const badConsent = new Trace({
  events,
  destinations: { product: productAdapter },
  // @ts-expect-error consent names only configured destinations.
  consent: { warehouse: ["analytics"] },
});

expectTypeOf(typed.destination("product").native).toEqualTypeOf<{
  sdkVersion: string;
} | null>();
expectTypeOf(
  typed.destination("research").native,
).toEqualTypeOf<MockSession | null>();

export const wrongNative =
  // @ts-expect-error The mock's native handle has no sdkVersion.
  typed.destination("research").native?.sdkVersion;

expectTypeOf(typed.track("App Opened")).toEqualTypeOf<
  Receipt<"product" | "research">
>();
expectTypeOf(typed.flush).returns.resolves.toEqualTypeOf<
  TraceFlushResult<"product" | "research">
>();

typed.user({ id: "ada", traits: { plan: "pro", seats: 3 } });
typed.user(null);
typed.traits({ plan: null, seats: 5 });
typed.group("workspace", { id: "w_1", traits: { plan: "team" } });
typed.group("workspace", null);

// @ts-expect-error "enterprise" is not a declared plan.
typed.traits({ plan: "enterprise" });

// @ts-expect-error "role" is not a declared trait.
typed.traits({ role: "admin" });

// @ts-expect-error "team" is not a declared group type.
typed.group("team", { id: "t_1" });

// @ts-expect-error A workspace's plan is a string.
typed.group("workspace", { id: "w_1", traits: { plan: 3 } });

// @ts-expect-error A user needs an id.
typed.user({ traits: { plan: "pro" } });

typed.consent.set({ analytics: "granted", advertising: "denied" });

expectTypeOf(typed.consent.get()).toEqualTypeOf<
  Record<"analytics" | "advertising", ConsentDecision>
>();

// @ts-expect-error "marketing" is not a declared purpose.
typed.consent.set({ marketing: "granted" });

// @ts-expect-error A decision is unknown, granted or denied.
typed.consent.set({ analytics: "yes" });

typed.events.subscribe((tracked) => {
  if (tracked.name === "Search Performed") {
    expectTypeOf(tracked.properties).toEqualTypeOf<{ query: string }>();
  }
});

export const routed = new Trace({
  events,
  destinations: {
    product: productAdapter,
    backend: createMockAdapter().adapter,
  },
  defaults: {
    to: (tracked) =>
      tracked.name === "Checkout Started"
        ? ["product", "backend"]
        : ["product"],
  },
});

const scope = typed.scope({ context: { flow: "checkout" } });

scope.track("Search Performed", { query: "shoes" });

// @ts-expect-error A scope does not nest.
scope.scope({ context: {} });

// @ts-expect-error A scope holds no identity.
scope.user({ id: "ada" });

export const untyped = new Trace({
  events,
  destinations: { product: productAdapter },
});

untyped.traits({ anything: { goes: true } });
untyped.group("team", { id: "t_1", traits: { size: 3 } });
untyped.consent.set({ analytics: "granted" });

// @ts-expect-error Traits are a record, not a scalar.
untyped.traits("pro");
