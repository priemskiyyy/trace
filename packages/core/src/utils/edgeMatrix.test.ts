import { afterEach, expect, test, vi } from "vitest";

import { createMockAdapter } from "src/mock/createMockAdapter";
import type { MockIdentityCall } from "src/mock/types/MockIdentityCall";
import type { DestinationOutcome } from "src/types/DestinationOutcome";
import type { TrackResult } from "src/types/TrackResult";
import { createDeferred } from "src/utils/common/createDeferred";
import { event } from "src/utils/event";
import { Trace } from "src/utils/Trace";
import { TraceError } from "src/utils/TraceError";

afterEach(() => {
  vi.useRealTimers();
});

const events = {
  "Checkout Started": event<{ cart: { id: string } }>(),
  "Form Submitted": event<Record<string, unknown>>(),
};

const SUBMITTED: DestinationOutcome = {
  status: "submitted",
  evidence: "sdk-call-returned",
  event: null,
  losses: [],
};

const IDENTITY_CHANGED: DestinationOutcome = {
  status: "dropped",
  reason: "identity-changed",
};

const ANSWERED: TrackResult = {
  status: "submitted",
  evidence: "sdk-call-returned",
};

const createNotInitialized = () =>
  new TraceError({
    code: "NOT_INITIALIZED",
    message: "The SDK is not initialized yet.",
  });

const checkout = (id: string) => ({ cart: { id } });

test("a destination whose SDK is not initialized yet fails its start with NOT_INITIALIZED, keeps its events, and delivers them once a later start opens it, without holding another destination up", async () => {
  let initialized = false;

  const pending = createMockAdapter({
    name: "pending",
    onOpen: () => {
      if (!initialized) {
        throw createNotInitialized();
      }
    },
  });

  const ready = createMockAdapter({ name: "ready" });

  const trace = new Trace({
    events,
    destinations: { pending: pending.adapter, ready: ready.adapter },
  });

  trace.start();

  const receipt = trace.track("Checkout Started", checkout("cart_1"));

  expect(trace.destination("pending").status.get()).toEqual({
    state: "failed",
    error: createNotInitialized(),
  });
  expect(receipt.status.get()).toEqual({
    state: "pending",
    outcomes: { pending: null, ready: SUBMITTED },
  });
  expect(trace.diagnostics.get().destinations[0]?.buffered).toBe(1);

  initialized = true;
  trace.start();

  await expect(receipt.settled).resolves.toEqual({
    state: "settled",
    outcomes: { pending: SUBMITTED, ready: SUBMITTED },
  });
  expect(pending.sessions).toHaveLength(1);
  expect(
    pending.sessions[0]?.events.map(({ properties }) => properties),
  ).toEqual([checkout("cart_1")]);
  expect(trace.destination("pending").status.get()).toEqual({
    state: "ready",
  });
});

test("an account change while an identity step hangs waits for the step's timeout, then resets before the next user is identified, and the late answer changes nothing", async () => {
  vi.useFakeTimers();

  const held = createDeferred();
  const failures: unknown[] = [];

  const mock = createMockAdapter({
    onIdentity: (call) =>
      call.kind === "identify" && call.user.id === "alice"
        ? held.promise
        : undefined,
  });

  const trace = new Trace({ events, destinations: { product: mock.adapter } });

  trace.diagnostics.events.subscribe(({ type, context }) => {
    if (type === "identity step failed") {
      failures.push(context);
    }
  });
  trace.start();
  trace.user({ id: "alice" });

  const alice = trace.track("Checkout Started", checkout("alice-cart"));

  trace.user({ id: "bob" });

  const bob = trace.track("Checkout Started", checkout("bob-cart"));

  await vi.advanceTimersByTimeAsync(4_999);

  expect([alice.status.get(), bob.status.get()]).toEqual([
    { state: "settled", outcomes: { product: IDENTITY_CHANGED } },
    { state: "pending", outcomes: { product: null } },
  ]);

  await vi.advanceTimersByTimeAsync(1);

  expect(bob.status.get()).toEqual({
    state: "settled",
    outcomes: { product: SUBMITTED },
  });

  held.resolve();
  await vi.advanceTimersByTimeAsync(0);

  expect(failures).toEqual([{ step: "identify", reason: "timeout" }]);
  expect(mock.sessions[0]?.identity).toEqual<MockIdentityCall[]>([
    { kind: "identify", user: { id: "alice" } },
    { kind: "reset" },
    { kind: "identify", user: { id: "bob" } },
  ]);
  expect(
    mock.sessions[0]?.events.map(({ properties, identity }) => [
      properties,
      identity.user,
    ]),
  ).toEqual([[checkout("bob-cart"), { id: "bob" }]]);
});

test("signing out drops the previous user's events that were buffered or waiting behind an identity step, while one already handed off settles as its provider answers", async () => {
  const held = createDeferred();

  const product = createMockAdapter({
    name: "product",
    hold: true,
    onTrack: ({ event: handed }) =>
      handed.identity.user === null ? ANSWERED : undefined,
    onIdentity: (call) => (call.kind === "traits" ? held.promise : undefined),
  });

  let ready = false;

  const late = createMockAdapter({
    name: "late",
    onOpen: () => {
      if (!ready) {
        throw createNotInitialized();
      }
    },
  });

  const trace = new Trace({
    events,
    destinations: { product: product.adapter, late: late.adapter },
  });

  trace.start();
  trace.user({ id: "alice" });

  const handedOff = trace.track("Checkout Started", checkout("cart_1"));

  trace.traits({ plan: "pro" });

  const waiting = trace.track("Checkout Started", checkout("cart_2"));

  trace.user(null);

  const anonymous = trace.track("Checkout Started", checkout("cart_3"));

  held.resolve();
  ready = true;
  trace.start();
  product.tracks[0]?.settle();

  expect(
    await Promise.all(
      [handedOff, waiting, anonymous].map(({ settled }) => settled),
    ),
  ).toEqual([
    {
      state: "settled",
      outcomes: { product: SUBMITTED, late: IDENTITY_CHANGED },
    },
    {
      state: "settled",
      outcomes: { product: IDENTITY_CHANGED, late: IDENTITY_CHANGED },
    },
    { state: "settled", outcomes: { product: SUBMITTED, late: SUBMITTED } },
  ]);
  expect(
    [product, late].map(({ sessions }) =>
      sessions[0]?.events.map(({ properties, identity }) => [
        properties,
        identity.user,
      ]),
    ),
  ).toEqual([
    [
      [checkout("cart_1"), { id: "alice" }],
      [checkout("cart_3"), null],
    ],
    [[checkout("cart_3"), null]],
  ]);
  expect([product, late].map(({ sessions }) => sessions[0]?.identity)).toEqual<
    MockIdentityCall[][]
  >([
    [
      { kind: "identify", user: { id: "alice" } },
      {
        kind: "traits",
        user: { id: "alice" },
        set: { plan: "pro" },
        remove: [],
      },
      { kind: "reset" },
    ],
    [{ kind: "reset" }],
  ]);
});

test("while consent is unknown a gated destination opens with collection off, and its events are dropped at acceptance rather than kept for a later grant", () => {
  const gated = createMockAdapter({ name: "gated" });
  const open = createMockAdapter({ name: "open" });

  const trace = new Trace({
    events,
    destinations: { gated: gated.adapter, open: open.adapter },
    consent: { gated: ["analytics"] },
  });

  trace.start();

  const early = trace.track("Checkout Started", checkout("cart_1"));

  const gatedOnly = trace.track("Checkout Started", checkout("cart_2"), {
    to: ["gated"],
  });

  expect([early.status.get(), gatedOnly.status.get()]).toEqual([
    { state: "settled", outcomes: { open: SUBMITTED } },
    { state: "dropped", reason: "consent" },
  ]);
  expect(
    trace.diagnostics
      .get()
      .destinations.map(({ name, buffered }) => [name, buffered]),
  ).toEqual([
    ["gated", 0],
    ["open", 0],
  ]);

  trace.consent.set({ analytics: "granted" });

  const later = trace.track("Checkout Started", checkout("cart_3"));

  expect(later.status.get()).toEqual({
    state: "settled",
    outcomes: { gated: SUBMITTED, open: SUBMITTED },
  });
  expect(gated.sessions[0]?.events.map(({ properties }) => properties)).toEqual(
    [checkout("cart_3")],
  );
  expect(gated.sessions[0]?.collection).toEqual([false, true]);
});

test("a revocation that lands between two identity steps leaves the applied identity unknown, so the next grant resets the provider before identifying again", async () => {
  let revoked = false;

  const mock = createMockAdapter({
    onIdentity: (call) => {
      if (call.kind === "identify" && !revoked) {
        revoked = true;
        trace.consent.set({ analytics: "denied" });
      }
    },
  });

  const trace = new Trace({
    events,
    destinations: { product: mock.adapter },
    consent: { product: ["analytics"] },
  });

  trace.consent.set({ analytics: "granted" });
  trace.start();
  trace.user({ id: "alice", traits: { plan: "pro" } });
  trace.consent.set({ analytics: "granted" });

  const receipt = trace.track("Checkout Started", checkout("cart_1"));

  await expect(receipt.settled).resolves.toEqual({
    state: "settled",
    outcomes: { product: SUBMITTED },
  });
  expect(mock.sessions[0]?.identity).toEqual<MockIdentityCall[]>([
    { kind: "identify", user: { id: "alice" } },
    { kind: "reset" },
    { kind: "identify", user: { id: "alice" } },
    { kind: "traits", user: { id: "alice" }, set: { plan: "pro" }, remove: [] },
  ]);
  expect(mock.sessions[0]?.collection).toEqual([true, false, true]);
});

test("a provider that answers after the timeout leaves the event indeterminate, its late answer changes nothing, and the event is never handed over again", async () => {
  vi.useFakeTimers();

  const mock = createMockAdapter({ hold: true });
  const trace = new Trace({ events, destinations: { product: mock.adapter } });

  trace.start();

  const receipt = trace.track("Checkout Started", checkout("cart_1"));

  await vi.advanceTimersByTimeAsync(4_999);

  expect(receipt.status.get()).toEqual({
    state: "pending",
    outcomes: { product: null },
  });

  await vi.advanceTimersByTimeAsync(1);

  const timedOut = {
    state: "settled",
    outcomes: { product: { status: "indeterminate", reason: "timeout" } },
  };

  expect(receipt.status.get()).toEqual(timedOut);
  expect(mock.tracks[0]?.context.signal.aborted).toBe(true);

  mock.tracks[0]?.settle();
  await vi.advanceTimersByTimeAsync(0);

  await expect(receipt.settled).resolves.toEqual(timedOut);
  expect(receipt.status.get()).toEqual(timedOut);
  expect(mock.tracks).toHaveLength(1);
});

test("the same provider configured under two names is two independent destinations, each with its own session, route and receipt slot", () => {
  const mock = createMockAdapter();

  const trace = new Trace({
    events,
    destinations: { eu: mock.adapter, us: mock.adapter },
  });

  trace.start();
  trace.user({ id: "alice" });

  const euOnly = trace.track("Checkout Started", checkout("cart_1"), {
    to: ["eu"],
  });

  const both = trace.track("Checkout Started", checkout("cart_2"));

  trace.dispose();

  expect([euOnly.status.get(), both.status.get()]).toEqual([
    { state: "settled", outcomes: { eu: SUBMITTED } },
    { state: "settled", outcomes: { eu: SUBMITTED, us: SUBMITTED } },
  ]);
  expect(
    mock.sessions.map(({ events: tracked, identity, disposeCount }) => ({
      events: tracked.map(({ properties }) => properties),
      identity,
      disposeCount,
    })),
  ).toEqual([
    {
      events: [checkout("cart_1"), checkout("cart_2")],
      identity: [{ kind: "identify", user: { id: "alice" } }],
      disposeCount: 1,
    },
    {
      events: [checkout("cart_2")],
      identity: [{ kind: "identify", user: { id: "alice" } }],
      disposeCount: 1,
    },
  ]);
  expect(mock.sessions[1]?.events[0]).toBe(mock.sessions[0]?.events[1]);
});

test("two Trace instances share nothing: identity, consent, receipts and sessions stay per instance, as a server's per-request Traces need", () => {
  const mock = createMockAdapter();

  const first = new Trace({
    events,
    destinations: { product: mock.adapter },
    consent: { product: ["analytics"] },
  });

  const second = new Trace({
    events,
    destinations: { product: mock.adapter },
    consent: { product: ["analytics"] },
  });

  first.start();
  second.start();
  first.consent.set({ analytics: "granted" });
  first.user({ id: "alice" });
  second.user({ id: "bob" });

  const fromFirst = first.track("Checkout Started", checkout("alice-cart"));
  const fromSecond = second.track("Checkout Started", checkout("bob-cart"));

  expect([first.consent.get(), second.consent.get()]).toEqual([
    { analytics: "granted" },
    { analytics: "unknown" },
  ]);

  second.consent.set({ analytics: "granted" });
  first.dispose();

  const afterDispose = second.track("Checkout Started", checkout("bob-cart-2"));

  expect(
    [fromFirst, fromSecond, afterDispose].map(({ status }) => status.get()),
  ).toEqual([
    { state: "settled", outcomes: { product: SUBMITTED } },
    { state: "dropped", reason: "consent" },
    { state: "settled", outcomes: { product: SUBMITTED } },
  ]);
  expect(
    mock.sessions.map(
      ({ events: tracked, identity, collection, disposeCount }) => ({
        events: tracked.map(
          ({ properties, identity: { generation, user } }) => [
            properties,
            generation,
            user,
          ],
        ),
        identity,
        collection,
        disposeCount,
      }),
    ),
  ).toEqual([
    {
      events: [[checkout("alice-cart"), 1, { id: "alice" }]],
      identity: [{ kind: "identify", user: { id: "alice" } }],
      collection: [false, true],
      disposeCount: 1,
    },
    {
      events: [[checkout("bob-cart-2"), 1, { id: "bob" }]],
      identity: [{ kind: "identify", user: { id: "bob" } }],
      collection: [false, true],
      disposeCount: 0,
    },
  ]);
  expect([
    first.diagnostics.get().identity,
    second.diagnostics.get().identity,
  ]).toEqual([
    { generation: 1, user: { id: "alice" } },
    { generation: 1, user: { id: "bob" } },
  ]);
});

test("invalid values never throw into the host and never reach a provider as they were: each is made plain or removed and reported, and refused identity input is recorded", () => {
  const mock = createMockAdapter();
  const refusals: unknown[] = [];
  const trace = new Trace({ events, destinations: { product: mock.adapter } });

  trace.diagnostics.events.subscribe(({ type, context }) => {
    if (type.endsWith("refused")) {
      refusals.push({ type, context });
    }
  });
  trace.start();

  const cyclic: Record<string, unknown> = { id: "c_1" };

  cyclic["self"] = cyclic;

  const receipt = trace.track(
    "Form Submitted",
    {
      when: new Date(0),
      count: 10n,
      ratio: Number.NaN,
      run: () => {},
      tag: Symbol("tag"),
      lookup: new Map([["a", 1]]),
      cyclic,
      get computed(): string {
        throw new Error("A getter ran.");
      },
    },
    { timestamp: Number.NaN },
  );

  trace.user({ id: "" });
  // @ts-expect-error A group id is a string.
  trace.group("workspace", { id: 5 });
  // @ts-expect-error Traits are an object of trait values.
  trace.traits("pro");
  expect(mock.sessions[0]?.events.map(({ properties }) => properties)).toEqual([
    { when: "1970-01-01T00:00:00.000Z", count: "10", cyclic: { id: "c_1" } },
  ]);
  expect(receipt.status.get()).toEqual({
    state: "settled",
    outcomes: {
      product: {
        ...SUBMITTED,
        losses: [
          { path: "properties.when", reason: "coerced" },
          { path: "properties.count", reason: "coerced" },
          { path: "properties.ratio", reason: "invalid" },
          { path: "properties.run", reason: "invalid" },
          { path: "properties.tag", reason: "invalid" },
          { path: "properties.lookup", reason: "unsupported" },
          { path: "properties.cyclic.self", reason: "truncated" },
          { path: "properties.computed", reason: "omitted" },
          { path: "timestamp", reason: "invalid" },
        ],
      },
    },
  });
  expect(refusals).toEqual([
    { type: "user refused", context: null },
    { type: "group refused", context: { path: "groups.workspace" } },
    { type: "traits refused", context: { path: "traits" } },
  ]);
  expect(mock.sessions[0]?.identity).toEqual([]);
});

test("a clock that moves backwards changes no event's time and keeps nothing waiting for as long as it jumped: each event keeps the time it was accepted at, and waiting events are re-based", async () => {
  vi.useFakeTimers();

  const start = 1_767_225_600_000;

  let clock = start;

  const product = createMockAdapter({ name: "product" });

  const unready = createMockAdapter({
    name: "unready",
    onOpen: () => {
      throw createNotInitialized();
    },
  });

  const trace = new Trace({
    events,
    destinations: { product: product.adapter, unready: unready.adapter },
    now: () => clock,
  });

  const receipts = [trace.track("Checkout Started", checkout("cart_1"))];

  clock -= 3_600_000;
  receipts.push(
    trace.track("Checkout Started", checkout("cart_2")),
    trace.track("Checkout Started", checkout("cart_3"), {
      timestamp: 1_700_000_000_000,
    }),
  );
  trace.start();

  expect(
    product.sessions[0]?.events.map(({ properties, timestamp }) => [
      properties,
      timestamp,
    ]),
  ).toEqual([
    [checkout("cart_1"), start],
    [checkout("cart_2"), start - 3_600_000],
    [checkout("cart_3"), 1_700_000_000_000],
  ]);

  clock += 29_999;
  await vi.advanceTimersByTimeAsync(29_999);

  expect(receipts.map(({ status }) => status.get())).toEqual(
    Array.from({ length: 3 }, () => ({
      state: "pending",
      outcomes: { product: SUBMITTED, unready: null },
    })),
  );

  clock += 1;
  await vi.advanceTimersByTimeAsync(1);

  expect(receipts.map(({ status }) => status.get())).toEqual(
    Array.from({ length: 3 }, () => ({
      state: "settled",
      outcomes: {
        product: SUBMITTED,
        unready: { status: "skipped", reason: "start-failed" },
      },
    })),
  );
});

test("start called again, or from inside an open, opens each destination once and retries a failed one once when the attempt ends, and dispose called again releases nothing twice", () => {
  let attempts = 0;

  const flaky = createMockAdapter({
    name: "flaky",
    onOpen: () => {
      attempts += 1;

      if (attempts === 1) {
        trace.start();

        throw createNotInitialized();
      }
    },
  });

  const steady = createMockAdapter({ name: "steady" });

  const trace = new Trace({
    events,
    destinations: { flaky: flaky.adapter, steady: steady.adapter },
  });

  trace.start();

  expect(attempts).toBe(2);
  expect(trace.destination("flaky").status.get()).toEqual({ state: "ready" });

  trace.start();
  trace.start();

  expect(attempts).toBe(2);
  expect([flaky.sessions.length, steady.sessions.length]).toEqual([1, 1]);

  trace.dispose();
  trace.dispose();
  trace.start();

  expect(attempts).toBe(2);
  expect(
    [flaky, steady].map(({ sessions }) =>
      sessions.map(({ disposeCount }) => disposeCount),
    ),
  ).toEqual([[1], [1]]);
});

test("hot reload by dispose and a new Trace: the old one settles what it held and hears nothing more, and the new one starts clean over the same adapters", async () => {
  const mock = createMockAdapter({ hold: true });
  const heard: string[] = [];
  const old = new Trace({ events, destinations: { product: mock.adapter } });

  old.events.subscribe(({ id }) => heard.push(`old ${id}`));
  old.start();
  old.user({ id: "alice" });

  const inFlight = old.track("Checkout Started", checkout("cart_1"));

  old.dispose();

  const next = new Trace({ events, destinations: { product: mock.adapter } });

  next.events.subscribe(({ id }) => heard.push(`next ${id}`));
  next.start();

  const fresh = next.track("Checkout Started", checkout("cart_2"));
  const late = old.track("Checkout Started", checkout("cart_3"));

  mock.tracks[1]?.settle();

  await expect(inFlight.settled).resolves.toEqual({
    state: "settled",
    outcomes: { product: { status: "indeterminate", reason: "disposed" } },
  });
  await expect(fresh.settled).resolves.toEqual({
    state: "settled",
    outcomes: { product: SUBMITTED },
  });
  expect(late.status.get()).toEqual({ state: "dropped", reason: "disposed" });
  expect(heard).toEqual([`old ${inFlight.id}`, `next ${fresh.id}`]);
  expect(
    mock.sessions.map(({ events: tracked, identity, disposeCount }) => ({
      events: tracked.map(({ properties, identity: tracked }) => [
        properties,
        tracked,
      ]),
      identity,
      disposeCount,
    })),
  ).toEqual([
    {
      events: [
        [
          checkout("cart_1"),
          { generation: 1, user: { id: "alice" }, traits: {}, groups: {} },
        ],
      ],
      identity: [{ kind: "identify", user: { id: "alice" } }],
      disposeCount: 1,
    },
    {
      events: [
        [
          checkout("cart_2"),
          { generation: 0, user: null, traits: {}, groups: {} },
        ],
      ],
      identity: [],
      disposeCount: 0,
    },
  ]);
});
