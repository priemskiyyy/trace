import { afterEach, expect, test, vi } from "vitest";

import { createMockAdapter } from "src/mock/createMockAdapter";
import type { MockSession } from "src/mock/types/MockSession";
import type { AnalyticsAdapter } from "src/types/AnalyticsAdapter";
import type { Destinations } from "src/types/Destinations";
import type { EventDefinition } from "src/types/EventDefinition";
import type { TraceOptions } from "src/types/TraceOptions";
import type { TraceSchema } from "src/types/TraceSchema";
import { event } from "src/utils/event";
import { Trace } from "src/utils/Trace";

afterEach(() => {
  vi.useRealTimers();
});

const events = {
  "App Opened": event(),
  "Search Performed": event<{ query: string }>(),
};

type RefusedOptions = Partial<
  TraceOptions<
    Record<string, EventDefinition<never, unknown>>,
    Destinations,
    TraceSchema,
    string
  >
>;

type MockTrace = Trace<
  typeof events,
  { product: AnalyticsAdapter<MockSession> }
>;

const SUBMITTED = {
  status: "submitted",
  evidence: "sdk-call-returned",
  event: null,
  losses: [],
};

const getProcessListeners = () =>
  process.eventNames().map((name) => [name, process.listenerCount(name)]);

test("constructing a Trace is cold: nothing opens, no timer starts and no listener is registered", () => {
  vi.useFakeTimers();

  const mock = createMockAdapter();
  const listeners = getProcessListeners();

  const trace = new Trace({
    events,
    destinations: { product: mock.adapter },
    defaults: { context: { app: { version: "2.4.0" } } },
    consent: { product: ["analytics"] },
    buffer: { capacity: 10, maxAge: 1_000 },
  });

  expect(mock.sessions).toEqual([]);
  expect(vi.getTimerCount()).toBe(0);
  expect(getProcessListeners()).toEqual(listeners);
  expect(trace.status.get()).toEqual({ state: "idle" });
  expect(trace.destination("product").status.get()).toEqual({ state: "idle" });
});

const refusals: [string, RefusedOptions, string][] = [
  [
    "events that are not an object",
    // @ts-expect-error A JavaScript caller can pass events that are not an object.
    { events: "App Opened" },
    "events must be an object of event definitions.",
  ],
  [
    "events that are a Map",
    // @ts-expect-error A JavaScript caller can pass a Map of event definitions.
    { events: new Map([["App Opened", event()]]) },
    "events must be an object of event definitions.",
  ],
  [
    "an empty event name",
    { events: { "": event() } },
    "events cannot declare an event with an empty name.",
  ],
  [
    "destinations that are not an object",
    // @ts-expect-error A JavaScript caller can pass a list of adapters.
    { destinations: [createMockAdapter().adapter] },
    "destinations must be an object of adapters by destination name.",
  ],
  [
    "a destination that is not an adapter",
    // @ts-expect-error A JavaScript caller can pass an object that is not an adapter.
    { destinations: { product: {} } },
    "destinations.product must be an adapter: an object with a name string and an open function.",
  ],
  [
    "a destination without a name",
    // @ts-expect-error A JavaScript caller can pass an adapter without a name.
    { destinations: { product: { open: () => ({}) } } },
    "destinations.product must be an adapter: an object with a name string and an open function.",
  ],
  [
    "a destination whose open is not a function",
    // @ts-expect-error A JavaScript caller can pass an open that is not a function.
    { destinations: { product: { name: "mock", open: "yes" } } },
    "destinations.product must be an adapter: an object with a name string and an open function.",
  ],
  [
    "a destination left undefined",
    // @ts-expect-error A JavaScript caller can leave a destination undefined.
    { destinations: { product: undefined } },
    "destinations.product must be an adapter: an object with a name string and an open function.",
  ],
  [
    "consent that is not an object",
    // @ts-expect-error A JavaScript caller can pass a list of purposes.
    { consent: ["analytics"] },
    "consent must be an object of purposes by destination name.",
  ],
  [
    "a consent entry for a destination nobody configured",
    { consent: { warehouse: ["analytics"] } },
    'consent names "warehouse", which no destination has.',
  ],
  [
    "a consent entry that is not a list",
    // @ts-expect-error A JavaScript caller can name one purpose instead of a list.
    { consent: { product: "analytics" } },
    "consent.product must be an own list of purpose strings.",
  ],
  [
    "a consent entry listing a purpose that is not a string",
    // @ts-expect-error A JavaScript caller can list a purpose that is not a string.
    { consent: { product: ["analytics", 7] } },
    "consent.product must be an own list of purpose strings.",
  ],
  [
    "a consent entry the option only inherits",
    // @ts-expect-error A literal's __proto__ sets its prototype, which the types read as a property.
    { consent: { __proto__: { __proto__: null, product: ["analytics"] } } },
    "consent.product must be an own list of purpose strings.",
  ],
  [
    "a defaults.to list naming a destination nobody configured",
    { defaults: { to: ["product", "warehouse"] } },
    'defaults.to names "warehouse", which no destination has.',
  ],
  [
    "a defaults.to list holding a name that is not a string",
    // @ts-expect-error A JavaScript caller can pass a number as a destination name.
    { defaults: { to: [1] } },
    'defaults.to names "1", which no destination has.',
  ],
  [
    "a defaults.to that is neither a list nor a function",
    // @ts-expect-error A JavaScript caller can pass one name instead of a list.
    { defaults: { to: "product" } },
    "defaults.to must be a list of destination names or a function.",
  ],
  [
    "a redact that is not a function",
    // @ts-expect-error A JavaScript caller can pass a pattern instead of a function.
    { privacy: { redact: /token/ } },
    "privacy.redact must be a function.",
  ],
  [
    "a depth that is not a number",
    { privacy: { limits: { depth: Number.NaN } } },
    "privacy.limits.depth must be a whole number of 0 or more.",
  ],
  [
    "a negative breadth",
    { privacy: { limits: { breadth: -1 } } },
    "privacy.limits.breadth must be a whole number of 0 or more.",
  ],
  [
    "a fractional string length",
    { privacy: { limits: { stringLength: 1.5 } } },
    "privacy.limits.stringLength must be a whole number of 0 or more.",
  ],
  [
    "an infinite total size",
    { privacy: { limits: { totalSize: Number.POSITIVE_INFINITY } } },
    "privacy.limits.totalSize must be a whole number of 0 or more.",
  ],
  [
    "a fractional capacity",
    { buffer: { capacity: 1.5 } },
    "buffer.capacity must be a whole number of 0 or more.",
  ],
  [
    "a negative age",
    { buffer: { maxAge: -1 } },
    "buffer.maxAge must be a whole number of milliseconds from 0 to 2147483647.",
  ],
  [
    "an age past the longest timer",
    { buffer: { maxAge: 2 ** 31 } },
    "buffer.maxAge must be a whole number of milliseconds from 0 to 2147483647.",
  ],
  [
    "a timeout that is not a number",
    { timeout: Number.NaN },
    "timeout must be a whole number of milliseconds from 0 to 2147483647.",
  ],
  [
    "a fractional timeout",
    { timeout: 2.5 },
    "timeout must be a whole number of milliseconds from 0 to 2147483647.",
  ],
  [
    "defaults.context that is not an object",
    // @ts-expect-error A JavaScript caller can pass a context that is not an object.
    { defaults: { context: "2.4.0" } },
    "defaults.context must be an object.",
  ],
  [
    "a schema that is not an object",
    // @ts-expect-error A JavaScript caller can pass a schema that is not an object.
    { schema: "plan" },
    "schema must be an object with traits and groups validators.",
  ],
  [
    "a schema left null",
    // @ts-expect-error A JavaScript caller can pass a null schema.
    { schema: null },
    "schema must be an object with traits and groups validators.",
  ],
  [
    "schema.traits that is not an object",
    // @ts-expect-error A JavaScript caller can pass traits validators that are not an object.
    { schema: { traits: "plan" } },
    "schema.traits must be an object of validators.",
  ],
  [
    "schema.traits left null",
    // @ts-expect-error A JavaScript caller can pass null traits validators.
    { schema: { traits: null } },
    "schema.traits must be an object of validators.",
  ],
  [
    "schema.groups that is a list",
    // @ts-expect-error A JavaScript caller can pass a list of group types.
    { schema: { groups: ["workspace"] } },
    "schema.groups must be an object of validators by group type.",
  ],
  [
    "a group type whose validators are not an object",
    // @ts-expect-error A JavaScript caller can pass group validators that are not an object.
    { schema: { groups: { workspace: true } } },
    "schema.groups.workspace must be an object of validators.",
  ],
  [
    "defaults.context the sanitizer refuses",
    { defaults: { context: { render: () => "home", build: Number.NaN } } },
    "defaults.context is invalid at context.render, context.build.",
  ],
];

test.each(refusals)(
  "the constructor refuses %s with a TraceError INVALID_CONFIGURATION that names the option",
  (_, overrides, message) => {
    expect(
      () =>
        new Trace({
          events,
          destinations: { product: createMockAdapter().adapter },
          ...overrides,
        }),
    ).toThrow(
      expect.objectContaining({
        name: "TraceError",
        code: "INVALID_CONFIGURATION",
        message,
      }),
    );
  },
);

test("defaults.context that cannot be sanitized is a configuration error that keeps its cause", () => {
  const failure = new Error("redact exploded");

  expect(
    () =>
      new Trace({
        events,
        destinations: { product: createMockAdapter().adapter },
        defaults: { context: { app: "2.4.0" } },
        privacy: {
          redact: () => {
            throw failure;
          },
        },
      }),
  ).toThrow(
    expect.objectContaining({
      name: "TraceError",
      code: "INVALID_CONFIGURATION",
      message: "defaults.context could not be sanitized.",
      cause: failure,
    }),
  );
});

test("options that cannot be read throw nothing but a TraceError INVALID_CONFIGURATION", () => {
  const failure = new Error("unreadable destinations");

  // @ts-expect-error A JavaScript caller can construct a Trace without options.
  expect(() => new Trace()).toThrow(
    expect.objectContaining({
      name: "TraceError",
      code: "INVALID_CONFIGURATION",
      message: "Trace's options could not be read.",
    }),
  );
  expect(
    () =>
      new Trace({
        events,
        get destinations(): never {
          throw failure;
        },
      }),
  ).toThrow(
    expect.objectContaining({
      name: "TraceError",
      code: "INVALID_CONFIGURATION",
      cause: failure,
    }),
  );
});

test("a buffer left undefined keeps its default capacity of 100 and age of 30 seconds", async () => {
  vi.useFakeTimers();

  const mock = createMockAdapter();

  const trace: MockTrace = new Trace({
    events,
    destinations: { product: mock.adapter },
    // @ts-expect-error A caller without exactOptionalPropertyTypes can pass undefined for a buffer limit.
    buffer: { capacity: undefined, maxAge: undefined },
  });

  const receipts = Array.from({ length: 101 }, () => trace.track("App Opened"));

  expect(receipts[0]?.status.get()).toEqual({
    state: "settled",
    outcomes: { product: { status: "dropped", reason: "buffer-overflow" } },
  });
  expect(receipts[1]?.status.get().state).toBe("pending");

  await vi.advanceTimersByTimeAsync(29_999);

  expect(receipts[1]?.status.get().state).toBe("pending");

  await vi.advanceTimersByTimeAsync(1);

  expect(receipts[1]?.status.get()).toEqual({
    state: "settled",
    outcomes: { product: { status: "dropped", reason: "buffer-expired" } },
  });
});

test("a timeout, a redact, limits and a clock left undefined keep their defaults", async () => {
  vi.useFakeTimers();

  const mock = createMockAdapter({ hold: true });

  const trace: MockTrace = new Trace({
    events,
    destinations: { product: mock.adapter },
    timeout: undefined,
    // @ts-expect-error A caller without exactOptionalPropertyTypes can pass undefined for a privacy option.
    privacy: { redact: undefined, limits: { stringLength: undefined } },
    // @ts-expect-error A caller without exactOptionalPropertyTypes can pass undefined for a default.
    defaults: { to: undefined, context: undefined },
    consent: undefined,
    schema: undefined,
    now: undefined,
  });

  const before = Date.now();

  trace.start();

  const receipt = trace.track("Search Performed", {
    query: "x".repeat(2_001),
  });

  expect(mock.sessions[0]?.events[0]).toMatchObject({
    properties: { query: "x".repeat(2_000) },
    timestamp: before,
  });

  const redacted = trace.track("App Opened", undefined, {
    context: { token: "t_1" },
  });

  expect(mock.sessions[0]?.events[1]?.context).toEqual({});

  mock.tracks[1]?.settle();
  await vi.advanceTimersByTimeAsync(4_999);

  expect(receipt.status.get().state).toBe("pending");
  expect(redacted.status.get()).toEqual({
    state: "settled",
    outcomes: {
      product: {
        ...SUBMITTED,
        losses: [{ path: "context.token", reason: "redacted" }],
      },
    },
  });

  await vi.advanceTimersByTimeAsync(1);

  expect(receipt.status.get()).toEqual({
    state: "settled",
    outcomes: { product: { status: "indeterminate", reason: "timeout" } },
  });
});

test("start opens every destination once, however often it is called, and later calls retry only what failed", () => {
  let attempts = 0;

  const steady = createMockAdapter();

  const failing = createMockAdapter({
    onOpen: () => {
      attempts += 1;

      if (attempts === 1) {
        throw new Error("the SDK is not initialized");
      }
    },
  });

  const trace = new Trace({
    events,
    destinations: { steady: steady.adapter, failing: failing.adapter },
  });

  trace.start();

  expect(trace.status.get()).toEqual({ state: "started" });
  expect(steady.sessions).toHaveLength(1);
  expect(failing.sessions).toHaveLength(0);
  expect(trace.destination("failing").status.get()).toEqual({
    state: "failed",
    error: new Error("the SDK is not initialized"),
  });

  trace.start();

  expect(steady.sessions).toHaveLength(1);
  expect(failing.sessions).toHaveLength(1);
  expect(trace.destination("failing").status.get()).toEqual({
    state: "ready",
  });
});

test("the status moves idle, started, disposed as interned objects, and starting again tells no observer anything", () => {
  const first = new Trace({
    events,
    destinations: { product: createMockAdapter().adapter },
  });

  const second = new Trace({
    events,
    destinations: { product: createMockAdapter().adapter },
  });

  const seen: unknown[] = [];
  const types: string[] = [];

  first.status.subscribe(() => seen.push(first.status.get()));
  first.diagnostics.events.subscribe(({ type }) => types.push(type));

  expect(first.status.get()).toBe(second.status.get());

  first.start();
  first.start();
  second.start();

  expect(first.status.get()).toBe(second.status.get());

  first.dispose();

  expect(seen).toEqual([{ state: "started" }, { state: "disposed" }]);
  expect(types.filter((type) => type === "trace started")).toHaveLength(1);
  expect(Object.isFrozen(first.status.get())).toBe(true);
});

test("an observed status cannot prevent startup or revive disposal", () => {
  const mock = createMockAdapter();
  const trace = new Trace({ events, destinations: { product: mock.adapter } });

  Reflect.set(trace.status.get(), "state", "disposed");
  trace.start();

  expect(mock.sessions).toHaveLength(1);

  trace.dispose();
  Reflect.set(trace.status.get(), "state", "started");

  expect(trace.track("App Opened").status.get()).toEqual({
    state: "dropped",
    reason: "disposed",
  });
});

test("dispose drops what is buffered, settles what is in flight, releases each session once and ends with a final diagnostic", async () => {
  const sent = createMockAdapter({ hold: true });

  const waiting = createMockAdapter({
    onOpen: () => {
      throw new Error("the SDK is not initialized");
    },
  });

  const trace = new Trace({
    events,
    destinations: { sent: sent.adapter, waiting: waiting.adapter },
  });

  const types: string[] = [];

  trace.diagnostics.events.subscribe(({ type }) => types.push(type));
  trace.start();

  const receipt = trace.track("App Opened");

  trace.dispose();

  expect(receipt.status.get()).toEqual({
    state: "settled",
    outcomes: {
      sent: { status: "indeterminate", reason: "disposed" },
      waiting: { status: "dropped", reason: "disposed" },
    },
  });
  expect(sent.tracks[0]?.context.signal.aborted).toBe(true);
  expect(sent.sessions[0]?.disposeCount).toBe(1);
  expect(trace.status.get()).toEqual({ state: "disposed" });
  expect(types.at(-1)).toBe("trace disposed");
  expect(trace.diagnostics.get()).toMatchObject({
    status: { state: "disposed" },
    pendingReceipts: 0,
  });

  sent.tracks[0]?.settle();
  await receipt.settled;

  expect(receipt.status.get()).toMatchObject({
    outcomes: { sent: { status: "indeterminate", reason: "disposed" } },
  });
});

test("dispose is idempotent and releases every listener, so later calls are silent and change nothing", () => {
  const mock = createMockAdapter();

  const trace = new Trace({
    events,
    destinations: { product: mock.adapter },
    consent: { product: ["analytics"] },
  });

  const streamed: unknown[] = [];
  const types: string[] = [];

  trace.events.subscribe((tracked) => streamed.push(tracked));
  trace.diagnostics.events.subscribe(({ type }) => types.push(type));

  trace.dispose();
  trace.dispose();

  const recorded = types.length;

  expect(() => {
    trace.start();
    trace.user({ id: "ada" });
    trace.traits({ plan: "pro" });
    trace.group("workspace", { id: "w_1" });
    trace.context({ app: "2.4.0" });
    trace.consent.set({ analytics: "granted" });
    trace.scope({ context: { feature: "billing" } }).track("App Opened");
    trace.events.subscribe((tracked) => streamed.push(tracked));
  }).not.toThrow();

  expect(trace.track("App Opened").status.get()).toEqual({
    state: "dropped",
    reason: "disposed",
  });
  expect(mock.sessions).toEqual([]);
  expect(streamed).toEqual([]);
  expect(types).toHaveLength(recorded);
  expect(trace.consent.get()).toEqual({ analytics: "unknown" });
  expect(trace.diagnostics.get().identity).toEqual({
    generation: 0,
    user: null,
  });
});

test("dispose releases every observer after the final notification, and a later subscription registers nothing", async () => {
  const trace = new Trace({
    events,
    destinations: { product: createMockAdapter().adapter },
    consent: { product: ["analytics"] },
  });

  const seen: string[] = [];

  let status: (() => void) | null = () => seen.push(trace.status.get().state);
  let consent: (() => void) | null = () => seen.push("consent");
  let stream: (() => void) | null = () => seen.push("stream");

  let destination: (() => void) | null = () =>
    seen.push(`product ${trace.destination("product").status.get().state}`);

  let snapshot: (() => void) | null = () => {};

  let timeline: (() => void) | null = () => {};

  let late: (() => void) | null = () => seen.push("late");

  const released = [
    new WeakRef(status),
    new WeakRef(consent),
    new WeakRef(stream),
    new WeakRef(destination),
    new WeakRef(snapshot),
    new WeakRef(timeline),
  ];

  const refused = new WeakRef(late);

  trace.status.subscribe(status);
  trace.consent.subscribe(consent);
  trace.events.subscribe(stream);
  trace.destination("product").status.subscribe(destination);
  trace.diagnostics.subscribe(snapshot);
  trace.diagnostics.events.subscribe(timeline);
  status = null;
  consent = null;
  stream = null;
  destination = null;
  snapshot = null;
  timeline = null;
  trace.dispose();
  trace.status.subscribe(late);
  trace.consent.subscribe(late);
  trace.events.subscribe(late);
  trace.destination("product").status.subscribe(late);
  trace.diagnostics.subscribe(late);
  trace.diagnostics.events.subscribe(late);
  late = null;

  await new Promise((resolve) => setImmediate(resolve));
  gc?.();

  expect(seen).toEqual(["disposed", "product disposed"]);
  expect(released.map((reference) => reference.deref())).toEqual([
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
  ]);
  expect(refused.deref()).toBeUndefined();
  expect(trace.status.get()).toEqual({ state: "disposed" });
});

test("a receipt that has settled, as every receipt has after dispose, registers no later subscription", async () => {
  const trace = new Trace({
    events,
    destinations: { product: createMockAdapter().adapter },
  });

  const receipt = trace.track("App Opened");

  trace.dispose();

  let late: (() => void) | null = () => {};

  const refused = new WeakRef(late);

  receipt.status.subscribe(late);
  late = null;

  await new Promise((resolve) => setImmediate(resolve));
  gc?.();

  expect(refused.deref()).toBeUndefined();
  expect(receipt.status.get()).toEqual({
    state: "settled",
    outcomes: { product: { status: "dropped", reason: "disposed" } },
  });
});

test("every receipt is frozen with its status, whether its event was accepted or dropped", () => {
  const trace = new Trace({
    events,
    destinations: { product: createMockAdapter().adapter },
  });

  trace.start();

  const accepted = trace.track("App Opened");
  const dropped = trace.track("App Opened", undefined, { to: [] });

  expect(dropped.status.get()).toEqual({
    state: "dropped",
    reason: "not-routed",
  });
  expect(
    [accepted, accepted.status, dropped, dropped.status].map(Object.isFrozen),
  ).toEqual([true, true, true, true]);
});

test("every option, and each adapter's name and open, is read once, so no getter can answer the check one thing and the Trace another", () => {
  const reads: string[] = [];

  const watch = <TTarget extends object>(label: string, target: TTarget) =>
    new Proxy(target, {
      get: (object, key, receiver: unknown) => {
        reads.push(`${label}.${String(key)}`);

        return Reflect.get(object, key, receiver);
      },
    });

  let opens = 0;

  const adapter = watch("adapter", {
    name: "mock",
    open: () => {
      opens += 1;

      if (opens === 1) {
        throw new Error("the SDK is not initialized");
      }

      return createMockAdapter().adapter.open();
    },
  });

  const trace = new Trace(
    watch("options", {
      events,
      destinations: watch("destinations", { product: adapter }),
      consent: watch("consent", { product: ["analytics"] }),
      defaults: watch("defaults", { context: { app: "2.4.0" } }),
      privacy: watch("privacy", { limits: { depth: 4 } }),
      schema: watch("schema", {}),
      buffer: watch("buffer", { capacity: 10 }),
      timeout: 1_000,
      now: () => 1_000,
    }),
  );

  trace.consent.set({ analytics: "granted" });
  trace.start();
  trace.start();

  expect(opens).toBe(2);
  expect([...reads].sort()).toEqual([
    "adapter.name",
    "adapter.open",
    "buffer.capacity",
    "buffer.maxAge",
    "consent.product",
    "defaults.context",
    "defaults.to",
    "destinations.product",
    "options.buffer",
    "options.consent",
    "options.defaults",
    "options.destinations",
    "options.events",
    "options.now",
    "options.privacy",
    "options.schema",
    "options.timeout",
    "privacy.limits",
    "privacy.redact",
    "schema.groups",
    "schema.traits",
  ]);
});

test("diagnostics and its timeline are frozen, so replacing a method changes nothing another observer reads", () => {
  const trace = new Trace({
    events,
    destinations: { product: createMockAdapter().adapter },
  });

  const snapshot = trace.diagnostics.get();

  expect(Reflect.set(trace.diagnostics, "get", () => "forged")).toBe(false);
  expect(
    Reflect.set(trace.diagnostics.events, "subscribe", () => () => {}),
  ).toBe(false);
  expect(Object.isFrozen(trace.diagnostics)).toBe(true);
  expect(Object.isFrozen(trace.diagnostics.events)).toBe(true);
  expect(trace.diagnostics.get()).toBe(snapshot);
});

test("start after dispose opens nothing", () => {
  const mock = createMockAdapter();
  const trace = new Trace({ events, destinations: { product: mock.adapter } });

  trace.dispose();
  trace.start();

  expect(mock.sessions).toEqual([]);
  expect(trace.status.get()).toEqual({ state: "disposed" });
  expect(trace.destination("product").status.get()).toEqual({
    state: "disposed",
  });
});

test("destination hands out the status and the native handle, which is null until the destination is ready and after disposal", () => {
  const mock = createMockAdapter();
  const trace = new Trace({ events, destinations: { product: mock.adapter } });
  const handle = trace.destination("product");

  expect(handle.native).toBeNull();
  expect(handle.status.get()).toEqual({ state: "idle" });

  trace.start();

  expect(handle.native).toBe(mock.sessions[0]);
  expect(handle.status.get()).toEqual({ state: "ready" });
  expect(Object.isFrozen(handle)).toBe(true);

  trace.dispose();

  expect(handle.native).toBeNull();
  expect(trace.destination("product").status.get()).toEqual({
    state: "disposed",
  });
});

test("destination answers the same frozen handle for a name every time, so its status subscription is stable too", () => {
  const trace = new Trace({
    events,
    destinations: {
      product: createMockAdapter().adapter,
      research: createMockAdapter().adapter,
    },
  });

  const product = trace.destination("product");

  expect(trace.destination("product")).toBe(product);
  expect(trace.destination("product").status).toBe(product.status);
  expect(trace.destination("product").status.subscribe).toBe(
    product.status.subscribe,
  );
  expect(trace.destination("research")).not.toBe(product);
});

test("a subscription made through the stable handle hears each change once and stops when it is released", () => {
  const trace = new Trace({
    events,
    destinations: { product: createMockAdapter().adapter },
  });

  const states: string[] = [];
  const { status } = trace.destination("product");

  const stop = status.subscribe(() =>
    states.push(trace.destination("product").status.get().state),
  );

  trace.start();
  stop();
  trace.dispose();

  expect(states).toEqual(["ready"]);
});

test("destination throws a TraceError INVALID_CONFIGURATION for a name that was never configured", () => {
  const trace = new Trace({
    events,
    destinations: {
      product: createMockAdapter().adapter,
      'say "hi"': createMockAdapter().adapter,
    },
  });

  // @ts-expect-error The types refuse a name that was never configured.
  expect(() => trace.destination("warehouse")).toThrow(
    expect.objectContaining({
      name: "TraceError",
      code: "INVALID_CONFIGURATION",
      message:
        'Trace has no destination named "warehouse". The configured destinations are "product", "say \\"hi\\"".',
    }),
  );
  // @ts-expect-error The types refuse a name that is not a string.
  expect(() => trace.destination(Symbol("product"))).toThrow(
    expect.objectContaining({
      name: "TraceError",
      code: "INVALID_CONFIGURATION",
      message:
        'Trace has no destination for a name that is not a string. The configured destinations are "product", "say \\"hi\\"".',
    }),
  );
});

test("a Trace with no destinations says so when asked for one", () => {
  const trace = new Trace({ events, destinations: {} });

  // @ts-expect-error A Trace with no destinations has no name to ask for.
  expect(() => trace.destination("product")).toThrow(
    expect.objectContaining({
      name: "TraceError",
      code: "INVALID_CONFIGURATION",
      message:
        'Trace has no destination named "product". This Trace was constructed with no destinations.',
    }),
  );
});

test("replacing a method of a handle's status changes nothing Trace reports", () => {
  const trace = new Trace({
    events,
    destinations: { product: createMockAdapter().adapter },
  });

  Reflect.set(trace.destination("product").status, "get", () => ({
    state: "ready",
  }));

  expect(trace.destination("product").status.get()).toEqual({ state: "idle" });
  expect(trace.diagnostics.get().destinations[0]?.status).toEqual({
    state: "idle",
  });
});

test("members stay bound when passed around", async () => {
  const mock = createMockAdapter();

  const { start, track, user, context, flush, dispose } = new Trace({
    events,
    destinations: { product: mock.adapter },
  });

  start();
  user({ id: "ada" });
  context({ screen: "home" });

  const receipt = track("Search Performed", { query: "shoes" });

  await expect(receipt.settled).resolves.toEqual({
    state: "settled",
    outcomes: { product: SUBMITTED },
  });
  expect(mock.sessions[0]?.events[0]).toMatchObject({
    properties: { query: "shoes" },
    context: { screen: "home" },
    identity: { user: { id: "ada" } },
  });
  await expect(flush()).resolves.toMatchObject({ drained: true });

  dispose();
});
