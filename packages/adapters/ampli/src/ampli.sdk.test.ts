// @vitest-environment jsdom
import * as amplitude from "@amplitude/analytics-browser";
import { Trace } from "@priemskiyyy/trace";
import type { TraceDiagnosticEvent } from "@priemskiyyy/trace";
import { afterEach, expect, onTestFinished, test, vi } from "vitest";

import { ampli } from "src/ampli";
import {
  Ampli,
  EventNoProperties,
  EventWithAllProperties,
} from "src/ampli-v2-generated";
import type { EventWithAllPropertiesProperties } from "src/ampli-v2-generated";
import { fromAmpli } from "src/fromAmpli";
import { identityPlugin } from "src/identityPlugin";
import type { IdentityPlugin } from "src/types/IdentityPlugin";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const TIMESTAMP = 1_767_225_600_000;

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

const answer = (code: number) =>
  new Response(JSON.stringify({ code }), { status: code });

const settle = () =>
  new Promise((resolve) => {
    setImmediate(resolve);
  });

const CONFIGURATION = {
  autocapture: false,
  fetchRemoteConfig: false,
  identityStorage: "none",
  flushQueueSize: 1,
  logLevel: amplitude.Types.LogLevel.None,
  serverUrl: "https://amplitude.example.test/2/httpapi",
} satisfies amplitude.Types.BrowserOptions;

const startLoading = (
  fetch: (url: string, init: RequestInit) => Promise<Response>,
  configuration: amplitude.Types.BrowserOptions = {},
  own: amplitude.Types.Plugin[] = [],
) => {
  const wrapper = new Ampli();

  vi.stubGlobal("fetch", fetch);

  const loading = wrapper.load({
    client: {
      apiKey: "test-api-key",
      configuration: { ...CONFIGURATION, ...configuration },
    },
  }).promise;

  for (const plugin of own) {
    wrapper.client.add(plugin);
  }

  return { wrapper, loading };
};

const capture = (wrapper: Ampli) => {
  const captured: amplitude.Types.Event[] = [];
  let awaited: { count: number; resolve: () => void } | null = null;

  wrapper.client.add({
    name: "capture",
    type: "destination",
    execute: async (event) => {
      captured.push(event);

      if (awaited !== null && captured.length >= awaited.count) {
        awaited.resolve();
        awaited = null;
      }

      return { event, code: 200, message: "captured" };
    },
  });

  const capturedAt = (count: number) =>
    new Promise<void>((resolve) => {
      if (captured.length >= count) {
        resolve();

        return;
      }

      awaited = { count, resolve };
    });

  return { captured, capturedAt };
};

const load = async (
  fetch: (url: string, init: RequestInit) => Promise<Response>,
  configuration: amplitude.Types.BrowserOptions = {},
  own: amplitude.Types.Plugin[] = [],
) => {
  const { wrapper, loading } = startLoading(fetch, configuration, own);

  await loading;

  const plugin = identityPlugin();

  wrapper.client.add(plugin);

  return { wrapper, plugin, ...capture(wrapper) };
};

const NO_LONGER_INSTALLED = expect.objectContaining({
  name: "TraceError",
  code: "NOT_INITIALIZED",
  message:
    "Trace's identity plugin is no longer installed on ampli.client, so the call was not sent. A later init() or remove() takes it out: add it again with ampli.client.add().",
});

const SUBMITTED = {
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

const createTrace = (
  wrapper: Ampli,
  plugin: IdentityPlugin,
  consent?: { product: ["analytics"] },
) =>
  new Trace({
    events,
    destinations: {
      product: ampli({ sdk: wrapper, Identify: amplitude.Identify, plugin }),
    },
    ...(consent === undefined ? {} : { consent }),
    now: () => TIMESTAMP,
  });

const slow = (
  type: "before" | "enrichment" | undefined,
): amplitude.Types.Plugin => ({
  name: `slow ${type ?? "untyped"}`,
  ...(type === undefined ? {} : { type }),
  execute: async (event: amplitude.Types.Event) => {
    await new Promise((resolve) => {
      setTimeout(resolve, 5);
    });

    return event;
  },
});

test("an event reaches Amplitude with its canonical name, its constants, the Trace's time and its id as insert_id, under the user Trace identified", async () => {
  const { wrapper, plugin, captured } = await load(async () => answer(200));
  const trace = createTrace(wrapper, plugin);

  trace.start();
  trace.user({ id: "user_42", traits: { plan: "pro" } });

  const receipt = trace.track("Event With All Properties", {
    ...ALL_PROPERTIES,
  });

  await receipt.settled;

  await expect(trace.flush({ timeout: 2_000 })).resolves.toEqual({
    drained: true,
    destinations: { product: { status: "flushed" } },
  });
  expect(
    captured.map(
      ({ event_type, user_id, user_properties, event_properties }) => ({
        event_type,
        user_id,
        user_properties,
        event_properties,
      }),
    ),
  ).toStrictEqual([
    {
      event_type: "$identify",
      user_id: "user_42",
      user_properties: {},
      event_properties: undefined,
    },
    {
      event_type: "$identify",
      user_id: "user_42",
      user_properties: { $set: { plan: "pro" } },
      event_properties: undefined,
    },
    {
      event_type: "Event With All Properties",
      user_id: "user_42",
      user_properties: undefined,
      event_properties: {
        ...ALL_PROPERTIES,
        requiredConst: "some-const-value",
      },
    },
  ]);
  expect(captured[2]?.time).toBe(TIMESTAMP);
  expect(captured[2]?.insert_id).toBe(receipt.id);
});

test("a user switch resets Amplitude to a new device, and every call stays filed under the user and device it was made for", async () => {
  const { wrapper, plugin, captured } = await load(async () => answer(200));
  const trace = createTrace(wrapper, plugin);

  trace.start();
  trace.user({ id: "ada_1", traits: { plan: "pro" } });
  await trace.track("Event No Properties").settled;

  const adaDevice = wrapper.client.getDeviceId();

  trace.user({ id: "bob_2" });
  await trace.track("Event No Properties").settled;

  const bobDevice = wrapper.client.getDeviceId();

  await trace.flush({ timeout: 2_000 });

  expect(
    captured.map(({ event_type, user_id, device_id }) => ({
      event_type,
      user_id,
      device_id,
    })),
  ).toStrictEqual([
    { event_type: "$identify", user_id: "ada_1", device_id: adaDevice },
    { event_type: "$identify", user_id: "ada_1", device_id: adaDevice },
    {
      event_type: "Event No Properties",
      user_id: "ada_1",
      device_id: adaDevice,
    },
    { event_type: "$identify", user_id: "bob_2", device_id: bobDevice },
    {
      event_type: "Event No Properties",
      user_id: "bob_2",
      device_id: bobDevice,
    },
  ]);
  expect(bobDevice).not.toBe(adaDevice);
});

test.each([undefined, "before", "enrichment"] satisfies (
  "before" | "enrichment" | undefined
)[])(
  "through Trace, an event tracked before a sign-in stays anonymous through a sign-in and a switch made in the same tick, behind a slow application plugin of type %s",
  async (type) => {
    const { wrapper, plugin, captured, capturedAt } = await load(
      async () => answer(200),
      {},
      [slow(type)],
    );

    const trace = createTrace(wrapper, plugin);
    const firstDevice = wrapper.client.getDeviceId();

    trace.start();

    const anonymous = trace.track("Event No Properties");

    trace.user({ id: "alice_1" });

    const alice = trace.track("Event No Properties");

    trace.user({ id: "bob_2" });

    const bob = trace.track("Event No Properties");
    const nextDevice = wrapper.client.getDeviceId();

    await expect(
      Promise.all([anonymous.settled, alice.settled, bob.settled]),
    ).resolves.toEqual([SUBMITTED, SUBMITTED, SUBMITTED]);
    await capturedAt(5);

    expect(
      captured.map(({ event_type, user_id, device_id }) => ({
        event_type,
        user_id,
        device_id,
      })),
    ).toStrictEqual([
      {
        event_type: "Event No Properties",
        user_id: undefined,
        device_id: firstDevice,
      },
      { event_type: "$identify", user_id: "alice_1", device_id: firstDevice },
      {
        event_type: "Event No Properties",
        user_id: "alice_1",
        device_id: firstDevice,
      },
      { event_type: "$identify", user_id: "bob_2", device_id: nextDevice },
      {
        event_type: "Event No Properties",
        user_id: "bob_2",
        device_id: nextDevice,
      },
    ]);
    expect(nextDevice).not.toBe(firstDevice);
    await trace.flush({ timeout: 2_000 });
  },
);

test("through Trace, an identity change right after events is applied at once, with nothing to wait for", async () => {
  const { wrapper, plugin } = await load(async () => answer(200));
  const trace = createTrace(wrapper, plugin);

  trace.start();
  trace.track("Event No Properties");
  trace.track("Event No Properties");
  trace.user({ id: "ada_1" });

  expect(wrapper.client.getUserId()).toBe("ada_1");
  await trace.flush({ timeout: 2_000 });
});

test("a Trace event keeps the user and device it was tracked with, while an event the application sends itself passes through untouched", async () => {
  const { wrapper, plugin, captured, capturedAt } = await load(async () =>
    answer(200),
  );

  const trace = createTrace(wrapper, plugin);

  trace.start();
  trace.user({ id: "ada_1" });
  await trace.track("Event No Properties").settled;
  await capturedAt(2);

  const adaDevice = wrapper.client.getDeviceId();

  trace.track("Event No Properties");
  trace.destination("product").native?.eventNoProperties();
  trace.user({ id: "bob_2" });

  const bobDevice = wrapper.client.getDeviceId();

  await capturedAt(5);

  expect(
    captured.slice(2, 4).map(({ event_type, user_id, device_id }) => ({
      event_type,
      user_id,
      device_id,
    })),
  ).toStrictEqual([
    {
      event_type: "Event No Properties",
      user_id: "ada_1",
      device_id: adaDevice,
    },
    {
      event_type: "Event No Properties",
      user_id: "bob_2",
      device_id: bobDevice,
    },
  ]);
  expect(bobDevice).not.toBe(adaDevice);
  await trace.flush({ timeout: 2_000 });
});

test("open on the real SDK refuses with NOT_INITIALIZED until the identity plugin is added, and opens once it is", async () => {
  const { wrapper, loading } = startLoading(async () => answer(200));
  const plugin = identityPlugin();
  const adapter = ampli({ sdk: wrapper, Identify: amplitude.Identify, plugin });

  await loading;

  expect(() => adapter.open()).toThrow(
    expect.objectContaining({ name: "TraceError", code: "NOT_INITIALIZED" }),
  );

  await wrapper.client.add(plugin).promise;

  expect(adapter.open().native).toBe(wrapper);
});

test("the real SDK keeps one identity plugin per name, so a second one added to it is never set up and its destination does not open", async () => {
  const { wrapper, plugin } = await load(async () => answer(200));
  const second = identityPlugin();

  await wrapper.client.add(second).promise;

  expect(plugin.isSetUp()).toBe(true);
  expect(second.isSetUp()).toBe(false);
  expect(() =>
    ampli({
      sdk: wrapper,
      Identify: amplitude.Identify,
      plugin: second,
    }).open(),
  ).toThrow(
    expect.objectContaining({ name: "TraceError", code: "NOT_INITIALIZED" }),
  );
});

test.each([
  {
    way: "remove()",
    takeOut: (wrapper: Ampli, plugin: IdentityPlugin) =>
      wrapper.client.remove(plugin.name).promise,
  },
  {
    way: "a new init",
    takeOut: (wrapper: Ampli) =>
      wrapper.client.init("test-api-key", undefined, CONFIGURATION).promise,
  },
])(
  "once $way takes the plugin out of Amplitude, an anonymous event before a sign-in fails and so does the sign-in, so nothing lands under the user, and once the plugin is added again every call is filed as it was made",
  async ({ takeOut }) => {
    const { wrapper, loading } = startLoading(async () => answer(200));

    await loading;

    const plugin = identityPlugin();

    await wrapper.client.add(plugin).promise;

    const trace = createTrace(wrapper, plugin);

    trace.start();
    await takeOut(wrapper, plugin);

    const { captured, capturedAt } = capture(wrapper);
    const anonymous = trace.track("Event No Properties");

    trace.user({ id: "alice_1" });

    const alice = trace.track("Event No Properties");

    await expect(
      Promise.all([anonymous.settled, alice.settled]),
    ).resolves.toEqual([
      {
        state: "settled",
        outcomes: {
          product: { status: "failed", error: NO_LONGER_INSTALLED },
        },
      },
      {
        state: "settled",
        outcomes: {
          product: { status: "skipped", reason: "identity-failed" },
        },
      },
    ]);
    expect(plugin.isSetUp()).toBe(false);

    await wrapper.client.add(plugin).promise;
    await trace.track("Event No Properties").settled;
    await capturedAt(2);

    expect(
      captured.map(({ event_type, user_id }) => ({ event_type, user_id })),
    ).toStrictEqual([
      { event_type: "$identify", user_id: "alice_1" },
      { event_type: "Event No Properties", user_id: "alice_1" },
    ]);
    await trace.flush({ timeout: 2_000 });
  },
);

const readUploads = () => {
  const uploaded: {
    event_type: unknown;
    user_id: unknown;
    device_id: unknown;
  }[] = [];

  const fetch = async (_url: string, init: RequestInit) => {
    const { events }: { events: Record<string, unknown>[] } = JSON.parse(
      String(init.body),
    );

    for (const event of events) {
      uploaded.push({
        event_type: event["event_type"],
        user_id: event["user_id"],
        device_id: event["device_id"],
      });
    }

    return answer(200);
  };

  return { uploaded, fetch };
};

test.each([
  {
    way: "remove()",
    takeOut: (wrapper: Ampli, plugin: IdentityPlugin) =>
      wrapper.client.remove(plugin.name).promise,
  },
  {
    way: "a new init",
    takeOut: (wrapper: Ampli) =>
      wrapper.client.init("test-api-key", "carol_3", CONFIGURATION).promise,
  },
])(
  "an identified call Amplitude still holds when $way takes the plugin out in the same tick as a switch keeps its user and device, which ride at the top level of its options too",
  async ({ takeOut }) => {
    const { uploaded, fetch } = readUploads();
    const { wrapper, loading } = startLoading(fetch);

    await loading;

    const plugin = identityPlugin();

    await wrapper.client.add(plugin).promise;

    const trace = createTrace(wrapper, plugin);

    trace.start();
    trace.user({ id: "ada_1" });
    await trace.track("Event No Properties").settled;

    const adaDevice = wrapper.client.getDeviceId();

    trace.user({ id: "bob_2" });
    await trace.track("Event No Properties").settled;

    const bobDevice = wrapper.client.getDeviceId();

    await takeOut(wrapper, plugin);
    await wrapper.client.flush().promise;

    expect(uploaded).toStrictEqual([
      { event_type: "$identify", user_id: "ada_1", device_id: adaDevice },
      {
        event_type: "Event No Properties",
        user_id: "ada_1",
        device_id: adaDevice,
      },
      { event_type: "$identify", user_id: "bob_2", device_id: bobDevice },
      {
        event_type: "Event No Properties",
        user_id: "bob_2",
        device_id: bobDevice,
      },
    ]);
    expect(bobDevice).not.toBe(adaDevice);
  },
);

test("an anonymous call Amplitude still holds when remove() takes the plugin out keeps its device and is filed under the user Amplitude fills in, here the next one", async () => {
  const { uploaded, fetch } = readUploads();
  const { wrapper, plugin } = await load(fetch);
  const trace = createTrace(wrapper, plugin);
  const device = wrapper.client.getDeviceId();

  trace.start();
  await trace.track("Event No Properties").settled;
  trace.user({ id: "ada_1" });
  await wrapper.client.remove(plugin.name).promise;
  await wrapper.client.flush().promise;

  expect(uploaded).toStrictEqual([
    { event_type: "Event No Properties", user_id: "ada_1", device_id: device },
    { event_type: "$identify", user_id: "ada_1", device_id: device },
  ]);
});

test("the pin rides in each call's extra, which Amplitude hands to its plugins and strips before upload", async () => {
  const uploaded: Record<string, unknown>[] = [];

  const { wrapper, plugin, captured, capturedAt } = await load(
    async (_url, init) => {
      const { events }: { events: Record<string, unknown>[] } = JSON.parse(
        String(init.body),
      );

      uploaded.push(...events);

      return answer(200);
    },
  );

  const trace = createTrace(wrapper, plugin);
  const device = wrapper.client.getDeviceId();

  trace.start();
  trace.track("Event No Properties");
  trace.user({ id: "alice_1" });
  await trace.track("Event No Properties").settled;
  await capturedAt(3);
  await trace.flush({ timeout: 2_000 });

  expect(
    captured.map(({ event_type, extra }) => ({ event_type, extra })),
  ).toStrictEqual([
    {
      event_type: "Event No Properties",
      extra: { "@priemskiyyy/trace-ampli": { device_id: device } },
    },
    {
      event_type: "$identify",
      extra: {
        "@priemskiyyy/trace-ampli": { user_id: "alice_1", device_id: device },
      },
    },
    {
      event_type: "Event No Properties",
      extra: {
        "@priemskiyyy/trace-ampli": { user_id: "alice_1", device_id: device },
      },
    },
  ]);
  expect(
    uploaded.map((event) => ({
      event_type: event["event_type"],
      user_id: event["user_id"],
      device_id: event["device_id"],
      hasExtra: Object.hasOwn(event, "extra"),
    })),
  ).toStrictEqual([
    {
      event_type: "Event No Properties",
      user_id: undefined,
      device_id: device,
      hasExtra: false,
    },
    {
      event_type: "$identify",
      user_id: "alice_1",
      device_id: device,
      hasExtra: false,
    },
    {
      event_type: "Event No Properties",
      user_id: "alice_1",
      device_id: device,
      hasExtra: false,
    },
  ]);
});

test("calls Amplitude still holds when a later init takes the plugin out keep their pins, so once the plugin is added back they are filed as they were made, not under the user the new init holds", async () => {
  const gate: { open: () => void } = { open: () => {} };

  const opened = new Promise<void>((resolve) => {
    gate.open = resolve;
  });

  const holding: { count: number } = { count: 0 };

  const { wrapper, loading } = startLoading(async () => answer(200), {}, [
    {
      name: "hold the first call",
      type: "before",
      execute: async (event: amplitude.Types.Event) => {
        holding.count += 1;

        if (holding.count === 1) {
          await opened;
        }

        return event;
      },
    },
  ]);

  await loading;

  const plugin = identityPlugin();

  await wrapper.client.add(plugin).promise;

  const trace = createTrace(wrapper, plugin);

  trace.start();
  trace.track("Event No Properties");
  trace.track("Event No Properties");
  trace.user({ id: "alice_1" });
  await settle();
  await wrapper.client.init("test-api-key", "carol_3", CONFIGURATION).promise;

  expect(plugin.isSetUp()).toBe(false);

  await wrapper.client.add(plugin).promise;

  const { captured, capturedAt } = capture(wrapper);

  gate.open();
  await capturedAt(3);

  expect(
    captured.map(({ event_type, user_id }) => ({ event_type, user_id })),
  ).toStrictEqual([
    { event_type: "Event No Properties", user_id: undefined },
    { event_type: "Event No Properties", user_id: undefined },
    { event_type: "$identify", user_id: "alice_1" },
  ]);
  expect(wrapper.client.getUserId()).toBe("carol_3");
});

test("an application plugin that throws drops only the call it threw on, and the calls queued behind it keep their pins until Amplitude's next flush sends them", async () => {
  const thrown = new Error("the application's plugin threw");
  const rejections: unknown[] = [];

  // Amplitude's timeline leaves a plugin's rejection unhandled, so the test catches it.
  const rejected = new Promise<void>((resolve) => {
    const handleRejection = (reason: unknown) => {
      rejections.push(reason);
      resolve();
    };

    process.on("unhandledRejection", handleRejection);
    onTestFinished(() => {
      process.off("unhandledRejection", handleRejection);
    });
  });

  const throwing: { count: number } = { count: 0 };

  const { wrapper, plugin, captured } = await load(
    async () => answer(200),
    {},
    [
      {
        name: "throw once",
        type: "before",
        execute: async (event: amplitude.Types.Event) => {
          throwing.count += 1;

          if (throwing.count === 1) {
            throw thrown;
          }

          return event;
        },
      },
    ],
  );

  const trace = createTrace(wrapper, plugin);

  trace.start();
  trace.track("Event No Properties");
  trace.track("Event No Properties");
  trace.user({ id: "alice_1" });
  await trace.track("Event No Properties").settled;
  await rejected;
  await settle();

  expect({ captured: captured.length, rejections }).toStrictEqual({
    captured: 0,
    rejections: [thrown],
  });

  await wrapper.client.flush().promise;

  expect(
    captured.map(({ event_type, user_id }) => ({ event_type, user_id })),
  ).toStrictEqual([
    { event_type: "Event No Properties", user_id: undefined },
    { event_type: "$identify", user_id: "alice_1" },
    { event_type: "Event No Properties", user_id: "alice_1" },
  ]);
});

test("an anonymous event behind six calls the application sent through native still lands under no user", async () => {
  const { wrapper, plugin, captured, capturedAt } = await load(async () =>
    answer(200),
  );

  const trace = createTrace(wrapper, plugin);

  trace.start();

  const native = trace.destination("product").native;

  for (let sent = 0; sent < 6; sent += 1) {
    native?.eventNoProperties();
  }

  trace.track("Event No Properties");
  trace.user({ id: "alice_1" });
  trace.user({ id: "bob_2" });
  await trace.track("Event No Properties").settled;
  await capturedAt(10);

  expect(
    captured
      .slice(6)
      .map(({ event_type, user_id }) => ({ event_type, user_id })),
  ).toStrictEqual([
    { event_type: "Event No Properties", user_id: undefined },
    { event_type: "$identify", user_id: "alice_1" },
    { event_type: "$identify", user_id: "bob_2" },
    { event_type: "Event No Properties", user_id: "bob_2" },
  ]);
  await trace.flush({ timeout: 2_000 });
});

test("an anonymous event that starts a new session lands under no user, while the session events Amplitude queues itself ahead of it are Amplitude's to fill", async () => {
  const { wrapper, plugin, captured, capturedAt } = await load(
    async () => answer(200),
    {
      autocapture: {
        attribution: false,
        fileDownloads: false,
        formInteractions: false,
        pageViews: false,
        sessions: true,
        elementInteractions: false,
        frustrationInteractions: false,
        networkTracking: false,
        webVitals: false,
        performanceTracking: false,
        pageUrlEnrichment: false,
      },
    },
  );

  const trace = createTrace(wrapper, plugin);

  vi.useFakeTimers({ toFake: ["Date"], now: Date.now() + 31 * 60 * 1000 });
  trace.start();
  trace.track("Event No Properties");
  trace.user({ id: "alice_1" });
  trace.user({ id: "bob_2" });
  await trace.track("Event No Properties").settled;
  await capturedAt(7);

  expect(
    captured.map(({ event_type, user_id }) => ({ event_type, user_id })),
  ).toStrictEqual([
    { event_type: "session_start", user_id: "bob_2" },
    { event_type: "session_end", user_id: undefined },
    { event_type: "session_start", user_id: "bob_2" },
    { event_type: "Event No Properties", user_id: undefined },
    { event_type: "$identify", user_id: "alice_1" },
    { event_type: "$identify", user_id: "bob_2" },
    { event_type: "Event No Properties", user_id: "bob_2" },
  ]);
  await trace.flush({ timeout: 2_000 });
});

test("a start before Amplitude's init has finished fails, and after the next start a sign-out made meanwhile sends none of the previous user's calls and leaves the next visitor a new device", async () => {
  const { wrapper, loading } = startLoading(async () => answer(200));
  const plugin = identityPlugin();
  const trace = createTrace(wrapper, plugin);

  trace.start();

  expect(trace.destination("product").status.get()).toStrictEqual({
    state: "failed",
    error: expect.objectContaining({
      name: "TraceError",
      code: "NOT_INITIALIZED",
    }),
  });

  trace.user({ id: "ada_1" });

  const ada = trace.track("Event No Properties");

  trace.user(null);

  const anonymous = trace.track("Event No Properties");

  await loading;
  wrapper.client.add(plugin);

  const { captured } = capture(wrapper);
  const initDevice = wrapper.client.getDeviceId();

  trace.start();

  await expect(ada.settled).resolves.toEqual({
    state: "settled",
    outcomes: { product: { status: "dropped", reason: "identity-changed" } },
  });
  await anonymous.settled;

  const nextDevice = wrapper.client.getDeviceId();

  await trace.flush({ timeout: 2_000 });

  expect(
    captured.map(({ event_type, user_id, device_id }) => ({
      event_type,
      user_id,
      device_id,
    })),
  ).toStrictEqual([
    {
      event_type: "Event No Properties",
      user_id: undefined,
      device_id: nextDevice,
    },
  ]);
  expect(nextDevice).not.toBe(initDevice);
});

test("a null nested in a trait is stripped, a trait holding text Amplitude would cut is left out whole, the rest reaches Amplitude, and the step is reported unsupported", async () => {
  const { wrapper, plugin, captured } = await load(async () => answer(200));
  const trace = createTrace(wrapper, plugin);
  const records: TraceDiagnosticEvent[] = [];

  trace.diagnostics.events.subscribe((record) => {
    records.push(record);
  });
  trace.start();
  trace.user({
    id: "user_42",
    traits: {
      address: { city: "Kyiv", line2: null },
      profile: { name: "ada", note: "x".repeat(1025) },
    },
  });
  await trace.track("Event No Properties").settled;
  await trace.flush({ timeout: 2_000 });

  expect(captured[1]?.user_properties).toStrictEqual({
    $set: { address: { city: "Kyiv" } },
  });
  expect(
    records.flatMap(({ type, context }) => {
      if (type !== "identity step unsupported") {
        return [];
      }

      return [context];
    }),
  ).toStrictEqual([{ step: "traits" }]);
});

test("an upload Amplitude refuses makes the flush failed with DELIVERY_FAILED", async () => {
  const { wrapper, plugin } = await load(async () => answer(400));
  const trace = createTrace(wrapper, plugin);

  trace.start();
  await trace.track("Event No Properties").settled;

  await expect(trace.flush({ timeout: 2_000 })).resolves.toEqual({
    drained: true,
    destinations: {
      product: {
        status: "failed",
        error: expect.objectContaining({
          name: "TraceError",
          code: "DELIVERY_FAILED",
          message:
            "Amplitude did not accept 1 of this destination's uploads since the last flush.",
        }),
      },
    },
  });
});

test("the flush waits for an upload still in flight, which Amplitude's own flush does not", async () => {
  let release = () => {};

  let started = () => {};

  const inFlight = new Promise<void>((resolve) => {
    started = resolve;
  });

  const held = new Promise<void>((resolve) => {
    release = resolve;
  });

  const { wrapper, plugin } = await load(async () => {
    started();
    await held;

    return answer(200);
  });

  const trace = createTrace(wrapper, plugin);
  const answers: unknown[] = [];

  trace.start();
  await trace.track("Event No Properties").settled;
  await inFlight;

  const flushing = trace.flush({ timeout: 2_000 }).then((result) => {
    answers.push(result);
  });

  await settle();
  await settle();

  expect(answers).toStrictEqual([]);

  release();
  await flushing;

  expect(answers).toEqual([
    { drained: true, destinations: { product: { status: "flushed" } } },
  ]);
});

test("consent switches Amplitude's own opt-out, so Amplitude collects nothing while the destination is closed", async () => {
  const { wrapper, plugin, captured } = await load(async () => answer(200));
  const trace = createTrace(wrapper, plugin, { product: ["analytics"] });

  trace.start();

  expect(wrapper.client.getOptOut()).toBe(true);

  wrapper.eventNoProperties();
  trace.consent.set({ analytics: "granted" });

  expect(wrapper.client.getOptOut()).toBe(false);

  await trace.track("Event No Properties").settled;
  await trace.flush({ timeout: 2_000 });

  expect(captured.map(({ event_type }) => event_type)).toStrictEqual([
    "Event No Properties",
  ]);
});
