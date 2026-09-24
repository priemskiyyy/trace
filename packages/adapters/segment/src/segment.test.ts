import { event, Trace } from "@priemskiyyy/trace";
import type { TraceDiagnosticEvent } from "@priemskiyyy/trace";
import { expect, test } from "vitest";

import { fakeSegment } from "src/fakeSegment.fixture";
import { segment } from "src/segment";
import { createTrackedEvent } from "src/trackedEvent.fixture";
import { MAX_EVENT_SIZE } from "src/utils/constants/limits";
import { watchUnhandledRejections } from "src/watchUnhandledRejections.fixture";

type FakeSegment = ReturnType<typeof fakeSegment>;

const EVENT_ID = "3f0b6f64-6c1e-4d7a-9a4e-2b9c1d3e5f70";
const TIMESTAMP = 1_767_225_600_000;
const WORKSPACE = { type: "workspace" };
const SENT_AT = { timestamp: new Date(TIMESTAMP), messageId: EVENT_ID };

const createContext = () => ({
  signal: new AbortController().signal,
  currentGeneration: () => 1,
  now: () => TIMESTAMP,
});

const open = (
  fake: FakeSegment = fakeSegment(),
  options: { group?: { type: string } } = {},
) => segment({ sdk: fake.sdk, ...options }).open();

const createTrace = (
  fake: FakeSegment,
  options: { group?: { type: string } } = {},
) =>
  new Trace({
    events: { "App Opened": event() },
    destinations: { segment: segment({ sdk: fake.sdk, ...options }) },
  });

const getThrown = (run: () => unknown) => {
  try {
    run();
  } catch (error) {
    return error;
  }

  return null;
};

const getMethods = ({ calls }: FakeSegment) => calls.map(([method]) => method);

const getPropertiesOfSize = (size: number) => {
  const overhead = JSON.stringify({
    event: "Checkout Started",
    properties: { text: "" },
  }).length;

  return { text: "x".repeat(size - overhead) };
};

test("creating the adapter calls nothing on the SDK", () => {
  const fake = fakeSegment({ initialized: false });

  segment({ sdk: fake.sdk, group: WORKSPACE });

  expect(fake.calls).toStrictEqual([]);
});

test("an analytics-next that has not loaded fails the start, and a retry once it has loaded delivers what waited", async () => {
  const fake = fakeSegment({ initialized: false });
  const trace = createTrace(fake);

  trace.start();

  const receipt = trace.track("App Opened");

  expect(trace.destination("segment").status.get()).toStrictEqual({
    state: "failed",
    error: expect.objectContaining({
      name: "TraceError",
      code: "NOT_INITIALIZED",
      message:
        "Segment has not loaded. Pass the Analytics that AnalyticsBrowser.load resolves with, then call trace.start() again.",
    }),
  });
  expect(fake.calls).toStrictEqual([]);

  fake.sdk.initialized = true;
  trace.start();

  await expect(receipt.settled).resolves.toStrictEqual({
    state: "settled",
    outcomes: {
      segment: {
        status: "submitted",
        evidence: "sdk-call-returned",
        event: null,
        losses: [],
      },
    },
  });
  expect(fake.calls).toStrictEqual([
    [
      "track",
      "App Opened",
      {},
      { timestamp: expect.any(Date), messageId: receipt.id },
    ],
  ]);
});

test("an event is one track call with its name, its properties over its context, its time and its id as the message id", () => {
  const fake = fakeSegment();

  const answer = open(fake).track(
    createTrackedEvent({
      properties: { cart: { id: "cart_1" }, value: 49.5, currency: "EUR" },
      context: { currency: "USD", locale: "de" },
    }),
    createContext(),
  );

  expect(fake.calls).toStrictEqual([
    [
      "track",
      "Checkout Started",
      { cart: { id: "cart_1" }, value: 49.5, currency: "EUR", locale: "de" },
      SENT_AT,
    ],
  ]);
  expect(answer).toStrictEqual({
    status: "submitted",
    evidence: "sdk-call-returned",
    losses: [{ path: "context.currency", reason: "omitted" }],
  });
});

test("the answer comes at the call and names no provider event, because analytics-next's promise settles after its first attempt and proves no more", () => {
  expect(open().track(createTrackedEvent(), createContext())).toStrictEqual({
    status: "submitted",
    evidence: "sdk-call-returned",
    losses: [],
  });
});

test("an event at Segment's 32 KB limit is sent, and one byte more is dropped as provider-filtered without reaching Segment", () => {
  const fake = fakeSegment();
  const session = open(fake);
  const fits = getPropertiesOfSize(MAX_EVENT_SIZE);
  const over = getPropertiesOfSize(MAX_EVENT_SIZE + 1);

  expect(
    session.track(createTrackedEvent({ properties: fits }), createContext()),
  ).toStrictEqual({
    status: "submitted",
    evidence: "sdk-call-returned",
    losses: [],
  });
  expect(
    session.track(createTrackedEvent({ properties: over }), createContext()),
  ).toStrictEqual({
    status: "dropped",
    reason: "provider-filtered",
    losses: [{ path: "properties", reason: "invalid" }],
  });
  expect(fake.calls).toStrictEqual([
    ["track", "Checkout Started", fits, SENT_AT],
  ]);
});

test("the size counts UTF-8 bytes, so text of fewer than 32,768 characters can still pass the limit", () => {
  const fake = fakeSegment();

  const answer = open(fake).track(
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

test("losses follow the event's shape: the context's first, then the whole event's size last", () => {
  const answer = open().track(
    createTrackedEvent({
      properties: {
        plan: "pro",
        ...getPropertiesOfSize(MAX_EVENT_SIZE + 100),
      },
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

test("an event analytics-next refuses never becomes an unhandled rejection in the application", async () => {
  const fake = fakeSegment();
  const { rejections, settle } = watchUnhandledRejections();

  fake.state.failure = new Error("Event missing");

  const answer = open(fake).track(createTrackedEvent(), createContext());

  await settle();

  expect(answer).toStrictEqual({
    status: "submitted",
    evidence: "sdk-call-returned",
    losses: [],
  });
  expect(rejections).toStrictEqual([]);
});

test("an identify, traits or group call analytics-next refuses never becomes an unhandled rejection in the application", async () => {
  const fake = fakeSegment();
  const session = open(fake, { group: WORKSPACE });
  const { rejections, settle } = watchUnhandledRejections();

  fake.state.failure = new Error("Storage is full");

  session.identify?.({ user: { id: "ada" } });
  session.traits?.({ user: { id: "ada" }, set: { plan: "pro" }, remove: [] });
  session.group?.({
    user: { id: "ada" },
    group: { type: "workspace", id: "w_1", traits: {} },
  });
  await settle();

  expect(getMethods(fake)).toStrictEqual(["identify", "identify", "group"]);
  expect(rejections).toStrictEqual([]);
});

test("identify moves analytics-next to the user and answers at the call", () => {
  const fake = fakeSegment();

  expect(open(fake).identify?.({ user: { id: "ada" } })).toBeUndefined();
  expect(fake.calls).toStrictEqual([["identify", "ada"]]);
  expect(fake.state.userId).toBe("ada");
});

test("traits reach analytics-next for the user it holds, and a removal is sent as null, which Segment removes", () => {
  const fake = fakeSegment();
  const session = open(fake);

  session.identify?.({ user: { id: "ada" } });

  expect(
    session.traits?.({
      user: { id: "ada" },
      set: { plan: "pro", seats: 4 },
      remove: ["role"],
    }),
  ).toBeUndefined();
  expect(fake.calls).toStrictEqual([
    ["identify", "ada"],
    ["identify", { role: null, plan: "pro", seats: 4 }],
  ]);
  expect(fake.state).toMatchObject({
    userId: "ada",
    traits: { role: null, plan: "pro", seats: 4 },
  });
});

test("a membership of the configured type is one group call with its traits", () => {
  const fake = fakeSegment();

  expect(
    open(fake, { group: WORKSPACE }).group?.({
      user: { id: "ada" },
      group: { type: "workspace", id: "w_1", traits: { tier: "enterprise" } },
    }),
  ).toBeUndefined();
  expect(fake.calls).toStrictEqual([["group", "w_1", { tier: "enterprise" }]]);
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
    expect.objectContaining({
      name: "TraceError",
      code: "UNSUPPORTED",
      message:
        'Segment keeps one group, and this destination sends only the "workspace" type.',
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
    expect.objectContaining({
      name: "TraceError",
      code: "UNSUPPORTED",
      message: "Segment has no call to leave a group.",
    }),
  );
  expect(fake.calls).toStrictEqual([]);
});

test("without a group type the session has no group method", () => {
  expect(open().group).toBeUndefined();
});

test("reset forgets analytics-next's user, anonymous id, traits and group", () => {
  const fake = fakeSegment();
  const session = open(fake, { group: WORKSPACE });

  session.identify?.({ user: { id: "ada" } });
  session.group?.({
    user: { id: "ada" },
    group: { type: "workspace", id: "w_1", traits: { tier: "enterprise" } },
  });

  expect(session.reset?.()).toBeUndefined();
  expect(getMethods(fake)).toStrictEqual(["identify", "group", "reset"]);
  expect(fake.state).toStrictEqual({
    userId: null,
    anonymousId: null,
    traits: {},
    groupId: null,
    groupTraits: {},
    failure: null,
  });
});

test("the session has no collection, no flush and no dispose, because analytics-next offers no switch or queue to drive", () => {
  const session = open();

  expect(session.collection).toBeUndefined();
  expect(session.flush).toBeUndefined();
  expect(session.dispose).toBeUndefined();
});

test("the native handle is the analytics-next instance the application loaded", () => {
  const fake = fakeSegment();

  expect(open(fake).native).toBe(fake.sdk);
});

test("every open answers a new session over the same instance", () => {
  const fake = fakeSegment();
  const adapter = segment({ sdk: fake.sdk });
  const first = adapter.open();
  const second = adapter.open();

  expect(second).not.toBe(first);
  expect(second.native).toBe(fake.sdk);
});

test("Trace never initializes or closes the SDK", () => {
  const fake = fakeSegment();
  const session = open(fake, { group: WORKSPACE });

  session.identify?.({ user: { id: "ada" } });
  session.traits?.({ user: { id: "ada" }, set: { plan: "pro" }, remove: [] });
  session.group?.({
    user: { id: "ada" },
    group: { type: "workspace", id: "w_1", traits: {} },
  });
  session.track(createTrackedEvent(), createContext());
  session.reset?.();

  expect(getMethods(fake)).toStrictEqual([
    "identify",
    "identify",
    "group",
    "track",
    "reset",
  ]);
});

test("through a Trace, the receipt carries the sanitizer's losses and then Segment's", async () => {
  const fake = fakeSegment();

  const trace = new Trace({
    events: { "Checkout Started": event<{ plan: string; password: string }>() },
    destinations: { segment: segment({ sdk: fake.sdk }) },
    defaults: { context: { plan: "free", locale: "de" } },
  });

  trace.start();

  const receipt = trace.track("Checkout Started", {
    plan: "pro",
    password: "hunter2",
  });

  await expect(receipt.settled).resolves.toStrictEqual({
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
    [
      "track",
      "Checkout Started",
      { plan: "pro", locale: "de" },
      { timestamp: expect.any(Date), messageId: receipt.id },
    ],
  ]);
});

test("through a Trace, a user switch resets analytics-next before the next user, so each event keeps its own user", async () => {
  const fake = fakeSegment();
  const trace = createTrace(fake);

  trace.start();
  trace.user({ id: "ada", traits: { plan: "pro" } });
  await trace.track("App Opened").settled;
  trace.user({ id: "bob" });
  await trace.track("App Opened").settled;
  fake.send();

  expect(getMethods(fake)).toStrictEqual([
    "identify",
    "identify",
    "track",
    "reset",
    "identify",
    "track",
  ]);
  expect(fake.events).toMatchObject([
    { type: "identify", userId: "ada", traits: {} },
    { type: "identify", userId: "ada", traits: { plan: "pro" } },
    { type: "track", userId: "ada", anonymousId: "anonymous-1" },
    { type: "identify", userId: "bob", traits: {} },
    { type: "track", userId: "bob", anonymousId: "anonymous-2" },
  ]);
});

test("through a Trace, a sign-out resets analytics-next, so the next event is anonymous under a new anonymous id", async () => {
  const fake = fakeSegment();
  const trace = createTrace(fake);

  trace.start();
  trace.user({ id: "ada" });
  await trace.track("App Opened").settled;
  trace.user(null);
  await trace.track("App Opened").settled;
  fake.send();

  expect(getMethods(fake)).toStrictEqual([
    "identify",
    "track",
    "reset",
    "track",
  ]);
  expect(fake.events).toMatchObject([
    { type: "identify", userId: "ada" },
    { type: "track", userId: "ada", anonymousId: "anonymous-1" },
    { type: "track", userId: null, anonymousId: "anonymous-2" },
  ]);
});

test("through a Trace, an anonymous event analytics-next sends after a sign-in goes out under the user who signed in, because analytics-next fills a missing user when it sends", async () => {
  const fake = fakeSegment();
  const trace = createTrace(fake);

  trace.start();
  await trace.track("App Opened").settled;
  trace.user({ id: "ada" });
  await trace.track("App Opened").settled;
  fake.send();

  expect(fake.events).toMatchObject([
    { type: "track", userId: "ada", anonymousId: "anonymous-1" },
    { type: "identify", userId: "ada", anonymousId: "anonymous-1" },
    { type: "track", userId: "ada", anonymousId: "anonymous-1" },
  ]);
});

test("through a Trace, an anonymous event still unsent after a switch goes out under the next user with the anonymous id from before the sign-in, while an identified event keeps its own user", async () => {
  const fake = fakeSegment();
  const trace = createTrace(fake);

  trace.start();
  await trace.track("App Opened").settled;
  trace.user({ id: "ada" });
  await trace.track("App Opened").settled;
  trace.user({ id: "bob" });
  await trace.track("App Opened").settled;
  fake.send();

  expect(
    fake.events.flatMap(({ type, userId, anonymousId }) => {
      if (type !== "track") {
        return [];
      }

      return [{ userId, anonymousId }];
    }),
  ).toStrictEqual([
    { userId: "bob", anonymousId: "anonymous-1" },
    { userId: "ada", anonymousId: "anonymous-1" },
    { userId: "bob", anonymousId: "anonymous-2" },
  ]);
});

test("through a Trace, the configured group type reaches Segment and another type is reported as an unsupported step", async () => {
  const fake = fakeSegment();
  const trace = createTrace(fake, { group: WORKSPACE });
  const diagnostics: TraceDiagnosticEvent[] = [];

  trace.diagnostics.events.subscribe((diagnostic) => {
    diagnostics.push(diagnostic);
  });
  trace.start();
  trace.group("workspace", { id: "w_1", traits: { tier: "enterprise" } });
  trace.group("team", { id: "t_1" });

  const receipt = trace.track("App Opened");

  await expect(receipt.settled).resolves.toMatchObject({
    outcomes: { segment: { status: "submitted" } },
  });
  expect(getMethods(fake)).toStrictEqual(["group", "track"]);
  expect(fake.calls[0]).toStrictEqual(["group", "w_1", { tier: "enterprise" }]);
  expect(
    diagnostics.flatMap(({ type, context }) => {
      if (type !== "identity step unsupported") {
        return [];
      }

      return [context];
    }),
  ).toStrictEqual([{ step: "group" }]);
});

test("through a Trace, a consent-gated Segment receives nothing until consent is granted, and has no switch of its own", async () => {
  const fake = fakeSegment();

  const trace = new Trace({
    events: { "App Opened": event() },
    destinations: { segment: segment({ sdk: fake.sdk }) },
    consent: { segment: ["analytics"] },
  });

  trace.start();

  const before = trace.track("App Opened");

  trace.consent.set({ analytics: "granted" });

  const after = trace.track("App Opened");

  await expect(before.settled).resolves.toStrictEqual({
    state: "dropped",
    reason: "consent",
  });
  await expect(after.settled).resolves.toMatchObject({
    outcomes: { segment: { status: "submitted" } },
  });
  expect(fake.calls).toStrictEqual([
    [
      "track",
      "App Opened",
      {},
      { timestamp: expect.any(Date), messageId: after.id },
    ],
  ]);
});
