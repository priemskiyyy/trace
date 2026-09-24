import { event, Trace, TraceError } from "@priemskiyyy/trace";
import type { TraceDiagnosticEvent } from "@priemskiyyy/trace";
import { expect, onTestFinished, test } from "vitest";

import { fakeSegment } from "src/fakeSegment.fixture";
import { segment } from "src/segment";
import { createTrackedEvent } from "src/trackedEvent.fixture";

type FakeSegment = ReturnType<typeof fakeSegment>;

const EVENT_ID = "3f0b6f64-6c1e-4d7a-9a4e-2b9c1d3e5f70";
const TIMESTAMP = 1_767_225_600_000;
const WORKSPACE = { type: "workspace" };

const NOT_READY = new TraceError({
  code: "NOT_INITIALIZED",
  message:
    "Segment has not started processing events. Call trace.start() again once client.isReady.value and client.running.get() are both true.",
});

const SUBMITTED = {
  state: "settled",
  outcomes: {
    segment: {
      status: "submitted",
      evidence: "sdk-call-returned",
      event: null,
      losses: [],
    },
  },
};

const createContext = () => ({
  signal: new AbortController().signal,
  currentGeneration: () => 1,
  now: () => TIMESTAMP,
});

const createFlushContext = () => ({
  timeout: 1_000,
  signal: new AbortController().signal,
});

const open = (
  fake: FakeSegment = fakeSegment(),
  options: { group?: { type: string } } = {},
) => segment({ sdk: fake.sdk, ...options }).open();

const createTrace = (
  fake: FakeSegment,
  {
    group,
    consent,
  }: {
    group?: { type: string };
    consent?: { segment: ["analytics"] };
  } = {},
) => {
  const trace = new Trace({
    events: { "Note Added": event<{ note: string }>() },
    destinations: {
      segment: segment({
        sdk: fake.sdk,
        ...(group === undefined ? {} : { group }),
      }),
    },
    now: () => TIMESTAMP,
    ...(consent === undefined ? {} : { consent }),
  });

  onTestFinished(trace.dispose);

  return trace;
};

const getThrown = (run: () => unknown) => {
  try {
    run();
  } catch (error) {
    return error;
  }

  return null;
};

const getMethods = ({ calls }: FakeSegment) =>
  calls.map(({ method }) => method);

const getTracks = ({ queue }: FakeSegment) =>
  queue.flatMap((queued) => {
    if (queued.type !== "track") {
      return [];
    }

    return [
      {
        note: queued.properties.note,
        userId: queued.userId,
        anonymousId: queued.anonymousId,
      },
    ];
  });

const release = ({ held }: FakeSegment) => {
  held.splice(0).forEach((settle) => settle());
};

const getPropertiesOfSize = (size: number) => {
  const overhead = JSON.stringify({
    event: "Checkout Started",
    properties: { text: "" },
  }).length;

  return { text: "x".repeat(size - overhead) };
};

test("creating the adapter calls nothing on the client", () => {
  const fake = fakeSegment({ ready: false });

  segment({ sdk: fake.sdk, group: WORKSPACE });

  expect(fake.calls).toStrictEqual([]);
});

test("open refuses a client that is not ready with NOT_INITIALIZED, before calling anything, and opens once it is", () => {
  const fake = fakeSegment({ ready: false });
  const adapter = segment({ sdk: fake.sdk });

  expect(getThrown(adapter.open)).toStrictEqual(NOT_READY);
  expect(fake.calls).toStrictEqual([]);

  fake.sdk.isReady.value = true;

  expect(adapter.open().native).toBe(fake.sdk);
});

test("open refuses a client that is ready but not yet running with NOT_INITIALIZED, before calling anything, and opens once it runs", async () => {
  const fake = fakeSegment({ running: false });
  const adapter = segment({ sdk: fake.sdk });

  expect(getThrown(adapter.open)).toStrictEqual(NOT_READY);
  expect(fake.calls).toStrictEqual([]);

  await fake.sdk.resumeEventProcessing();

  expect(adapter.open().native).toBe(fake.sdk);
});

test("through Trace, a client that is not ready fails the start, and a start once it is ready delivers the event that waited", async () => {
  const fake = fakeSegment({ ready: false });
  const trace = createTrace(fake);

  trace.start();

  const receipt = trace.track("Note Added", { note: "during boot" });

  expect(trace.destination("segment").status.get()).toStrictEqual({
    state: "failed",
    error: NOT_READY,
  });
  expect(fake.calls).toStrictEqual([]);

  fake.sdk.isReady.value = true;
  trace.start();

  expect(await receipt.settled).toStrictEqual(SUBMITTED);
  expect(getTracks(fake)).toStrictEqual([
    { note: "during boot", userId: undefined, anonymousId: "anonymous-1" },
  ]);
});

test("through Trace, on a first launch the start fails while the client is ready but not yet running, and the start once it runs delivers the events that waited, each under its user", async () => {
  const fake = fakeSegment({ ready: false, running: false });
  const trace = createTrace(fake);

  trace.start();
  fake.sdk.running.onChange((running) => {
    if (running) {
      trace.start();
    }
  });

  const anonymous = trace.track("Note Added", { note: "before sign-in" });

  trace.user({ id: "ada" });

  const ada = trace.track("Note Added", { note: "from ada" });

  fake.sdk.isReady.value = true;
  trace.start();

  expect(trace.destination("segment").status.get()).toStrictEqual({
    state: "failed",
    error: NOT_READY,
  });
  expect(fake.calls).toStrictEqual([]);

  await fake.sdk.resumeEventProcessing();

  expect(await anonymous.settled).toStrictEqual(SUBMITTED);
  expect(await ada.settled).toStrictEqual(SUBMITTED);
  expect(getTracks(fake)).toStrictEqual([
    { note: "before sign-in", userId: undefined, anonymousId: "anonymous-1" },
    { note: "from ada", userId: "ada", anonymousId: "anonymous-1" },
  ]);
});

test("an event is one track call with its name and its properties over its context, whose enrichment sets its id as the message id and its time", async () => {
  const fake = fakeSegment();

  const answer = await open(fake).track(
    createTrackedEvent({
      properties: { cart: { id: "cart_1" }, value: 49.5, currency: "EUR" },
      context: { currency: "USD", locale: "de" },
    }),
    createContext(),
  );

  expect(fake.calls).toStrictEqual([
    {
      method: "track",
      args: [
        "Checkout Started",
        { currency: "EUR", locale: "de", cart: { id: "cart_1" }, value: 49.5 },
        expect.any(Function),
      ],
    },
  ]);
  expect(fake.queue).toStrictEqual([
    {
      type: "track",
      event: "Checkout Started",
      properties: {
        currency: "EUR",
        locale: "de",
        cart: { id: "cart_1" },
        value: 49.5,
      },
      messageId: EVENT_ID,
      timestamp: "2026-01-01T00:00:00.000Z",
      userId: undefined,
      anonymousId: "anonymous-1",
    },
  ]);
  expect(answer).toStrictEqual({
    status: "submitted",
    evidence: "sdk-call-returned",
    losses: [{ path: "context.currency", reason: "omitted" }],
  });
});

test("track hands the event to the client at the call, before it waits for anything, so the client stamps it with the user it holds then", async () => {
  const fake = fakeSegment();

  fake.state.userId = "ada";

  const answering = open(fake).track(createTrackedEvent(), createContext());

  expect(getMethods(fake)).toStrictEqual(["track"]);
  expect(getTracks(fake)).toStrictEqual([
    { note: undefined, userId: "ada", anonymousId: "anonymous-1" },
  ]);

  await answering;
});

test("the answer waits until the client has queued the event, and names no provider event", async () => {
  const fake = fakeSegment({ hold: ["track"] });

  let answered = false;

  const answering = Promise.resolve(
    open(fake).track(createTrackedEvent(), createContext()),
  ).then((answer) => {
    answered = true;

    return answer;
  });

  await Promise.resolve();

  expect(answered).toBe(false);

  release(fake);

  expect(await answering).toStrictEqual({
    status: "submitted",
    evidence: "sdk-call-returned",
    losses: [],
  });
});

test("an event at Segment's 32 KB limit is sent, and one byte more is dropped as provider-filtered without reaching the client", async () => {
  const fake = fakeSegment();
  const session = open(fake);
  const fits = getPropertiesOfSize(32_768);
  const over = getPropertiesOfSize(32_769);

  expect(
    await session.track(
      createTrackedEvent({ properties: fits }),
      createContext(),
    ),
  ).toStrictEqual({
    status: "submitted",
    evidence: "sdk-call-returned",
    losses: [],
  });
  expect(
    await session.track(
      createTrackedEvent({ properties: over }),
      createContext(),
    ),
  ).toStrictEqual({
    status: "dropped",
    reason: "provider-filtered",
    losses: [{ path: "properties", reason: "invalid" }],
  });
  expect(fake.calls).toStrictEqual([
    {
      method: "track",
      args: ["Checkout Started", fits, expect.any(Function)],
    },
  ]);
});

test("the size counts UTF-8 bytes, so text of fewer than 32,768 characters can still pass the limit", async () => {
  const fake = fakeSegment();

  const answer = await open(fake).track(
    createTrackedEvent({ properties: { text: "é".repeat(16_400) } }),
    createContext(),
  );

  expect(answer).toStrictEqual({
    status: "dropped",
    reason: "provider-filtered",
    losses: [{ path: "properties", reason: "invalid" }],
  });
  expect(fake.calls).toStrictEqual([]);
});

test("losses follow the event's shape: the context's first, and the size of the whole event last", async () => {
  const answer = await open().track(
    createTrackedEvent({
      properties: { plan: "pro", ...getPropertiesOfSize(32_868) },
      context: { plan: "free" },
    }),
    createContext(),
  );

  expect(answer).toStrictEqual({
    status: "dropped",
    reason: "provider-filtered",
    losses: [
      { path: "context.plan", reason: "omitted" },
      { path: "properties", reason: "invalid" },
    ],
  });
});

test("a track the client rejects rejects too, so Trace fails exactly that event", async () => {
  const fake = fakeSegment();
  const failure = new Error("Plugin failed");

  fake.state.failures.track = failure;

  await expect(
    open(fake).track(createTrackedEvent(), createContext()),
  ).rejects.toBe(failure);

  const trace = createTrace(fake);

  trace.start();

  const failed = trace.track("Note Added", { note: "refused" });

  expect(await failed.settled).toStrictEqual({
    state: "settled",
    outcomes: { segment: { status: "failed", error: failure } },
  });
});

test("an event the client drops while it is disabled is still submitted, because track proves only that the call returned", async () => {
  const fake = fakeSegment();

  fake.state.enabled = false;

  expect(
    await open(fake).track(createTrackedEvent(), createContext()),
  ).toStrictEqual({
    status: "submitted",
    evidence: "sdk-call-returned",
    losses: [],
  });
  expect(getMethods(fake)).toStrictEqual(["track"]);
  expect(fake.queue).toStrictEqual([]);
});

test("identify holds the user at the call and answers the client's promise, so the step waits until the client has queued the identify", async () => {
  const fake = fakeSegment({ hold: ["identify"] });

  let settled = false;

  const identifying = Promise.resolve(
    open(fake).identify?.({ user: { id: "ada" } }),
  ).then(() => {
    settled = true;
  });

  await Promise.resolve();

  expect(fake.calls).toStrictEqual([{ method: "identify", args: ["ada"] }]);
  expect(fake.state.userId).toBe("ada");
  expect(settled).toBe(false);

  release(fake);
  await identifying;

  expect(settled).toBe(true);
});

test("traits reach the client for the user it holds, which merges them into those it keeps, and a removal is sent as null, which Segment removes", async () => {
  const fake = fakeSegment();
  const session = open(fake);

  await session.identify?.({ user: { id: "ada" } });
  await session.traits?.({
    user: { id: "ada" },
    set: { role: "admin", team: "core" },
    remove: [],
  });

  expect(
    await session.traits?.({
      user: { id: "ada" },
      set: { plan: "pro", seats: 4 },
      remove: ["role"],
    }),
  ).toBe(undefined);
  expect(fake.calls).toStrictEqual([
    { method: "identify", args: ["ada"] },
    { method: "identify", args: [undefined, { role: "admin", team: "core" }] },
    {
      method: "identify",
      args: [undefined, { role: null, plan: "pro", seats: 4 }],
    },
  ]);
  expect(fake.state).toStrictEqual({
    userId: "ada",
    anonymousId: "anonymous-1",
    traits: { role: null, team: "core", plan: "pro", seats: 4 },
    enabled: true,
    running: true,
    offline: false,
    failures: {},
  });
});

test("a membership of the configured type is one group call with its traits, which answers the client's promise", async () => {
  const fake = fakeSegment({ hold: ["group"] });

  let settled = false;

  const grouping = Promise.resolve(
    open(fake, { group: WORKSPACE }).group?.({
      user: { id: "ada" },
      group: { type: "workspace", id: "w_1", traits: { tier: "enterprise" } },
    }),
  ).then(() => {
    settled = true;
  });

  await Promise.resolve();

  expect(fake.calls).toStrictEqual([
    { method: "group", args: ["w_1", { tier: "enterprise" }] },
  ]);
  expect(settled).toBe(false);

  release(fake);
  await grouping;

  expect(settled).toBe(true);
});

test("a membership of another type is refused as unsupported and sends nothing", () => {
  const fake = fakeSegment();
  const session = open(fake, { group: WORKSPACE });

  expect(
    getThrown(() =>
      session.group?.({
        user: { id: "ada" },
        group: { type: "team", id: "t_1", traits: { size: 4 } },
      }),
    ),
  ).toStrictEqual(
    new TraceError({
      code: "UNSUPPORTED",
      message:
        'Segment keeps no group type, and this destination sends only the "workspace" type.',
    }),
  );
  expect(fake.calls).toStrictEqual([]);
});

test("leaving the group is refused as unsupported and sends nothing, because Segment has no call to leave one", () => {
  const fake = fakeSegment();
  const session = open(fake, { group: WORKSPACE });

  expect(
    getThrown(() =>
      session.group?.({
        user: { id: "ada" },
        group: { type: "workspace", id: null, traits: {} },
      }),
    ),
  ).toStrictEqual(
    new TraceError({
      code: "UNSUPPORTED",
      message: "Segment has no call to leave a group.",
    }),
  );
  expect(fake.calls).toStrictEqual([]);
});

test("without a group type the session has no group method", () => {
  expect(open().group).toBe(undefined);
});

test("reset answers the client's promise, which settles once the client has forgotten the user and the traits and started a new anonymous id", async () => {
  const fake = fakeSegment({ hold: ["reset"] });
  const session = open(fake);

  await session.identify?.({ user: { id: "ada" } });
  await session.traits?.({
    user: { id: "ada" },
    set: { plan: "pro" },
    remove: [],
  });

  let settled = false;

  const resetting = Promise.resolve(session.reset?.()).then(() => {
    settled = true;
  });

  await Promise.resolve();

  expect(fake.calls.at(-1)).toStrictEqual({ method: "reset", args: [] });
  expect(fake.state).toStrictEqual({
    userId: undefined,
    anonymousId: "anonymous-2",
    traits: {},
    enabled: true,
    running: true,
    offline: false,
    failures: {},
  });
  expect(settled).toBe(false);

  release(fake);
  await resetting;

  expect(settled).toBe(true);
});

test("collection switches the client's enabled setting and answers nothing once the client has taken it", async () => {
  const fake = fakeSegment({ hold: ["enabled.set"] });
  const session = open(fake);

  let settled = false;

  const closing = Promise.resolve(session.collection?.(false)).then(
    (answer) => {
      settled = true;

      return answer;
    },
  );

  await Promise.resolve();

  expect(fake.calls).toStrictEqual([{ method: "enabled.set", args: [false] }]);
  expect(fake.state.enabled).toBe(false);
  expect(settled).toBe(false);

  release(fake);

  expect(await closing).toBe(undefined);

  const opening = session.collection?.(true);

  release(fake);

  expect(await opening).toBe(undefined);
  expect(fake.state.enabled).toBe(true);
});

test("flush uploads the queue and answers flushed once nothing is left, and failed with DELIVERY_FAILED while the client keeps events for a retry", async () => {
  const fake = fakeSegment();
  const session = open(fake);

  await session.track(
    createTrackedEvent({ properties: { note: "sent" } }),
    createContext(),
  );

  expect(await session.flush?.(createFlushContext())).toStrictEqual({
    status: "flushed",
  });

  fake.state.offline = true;

  await session.track(
    createTrackedEvent({ properties: { note: "kept" } }),
    createContext(),
  );
  await session.track(
    createTrackedEvent({ properties: { note: "kept too" } }),
    createContext(),
  );

  expect(await session.flush?.(createFlushContext())).toStrictEqual({
    status: "failed",
    error: new TraceError({
      code: "DELIVERY_FAILED",
      message:
        "Segment kept 2 of its queued events for a retry after the flush.",
    }),
  });
  expect(getMethods(fake)).toStrictEqual([
    "track",
    "flush",
    "pendingEvents",
    "track",
    "track",
    "flush",
    "pendingEvents",
  ]);
  expect(fake.sent.map(({ type }) => type)).toStrictEqual(["track"]);
});

test("the native handle is the client the application created, and every open answers a new session over it", () => {
  const fake = fakeSegment();
  const adapter = segment({ sdk: fake.sdk });
  const first = adapter.open();
  const second = adapter.open();

  expect(first.native).toBe(fake.sdk);
  expect(second).not.toBe(first);
  expect(second.native).toBe(fake.sdk);
});

test("through Trace, the receipt carries the sanitizer's losses and then Segment's", async () => {
  const fake = fakeSegment();

  const trace = new Trace({
    events: { "Checkout Started": event<{ plan: string; password: string }>() },
    destinations: { segment: segment({ sdk: fake.sdk }) },
    defaults: { context: { plan: "free", locale: "de" } },
  });

  onTestFinished(trace.dispose);
  trace.start();

  const receipt = trace.track("Checkout Started", {
    plan: "pro",
    password: "hunter2",
  });

  expect(await receipt.settled).toStrictEqual({
    state: "settled",
    outcomes: {
      segment: {
        status: "submitted",
        evidence: "sdk-call-returned",
        event: null,
        losses: [
          { path: "properties.password", reason: "redacted" },
          { path: "context.plan", reason: "omitted" },
        ],
      },
    },
  });
  expect(fake.calls).toStrictEqual([
    {
      method: "track",
      args: [
        "Checkout Started",
        { plan: "pro", locale: "de" },
        expect.any(Function),
      ],
    },
  ]);
});

test("through Trace, an event tracked before a sign-in stays anonymous, and the user's next event waits until the client has queued the identify", async () => {
  const fake = fakeSegment({ hold: ["identify"] });
  const trace = createTrace(fake);

  trace.start();

  const anonymous = trace.track("Note Added", { note: "before sign-in" });

  trace.user({ id: "ada" });

  const ada = trace.track("Note Added", { note: "from ada" });

  expect(await anonymous.settled).toStrictEqual(SUBMITTED);
  expect(getMethods(fake)).toStrictEqual(["track", "identify"]);

  release(fake);

  expect(await ada.settled).toStrictEqual(SUBMITTED);
  expect(getTracks(fake)).toStrictEqual([
    { note: "before sign-in", userId: undefined, anonymousId: "anonymous-1" },
    { note: "from ada", userId: "ada", anonymousId: "anonymous-1" },
  ]);
});

test("through Trace, an event in flight when the user switches keeps its user, and the next user's events wait until the client has reset", async () => {
  const fake = fakeSegment({ hold: ["reset"] });
  const trace = createTrace(fake);

  trace.start();
  trace.user({ id: "ada" });
  await trace.track("Note Added", { note: "first" }).settled;

  const inFlight = trace.track("Note Added", { note: "in flight" });

  trace.user({ id: "bob" });

  const bob = trace.track("Note Added", { note: "from bob" });

  expect(await inFlight.settled).toStrictEqual(SUBMITTED);
  expect(getMethods(fake)).toStrictEqual([
    "identify",
    "track",
    "track",
    "reset",
  ]);

  release(fake);

  expect(await bob.settled).toStrictEqual(SUBMITTED);
  expect(getTracks(fake)).toStrictEqual([
    { note: "first", userId: "ada", anonymousId: "anonymous-1" },
    { note: "in flight", userId: "ada", anonymousId: "anonymous-1" },
    { note: "from bob", userId: "bob", anonymousId: "anonymous-2" },
  ]);
});

test("through Trace, a sign-out resets the client, so the next event is anonymous under a new anonymous id", async () => {
  const fake = fakeSegment();
  const trace = createTrace(fake);

  trace.start();
  trace.user({ id: "ada" });
  await trace.track("Note Added", { note: "from ada" }).settled;
  trace.user(null);
  await trace.track("Note Added", { note: "signed out" }).settled;

  expect(getMethods(fake)).toStrictEqual([
    "identify",
    "track",
    "reset",
    "track",
  ]);
  expect(getTracks(fake)).toStrictEqual([
    { note: "from ada", userId: "ada", anonymousId: "anonymous-1" },
    { note: "signed out", userId: undefined, anonymousId: "anonymous-2" },
  ]);
});

test("through Trace, a client a plugin pauses holds events and identify in order but applies reset at once, so an event held across a sign-in keeps its user and one held across a sign-out loses it", async () => {
  const fake = fakeSegment();
  const trace = createTrace(fake);

  trace.start();
  fake.sdk.pauseEventProcessing();
  trace.track("Note Added", { note: "before sign-in" });
  trace.user({ id: "ada" });
  await trace.track("Note Added", { note: "from ada" }).settled;
  await fake.sdk.resumeEventProcessing();

  fake.sdk.pauseEventProcessing();
  await trace.track("Note Added", { note: "before sign-out" }).settled;
  trace.user(null);
  await trace.track("Note Added", { note: "signed out" }).settled;

  expect(getTracks(fake)).toStrictEqual([
    { note: "before sign-in", userId: undefined, anonymousId: "anonymous-1" },
    { note: "from ada", userId: "ada", anonymousId: "anonymous-1" },
  ]);

  await fake.sdk.resumeEventProcessing();

  expect(getTracks(fake)).toStrictEqual([
    { note: "before sign-in", userId: undefined, anonymousId: "anonymous-1" },
    { note: "from ada", userId: "ada", anonymousId: "anonymous-1" },
    { note: "before sign-out", userId: undefined, anonymousId: "anonymous-2" },
    { note: "signed out", userId: undefined, anonymousId: "anonymous-2" },
  ]);
});

test("through Trace, the configured group type reaches Segment before the next event, and another type is reported as an unsupported step", async () => {
  const fake = fakeSegment({ hold: ["group"] });
  const trace = createTrace(fake, { group: WORKSPACE });
  const diagnostics: TraceDiagnosticEvent[] = [];

  onTestFinished(
    trace.diagnostics.events.subscribe((diagnostic) => {
      diagnostics.push(diagnostic);
    }),
  );
  trace.start();
  trace.group("workspace", { id: "w_1", traits: { tier: "enterprise" } });
  trace.group("team", { id: "t_1" });

  const receipt = trace.track("Note Added", { note: "in a workspace" });

  await Promise.resolve();

  expect(getMethods(fake)).toStrictEqual(["group"]);

  release(fake);

  expect(await receipt.settled).toStrictEqual(SUBMITTED);
  expect(fake.calls[0]).toStrictEqual({
    method: "group",
    args: ["w_1", { tier: "enterprise" }],
  });
  expect(getMethods(fake)).toStrictEqual(["group", "track"]);
  expect(
    diagnostics.flatMap(({ type, context }) => {
      if (type !== "identity step unsupported") {
        return [];
      }

      return [context];
    }),
  ).toStrictEqual([{ step: "group" }]);
});

test("through Trace, a gated destination disables the client while its purpose is unknown, enables it once it is granted and disables it once it is withdrawn, and gets nothing meanwhile", async () => {
  const fake = fakeSegment();
  const trace = createTrace(fake, { consent: { segment: ["analytics"] } });

  trace.start();

  const unknown = await trace.track("Note Added", { note: "unknown" }).settled;

  trace.consent.set({ analytics: "granted" });
  await trace.track("Note Added", { note: "granted" }).settled;
  trace.consent.set({ analytics: "denied" });

  const denied = await trace.track("Note Added", { note: "denied" }).settled;

  expect(unknown).toStrictEqual({ state: "dropped", reason: "consent" });
  expect(denied).toStrictEqual({ state: "dropped", reason: "consent" });
  expect(
    fake.calls.flatMap(({ method, args }) => {
      if (method !== "enabled.set") {
        return [];
      }

      return args;
    }),
  ).toStrictEqual([false, true, false]);
  expect(fake.state.enabled).toBe(false);
  expect(getTracks(fake)).toStrictEqual([
    { note: "granted", userId: undefined, anonymousId: "anonymous-1" },
  ]);
});

test("through Trace, an event tracked in the tick consent is granted waits until the client has taken the switch, so the client queues it rather than dropping it", async () => {
  const fake = fakeSegment();
  const trace = createTrace(fake, { consent: { segment: ["analytics"] } });

  fake.state.enabled = false;
  trace.start();
  trace.consent.set({ analytics: "granted" });

  const granted = trace.track("Note Added", { note: "granted" });

  expect(await granted.settled).toStrictEqual(SUBMITTED);
  expect(getTracks(fake)).toStrictEqual([
    { note: "granted", userId: undefined, anonymousId: "anonymous-1" },
  ]);
});

test("through Trace, a user signed in while consent is unknown reaches the client once it is granted, and the user's events carry the user", async () => {
  const fake = fakeSegment();
  const trace = createTrace(fake, { consent: { segment: ["analytics"] } });

  fake.state.enabled = false;
  trace.start();
  trace.user({ id: "ada" });
  trace.consent.set({ analytics: "granted" });

  const ada = trace.track("Note Added", { note: "from ada" });

  expect(await ada.settled).toStrictEqual(SUBMITTED);
  expect(fake.state.userId).toBe("ada");
  expect(getTracks(fake)).toStrictEqual([
    { note: "from ada", userId: "ada", anonymousId: "anonymous-1" },
  ]);
});

test("through Trace, flush answers flushed once the queue is empty, and failed while the client keeps events for a retry", async () => {
  const fake = fakeSegment();
  const trace = createTrace(fake);

  trace.start();
  await trace.track("Note Added", { note: "sent" }).settled;

  expect(await trace.flush({ timeout: 1_000 })).toEqual({
    drained: true,
    destinations: { segment: { status: "flushed" } },
  });

  fake.state.offline = true;
  await trace.track("Note Added", { note: "kept" }).settled;

  expect(await trace.flush({ timeout: 1_000 })).toEqual({
    drained: true,
    destinations: {
      segment: {
        status: "failed",
        error: new TraceError({
          code: "DELIVERY_FAILED",
          message:
            "Segment kept 1 of its queued events for a retry after the flush.",
        }),
      },
    },
  });
});

test("through Trace, the native handle is the injected client once the destination is ready, and null before", () => {
  const fake = fakeSegment();
  const trace = createTrace(fake);

  expect(trace.destination("segment").native).toBe(null);

  trace.start();

  expect(trace.destination("segment").native).toBe(fake.sdk);
});

test("Trace never initializes or cleans up the client", async () => {
  const fake = fakeSegment();

  const trace = createTrace(fake, {
    group: WORKSPACE,
    consent: { segment: ["analytics"] },
  });

  trace.consent.set({ analytics: "granted" });
  trace.start();
  trace.user({ id: "ada", traits: { plan: "pro" } });
  trace.group("workspace", { id: "w_1", traits: { tier: "team" } });
  await trace.track("Note Added", { note: "all of it" }).settled;
  trace.user(null);
  await trace.flush();
  trace.dispose();

  expect(new Set(getMethods(fake))).toStrictEqual(
    new Set([
      "enabled.set",
      "identify",
      "group",
      "track",
      "reset",
      "flush",
      "pendingEvents",
    ]),
  );
});
