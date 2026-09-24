import { expect, test, vi } from "vitest";

import { createMockAdapter } from "src/mock/createMockAdapter";
import type { MockAdapterOptions } from "src/mock/types/MockAdapterOptions";
import type { MockSession } from "src/mock/types/MockSession";
import type { AnalyticsAdapter } from "src/types/AnalyticsAdapter";
import type { ConsentDecision } from "src/types/ConsentDecision";
import type { Receipt } from "src/types/Receipt";
import type { StandardSchema } from "src/types/StandardSchema";
import { event } from "src/utils/event";
import { Trace } from "src/utils/Trace";

const events = {
  "App Opened": event(),
  "Search Performed": event<{ query: string }>(),
};

const createLogged = (options: Pick<MockAdapterOptions, "onIdentity"> = {}) => {
  const log: string[] = [];

  const mock = createMockAdapter({
    onTrack: ({ event: tracked }) => {
      log.push(`track ${tracked.name}`);
    },
    onIdentity: (call) => {
      log.push(
        call.kind === "identify" ? `identify ${call.user.id}` : call.kind,
      );

      return options.onIdentity?.(call);
    },
  });

  const adapter: AnalyticsAdapter<MockSession> = {
    name: "logged",
    open: () => {
      const session = mock.adapter.open();
      const { collection } = session;

      return {
        ...session,
        collection: (enabled) => {
          log.push(`collection ${enabled}`);

          return collection?.(enabled);
        },
      };
    },
  };

  return { log, mock, adapter };
};

const getRoute = (receipt: Receipt) => {
  const status = receipt.status.get();

  return status.state === "dropped"
    ? status.reason
    : Object.keys(status.outcomes);
};

test("every purpose starts unknown, and the purposes are those the consent option names", () => {
  const trace = new Trace({
    events,
    destinations: {
      product: createMockAdapter().adapter,
      ads: createMockAdapter().adapter,
    },
    consent: { product: ["analytics"], ads: ["analytics", "advertising"] },
  });

  expect(trace.consent.get()).toEqual({
    analytics: "unknown",
    advertising: "unknown",
  });
  expect(Object.isFrozen(trace.consent.get())).toBe(true);
});

test("a destination is open while every purpose it needs is granted, and closed while any is unknown or denied", () => {
  const trace = new Trace({
    events,
    destinations: {
      product: createMockAdapter().adapter,
      ads: createMockAdapter().adapter,
    },
    consent: { product: ["analytics"], ads: ["analytics", "advertising"] },
  });

  trace.start();

  expect(getRoute(trace.track("App Opened"))).toBe("consent");

  trace.consent.set({ analytics: "granted" });

  expect(getRoute(trace.track("App Opened"))).toEqual(["product"]);

  trace.consent.set({ advertising: "granted" });

  expect(getRoute(trace.track("App Opened"))).toEqual(["product", "ads"]);

  trace.consent.set({ advertising: "denied" });

  expect(getRoute(trace.track("App Opened"))).toEqual(["product"]);

  trace.consent.set({ analytics: "unknown" });

  expect(getRoute(trace.track("App Opened"))).toBe("consent");
});

test("a destination the consent option does not name is never gated and never receives collection", () => {
  const research = createLogged();

  const trace = new Trace({
    events,
    destinations: {
      product: createMockAdapter().adapter,
      research: research.adapter,
    },
    consent: { product: ["analytics"] },
  });

  trace.start();

  expect(getRoute(trace.track("App Opened"))).toEqual(["research"]);

  trace.consent.set({ analytics: "granted" });
  trace.consent.set({ analytics: "denied" });

  expect(research.log).toEqual(["track App Opened"]);
});

test("while a destination is closed its events are dropped for it at acceptance and nothing is buffered for it", () => {
  const trace = new Trace({
    events,
    destinations: {
      product: createMockAdapter().adapter,
      research: createMockAdapter().adapter,
    },
    consent: { product: ["analytics"] },
  });

  const receipt = trace.track("App Opened");

  expect(receipt.status.get()).toEqual({
    state: "pending",
    outcomes: { research: null },
  });
  expect(
    trace.diagnostics
      .get()
      .destinations.map(({ name, buffered }) => [name, buffered]),
  ).toEqual([
    ["product", 0],
    ["research", 1],
  ]);
});

test("an event every destination refuses is dropped before it is validated, sanitized, stamped or retained, and never reaches the stream", () => {
  const validate = vi.fn((value: unknown) => ({ value }));

  const search: StandardSchema<{ query: string }> = {
    "~standard": {
      version: 1,
      vendor: "test",
      validate: (value) => {
        validate(value);

        return { value: { query: "shoes" } };
      },
    },
  };

  const redact = vi.fn(() => false);
  const now = vi.fn(() => 1_000);
  const streamed = vi.fn();

  const trace = new Trace({
    events: { "Search Performed": event(search) },
    destinations: { product: createMockAdapter().adapter },
    consent: { product: ["analytics"] },
    privacy: { redact },
    now,
  });

  trace.events.subscribe(streamed);
  trace.start();

  const receipt = trace.track(
    "Search Performed",
    { query: "shoes" },
    { context: { screen: "search" } },
  );

  expect(receipt.status.get()).toEqual({ state: "dropped", reason: "consent" });
  expect(validate).not.toHaveBeenCalled();
  expect(redact).not.toHaveBeenCalled();
  expect(now).not.toHaveBeenCalled();
  expect(streamed).not.toHaveBeenCalled();
  expect(trace.diagnostics.get()).toMatchObject({
    pendingReceipts: 0,
    destinations: [{ buffered: 0, inFlight: 0 }],
  });
});

test("a revocation between acceptance and handoff wins, and closing drops what waits and switches collection off", async () => {
  let release: () => void = () => {};

  const product = createLogged({
    onIdentity: (call) =>
      call.kind === "identify"
        ? new Promise<void>((resolve) => {
            release = resolve;
          })
        : undefined,
  });

  const trace = new Trace({
    events,
    destinations: { product: product.adapter },
    consent: { product: ["analytics"] },
  });

  trace.consent.set({ analytics: "granted" });
  trace.start();
  trace.user({ id: "ada" });

  const receipt = trace.track("App Opened");

  expect(receipt.status.get()).toEqual({
    state: "pending",
    outcomes: { product: null },
  });

  trace.consent.set({ analytics: "denied" });
  release();

  await expect(receipt.settled).resolves.toEqual({
    state: "settled",
    outcomes: { product: { status: "dropped", reason: "consent" } },
  });
  expect(product.log).toEqual([
    "collection true",
    "identify ada",
    "collection false",
  ]);
});

test("a gated destination switches collection at once when it opens: off while closed, on while open", () => {
  const closed = createLogged();
  const open = createLogged();

  const first = new Trace({
    events,
    destinations: { product: closed.adapter },
    consent: { product: ["analytics"] },
  });

  const second = new Trace({
    events,
    destinations: { product: open.adapter },
    consent: { product: ["analytics"] },
  });

  second.consent.set({ analytics: "granted" });
  first.start();
  second.start();

  expect(closed.log).toEqual(["collection false"]);
  expect(open.log).toEqual(["collection true"]);
});

test("opening a destination switches collection on and then plans against the current identity", () => {
  const product = createLogged();

  const trace = new Trace({
    events,
    destinations: { product: product.adapter },
    consent: { product: ["analytics"] },
  });

  trace.start();
  trace.user({ id: "ada" });

  expect(product.log).toEqual(["collection false"]);

  trace.consent.set({ analytics: "granted" });

  expect(product.log).toEqual([
    "collection false",
    "collection true",
    "identify ada",
  ]);
});

test("consent listeners hear about a change only after the destinations did", () => {
  const product = createLogged();

  const trace = new Trace({
    events,
    destinations: { product: product.adapter },
    consent: { product: ["analytics"] },
  });

  trace.start();
  trace.consent.subscribe(() => {
    if (trace.consent.get().analytics === "granted") {
      trace.track("App Opened");
    }
  });
  trace.consent.set({ analytics: "granted" });

  expect(product.log).toEqual([
    "collection false",
    "collection true",
    "track App Opened",
  ]);
});

test("a decision that is not unknown, granted or denied fails closed to denied and is reported", () => {
  const trace = new Trace({
    events,
    destinations: { product: createMockAdapter().adapter },
    consent: { product: ["analytics"] },
  });

  const recorded: unknown[] = [];

  trace.diagnostics.events.subscribe(({ type, source, context }) => {
    if (type === "consent changed") {
      recorded.push({ source, context });
    }
  });
  trace.consent.set({ analytics: "granted" });
  // @ts-expect-error A JavaScript caller can pass a decision the type does not allow.
  trace.consent.set({ analytics: "yes" });

  expect(trace.consent.get()).toEqual({ analytics: "denied" });
  expect(recorded).toEqual([
    {
      source: "consent",
      context: { decisions: { analytics: "granted" }, refused: [] },
    },
    {
      source: "consent",
      context: { decisions: { analytics: "denied" }, refused: ["analytics"] },
    },
  ]);
});

test("decisions given as a class instance the types accept are applied and reported like any others", () => {
  class Decisions {
    analytics: ConsentDecision = "granted";
  }

  const trace = new Trace({
    events,
    destinations: { product: createMockAdapter().adapter },
    consent: { product: ["analytics"] },
  });

  const recorded: unknown[] = [];

  trace.diagnostics.events.subscribe(({ type, source, context }) => {
    if (type === "consent changed") {
      recorded.push({ source, context });
    }
  });
  trace.consent.set(new Decisions());

  expect(trace.consent.get()).toEqual({ analytics: "granted" });
  expect(recorded).toEqual([
    {
      source: "consent",
      context: { decisions: { analytics: "granted" }, refused: [] },
    },
  ]);
});

test("a purpose the consent option never named is refused and changes nothing", () => {
  const trace = new Trace({
    events,
    destinations: { product: createMockAdapter().adapter },
    consent: { product: ["analytics"] },
  });

  const before = trace.consent.get();
  const listener = vi.fn();
  const recorded: unknown[] = [];

  trace.consent.subscribe(listener);
  trace.diagnostics.events.subscribe(({ type, context }) => {
    if (type === "consent changed") {
      recorded.push(context);
    }
  });
  // @ts-expect-error A JavaScript caller can name a purpose the consent option never named.
  trace.consent.set({ marketing: "granted" });

  expect(trace.consent.get()).toBe(before);
  expect(listener).not.toHaveBeenCalled();
  expect(recorded).toEqual([
    { decisions: { analytics: "unknown" }, refused: ["marketing"] },
  ]);
});

test("consent is observable: a change notifies once, and the decisions stay the same object until they change", () => {
  const trace = new Trace({
    events,
    destinations: { product: createMockAdapter().adapter },
    consent: { product: ["analytics"] },
  });

  const listener = vi.fn();

  trace.consent.subscribe(listener);
  trace.consent.set({ analytics: "granted" });

  const granted = trace.consent.get();

  trace.consent.set({ analytics: "granted" });

  expect(listener.mock.calls).toEqual([[]]);
  expect(trace.consent.get()).toBe(granted);
  expect(granted).toEqual({ analytics: "granted" });
});

test("a stream listener that revokes consent closes the destination before the enqueue: it lands dropped as consent and never receives the event", () => {
  const mock = createMockAdapter();
  const recorded: unknown[] = [];

  const trace = new Trace({
    events,
    destinations: { product: mock.adapter },
    consent: { product: ["analytics"] },
  });

  trace.consent.set({ analytics: "granted" });
  trace.events.subscribe(() => trace.consent.set({ analytics: "denied" }));
  trace.diagnostics.events.subscribe(({ type, destination, context }) => {
    if (type === "event dropped") {
      recorded.push({ destination, context });
    }
  });

  const receipt = trace.track("App Opened");

  trace.consent.set({ analytics: "granted" });
  trace.start();

  expect(receipt.status.get()).toEqual({
    state: "settled",
    outcomes: { product: { status: "dropped", reason: "consent" } },
  });
  expect(mock.sessions[0]?.events).toEqual([]);
  expect(recorded).toEqual([
    { destination: { name: "product" }, context: { reason: "consent" } },
  ]);
});
