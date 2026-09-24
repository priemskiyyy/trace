import { afterEach, expect, test, vi } from "vitest";

import { createMockAdapter } from "src/mock/createMockAdapter";
import type { Receipt } from "src/types/Receipt";
import type { StandardSchema } from "src/types/StandardSchema";
import { event } from "src/utils/event";
import { Trace } from "src/utils/Trace";

afterEach(() => {
  vi.useRealTimers();
});

const events = {
  "App Opened": event(),
  "Search Performed": event<{ query: string }>(),
};

const SUBMITTED = {
  status: "submitted",
  evidence: "sdk-call-returned",
  event: null,
  losses: [],
};

const nextChange = (receipt: Receipt) =>
  new Promise<void>((resolve) => {
    const stop = receipt.status.subscribe(() => {
      stop();
      resolve();
    });
  });

const isDeepFrozen = (value: unknown): boolean => {
  if (typeof value !== "object" || value === null) {
    return true;
  }

  return Object.isFrozen(value) && Object.values(value).every(isDeepFrozen);
};

test("track validates, composes, sanitizes, stamps, routes, streams and hands off, in that order", () => {
  const log: string[] = [];

  const search: StandardSchema<{ query: string }> = {
    "~standard": {
      version: 1,
      vendor: "test",
      validate: () => {
        log.push("validate");

        return { value: { query: "shoes" } };
      },
    },
  };

  const mock = createMockAdapter({
    onTrack: ({ event: tracked }) => {
      log.push(`track ${tracked.name}`);
    },
  });

  const trace = new Trace({
    events: { "Search Performed": event(search) },
    destinations: { product: mock.adapter },
    defaults: {
      to: () => {
        log.push("route");

        return ["product"];
      },
    },
    privacy: {
      redact: (_, path) => {
        log.push(`redact ${path}`);

        return false;
      },
    },
    now: () => {
      log.push("clock");

      return 1_000;
    },
  });

  trace.events.subscribe(() => log.push("stream"));
  trace.start();
  log.length = 0;

  const receipt = trace.track(
    "Search Performed",
    { query: "shoes" },
    { context: { screen: "search" } },
  );

  expect(log).toEqual([
    "validate",
    "redact properties.query",
    "redact context.screen",
    "clock",
    "route",
    "stream",
    "track Search Performed",
  ]);
  expect(receipt.status.get()).toEqual({
    state: "settled",
    outcomes: { product: SUBMITTED },
  });
});

test.each<
  [
    string,
    (
      trace: Trace<
        typeof events,
        { product: ReturnType<typeof createMockAdapter>["adapter"] }
      >,
    ) => Receipt<"product">,
    unknown,
  ]
>([
  [
    "disposed after dispose",
    (trace) => {
      trace.dispose();

      return trace.track("App Opened");
    },
    { state: "dropped", reason: "disposed" },
  ],
  [
    "invalid with the issues its definition gave",
    (trace) =>
      // @ts-expect-error A JavaScript caller can pass properties that are not an object.
      trace.track("Search Performed", "shoes"),
    {
      state: "dropped",
      reason: "invalid",
      issues: [
        { path: "", message: "Expected an object of event properties." },
      ],
    },
  ],
  [
    "invalid when nobody declared the event",
    (trace) =>
      // @ts-expect-error A JavaScript caller can name an event nobody declared.
      trace.track("Wishlist Shared"),
    {
      state: "dropped",
      reason: "invalid",
      issues: [
        { path: "", message: 'Trace has no event named "Wishlist Shared".' },
      ],
    },
  ],
  [
    "invalid when its options cannot be read",
    (trace) =>
      trace.track("App Opened", undefined, {
        get to(): never {
          throw new Error("unreadable options");
        },
      }),
    {
      state: "dropped",
      reason: "invalid",
      issues: [
        { path: "options", message: "The track options could not be read." },
      ],
    },
  ],
  [
    "invalid when its options are not an object",
    (trace) =>
      // @ts-expect-error A JavaScript caller can pass options that are not an object.
      trace.track("App Opened", undefined, "product"),
    {
      state: "dropped",
      reason: "invalid",
      issues: [
        { path: "options", message: "The track options could not be read." },
      ],
    },
  ],
  [
    "invalid when its options are a list",
    (trace) =>
      // @ts-expect-error A JavaScript caller can pass a list of destinations as the options.
      trace.track("App Opened", undefined, ["product"]),
    {
      state: "dropped",
      reason: "invalid",
      issues: [
        { path: "options", message: "The track options could not be read." },
      ],
    },
  ],
  [
    "not-routed when no destination is selected",
    (trace) => trace.track("App Opened", undefined, { to: [] }),
    { state: "dropped", reason: "not-routed" },
  ],
])("a receipt is dropped at once as %s", async (_, act, status) => {
  const mock = createMockAdapter();
  const trace = new Trace({ events, destinations: { product: mock.adapter } });

  trace.start();

  const receipt = act(trace);

  expect(receipt.status.get()).toEqual(status);
  await expect(receipt.settled).resolves.toEqual(status);
  expect(mock.sessions[0]?.events ?? []).toEqual([]);
});

test("a receipt is dropped at once as reentrant when an adapter tracks from inside its own call", async () => {
  const inner: Receipt[] = [];

  const mock = createMockAdapter({
    onTrack: () => {
      inner.push(trace.track("App Opened"));
    },
  });

  const trace = new Trace({ events, destinations: { product: mock.adapter } });

  trace.start();
  trace.track("App Opened");

  expect(inner[0]?.status.get()).toEqual({
    state: "dropped",
    reason: "reentrant",
  });
  expect(mock.sessions[0]?.events).toHaveLength(1);
});

test("a receipt is dropped at once as reentrant when a diagnostics listener tracks", async () => {
  const mock = createMockAdapter();
  const trace = new Trace({ events, destinations: { product: mock.adapter } });
  const inner: Receipt[] = [];

  trace.start();
  trace.diagnostics.events.subscribe(({ type }) => {
    if (type === "event accepted" && inner.length === 0) {
      inner.push(trace.track("App Opened"));
    }
  });
  trace.track("App Opened");

  expect(inner[0]?.status.get()).toEqual({
    state: "dropped",
    reason: "reentrant",
  });
  await expect(inner[0]?.settled).resolves.toEqual({
    state: "dropped",
    reason: "reentrant",
  });
  expect(mock.sessions[0]?.events).toHaveLength(1);
});

test("a receipt is dropped at once as sanitizer-failed when redact throws", () => {
  const mock = createMockAdapter();

  const trace = new Trace({
    events,
    destinations: { product: mock.adapter },
    privacy: {
      redact: (key) => {
        if (key === "query") {
          throw new Error("redact exploded");
        }

        return false;
      },
    },
  });

  trace.start();

  expect(
    trace.track("Search Performed", { query: "shoes" }).status.get(),
  ).toEqual({ state: "dropped", reason: "sanitizer-failed" });
  expect(mock.sessions[0]?.events).toEqual([]);
});

test("a receipt is dropped at once as consent when every destination it could reach is closed", () => {
  const trace = new Trace({
    events,
    destinations: { product: createMockAdapter().adapter },
    consent: { product: ["analytics"] },
  });

  expect(trace.track("App Opened").status.get()).toEqual({
    state: "dropped",
    reason: "consent",
  });
});

test("an accepted receipt is pending with one slot per routed destination, and settles once every destination has landed", async () => {
  const first = createMockAdapter({ hold: true });
  const second = createMockAdapter({ hold: true });

  const trace = new Trace({
    events,
    destinations: { first: first.adapter, second: second.adapter },
  });

  trace.start();

  const receipt = trace.track("App Opened");

  expect(receipt.status.get()).toEqual({
    state: "pending",
    outcomes: { first: null, second: null },
  });

  const landed = nextChange(receipt);

  first.tracks[0]?.settle();
  await landed;

  expect(receipt.status.get()).toEqual({
    state: "pending",
    outcomes: { first: SUBMITTED, second: null },
  });

  second.tracks[0]?.fail(new Error("upload failed"));

  await expect(receipt.settled).resolves.toEqual({
    state: "settled",
    outcomes: {
      first: SUBMITTED,
      second: { status: "failed", error: new Error("upload failed") },
    },
  });
});

test("the event carries its id, name, sanitized properties and context, its identity and its time", () => {
  const mock = createMockAdapter();

  const trace = new Trace({
    events,
    destinations: { product: mock.adapter },
    now: () => 1_000,
  });

  trace.start();
  trace.user({ id: "ada", traits: { plan: "pro" } });

  const receipt = trace.track(
    "Search Performed",
    { query: "shoes" },
    { context: { screen: "search" } },
  );

  expect(mock.sessions[0]?.events[0]).toEqual({
    id: receipt.id,
    name: "Search Performed",
    properties: { query: "shoes" },
    context: { screen: "search" },
    identity: {
      generation: 1,
      user: { id: "ada" },
      traits: { plan: "pro" },
      groups: {},
    },
    timestamp: 1_000,
  });
});

test("options.timestamp overrides the clock, and a timestamp left null gives way to it without a loss", async () => {
  const mock = createMockAdapter();

  const trace = new Trace({
    events,
    destinations: { product: mock.adapter },
    now: () => 1_000,
  });

  trace.start();
  trace.track("App Opened", undefined, { timestamp: 5 });
  trace.track("App Opened");

  // @ts-expect-error A JavaScript caller can pass a null timestamp.
  const unset = trace.track("App Opened", undefined, { timestamp: null });

  expect(mock.sessions[0]?.events.map(({ timestamp }) => timestamp)).toEqual([
    5, 1_000, 1_000,
  ]);
  await expect(unset.settled).resolves.toEqual({
    state: "settled",
    outcomes: { product: SUBMITTED },
  });
});

test("a timestamp that is no time a Date can hold gives way to the clock and is reported as an invalid loss", async () => {
  const mock = createMockAdapter();

  const trace = new Trace({
    events,
    destinations: { product: mock.adapter },
    now: () => 1_000,
  });

  trace.start();

  const receipts = [Number.NaN, 8.64e15 + 1].map((timestamp) =>
    trace.track("App Opened", undefined, { timestamp }),
  );

  expect(mock.sessions[0]?.events.map(({ timestamp }) => timestamp)).toEqual([
    1_000, 1_000,
  ]);

  for (const receipt of receipts) {
    await expect(receipt.settled).resolves.toEqual({
      state: "settled",
      outcomes: {
        product: {
          ...SUBMITTED,
          losses: [{ path: "timestamp", reason: "invalid" }],
        },
      },
    });
  }
});

test("a name that is not a string is dropped as invalid without being read or converted", () => {
  const mock = createMockAdapter();
  const trace = new Trace({ events, destinations: { product: mock.adapter } });

  const hostile = {
    toString: () => {
      throw new Error("a name was converted");
    },
  };

  trace.start();

  for (const name of [{ __proto__: null }, hostile, 42, Symbol("x")]) {
    // @ts-expect-error A JavaScript caller can pass a name that is not a string.
    expect(trace.track(name).status.get()).toEqual({
      state: "dropped",
      reason: "invalid",
      issues: [{ path: "", message: "The event name is not a string." }],
    });
    // @ts-expect-error A JavaScript caller can pass a name that is not a string.
    expect(trace.scope({ context: {} }).track(name).status.get()).toEqual({
      state: "dropped",
      reason: "invalid",
      issues: [{ path: "", message: "The event name is not a string." }],
    });
  }

  expect(mock.sessions[0]?.events).toEqual([]);
});

test("a call or scope context that is not an object is an invalid loss, and the event is still delivered", async () => {
  const mock = createMockAdapter();
  const trace = new Trace({ events, destinations: { product: mock.adapter } });

  trace.start();

  const receipts = [
    // @ts-expect-error A JavaScript caller can pass a context that is not an object.
    trace.track("App Opened", undefined, { context: "home" }),
    // @ts-expect-error A JavaScript caller can pass a context that is not an object.
    trace.scope({ context: "home" }).track("App Opened"),
  ];

  for (const receipt of receipts) {
    await expect(receipt.settled).resolves.toEqual({
      state: "settled",
      outcomes: {
        product: {
          ...SUBMITTED,
          losses: [{ path: "context", reason: "invalid" }],
        },
      },
    });
  }

  expect(mock.sessions[0]?.events.map(({ context }) => context)).toEqual([
    {},
    {},
  ]);
});

test("a provider reads time from the Trace's own clock, guarded like the event's", () => {
  vi.useFakeTimers({ now: 5_000 });

  const clocks: unknown[] = [];

  const read = (now: () => number) => {
    const mock = createMockAdapter({
      onTrack: ({ context }) => {
        clocks.push(context.now());
      },
    });

    const trace = new Trace({
      events,
      destinations: { product: mock.adapter },
      now,
    });

    trace.start();
    trace.track("App Opened");
  };

  read(() => 1_000);
  read(() => {
    throw new Error("clock exploded");
  });
  read(() => Number.NaN);

  expect(clocks).toEqual([1_000, 5_000, 5_000]);
});

test("every destination receives the same frozen event", () => {
  const first = createMockAdapter();
  const second = createMockAdapter();

  const trace = new Trace({
    events,
    destinations: { first: first.adapter, second: second.adapter },
    now: () => 1_000,
  });

  trace.start();
  trace.group("workspace", { id: "w_1", traits: { seats: [1, 2] } });

  const receipt = trace.track(
    "Search Performed",
    { query: "shoes" },
    { context: { screen: { name: "search" } } },
  );

  const tracked = first.sessions[0]?.events[0];

  expect(tracked).toEqual({
    id: receipt.id,
    name: "Search Performed",
    properties: { query: "shoes" },
    context: { screen: { name: "search" } },
    identity: {
      generation: 0,
      user: null,
      traits: {},
      groups: { workspace: { id: "w_1", traits: { seats: [1, 2] } } },
    },
    timestamp: 1_000,
  });
  expect(second.sessions[0]?.events[0]).toBe(tracked);
  expect(isDeepFrozen(tracked)).toBe(true);
});

test("the context layers defaults, trace.context, the scope and the call, a later layer winning per key", () => {
  const mock = createMockAdapter();

  const trace = new Trace({
    events,
    destinations: { product: mock.adapter },
    defaults: {
      context: { app: "2.4.0", surface: "default", tier: "defaults" },
    },
  });

  trace.start();
  trace.context({ surface: "context", locale: "de" });
  trace
    .scope({ context: { surface: "scope", feature: "billing" } })
    .track("App Opened", undefined, { context: { surface: "call" } });

  expect(mock.sessions[0]?.events[0]?.context).toEqual({
    app: "2.4.0",
    surface: "call",
    tier: "defaults",
    locale: "de",
    feature: "billing",
  });
});

test("null removes a key from the default context, and later events go without it", () => {
  const mock = createMockAdapter();

  const trace = new Trace({
    events,
    destinations: { product: mock.adapter },
    defaults: { context: { app: "2.4.0", locale: "de" } },
  });

  trace.start();
  trace.context({ app: null, screen: "home" });
  trace.track("App Opened");

  expect(mock.sessions[0]?.events[0]?.context).toEqual({
    locale: "de",
    screen: "home",
  });
});

test("a context the sanitizer refuses, or one whose redact throws, changes nothing and records context refused", () => {
  const mock = createMockAdapter();

  let failing = false;

  const trace = new Trace({
    events,
    destinations: { product: mock.adapter },
    privacy: {
      redact: () => {
        if (failing) {
          throw new Error("redact failed");
        }

        return false;
      },
    },
  });

  const refused: unknown[] = [];

  trace.diagnostics.events.subscribe((diagnostic) => {
    if (diagnostic.type === "context refused") {
      refused.push(diagnostic);
    }
  });
  trace.start();
  trace.context({ screen: "home" });
  // @ts-expect-error A JavaScript caller can pass a context that is not an object.
  trace.context("cart");
  failing = true;
  trace.context({ screen: "cart" });
  failing = false;
  trace.track("App Opened");

  expect(mock.sessions[0]?.events[0]?.context).toEqual({ screen: "home" });
  expect(refused).toEqual(
    Array.from({ length: 2 }, () => ({
      source: "runtime",
      type: "context refused",
      destination: null,
      event: null,
      timestamp: expect.any(Number),
      context: null,
    })),
  );
});

test("the default context survives a user change, and a call's context never outlives its event", () => {
  const mock = createMockAdapter();
  const trace = new Trace({ events, destinations: { product: mock.adapter } });

  trace.start();
  trace.context({ locale: "de" });
  trace.user({ id: "ada" });
  trace.track("App Opened", undefined, { context: { screen: "home" } });
  trace.user({ id: "bob" });
  trace.track("App Opened");

  expect(mock.sessions[0]?.events.map(({ context }) => context)).toEqual([
    { locale: "de", screen: "home" },
    { locale: "de" },
  ]);
});

test("a scope binds one context layer, does not nest and holds no identity", () => {
  const mock = createMockAdapter();
  const trace = new Trace({ events, destinations: { product: mock.adapter } });
  const scope = trace.scope({ context: { feature: "billing" } });

  expect(Object.keys(scope)).toEqual(["track"]);
  expect(Object.isFrozen(scope)).toBe(true);

  trace.start();
  trace.user({ id: "ada" });
  scope.track("App Opened");
  trace.user({ id: "bob" });
  scope.track("App Opened");

  expect(
    mock.sessions[0]?.events.map(({ context, identity }) => [
      context,
      identity.user,
    ]),
  ).toEqual([
    [{ feature: "billing" }, { id: "ada" }],
    [{ feature: "billing" }, { id: "bob" }],
  ]);
});

test("a scope's context is taken when the scope is created, so later changes to the object reach nothing", () => {
  const mock = createMockAdapter();
  const trace = new Trace({ events, destinations: { product: mock.adapter } });
  const layer = { feature: "billing" };
  const scope = trace.scope({ context: layer });

  layer.feature = "invoices";
  trace.start();
  scope.track("App Opened");

  expect(mock.sessions[0]?.events[0]?.context).toEqual({ feature: "billing" });
});

test("an event keeps the identity and context it had when it was accepted, whatever changes before its handoff", () => {
  const mock = createMockAdapter();
  const trace = new Trace({ events, destinations: { product: mock.adapter } });

  trace.user({ id: "ada", traits: { plan: "free" } });
  trace.context({ screen: "home" });
  trace.track("App Opened");
  trace.traits({ plan: "pro" });
  trace.context({ screen: "cart" });
  trace.start();

  expect(mock.sessions[0]?.events[0]).toMatchObject({
    context: { screen: "home" },
    identity: { user: { id: "ada" }, traits: { plan: "free" } },
  });
});
