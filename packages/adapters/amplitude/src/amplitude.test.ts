import { Identify } from "@amplitude/analytics-browser";
import { event, Trace, TraceError } from "@priemskiyyy/trace";
import type {
  FlushResult,
  TraceDiagnosticEvent,
  TrackContext,
  TrackedEvent,
} from "@priemskiyyy/trace";
import { afterEach, expect, onTestFinished, test, vi } from "vitest";

import { amplitude } from "src/amplitude";
import { fakeAmplitude } from "src/fakeAmplitude.fixture";
import { identityPlugin } from "src/identityPlugin";

afterEach(() => {
  vi.useRealTimers();
});

const ADA_EVENT_ID = "0b5f6c9e-8f1a-4c2d-9a3b-2f6e1d4c7a88";
const TIMESTAMP = 1_767_225_600_000;
const ANONYMOUS = { generation: 1, user: null, traits: {}, groups: {} };

const NOT_INITIALIZED = new TraceError({
  code: "NOT_INITIALIZED",
  message:
    "Amplitude has not finished initializing with Trace's identity plugin. Await its init().promise, add identityPlugin() with add(), then call trace.start() again.",
});

const PLUGIN_REMOVED = new TraceError({
  code: "NOT_INITIALIZED",
  message:
    "Trace's identity plugin is no longer installed in Amplitude, so the call was not sent. A later init() or remove() takes it out: add it again with add().",
});

const context: TrackContext = {
  signal: new AbortController().signal,
  currentGeneration: () => 1,
  now: () => TIMESTAMP,
};

const events = {
  "Checkout Started": event<{ cart: { id: string }; value: number }>(),
  "Note Added": event<{ note: string }>(),
};

const freeze = <TValue>(value: TValue): TValue => {
  if (typeof value === "object" && value !== null) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }

  return value;
};

const createEvent = (overrides: Partial<TrackedEvent> = {}): TrackedEvent =>
  freeze({
    id: ADA_EVENT_ID,
    name: "Checkout Started",
    properties: { cart: { id: "cart_1" }, value: 49.5 },
    context: { app: { version: "2.4.0" } },
    identity: { generation: 1, user: { id: "ada" }, traits: {}, groups: {} },
    timestamp: TIMESTAMP,
    ...overrides,
  });

const createAdapter = (fake = fakeAmplitude()) => {
  const plugin = identityPlugin();

  fake.sdk.add(plugin);

  return amplitude({ sdk: fake.sdk, Identify, plugin });
};

const open = (fake = fakeAmplitude()) => ({
  fake,
  session: createAdapter(fake).open(),
});

const createTrace = (
  fake = fakeAmplitude(),
  options: { consent?: { product: ["analytics"] } } = {},
) => {
  const trace = new Trace({
    events,
    destinations: { product: createAdapter(fake) },
    now: () => TIMESTAMP,
    ...options,
  });

  onTestFinished(trace.dispose);

  return { fake, trace };
};

const getIdentities = (fake: ReturnType<typeof fakeAmplitude>) =>
  fake.uploaded.map(({ event_type, user_id, device_id }) => ({
    event_type,
    user_id,
    device_id,
  }));

const drain = () =>
  new Promise((resolve) => {
    setImmediate(resolve);
  });

const getThrown = (call: () => unknown) => {
  try {
    call();
  } catch (error) {
    return error;
  }

  return null;
};

const SUBMITTED = {
  product: {
    status: "submitted",
    evidence: "sdk-call-returned",
    event: null,
    losses: [],
  },
};

const NOTHING_CALLED = {
  init: 0,
  shutdown: 0,
  add: [],
  remove: [],
  getDeviceId: 0,
  track: [],
  setUserId: [],
  identify: [],
  setGroup: [],
  groupIdentify: [],
  reset: 0,
  setOptOut: [],
  flush: 0,
};

test("creating the adapter and its plugin calls nothing on Amplitude", () => {
  const fake = fakeAmplitude();

  amplitude({ sdk: fake.sdk, Identify, plugin: identityPlugin() });

  expect(fake.calls).toStrictEqual(NOTHING_CALLED);
});

test("open refuses with NOT_INITIALIZED until Amplitude has set up the identity plugin, and opens once it has", () => {
  const fake = fakeAmplitude();
  const plugin = identityPlugin();
  const adapter = amplitude({ sdk: fake.sdk, Identify, plugin });

  expect(getThrown(adapter.open)).toStrictEqual(NOT_INITIALIZED);

  fake.sdk.add(plugin);

  expect(adapter.open().native).toBe(fake.sdk);
});

test("open refuses with NOT_INITIALIZED while Amplitude holds no device, even with the plugin set up, and opens once it has one", () => {
  const fake = fakeAmplitude();
  const adapter = createAdapter(fake);

  fake.state.deviceId = undefined;

  expect(getThrown(adapter.open)).toStrictEqual(NOT_INITIALIZED);

  fake.state.deviceId = "device-1";

  expect(adapter.open().native).toBe(fake.sdk);
});

test("a plugin added before init is set up by it, so open refuses until init has run", async () => {
  const fake = fakeAmplitude({ initialized: false });
  const adapter = createAdapter(fake);

  expect(getThrown(adapter.open)).toStrictEqual(NOT_INITIALIZED);

  await fake.sdk.init().promise;

  expect(adapter.open().native).toBe(fake.sdk);
});

test("once Amplitude removes the plugin, an event, traits and a group are each refused with NOT_INITIALIZED, and none reaches Amplitude", async () => {
  const fake = fakeAmplitude();
  const plugin = identityPlugin();

  fake.sdk.add(plugin);

  const session = amplitude({ sdk: fake.sdk, Identify, plugin }).open();

  await fake.sdk.remove(plugin.name).promise;

  expect([
    getThrown(() => session.track(createEvent(), context)),
    getThrown(() =>
      session.traits?.(
        freeze({ user: { id: "ada" }, set: { plan: "pro" }, remove: [] }),
      ),
    ),
    getThrown(() =>
      session.group?.(
        freeze({
          user: { id: "ada" },
          group: { type: "workspace", id: "w_1", traits: { tier: "team" } },
        }),
      ),
    ),
  ]).toStrictEqual([PLUGIN_REMOVED, PLUGIN_REMOVED, PLUGIN_REMOVED]);
  expect({
    track: fake.calls.track,
    identify: fake.calls.identify,
    setGroup: fake.calls.setGroup,
    groupIdentify: fake.calls.groupIdentify,
  }).toStrictEqual({
    track: [],
    identify: [],
    setGroup: [],
    groupIdentify: [],
  });
});

test("an event is one track call with its properties over its context, its time, its id as insert_id, and its user and device at the top level and in extra", () => {
  const { fake, session } = open();

  const answer = session.track(createEvent(), context);

  expect(fake.calls.track).toStrictEqual([
    {
      eventInput: "Checkout Started",
      eventProperties: {
        app: { version: "2.4.0" },
        cart: { id: "cart_1" },
        value: 49.5,
      },
      eventOptions: {
        time: TIMESTAMP,
        insert_id: ADA_EVENT_ID,
        user_id: "ada",
        device_id: "device-1",
        extra: {
          "@priemskiyyy/trace-amplitude": {
            user_id: "ada",
            device_id: "device-1",
          },
        },
      },
    },
  ]);
  expect(answer).toStrictEqual({
    status: "submitted",
    evidence: "sdk-call-returned",
    losses: [],
  });
});

test("an event reaches Amplitude under the user it was tracked for and the device Amplitude held, whatever Amplitude holds when it processes the event", async () => {
  const { fake, session } = open();

  session.track(createEvent(), context);
  fake.sdk.reset();
  fake.sdk.setUserId("bob");
  await fake.process();

  expect(getIdentities(fake)).toStrictEqual([
    { event_type: "Checkout Started", user_id: "ada", device_id: "device-1" },
  ]);
});

test("an anonymous event reaches Amplitude with no user, even when a user signs in before Amplitude processes it", async () => {
  const { fake, session } = open();

  session.track(createEvent({ identity: ANONYMOUS }), context);
  session.identify?.({ user: { id: "ada" } });
  await fake.process();

  expect(getIdentities(fake)).toStrictEqual([
    {
      event_type: "Checkout Started",
      user_id: undefined,
      device_id: "device-1",
    },
  ]);
});

test("an event's losses are the adapter's: a shadowed context key, and a string Amplitude will cut", () => {
  const { fake, session } = open();
  const note = "n".repeat(1_025);

  const answer = session.track(
    createEvent({
      properties: { note, plan: "pro" },
      context: { plan: "free" },
    }),
    context,
  );

  expect(fake.calls.track[0]?.eventProperties).toStrictEqual({
    note,
    plan: "pro",
  });
  expect(answer).toStrictEqual({
    status: "submitted",
    evidence: "sdk-call-returned",
    losses: [
      { path: "properties.note", reason: "truncated" },
      { path: "context.plan", reason: "omitted" },
    ],
  });
});

test("identify sets Amplitude's user id and sends no event of its own", () => {
  const { fake, session } = open();

  const answer = session.identify?.({ user: { id: "ada" } });

  expect(answer).toBe(undefined);
  expect(fake.calls.setUserId).toStrictEqual(["ada"]);
  expect(fake.calls.identify).toStrictEqual([]);
  expect(fake.calls.track).toStrictEqual([]);
});

test("traits and groups go through Identify, each call naming the user and device at the top level and in its extra, which the plugin files it under", async () => {
  const { fake, session } = open();

  session.traits?.(
    freeze({ user: { id: "ada" }, set: { plan: "pro" }, remove: ["legacy"] }),
  );
  session.group?.(
    freeze({
      user: { id: "ada" },
      group: { type: "workspace", id: "w_1", traits: { tier: "team" } },
    }),
  );

  const eventOptions = {
    user_id: "ada",
    device_id: "device-1",
    extra: {
      "@priemskiyyy/trace-amplitude": { user_id: "ada", device_id: "device-1" },
    },
  };

  expect(fake.calls.identify).toStrictEqual([
    {
      userProperties: { $unset: { legacy: "-" }, $set: { plan: "pro" } },
      eventOptions,
    },
  ]);
  expect(fake.calls.setGroup).toStrictEqual([
    { groupType: "workspace", groupName: "w_1", eventOptions },
  ]);
  expect(fake.calls.groupIdentify).toStrictEqual([
    {
      groupType: "workspace",
      groupName: "w_1",
      groupProperties: { $set: { tier: "team" } },
      eventOptions,
    },
  ]);

  fake.sdk.reset();
  await fake.process();

  expect(getIdentities(fake)).toStrictEqual([
    { event_type: "$identify", user_id: "ada", device_id: "device-1" },
    { event_type: "$identify", user_id: "ada", device_id: "device-1" },
    { event_type: "$groupidentify", user_id: "ada", device_id: "device-1" },
  ]);
});

test("reset is Amplitude's reset, which leaves no user and starts a new device", () => {
  const { fake, session } = open();

  session.identify?.({ user: { id: "ada" } });

  const answer = session.reset?.();

  expect(answer).toBe(undefined);
  expect(fake.calls.reset).toBe(1);
  expect(fake.state).toStrictEqual({
    initialized: true,
    userId: undefined,
    deviceId: "device-2",
    optOut: false,
    code: 200,
  });
});

test("collection switches Amplitude's opt-out, in either direction right after open", () => {
  const closed = open();
  const granted = open();

  closed.session.collection?.(false);
  granted.session.collection?.(true);
  granted.session.collection?.(false);

  expect(closed.fake.calls.setOptOut).toStrictEqual([true]);
  expect(granted.fake.calls.setOptOut).toStrictEqual([false, true]);
});

test("flush calls Amplitude's flush and then waits for the uploads of the events this session handed over", async () => {
  const { fake, session } = open();
  const flush: { result: FlushResult | null } = { result: null };

  session.track(createEvent(), context);
  Promise.resolve(
    session.flush?.({ timeout: 1_000, signal: new AbortController().signal }),
  ).then((result) => {
    flush.result = result ?? null;
  });
  await drain();

  expect(fake.calls.flush).toBe(1);
  expect(flush.result).toBe(null);

  await fake.process();
  await drain();

  expect(flush.result).toStrictEqual({ status: "flushed" });
});

test("native is the SDK the application injected", () => {
  const { fake, session } = open();

  expect(session.native).toBe(fake.sdk);
});

test("through Trace, a destination started before Amplitude's init fails with NOT_INITIALIZED, and a start after init delivers the event tracked meanwhile", async () => {
  const { fake, trace } = createTrace(fakeAmplitude({ initialized: false }));

  trace.start();

  const receipt = trace.track("Note Added", { note: "during boot" });

  expect(trace.destination("product").status.get()).toStrictEqual({
    state: "failed",
    error: NOT_INITIALIZED,
  });
  expect(fake.calls.track).toStrictEqual([]);

  await fake.sdk.init().promise;
  trace.start();

  expect(await receipt.settled).toStrictEqual({
    state: "settled",
    outcomes: SUBMITTED,
  });
  expect(
    fake.calls.track.map(({ eventProperties }) => eventProperties),
  ).toStrictEqual([{ note: "during boot" }]);
});

test("through Trace, an event tracked before sign-in stays anonymous through a sign-in and a switch made in the same tick", async () => {
  const { fake, trace } = createTrace();

  trace.start();

  const anonymous = trace.track("Note Added", { note: "before sign-in" });

  trace.user({ id: "ada" });

  const ada = trace.track("Note Added", { note: "from ada" });

  trace.user({ id: "bob" });

  const bob = trace.track("Note Added", { note: "from bob" });

  expect(
    await Promise.all([anonymous.settled, ada.settled, bob.settled]),
  ).toStrictEqual([
    { state: "settled", outcomes: SUBMITTED },
    { state: "settled", outcomes: SUBMITTED },
    { state: "settled", outcomes: SUBMITTED },
  ]);

  await fake.process();

  expect(getIdentities(fake)).toStrictEqual([
    { event_type: "Note Added", user_id: undefined, device_id: "device-1" },
    { event_type: "Note Added", user_id: "ada", device_id: "device-1" },
    { event_type: "Note Added", user_id: "bob", device_id: "device-2" },
  ]);
});

test("through Trace, once a later init takes the plugin out, an event fails with NOT_INITIALIZED and a sign-in with traits fails its identity step, so nothing is filed under the wrong user", async () => {
  const { fake, trace } = createTrace();

  trace.start();
  await fake.sdk.init().promise;

  const anonymous = trace.track("Note Added", { note: "before sign-in" });

  trace.user({ id: "ada", traits: { plan: "pro" } });

  const ada = trace.track("Note Added", { note: "from ada" });

  expect(await Promise.all([anonymous.settled, ada.settled])).toStrictEqual([
    {
      state: "settled",
      outcomes: { product: { status: "failed", error: PLUGIN_REMOVED } },
    },
    {
      state: "settled",
      outcomes: { product: { status: "skipped", reason: "identity-failed" } },
    },
  ]);

  await fake.process();

  expect(fake.uploaded).toStrictEqual([]);
});

test("through Trace, the plugin added again after a later init files events as before", async () => {
  const fake = fakeAmplitude();
  const plugin = identityPlugin();

  fake.sdk.add(plugin);

  const trace = new Trace({
    events,
    destinations: { product: amplitude({ sdk: fake.sdk, Identify, plugin }) },
    now: () => TIMESTAMP,
  });

  onTestFinished(trace.dispose);
  trace.start();
  await fake.sdk.init().promise;
  await fake.sdk.add(plugin).promise;

  const receipt = trace.track("Note Added", { note: "before sign-in" });

  trace.user({ id: "ada" });

  expect(await receipt.settled).toStrictEqual({
    state: "settled",
    outcomes: SUBMITTED,
  });

  await fake.process();

  expect(getIdentities(fake)).toStrictEqual([
    { event_type: "Note Added", user_id: undefined, device_id: "device-1" },
  ]);
});

test("through Trace, calls Amplitude still holds when a later init takes the plugin out keep their user and device once it is added again", async () => {
  const fake = fakeAmplitude();
  const plugin = identityPlugin();

  fake.sdk.add(plugin);

  const trace = new Trace({
    events,
    destinations: { product: amplitude({ sdk: fake.sdk, Identify, plugin }) },
    now: () => TIMESTAMP,
  });

  onTestFinished(trace.dispose);
  trace.start();

  const anonymous = trace.track("Note Added", { note: "before sign-in" });

  trace.user({ id: "ada" });

  const ada = trace.track("Note Added", { note: "from ada" });

  expect(await Promise.all([anonymous.settled, ada.settled])).toStrictEqual([
    { state: "settled", outcomes: SUBMITTED },
    { state: "settled", outcomes: SUBMITTED },
  ]);

  await fake.sdk.init().promise;
  fake.sdk.reset();
  fake.sdk.setUserId("bob");
  await fake.sdk.add(plugin).promise;
  await fake.process();

  expect(getIdentities(fake)).toStrictEqual([
    { event_type: "Note Added", user_id: undefined, device_id: "device-1" },
    { event_type: "Note Added", user_id: "ada", device_id: "device-1" },
  ]);
});

test("through Trace, a call Amplitude still holds when the plugin is taken out keeps its user and device when it was made for a user, and an anonymous one is filed under whoever Amplitude holds", async () => {
  const fake = fakeAmplitude();
  const plugin = identityPlugin();

  fake.sdk.add(plugin);

  const trace = new Trace({
    events,
    destinations: { product: amplitude({ sdk: fake.sdk, Identify, plugin }) },
    now: () => TIMESTAMP,
  });

  onTestFinished(trace.dispose);
  trace.start();

  const anonymous = trace.track("Note Added", { note: "before sign-in" });

  trace.user({ id: "ada" });

  const ada = trace.track("Note Added", { note: "from ada" });

  expect(await Promise.all([anonymous.settled, ada.settled])).toStrictEqual([
    { state: "settled", outcomes: SUBMITTED },
    { state: "settled", outcomes: SUBMITTED },
  ]);

  trace.user({ id: "bob" });
  await fake.sdk.remove(plugin.name).promise;
  await fake.process();

  expect(getIdentities(fake)).toStrictEqual([
    { event_type: "Note Added", user_id: "bob", device_id: "device-1" },
    { event_type: "Note Added", user_id: "ada", device_id: "device-1" },
  ]);
  expect(fake.state.deviceId).toBe("device-2");
});

test("through Trace, a sign-out resets Amplitude, so the next event carries the new device and no user", async () => {
  const { fake, trace } = createTrace();

  trace.start();
  trace.user({ id: "ada" });
  await trace.track("Note Added", { note: "signed in" }).settled;
  trace.user(null);
  await trace.track("Note Added", { note: "signed out" }).settled;
  await fake.process();

  expect(fake.calls.reset).toBe(1);
  expect(getIdentities(fake)).toStrictEqual([
    { event_type: "Note Added", user_id: "ada", device_id: "device-1" },
    { event_type: "Note Added", user_id: undefined, device_id: "device-2" },
  ]);
});

test("through Trace, a gated destination opens opted in while its purpose is granted, is opted out when it is withdrawn, and gets nothing meanwhile", async () => {
  const { fake, trace } = createTrace(fakeAmplitude(), {
    consent: { product: ["analytics"] },
  });

  trace.consent.set({ analytics: "granted" });
  trace.start();

  const granted = await trace.track("Note Added", { note: "granted" }).settled;

  trace.consent.set({ analytics: "denied" });

  const denied = await trace.track("Note Added", { note: "denied" }).settled;

  expect(fake.calls.setOptOut).toStrictEqual([false, true]);
  expect(granted).toStrictEqual({ state: "settled", outcomes: SUBMITTED });
  expect(denied).toStrictEqual({ state: "dropped", reason: "consent" });
  expect(
    fake.calls.track.map(({ eventProperties }) => eventProperties),
  ).toStrictEqual([{ note: "granted" }]);
});

test("through Trace, a gated destination whose purpose is still unknown opens opted out", () => {
  const { fake, trace } = createTrace(fakeAmplitude(), {
    consent: { product: ["analytics"] },
  });

  trace.start();

  expect(fake.calls.setOptOut).toStrictEqual([true]);
});

test("through Trace, a trait Amplitude would cut in part is left out whole as an identity step unsupported, and the events keep flowing", async () => {
  const { fake, trace } = createTrace();
  const diagnostics: TraceDiagnosticEvent[] = [];

  onTestFinished(
    trace.diagnostics.events.subscribe((diagnostic) => {
      diagnostics.push(diagnostic);
    }),
  );
  trace.start();
  trace.user({
    id: "ada",
    traits: { plan: "pro", profile: { bio: "b".repeat(1_025), name: "ada" } },
  });

  const receipt = await trace.track("Note Added", { note: "after" }).settled;

  expect(fake.calls.identify).toStrictEqual([
    {
      userProperties: { $set: { plan: "pro" } },
      eventOptions: {
        user_id: "ada",
        device_id: "device-1",
        extra: {
          "@priemskiyyy/trace-amplitude": {
            user_id: "ada",
            device_id: "device-1",
          },
        },
      },
    },
  ]);
  expect(
    diagnostics.flatMap(({ type, context: detail }) => {
      if (!type.startsWith("identity step")) {
        return [];
      }

      return [{ type, detail }];
    }),
  ).toStrictEqual([
    { type: "identity step unsupported", detail: { step: "traits" } },
  ]);
  expect(receipt).toStrictEqual({ state: "settled", outcomes: SUBMITTED });
});

test("through Trace, a string Amplitude will cut goes whole and is a truncated loss on the receipt", async () => {
  const { fake, trace } = createTrace();
  const note = "n".repeat(1_025);

  trace.start();

  const receipt = await trace.track("Note Added", { note }).settled;

  expect(fake.calls.track[0]?.eventProperties).toStrictEqual({ note });
  expect(receipt).toStrictEqual({
    state: "settled",
    outcomes: {
      product: {
        status: "submitted",
        evidence: "sdk-call-returned",
        event: null,
        losses: [{ path: "properties.note", reason: "truncated" }],
      },
    },
  });
});

test("through Trace, a flush answers timeout while an upload is still out, and flushed once it lands", async () => {
  vi.useFakeTimers();

  const { fake, trace } = createTrace();

  trace.start();
  trace.track("Note Added", { note: "pending" });

  const waiting = trace.flush({ timeout: 1_000 });

  await vi.advanceTimersByTimeAsync(1_000);

  expect(await waiting).toEqual({
    drained: false,
    destinations: { product: { status: "timeout" } },
  });

  const landing = trace.flush({ timeout: 1_000 });

  await fake.process();

  expect(await landing).toEqual({
    drained: true,
    destinations: { product: { status: "flushed" } },
  });
});

test("through Trace, the native handle is the injected SDK once the destination is ready, and null before", () => {
  const { fake, trace } = createTrace();

  expect(trace.destination("product").native).toBe(null);

  trace.start();

  expect(trace.destination("product").native).toBe(fake.sdk);
});

test("Trace never initializes or closes Amplitude", async () => {
  const { fake, trace } = createTrace(fakeAmplitude(), {
    consent: { product: ["analytics"] },
  });

  trace.consent.set({ analytics: "granted" });
  trace.start();
  trace.user({ id: "ada", traits: { plan: "pro" } });
  trace.group("workspace", { id: "w_1", traits: { tier: "team" } });
  trace.track("Note Added", { note: "all of it" });
  trace.user(null);
  await fake.process();
  await trace.flush();
  trace.dispose();

  expect(fake.calls.init).toBe(0);
  expect(fake.calls.shutdown).toBe(0);
});
