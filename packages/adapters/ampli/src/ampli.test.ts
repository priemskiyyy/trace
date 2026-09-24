import { Identify } from "@amplitude/analytics-browser";
import { Trace } from "@priemskiyyy/trace";
import type {
  FlushResult,
  TraceDiagnosticEvent,
  TrackContext,
} from "@priemskiyyy/trace";
import { afterEach, expect, test, vi } from "vitest";

import { ampli } from "src/ampli";
import {
  EventNoProperties,
  EventWithAllProperties,
} from "src/ampli-v2-generated";
import type { EventWithAllPropertiesProperties } from "src/ampli-v2-generated";
import { fakeAmpli } from "src/fakeAmpli.fixture";
import { fromAmpli } from "src/fromAmpli";
import { identityPlugin } from "src/identityPlugin";
import { createTrackedEvent } from "src/trackedEvent.fixture";

afterEach(() => {
  vi.useRealTimers();
});

const { id: FIRST_ID, timestamp: TIMESTAMP } = createTrackedEvent();
const SECOND_ID = "1f7c9a2e-5b3d-4e8f-9a1b-2c3d4e5f6a7b";

const CONTEXT: TrackContext = {
  signal: new AbortController().signal,
  currentGeneration: () => 1,
  now: () => TIMESTAMP,
};

const ALL_PROPERTIES = {
  requiredArray: ["one"],
  requiredBoolean: true,
  requiredEnum: "Enum1",
  requiredInteger: 5,
  requiredNumber: 2.2,
  requiredString: "value",
} satisfies EventWithAllPropertiesProperties;

const events = fromAmpli({
  "Event No Properties": EventNoProperties,
  "Event With All Properties": EventWithAllProperties,
});

const NOT_INITIALIZED = expect.objectContaining({
  name: "TraceError",
  code: "NOT_INITIALIZED",
  message:
    "Ampli has not finished loading with Trace's identity plugin. Await ampli.load().promise, add identityPlugin() with ampli.client.add(), then call trace.start() again.",
});

const NO_LONGER_INSTALLED = expect.objectContaining({
  name: "TraceError",
  code: "NOT_INITIALIZED",
  message:
    "Trace's identity plugin is no longer installed on ampli.client, so the call was not sent. A later init() or remove() takes it out: add it again with ampli.client.add().",
});

const createAdapter = (fake: ReturnType<typeof fakeAmpli>) => {
  const plugin = identityPlugin();

  fake.sdk.client.add(plugin);

  return ampli({ sdk: fake.sdk, Identify, plugin });
};

const open = (fake = fakeAmpli()) => ({
  fake,
  session: createAdapter(fake).open(),
});

const createTrace = (
  fake = fakeAmpli(),
  adapter = createAdapter(fake),
  consent?: { product: ["analytics"] },
) => ({
  fake,
  trace: new Trace({
    events,
    destinations: { product: adapter },
    ...(consent === undefined ? {} : { consent }),
    now: () => TIMESTAMP,
  }),
});

const ANONYMOUS = { generation: 1, user: null, traits: {}, groups: {} };

const startFlush = (
  flush: ReturnType<typeof open>["session"]["flush"],
  { timeout = 1_000, signal = new AbortController().signal } = {},
) => {
  const flushing: { result: FlushResult | null; done: Promise<void> } = {
    result: null,
    done: Promise.resolve(flush?.({ timeout, signal })).then((result) => {
      flushing.result = result ?? null;
    }),
  };

  return flushing;
};

const settle = () =>
  new Promise((resolve) => {
    setImmediate(resolve);
  });

const DELIVERY_FAILED = (refused: number) =>
  expect.objectContaining({
    name: "TraceError",
    code: "DELIVERY_FAILED",
    message: `Amplitude did not accept ${refused} of the uploads this flush waited for.`,
  });

test("creating the adapter calls nothing on the Ampli wrapper and leaves the plugin to the application", () => {
  const fake = fakeAmpli({ loaded: false });
  const plugin = identityPlugin();

  ampli({ sdk: fake.sdk, Identify, plugin });

  expect(plugin.isSetUp()).toBe(false);
  expect(fake.calls).toStrictEqual({
    load: 0,
    isLoaded: 0,
    identify: [],
    track: [],
    client: {
      beforeLoad: 0,
      init: 0,
      identify: [],
      add: [],
      reset: 0,
      setOptOut: [],
      flush: 0,
    },
  });
});

test("a wrapper refuses to open with NOT_INITIALIZED until it has loaded, its client knows a device and the identity plugin is set up", async () => {
  const fake = fakeAmpli({ loaded: false });
  const added = identityPlugin();
  const adapter = ampli({ sdk: fake.sdk, Identify, plugin: added });

  const withoutPlugin = ampli({
    sdk: fake.sdk,
    Identify,
    plugin: identityPlugin(),
  });

  expect(() => adapter.open()).toThrow(NOT_INITIALIZED);

  const loading = fake.sdk.load({ environment: "prod" });

  fake.sdk.client.add(added);

  expect(added.isSetUp()).toBe(true);
  expect(() => adapter.open()).toThrow(NOT_INITIALIZED);

  await loading.promise;

  expect(adapter.open().native).toBe(fake.sdk);
  expect(() => withoutPlugin.open()).toThrow(NOT_INITIALIZED);
  expect(fake.calls.client.beforeLoad).toBe(0);
});

test("an event is one ampli.track call with its name, its properties, its time, its id as insert_id, and the user and device it was tracked with, both in its options and in its extra for the plugin", async () => {
  const { fake, session } = open();

  session.track(createTrackedEvent(), CONTEXT);
  fake.state.userId = "bob_2";
  fake.state.deviceId = "device-9";
  await fake.drained();

  expect(fake.calls.track).toStrictEqual([
    {
      event: {
        event_type: "Checkout Started",
        event_properties: { cartId: "cart_1", value: 49.5 },
      },
      options: {
        time: TIMESTAMP,
        insert_id: FIRST_ID,
        user_id: "user_42",
        device_id: "device-1",
        extra: {
          "@priemskiyyy/trace-ampli": {
            user_id: "user_42",
            device_id: "device-1",
          },
        },
      },
    },
  ]);
  expect(fake.processed).toStrictEqual([
    {
      event_type: "Checkout Started",
      user_id: "user_42",
      device_id: "device-1",
    },
  ]);
});

test("an anonymous event reaches Amplitude with no user and the device it was tracked on, whatever user Amplitude holds when it processes it", async () => {
  const { fake, session } = open();

  session.track(createTrackedEvent({ identity: ANONYMOUS }), CONTEXT);
  fake.state.userId = "bob_2";
  await fake.drained();

  expect(fake.processed).toStrictEqual([
    {
      event_type: "Checkout Started",
      user_id: undefined,
      device_id: "device-1",
    },
  ]);
});

test("an event reports what Amplitude cannot carry in the order of the event's shape, its properties before its context", () => {
  const { fake, session } = open();
  const long = "x".repeat(1025);

  const answer = session.track(
    createTrackedEvent({
      properties: { note: long, cartId: "cart_1" },
      context: { cartId: "from-context", app: "web" },
    }),
    CONTEXT,
  );

  expect(fake.calls.track[0]?.event.event_properties).toStrictEqual({
    app: "web",
    note: long,
    cartId: "cart_1",
  });
  expect(answer).toStrictEqual({
    status: "submitted",
    evidence: "sdk-call-returned",
    losses: [
      { path: "properties.note", reason: "truncated" },
      { path: "context.cartId", reason: "omitted" },
    ],
  });
});

test("a user id shorter than Amplitude's default minimum is sent as it is, with no loss, because init can change the minimum", async () => {
  const { fake, session } = open();

  const answer = session.track(
    createTrackedEvent({
      identity: { generation: 1, user: { id: "ada" }, traits: {}, groups: {} },
    }),
    CONTEXT,
  );

  await fake.drained();

  expect(fake.processed).toStrictEqual([
    { event_type: "Checkout Started", user_id: "ada", device_id: "device-1" },
  ]);
  expect(answer).toStrictEqual({
    status: "submitted",
    evidence: "sdk-call-returned",
    losses: [],
  });
});

test("an event is submitted with sdk-call-returned evidence while its upload is still pending", () => {
  const { fake, session } = open();

  const answer = session.track(createTrackedEvent(), CONTEXT);

  expect(fake.uploads.map(({ options }) => options)).toStrictEqual([
    {
      time: TIMESTAMP,
      insert_id: FIRST_ID,
      user_id: "user_42",
      device_id: "device-1",
      extra: {
        "@priemskiyyy/trace-ampli": {
          user_id: "user_42",
          device_id: "device-1",
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

test("an event handed over while Amplitude is opted out is submitted, because the call returned, and the flush reports that Amplitude skipped it", async () => {
  const { fake, session } = open();

  fake.sdk.client.setOptOut(true);

  const answer = session.track(createTrackedEvent(), CONTEXT);
  const flushing = startFlush(session.flush);

  await flushing.done;

  expect(answer).toStrictEqual({
    status: "submitted",
    evidence: "sdk-call-returned",
    losses: [],
  });
  expect(fake.uploads).toStrictEqual([]);
  expect(flushing.result).toStrictEqual({
    status: "failed",
    error: DELIVERY_FAILED(1),
  });
});

test("a wrapper loaded with disabled: true opens and takes events, and the flush reports that nothing was sent", async () => {
  const fake = fakeAmpli({ loaded: false });

  await fake.sdk.load({ environment: "prod", disabled: true }).promise;

  const { session } = open(fake);
  const answer = session.track(createTrackedEvent(), CONTEXT);
  const flushing = startFlush(session.flush);

  await flushing.done;

  expect(answer).toStrictEqual({
    status: "submitted",
    evidence: "sdk-call-returned",
    losses: [],
  });
  expect(fake.uploads).toStrictEqual([]);
  expect(flushing.result).toStrictEqual({
    status: "failed",
    error: DELIVERY_FAILED(1),
  });
});

test("identify names the user through ampli.identify, whose $identify carries that user and device in its options and in its extra for the plugin, without waiting for its upload", async () => {
  const { fake, session } = open();

  const answer = session.identify?.({ user: { id: "user_42" } });

  expect(answer).toBeUndefined();
  expect(fake.calls.identify).toStrictEqual([
    {
      userId: "user_42",
      properties: undefined,
      options: {
        user_id: "user_42",
        device_id: "device-1",
        extra: {
          "@priemskiyyy/trace-ampli": {
            user_id: "user_42",
            device_id: "device-1",
          },
        },
      },
    },
  ]);
  expect(fake.state.userId).toBe("user_42");

  fake.state.deviceId = "device-9";
  await fake.drained();

  expect(fake.processed).toStrictEqual([
    { event_type: "$identify", user_id: "user_42", device_id: "device-1" },
  ]);
});

test.each([
  {
    set: { plan: "pro", seats: 3 },
    remove: [],
    properties: { $set: { plan: "pro", seats: 3 } },
  },
  {
    set: {},
    remove: ["role", "team"],
    properties: { $unset: { role: "-", team: "-" } },
  },
  {
    set: { plan: "pro" },
    remove: ["role"],
    properties: { $set: { plan: "pro" }, $unset: { role: "-" } },
  },
])(
  "traits are one Amplitude Identify sent on the client, carrying the user and device they apply to in its options and in its extra for the plugin: $properties",
  async ({ set, remove, properties }) => {
    const { fake, session } = open();

    const answer = session.traits?.({ user: { id: "user_42" }, set, remove });

    expect(answer).toBeUndefined();
    expect(
      fake.calls.client.identify.map(({ identify, options }) => ({
        properties: identify.getUserProperties(),
        options,
      })),
    ).toStrictEqual([
      {
        properties,
        options: {
          user_id: "user_42",
          device_id: "device-1",
          extra: {
            "@priemskiyyy/trace-ampli": {
              user_id: "user_42",
              device_id: "device-1",
            },
          },
        },
      },
    ]);
    expect(fake.calls.identify).toStrictEqual([]);

    await fake.drained();

    expect(fake.processed).toStrictEqual([
      { event_type: "$identify", user_id: "user_42", device_id: "device-1" },
    ]);
  },
);

test("a null nested in a trait is stripped, a trait holding a part Amplitude refuses is left out whole, the rest is sent, and the update is reported unsupported", () => {
  const { fake, session } = open();

  expect(() =>
    session.traits?.({
      user: { id: "user_42" },
      set: {
        address: { city: "Kyiv", line2: null },
        flags: [true, 1],
        plan: "pro",
      },
      remove: ["role"],
    }),
  ).toThrow(
    expect.objectContaining({
      name: "TraceError",
      code: "UNSUPPORTED",
      message:
        "Amplitude cannot take these trait values, so they were left out: traits.address.line2, traits.flags.",
    }),
  );
  expect(
    fake.calls.client.identify.map(({ identify }) =>
      identify.getUserProperties(),
    ),
  ).toStrictEqual([
    {
      $set: { address: { city: "Kyiv" }, plan: "pro" },
      $unset: { role: "-" },
    },
  ]);
});

test("reset clears the user on the client and starts a new device", () => {
  const { fake, session } = open();

  session.identify?.({ user: { id: "user_42" } });

  const answer = session.reset?.();

  expect(answer).toBeUndefined();
  expect(fake.calls.client.reset).toBe(1);
  expect(fake.state).toStrictEqual({
    loaded: true,
    disabled: false,
    userId: undefined,
    deviceId: "device-2",
    optOut: false,
  });
});

test("collection switches Amplitude's own opt-out both ways, right after open", () => {
  const { fake, session } = open();

  session.collection?.(false);
  session.collection?.(true);

  expect(fake.calls.client.setOptOut).toStrictEqual([true, false]);
  expect(fake.state.optOut).toBe(false);
});

test("the generated wrapper has no group call, so a session offers none", () => {
  const { session } = open();

  expect(Object.keys(session)).toStrictEqual([
    "native",
    "track",
    "identify",
    "traits",
    "reset",
    "collection",
    "flush",
  ]);
});

test("flush calls Amplitude's flush and answers flushed only once every earlier upload was accepted", async () => {
  const { fake, session } = open();

  session.track(createTrackedEvent(), CONTEXT);
  session.track(createTrackedEvent({ id: SECOND_ID }), CONTEXT);

  const flushing = startFlush(session.flush);

  await settle();

  expect(fake.calls.client.flush).toBe(1);
  expect(flushing.result).toBe(null);

  fake.completeUploads({ count: 1 });
  await settle();

  expect(flushing.result).toBe(null);

  fake.completeUploads();
  await flushing.done;

  expect(flushing.result).toStrictEqual({ status: "flushed" });
});

test("flush answers failed with DELIVERY_FAILED when Amplitude answered an upload outside 2xx", async () => {
  const { fake, session } = open();

  session.track(createTrackedEvent(), CONTEXT);
  session.track(createTrackedEvent({ id: SECOND_ID }), CONTEXT);

  const flushing = startFlush(session.flush);

  fake.completeUploads({ code: 200, count: 1 });
  fake.completeUploads({ code: 500 });
  await flushing.done;

  expect(flushing.result).toStrictEqual({
    status: "failed",
    error: DELIVERY_FAILED(1),
  });
});

test("an upload handed over after the flush began does not extend it", async () => {
  const { fake, session } = open();

  session.track(createTrackedEvent(), CONTEXT);

  const flushing = startFlush(session.flush);

  session.track(createTrackedEvent({ id: SECOND_ID }), CONTEXT);
  fake.completeUploads({ count: 1 });
  await flushing.done;

  expect(flushing.result).toStrictEqual({ status: "flushed" });
  expect(fake.uploads.map(({ options }) => options?.insert_id)).toStrictEqual([
    SECOND_ID,
  ]);
});

test("flush keeps no time and heeds no signal of its own, because the core owns the flush's time: it answers once every upload did", async () => {
  vi.useFakeTimers();

  const { fake, session } = open();
  const controller = new AbortController();

  session.track(createTrackedEvent(), CONTEXT);

  const flushing = startFlush(session.flush, {
    timeout: 1_000,
    signal: controller.signal,
  });

  controller.abort();
  await vi.advanceTimersByTimeAsync(60_000);

  expect(flushing.result).toBe(null);

  fake.completeUploads();
  await flushing.done;

  expect(flushing.result).toStrictEqual({ status: "flushed" });
});

test("each open waits only for its own uploads", async () => {
  const fake = fakeAmpli();
  const adapter = createAdapter(fake);
  const first = adapter.open();
  const second = adapter.open();

  first.track(createTrackedEvent(), CONTEXT);

  const flushing = startFlush(second.flush);

  await flushing.done;

  expect(flushing.result).toStrictEqual({ status: "flushed" });
  expect(fake.uploads.map(({ options }) => options?.insert_id)).toStrictEqual([
    FIRST_ID,
  ]);
});

test("the native handle is the generated wrapper, never its Amplitude client", () => {
  const { fake, session } = open();

  expect(session.native).toBe(fake.sdk);
  expect(session.native).not.toBe(fake.sdk.client);
});

test("a start before the wrapper has loaded with its identity plugin fails the destination, and a start after both opens it and delivers the event tracked meanwhile", async () => {
  const fake = fakeAmpli({ loaded: false });
  const plugin = identityPlugin();

  const { trace } = createTrace(
    fake,
    ampli({ sdk: fake.sdk, Identify, plugin }),
  );

  const notInitialized = { state: "failed", error: NOT_INITIALIZED };

  trace.start();

  const receipt = trace.track("Event No Properties");

  expect(trace.destination("product").status.get()).toStrictEqual(
    notInitialized,
  );
  expect(trace.destination("product").native).toBe(null);

  await fake.sdk.load({ environment: "prod" }).promise;
  trace.start();

  expect(trace.destination("product").status.get()).toStrictEqual(
    notInitialized,
  );

  fake.sdk.client.add(plugin);
  trace.start();

  await expect(receipt.settled).resolves.toEqual({
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
  expect(fake.calls.track.map(({ event }) => event.event_type)).toStrictEqual([
    "Event No Properties",
  ]);
  expect(trace.destination("product").native).toBe(fake.sdk);
});

test("once Amplitude takes the identity plugin out, an event fails with NOT_INITIALIZED and never reaches the wrapper", async () => {
  const fake = fakeAmpli();
  const plugin = identityPlugin();

  fake.sdk.client.add(plugin);

  const { trace } = createTrace(
    fake,
    ampli({ sdk: fake.sdk, Identify, plugin }),
  );

  trace.start();
  await plugin.teardown();

  await expect(trace.track("Event No Properties").settled).resolves.toEqual({
    state: "settled",
    outcomes: { product: { status: "failed", error: NO_LONGER_INSTALLED } },
  });
  expect(fake.calls.track).toStrictEqual([]);
});

test("once Amplitude takes the identity plugin out, a sign-in fails and the event behind it is skipped, so no call goes out unpinned", async () => {
  const fake = fakeAmpli();
  const plugin = identityPlugin();

  fake.sdk.client.add(plugin);

  const { trace } = createTrace(
    fake,
    ampli({ sdk: fake.sdk, Identify, plugin }),
  );

  const records: TraceDiagnosticEvent[] = [];

  trace.diagnostics.events.subscribe((record) => {
    records.push(record);
  });
  trace.start();
  await plugin.teardown();
  trace.user({ id: "alice_1", traits: { plan: "pro" } });

  const receipt = trace.track("Event No Properties");

  await expect(receipt.settled).resolves.toEqual({
    state: "settled",
    outcomes: { product: { status: "skipped", reason: "identity-failed" } },
  });
  expect(
    records.flatMap(({ type, event, context }) => {
      if (type !== "identity step failed") {
        return [];
      }

      return [{ event, context }];
    }),
  ).toStrictEqual([
    { event: null, context: { step: "identify", reason: "error" } },
    {
      event: { id: receipt.id },
      context: { step: "identify", reason: "error" },
    },
  ]);
  expect({
    identify: fake.calls.identify,
    traits: fake.calls.client.identify,
    track: fake.calls.track,
  }).toStrictEqual({ identify: [], traits: [], track: [] });
});

test("a declared Ampli event reaches the wrapper with its canonical name, the constants its class injects and the Trace's time", async () => {
  const { fake, trace } = createTrace();

  trace.start();

  const receipt = trace.track("Event With All Properties", {
    ...ALL_PROPERTIES,
  });

  await receipt.settled;

  expect(fake.calls.track).toStrictEqual([
    {
      event: {
        event_type: "Event With All Properties",
        event_properties: {
          ...ALL_PROPERTIES,
          requiredConst: "some-const-value",
        },
      },
      options: {
        time: TIMESTAMP,
        insert_id: receipt.id,
        device_id: "device-1",
        extra: { "@priemskiyyy/trace-ampli": { device_id: "device-1" } },
      },
    },
  ]);
});

test("a signed-in user is identified, with their traits, before the event that needs them", async () => {
  const { fake, trace } = createTrace();

  trace.start();
  trace.user({ id: "user_42", traits: { plan: "pro" } });
  await trace.track("Event No Properties").settled;

  await fake.drained();

  expect(
    fake.calls.client.identify.map(({ identify }) =>
      identify.getUserProperties(),
    ),
  ).toStrictEqual([{ $set: { plan: "pro" } }]);
  expect(fake.processed).toStrictEqual([
    { event_type: "$identify", user_id: "user_42", device_id: "device-1" },
    { event_type: "$identify", user_id: "user_42", device_id: "device-1" },
    {
      event_type: "Event No Properties",
      user_id: "user_42",
      device_id: "device-1",
    },
  ]);
});

test("a user switch resets Amplitude before the next user is identified, and every call stays filed under the user and device it was made for", async () => {
  const { fake, trace } = createTrace();

  trace.start();
  trace.user({ id: "ada_1", traits: { plan: "pro" } });
  await trace.track("Event No Properties").settled;
  trace.user({ id: "bob_2" });
  await trace.track("Event No Properties").settled;
  await fake.drained();

  expect(fake.processed).toStrictEqual([
    { event_type: "$identify", user_id: "ada_1", device_id: "device-1" },
    { event_type: "$identify", user_id: "ada_1", device_id: "device-1" },
    {
      event_type: "Event No Properties",
      user_id: "ada_1",
      device_id: "device-1",
    },
    { event_type: "$identify", user_id: "bob_2", device_id: "device-2" },
    {
      event_type: "Event No Properties",
      user_id: "bob_2",
      device_id: "device-2",
    },
  ]);
  expect(fake.calls.client.reset).toBe(1);
});

test("an anonymous event handed over just before a sign-in stays anonymous, because the plugin files it under no user", async () => {
  const { fake, trace } = createTrace();

  trace.start();
  await trace.track("Event No Properties").settled;
  trace.user({ id: "alice_1" });
  await trace.track("Event No Properties").settled;
  await fake.drained();

  expect(fake.processed).toStrictEqual([
    {
      event_type: "Event No Properties",
      user_id: undefined,
      device_id: "device-1",
    },
    { event_type: "$identify", user_id: "alice_1", device_id: "device-1" },
    {
      event_type: "Event No Properties",
      user_id: "alice_1",
      device_id: "device-1",
    },
  ]);
});

test("an event tracked before a sign-in stays anonymous through a sign-in and a switch made in the same tick, and every receipt is submitted", async () => {
  const { fake, trace } = createTrace();

  trace.start();

  const anonymous = trace.track("Event No Properties");

  trace.user({ id: "alice_1" });

  const alice = trace.track("Event No Properties");

  trace.user({ id: "bob_2" });

  const bob = trace.track("Event No Properties");

  const submitted = {
    state: "settled",
    outcomes: {
      product: {
        status: "submitted",
        evidence: "sdk-call-returned",
        event: null,
        losses: [],
      },
    },
  };

  await expect(
    Promise.all([anonymous.settled, alice.settled, bob.settled]),
  ).resolves.toEqual([submitted, submitted, submitted]);
  await fake.drained();

  expect(fake.processed).toStrictEqual([
    {
      event_type: "Event No Properties",
      user_id: undefined,
      device_id: "device-1",
    },
    { event_type: "$identify", user_id: "alice_1", device_id: "device-1" },
    {
      event_type: "Event No Properties",
      user_id: "alice_1",
      device_id: "device-1",
    },
    { event_type: "$identify", user_id: "bob_2", device_id: "device-2" },
    {
      event_type: "Event No Properties",
      user_id: "bob_2",
      device_id: "device-2",
    },
  ]);
});

test("traits set before a sign-in stay with the anonymous visitor, because the plugin files them under no user", async () => {
  const { fake, trace } = createTrace();

  trace.start();
  trace.traits({ plan: "free" });
  trace.user({ id: "alice_1" });
  await trace.track("Event No Properties").settled;
  await fake.drained();

  expect(
    fake.processed.map(({ event_type, user_id }) => ({ event_type, user_id })),
  ).toStrictEqual([
    { event_type: "$identify", user_id: undefined },
    { event_type: "$identify", user_id: "alice_1" },
    { event_type: "Event No Properties", user_id: "alice_1" },
  ]);
});

test("an identity change right after an event takes effect at once, with nothing to wait for", () => {
  const { fake, trace } = createTrace();

  trace.start();
  trace.track("Event No Properties");
  trace.user({ id: "alice_1" });

  expect(fake.state.userId).toBe("alice_1");
  expect(fake.calls.identify.map(({ userId }) => userId)).toStrictEqual([
    "alice_1",
  ]);
});

test("a sign-out resets Amplitude, so the next event is anonymous on a new device", async () => {
  const { fake, trace } = createTrace();

  trace.start();
  trace.user({ id: "ada_1" });
  await trace.track("Event No Properties").settled;
  trace.user(null);
  await trace.track("Event No Properties").settled;
  await fake.drained();

  expect(
    fake.processed.flatMap(({ event_type, user_id, device_id }) => {
      if (event_type !== "Event No Properties") {
        return [];
      }

      return [{ user_id, device_id }];
    }),
  ).toStrictEqual([
    { user_id: "ada_1", device_id: "device-1" },
    { user_id: undefined, device_id: "device-2" },
  ]);
});

test("a trait Amplitude cannot take is reported as an unsupported identity step, and the event still goes", async () => {
  const { fake, trace } = createTrace();
  const records: TraceDiagnosticEvent[] = [];

  trace.diagnostics.events.subscribe((record) => {
    records.push(record);
  });
  trace.start();
  trace.user({ id: "user_42", traits: { address: { line2: null } } });

  const receipt = trace.track("Event No Properties");
  const settled = await receipt.settled;

  expect(
    records.flatMap(({ type, destination, context }) => {
      if (type !== "identity step unsupported") {
        return [];
      }

      return [{ destination, context }];
    }),
  ).toStrictEqual([
    { destination: { name: "product" }, context: { step: "traits" } },
  ]);
  expect(settled).toEqual({
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
  expect(fake.calls.track.map(({ options }) => options)).toStrictEqual([
    {
      time: TIMESTAMP,
      insert_id: receipt.id,
      user_id: "user_42",
      device_id: "device-1",
      extra: {
        "@priemskiyyy/trace-ampli": {
          user_id: "user_42",
          device_id: "device-1",
        },
      },
    },
  ]);
});

test("a gated destination is opted out at start while its purposes are unknown, receives nothing, and is opted in once they are granted", async () => {
  const fake = fakeAmpli();

  const { trace } = createTrace(fake, createAdapter(fake), {
    product: ["analytics"],
  });

  trace.start();

  const refused = trace.track("Event No Properties");

  expect(fake.calls.client.setOptOut).toStrictEqual([true]);
  await expect(refused.settled).resolves.toStrictEqual({
    state: "dropped",
    reason: "consent",
  });

  trace.consent.set({ analytics: "granted" });
  await trace.track("Event No Properties").settled;
  trace.consent.set({ analytics: "denied" });

  expect(fake.calls.client.setOptOut).toStrictEqual([true, false, true]);
  expect(fake.calls.track.map(({ event }) => event.event_type)).toStrictEqual([
    "Event No Properties",
  ]);
});

test("a gated destination that opens with its purposes granted is opted in at once", () => {
  const fake = fakeAmpli();

  const { trace } = createTrace(fake, createAdapter(fake), {
    product: ["analytics"],
  });

  trace.consent.set({ analytics: "granted" });
  trace.start();

  expect(fake.calls.client.setOptOut).toStrictEqual([false]);
});

test("an identity step does not wait for its own upload, nor a receipt for its event's, so nothing waits for the core's timeout", async () => {
  vi.useFakeTimers();

  const { fake, trace } = createTrace();

  trace.start();
  trace.user({ id: "user_42", traits: { plan: "pro" } });

  const settled = await trace.track("Event No Properties").settled;

  expect(settled).toEqual({
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
  expect(fake.uploads.map(({ event }) => event.event_type)).toStrictEqual([
    "$identify",
    "$identify",
    "Event No Properties",
  ]);
});

test("trace.flush waits for the uploads Amplitude still has in flight, and answers timeout when they outlast it", async () => {
  vi.useFakeTimers();

  const { trace } = createTrace();

  trace.start();
  await trace.track("Event No Properties").settled;

  const flushing = trace.flush({ timeout: 1_000 });

  await vi.advanceTimersByTimeAsync(1_000);

  await expect(flushing).resolves.toEqual({
    drained: false,
    destinations: { product: { status: "timeout" } },
  });
});

test("trace.flush answers failed with DELIVERY_FAILED once Amplitude refused an upload it waited for", async () => {
  const { fake, trace } = createTrace();

  trace.start();
  await trace.track("Event No Properties").settled;

  const flushing = trace.flush({ timeout: 1_000 });

  await settle();

  expect(fake.calls.client.flush).toBe(1);

  fake.completeUploads({ code: 413 });

  await expect(flushing).resolves.toEqual({
    drained: true,
    destinations: {
      product: { status: "failed", error: DELIVERY_FAILED(1) },
    },
  });
});

test("Trace never loads the wrapper or initializes its client: across a whole session the only load is the application's", async () => {
  const fake = fakeAmpli({ loaded: false });

  await fake.sdk.load({ environment: "prod" }).promise;

  const { trace } = createTrace(fake, createAdapter(fake), {
    product: ["analytics"],
  });

  trace.consent.set({ analytics: "granted" });
  trace.start();
  trace.user({ id: "user_42", traits: { plan: "pro", role: "admin" } });
  trace.traits({ role: null });
  await trace.track("Event No Properties").settled;
  trace.user(null);

  const flushing = trace.flush({ timeout: 1_000 });

  fake.completeUploads();
  await flushing;
  trace.consent.set({ analytics: "denied" });
  trace.dispose();

  expect(fake.calls.load).toBe(1);
  expect(fake.calls.client.init).toBe(1);
});
