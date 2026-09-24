import { event, Trace } from "@priemskiyyy/trace";
import type { TrackContext, TrackedEvent } from "@priemskiyyy/trace";
import { expect, onTestFinished, test } from "vitest";

import { fakeFathom } from "src/fakeFathom.fixture";
import { fathom } from "src/fathom";
import { createTrackedEvent } from "src/trackedEvent.fixture";

const TIMESTAMP = 1_767_225_600_000;

const TIMESTAMP_LOSS = { path: "timestamp", reason: "unsupported" };

const NOTHING_CALLED = {
  trackEvent: [],
  load: 0,
  setSite: 0,
  trackPageview: 0,
  trackGoal: 0,
  blockTrackingForMe: 0,
  enableTrackingForMe: 0,
};

const context: TrackContext = {
  signal: new AbortController().signal,
  currentGeneration: () => 1,
  now: () => TIMESTAMP,
};

const events = {
  "Order Completed": event<{ order_id: string; total: number }>(),
  "Signup Completed": event(),
};

const getOrderValue = ({ name, properties }: TrackedEvent) =>
  name === "Order Completed" && typeof properties.total === "number"
    ? Math.round(properties.total * 100)
    : null;

const createTrace = (
  fake = fakeFathom(),
  options: { consent?: { site: ["analytics"] } } = {},
) => {
  const trace = new Trace({
    events,
    destinations: { site: fathom({ sdk: fake.sdk, value: getOrderValue }) },
    now: () => TIMESTAMP,
    ...options,
  });

  onTestFinished(trace.dispose);

  return { fake, trace };
};

test("creating the adapter calls nothing on Fathom", () => {
  const fake = fakeFathom({ loaded: false });

  fathom({ sdk: fake.sdk, value: getOrderValue });

  expect(fake.calls).toStrictEqual(NOTHING_CALLED);
});

test("open calls nothing on Fathom, whose client queues what it is given until its script has loaded", () => {
  const fake = fakeFathom({ loaded: false });
  const session = fathom({ sdk: fake.sdk }).open();

  expect(session.native).toBe(fake.sdk);
  expect(fake.calls).toStrictEqual(NOTHING_CALLED);
});

test("an event is one trackEvent call by its name, and every property and context key is an unsupported loss, in that order", () => {
  const fake = fakeFathom();

  const answer = fathom({ sdk: fake.sdk })
    .open()
    .track(
      createTrackedEvent({
        properties: { order_id: "order_1", total: 49.5 },
        context: { locale: "de", total: 1 },
      }),
      context,
    );

  expect(fake.calls.trackEvent).toStrictEqual([
    ["Checkout Started", undefined],
  ]);
  expect(answer).toStrictEqual({
    status: "submitted",
    evidence: "sdk-call-returned",
    losses: [
      { path: "properties.order_id", reason: "unsupported" },
      { path: "properties.total", reason: "unsupported" },
      { path: "context.locale", reason: "unsupported" },
      { path: "context.total", reason: "unsupported" },
      TIMESTAMP_LOSS,
    ],
  });
});

test("the value the mapping answers travels as _value, in cents", () => {
  const fake = fakeFathom();

  fathom({ sdk: fake.sdk, value: getOrderValue })
    .open()
    .track(
      createTrackedEvent({
        name: "Order Completed",
        properties: { order_id: "order_1", total: 49.5 },
      }),
      context,
    );

  expect(fake.calls.trackEvent).toStrictEqual([
    ["Order Completed", { _value: 4950 }],
  ]);
  expect(fake.sent).toStrictEqual([
    { name: "Order Completed", payload: { _value: 4950 } },
  ]);
});

test("a value that is not whole cents is left out as invalid, never rounded, and the event is still sent", () => {
  const fake = fakeFathom();

  const answer = fathom({
    sdk: fake.sdk,
    value: ({ properties }) =>
      typeof properties.total === "number" ? properties.total * 100 : null,
  })
    .open()
    .track(
      createTrackedEvent({
        name: "Order Completed",
        properties: { total: 19.99 },
      }),
      context,
    );

  expect(fake.calls.trackEvent).toStrictEqual([["Order Completed", undefined]]);
  expect(answer).toStrictEqual({
    status: "submitted",
    evidence: "sdk-call-returned",
    losses: [
      { path: "properties.total", reason: "unsupported" },
      TIMESTAMP_LOSS,
      { path: "value", reason: "invalid" },
    ],
  });
});

test("an event the mapping answers null for carries no value", () => {
  const fake = fakeFathom();

  fathom({ sdk: fake.sdk, value: getOrderValue })
    .open()
    .track(createTrackedEvent({ name: "Signup Completed" }), context);

  expect(fake.calls.trackEvent).toStrictEqual([
    ["Signup Completed", undefined],
  ]);
});

test("the mapping receives the frozen event every destination sees", () => {
  const seen: TrackedEvent[] = [];
  const tracked = createTrackedEvent();

  fathom({
    sdk: fakeFathom().sdk,
    value: (received) => {
      seen.push(received);

      return null;
    },
  })
    .open()
    .track(tracked, context);

  expect(seen).toStrictEqual([tracked]);
  expect(seen[0]).toBe(tracked);
});

test("a value that throws fails its event, and nothing reaches Fathom", async () => {
  const fake = fakeFathom();
  const error = new Error("the mapping is broken");

  const trace = new Trace({
    events,
    destinations: {
      site: fathom({
        sdk: fake.sdk,
        value: () => {
          throw error;
        },
      }),
    },
  });

  onTestFinished(trace.dispose);
  trace.start();

  await expect(trace.track("Signup Completed").settled).resolves.toStrictEqual({
    state: "settled",
    outcomes: { site: { status: "failed", error } },
  });
  expect(fake.calls.trackEvent).toStrictEqual([]);
});

test("an event tracked before Fathom's script loaded waits in the client's queue and is sent once it has, submitted at the call", async () => {
  const { fake, trace } = createTrace(fakeFathom({ loaded: false }));

  trace.start();

  await expect(
    trace.track("Order Completed", { order_id: "order_1", total: 20 }).settled,
  ).resolves.toStrictEqual({
    state: "settled",
    outcomes: {
      site: {
        status: "submitted",
        evidence: "sdk-call-returned",
        event: null,
        losses: [
          { path: "properties.order_id", reason: "unsupported" },
          { path: "properties.total", reason: "unsupported" },
          TIMESTAMP_LOSS,
        ],
      },
    },
  });
  expect(fake.queue).toStrictEqual([["Order Completed", { _value: 2000 }]]);

  fake.sdk.load();

  expect(fake.sent).toStrictEqual([
    { name: "Order Completed", payload: { _value: 2000 } },
  ]);
});

test("the session has no identity methods, collection or flush, because Fathom takes no identifiers", () => {
  expect(Object.keys(fathom({ sdk: fakeFathom().sdk }).open())).toStrictEqual([
    "native",
    "track",
  ]);
});

test("no identifier reaches Fathom: users, traits and groups never leave Trace", async () => {
  const { fake, trace } = createTrace();

  trace.start();
  trace.user({ id: "ada", traits: { email: "ada@example.com" } });
  trace.group("workspace", { id: "workspace_1" });
  await trace.track("Signup Completed").settled;

  expect(fake.calls.trackEvent).toStrictEqual([
    ["Signup Completed", undefined],
  ]);
});

test("a gated Fathom receives nothing while consent is closed", async () => {
  const { fake, trace } = createTrace(fakeFathom(), {
    consent: { site: ["analytics"] },
  });

  trace.start();

  await expect(trace.track("Signup Completed").settled).resolves.toStrictEqual({
    state: "dropped",
    reason: "consent",
  });

  trace.consent.set({ analytics: "granted" });
  await trace.track("Signup Completed").settled;

  expect(fake.sent).toStrictEqual([{ name: "Signup Completed", payload: {} }]);
});

test("flush reports unsupported, because Fathom's script sends on its own", async () => {
  const { trace } = createTrace();

  trace.start();

  await expect(trace.flush()).resolves.toEqual({
    drained: true,
    destinations: { site: { status: "unsupported" } },
  });
});

test("the native handle is the client the application passed", () => {
  const { fake, trace } = createTrace();

  trace.start();

  expect(trace.destination("site").native).toBe(fake.sdk);
});

test("Trace never loads Fathom, sets its site, tracks page views or goals, or blocks or enables tracking", async () => {
  const { fake, trace } = createTrace(fakeFathom(), {
    consent: { site: ["analytics"] },
  });

  trace.start();
  trace.consent.set({ analytics: "granted" });
  trace.user({ id: "ada" });
  await trace.track("Order Completed", { order_id: "order_1", total: 5 })
    .settled;
  trace.user(null);
  await trace.flush();
  trace.consent.set({ analytics: "denied" });
  trace.dispose();

  expect(fake.calls).toStrictEqual({
    ...NOTHING_CALLED,
    trackEvent: [["Order Completed", { _value: 500 }]],
  });
});
