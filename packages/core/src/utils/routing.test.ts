import { expect, test, vi } from "vitest";

import { createMockAdapter } from "src/mock/createMockAdapter";
import type { Receipt } from "src/types/Receipt";
import type { TrackedEvent } from "src/types/TrackedEvent";
import { event } from "src/utils/event";
import { Trace } from "src/utils/Trace";

const events = {
  "App Opened": event(),
  "Checkout Started": event<{ value: number }>(),
};

const trio = () => {
  const product = createMockAdapter();
  const research = createMockAdapter();
  const backend = createMockAdapter();

  return {
    destinations: {
      product: product.adapter,
      research: research.adapter,
      backend: backend.adapter,
    },
    counts: () => ({
      product: product.sessions[0]?.events.length ?? 0,
      research: research.sessions[0]?.events.length ?? 0,
      backend: backend.sessions[0]?.events.length ?? 0,
    }),
  };
};

const getRoute = (receipt: Receipt) => {
  const status = receipt.status.get();

  return status.state === "dropped"
    ? status.reason
    : Object.keys(status.outcomes);
};

test("without defaults.to an event goes to every destination, in configured order", () => {
  const { destinations, counts } = trio();
  const trace = new Trace({ events, destinations });

  trace.start();

  expect(getRoute(trace.track("App Opened"))).toEqual([
    "product",
    "research",
    "backend",
  ]);
  expect(counts()).toEqual({ product: 1, research: 1, backend: 1 });
});

test("a defaults.to list selects where events go unless their own to says otherwise", () => {
  const { destinations, counts } = trio();

  const trace = new Trace({
    events,
    destinations,
    defaults: { to: ["product", "backend"] },
  });

  trace.start();
  trace.track("App Opened");

  expect(counts()).toEqual({ product: 1, research: 0, backend: 1 });
});

test("an event's own to replaces defaults.to and never merges with it", () => {
  const { destinations, counts } = trio();

  const trace = new Trace({
    events,
    destinations,
    defaults: { to: ["product", "backend"] },
  });

  trace.start();

  expect(
    getRoute(trace.track("App Opened", undefined, { to: ["research"] })),
  ).toEqual(["research"]);
  expect(counts()).toEqual({ product: 0, research: 1, backend: 0 });
});

test("a defaults.to function decides per event from the finished, frozen event", () => {
  const { destinations, counts } = trio();
  const seen: TrackedEvent[] = [];

  const trace = new Trace({
    events,
    destinations,
    defaults: {
      to: (tracked) => {
        seen.push(tracked);

        return tracked.name === "Checkout Started"
          ? ["product", "backend"]
          : ["product"];
      },
    },
  });

  trace.start();
  trace.track("App Opened");
  trace.track("Checkout Started", { value: 49 });

  expect(counts()).toEqual({ product: 2, research: 0, backend: 1 });
  expect(seen.map(({ name, properties }) => [name, properties])).toEqual([
    ["App Opened", {}],
    ["Checkout Started", { value: 49 }],
  ]);
  expect(Object.isFrozen(seen[1])).toBe(true);
});

test("a defaults.to function is not asked for an event whose own to decides", () => {
  const { destinations } = trio();
  const to = vi.fn((): "product"[] => ["product"]);
  const trace = new Trace({ events, destinations, defaults: { to } });

  trace.start();
  trace.track("App Opened", undefined, { to: ["research"] });

  expect(to).not.toHaveBeenCalled();
});

test("a defaults.to function that throws drops the event as not-routed", () => {
  const { destinations, counts } = trio();

  const trace = new Trace({
    events,
    destinations,
    defaults: {
      to: () => {
        throw new Error("routing exploded");
      },
    },
  });

  trace.start();

  expect(trace.track("App Opened").status.get()).toEqual({
    state: "dropped",
    reason: "not-routed",
  });
  expect(counts()).toEqual({ product: 0, research: 0, backend: 0 });
});

test("a defaults.to function that answers anything but a list drops the event as not-routed", () => {
  const { destinations } = trio();

  const trace = new Trace({
    events,
    destinations,
    // @ts-expect-error A JavaScript routing function can answer a single name.
    defaults: { to: () => "product" },
  });

  trace.start();

  expect(trace.track("App Opened").status.get()).toEqual({
    state: "dropped",
    reason: "not-routed",
  });
});

test("a name no destination has is ignored in an event's own to", () => {
  const { destinations, counts } = trio();
  const trace = new Trace({ events, destinations });

  trace.start();

  expect(
    getRoute(
      // @ts-expect-error A JavaScript caller can name a destination nobody configured.
      trace.track("App Opened", undefined, { to: ["warehouse", "backend"] }),
    ),
  ).toEqual(["backend"]);
  expect(
    // @ts-expect-error A JavaScript caller can name a destination nobody configured.
    getRoute(trace.track("App Opened", undefined, { to: ["warehouse"] })),
  ).toBe("not-routed");
  expect(counts()).toEqual({ product: 0, research: 0, backend: 1 });
});

test("a to that is not a list drops the event as not-routed", () => {
  const { destinations } = trio();
  const trace = new Trace({ events, destinations });

  trace.start();

  expect(
    // @ts-expect-error A JavaScript caller can pass one name instead of a list.
    getRoute(trace.track("App Opened", undefined, { to: "product" })),
  ).toBe("not-routed");
});

test("a to left null falls back to defaults.to", () => {
  const { destinations, counts } = trio();

  const trace = new Trace({
    events,
    destinations,
    defaults: { to: ["research"] },
  });

  trace.start();

  expect(
    // @ts-expect-error A JavaScript caller can pass a null route.
    getRoute(trace.track("App Opened", undefined, { to: null })),
  ).toEqual(["research"]);
  expect(counts()).toEqual({ product: 0, research: 1, backend: 0 });
});

test("a destination named twice receives the event once", () => {
  const { destinations, counts } = trio();
  const trace = new Trace({ events, destinations });

  trace.start();
  trace.track("App Opened", undefined, {
    to: ["backend", "product", "backend"],
  });

  expect(counts()).toEqual({ product: 1, research: 0, backend: 1 });
});

test("closed destinations are removed from the route, and a route that is all closed drops the event as consent", () => {
  const { destinations, counts } = trio();

  const trace = new Trace({
    events,
    destinations,
    defaults: { to: () => ["product", "research"] },
    consent: { product: ["analytics"], research: ["analytics"] },
  });

  trace.start();

  const closed = trace.track("App Opened");

  trace.consent.set({ analytics: "granted" });

  const open = trace.track("App Opened");

  expect(getRoute(closed)).toBe("consent");
  expect(getRoute(open)).toEqual(["product", "research"]);
  expect(
    getRoute(trace.track("App Opened", undefined, { to: ["backend"] })),
  ).toEqual(["backend"]);
  expect(counts()).toEqual({ product: 1, research: 1, backend: 1 });
});

test("a routing function that routes only to closed destinations drops the event as consent, not as not-routed", () => {
  const { destinations } = trio();

  const trace = new Trace({
    events,
    destinations,
    defaults: { to: () => ["product"] },
    consent: { product: ["analytics"] },
  });

  trace.start();

  expect(getRoute(trace.track("App Opened"))).toBe("consent");
});
