import { event, Trace } from "@priemskiyyy/trace";
import type { TrackContext, TrackedEvent } from "@priemskiyyy/trace";
import { afterEach, expect, test, vi } from "vitest";

import { fakeRequest } from "src/fakeRequest.fixture";
import { http } from "src/http";

type FakeRequest = ReturnType<typeof fakeRequest>;

afterEach(() => {
  vi.useRealTimers();
});

const TIMESTAMP = 1_767_225_600_000;

const events = {
  "App Opened": event(),
  "Checkout Started": event<{ cart: { id: string }; value: number }>(),
};

const create = (client = fakeRequest(), timeout = 5_000) => {
  const trace = new Trace({
    events,
    destinations: { backend: http({ request: client.request }) },
    timeout,
    now: () => TIMESTAMP,
  });

  return { client, trace };
};

const EVENT: TrackedEvent = Object.freeze({
  id: "0b0e7a52-9c1d-4f6e-8a3b-1c2d3e4f5a6b",
  name: "App Opened",
  properties: {},
  context: {},
  identity: { generation: 1, user: null, traits: {}, groups: {} },
  timestamp: TIMESTAMP,
});

const CONTEXT: TrackContext = {
  signal: new AbortController().signal,
  currentGeneration: () => 1,
  now: () => TIMESTAMP,
};

test("creating the adapter and opening a session send nothing", () => {
  const client = fakeRequest();

  http({ request: client.request }).open();

  expect(client.requests).toStrictEqual([]);
});

test("each event reaches the request once, frozen and sanitized as every destination receives it, with the signal of its handoff", async () => {
  const { client, trace } = create();
  const accepted: TrackedEvent[] = [];

  trace.events.subscribe((tracked) => {
    accepted.push(tracked);
  });
  trace.start();

  const receipt = trace.track(
    "Checkout Started",
    { cart: { id: "cart_1" }, value: 49.5 },
    { context: { card: { token: "tok_live_1", last4: "4242" } } },
  );

  await expect(receipt.settled).resolves.toEqual({
    state: "settled",
    outcomes: {
      backend: {
        status: "submitted",
        evidence: "backend-acknowledged",
        event: { id: "evt_1" },
        losses: [{ path: "context.card.token", reason: "redacted" }],
      },
    },
  });
  expect(client.requests).toStrictEqual([
    { event: accepted[0], signal: expect.any(AbortSignal) },
  ]);
  expect(client.requests[0]?.event).toBe(accepted[0]);
  expect(Object.isFrozen(client.requests[0]?.event)).toBe(true);
  expect(client.requests[0]?.event).toEqual({
    id: receipt.id,
    name: "Checkout Started",
    properties: { cart: { id: "cart_1" }, value: 49.5 },
    context: { card: { last4: "4242" } },
    identity: { generation: 0, user: null, traits: {}, groups: {} },
    timestamp: TIMESTAMP,
  });
});

test("a request that resolves with the backend's id is submitted with backend evidence and that id", async () => {
  const { trace } = create();

  trace.start();

  await expect(trace.track("App Opened").settled).resolves.toEqual({
    state: "settled",
    outcomes: {
      backend: {
        status: "submitted",
        evidence: "backend-acknowledged",
        event: { id: "evt_1" },
        losses: [],
      },
    },
  });
});

test("a request that resolves with nothing is submitted without an event id", async () => {
  const { client, trace } = create();

  trace.start();
  client.answerNext();

  await expect(trace.track("App Opened").settled).resolves.toEqual({
    state: "settled",
    outcomes: {
      backend: {
        status: "submitted",
        evidence: "backend-acknowledged",
        event: null,
        losses: [],
      },
    },
  });
});

test("a request that answers at once, without a promise, is acknowledged the same way", async () => {
  const withId = http({ request: () => ({ id: "evt_1" }) }).open();
  const withNothing = http({ request: () => {} }).open();

  await expect(withId.track(EVENT, CONTEXT)).resolves.toStrictEqual({
    status: "submitted",
    evidence: "backend-acknowledged",
    event: { id: "evt_1" },
  });
  await expect(withNothing.track(EVENT, CONTEXT)).resolves.toStrictEqual({
    status: "submitted",
    evidence: "backend-acknowledged",
  });
});

test.each([
  ["rejects", (client: FakeRequest, error: Error) => client.failNext(error)],
  ["throws", (client: FakeRequest, error: Error) => client.throwNext(error)],
])("a request that %s fails its own event and no other", async (_, fail) => {
  const { client, trace } = create();
  const refused = new Error("the backend answered 503");

  trace.start();

  const before = trace.track("App Opened");

  fail(client, refused);

  const failing = trace.track("App Opened");
  const after = trace.track("App Opened");

  await expect(
    Promise.all([before.settled, failing.settled, after.settled]),
  ).resolves.toEqual([
    {
      state: "settled",
      outcomes: {
        backend: {
          status: "submitted",
          evidence: "backend-acknowledged",
          event: { id: "evt_1" },
          losses: [],
        },
      },
    },
    {
      state: "settled",
      outcomes: { backend: { status: "failed", error: refused } },
    },
    {
      state: "settled",
      outcomes: {
        backend: {
          status: "submitted",
          evidence: "backend-acknowledged",
          event: { id: "evt_3" },
          losses: [],
        },
      },
    },
  ]);
  expect(client.requests.map((sent) => sent.event.id)).toStrictEqual([
    before.id,
    failing.id,
    after.id,
  ]);
});

test("the timeout aborts the request's signal and leaves the event indeterminate", async () => {
  vi.useFakeTimers();

  const { client, trace } = create(fakeRequest(), 1_000);

  trace.start();
  client.hangNext();

  const receipt = trace.track("App Opened");

  await vi.advanceTimersByTimeAsync(999);

  expect(client.requests[0]?.signal.aborted).toBe(false);

  await vi.advanceTimersByTimeAsync(1);

  expect(client.requests[0]?.signal.aborted).toBe(true);
  await expect(receipt.settled).resolves.toEqual({
    state: "settled",
    outcomes: { backend: { status: "indeterminate", reason: "timeout" } },
  });
});

test("disposing the Trace aborts the signal of a request in flight and sends nothing more", async () => {
  const { client, trace } = create();

  trace.start();
  client.hangNext();

  const receipt = trace.track("App Opened");

  trace.dispose();

  expect(client.requests[0]?.signal.aborted).toBe(true);
  await expect(receipt.settled).resolves.toEqual({
    state: "settled",
    outcomes: { backend: { status: "indeterminate", reason: "disposed" } },
  });
  expect(client.requests.map((sent) => sent.event.id)).toStrictEqual([
    receipt.id,
  ]);
});

test("an event is requested once and never again, not after a failure, a timeout or a flush", async () => {
  vi.useFakeTimers();

  const { client, trace } = create(fakeRequest(), 1_000);
  const refused = new Error("the backend answered 503");

  trace.start();
  client.failNext(refused);

  const failed = trace.track("App Opened");

  client.hangNext();

  const timedOut = trace.track("App Opened");

  await vi.advanceTimersByTimeAsync(1_000);

  await expect(failed.settled).resolves.toEqual({
    state: "settled",
    outcomes: { backend: { status: "failed", error: refused } },
  });
  await expect(timedOut.settled).resolves.toEqual({
    state: "settled",
    outcomes: { backend: { status: "indeterminate", reason: "timeout" } },
  });
  await expect(trace.flush()).resolves.toEqual({
    drained: true,
    destinations: { backend: { status: "unsupported" } },
  });
  expect(client.requests.map((sent) => sent.event.id)).toStrictEqual([
    failed.id,
    timedOut.id,
  ]);
});

test("an anonymous event waiting when the user signs in is still sent, and so is one for the account still signed in", async () => {
  const { client, trace } = create();
  const anonymous = trace.track("App Opened");

  trace.user({ id: "ada" });

  const signedIn = trace.track("App Opened");

  trace.start();

  await expect(anonymous.settled).resolves.toEqual({
    state: "settled",
    outcomes: {
      backend: {
        status: "submitted",
        evidence: "backend-acknowledged",
        event: { id: "evt_1" },
        losses: [],
      },
    },
  });
  await expect(signedIn.settled).resolves.toEqual({
    state: "settled",
    outcomes: {
      backend: {
        status: "submitted",
        evidence: "backend-acknowledged",
        event: { id: "evt_2" },
        losses: [],
      },
    },
  });
  expect(
    client.requests.map(({ event: { id, identity } }) => [
      id,
      identity.generation,
      identity.user,
    ]),
  ).toStrictEqual([
    [anonymous.id, 0, null],
    [signedIn.id, 1, { id: "ada" }],
  ]);
});

test("an event its user left waiting when the account switched never reaches the request, because Trace drops it first", async () => {
  const { client, trace } = create();

  trace.user({ id: "ada" });

  const receipt = trace.track("App Opened");

  trace.user({ id: "grace" });
  trace.start();

  await expect(receipt.settled).resolves.toEqual({
    state: "settled",
    outcomes: { backend: { status: "dropped", reason: "identity-changed" } },
  });
  expect(client.requests).toStrictEqual([]);
});

test("a destination named in consent sends nothing until its purposes are granted", async () => {
  const client = fakeRequest();

  const trace = new Trace({
    events,
    destinations: { backend: http({ request: client.request }) },
    consent: { backend: ["analytics"] },
  });

  trace.start();

  await expect(trace.track("App Opened").settled).resolves.toStrictEqual({
    state: "dropped",
    reason: "consent",
  });
  expect(client.requests).toStrictEqual([]);

  trace.consent.set({ analytics: "granted" });

  const receipt = trace.track("App Opened");

  await receipt.settled;

  expect(client.requests.map((sent) => sent.event.id)).toStrictEqual([
    receipt.id,
  ]);
});

test("the session sends events and has no identity methods, collection, flush or dispose", () => {
  expect(Object.keys(http({ request: fakeRequest().request }).open())).toEqual([
    "native",
    "track",
  ]);
});

test("the native handle is the request the application passed", () => {
  const { client, trace } = create();

  expect(trace.destination("backend").native).toBe(null);

  trace.start();

  expect(trace.destination("backend").native).toBe(client.request);
});
