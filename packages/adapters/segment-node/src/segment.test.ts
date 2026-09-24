import { event, Trace } from "@priemskiyyy/trace";
import type {
  FlushResult,
  TraceDiagnosticEvent,
  TrackContext,
} from "@priemskiyyy/trace";
import { afterEach, expect, test, vi } from "vitest";

import { fakeSegment } from "src/fakeSegment.fixture";
import { segment } from "src/segment";
import { createTrackedEvent, TRACKED_EVENT } from "src/trackedEvent.fixture";

type FakeSegment = ReturnType<typeof fakeSegment>;

type Options = { group?: { type: string }; anonymousId?: string };

const { id: EVENT_ID, timestamp: TIMESTAMP } = TRACKED_EVENT;
const WORKSPACE = { type: "workspace" };
const VISITOR = "visitor-7";
const ANONYMOUS = { generation: 0, user: null, traits: {}, groups: {} };

afterEach(() => {
  vi.useRealTimers();
});

const createContext = (currentGeneration = 1): TrackContext => ({
  signal: new AbortController().signal,
  currentGeneration: () => currentGeneration,
  now: () => TIMESTAMP,
});

const createFlushContext = (signal = new AbortController().signal) => ({
  timeout: 1_000,
  signal,
});

const open = (fake: FakeSegment = fakeSegment(), options: Options = {}) =>
  segment({ sdk: fake.sdk, ...options }).open();

const createTrace = (fake: FakeSegment, options: Options = {}) =>
  new Trace({
    events: {
      "App Opened": event(),
      "Checkout Started": event<{ plan: string; password: string }>(),
    },
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

const nextMacrotask = () =>
  new Promise((resolve) => {
    setImmediate(resolve);
  });

const watch = (answer: FlushResult | Promise<FlushResult> | undefined) => {
  const watched: { result: FlushResult | undefined | null } = { result: null };

  Promise.resolve(answer).then((result) => {
    watched.result = result;
  });

  return watched;
};

test("creating the adapter reads and calls nothing on analytics-node", () => {
  const fake = fakeSegment();
  const reads: PropertyKey[] = [];

  const sdk = new Proxy(fake.sdk, {
    get: (target, key, receiver) => {
      reads.push(key);

      return Reflect.get(target, key, receiver);
    },
  });

  expect(segment({ sdk, group: WORKSPACE, anonymousId: VISITOR }).name).toBe(
    "segment-node",
  );
  expect(reads).toStrictEqual([]);
  expect(fake.calls).toStrictEqual([]);
});

test("open never refuses and calls nothing, because analytics-node takes calls from the moment it is constructed", () => {
  const fake = fakeSegment();

  expect(segment({ sdk: fake.sdk }).open().native).toBe(fake.sdk);
  expect(fake.calls).toStrictEqual([]);
});

test("an event is one track call with its user, the anonymous id, its name, its properties over its context, its time and its id as the message id", () => {
  const fake = fakeSegment();

  const answer = open(fake, { anonymousId: VISITOR }).track(
    createTrackedEvent({
      properties: { cart: { id: "cart_1" }, value: 49.5, currency: "EUR" },
      context: { currency: "USD", locale: "de" },
    }),
    createContext(),
  );

  expect(fake.calls).toStrictEqual([
    [
      "track",
      {
        userId: "ada",
        anonymousId: VISITOR,
        event: "Checkout Started",
        properties: {
          cart: { id: "cart_1" },
          value: 49.5,
          currency: "EUR",
          locale: "de",
        },
        timestamp: new Date(TIMESTAMP),
        messageId: EVENT_ID,
      },
    ],
  ]);
  expect(answer).toStrictEqual({
    status: "submitted",
    evidence: "sdk-call-returned",
    losses: [{ path: "context.currency", reason: "omitted" }],
  });
});

test("an identified event without an anonymous id carries its user alone, and an anonymous event the anonymous id alone", () => {
  const fake = fakeSegment();

  open(fake).track(createTrackedEvent(), createContext());
  open(fake, { anonymousId: VISITOR }).track(
    createTrackedEvent({ identity: ANONYMOUS }),
    createContext(),
  );

  expect(fake.calls).toStrictEqual([
    [
      "track",
      {
        userId: "ada",
        event: "Checkout Started",
        properties: {},
        timestamp: new Date(TIMESTAMP),
        messageId: EVENT_ID,
      },
    ],
    [
      "track",
      {
        anonymousId: VISITOR,
        event: "Checkout Started",
        properties: {},
        timestamp: new Date(TIMESTAMP),
        messageId: EVENT_ID,
      },
    ],
  ]);
});

test("an event with neither a user nor an anonymous id is skipped as unidentified before analytics-node, which would throw", () => {
  const fake = fakeSegment();

  expect(
    open(fake).track(
      createTrackedEvent({ identity: ANONYMOUS, properties: { plan: "pro" } }),
      createContext(),
    ),
  ).toStrictEqual({ status: "skipped", reason: "unidentified" });
  expect(fake.calls).toStrictEqual([]);
});

test("the answer comes at the call and names no provider event, because analytics-node reports a batch only once it was sent", () => {
  const fake = fakeSegment();

  expect(open(fake).track(createTrackedEvent(), createContext())).toStrictEqual(
    { status: "submitted", evidence: "sdk-call-returned", losses: [] },
  );
  expect(fake.sent).toStrictEqual([]);
});

test("an event keeps the user it was accepted with after the Trace's user changed, because analytics-node takes the user on every call and holds nobody's session", () => {
  const fake = fakeSegment();

  const answer = open(fake).track(createTrackedEvent(), createContext(4));

  expect(answer).toStrictEqual({
    status: "submitted",
    evidence: "sdk-call-returned",
    losses: [],
  });
  expect(fake.calls).toStrictEqual([
    [
      "track",
      {
        userId: "ada",
        event: "Checkout Started",
        properties: {},
        timestamp: new Date(TIMESTAMP),
        messageId: EVENT_ID,
      },
    ],
  ]);
});

test("an event at Segment's 32 KB limit is sent, and one byte more is dropped as provider-filtered with an invalid size, without reaching analytics-node", () => {
  const fake = fakeSegment();
  const session = open(fake);
  const fits = getPropertiesOfSize(32_768);
  const over = getPropertiesOfSize(32_769);

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
    [
      "track",
      {
        userId: "ada",
        event: "Checkout Started",
        properties: fits,
        timestamp: new Date(TIMESTAMP),
        messageId: EVENT_ID,
      },
    ],
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

test("losses follow the event's shape: the context's first, and the size of the whole event last", () => {
  const answer = open().track(
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

test("traits are one identify call for the user and the anonymous id, with a removed trait as null, which Segment removes", () => {
  const fake = fakeSegment();

  expect(
    open(fake, { anonymousId: VISITOR }).traits?.({
      user: { id: "ada" },
      set: { plan: "pro", seats: 4 },
      remove: ["role"],
    }),
  ).toBeUndefined();
  expect(fake.calls).toStrictEqual([
    [
      "identify",
      {
        userId: "ada",
        anonymousId: VISITOR,
        traits: { role: null, plan: "pro", seats: 4 },
      },
    ],
  ]);
});

test("traits without a user go to the anonymous id, and without either they are refused as unsupported and send nothing", () => {
  const withVisitor = fakeSegment();
  const withoutVisitor = fakeSegment();
  const update = { user: null, set: { plan: "pro" }, remove: [] };

  open(withVisitor, { anonymousId: VISITOR }).traits?.(update);

  expect(getThrown(() => open(withoutVisitor).traits?.(update))).toStrictEqual(
    expect.objectContaining({
      name: "TraceError",
      code: "UNSUPPORTED",
      message:
        "Segment files traits under a user id or an anonymous id, and this update has neither. Pass anonymousId to reach signed-out visitors.",
    }),
  );
  expect(withVisitor.calls).toStrictEqual([
    ["identify", { anonymousId: VISITOR, traits: { plan: "pro" } }],
  ]);
  expect(withoutVisitor.calls).toStrictEqual([]);
});

test("a membership of the configured type is one group call for the user and the anonymous id, with its traits", () => {
  const fake = fakeSegment();

  expect(
    open(fake, { group: WORKSPACE, anonymousId: VISITOR }).group?.({
      user: { id: "ada" },
      group: { type: "workspace", id: "w_1", traits: { tier: "enterprise" } },
    }),
  ).toBeUndefined();
  expect(fake.calls).toStrictEqual([
    [
      "group",
      {
        userId: "ada",
        anonymousId: VISITOR,
        groupId: "w_1",
        traits: { tier: "enterprise" },
      },
    ],
  ]);
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

test("a membership without a user goes to the anonymous id, and without either it is refused as unsupported and sends nothing", () => {
  const withVisitor = fakeSegment();
  const withoutVisitor = fakeSegment();

  const update = {
    user: null,
    group: { type: "workspace", id: "w_1", traits: {} },
  };

  open(withVisitor, { group: WORKSPACE, anonymousId: VISITOR }).group?.(update);

  expect(
    getThrown(() => open(withoutVisitor, { group: WORKSPACE }).group?.(update)),
  ).toStrictEqual(
    expect.objectContaining({
      name: "TraceError",
      code: "UNSUPPORTED",
      message:
        "Segment files a group under a user id or an anonymous id, and this update has neither. Pass anonymousId to reach signed-out visitors.",
    }),
  );
  expect(withVisitor.calls).toStrictEqual([
    ["group", { anonymousId: VISITOR, groupId: "w_1", traits: {} }],
  ]);
  expect(withoutVisitor.calls).toStrictEqual([]);
});

test("without a group type the session has no group method", () => {
  expect(open().group).toBeUndefined();
});

test("the session has no identify, no reset, no collection and no dispose, because analytics-node holds nobody between calls and switches off only when it is constructed", () => {
  const session = open(fakeSegment(), {
    group: WORKSPACE,
    anonymousId: VISITOR,
  });

  expect(session.identify).toBeUndefined();
  expect(session.reset).toBeUndefined();
  expect(session.collection).toBeUndefined();
  expect(session.dispose).toBeUndefined();
});

test("flush calls analytics-node's flush and answers flushed once everything queued was sent", async () => {
  const fake = fakeSegment();
  const session = open(fake);

  session.track(createTrackedEvent(), createContext());

  const flushing = watch(session.flush?.(createFlushContext()));

  await nextMacrotask();

  expect(flushing.result).toBe(null);
  expect(getMethods(fake)).toStrictEqual(["track", "flush"]);

  fake.send();
  await nextMacrotask();

  expect(flushing.result).toStrictEqual({ status: "flushed" });
});

test("flush waits for analytics-node whatever becomes of its signal, because the lane owns the deadline", async () => {
  const fake = fakeSegment();
  const session = open(fake);
  const controller = new AbortController();

  session.track(createTrackedEvent(), createContext());

  const flushing = watch(
    session.flush?.(createFlushContext(controller.signal)),
  );

  controller.abort();
  await nextMacrotask();

  expect(flushing.result).toBe(null);
  expect(fake.state.flushing).toBe(true);

  fake.send();
  await nextMacrotask();

  expect(flushing.result).toStrictEqual({ status: "flushed" });
});

test("a flush that overlaps a pending one waits for it instead of calling analytics-node again, whose second flush would answer at once", async () => {
  const fake = fakeSegment();
  const adapter = segment({ sdk: fake.sdk });
  const first = adapter.open();
  const second = adapter.open();

  first.track(createTrackedEvent(), createContext());

  const earlier = watch(first.flush?.(createFlushContext()));
  const later = watch(second.flush?.(createFlushContext()));

  await nextMacrotask();

  expect([earlier.result, later.result]).toStrictEqual([null, null]);

  fake.send();
  await nextMacrotask();

  expect([earlier.result, later.result]).toStrictEqual([
    { status: "flushed" },
    { status: "flushed" },
  ]);
  expect(getMethods(fake)).toStrictEqual(["track", "flush"]);
  expect(fake.state.warnings).toBe(0);
});

test("the native handle is the analytics-node client the application constructed", () => {
  const fake = fakeSegment();

  expect(open(fake).native).toBe(fake.sdk);
});

test("every open answers a new session over the same client", () => {
  const fake = fakeSegment();
  const adapter = segment({ sdk: fake.sdk });
  const first = adapter.open();
  const second = adapter.open();

  expect(second).not.toBe(first);
  expect(second.native).toBe(fake.sdk);
});

test("Trace never constructs, configures or closes analytics-node", async () => {
  const fake = fakeSegment();
  const trace = createTrace(fake, { group: WORKSPACE, anonymousId: VISITOR });

  trace.start();
  trace.user({ id: "ada", traits: { plan: "pro" } });
  trace.group("workspace", { id: "w_1", traits: { tier: "enterprise" } });
  trace.track("App Opened");
  trace.user(null);
  trace.track("App Opened");

  const flushing = trace.flush();

  await nextMacrotask();
  fake.send();
  await flushing;
  trace.dispose();

  expect(getMethods(fake)).toStrictEqual([
    "identify",
    "group",
    "track",
    "track",
    "flush",
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
  trace.user({ id: "ada" });

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
      {
        userId: "ada",
        event: "Checkout Started",
        properties: { plan: "pro", locale: "de" },
        timestamp: expect.any(Date),
        messageId: receipt.id,
      },
    ],
  ]);
});

test("through a Trace, a user switch needs no reset: each event and each identify carries its own user, and the next user's traits never carry the previous user's", async () => {
  const fake = fakeSegment();
  const trace = createTrace(fake, { anonymousId: VISITOR });

  trace.start();
  trace.user({ id: "ada", traits: { plan: "pro" } });

  const first = trace.track("App Opened");

  trace.user({ id: "bob", traits: { role: "admin" } });

  const second = trace.track("App Opened");

  await Promise.all([first.settled, second.settled]);

  expect(fake.calls).toStrictEqual([
    [
      "identify",
      { userId: "ada", anonymousId: VISITOR, traits: { plan: "pro" } },
    ],
    [
      "track",
      {
        userId: "ada",
        anonymousId: VISITOR,
        event: "App Opened",
        properties: {},
        timestamp: expect.any(Date),
        messageId: first.id,
      },
    ],
    [
      "identify",
      { userId: "bob", anonymousId: VISITOR, traits: { role: "admin" } },
    ],
    [
      "track",
      {
        userId: "bob",
        anonymousId: VISITOR,
        event: "App Opened",
        properties: {},
        timestamp: expect.any(Date),
        messageId: second.id,
      },
    ],
  ]);
});

test("through a Trace, after a sign-out an event goes under the anonymous id alone, and without one it is skipped as unidentified", async () => {
  const withVisitor = fakeSegment();
  const withoutVisitor = fakeSegment();
  const visited = createTrace(withVisitor, { anonymousId: VISITOR });
  const unvisited = createTrace(withoutVisitor);

  for (const trace of [visited, unvisited]) {
    trace.start();
    trace.user({ id: "ada" });
    trace.track("App Opened");
    trace.user(null);
  }

  const anonymous = visited.track("App Opened");
  const unidentified = unvisited.track("App Opened");

  await expect(anonymous.settled).resolves.toMatchObject({
    outcomes: { segment: { status: "submitted" } },
  });
  await expect(unidentified.settled).resolves.toStrictEqual({
    state: "settled",
    outcomes: { segment: { status: "skipped", reason: "unidentified" } },
  });
  expect(withVisitor.calls.at(-1)).toStrictEqual([
    "track",
    {
      anonymousId: VISITOR,
      event: "App Opened",
      properties: {},
      timestamp: expect.any(Date),
      messageId: anonymous.id,
    },
  ]);
  expect(getMethods(withoutVisitor)).toStrictEqual(["track"]);
});

test("through a Trace, traits set while anonymous go to the anonymous id, and reach the user who signs in with both ids", async () => {
  const fake = fakeSegment();
  const trace = createTrace(fake, { anonymousId: VISITOR });

  trace.start();
  trace.traits({ plan: "pro" });
  trace.user({ id: "ada" });
  await trace.track("App Opened").settled;

  expect(fake.calls.slice(0, 2)).toStrictEqual([
    ["identify", { anonymousId: VISITOR, traits: { plan: "pro" } }],
    [
      "identify",
      { userId: "ada", anonymousId: VISITOR, traits: { plan: "pro" } },
    ],
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
  trace.user({ id: "ada" });
  trace.group("workspace", { id: "w_1", traits: { tier: "enterprise" } });
  trace.group("team", { id: "t_1" });

  const receipt = trace.track("App Opened");

  await expect(receipt.settled).resolves.toMatchObject({
    outcomes: { segment: { status: "submitted" } },
  });
  expect(getMethods(fake)).toStrictEqual(["group", "track"]);
  expect(fake.calls[0]).toStrictEqual([
    "group",
    { userId: "ada", groupId: "w_1", traits: { tier: "enterprise" } },
  ]);
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
  trace.user({ id: "ada" });

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
      {
        userId: "ada",
        event: "App Opened",
        properties: {},
        timestamp: expect.any(Date),
        messageId: after.id,
      },
    ],
  ]);
});

test("per-request Traces over one shared client never mix their users or visitors, however their calls interleave", async () => {
  const fake = fakeSegment();

  const createRequest = (anonymousId: string) => {
    const trace = createTrace(fake, { group: WORKSPACE, anonymousId });

    trace.start();

    return trace;
  };

  const ada = createRequest("visitor-a");
  const bob = createRequest("visitor-b");

  ada.user({ id: "ada", traits: { plan: "ada" } });
  bob.user({ id: "bob", traits: { plan: "bob" } });

  const first = ada.track("App Opened");
  const second = bob.track("App Opened");

  bob.group("workspace", { id: "w_bob" });
  ada.group("workspace", { id: "w_ada" });

  const third = bob.track("App Opened");
  const fourth = ada.track("App Opened");

  await Promise.all(
    [first, second, third, fourth].map(({ settled }) => settled),
  );

  const getTrack = (userId: string, anonymousId: string, messageId: string) => [
    "track",
    {
      userId,
      anonymousId,
      event: "App Opened",
      properties: {},
      timestamp: expect.any(Date),
      messageId,
    },
  ];

  expect(fake.calls).toHaveLength(8);
  expect(fake.calls).toEqual(
    expect.arrayContaining([
      [
        "identify",
        { userId: "ada", anonymousId: "visitor-a", traits: { plan: "ada" } },
      ],
      [
        "identify",
        { userId: "bob", anonymousId: "visitor-b", traits: { plan: "bob" } },
      ],
      [
        "group",
        {
          userId: "ada",
          anonymousId: "visitor-a",
          groupId: "w_ada",
          traits: {},
        },
      ],
      [
        "group",
        {
          userId: "bob",
          anonymousId: "visitor-b",
          groupId: "w_bob",
          traits: {},
        },
      ],
      getTrack("ada", "visitor-a", first.id),
      getTrack("bob", "visitor-b", second.id),
      getTrack("bob", "visitor-b", third.id),
      getTrack("ada", "visitor-a", fourth.id),
    ]),
  );
});

test("one adapter shared at module scope by per-request Traces never mixes their users", async () => {
  const fake = fakeSegment();
  const adapter = segment({ sdk: fake.sdk, group: WORKSPACE });

  const createRequest = () => {
    const trace = new Trace({
      events: { "App Opened": event() },
      destinations: { segment: adapter },
    });

    trace.start();

    return trace;
  };

  const ada = createRequest();
  const bob = createRequest();

  ada.user({ id: "ada", traits: { plan: "ada" } });
  bob.user({ id: "bob", traits: { plan: "bob" } });
  bob.group("workspace", { id: "w_bob" });

  const first = bob.track("App Opened");
  const second = ada.track("App Opened");

  await Promise.all([first.settled, second.settled]);

  expect(fake.calls).toHaveLength(5);
  expect(fake.calls).toEqual(
    expect.arrayContaining([
      ["identify", { userId: "ada", traits: { plan: "ada" } }],
      ["identify", { userId: "bob", traits: { plan: "bob" } }],
      ["group", { userId: "bob", groupId: "w_bob", traits: {} }],
      [
        "track",
        {
          userId: "bob",
          event: "App Opened",
          properties: {},
          timestamp: expect.any(Date),
          messageId: first.id,
        },
      ],
      [
        "track",
        {
          userId: "ada",
          event: "App Opened",
          properties: {},
          timestamp: expect.any(Date),
          messageId: second.id,
        },
      ],
    ]),
  );
});

test("through a Trace, a flush answers flushed once analytics-node sent its queue, and timeout while it has not", async () => {
  vi.useFakeTimers();

  const fake = fakeSegment();
  const trace = createTrace(fake);

  trace.start();
  trace.user({ id: "ada" });
  trace.track("App Opened");

  const waiting = trace.flush({ timeout: 1_000 });

  await vi.advanceTimersByTimeAsync(1_000);

  expect(await waiting).toEqual({
    drained: false,
    destinations: { segment: { status: "timeout" } },
  });

  const landing = trace.flush({ timeout: 1_000 });

  await vi.advanceTimersByTimeAsync(0);
  fake.send();

  expect(await landing).toEqual({
    drained: true,
    destinations: { segment: { status: "flushed" } },
  });
  expect(getMethods(fake)).toStrictEqual(["track", "flush"]);
});
