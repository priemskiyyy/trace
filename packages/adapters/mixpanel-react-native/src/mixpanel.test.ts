import { event, Trace, TraceError } from "@priemskiyyy/trace";
import type { TraceDiagnosticEvent, TrackContext } from "@priemskiyyy/trace";
import { expect, onTestFinished, test } from "vitest";

import { fakeMixpanel } from "src/fakeMixpanel.fixture";
import { mixpanel } from "src/mixpanel";
import { createTrackedEvent, TRACKED_EVENT } from "src/trackedEvent.fixture";

const { id: EVENT_ID, timestamp: NOW } = TRACKED_EVENT;
const DAY = 24 * 60 * 60 * 1000;

const EVENTS = {
  "Checkout Started": event<Record<string, unknown>>(),
};

const OWNED_GROUP_TYPE = {
  name: "TraceError",
  code: "UNSUPPORTED",
  message:
    "Mixpanel owns this name, so it cannot be a group type: joining or leaving would change Mixpanel's own property on every later event.",
};

const createContext = (now = NOW): TrackContext => ({
  signal: new AbortController().signal,
  currentGeneration: () => 0,
  now: () => now,
});

const openSession = (fake = fakeMixpanel()) => ({
  fake,
  session: mixpanel({ sdk: fake.sdk }).open(),
});

const createTrace = (
  fake: ReturnType<typeof fakeMixpanel>,
  {
    gated = false,
    now = () => NOW,
  }: { gated?: boolean; now?: () => number } = {},
) => {
  const trace = new Trace({
    events: EVENTS,
    destinations: { product: mixpanel({ sdk: fake.sdk }) },
    consent: gated ? { product: ["analytics"] } : {},
    now,
  });

  onTestFinished(trace.dispose);

  return trace;
};

const watchIdentitySteps = (trace: ReturnType<typeof createTrace>) => {
  const steps: { type: string; context: unknown }[] = [];

  onTestFinished(
    trace.diagnostics.events.subscribe(({ type, context }) => {
      if (type.startsWith("identity step")) {
        steps.push({ type, context });
      }
    }),
  );

  return steps;
};

const watchReads = () => {
  const reads: PropertyKey[] = [];

  const watch = <TTarget extends object>(target: TTarget) =>
    new Proxy(target, {
      get: (object, key, receiver) => {
        reads.push(key);

        return Reflect.get(object, key, receiver);
      },
    });

  return { reads, watch };
};

const getProgress = (answer: unknown) =>
  Promise.race([answer, Promise.resolve("pending")]);

const getThrown = (task: () => unknown) => {
  try {
    task();
  } catch (error) {
    return error;
  }

  return null;
};

const getDistinctIds = (fake: ReturnType<typeof fakeMixpanel>) =>
  fake.events.map(({ properties }) => properties["distinct_id"]);

test("creating the adapter reads and calls nothing on Mixpanel", () => {
  const fake = fakeMixpanel();
  const { reads, watch } = watchReads();

  expect(mixpanel({ sdk: watch(fake.sdk) }).name).toBe("mixpanel-react-native");
  expect(reads).toEqual([]);
  expect(fake.calls).toEqual([]);
});

test("open reads and calls nothing, because mixpanel-react-native gives no sign that it was initialized", () => {
  const fake = fakeMixpanel();
  const { reads, watch } = watchReads();

  mixpanel({ sdk: watch(fake.sdk) }).open();

  expect(reads).toEqual([]);
  expect(fake.calls).toEqual([]);
});

test("the native handle is the injected Mixpanel", () => {
  const { fake, session } = openSession();

  expect(session.native).toBe(fake.sdk);
});

test("an event is one track call with its properties over its context, its time and its id, and the losses of that mapping", () => {
  const { fake, session } = openSession();

  const tracked = createTrackedEvent({
    properties: { cart: { id: "c_1" }, note: "x".repeat(300), token: "t" },
    context: { app: { version: "2.4.0" }, note: "from context" },
  });

  expect(session.track(tracked, createContext())).toEqual({
    status: "submitted",
    evidence: "sdk-call-returned",
    losses: [
      { path: "properties.note", reason: "truncated" },
      { path: "properties.token", reason: "omitted" },
      { path: "context.note", reason: "omitted" },
    ],
  });
  expect(fake.calls).toEqual([
    {
      method: "track",
      args: [
        "Checkout Started",
        {
          time: NOW,
          $insert_id: EVENT_ID,
          cart: { id: "c_1" },
          note: "x".repeat(300),
          app: { version: "2.4.0" },
        },
      ],
    },
  ]);
  expect(fake.events).toEqual([
    {
      event: "Checkout Started",
      properties: {
        distinct_id: "$device:device-1",
        time: NOW,
        $insert_id: EVENT_ID,
        cart: { id: "c_1" },
        note: "x".repeat(300),
        app: { version: "2.4.0" },
      },
    },
  ]);
});

test("the five-day window runs on the Trace's clock: an event older than five days is dropped as provider-filtered, with its time unsupported, and never reaches Mixpanel", () => {
  const clock = Date.UTC(2030, 0, 10);
  const { fake, session } = openSession();
  const oldest = createTrackedEvent({ timestamp: clock - 5 * DAY });
  const tooOld = createTrackedEvent({ timestamp: clock - 5 * DAY - 1 });

  expect(session.track(oldest, createContext(clock))).toEqual({
    status: "submitted",
    evidence: "sdk-call-returned",
    losses: [],
  });
  expect(session.track(tooOld, createContext(clock))).toEqual({
    status: "dropped",
    reason: "provider-filtered",
    losses: [{ path: "timestamp", reason: "unsupported" }],
  });
  expect(fake.calls).toEqual([
    {
      method: "track",
      args: [
        "Checkout Started",
        { time: clock - 5 * DAY, $insert_id: EVENT_ID },
      ],
    },
  ]);
});

test("a time ahead of the Trace's clock is sent as it is, with no loss, since Mixpanel judges the future on its own clock at ingestion", () => {
  const { fake, session } = openSession();
  const ahead = createTrackedEvent({ timestamp: NOW + 1 });

  expect(session.track(ahead, createContext())).toEqual({
    status: "submitted",
    evidence: "sdk-call-returned",
    losses: [],
  });
  expect(fake.calls).toEqual([
    {
      method: "track",
      args: ["Checkout Started", { time: NOW + 1, $insert_id: EVENT_ID }],
    },
  ]);
});

test("an event Mixpanel would receive as 1,000,000 bytes of JSON or more is dropped as provider-filtered without reaching it, and one byte less is sent", () => {
  const { fake, session } = openSession();

  const under = createTrackedEvent({
    properties: { note: "x".repeat(999_873) },
  });

  const over = createTrackedEvent({
    properties: { note: "x".repeat(999_874) },
  });

  expect(session.track(under, createContext())).toEqual({
    status: "submitted",
    evidence: "sdk-call-returned",
    losses: [{ path: "properties.note", reason: "truncated" }],
  });
  expect(session.track(over, createContext())).toEqual({
    status: "dropped",
    reason: "provider-filtered",
    losses: [
      { path: "properties.note", reason: "truncated" },
      { path: "properties", reason: "invalid" },
    ],
  });
  expect(fake.calls.map(({ method }) => method)).toEqual(["track"]);
});

test("a blank event name, which mixpanel-react-native refuses by throwing, throws out of track, and Trace answers it as failed", () => {
  const { fake, session } = openSession();

  expect(
    getThrown(() =>
      session.track(createTrackedEvent({ name: "   " }), createContext()),
    ),
  ).toEqual(new Error("eventName is not a valid string"));
  expect(fake.events).toEqual([]);
});

test("an event an opted-out Mixpanel drops is still submitted, because track answers nothing and proves only that the call returned", async () => {
  const fake = fakeMixpanel();

  await fake.sdk.init(true);

  const { session } = openSession(fake);

  expect(session.track(createTrackedEvent(), createContext())).toEqual({
    status: "submitted",
    evidence: "sdk-call-returned",
    losses: [],
  });
  expect(fake.events).toEqual([]);
});

test("identify switches Mixpanel's user and answers the SDK's promise, so Trace waits until the user is switched", async () => {
  const { fake, session } = openSession(fakeMixpanel({ hold: true }));
  const identified = session.identify?.({ user: { id: "ada" } });

  expect(fake.calls).toEqual([{ method: "identify", args: ["ada"] }]);
  expect(await getProgress(identified)).toBe("pending");

  fake.held[0]?.();

  await expect(identified).resolves.toBeUndefined();
  expect(fake.state.distinctId).toBe("ada");
});

test("an id Mixpanel refuses rejects identify with the SDK's error", async () => {
  const { fake, session } = openSession();

  await expect(session.identify?.({ user: { id: "  " } })).rejects.toEqual(
    new Error("distinctId is not a valid string"),
  );
  expect(fake.state.distinctId).toBe("$device:device-1");
});

test("a user id over 255 characters, which Mixpanel would cut, fails identify with DELIVERY_FAILED before any call, so two users sharing the part it keeps never merge", () => {
  const { fake, session } = openSession();

  expect(
    getThrown(() => session.identify?.({ user: { id: "u".repeat(256) } })),
  ).toStrictEqual(
    new TraceError({
      code: "DELIVERY_FAILED",
      message:
        "Mixpanel keeps the first 255 characters of a distinct id, so this user would share an identity with any id that starts the same.",
    }),
  );
  expect(fake.calls).toEqual([]);
});

test("traits set the profile and unset each removed name on its own, since mixpanel-react-native's unset takes one name", () => {
  const { fake, session } = openSession();

  session.traits?.({
    user: { id: "ada" },
    set: { plan: "pro", seats: 3 },
    remove: ["role", "legacy"],
  });

  expect(fake.calls).toEqual([
    { method: "people.set", args: [{ plan: "pro", seats: 3 }] },
    { method: "people.unset", args: ["role"] },
    { method: "people.unset", args: ["legacy"] },
  ]);
});

test("a traits update sends only what changed: no set without values and no unset without removals", () => {
  const { fake, session } = openSession();
  const ada = { id: "ada" };

  session.traits?.({ user: ada, set: {}, remove: ["role"] });
  session.traits?.({ user: ada, set: { plan: "pro" }, remove: [] });

  expect(fake.calls).toEqual([
    { method: "people.unset", args: ["role"] },
    { method: "people.set", args: [{ plan: "pro" }] },
  ]);
});

test("a trait Mixpanel would cut or could not keep is left out, the rest of the update is applied, and the step throws UNSUPPORTED", () => {
  const { fake, session } = openSession();

  const refusal = getThrown(() =>
    session.traits?.({
      user: { id: "ada" },
      set: {
        plan: "pro",
        bio: "x".repeat(300),
        deep: { a: { b: { c: { d: 1 } } } },
      },
      remove: ["role"],
    }),
  );

  expect(refusal).toBeInstanceOf(TraceError);
  expect(refusal).toMatchObject({
    code: "UNSUPPORTED",
    message:
      "Mixpanel cannot keep every profile property in this update; the others were set.",
  });
  expect(fake.calls).toEqual([
    { method: "people.set", args: [{ plan: "pro" }] },
    { method: "people.unset", args: ["role"] },
  ]);
});

test("a blank or empty trait name is left out before mixpanel-react-native's set or unset can take it, the rest is applied, and the step throws UNSUPPORTED", () => {
  const { fake, session } = openSession();

  const refusal = getThrown(() =>
    session.traits?.({
      user: { id: "ada" },
      set: { plan: "pro", "": "x" },
      remove: ["role", " "],
    }),
  );

  expect(refusal).toBeInstanceOf(TraceError);
  expect(refusal).toMatchObject({
    code: "UNSUPPORTED",
    message:
      "Mixpanel cannot keep every profile property in this update; the others were set.",
  });
  expect(fake.calls).toEqual([
    { method: "people.set", args: [{ plan: "pro" }] },
    { method: "people.unset", args: ["role"] },
  ]);
});

test("a group sets its membership through setGroup, which registers it as a super property and sets it on the profile", () => {
  const { fake, session } = openSession();

  session.group?.({
    user: null,
    group: { type: "workspace", id: "w_1", traits: {} },
  });
  session.track(createTrackedEvent(), createContext());

  expect(fake.calls).toEqual([
    { method: "setGroup", args: ["workspace", "w_1"] },
    {
      method: "track",
      args: ["Checkout Started", { time: NOW, $insert_id: EVENT_ID }],
    },
  ]);
  expect(fake.state.profile).toEqual({ workspace: ["w_1"] });
  expect(fake.events.at(-1)?.properties["workspace"]).toEqual(["w_1"]);
});

test.each([{ plan: "team" }, { legacy: null }])(
  "a group's own traits, %j, are refused as UNSUPPORTED once the membership is set, because getGroup answers the first group the SDK created for every later one",
  (traits) => {
    const { fake, session } = openSession();

    const refusal = getThrown(() =>
      session.group?.({
        user: null,
        group: { type: "workspace", id: "w_1", traits },
      }),
    );

    expect(refusal).toBeInstanceOf(TraceError);
    expect(refusal).toMatchObject({
      code: "UNSUPPORTED",
      message:
        "mixpanel-react-native cannot set a group's own properties: its getGroup answers the first group it created for every later one.",
    });
    expect(fake.calls).toEqual([
      { method: "setGroup", args: ["workspace", "w_1"] },
    ]);
  },
);

test("a group type that is a name Mixpanel owns is refused before any call, joining or leaving, so it cannot rewrite Mixpanel's identity", () => {
  const { fake, session } = openSession();
  const ada = { id: "ada" };

  const refusals = [
    getThrown(() =>
      session.group?.({
        user: ada,
        group: { type: "distinct_id", id: "w_1", traits: {} },
      }),
    ),
    getThrown(() =>
      session.group?.({
        user: ada,
        group: { type: "distinct_id", id: null, traits: {} },
      }),
    ),
    getThrown(() =>
      session.group?.({
        user: ada,
        group: { type: "$device_id", id: "w_1", traits: {} },
      }),
    ),
    getThrown(() =>
      session.group?.({
        user: ada,
        group: { type: "bucket", id: "b_1", traits: {} },
      }),
    ),
  ];

  expect(refusals).toEqual([
    expect.objectContaining(OWNED_GROUP_TYPE),
    expect.objectContaining(OWNED_GROUP_TYPE),
    expect.objectContaining(OWNED_GROUP_TYPE),
    expect.objectContaining(OWNED_GROUP_TYPE),
  ]);
  expect(fake.calls).toEqual([]);
  expect(fake.state.superProperties).toEqual({});
});

test("a group type over 255 characters is refused before any call, joining or leaving, and one of 255 is kept", () => {
  const { fake, session } = openSession();
  const long = "t".repeat(256);

  const refused = {
    name: "TraceError",
    code: "UNSUPPORTED",
    message:
      "Mixpanel would cut this group's type past 255 characters, so the membership was left out.",
  };

  expect(
    getThrown(() =>
      session.group?.({
        user: null,
        group: { type: long, id: "w_1", traits: {} },
      }),
    ),
  ).toMatchObject(refused);
  expect(
    getThrown(() =>
      session.group?.({
        user: null,
        group: { type: long, id: null, traits: {} },
      }),
    ),
  ).toMatchObject(refused);
  expect(fake.calls).toEqual([]);

  session.group?.({
    user: null,
    group: { type: "t".repeat(255), id: "w_1", traits: {} },
  });

  expect(fake.calls).toEqual([
    { method: "setGroup", args: ["t".repeat(255), "w_1"] },
  ]);
});

test("a membership whose group id Mixpanel would cut sends no group request, leaves the type as a super property and on the profile, and the step throws UNSUPPORTED", () => {
  const { fake, session } = openSession();
  const id = "w".repeat(256);

  session.group?.({
    user: null,
    group: { type: "workspace", id: "w_1", traits: {} },
  });

  const refusal = getThrown(() =>
    session.group?.({
      user: null,
      group: { type: "workspace", id, traits: {} },
    }),
  );

  expect(refusal).toBeInstanceOf(TraceError);
  expect(refusal).toMatchObject({
    code: "UNSUPPORTED",
    message:
      "Mixpanel would cut this group's id past 255 characters, so the membership was left out and any earlier group of this type was left.",
  });
  expect(fake.calls).toEqual([
    { method: "setGroup", args: ["workspace", "w_1"] },
    { method: "unregisterSuperProperty", args: ["workspace"] },
    { method: "people.unset", args: ["workspace"] },
  ]);
  expect(fake.state.superProperties).toEqual({});
  expect(fake.state.profile).toEqual({});
});

test("leaving a group unregisters its super property and unsets it on the profile, never through removeGroup, which needs the id being left", () => {
  const { fake, session } = openSession();

  session.group?.({
    user: null,
    group: { type: "workspace", id: "w_1", traits: {} },
  });
  session.group?.({
    user: null,
    group: { type: "workspace", id: null, traits: {} },
  });

  expect(fake.calls).toEqual([
    { method: "setGroup", args: ["workspace", "w_1"] },
    { method: "unregisterSuperProperty", args: ["workspace"] },
    { method: "people.unset", args: ["workspace"] },
  ]);
  expect(fake.state.superProperties).toEqual({});
  expect(fake.state.profile).toEqual({});
});

test("reset forgets the user and answers nothing to wait on, because mixpanel-react-native does not return its promise", async () => {
  const { fake, session } = openSession();

  await session.identify?.({ user: { id: "ada" } });

  expect(session.reset?.()).toBeUndefined();
  expect(fake.calls).toEqual([
    { method: "identify", args: ["ada"] },
    { method: "reset", args: [] },
  ]);
  expect(fake.state.distinctId).toBe("$device:device-2");
});

test("the session has no collection, since mixpanel-react-native's only opt-out deletes the profile, no flush, since its flush proves nothing, and no dispose", () => {
  const { session } = openSession();

  expect(session.collection).toBeUndefined();
  expect(session.flush).toBeUndefined();
  expect(session.dispose).toBeUndefined();
});

test("Trace never initializes, opts in or out, or flushes Mixpanel, whatever it asks of the session", async () => {
  const { fake, session } = openSession();
  const ada = { id: "ada" };

  session.track(createTrackedEvent(), createContext());
  await session.identify?.({ user: ada });
  session.traits?.({ user: ada, set: { plan: "pro" }, remove: ["role"] });
  session.group?.({
    user: ada,
    group: { type: "workspace", id: "w_1", traits: {} },
  });
  session.group?.({
    user: ada,
    group: { type: "workspace", id: null, traits: {} },
  });
  session.reset?.();

  expect(fake.calls.map(({ method }) => method)).toEqual([
    "track",
    "identify",
    "people.set",
    "people.unset",
    "setGroup",
    "unregisterSuperProperty",
    "people.unset",
    "reset",
  ]);
});

test("through a Trace, a user switch resets Mixpanel before the next user is identified, so each event carries its own user", async () => {
  const fake = fakeMixpanel();
  const trace = createTrace(fake);

  trace.start();
  trace.user({ id: "ada" });

  const first = trace.track("Checkout Started", {});

  await first.settled;
  trace.user({ id: "bob" });

  const second = trace.track("Checkout Started", {});

  await second.settled;

  expect(fake.calls).toEqual([
    { method: "identify", args: ["ada"] },
    {
      method: "track",
      args: ["Checkout Started", { time: NOW, $insert_id: first.id }],
    },
    { method: "reset", args: [] },
    { method: "identify", args: ["bob"] },
    {
      method: "track",
      args: ["Checkout Started", { time: NOW, $insert_id: second.id }],
    },
  ]);
  expect(getDistinctIds(fake)).toEqual(["ada", "bob"]);
});

test("through a Trace, an event waits until Mixpanel's identify has settled", async () => {
  const fake = fakeMixpanel({ hold: true });
  const trace = createTrace(fake);

  trace.start();
  trace.user({ id: "ada" });

  const receipt = trace.track("Checkout Started", {});

  expect(fake.calls).toEqual([{ method: "identify", args: ["ada"] }]);

  fake.held[0]?.();

  expect(await receipt.settled).toEqual({
    state: "settled",
    outcomes: {
      product: {
        status: "submitted",
        evidence: "sdk-call-returned",
        event: null,
        losses: [],
      },
    },
  });
  expect(getDistinctIds(fake)).toEqual(["ada"]);
});

test("through a Trace, traits set while anonymous reach Mixpanel before the sign-in identifies the user", () => {
  const fake = fakeMixpanel();
  const trace = createTrace(fake);

  trace.traits({ plan: "pro" });
  trace.start();
  trace.user({ id: "ada" });

  expect(fake.calls).toEqual([
    { method: "people.set", args: [{ plan: "pro" }] },
    { method: "identify", args: ["ada"] },
  ]);
});

test("through a Trace, a blank or empty trait name, set and then removed, is an unsupported identity step each time, and the user's events are submitted under their id", async () => {
  const fake = fakeMixpanel();
  const trace = createTrace(fake);
  const steps = watchIdentitySteps(trace);

  trace.start();
  trace.user({ id: "ada", traits: { "": "x", " ": "y", plan: "pro" } });
  trace.traits({ "": null, " ": null });

  const first = trace.track("Checkout Started", {});
  const second = trace.track("Checkout Started", {});

  expect(await first.settled).toEqual({
    state: "settled",
    outcomes: {
      product: {
        status: "submitted",
        evidence: "sdk-call-returned",
        event: null,
        losses: [],
      },
    },
  });
  expect(await second.settled).toEqual({
    state: "settled",
    outcomes: {
      product: {
        status: "submitted",
        evidence: "sdk-call-returned",
        event: null,
        losses: [],
      },
    },
  });
  expect(steps).toEqual([
    { type: "identity step unsupported", context: { step: "traits" } },
    { type: "identity step unsupported", context: { step: "traits" } },
  ]);
  expect(fake.calls).toEqual([
    { method: "identify", args: ["ada"] },
    { method: "people.set", args: [{ plan: "pro" }] },
    {
      method: "track",
      args: ["Checkout Started", { time: NOW, $insert_id: first.id }],
    },
    {
      method: "track",
      args: ["Checkout Started", { time: NOW, $insert_id: second.id }],
    },
  ]);
  expect(getDistinctIds(fake)).toEqual(["ada", "ada"]);
});

test("through a Trace, signing out resets Mixpanel, so the next event is anonymous", async () => {
  const fake = fakeMixpanel();
  const trace = createTrace(fake);

  trace.start();
  trace.user({ id: "ada" });
  await trace.track("Checkout Started", {}).settled;
  trace.user(null);
  await trace.track("Checkout Started", {}).settled;

  expect(fake.calls.map(({ method }) => method)).toEqual([
    "identify",
    "track",
    "reset",
    "track",
  ]);
  expect(getDistinctIds(fake)).toEqual(["ada", "$device:device-2"]);
});

test("through a Trace, joining a group sets the membership, the group's traits are an unsupported step, and leaving unregisters the membership", async () => {
  const fake = fakeMixpanel();
  const trace = createTrace(fake);
  const steps = watchIdentitySteps(trace);

  trace.start();
  trace.user({ id: "ada" });
  trace.group("workspace", { id: "w_1", traits: { plan: "team" } });

  const member = trace.track("Checkout Started", {});

  await member.settled;
  trace.group("workspace", null);

  const left = trace.track("Checkout Started", {});

  await left.settled;

  expect(fake.calls).toEqual([
    { method: "identify", args: ["ada"] },
    { method: "setGroup", args: ["workspace", "w_1"] },
    {
      method: "track",
      args: ["Checkout Started", { time: NOW, $insert_id: member.id }],
    },
    { method: "unregisterSuperProperty", args: ["workspace"] },
    { method: "people.unset", args: ["workspace"] },
    {
      method: "track",
      args: ["Checkout Started", { time: NOW, $insert_id: left.id }],
    },
  ]);
  expect(steps).toEqual([
    { type: "identity step unsupported", context: { step: "group" } },
  ]);
  expect(fake.events.map(({ properties }) => properties["workspace"])).toEqual([
    ["w_1"],
    undefined,
  ]);
});

test("through a Trace, a group type Mixpanel owns is reported as an unsupported identity step, and the user's events keep their distinct id", async () => {
  const fake = fakeMixpanel();
  const records: TraceDiagnosticEvent[] = [];
  const trace = createTrace(fake);

  onTestFinished(
    trace.diagnostics.events.subscribe((record) => {
      records.push(record);
    }),
  );
  trace.start();
  trace.user({ id: "ada" });
  trace.group("distinct_id", { id: "w_1" });

  const receipt = trace.track("Checkout Started", {});

  await receipt.settled;

  expect(records).toContainEqual({
    source: "identity",
    type: "identity step unsupported",
    destination: { name: "product" },
    event: { id: receipt.id },
    timestamp: NOW,
    context: { step: "group" },
  });
  expect(fake.calls).toEqual([
    { method: "identify", args: ["ada"] },
    {
      method: "track",
      args: ["Checkout Started", { time: NOW, $insert_id: receipt.id }],
    },
  ]);
  expect(getDistinctIds(fake)).toEqual(["ada"]);
});

test("through a Trace, a gated destination is sent nothing while its purpose is unknown, and Mixpanel's own opt-out is never touched", async () => {
  const fake = fakeMixpanel();
  const trace = createTrace(fake, { gated: true });

  trace.start();

  const unknown = await trace.track("Checkout Started", {}).settled;

  trace.consent.set({ analytics: "granted" });

  const granted = trace.track("Checkout Started", {});

  await granted.settled;
  trace.consent.set({ analytics: "denied" });

  const denied = await trace.track("Checkout Started", {}).settled;

  expect(unknown).toEqual({ state: "dropped", reason: "consent" });
  expect(denied).toEqual({ state: "dropped", reason: "consent" });
  expect(fake.calls).toEqual([
    {
      method: "track",
      args: ["Checkout Started", { time: NOW, $insert_id: granted.id }],
    },
  ]);
});

test("through a Trace, the five-day window runs on the Trace's own clock, not the wall clock", async () => {
  const clock = Date.UTC(2030, 0, 10);
  const fake = fakeMixpanel();
  const trace = createTrace(fake, { now: () => clock });

  trace.start();

  const tooOld = trace.track(
    "Checkout Started",
    {},
    { timestamp: clock - 5 * DAY - 1 },
  );

  const recent = trace.track(
    "Checkout Started",
    {},
    { timestamp: clock - 5 * DAY },
  );

  expect(await tooOld.settled).toEqual({
    state: "settled",
    outcomes: {
      product: {
        status: "dropped",
        reason: "provider-filtered",
        losses: [{ path: "timestamp", reason: "unsupported" }],
      },
    },
  });
  expect(await recent.settled).toEqual({
    state: "settled",
    outcomes: {
      product: {
        status: "submitted",
        evidence: "sdk-call-returned",
        event: null,
        losses: [],
      },
    },
  });
});

test("through a Trace, a receipt combines the sanitizer's losses with Mixpanel's, each once", async () => {
  const fake = fakeMixpanel();
  const trace = createTrace(fake);

  trace.start();

  const receipt = trace.track("Checkout Started", {
    password: "hunter2",
    distinct_id: "grace",
    note: "x".repeat(300),
  });

  expect(await receipt.settled).toEqual({
    state: "settled",
    outcomes: {
      product: {
        status: "submitted",
        evidence: "sdk-call-returned",
        event: null,
        losses: [
          { path: "properties.password", reason: "redacted" },
          { path: "properties.distinct_id", reason: "omitted" },
          { path: "properties.note", reason: "truncated" },
        ],
      },
    },
  });
});

test("through a Trace, the native handle is the injected Mixpanel once the destination is ready, and flush reports unsupported", async () => {
  const fake = fakeMixpanel();
  const trace = createTrace(fake);

  expect(trace.destination("product").native).toBeNull();

  trace.start();

  expect(trace.destination("product").native).toBe(fake.sdk);
  expect(await trace.flush()).toEqual({
    drained: true,
    destinations: { product: { status: "unsupported" } },
  });
  expect(fake.calls).toEqual([]);
});
