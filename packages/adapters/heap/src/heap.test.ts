import { event, Trace, TraceError } from "@priemskiyyy/trace";
import type { TraceDiagnosticEvent, TrackContext } from "@priemskiyyy/trace";
import { expect, onTestFinished, test } from "vitest";

import { fakeHeap } from "src/fakeHeap.fixture";
import { heap } from "src/heap";
import { createTrackedEvent } from "src/trackedEvent.fixture";

type FakeHeap = ReturnType<typeof fakeHeap>;

const TIMESTAMP = 1_767_225_600_000;

const TIMESTAMP_LOSS = { path: "timestamp", reason: "unsupported" };

const NOT_LOADED = new TraceError({
  code: "NOT_INITIALIZED",
  message:
    "Heap has not loaded. Call trace.start() again from heap.onReady, over an sdk that reads the current window.heap.",
});

const REFUSED_IDENTITY = new TraceError({
  code: "DELIVERY_FAILED",
  message:
    "Heap would ignore or cut this identity and file its events under another user, so it is not sent.",
});

const PARTIAL_TRAITS = new TraceError({
  code: "UNSUPPORTED",
  message:
    "Heap cannot remove a user property, nor keep a blank, nested or over-long one; the others were set.",
});

const NOTHING_CALLED = {
  track: [],
  identify: [],
  addUserProperties: [],
  resetIdentity: 0,
  load: 0,
  init: 0,
  stopTracking: 0,
  startTracking: 0,
  addEventProperties: 0,
  clearEventProperties: 0,
};

const context: TrackContext = {
  signal: new AbortController().signal,
  currentGeneration: () => 1,
  now: () => TIMESTAMP,
};

const events = {
  "Checkout Started": event<{ cart: { id: string }; value: number }>(),
  "Note Added": event<{ note: string }>(),
};

const createTrace = (
  fake = fakeHeap(),
  options: { consent?: { product: ["analytics"] } } = {},
) => {
  const trace = new Trace({
    events,
    destinations: { product: heap({ sdk: fake.sdk }) },
    now: () => TIMESTAMP,
    ...options,
  });

  onTestFinished(trace.dispose);

  return { fake, trace };
};

const getThrown = (call: () => unknown) => {
  try {
    call();
  } catch (error) {
    return error;
  }

  return null;
};

const getAttributed = (fake: FakeHeap) =>
  fake.events.map(({ name, properties, user }) => ({
    name,
    properties,
    identity: user.identity,
  }));

const getProfiles = (fake: FakeHeap) =>
  fake.users.map(({ identity, properties }) => ({ identity, properties }));

const watchDiagnostics = (trace: ReturnType<typeof createTrace>["trace"]) => {
  const diagnostics: TraceDiagnosticEvent[] = [];

  trace.diagnostics.events.subscribe((diagnostic) => {
    diagnostics.push(diagnostic);
  });

  return (type: string) =>
    diagnostics.flatMap((diagnostic) =>
      diagnostic.type === type ? [diagnostic.context] : [],
    );
};

test("creating the adapter calls nothing on Heap", () => {
  const fake = fakeHeap({ loaded: false });

  heap({ sdk: fake.sdk });

  expect(fake.calls).toStrictEqual(NOTHING_CALLED);
});

test("open refuses a Heap that has not loaded with NOT_INITIALIZED, calling nothing, and opens once it has", () => {
  const fake = fakeHeap({ loaded: false });
  const adapter = heap({ sdk: fake.sdk });

  expect(getThrown(adapter.open)).toStrictEqual(NOT_LOADED);
  expect(fake.calls).toStrictEqual(NOTHING_CALLED);

  fake.sdk.loaded = true;

  expect(adapter.open().native).toBe(fake.sdk);
});

test("open refuses the snippet's stub, which has no loaded flag, because heap.js replaces it and drops what it queues afterwards", () => {
  const fake = fakeHeap();

  const stub = {
    track: fake.sdk.track,
    identify: fake.sdk.identify,
    addUserProperties: fake.sdk.addUserProperties,
    resetIdentity: fake.sdk.resetIdentity,
  };

  expect(getThrown(heap({ sdk: stub }).open)).toStrictEqual(NOT_LOADED);
});

test("a Heap that has not loaded fails the start, and a start after it loaded delivers the event that waited", async () => {
  const { fake, trace } = createTrace(fakeHeap({ loaded: false }));

  trace.start();

  const receipt = trace.track("Checkout Started", {
    cart: { id: "cart_1" },
    value: 49.5,
  });

  expect(trace.destination("product").status.get()).toStrictEqual({
    state: "failed",
    error: NOT_LOADED,
  });
  expect(fake.calls.track).toStrictEqual([]);

  fake.sdk.loaded = true;
  trace.start();

  await expect(receipt.settled).resolves.toStrictEqual({
    state: "settled",
    outcomes: {
      product: {
        status: "submitted",
        evidence: "sdk-call-returned",
        event: null,
        losses: [
          { path: "properties.cart", reason: "unsupported" },
          TIMESTAMP_LOSS,
        ],
      },
    },
  });
  expect(getAttributed(fake)).toStrictEqual([
    {
      name: "Checkout Started",
      properties: { value: "49.5" },
      identity: null,
    },
  ]);
});

test("an event is one track call with its context under its properties, properties winning, submitted with the evidence the call proves", () => {
  const fake = fakeHeap();
  const session = heap({ sdk: fake.sdk }).open();

  const answer = session.track(
    createTrackedEvent({
      properties: { cart_id: "cart_1", value: 49.5, plan: "pro" },
      context: { locale: "de", plan: "free" },
    }),
    context,
  );

  expect(fake.calls.track).toStrictEqual([
    [
      "Checkout Started",
      { locale: "de", plan: "pro", cart_id: "cart_1", value: 49.5 },
    ],
  ]);
  expect(answer).toStrictEqual({
    status: "submitted",
    evidence: "sdk-call-returned",
    losses: [{ path: "context.plan", reason: "omitted" }, TIMESTAMP_LOSS],
  });
});

test("what Heap cannot keep as it is is reported in order, properties, then context, then the timestamp, and heap.js changes it itself", () => {
  const fake = fakeHeap();
  const session = heap({ sdk: fake.sdk }).open();

  const answer = session.track(
    createTrackedEvent({
      properties: {
        cart: { id: "cart_1" },
        note: "n".repeat(1500),
        coupon: null,
        tags: ["gift", "sale"],
        beta: true,
      },
      context: { app: { version: "2.4.0" }, referrer: "", locale: "de" },
    }),
    context,
  );

  expect(answer).toStrictEqual({
    status: "submitted",
    evidence: "sdk-call-returned",
    losses: [
      { path: "properties.cart", reason: "unsupported" },
      { path: "properties.note", reason: "truncated" },
      { path: "properties.coupon", reason: "unsupported" },
      { path: "properties.tags", reason: "coerced" },
      { path: "properties.beta", reason: "coerced" },
      { path: "context.app", reason: "unsupported" },
      { path: "context.referrer", reason: "unsupported" },
      TIMESTAMP_LOSS,
    ],
  });
  expect(fake.events[0]?.properties).toStrictEqual({
    locale: "de",
    note: "n".repeat(1024),
    tags: "gift||sale",
    beta: "true",
  });
});

test("an event name past Heap's 255 characters is dropped as provider-filtered and never reaches Heap, the cause first, then the losses of the mapping", () => {
  const fake = fakeHeap();
  const session = heap({ sdk: fake.sdk }).open();

  expect(
    session.track(
      createTrackedEvent({
        name: "e".repeat(256),
        properties: { cart: { id: "cart_1" } },
      }),
      context,
    ),
  ).toStrictEqual({
    status: "dropped",
    reason: "provider-filtered",
    losses: [
      { path: "name", reason: "invalid" },
      { path: "properties.cart", reason: "unsupported" },
      TIMESTAMP_LOSS,
    ],
  });
  expect(fake.calls.track).toStrictEqual([]);

  session.track(createTrackedEvent({ name: "e".repeat(255) }), context);

  expect(fake.calls.track).toStrictEqual([["e".repeat(255), {}]]);
});

test("a name heap.js would drop without a word, past 1024 bytes, never reaches it, and its receipt says so", async () => {
  const fake = fakeHeap();
  const name = "é".repeat(513);

  const trace = new Trace({
    events: { [name]: event() },
    destinations: { product: heap({ sdk: fake.sdk }) },
  });

  onTestFinished(trace.dispose);
  trace.start();

  await expect(trace.track(name).settled).resolves.toStrictEqual({
    state: "settled",
    outcomes: {
      product: {
        status: "dropped",
        reason: "provider-filtered",
        losses: [{ path: "name", reason: "invalid" }, TIMESTAMP_LOSS],
      },
    },
  });
  expect(fake.calls.track).toStrictEqual([]);
});

test.each(["click", "change", "pageview", "submit"])(
  "the reserved event name %j is dropped as provider-filtered, because Heap's track refuses it",
  (name) => {
    const fake = fakeHeap();

    expect(
      heap({ sdk: fake.sdk })
        .open()
        .track(createTrackedEvent({ name }), context),
    ).toStrictEqual({
      status: "dropped",
      reason: "provider-filtered",
      losses: [{ path: "name", reason: "invalid" }, TIMESTAMP_LOSS],
    });
    expect(fake.calls.track).toStrictEqual([]);
  },
);

test("an event is filed under the user Trace identified first, and a user switch resets Heap before the next user", async () => {
  const { fake, trace } = createTrace();

  trace.start();
  trace.user({ id: "ada" });
  await trace.track("Note Added", { note: "first" }).settled;
  trace.user({ id: "bob" });
  await trace.track("Note Added", { note: "second" }).settled;

  expect(
    getAttributed(fake).map(({ properties, identity }) => [
      properties.note,
      identity,
    ]),
  ).toStrictEqual([
    ["first", "ada"],
    ["second", "bob"],
  ]);
  expect(fake.calls.identify).toStrictEqual(["ada", "bob"]);
  expect(fake.calls.resetIdentity).toBe(1);
});

test("signing out resets Heap to a new anonymous user before the next event", async () => {
  const { fake, trace } = createTrace();

  trace.start();
  trace.user({ id: "ada", traits: { plan: "pro" } });
  await trace.track("Note Added", { note: "signed in" }).settled;
  trace.user(null);
  await trace.track("Note Added", { note: "signed out" }).settled;

  expect(getAttributed(fake).map(({ identity }) => identity)).toStrictEqual([
    "ada",
    null,
  ]);
  expect(fake.calls.resetIdentity).toBe(1);
  expect(getProfiles(fake)).toStrictEqual([
    { identity: "ada", properties: { plan: "pro" } },
    { identity: null, properties: {} },
  ]);
});

test("identify calls identify with the user's id", () => {
  const fake = fakeHeap();

  expect(
    heap({ sdk: fake.sdk })
      .open()
      .identify?.({ user: { id: "ada" } }),
  ).toBeUndefined();
  expect(fake.calls.identify).toStrictEqual(["ada"]);
});

test.each([
  ["anonymous", "anonymous"],
  ["0", "0"],
  ["Guest", "Guest"],
  ["an id of 255 characters", "a".repeat(255)],
])(
  "identify fails for %s with DELIVERY_FAILED and never calls Heap, because heap.js ignores it, or Heap documents fewer than 255 characters",
  (_label, id) => {
    const fake = fakeHeap();
    const session = heap({ sdk: fake.sdk }).open();

    expect(getThrown(() => session.identify?.({ user: { id } }))).toStrictEqual(
      REFUSED_IDENTITY,
    );
    expect(fake.calls.identify).toStrictEqual([]);
  },
);

test.each([
  ["0", "0"],
  ["guest", "guest"],
  ["an id of 300 characters", "u".repeat(300)],
])(
  "a user Heap refuses (%s) never reaches Heap, so after a sign-out the next user's identify takes over none of that user's events or traits",
  async (_label, id) => {
    const { fake, trace } = createTrace();
    const getDiagnostics = watchDiagnostics(trace);

    trace.start();
    trace.user({ id, traits: { plan: "pro", company: "Acme" } });

    await expect(
      trace.track("Note Added", { note: "refused" }).settled,
    ).resolves.toStrictEqual({
      state: "settled",
      outcomes: { product: { status: "skipped", reason: "identity-failed" } },
    });

    trace.user(null);
    trace.user({ id: "bob", traits: { plan: "free" } });
    await trace.track("Note Added", { note: "bob" }).settled;

    expect(getAttributed(fake)).toStrictEqual([
      { name: "Note Added", properties: { note: "bob" }, identity: "bob" },
    ]);
    expect(getProfiles(fake)).toStrictEqual([
      { identity: "bob", properties: { plan: "free" } },
    ]);
    expect(getDiagnostics("identity step failed")).toStrictEqual([
      { step: "identify", reason: "error" },
      { step: "identify", reason: "error" },
    ]);
  },
);

test("a user Heap refuses, then a direct switch: the next user takes over none of the first one's events or traits", async () => {
  const { fake, trace } = createTrace();

  trace.start();
  trace.user({ id: "anonymous", traits: { company: "Acme" } });

  await expect(
    trace.track("Note Added", { note: "refused" }).settled,
  ).resolves.toStrictEqual({
    state: "settled",
    outcomes: { product: { status: "skipped", reason: "identity-failed" } },
  });

  trace.user({ id: "bob" });
  await trace.track("Note Added", { note: "bob" }).settled;

  expect(getAttributed(fake)).toStrictEqual([
    { name: "Note Added", properties: { note: "bob" }, identity: "bob" },
  ]);
  expect(getProfiles(fake)).toStrictEqual([
    { identity: "bob", properties: {} },
  ]);
});

test("traits become one addUserProperties call", () => {
  const fake = fakeHeap();

  expect(
    heap({ sdk: fake.sdk })
      .open()
      .traits?.({
        user: { id: "ada" },
        set: { plan: "pro", seats: 4, beta: true },
        remove: [],
      }),
  ).toBeUndefined();
  expect(fake.calls.addUserProperties).toStrictEqual([
    { plan: "pro", seats: 4, beta: true },
  ]);
});

test("a trait removal throws UNSUPPORTED once the values were set, because Heap has no call that removes one", () => {
  const fake = fakeHeap();
  const session = heap({ sdk: fake.sdk }).open();

  expect(
    getThrown(() =>
      session.traits?.({
        user: { id: "ada" },
        set: { plan: "pro" },
        remove: ["role"],
      }),
    ),
  ).toStrictEqual(PARTIAL_TRAITS);
  expect(fake.calls.addUserProperties).toStrictEqual([{ plan: "pro" }]);
});

test("an update that only removes calls nothing and throws UNSUPPORTED", () => {
  const fake = fakeHeap();
  const session = heap({ sdk: fake.sdk }).open();

  expect(
    getThrown(() =>
      session.traits?.({ user: null, set: {}, remove: ["role"] }),
    ),
  ).toStrictEqual(PARTIAL_TRAITS);
  expect(fake.calls.addUserProperties).toStrictEqual([]);
});

test("a trait Heap would cut, a blank or nested one, or one with a name Heap refuses is left out and the step throws UNSUPPORTED once the rest was set", () => {
  const fake = fakeHeap();
  const session = heap({ sdk: fake.sdk }).open();

  expect(
    getThrown(() =>
      session.traits?.({
        user: { id: "ada" },
        set: {
          plan: "pro",
          bio: "b".repeat(256),
          address: { city: "Kyiv" },
          nickname: "",
          ["k".repeat(512)]: "long",
        },
        remove: [],
      }),
    ),
  ).toStrictEqual(PARTIAL_TRAITS);
  expect(fake.calls.addUserProperties).toStrictEqual([{ plan: "pro" }]);
  expect(fake.state.user.properties).toStrictEqual({ plan: "pro" });
});

test("a refused identity fails each identity pass that tries it, the one right after the change and the event's own, and the event is skipped", async () => {
  const { fake, trace } = createTrace();
  const getDiagnostics = watchDiagnostics(trace);

  trace.start();
  trace.user({ id: "null" });

  await expect(
    trace.track("Note Added", { note: "hello" }).settled,
  ).resolves.toStrictEqual({
    state: "settled",
    outcomes: { product: { status: "skipped", reason: "identity-failed" } },
  });
  expect(getDiagnostics("identity step failed")).toStrictEqual([
    { step: "identify", reason: "error" },
    { step: "identify", reason: "error" },
  ]);
  expect(fake.calls.identify).toStrictEqual([]);
  expect(fake.calls.track).toStrictEqual([]);
});

test("a removed trait is reported as an unsupported identity step through Trace, which counts it as done", async () => {
  const { fake, trace } = createTrace();
  const getDiagnostics = watchDiagnostics(trace);

  trace.start();
  trace.user({ id: "ada", traits: { plan: "pro", role: "admin" } });
  await trace.track("Note Added", { note: "first" }).settled;
  trace.traits({ role: null });

  await expect(
    trace.track("Note Added", { note: "second" }).settled,
  ).resolves.toStrictEqual({
    state: "settled",
    outcomes: {
      product: {
        status: "submitted",
        evidence: "sdk-call-returned",
        event: null,
        losses: [TIMESTAMP_LOSS],
      },
    },
  });
  expect(fake.calls.addUserProperties).toStrictEqual([
    { plan: "pro", role: "admin" },
  ]);
  expect(getDiagnostics("identity step unsupported")).toStrictEqual([
    { step: "traits" },
  ]);
});

test("reset calls resetIdentity", () => {
  const fake = fakeHeap();

  expect(heap({ sdk: fake.sdk }).open().reset?.()).toBeUndefined();
  expect(fake.calls.resetIdentity).toBe(1);
});

test("the session has no group, collection, flush or dispose, because heap.js offers none it can undo", () => {
  expect(Object.keys(heap({ sdk: fakeHeap().sdk }).open())).toStrictEqual([
    "native",
    "track",
    "identify",
    "traits",
    "reset",
  ]);
});

test("a gated Heap receives nothing while consent is closed, and Trace never stops or restarts its tracking", async () => {
  const { fake, trace } = createTrace(fakeHeap(), {
    consent: { product: ["analytics"] },
  });

  trace.start();

  await expect(
    trace.track("Note Added", { note: "before" }).settled,
  ).resolves.toStrictEqual({ state: "dropped", reason: "consent" });

  trace.consent.set({ analytics: "granted" });

  await expect(
    trace.track("Note Added", { note: "after" }).settled,
  ).resolves.toStrictEqual({
    state: "settled",
    outcomes: {
      product: {
        status: "submitted",
        evidence: "sdk-call-returned",
        event: null,
        losses: [TIMESTAMP_LOSS],
      },
    },
  });

  trace.consent.set({ analytics: "denied" });

  expect(fake.calls.track).toStrictEqual([["Note Added", { note: "after" }]]);
  expect(fake.calls.stopTracking).toBe(0);
  expect(fake.calls.startTracking).toBe(0);
});

test("flush reports unsupported, because heap.js sends its queue on its own schedule", async () => {
  const { trace } = createTrace();

  trace.start();

  await expect(trace.flush()).resolves.toEqual({
    drained: true,
    destinations: { product: { status: "unsupported" } },
  });
});

test("the native handle is the sdk the application passed", () => {
  const { fake, trace } = createTrace();

  trace.start();

  expect(trace.destination("product").native).toBe(fake.sdk);
});

test("Trace never loads, initializes, stops or restarts Heap, nor writes its super properties", async () => {
  const { fake, trace } = createTrace(fakeHeap(), {
    consent: { product: ["analytics"] },
  });

  trace.start();
  trace.consent.set({ analytics: "granted" });
  trace.user({ id: "ada", traits: { plan: "pro" } });
  trace.group("workspace", { id: "workspace_1", traits: { seats: 3 } });
  await trace.track("Note Added", { note: "hello" }).settled;
  trace.user(null);
  await trace.flush();
  trace.consent.set({ analytics: "denied" });
  trace.dispose();

  expect(fake.calls).toStrictEqual({
    ...NOTHING_CALLED,
    track: [["Note Added", { note: "hello" }]],
    identify: ["ada"],
    addUserProperties: [{ plan: "pro" }],
    resetIdentity: 1,
  });
});
