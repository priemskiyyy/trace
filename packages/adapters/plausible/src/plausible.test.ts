import { event, Trace, TraceError } from "@priemskiyyy/trace";
import type { TrackContext } from "@priemskiyyy/trace";
import { afterEach, expect, onTestFinished, test, vi } from "vitest";

import { fakePlausible } from "src/fakePlausible.fixture";
import { plausible } from "src/plausible";
import { createTrackedEvent } from "src/trackedEvent.fixture";

afterEach(() => {
  vi.useRealTimers();
});

const TIMESTAMP = 1_767_225_600_000;

const TIMESTAMP_LOSS = { path: "timestamp", reason: "unsupported" };

const context: TrackContext = {
  signal: new AbortController().signal,
  currentGeneration: () => 1,
  now: () => TIMESTAMP,
};

const events = {
  "Checkout Started": event<{ cart_id: string; value: number }>(),
  "Note Added": event<{ note: string }>(),
};

const createTrace = (
  fake = fakePlausible(),
  options: { consent?: { site: ["analytics"] }; timeout?: number } = {},
) => {
  const trace = new Trace({
    events,
    destinations: { site: plausible({ sdk: fake.sdk }) },
    now: () => TIMESTAMP,
    ...options,
  });

  onTestFinished(trace.dispose);

  return { fake, trace };
};

const open = (fake = fakePlausible()) => ({
  fake,
  session: plausible({ sdk: fake.sdk }).open(),
});

test("creating the adapter calls nothing on Plausible", () => {
  const fake = fakePlausible({ initialized: false });

  plausible({ sdk: fake.sdk });

  expect(fake.calls).toStrictEqual({ init: 0, track: [] });
});

test("open calls nothing on Plausible, whose tracker keeps no state Trace could read", () => {
  const { fake, session } = open(fakePlausible({ initialized: false }));

  expect(session.native).toBe(fake.sdk);
  expect(fake.calls).toStrictEqual({ init: 0, track: [] });
});

test("an event is one track call with its props and a callback, submitted once the callback reports a 2xx status", async () => {
  const { fake, session } = open();

  const answer = session.track(
    createTrackedEvent({
      properties: { cart_id: "cart_1", value: 49.5 },
      context: { locale: "de" },
    }),
    context,
  );

  expect(fake.calls.track).toStrictEqual([
    [
      "Checkout Started",
      {
        props: { cart_id: "cart_1", value: "49.5", locale: "de" },
        callback: expect.any(Function),
      },
    ],
  ]);
  await expect(answer).resolves.toStrictEqual({
    status: "submitted",
    evidence: "sdk-callback-completed",
    losses: [{ path: "properties.value", reason: "coerced" }, TIMESTAMP_LOSS],
  });
  expect(fake.requests).toStrictEqual([
    {
      n: "Checkout Started",
      d: "example.com",
      p: { cart_id: "cart_1", value: "49.5", locale: "de" },
    },
  ]);
});

test("the answer waits for Plausible's callback", async () => {
  const { fake, session } = open(fakePlausible({ hold: true }));
  const settled: unknown[] = [];

  Promise.resolve(session.track(createTrackedEvent(), context)).then(
    (answer) => {
      settled.push(answer);
    },
  );
  await Promise.resolve();

  expect(settled).toStrictEqual([]);

  fake.answers[0]?.();
  await Promise.resolve();
  await Promise.resolve();

  expect(settled).toStrictEqual([
    {
      status: "submitted",
      evidence: "sdk-callback-completed",
      losses: [TIMESTAMP_LOSS],
    },
  ]);
});

test("a status outside 2xx fails the event with DELIVERY_FAILED", async () => {
  const { fake, session } = open();

  fake.state.answer = { status: 500 };

  await expect(
    session.track(createTrackedEvent(), context),
  ).resolves.toStrictEqual({
    status: "failed",
    error: new TraceError({
      code: "DELIVERY_FAILED",
      message: "Plausible answered the event with the status 500.",
    }),
  });
});

test("a network error fails the event with that error", async () => {
  const { fake, session } = open();
  const error = new TypeError("Failed to fetch");

  fake.state.answer = { error };

  await expect(
    session.track(createTrackedEvent(), context),
  ).resolves.toStrictEqual({ status: "failed", error });
});

test("an event Plausible ignores is dropped as provider-filtered, with the losses of its mapping", async () => {
  const { fake, session } = open();

  fake.state.ignored = true;

  await expect(
    session.track(createTrackedEvent({ properties: { value: 1 } }), context),
  ).resolves.toStrictEqual({
    status: "dropped",
    reason: "provider-filtered",
    losses: [{ path: "properties.value", reason: "coerced" }, TIMESTAMP_LOSS],
  });
  expect(fake.requests).toStrictEqual([]);
});

test("a track before init throws in Plausible, which Trace answers as failed with that error", async () => {
  const { trace } = createTrace(fakePlausible({ initialized: false }));

  trace.start();

  await expect(
    trace.track("Note Added", { note: "early" }).settled,
  ).resolves.toStrictEqual({
    state: "settled",
    outcomes: {
      site: {
        status: "failed",
        error: new Error(
          "plausible.track() can only be called after plausible.init()",
        ),
      },
    },
  });
});

test("a callback that never comes leaves the event indeterminate at Trace's timeout", async () => {
  vi.useFakeTimers();

  const fake = fakePlausible();

  fake.state.fetch = false;

  const { trace } = createTrace(fake, { timeout: 1_000 });

  trace.start();

  const receipt = trace.track("Note Added", { note: "offline" });

  await vi.advanceTimersByTimeAsync(1_000);

  await expect(receipt.settled).resolves.toStrictEqual({
    state: "settled",
    outcomes: { site: { status: "indeterminate", reason: "timeout" } },
  });
});

test("through Trace, an event is submitted once Plausible's callback reports its status", async () => {
  const { fake, trace } = createTrace();

  trace.start();

  await expect(
    trace.track("Checkout Started", { cart_id: "cart_1", value: 49.5 }).settled,
  ).resolves.toStrictEqual({
    state: "settled",
    outcomes: {
      site: {
        status: "submitted",
        evidence: "sdk-callback-completed",
        event: null,
        losses: [
          { path: "properties.value", reason: "coerced" },
          TIMESTAMP_LOSS,
        ],
      },
    },
  });
  expect(fake.requests).toStrictEqual([
    {
      n: "Checkout Started",
      d: "example.com",
      p: { cart_id: "cart_1", value: "49.5" },
    },
  ]);
});

test("the session has no identity methods, collection or flush, because Plausible keeps no identifiers", () => {
  expect(Object.keys(open().session)).toStrictEqual(["native", "track"]);
});

test("no identifier reaches Plausible: users, traits and groups never leave Trace", async () => {
  const { fake, trace } = createTrace();

  trace.start();
  trace.user({ id: "ada", traits: { email: "ada@example.com" } });
  trace.group("workspace", { id: "workspace_1", traits: { plan: "pro" } });
  await trace.track("Note Added", { note: "hello" }).settled;

  expect(fake.calls.track).toStrictEqual([
    [
      "Note Added",
      { props: { note: "hello" }, callback: expect.any(Function) },
    ],
  ]);
});

test("a gated Plausible receives nothing while consent is closed", async () => {
  const { fake, trace } = createTrace(fakePlausible(), {
    consent: { site: ["analytics"] },
  });

  trace.start();

  await expect(
    trace.track("Note Added", { note: "before" }).settled,
  ).resolves.toStrictEqual({ state: "dropped", reason: "consent" });

  trace.consent.set({ analytics: "granted" });
  await trace.track("Note Added", { note: "after" }).settled;

  expect(fake.requests).toStrictEqual([
    { n: "Note Added", d: "example.com", p: { note: "after" } },
  ]);
});

test("flush reports unsupported, because each event is its own request", async () => {
  const { trace } = createTrace();

  trace.start();

  await expect(trace.flush()).resolves.toEqual({
    drained: true,
    destinations: { site: { status: "unsupported" } },
  });
});

test("the native handle is the tracker the application passed", () => {
  const { fake, trace } = createTrace();

  trace.start();

  expect(trace.destination("site").native).toBe(fake.sdk);
});

test("Trace never initializes Plausible", async () => {
  const { fake, trace } = createTrace(fakePlausible(), {
    consent: { site: ["analytics"] },
  });

  trace.start();
  trace.consent.set({ analytics: "granted" });
  trace.user({ id: "ada" });
  await trace.track("Note Added", { note: "hello" }).settled;
  trace.user(null);
  await trace.flush();
  trace.consent.set({ analytics: "denied" });
  trace.dispose();

  expect(fake.calls.init).toBe(0);
});
