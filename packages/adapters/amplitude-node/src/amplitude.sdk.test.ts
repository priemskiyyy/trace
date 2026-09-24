import { createInstance, Identify, Types } from "@amplitude/analytics-node";
import { Http } from "@amplitude/analytics-node/lib/cjs/transports/http";
import { event, Trace } from "@priemskiyyy/trace";
import type { TrackedEvent } from "@priemskiyyy/trace";
import { testAnalyticsAdapter } from "@priemskiyyy/trace/testing";
import { afterEach, expect, test, vi } from "vitest";

import { amplitude } from "src/amplitude";
import { createTrackedEvent, TRACKED_EVENT } from "src/trackedEvent.fixture";

const { id: EVENT_ID, timestamp: TIMESTAMP } = TRACKED_EVENT;
const VISITOR = "visitor-7";
const LIBRARY = "amplitude-node-ts/1.5.73";
const FIRST_ID = "4e5f6a7b-8c9d-4e0f-9a1b-3c4d5e6f7a8b";
const SECOND_ID = "5f6a7b8c-9d0e-4f1a-8b2c-4d5e6f7a8b9c";

const SIGNED_IN = {
  generation: 1,
  user: { id: "user-ada" },
  traits: {},
  groups: {},
};

const DELIVERY_FAILED = expect.objectContaining({
  name: "TraceError",
  code: "DELIVERY_FAILED",
  message:
    "Amplitude did not accept 1 of this destination's uploads since the last flush.",
});

afterEach(() => {
  vi.useRealTimers();
});

const createEvent = (overrides: Partial<TrackedEvent> = {}) =>
  createTrackedEvent({ identity: SIGNED_IN, ...overrides });

const context = {
  signal: new AbortController().signal,
  currentGeneration: () => 1,
  now: () => TIMESTAMP,
};

const flushContext = { timeout: 1_000, signal: new AbortController().signal };

// The SDK's own transport builds every answer, so its destination reads exactly what a real response gives it.
const transport = new Http();

// @amplitude/analytics-node 1.5.73 with its transportProvider option: every upload lands here, and nothing reaches the network.
const createAmplitude = () => {
  const uploaded: unknown[] = [];
  const held: (() => void)[] = [];
  const state = { code: 200, holding: false };
  const sdk = createInstance();

  const { promise: initialized } = sdk.init("trace-test-api-key", {
    flushIntervalMillis: 60_000,
    logLevel: Types.LogLevel.None,
    transportProvider: {
      send: async (_serverUrl, payload) => {
        const body: unknown = JSON.parse(JSON.stringify(payload));

        if (
          typeof body !== "object" ||
          body === null ||
          !("events" in body) ||
          !Array.isArray(body.events)
        ) {
          throw new Error("Amplitude sent a payload without events.");
        }

        const events: unknown[] = body.events;

        uploaded.push(...events);

        const response = transport.buildResponse({ code: state.code });

        if (!state.holding) {
          return response;
        }

        return new Promise((resolve) => {
          held.push(() => {
            resolve(response);
          });
        });
      },
    },
  });

  return { sdk, uploaded, held, state, initialized };
};

const createRequestTrace = (sdk: Types.NodeClient, anonymousId: string) =>
  new Trace({
    events: { "App Opened": event() },
    destinations: { amplitude: amplitude({ sdk, Identify, anonymousId }) },
    now: () => TIMESTAMP,
  });

const getUploadedEvent = (
  insertId: string,
  ids: { user_id?: string; device_id?: string },
  eventId: number,
) => ({
  time: TIMESTAMP,
  insert_id: insertId,
  event_type: "App Opened",
  ...ids,
  event_properties: {},
  event_id: eventId,
  library: LIBRARY,
});

test("the real SDK uploads the event with its user, the visitor's device, its time and its id as insert_id, its own context plugin giving way to them", async () => {
  const { sdk, uploaded, initialized } = createAmplitude();

  await initialized;

  const session = amplitude({ sdk, Identify, anonymousId: VISITOR }).open();

  const answer = session.track(
    createEvent({
      properties: { cart: { id: "cart_1" }, value: 49.5 },
      context: { value: 1, locale: "de" },
    }),
    context,
  );

  await expect(session.flush?.(flushContext)).resolves.toStrictEqual({
    status: "flushed",
  });

  expect(answer).toStrictEqual({
    status: "submitted",
    evidence: "sdk-call-returned",
    losses: [{ path: "context.value", reason: "omitted" }],
  });
  expect(uploaded).toStrictEqual([
    {
      time: TIMESTAMP,
      insert_id: EVENT_ID,
      event_type: "Checkout Started",
      user_id: "user-ada",
      device_id: VISITOR,
      event_properties: { cart: { id: "cart_1" }, value: 49.5, locale: "de" },
      event_id: 0,
      library: LIBRARY,
    },
  ]);
});

test("no plugin of the real SDK fills in a user or a device, so a call that names none is uploaded without either and a server needs no identity plugin", async () => {
  const { sdk, uploaded, initialized } = createAmplitude();

  await initialized;

  const direct = sdk.track("Sent Directly");

  await sdk.flush().promise;
  await direct.promise;

  expect(uploaded).toStrictEqual([
    {
      time: expect.any(Number),
      insert_id: expect.any(String),
      event_type: "Sent Directly",
      event_id: 0,
      library: LIBRARY,
    },
  ]);
});

test("through two Traces over one real SDK, one per request, events tracked in the same tick keep their own user and visitor", async () => {
  const { sdk, uploaded, initialized } = createAmplitude();

  await initialized;

  const ada = createRequestTrace(sdk, "visitor-a");
  const bob = createRequestTrace(sdk, "visitor-b");

  ada.start();
  bob.start();
  ada.user({ id: "user-ada" });
  bob.user({ id: "user-bob" });

  const fromAda = ada.track("App Opened");
  const fromBob = bob.track("App Opened");

  await Promise.all([ada.flush(), bob.flush()]);

  expect(uploaded).toStrictEqual([
    getUploadedEvent(
      fromAda.id,
      { user_id: "user-ada", device_id: "visitor-a" },
      0,
    ),
    getUploadedEvent(
      fromBob.id,
      { user_id: "user-bob", device_id: "visitor-b" },
      1,
    ),
  ]);
  ada.dispose();
  bob.dispose();
});

test("traits and a membership reach the real SDK as $identify and $groupidentify events for the user and the visitor's device", async () => {
  const { sdk, uploaded, initialized } = createAmplitude();

  await initialized;

  const session = amplitude({ sdk, Identify, anonymousId: VISITOR }).open();

  session.traits?.({
    user: { id: "user-ada" },
    set: { plan: "pro" },
    remove: ["role"],
  });
  session.group?.({
    user: { id: "user-ada" },
    group: { type: "workspace", id: "w_1", traits: { tier: "team" } },
  });
  await session.flush?.(flushContext);

  expect(uploaded).toStrictEqual([
    {
      time: expect.any(Number),
      insert_id: expect.any(String),
      event_type: "$identify",
      user_id: "user-ada",
      device_id: VISITOR,
      user_properties: { $unset: { role: "-" }, $set: { plan: "pro" } },
      event_id: 0,
      library: LIBRARY,
    },
    {
      time: expect.any(Number),
      insert_id: expect.any(String),
      event_type: "$identify",
      user_id: "user-ada",
      device_id: VISITOR,
      user_properties: { $set: { workspace: "w_1" } },
      groups: { workspace: "w_1" },
      event_id: 1,
      library: LIBRARY,
    },
    {
      time: expect.any(Number),
      insert_id: expect.any(String),
      event_type: "$groupidentify",
      user_id: "user-ada",
      device_id: VISITOR,
      group_properties: { $set: { tier: "team" } },
      groups: { workspace: "w_1" },
      event_id: 2,
      library: LIBRARY,
    },
  ]);
});

test("the real Identify drops a whole trait that holds a null, so the adapter strips the null, leaves out what Identify would refuse, sends the rest and says so", async () => {
  const { sdk, uploaded, initialized } = createAmplitude();

  await initialized;

  const session = amplitude({ sdk, Identify }).open();
  const profile = { score: null, name: "ada" };
  const identify = new Identify();

  // @ts-expect-error Amplitude's Identify type refuses a null inside a value, which at runtime drops the whole value.
  identify.set("profile", profile);

  expect(identify.getUserProperties()).toStrictEqual({});
  expect(() =>
    session.traits?.({
      user: { id: "user-ada" },
      set: { profile, tags: ["beta", true], plan: "pro" },
      remove: [],
    }),
  ).toThrow(
    "Amplitude cannot take these values, so they were left out: traits.profile.score, traits.tags.",
  );

  await session.flush?.(flushContext);

  expect(uploaded).toStrictEqual([
    {
      time: expect.any(Number),
      insert_id: expect.any(String),
      event_type: "$identify",
      user_id: "user-ada",
      user_properties: { $set: { profile: { name: "ada" }, plan: "pro" } },
      event_id: 0,
      library: LIBRARY,
    },
  ]);
});

test("a flush through the real SDK answers flushed once its upload answered 2xx, and failed once one answered 500, since Amplitude's own flush sends without retries", async () => {
  const { sdk, uploaded, state, initialized } = createAmplitude();

  await initialized;

  const session = amplitude({ sdk, Identify }).open();

  session.track(createEvent({ id: FIRST_ID, name: "App Opened" }), context);

  await expect(session.flush?.(flushContext)).resolves.toStrictEqual({
    status: "flushed",
  });

  state.code = 500;
  session.track(createEvent({ id: SECOND_ID, name: "App Opened" }), context);

  await expect(session.flush?.(flushContext)).resolves.toStrictEqual({
    status: "failed",
    error: DELIVERY_FAILED,
  });
  expect(uploaded).toStrictEqual([
    getUploadedEvent(FIRST_ID, { user_id: "user-ada" }, 0),
    getUploadedEvent(SECOND_ID, { user_id: "user-ada" }, 1),
  ]);
});

test("through two Traces over one real SDK, an upload Amplitude refused in another Trace's flush makes this Trace's next flush failed, and the one after flushed", async () => {
  const { sdk, uploaded, state, initialized } = createAmplitude();

  await initialized;

  const ada = createRequestTrace(sdk, "visitor-a");
  const bob = createRequestTrace(sdk, "visitor-b");

  ada.start();
  bob.start();
  ada.user({ id: "user-ada" });
  bob.user({ id: "user-bob" });

  const fromAda = ada.track("App Opened");
  const fromBob = bob.track("App Opened");

  state.code = 500;

  await expect(bob.flush()).resolves.toEqual({
    drained: true,
    destinations: { amplitude: { status: "failed", error: DELIVERY_FAILED } },
  });

  state.code = 200;

  await expect(ada.flush()).resolves.toEqual({
    drained: true,
    destinations: { amplitude: { status: "failed", error: DELIVERY_FAILED } },
  });
  await expect(ada.flush()).resolves.toEqual({
    drained: true,
    destinations: { amplitude: { status: "flushed" } },
  });
  expect(uploaded).toStrictEqual([
    getUploadedEvent(
      fromAda.id,
      { user_id: "user-ada", device_id: "visitor-a" },
      0,
    ),
    getUploadedEvent(
      fromBob.id,
      { user_id: "user-bob", device_id: "visitor-b" },
      1,
    ),
  ]);
  ada.dispose();
  bob.dispose();
});

test("through two Traces over one real SDK, a flush that overlaps another Trace's answers timeout, because the SDK skips a flush while one is in flight and leaves the events to its own timer", async () => {
  const { sdk, uploaded, held, state, initialized } = createAmplitude();

  await initialized;
  vi.useFakeTimers();

  const ada = createRequestTrace(sdk, "visitor-a");
  const bob = createRequestTrace(sdk, "visitor-b");

  ada.start();
  bob.start();
  ada.user({ id: "user-ada" });
  bob.user({ id: "user-bob" });
  state.holding = true;

  const fromBob = bob.track("App Opened");
  const bobFlushing = bob.flush({ timeout: 5_000 });

  await vi.advanceTimersByTimeAsync(0);

  const fromAda = ada.track("App Opened");
  const adaFlushing = ada.flush({ timeout: 1_000 });

  await vi.advanceTimersByTimeAsync(1_000);

  await expect(adaFlushing).resolves.toEqual({
    drained: false,
    destinations: { amplitude: { status: "timeout" } },
  });

  state.holding = false;

  for (const release of held.splice(0)) {
    release();
  }

  await expect(bobFlushing).resolves.toEqual({
    drained: true,
    destinations: { amplitude: { status: "flushed" } },
  });
  expect(uploaded).toStrictEqual([
    getUploadedEvent(
      fromBob.id,
      { user_id: "user-bob", device_id: "visitor-b" },
      0,
    ),
  ]);

  await vi.advanceTimersByTimeAsync(60_000);

  expect(uploaded).toStrictEqual([
    getUploadedEvent(
      fromBob.id,
      { user_id: "user-bob", device_id: "visitor-b" },
      0,
    ),
    getUploadedEvent(
      fromAda.id,
      { user_id: "user-ada", device_id: "visitor-a" },
      1,
    ),
  ]);
  ada.dispose();
  bob.dispose();
});

test("through a Trace, a flush that runs out of time while an upload is in flight leaves the refusal that lands afterwards to the next flush, and the one after answers flushed", async () => {
  const { sdk, uploaded, held, state, initialized } = createAmplitude();

  await initialized;
  vi.useFakeTimers();

  const trace = createRequestTrace(sdk, VISITOR);

  trace.start();
  trace.user({ id: "user-ada" });
  state.code = 500;
  state.holding = true;

  const receipt = trace.track("App Opened");
  const abandoned = trace.flush({ timeout: 200 });

  await vi.advanceTimersByTimeAsync(200);

  await expect(abandoned).resolves.toEqual({
    drained: false,
    destinations: { amplitude: { status: "timeout" } },
  });

  for (const release of held.splice(0)) {
    release();
  }

  await vi.advanceTimersByTimeAsync(0);

  await expect(trace.flush()).resolves.toEqual({
    drained: true,
    destinations: { amplitude: { status: "failed", error: DELIVERY_FAILED } },
  });
  await expect(trace.flush()).resolves.toEqual({
    drained: true,
    destinations: { amplitude: { status: "flushed" } },
  });
  expect(uploaded).toStrictEqual([
    getUploadedEvent(
      receipt.id,
      { user_id: "user-ada", device_id: VISITOR },
      0,
    ),
  ]);
  trace.dispose();
});

test("while the application has opted the SDK out, the real SDK answers each call with code 0 and uploads nothing, which a flush reports as failed", async () => {
  const { sdk, uploaded, initialized } = createAmplitude();

  await initialized;
  sdk.setOptOut(true);

  const session = amplitude({ sdk, Identify }).open();

  session.track(createEvent(), context);

  await expect(session.flush?.(flushContext)).resolves.toStrictEqual({
    status: "failed",
    error: DELIVERY_FAILED,
  });
  expect(uploaded).toStrictEqual([]);
});

test("through a Trace, a user switch needs no reset: each event and each trait update reaches the real SDK under its own user", async () => {
  const { sdk, uploaded, initialized } = createAmplitude();

  await initialized;

  const trace = new Trace({
    events: { "App Opened": event() },
    destinations: {
      amplitude: amplitude({ sdk, Identify, anonymousId: VISITOR }),
    },
    now: () => TIMESTAMP,
  });

  trace.start();
  trace.user({ id: "user-ada", traits: { plan: "pro" } });

  const first = trace.track("App Opened");

  trace.user({ id: "user-bob" });

  const second = trace.track("App Opened");

  await expect(trace.flush()).resolves.toEqual({
    drained: true,
    destinations: { amplitude: { status: "flushed" } },
  });
  expect(uploaded).toStrictEqual([
    {
      time: expect.any(Number),
      insert_id: expect.any(String),
      event_type: "$identify",
      user_id: "user-ada",
      device_id: VISITOR,
      user_properties: { $set: { plan: "pro" } },
      event_id: 0,
      library: LIBRARY,
    },
    getUploadedEvent(first.id, { user_id: "user-ada", device_id: VISITOR }, 1),
    getUploadedEvent(second.id, { user_id: "user-bob", device_id: VISITOR }, 2),
  ]);
  trace.dispose();
});

testAnalyticsAdapter({
  name: "amplitude over @amplitude/analytics-node 1.5.73",
  createAdapter: () =>
    amplitude({ sdk: createAmplitude().sdk, Identify, anonymousId: VISITOR }),
});
