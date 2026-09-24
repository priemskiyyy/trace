import { createInstance, Identify, Types } from "@amplitude/analytics-browser";
import { event, Trace, TraceError } from "@priemskiyyy/trace";
import type { TrackContext, TrackedEvent } from "@priemskiyyy/trace";
import { expect, onTestFinished, test, vi } from "vitest";

import { amplitude } from "src/amplitude";
import { identityPlugin } from "src/identityPlugin";

const ADA_EVENT_ID = "0b5f6c9e-8f1a-4c2d-9a3b-2f6e1d4c7a88";
const TIMESTAMP = 1_767_225_600_000;

const context: TrackContext = {
  signal: new AbortController().signal,
  currentGeneration: () => 1,
  now: () => TIMESTAMP,
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

const getThrown = (call: () => unknown) => {
  try {
    call();
  } catch (error) {
    return error;
  }

  return null;
};

const OPTIONS = {
  autocapture: false,
  fetchRemoteConfig: false,
  identityStorage: "none",
  offline: Types.OfflineDisabled,
  flushMaxRetries: 0,
  logLevel: Types.LogLevel.None,
  serverUrl: "https://amplitude.example.test/2/httpapi",
} satisfies Types.BrowserOptions;

const createUploadReader = (uploaded: Types.Event[]) =>
  ({
    name: "trace-test-upload",
    type: "destination",
    execute: async (uploading: Types.Event) => {
      uploaded.push(uploading);

      return { event: uploading, code: 200, message: "read by the test" };
    },
  }) satisfies Types.DestinationPlugin;

const createAmplitude = async ({
  code = 200,
  slowPlugin = null,
  isPluginAdded = true,
}: {
  code?: number;
  slowPlugin?: "before" | "enrichment" | null;
  isPluginAdded?: boolean;
} = {}) => {
  const uploaded: Types.Event[] = [];
  const requests: { events: Record<string, unknown>[] }[] = [];

  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      requests.push(JSON.parse(String(init?.body)));

      return new Response(
        JSON.stringify({
          code,
          events_ingested: 1,
          payload_size_bytes: 0,
          server_upload_time: 0,
        }),
        { status: code },
      );
    }),
  );

  const sdk = createInstance();

  if (slowPlugin !== null) {
    sdk.add({
      name: "application-slow-plugin",
      type: slowPlugin,
      execute: async (slowed) => {
        await new Promise((resolve) => {
          setTimeout(resolve, 5);
        });

        return slowed;
      },
    });
  }

  await sdk.init("trace-test-api-key", OPTIONS).promise;

  const plugin = identityPlugin();

  if (isPluginAdded) {
    await sdk.add(plugin).promise;
  }

  await sdk.add(createUploadReader(uploaded)).promise;
  onTestFinished(() => {
    sdk.setOptOut(true);
  });

  return { sdk, uploaded, plugin, requests };
};

const flush = { timeout: 5_000, signal: new AbortController().signal };

const SUBMITTED = {
  status: "submitted",
  evidence: "sdk-call-returned",
  event: null,
  losses: [],
};

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

test("open on the real SDK refuses with NOT_INITIALIZED until the identity plugin is added, and opens once it is", async () => {
  const { sdk, plugin } = await createAmplitude({ isPluginAdded: false });
  const adapter = amplitude({ sdk, Identify, plugin });

  expect(getThrown(adapter.open)).toStrictEqual(NOT_INITIALIZED);

  sdk.add(plugin);

  expect(adapter.open().native).toBe(sdk);
});

test("the real SDK keeps one identity plugin, so a second one added to it is never set up and its destination does not open", async () => {
  const { sdk } = await createAmplitude();
  const second = identityPlugin();

  await sdk.add(second).promise;

  expect(
    getThrown(amplitude({ sdk, Identify, plugin: second }).open),
  ).toStrictEqual(NOT_INITIALIZED);
});

test("the real SDK files a Trace event under the user and device it was tracked with, and leaves an event Trace did not make untouched, when its identity changes before the timeline runs", async () => {
  const { sdk, uploaded, plugin } = await createAmplitude();
  const session = amplitude({ sdk, Identify, plugin }).open();
  const adaDevice = sdk.getDeviceId();

  session.track(createEvent(), context);
  sdk.track("Own Event");
  sdk.reset();
  sdk.setUserId("bob");

  const bobDevice = sdk.getDeviceId();

  expect(await session.flush?.(flush)).toStrictEqual({ status: "flushed" });
  expect(
    uploaded.map(({ event_type, insert_id, user_id, device_id }) => ({
      event_type,
      insert_id,
      user_id,
      device_id,
    })),
  ).toEqual([
    {
      event_type: "Checkout Started",
      insert_id: ADA_EVENT_ID,
      user_id: "ada",
      device_id: adaDevice,
    },
    {
      event_type: "Own Event",
      insert_id: expect.any(String),
      user_id: "bob",
      device_id: bobDevice,
    },
  ]);
  expect(adaDevice).not.toBe(bobDevice);
});

test.each([null, "before", "enrichment"] satisfies (
  "before" | "enrichment" | null
)[])(
  "through Trace, the real SDK keeps an event tracked before sign-in anonymous through a sign-in and a switch made in the same tick, with a slow application plugin of type %s",
  async (slowPlugin) => {
    const { sdk, uploaded, plugin } = await createAmplitude({ slowPlugin });

    const trace = new Trace({
      events: { "Note Added": event<{ note: string }>() },
      destinations: { product: amplitude({ sdk, Identify, plugin }) },
    });

    onTestFinished(trace.dispose);
    trace.start();

    const firstDevice = sdk.getDeviceId();
    const anonymous = trace.track("Note Added", { note: "before sign-in" });

    trace.user({ id: "ada" });

    const ada = trace.track("Note Added", { note: "from ada" });

    trace.user({ id: "bob" });

    const bob = trace.track("Note Added", { note: "from bob" });

    expect(await trace.flush({ timeout: 5_000 })).toEqual({
      drained: true,
      destinations: { product: { status: "flushed" } },
    });

    const lastDevice = sdk.getDeviceId();

    expect(
      await Promise.all([anonymous.settled, ada.settled, bob.settled]),
    ).toStrictEqual([
      { state: "settled", outcomes: { product: SUBMITTED } },
      { state: "settled", outcomes: { product: SUBMITTED } },
      { state: "settled", outcomes: { product: SUBMITTED } },
    ]);
    expect(
      uploaded.map(({ event_properties, user_id, device_id }) => ({
        event_properties,
        user_id,
        device_id,
      })),
    ).toStrictEqual([
      {
        event_properties: { note: "before sign-in" },
        user_id: undefined,
        device_id: firstDevice,
      },
      {
        event_properties: { note: "from ada" },
        user_id: "ada",
        device_id: firstDevice,
      },
      {
        event_properties: { note: "from bob" },
        user_id: "bob",
        device_id: lastDevice,
      },
    ]);
    expect(firstDevice).not.toBe(lastDevice);
  },
);

test("through Trace, once the real SDK's remove() takes the plugin out, an event tracked before a sign-in fails with NOT_INITIALIZED and nothing is uploaded under the user who signed in", async () => {
  const { sdk, uploaded, plugin } = await createAmplitude();

  const trace = new Trace({
    events: { "Note Added": event<{ note: string }>() },
    destinations: { product: amplitude({ sdk, Identify, plugin }) },
  });

  onTestFinished(trace.dispose);
  trace.start();
  await sdk.remove(plugin.name).promise;

  const anonymous = trace.track("Note Added", { note: "before sign-in" });

  trace.user({ id: "ada" });
  await trace.flush({ timeout: 5_000 });

  expect(await anonymous.settled).toStrictEqual({
    state: "settled",
    outcomes: { product: { status: "failed", error: PLUGIN_REMOVED } },
  });
  expect(uploaded).toStrictEqual([]);
  expect(sdk.getUserId()).toBe("ada");
});

test("through Trace, once a second init() of the real SDK takes the plugin out, an event tracked before a sign-in fails with NOT_INITIALIZED and nothing is uploaded under the user who signed in", async () => {
  const { sdk, plugin } = await createAmplitude();
  const uploaded: Types.Event[] = [];

  const trace = new Trace({
    events: { "Note Added": event<{ note: string }>() },
    destinations: { product: amplitude({ sdk, Identify, plugin }) },
  });

  onTestFinished(trace.dispose);
  trace.start();
  await sdk.init("trace-test-api-key", OPTIONS).promise;
  await sdk.add(createUploadReader(uploaded)).promise;

  const anonymous = trace.track("Note Added", { note: "before sign-in" });

  trace.user({ id: "ada" });
  await trace.flush({ timeout: 5_000 });

  expect(await anonymous.settled).toStrictEqual({
    state: "settled",
    outcomes: { product: { status: "failed", error: PLUGIN_REMOVED } },
  });
  expect(uploaded).toStrictEqual([]);
  expect(sdk.getUserId()).toBe("ada");
});

test("the real SDK uploads each call Trace makes under the user and device it was made for, with no extra in the payload it sends", async () => {
  const { sdk, plugin, requests } = await createAmplitude();
  const session = amplitude({ sdk, Identify, plugin }).open();
  const device = sdk.getDeviceId();

  session.track(createEvent(), context);
  session.traits?.(
    freeze({ user: { id: "ada" }, set: { plan: "pro" }, remove: [] }),
  );
  session.group?.(
    freeze({
      user: { id: "ada" },
      group: { type: "workspace", id: "w_1", traits: { tier: "team" } },
    }),
  );
  sdk.setUserId("bob");

  expect(await session.flush?.(flush)).toStrictEqual({ status: "flushed" });
  expect(
    requests
      .flatMap(({ events }) => events)
      .map((sent) => ({
        event_type: sent.event_type,
        user_id: sent.user_id,
        device_id: sent.device_id,
        hasExtra: "extra" in sent,
      })),
  ).toStrictEqual([
    {
      event_type: "Checkout Started",
      user_id: "ada",
      device_id: device,
      hasExtra: false,
    },
    {
      event_type: "$identify",
      user_id: "ada",
      device_id: device,
      hasExtra: false,
    },
    {
      event_type: "$identify",
      user_id: "ada",
      device_id: device,
      hasExtra: false,
    },
    {
      event_type: "$groupidentify",
      user_id: "ada",
      device_id: device,
      hasExtra: false,
    },
  ]);
});

test("through Trace, calls the real SDK still holds when a second init() takes the plugin out keep their user and device once it is added again", async () => {
  const { sdk, plugin } = await createAmplitude();
  const uploaded: Types.Event[] = [];

  const trace = new Trace({
    events: { "Note Added": event<{ note: string }>() },
    destinations: { product: amplitude({ sdk, Identify, plugin }) },
  });

  onTestFinished(trace.dispose);
  trace.start();

  const firstDevice = sdk.getDeviceId();
  const anonymous = trace.track("Note Added", { note: "before sign-in" });

  trace.user({ id: "ada" });

  const ada = trace.track("Note Added", { note: "from ada" });

  expect(await Promise.all([anonymous.settled, ada.settled])).toStrictEqual([
    { state: "settled", outcomes: { product: SUBMITTED } },
    { state: "settled", outcomes: { product: SUBMITTED } },
  ]);

  await sdk.init("trace-test-api-key", "bob", OPTIONS).promise;
  await sdk.add(plugin).promise;
  await sdk.add(createUploadReader(uploaded)).promise;
  await sdk.flush().promise;

  expect(
    uploaded.map(({ event_properties, user_id, device_id }) => ({
      event_properties,
      user_id,
      device_id,
    })),
  ).toStrictEqual([
    {
      event_properties: { note: "before sign-in" },
      user_id: undefined,
      device_id: firstDevice,
    },
    {
      event_properties: { note: "from ada" },
      user_id: "ada",
      device_id: firstDevice,
    },
  ]);
  expect([sdk.getUserId(), sdk.getDeviceId() === firstDevice]).toStrictEqual([
    "bob",
    false,
  ]);
});

test("the real SDK loses only the call an application plugin throws on, and the calls queued with it keep their user and device", async () => {
  const { sdk, plugin } = await createAmplitude();
  const session = amplitude({ sdk, Identify, plugin }).open();
  const device = sdk.getDeviceId();
  const reached: Types.Event[] = [];
  const held = { resolve: () => {} };

  const bothReached = new Promise<void>((resolve) => {
    held.resolve = resolve;
  });

  await sdk.add({
    name: "application-throwing-plugin",
    type: "before",
    execute: async (processing) => {
      if (processing.insert_id === "5c1d8e2a-3b4f-4a6e-9c7d-1e2f3a4b5c6d") {
        throw new Error("application plugin failed");
      }

      return processing;
    },
  }).promise;
  await sdk.add({
    name: "trace-test-reader",
    type: "destination",
    execute: async (reading) => {
      reached.push(reading);

      if (reached.length === 2) {
        held.resolve();
      }

      return { event: reading, code: 200, message: "read by the test" };
    },
  }).promise;

  const anonymous = { generation: 1, user: null, traits: {}, groups: {} };

  session.track(
    createEvent({
      id: "5c1d8e2a-3b4f-4a6e-9c7d-1e2f3a4b5c6d",
      properties: { note: "thrown on" },
      identity: anonymous,
    }),
    context,
  );
  session.track(
    createEvent({
      id: "6d2e9f3b-4c5a-4b7f-8d8e-2f3a4b5c6d7e",
      properties: { note: "queued with it" },
      identity: anonymous,
    }),
    context,
  );
  session.traits?.(freeze({ user: null, set: { plan: "pro" }, remove: [] }));
  sdk.setUserId("ada");

  await expect(sdk.flush().promise).rejects.toStrictEqual(
    new Error("application plugin failed"),
  );
  await bothReached;

  expect(
    reached.map(({ event_type, event_properties, user_id, device_id }) => ({
      event_type,
      event_properties,
      user_id,
      device_id,
    })),
  ).toStrictEqual([
    {
      event_type: "Checkout Started",
      event_properties: { app: { version: "2.4.0" }, note: "queued with it" },
      user_id: undefined,
      device_id: device,
    },
    {
      event_type: "$identify",
      event_properties: undefined,
      user_id: undefined,
      device_id: device,
    },
  ]);
});

test("through Trace, the real SDK still uploads Ada's event under Ada on her device after a switch to bob and remove() in the same tick", async () => {
  const { sdk, uploaded, plugin } = await createAmplitude();

  const trace = new Trace({
    events: { "Note Added": event<{ note: string }>() },
    destinations: { product: amplitude({ sdk, Identify, plugin }) },
  });

  onTestFinished(trace.dispose);
  trace.start();
  trace.user({ id: "ada" });

  const adaDevice = sdk.getDeviceId();
  const ada = trace.track("Note Added", { note: "from ada" });

  expect(await ada.settled).toStrictEqual({
    state: "settled",
    outcomes: { product: SUBMITTED },
  });

  trace.user({ id: "bob" });
  await sdk.remove(plugin.name).promise;
  await sdk.flush().promise;

  expect(
    uploaded.map(({ event_properties, user_id, device_id }) => ({
      event_properties,
      user_id,
      device_id,
    })),
  ).toStrictEqual([
    {
      event_properties: { note: "from ada" },
      user_id: "ada",
      device_id: adaDevice,
    },
  ]);
  expect([sdk.getUserId(), sdk.getDeviceId() === adaDevice]).toStrictEqual([
    "bob",
    false,
  ]);
});

test("through Trace, the real SDK still uploads Ada's event under Ada on her device after a switch to bob and a new init() in the same tick", async () => {
  const { sdk, plugin } = await createAmplitude();
  const uploaded: Types.Event[] = [];

  const trace = new Trace({
    events: { "Note Added": event<{ note: string }>() },
    destinations: { product: amplitude({ sdk, Identify, plugin }) },
  });

  onTestFinished(trace.dispose);
  trace.start();
  trace.user({ id: "ada" });

  const adaDevice = sdk.getDeviceId();
  const ada = trace.track("Note Added", { note: "from ada" });

  expect(await ada.settled).toStrictEqual({
    state: "settled",
    outcomes: { product: SUBMITTED },
  });

  trace.user({ id: "bob" });
  await sdk.init("trace-test-api-key", "bob", OPTIONS).promise;
  await sdk.add(createUploadReader(uploaded)).promise;
  await sdk.flush().promise;

  expect(
    uploaded.map(({ event_properties, user_id, device_id }) => ({
      event_properties,
      user_id,
      device_id,
    })),
  ).toStrictEqual([
    {
      event_properties: { note: "from ada" },
      user_id: "ada",
      device_id: adaDevice,
    },
  ]);
  expect([sdk.getUserId(), sdk.getDeviceId() === adaDevice]).toStrictEqual([
    "bob",
    false,
  ]);
});

test("through Trace, an identity change right after events is applied at once, with nothing to wait for", async () => {
  const { sdk, plugin } = await createAmplitude();

  const trace = new Trace({
    events: { "Note Added": event<{ note: string }>() },
    destinations: { product: amplitude({ sdk, Identify, plugin }) },
  });

  onTestFinished(trace.dispose);
  trace.start();
  trace.track("Note Added", { note: "first" });
  trace.track("Note Added", { note: "second" });
  trace.user({ id: "ada" });

  expect(sdk.getUserId()).toBe("ada");
});

test("the real SDK uploads an event with its time, its insert id and its properties over its context", async () => {
  const { sdk, uploaded, plugin } = await createAmplitude();
  const session = amplitude({ sdk, Identify, plugin }).open();

  session.track(
    createEvent({
      properties: { plan: "pro", profile: { score: null } },
      context: { plan: "free", locale: "de" },
    }),
    context,
  );
  await session.flush?.(flush);

  expect(uploaded).toMatchObject([
    {
      event_type: "Checkout Started",
      time: TIMESTAMP,
      insert_id: ADA_EVENT_ID,
      user_id: "ada",
      event_properties: { plan: "pro", locale: "de", profile: { score: null } },
    },
  ]);
});

test("the real SDK gets a trait Identify takes, with a null nested in it stripped, under the trait's user, and none of a trait any part of which it would refuse or cut", async () => {
  const { sdk, uploaded, plugin } = await createAmplitude();
  const session = amplitude({ sdk, Identify, plugin }).open();

  const thrown = getThrown(() =>
    session.traits?.(
      freeze({
        user: { id: "ada" },
        set: {
          plan: "pro",
          profile: { score: null, name: "ada" },
          tags: ["beta", true],
          scores: [1, null, 3],
          note: "n".repeat(1_025),
          bio: { text: "b".repeat(1_025), lang: "en" },
        },
        remove: ["legacy"],
      }),
    ),
  );

  await session.flush?.(flush);

  expect(thrown).toStrictEqual(
    new TraceError({
      code: "UNSUPPORTED",
      message:
        "Amplitude cannot take these values, so they were left out: traits.profile.score, traits.tags, traits.scores, traits.note, traits.bio.",
    }),
  );
  expect(uploaded).toMatchObject([
    {
      event_type: "$identify",
      user_id: "ada",
      user_properties: {
        $unset: { legacy: "-" },
        $set: { plan: "pro", profile: { name: "ada" } },
      },
    },
  ]);
});

test("a flush over the real SDK answers failed when Amplitude refuses the upload it waited for", async () => {
  const { sdk, plugin } = await createAmplitude({ code: 413 });
  const session = amplitude({ sdk, Identify, plugin }).open();

  session.track(createEvent(), context);

  expect(await session.flush?.(flush)).toStrictEqual({
    status: "failed",
    error: new TraceError({
      code: "DELIVERY_FAILED",
      message:
        "Amplitude did not accept 1 of the uploads this flush waited for.",
    }),
  });
});

test("through Trace, the real SDK uploads a string over 1,024 characters whole for Amplitude to cut, and the receipt says so", async () => {
  const { sdk, uploaded, plugin } = await createAmplitude();
  const note = "n".repeat(1_025);

  const trace = new Trace({
    events: { "Note Added": event<{ note: string }>() },
    destinations: { product: amplitude({ sdk, Identify, plugin }) },
  });

  onTestFinished(trace.dispose);
  trace.start();

  const receipt = await trace.track("Note Added", { note }).settled;

  await trace.flush({ timeout: 5_000 });

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
  expect(
    uploaded.map(({ event_properties }) => event_properties),
  ).toStrictEqual([{ note }]);
});
