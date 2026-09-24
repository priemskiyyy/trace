import { Identify } from "@amplitude/analytics-node";
import { event, Trace } from "@priemskiyyy/trace";
import type {
  FlushResult,
  TrackContext,
  TrackedEvent,
} from "@priemskiyyy/trace";
import { expect, test } from "vitest";

import { amplitude } from "src/amplitude";
import { fakeAmplitude } from "src/fakeAmplitude.fixture";
import { createTrackedEvent, TRACKED_EVENT } from "src/trackedEvent.fixture";

type FakeAmplitude = ReturnType<typeof fakeAmplitude>;

type Options = { anonymousId?: string };

const { id: EVENT_ID, timestamp: TIMESTAMP } = TRACKED_EVENT;
const VISITOR = "visitor-7";
const ANONYMOUS = { generation: 0, user: null, traits: {}, groups: {} };

const SIGNED_IN = {
  generation: 1,
  user: { id: "user-ada" },
  traits: {},
  groups: {},
};

const createEvent = (overrides: Partial<TrackedEvent> = {}) =>
  createTrackedEvent({ identity: SIGNED_IN, ...overrides });

const createContext = (currentGeneration = 1): TrackContext => ({
  signal: new AbortController().signal,
  currentGeneration: () => currentGeneration,
  now: () => TIMESTAMP,
});

const createFlushContext = () => ({
  timeout: 1_000,
  signal: new AbortController().signal,
});

const open = (fake: FakeAmplitude = fakeAmplitude(), options: Options = {}) =>
  amplitude({ sdk: fake.sdk, Identify, ...options }).open();

const createTrace = (fake: FakeAmplitude, options: Options = {}) =>
  new Trace({
    events: {
      "App Opened": event(),
      "Checkout Started": event<{ plan: string; password: string }>(),
    },
    destinations: {
      amplitude: amplitude({ sdk: fake.sdk, Identify, ...options }),
    },
    now: () => TIMESTAMP,
  });

const getThrown = (run: () => unknown) => {
  try {
    run();
  } catch (error) {
    return error;
  }

  return null;
};

const getMethods = ({ calls }: FakeAmplitude) =>
  calls.map(([method]) => method);

const getTrack = (ids: Record<string, string>, insertId: string) => [
  "track",
  "App Opened",
  {},
  { ...ids, time: TIMESTAMP, insert_id: insertId },
];

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

test("creating the adapter reads and calls nothing on the Amplitude SDK", () => {
  const fake = fakeAmplitude();
  const reads: PropertyKey[] = [];

  const sdk = new Proxy(fake.sdk, {
    get: (target, key, receiver) => {
      reads.push(key);

      return Reflect.get(target, key, receiver);
    },
  });

  expect(amplitude({ sdk, Identify, anonymousId: VISITOR }).name).toBe(
    "amplitude-node",
  );
  expect(reads).toStrictEqual([]);
  expect(fake.calls).toStrictEqual([]);
});

test("open never refuses and calls nothing, because Amplitude holds the calls made before init until init has run", () => {
  const fake = fakeAmplitude({ initialized: false });
  const session = amplitude({ sdk: fake.sdk, Identify }).open();

  expect(session.native).toBe(fake.sdk);
  expect(fake.calls).toStrictEqual([]);

  session.track(createEvent(), createContext());
  fake.upload();

  expect(fake.uploaded).toStrictEqual([]);

  fake.sdk.init();
  fake.upload();

  expect(fake.uploaded.map(({ insert_id }) => insert_id)).toStrictEqual([
    EVENT_ID,
  ]);
});

test("an event is one track call with its name, its properties over its context, its time, its id as insert_id, its user and the visitor's device", () => {
  const fake = fakeAmplitude();

  const answer = open(fake, { anonymousId: VISITOR }).track(
    createEvent({
      properties: { cart: { id: "cart_1" }, value: 49.5, currency: "EUR" },
      context: { currency: "USD", locale: "de" },
    }),
    createContext(),
  );

  expect(fake.calls).toStrictEqual([
    [
      "track",
      "Checkout Started",
      {
        cart: { id: "cart_1" },
        value: 49.5,
        currency: "EUR",
        locale: "de",
      },
      {
        user_id: "user-ada",
        device_id: VISITOR,
        time: TIMESTAMP,
        insert_id: EVENT_ID,
      },
    ],
  ]);
  expect(answer).toStrictEqual({
    status: "submitted",
    evidence: "sdk-call-returned",
    losses: [{ path: "context.currency", reason: "omitted" }],
  });
});

test("a signed-in event without a visitor id carries its user alone, and a signed-out event the visitor's device alone", () => {
  const fake = fakeAmplitude();

  open(fake).track(createEvent(), createContext());
  open(fake, { anonymousId: VISITOR }).track(
    createEvent({ identity: ANONYMOUS }),
    createContext(),
  );

  expect(fake.calls.map(([, , , options]) => options)).toStrictEqual([
    { user_id: "user-ada", time: TIMESTAMP, insert_id: EVENT_ID },
    { device_id: VISITOR, time: TIMESTAMP, insert_id: EVENT_ID },
  ]);
});

test("an event with neither a user nor a visitor id is skipped as unidentified before Amplitude, whose API would reject it", () => {
  const fake = fakeAmplitude();

  expect(
    open(fake).track(createEvent({ identity: ANONYMOUS }), createContext()),
  ).toStrictEqual({ status: "skipped", reason: "unidentified" });
  expect(fake.calls).toStrictEqual([]);
});

test("a user id or a visitor id shorter than Amplitude's default minimum of 5 characters is sent as it is, because init can lower the minimum", () => {
  const fake = fakeAmplitude();
  const session = open(fake, { anonymousId: "v-7" });

  session.track(
    createEvent({ identity: { ...SIGNED_IN, user: { id: "ada" } } }),
    createContext(),
  );
  session.track(createEvent({ identity: ANONYMOUS }), createContext());

  expect(fake.calls.map(([, , , options]) => options)).toStrictEqual([
    { user_id: "ada", device_id: "v-7", time: TIMESTAMP, insert_id: EVENT_ID },
    { device_id: "v-7", time: TIMESTAMP, insert_id: EVENT_ID },
  ]);
});

test("a string Amplitude cuts goes whole as a truncated loss, and the properties' losses come before the context's", () => {
  const fake = fakeAmplitude();
  const long = "n".repeat(1_025);

  const answer = open(fake).track(
    createEvent({
      properties: { plan: "pro", note: long },
      context: { plan: "free", page: long },
    }),
    createContext(),
  );

  expect(fake.calls.map(([, , properties]) => properties)).toStrictEqual([
    { plan: "pro", note: long, page: long },
  ]);
  expect(answer).toStrictEqual({
    status: "submitted",
    evidence: "sdk-call-returned",
    losses: [
      { path: "properties.note", reason: "truncated" },
      { path: "context.plan", reason: "omitted" },
      { path: "context.page", reason: "truncated" },
    ],
  });
});

test("the answer comes at the call and names no provider event, because Amplitude uploads the event later", () => {
  const fake = fakeAmplitude();

  expect(open(fake).track(createEvent(), createContext())).toStrictEqual({
    status: "submitted",
    evidence: "sdk-call-returned",
    losses: [],
  });
  expect(fake.uploaded).toStrictEqual([]);
});

test("an event keeps the user it was accepted with after the Trace's user changed, because Amplitude takes the ids on every call", () => {
  const fake = fakeAmplitude();

  expect(open(fake).track(createEvent(), createContext(4))).toStrictEqual({
    status: "submitted",
    evidence: "sdk-call-returned",
    losses: [],
  });
  expect(fake.calls.map(([, , , options]) => options)).toStrictEqual([
    { user_id: "user-ada", time: TIMESTAMP, insert_id: EVENT_ID },
  ]);
});

test("traits are one identify for the user and the visitor's device, with an unset for each removed trait and a set for each value", () => {
  const fake = fakeAmplitude();

  expect(
    open(fake, { anonymousId: VISITOR }).traits?.({
      user: { id: "user-ada" },
      set: { plan: "pro", seats: 4 },
      remove: ["role"],
    }),
  ).toBe(undefined);
  expect(fake.calls).toStrictEqual([
    [
      "identify",
      { $unset: { role: "-" }, $set: { plan: "pro", seats: 4 } },
      { user_id: "user-ada", device_id: VISITOR },
    ],
  ]);
});

test("traits while signed out go to the visitor's device, and without a visitor id they are refused as unsupported and send nothing", () => {
  const withVisitor = fakeAmplitude();
  const withoutVisitor = fakeAmplitude();
  const update = { user: null, set: { plan: "pro" }, remove: [] };

  open(withVisitor, { anonymousId: VISITOR }).traits?.(update);

  expect(getThrown(() => open(withoutVisitor).traits?.(update))).toStrictEqual(
    expect.objectContaining({
      name: "TraceError",
      code: "UNSUPPORTED",
      message:
        "Amplitude files user properties under a user id or a device id, and this update has neither. Pass anonymousId to reach signed-out visitors.",
    }),
  );
  expect(withVisitor.calls).toStrictEqual([
    ["identify", { $set: { plan: "pro" } }, { device_id: VISITOR }],
  ]);
  expect(withoutVisitor.calls).toStrictEqual([]);
});

test("a trait value Identify refuses is left out, the rest is sent, and the change is reported unsupported", () => {
  const fake = fakeAmplitude();

  const thrown = getThrown(() =>
    open(fake).traits?.({
      user: { id: "user-ada" },
      set: { plan: "pro", tags: [true, "beta"] },
      remove: [],
    }),
  );

  expect(thrown).toStrictEqual(
    expect.objectContaining({
      name: "TraceError",
      code: "UNSUPPORTED",
      message:
        "Amplitude cannot take these values, so they were left out: traits.tags.",
    }),
  );
  expect(fake.calls).toStrictEqual([
    ["identify", { $set: { plan: "pro" } }, { user_id: "user-ada" }],
  ]);
});

test("a membership is a setGroup for the user and the visitor's device, and its traits a groupIdentify, a removed trait as an unset", () => {
  const fake = fakeAmplitude();

  expect(
    open(fake, { anonymousId: VISITOR }).group?.({
      user: { id: "user-ada" },
      group: {
        type: "workspace",
        id: "w_1",
        traits: { tier: "team", legacy: null },
      },
    }),
  ).toBe(undefined);
  expect(fake.calls).toStrictEqual([
    [
      "setGroup",
      "workspace",
      "w_1",
      { user_id: "user-ada", device_id: VISITOR },
    ],
    [
      "groupIdentify",
      "workspace",
      "w_1",
      { $set: { tier: "team" }, $unset: { legacy: "-" } },
      { user_id: "user-ada", device_id: VISITOR },
    ],
  ]);
});

test("a membership without traits is a setGroup alone", () => {
  const fake = fakeAmplitude();

  open(fake).group?.({
    user: { id: "user-ada" },
    group: { type: "workspace", id: "w_1", traits: {} },
  });

  expect(getMethods(fake)).toStrictEqual(["setGroup"]);
});

test("leaving a group is a setGroup with an empty list, the best Amplitude offers, since it documents no way to leave one", () => {
  const fake = fakeAmplitude();

  open(fake).group?.({
    user: { id: "user-ada" },
    group: { type: "workspace", id: null, traits: {} },
  });

  expect(fake.calls).toStrictEqual([
    ["setGroup", "workspace", [], { user_id: "user-ada" }],
  ]);
});

test("a group change without a user or a visitor id is refused as unsupported and sends nothing", () => {
  const fake = fakeAmplitude();

  expect(
    getThrown(() =>
      open(fake).group?.({
        user: null,
        group: { type: "workspace", id: "w_1", traits: { tier: "team" } },
      }),
    ),
  ).toStrictEqual(
    expect.objectContaining({
      name: "TraceError",
      code: "UNSUPPORTED",
      message:
        "Amplitude files a group under a user id or a device id, and this update has neither. Pass anonymousId to reach signed-out visitors.",
    }),
  );
  expect(fake.calls).toStrictEqual([]);
});

test("a group trait Identify refuses is left out, the membership and the rest are sent, and the change is reported unsupported", () => {
  const fake = fakeAmplitude();

  const thrown = getThrown(() =>
    open(fake).group?.({
      user: { id: "user-ada" },
      group: {
        type: "workspace",
        id: "w_1",
        traits: { tier: "team", note: "n".repeat(1_025) },
      },
    }),
  );

  expect(thrown).toStrictEqual(
    expect.objectContaining({
      name: "TraceError",
      code: "UNSUPPORTED",
      message:
        "Amplitude cannot take these values, so they were left out: group.workspace.note.",
    }),
  );
  expect(fake.calls).toStrictEqual([
    ["setGroup", "workspace", "w_1", { user_id: "user-ada" }],
    [
      "groupIdentify",
      "workspace",
      "w_1",
      { $set: { tier: "team" } },
      { user_id: "user-ada" },
    ],
  ]);
});

test("flush calls Amplitude's flush and then waits for the uploads the session started, an identity call's as much as an event's, answering flushed once each answered 2xx", async () => {
  const fake = fakeAmplitude();
  const session = open(fake, { anonymousId: VISITOR });

  session.traits?.({
    user: { id: "user-ada" },
    set: { plan: "pro" },
    remove: [],
  });

  const flushing = watch(session.flush?.(createFlushContext()));

  await nextMacrotask();

  expect(flushing.result).toBe(null);
  expect(getMethods(fake)).toStrictEqual(["identify", "flush"]);

  fake.upload();
  await nextMacrotask();

  expect(flushing.result).toStrictEqual({ status: "flushed" });
});

test("flush answers failed with DELIVERY_FAILED, counting every upload of the session Amplitude answered outside 2xx: events, traits, memberships and group traits", async () => {
  const fake = fakeAmplitude();
  const session = open(fake, { anonymousId: VISITOR });

  session.track(createEvent(), createContext());
  session.traits?.({ user: null, set: { plan: "pro" }, remove: [] });
  session.group?.({
    user: null,
    group: { type: "workspace", id: "w_1", traits: { tier: "team" } },
  });

  const flushing = session.flush?.(createFlushContext());

  fake.upload(400);

  await expect(flushing).resolves.toStrictEqual({
    status: "failed",
    error: expect.objectContaining({
      name: "TraceError",
      code: "DELIVERY_FAILED",
      message:
        "Amplitude did not accept 4 of this destination's uploads since the last flush.",
    }),
  });
});

test("an upload Amplitude refused before the flush began, such as one another Trace's flush sent, makes the flush failed, and the next flush answers flushed", async () => {
  const fake = fakeAmplitude();
  const session = open(fake, { anonymousId: VISITOR });

  session.track(createEvent(), createContext());
  fake.upload(500);
  await nextMacrotask();

  await expect(session.flush?.(createFlushContext())).resolves.toStrictEqual({
    status: "failed",
    error: expect.objectContaining({
      name: "TraceError",
      code: "DELIVERY_FAILED",
      message:
        "Amplitude did not accept 1 of this destination's uploads since the last flush.",
    }),
  });
  await expect(session.flush?.(createFlushContext())).resolves.toStrictEqual({
    status: "flushed",
  });
});

test("a session's flush waits only for its own uploads, so another session's upload over the same SDK does not hold it", async () => {
  const fake = fakeAmplitude();
  const adapter = amplitude({ sdk: fake.sdk, Identify });
  const first = adapter.open();
  const second = adapter.open();

  first.track(createEvent(), createContext());

  await expect(second.flush?.(createFlushContext())).resolves.toStrictEqual({
    status: "flushed",
  });
  expect(fake.uploaded).toStrictEqual([]);
});

test("the session has no identify, no reset and no dispose, because the Node SDK holds no user between calls, and no collection, because its opt-out switches every Trace over it", () => {
  const session = open(fakeAmplitude(), { anonymousId: VISITOR });

  expect(session.identify).toBe(undefined);
  expect(session.reset).toBe(undefined);
  expect(session.collection).toBe(undefined);
  expect(session.dispose).toBe(undefined);
});

test("the native handle is the SDK the application initialized", () => {
  const fake = fakeAmplitude();

  expect(open(fake).native).toBe(fake.sdk);
});

test("every open answers a new session over the same SDK", () => {
  const fake = fakeAmplitude();
  const adapter = amplitude({ sdk: fake.sdk, Identify });
  const first = adapter.open();
  const second = adapter.open();

  expect(second).not.toBe(first);
  expect(second.native).toBe(fake.sdk);
});

test("Trace never initializes or closes Amplitude", async () => {
  const fake = fakeAmplitude();

  const trace = createTrace(fake, { anonymousId: VISITOR });

  trace.start();
  trace.user({ id: "user-ada", traits: { plan: "pro" } });
  trace.group("workspace", { id: "w_1", traits: { tier: "team" } });
  trace.track("App Opened");
  trace.group("workspace", null);
  trace.user(null);
  trace.track("App Opened");

  const flushing = trace.flush();

  await nextMacrotask();
  fake.upload();
  await flushing;
  trace.dispose();

  expect(getMethods(fake)).toStrictEqual([
    "identify",
    "setGroup",
    "groupIdentify",
    "track",
    "setGroup",
    "track",
    "flush",
  ]);
});

test("through a Trace, the receipt carries the sanitizer's losses and then Amplitude's", async () => {
  const fake = fakeAmplitude();
  const long = "n".repeat(1_025);

  const trace = new Trace({
    events: { "Checkout Started": event<{ plan: string; password: string }>() },
    destinations: { amplitude: amplitude({ sdk: fake.sdk, Identify }) },
    defaults: { context: { plan: "free", page: long } },
    now: () => TIMESTAMP,
  });

  trace.start();
  trace.user({ id: "user-ada" });

  const receipt = trace.track("Checkout Started", {
    plan: "pro",
    password: "hunter2",
  });

  await expect(receipt.settled).resolves.toStrictEqual({
    state: "settled",
    outcomes: {
      amplitude: {
        status: "submitted",
        evidence: "sdk-call-returned",
        event: null,
        losses: [
          { path: "properties.password", reason: "redacted" },
          { path: "context.plan", reason: "omitted" },
          { path: "context.page", reason: "truncated" },
        ],
      },
    },
  });
  expect(fake.calls).toStrictEqual([
    [
      "track",
      "Checkout Started",
      { plan: "pro", page: long },
      { user_id: "user-ada", time: TIMESTAMP, insert_id: receipt.id },
    ],
  ]);
});

test("through a Trace, a user switch needs no reset: each event and each trait update names its own user, and the next user's traits never carry the previous user's", async () => {
  const fake = fakeAmplitude();
  const trace = createTrace(fake, { anonymousId: VISITOR });

  trace.start();
  trace.user({ id: "user-ada", traits: { plan: "pro" } });

  const first = trace.track("App Opened");

  trace.user({ id: "user-bob", traits: { role: "admin" } });

  const second = trace.track("App Opened");

  await Promise.all([first.settled, second.settled]);

  expect(fake.calls).toStrictEqual([
    [
      "identify",
      { $set: { plan: "pro" } },
      { user_id: "user-ada", device_id: VISITOR },
    ],
    getTrack({ user_id: "user-ada", device_id: VISITOR }, first.id),
    [
      "identify",
      { $set: { role: "admin" } },
      { user_id: "user-bob", device_id: VISITOR },
    ],
    getTrack({ user_id: "user-bob", device_id: VISITOR }, second.id),
  ]);
});

test("through a Trace, after a sign-out an event goes under the visitor's device alone, and without a visitor id it is skipped as unidentified", async () => {
  const withVisitor = fakeAmplitude();
  const withoutVisitor = fakeAmplitude();
  const visited = createTrace(withVisitor, { anonymousId: VISITOR });
  const unvisited = createTrace(withoutVisitor);

  visited.start();
  unvisited.start();
  visited.user({ id: "user-ada" });
  unvisited.user({ id: "user-ada" });

  const visitedSignedIn = visited.track("App Opened");
  const unvisitedSignedIn = unvisited.track("App Opened");

  visited.user(null);
  unvisited.user(null);

  const anonymous = visited.track("App Opened");
  const unidentified = unvisited.track("App Opened");

  await expect(anonymous.settled).resolves.toStrictEqual({
    state: "settled",
    outcomes: {
      amplitude: {
        status: "submitted",
        evidence: "sdk-call-returned",
        event: null,
        losses: [],
      },
    },
  });
  await expect(unidentified.settled).resolves.toStrictEqual({
    state: "settled",
    outcomes: { amplitude: { status: "skipped", reason: "unidentified" } },
  });
  expect(withVisitor.calls).toStrictEqual([
    getTrack({ user_id: "user-ada", device_id: VISITOR }, visitedSignedIn.id),
    getTrack({ device_id: VISITOR }, anonymous.id),
  ]);
  expect(withoutVisitor.calls).toStrictEqual([
    getTrack({ user_id: "user-ada" }, unvisitedSignedIn.id),
  ]);
});

test("through a Trace, traits set while signed out go to the visitor's device, and reach the user with the device once the user signs in", async () => {
  const fake = fakeAmplitude();
  const trace = createTrace(fake, { anonymousId: VISITOR });

  trace.start();
  trace.traits({ plan: "pro" });
  trace.user({ id: "user-ada" });

  const receipt = trace.track("App Opened");

  await receipt.settled;

  expect(fake.calls).toStrictEqual([
    ["identify", { $set: { plan: "pro" } }, { device_id: VISITOR }],
    [
      "identify",
      { $set: { plan: "pro" } },
      { user_id: "user-ada", device_id: VISITOR },
    ],
    getTrack({ user_id: "user-ada", device_id: VISITOR }, receipt.id),
  ]);
});

test("through a Trace, a consent-gated destination hands Amplitude nothing until its purpose is granted, and nothing once it is withdrawn", async () => {
  const fake = fakeAmplitude();

  const trace = new Trace({
    events: { "App Opened": event() },
    destinations: {
      amplitude: amplitude({ sdk: fake.sdk, Identify, anonymousId: VISITOR }),
    },
    consent: { amplitude: ["analytics"] },
    now: () => TIMESTAMP,
  });

  trace.start();

  const before = trace.track("App Opened");

  trace.consent.set({ analytics: "granted" });

  const granted = trace.track("App Opened");

  trace.consent.set({ analytics: "denied" });

  const withdrawn = trace.track("App Opened");

  await expect(before.settled).resolves.toStrictEqual({
    state: "dropped",
    reason: "consent",
  });
  await expect(granted.settled).resolves.toStrictEqual({
    state: "settled",
    outcomes: {
      amplitude: {
        status: "submitted",
        evidence: "sdk-call-returned",
        event: null,
        losses: [],
      },
    },
  });
  await expect(withdrawn.settled).resolves.toStrictEqual({
    state: "dropped",
    reason: "consent",
  });
  expect(fake.calls).toStrictEqual([
    getTrack({ device_id: VISITOR }, granted.id),
  ]);
});

test("per-request Traces over one shared SDK never mix their users or visitors, however their calls interleave", async () => {
  const fake = fakeAmplitude();

  const createRequest = (anonymousId: string) => {
    const trace = createTrace(fake, { anonymousId });

    trace.start();

    return trace;
  };

  const ada = createRequest("visitor-a");
  const bob = createRequest("visitor-b");
  const ADA = { user_id: "user-ada", device_id: "visitor-a" };
  const BOB = { user_id: "user-bob", device_id: "visitor-b" };

  const anonymous = ada.track("App Opened");

  bob.user({ id: "user-bob", traits: { plan: "team" } });
  ada.user({ id: "user-ada", traits: { plan: "pro" } });

  const first = bob.track("App Opened");

  ada.group("workspace", { id: "w_ada" });
  bob.group("workspace", { id: "w_bob", traits: { tier: "team" } });

  const second = ada.track("App Opened");

  bob.traits({ role: "admin" });
  ada.user(null);

  const third = ada.track("App Opened");
  const fourth = bob.track("App Opened");

  await Promise.all(
    [anonymous, first, second, third, fourth].map(({ settled }) => settled),
  );

  expect(fake.calls).toStrictEqual([
    getTrack({ device_id: "visitor-a" }, anonymous.id),
    ["identify", { $set: { plan: "team" } }, BOB],
    ["identify", { $set: { plan: "pro" } }, ADA],
    getTrack(BOB, first.id),
    ["setGroup", "workspace", "w_ada", ADA],
    ["setGroup", "workspace", "w_bob", BOB],
    ["groupIdentify", "workspace", "w_bob", { $set: { tier: "team" } }, BOB],
    getTrack(ADA, second.id),
    ["identify", { $set: { role: "admin" } }, BOB],
    getTrack({ device_id: "visitor-a" }, third.id),
    getTrack(BOB, fourth.id),
  ]);
});

test("one adapter shared at module scope by per-request Traces never mixes their users", async () => {
  const fake = fakeAmplitude();
  const adapter = amplitude({ sdk: fake.sdk, Identify });

  const createRequest = () => {
    const trace = new Trace({
      events: { "App Opened": event() },
      destinations: { amplitude: adapter },
      now: () => TIMESTAMP,
    });

    trace.start();

    return trace;
  };

  const carol = createRequest();
  const dave = createRequest();

  carol.user({ id: "user-carol", traits: { plan: "pro" } });
  dave.user({ id: "user-dave", traits: { plan: "team" } });
  dave.group("workspace", { id: "w_dave", traits: { tier: "team" } });

  const first = dave.track("App Opened");
  const second = carol.track("App Opened");

  await Promise.all([first.settled, second.settled]);

  expect(fake.calls).toStrictEqual([
    ["identify", { $set: { plan: "pro" } }, { user_id: "user-carol" }],
    ["identify", { $set: { plan: "team" } }, { user_id: "user-dave" }],
    ["setGroup", "workspace", "w_dave", { user_id: "user-dave" }],
    [
      "groupIdentify",
      "workspace",
      "w_dave",
      { $set: { tier: "team" } },
      { user_id: "user-dave" },
    ],
    getTrack({ user_id: "user-dave" }, first.id),
    getTrack({ user_id: "user-carol" }, second.id),
  ]);
});

test("through a Trace, a flush answers flushed once Amplitude accepted the uploads, and failed once it refused one", async () => {
  const fake = fakeAmplitude();
  const trace = createTrace(fake);

  trace.start();
  trace.user({ id: "user-ada" });
  trace.track("App Opened");

  const accepted = trace.flush({ timeout: 1_000 });

  await nextMacrotask();
  fake.upload();

  expect(await accepted).toEqual({
    drained: true,
    destinations: { amplitude: { status: "flushed" } },
  });

  trace.track("App Opened");

  const refused = trace.flush({ timeout: 1_000 });

  await nextMacrotask();
  fake.upload(500);

  expect(await refused).toEqual({
    drained: true,
    destinations: {
      amplitude: {
        status: "failed",
        error: expect.objectContaining({
          code: "DELIVERY_FAILED",
          message:
            "Amplitude did not accept 1 of this destination's uploads since the last flush.",
        }),
      },
    },
  });
});
