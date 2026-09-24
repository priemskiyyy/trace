import { event, Trace } from "@priemskiyyy/trace";
import type { TrackContext } from "@priemskiyyy/trace";
import { expect, onTestFinished, test } from "vitest";

import { fakeVercel } from "src/fakeVercel.fixture";
import { createTrackedEvent } from "src/trackedEvent.fixture";
import { vercel } from "src/vercel";

const TIMESTAMP = 1_767_225_600_000;

const TIMESTAMP_LOSS = { path: "timestamp", reason: "unsupported" };

const SERVER_ERROR = new Error(
  "[Vercel Web Analytics] Please import `track` from `@vercel/analytics/server` when using this function in a server environment",
);

const context: TrackContext = {
  signal: new AbortController().signal,
  currentGeneration: () => 1,
  now: () => TIMESTAMP,
};

const events = {
  "Signup Completed": event<{ plan: string; seats: number }>(),
};

const createTrace = (
  fake = fakeVercel(),
  options: { consent?: { site: ["analytics"] } } = {},
) => {
  const trace = new Trace({
    events,
    destinations: { site: vercel({ sdk: fake.sdk }) },
    now: () => TIMESTAMP,
    ...options,
  });

  onTestFinished(trace.dispose);

  return { fake, trace };
};

test("creating the adapter calls nothing on Vercel", () => {
  const fake = fakeVercel({ injected: false });

  vercel({ sdk: fake.sdk, limits: { properties: 8 } });

  expect(fake.calls).toStrictEqual({ track: [], inject: 0, pageview: 0 });
});

test("open calls nothing on Vercel, whose track keeps no state Trace could read", () => {
  const fake = fakeVercel({ injected: false });
  const session = vercel({ sdk: fake.sdk }).open();

  expect(session.native).toBe(fake.sdk);
  expect(fake.calls).toStrictEqual({ track: [], inject: 0, pageview: 0 });
});

test("an event is one track call with its first two properties, the Pro plan's, and neither its context nor the rest", () => {
  const fake = fakeVercel();

  const answer = vercel({ sdk: fake.sdk })
    .open()
    .track(
      createTrackedEvent({
        properties: { plan: "pro", seats: 3, coupon: "SPRING" },
        context: { locale: "de" },
      }),
      context,
    );

  expect(fake.calls.track).toStrictEqual([
    ["Checkout Started", { plan: "pro", seats: 3 }],
  ]);
  expect(fake.queue).toStrictEqual([
    [
      "event",
      {
        name: "Checkout Started",
        data: { plan: "pro", seats: 3 },
        options: undefined,
      },
    ],
  ]);
  expect(answer).toStrictEqual({
    status: "submitted",
    evidence: "sdk-call-returned",
    losses: [
      { path: "properties.coupon", reason: "truncated" },
      { path: "context.locale", reason: "omitted" },
      TIMESTAMP_LOSS,
    ],
  });
});

test("limits.properties of 8, Web Analytics Plus's, sends the first eight properties and truncates the rest", () => {
  const fake = fakeVercel();

  const properties = Object.fromEntries(
    Array.from({ length: 9 }, (_, index) => [`p${index}`, index]),
  );

  const answer = vercel({ sdk: fake.sdk, limits: { properties: 8 } })
    .open()
    .track(createTrackedEvent({ properties }), context);

  expect(fake.calls.track).toStrictEqual([
    [
      "Checkout Started",
      { p0: 0, p1: 1, p2: 2, p3: 3, p4: 4, p5: 5, p6: 6, p7: 7 },
    ],
  ]);
  expect(answer).toStrictEqual({
    status: "submitted",
    evidence: "sdk-call-returned",
    losses: [{ path: "properties.p8", reason: "truncated" }, TIMESTAMP_LOSS],
  });
});

test("the limit is read once, when the adapter is created", () => {
  const fake = fakeVercel();
  const limits: { properties: 2 | 8 } = { properties: 2 };
  const adapter = vercel({ sdk: fake.sdk, limits });

  limits.properties = 8;
  adapter.open().track(
    createTrackedEvent({
      properties: { plan: "pro", seats: 3, coupon: "SPRING" },
    }),
    context,
  );

  expect(fake.calls.track).toStrictEqual([
    ["Checkout Started", { plan: "pro", seats: 3 }],
  ]);
});

test("an object is left out by the adapter, so development, which drops a whole event that carries one, still receives the event", () => {
  const fake = fakeVercel({ mode: "development" });

  vercel({ sdk: fake.sdk })
    .open()
    .track(
      createTrackedEvent({
        properties: { cart: { id: "cart_1" }, plan: "pro" },
      }),
      context,
    );

  expect(fake.queue).toStrictEqual([
    [
      "event",
      { name: "Checkout Started", data: { plan: "pro" }, options: undefined },
    ],
  ]);
});

test("an event name over 255 characters is dropped as provider-filtered and never reaches Vercel, which would drop it, with the name's loss first and then the mapping's", () => {
  const fake = fakeVercel();
  const session = vercel({ sdk: fake.sdk }).open();

  expect(
    session.track(
      createTrackedEvent({
        name: "e".repeat(256),
        properties: { plan: "pro", seats: 3, coupon: "SPRING" },
        context: { locale: "de" },
      }),
      context,
    ),
  ).toStrictEqual({
    status: "dropped",
    reason: "provider-filtered",
    losses: [
      { path: "name", reason: "invalid" },
      { path: "properties.coupon", reason: "truncated" },
      { path: "context.locale", reason: "omitted" },
      TIMESTAMP_LOSS,
    ],
  });
  expect(fake.calls.track).toStrictEqual([]);

  session.track(createTrackedEvent({ name: "e".repeat(255) }), context);

  expect(fake.calls.track).toStrictEqual([["e".repeat(255), {}]]);
});

test("a track that throws, as @vercel/analytics does outside a browser in development, throws to the core, which fails the event with that error", async () => {
  const fake = fakeVercel({ browser: false, mode: "development" });

  expect(() =>
    vercel({ sdk: fake.sdk }).open().track(createTrackedEvent(), context),
  ).toThrow(SERVER_ERROR);

  const { trace } = createTrace(fake);

  trace.start();

  await expect(
    trace.track("Signup Completed", { plan: "pro", seats: 1 }).settled,
  ).resolves.toStrictEqual({
    state: "settled",
    outcomes: { site: { status: "failed", error: SERVER_ERROR } },
  });
});

test("outside a browser in production, or before inject, Vercel only warns or does nothing, and the event is still submitted, because the call proves no more", () => {
  const server = fakeVercel({ browser: false });
  const uninjected = fakeVercel({ injected: false });

  expect(
    vercel({ sdk: server.sdk }).open().track(createTrackedEvent(), context),
  ).toStrictEqual({
    status: "submitted",
    evidence: "sdk-call-returned",
    losses: [TIMESTAMP_LOSS],
  });
  expect(
    vercel({ sdk: uninjected.sdk }).open().track(createTrackedEvent(), context),
  ).toStrictEqual({
    status: "submitted",
    evidence: "sdk-call-returned",
    losses: [TIMESTAMP_LOSS],
  });
  expect(server.queue).toStrictEqual([]);
  expect(uninjected.queue).toStrictEqual([]);
});

test("the session has no identity methods, collection or flush, because Vercel takes no identifiers", () => {
  expect(Object.keys(vercel({ sdk: fakeVercel().sdk }).open())).toStrictEqual([
    "native",
    "track",
  ]);
});

test("through Trace, an event is submitted with its losses, and no identifier reaches Vercel", async () => {
  const { fake, trace } = createTrace();

  trace.start();
  trace.user({ id: "ada", traits: { email: "ada@example.com" } });
  trace.group("workspace", { id: "workspace_1" });

  await expect(
    trace.track("Signup Completed", { plan: "pro", seats: 3 }).settled,
  ).resolves.toStrictEqual({
    state: "settled",
    outcomes: {
      site: {
        status: "submitted",
        evidence: "sdk-call-returned",
        event: null,
        losses: [TIMESTAMP_LOSS],
      },
    },
  });
  expect(fake.calls.track).toStrictEqual([
    ["Signup Completed", { plan: "pro", seats: 3 }],
  ]);
});

test("a gated Vercel receives nothing while consent is closed", async () => {
  const { fake, trace } = createTrace(fakeVercel(), {
    consent: { site: ["analytics"] },
  });

  trace.start();

  await expect(
    trace.track("Signup Completed", { plan: "pro", seats: 1 }).settled,
  ).resolves.toStrictEqual({ state: "dropped", reason: "consent" });

  trace.consent.set({ analytics: "granted" });
  await trace.track("Signup Completed", { plan: "free", seats: 1 }).settled;

  expect(fake.calls.track).toStrictEqual([
    ["Signup Completed", { plan: "free", seats: 1 }],
  ]);
});

test("flush reports unsupported, because Vercel's script sends on its own", async () => {
  const { trace } = createTrace();

  trace.start();

  await expect(trace.flush()).resolves.toEqual({
    drained: true,
    destinations: { site: { status: "unsupported" } },
  });
});

test("the native handle is the sdk the application passed", () => {
  const { fake, trace } = createTrace();

  trace.start();

  expect(trace.destination("site").native).toBe(fake.sdk);
});

test("Trace never injects Vercel's script or tracks a page view", async () => {
  const { fake, trace } = createTrace(fakeVercel(), {
    consent: { site: ["analytics"] },
  });

  trace.start();
  trace.consent.set({ analytics: "granted" });
  trace.user({ id: "ada" });
  await trace.track("Signup Completed", { plan: "pro", seats: 1 }).settled;
  trace.user(null);
  await trace.flush();
  trace.consent.set({ analytics: "denied" });
  trace.dispose();

  expect(fake.calls.inject).toBe(0);
  expect(fake.calls.pageview).toBe(0);
});
