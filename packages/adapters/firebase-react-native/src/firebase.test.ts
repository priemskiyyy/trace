import { event, Trace } from "@priemskiyyy/trace";
import type {
  MappingLoss,
  TraceDiagnosticEvent,
  TrackedEvent,
} from "@priemskiyyy/trace";
import { expect, onTestFinished, test } from "vitest";

import { fakeFirebase } from "src/fakeFirebase.fixture";
import { firebase } from "src/firebase";
import { ga4 } from "src/ga4";
import { createTrackedEvent } from "src/trackedEvent.fixture";
import type { Ga4EventMap } from "src/types/Ga4EventMap";

type FakeFirebase = ReturnType<typeof fakeFirebase>;

const TIMESTAMP = 1_767_225_600_000;

const TIMESTAMP_LOSS: MappingLoss = {
  path: "timestamp",
  reason: "unsupported",
};

const PARTIAL_TRAITS = expect.objectContaining({
  name: "TraceError",
  code: "UNSUPPORTED",
  message:
    "Firebase cannot keep every user property in this update; the others were set.",
});

const SUBMITTED = {
  product: {
    status: "submitted",
    evidence: "sdk-call-returned",
    event: null,
    losses: [TIMESTAMP_LOSS],
  },
};

const events = {
  "Checkout Started": event<{
    total: number;
    currency: string;
    lines: { sku: string; price: number; quantity: number }[];
  }>(),
  "Note Added": event<{ note: string }>(),
  "Internal Ping": event(),
};

const map = ga4(events, {
  "Checkout Started": ({ properties }) => ({
    name: "begin_checkout",
    parameters: { value: properties.total, currency: properties.currency },
    items: properties.lines.map(({ sku, price, quantity }) => ({
      item_id: sku,
      price,
      quantity,
    })),
  }),
  "Note Added": ({ properties }) => ({
    name: "note_added",
    parameters: { note: properties.note },
  }),
  "Internal Ping": () => null,
});

const byName: Ga4EventMap = ({ name }) => ({ name, parameters: {} });

const createContext = () => ({
  signal: new AbortController().signal,
  currentGeneration: () => 1,
  now: () => TIMESTAMP,
});

const open = (fake: FakeFirebase = fakeFirebase(), eventMap = byName) =>
  firebase({ sdk: fake.sdk, analytics: fake.analytics, map: eventMap }).open();

const createTrace = (
  fake: FakeFirebase,
  options: { consent?: { product: ["analytics"] } } = {},
  eventMap: Ga4EventMap = map,
) => {
  const trace = new Trace({
    events,
    destinations: {
      product: firebase({
        sdk: fake.sdk,
        analytics: fake.analytics,
        map: eventMap,
      }),
    },
    now: () => TIMESTAMP,
    ...options,
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

const getThrown = (run: () => unknown) => {
  try {
    run();
  } catch (error) {
    return error;
  }

  return null;
};

test("creating the adapter reads and calls nothing on the SDK", () => {
  const fake = fakeFirebase();
  const { reads, watch } = watchReads();

  firebase({
    sdk: watch(fake.sdk),
    analytics: watch(fake.analytics),
    map: byName,
  });

  expect(reads).toEqual([]);
  expect(fake.calls).toEqual([]);
});

test("open reads and calls nothing on the SDK, because the native SDK initializes itself when the app launches", () => {
  const fake = fakeFirebase();
  const { reads, watch } = watchReads();

  firebase({
    sdk: watch(fake.sdk),
    analytics: watch(fake.analytics),
    map: byName,
  }).open();

  expect(reads).toEqual([]);
  expect(fake.calls).toEqual([]);
});

test("the native handle is the analytics instance the application created", () => {
  const fake = fakeFirebase();

  expect(open(fake).native).toBe(fake.analytics);
});

test("a mapped event is logged through the instance's own logEvent under its GA4 name, with its items first and the context under its parameters, and submitted once the native SDK has it", async () => {
  const fake = fakeFirebase();

  const answer = await open(fake, map).track(
    createTrackedEvent({
      name: "Checkout Started",
      properties: {
        total: 49.5,
        currency: "EUR",
        lines: [{ sku: "sku_1", price: 49.5, quantity: 1 }],
      },
      context: { app_version: "2.4.0", currency: "USD", app: { build: 7 } },
    }),
    createContext(),
  );

  expect(fake.calls).toEqual([
    {
      method: "analytics.logEvent",
      args: [
        "begin_checkout",
        {
          items: [{ item_id: "sku_1", price: 49.5, quantity: 1 }],
          value: 49.5,
          currency: "EUR",
          app_version: "2.4.0",
        },
      ],
    },
  ]);
  expect(answer).toEqual({
    status: "submitted",
    evidence: "sdk-call-returned",
    losses: [
      { path: "context.currency", reason: "omitted" },
      { path: "context.app", reason: "unsupported" },
      TIMESTAMP_LOSS,
    ],
  });
});

test("an event is answered only once the native SDK has settled its logEvent", async () => {
  const fake = fakeFirebase({ hold: ["analytics.logEvent"] });
  const answer = open(fake).track(createTrackedEvent(), createContext());

  expect(await getProgress(answer)).toBe("pending");

  fake.held[0]?.();

  expect(await answer).toEqual({
    status: "submitted",
    evidence: "sdk-call-returned",
    losses: [TIMESTAMP_LOSS],
  });
});

test("the map receives the frozen event every destination sees", async () => {
  const seen: TrackedEvent[] = [];
  const tracked = createTrackedEvent();

  await open(fakeFirebase(), (received) => {
    seen.push(received);

    return null;
  }).track(tracked, createContext());

  expect(seen).toHaveLength(1);
  expect(seen[0]).toBe(tracked);
});

test("a mapping that answers null keeps the event from Firebase as provider-filtered", async () => {
  const fake = fakeFirebase();

  const answer = await open(fake, map).track(
    createTrackedEvent({ name: "Internal Ping" }),
    createContext(),
  );

  expect(answer).toEqual({ status: "dropped", reason: "provider-filtered" });
  expect(fake.calls).toEqual([]);
});

test.each([
  "page_view",
  "screen_view",
  "Checkout",
  "ad_impression",
  "app_exception_seen",
  "x".repeat(40),
])("a mapped name GA4 accepts, %j, is logged as it is", async (name) => {
  const fake = fakeFirebase();

  const answer = await open(fake).track(
    createTrackedEvent({ name }),
    createContext(),
  );

  expect(fake.calls).toEqual([
    { method: "analytics.logEvent", args: [name, {}] },
  ]);
  expect(answer).toEqual({
    status: "submitted",
    evidence: "sdk-call-returned",
    losses: [TIMESTAMP_LOSS],
  });
});

test.each([
  "Checkout Started",
  "sign-up",
  "1st_purchase",
  "_private",
  "",
  "x".repeat(41),
  "подія",
  "café_opened",
  "𠀀".repeat(40),
  "query_id_lookup",
  "query_idx",
  "firebase_sync",
  "google_login",
  "ga_custom",
  "ad_activeview",
  "ad_click",
  "ad_exposure",
  "ad_query",
  "ad_reward",
  "adunit_exposure",
  "app_background",
  "app_clear_data",
  "app_exception",
  "app_install",
  "app_remove",
  "app_store_refund",
  "app_store_subscription_cancel",
  "app_store_subscription_convert",
  "app_store_subscription_renew",
  "app_update",
  "app_upgrade",
  "dynamic_link_app_open",
  "dynamic_link_app_update",
  "dynamic_link_first_open",
  "error",
  "first_open",
  "first_visit",
  "in_app_purchase",
  "notification_dismiss",
  "notification_foreground",
  "notification_open",
  "notification_receive",
  "notification_send",
  "os_update",
  "session_start",
  "session_start_with_rollout",
  "user_engagement",
])(
  "a mapped name React Native Firebase or GA4 refuses, %j, is dropped as provider-filtered with an invalid name before the SDK can throw, never converted",
  async (name) => {
    const fake = fakeFirebase();

    const answer = await open(fake).track(
      createTrackedEvent({ name }),
      createContext(),
    );

    expect(answer).toEqual({
      status: "dropped",
      reason: "provider-filtered",
      losses: [{ path: "name", reason: "invalid" }],
    });
    expect(fake.calls).toEqual([]);
  },
);

test("a mapping that throws rejects track, which Trace answers as failed, and sends nothing", async () => {
  const fake = fakeFirebase();
  const error = new Error("the mapping is broken");

  const session = open(fake, () => {
    throw error;
  });

  await expect(
    session.track(createTrackedEvent(), createContext()),
  ).rejects.toBe(error);
  expect(fake.calls).toEqual([]);
});

test("an event the native SDK refuses rejects track with its error", async () => {
  const fake = fakeFirebase();
  const failure = new Error("Firebase could not log the event.");

  fake.state.failures["analytics.logEvent"] = failure;

  await expect(
    open(fake).track(createTrackedEvent(), createContext()),
  ).rejects.toBe(failure);
  expect(fake.calls).toEqual([
    { method: "analytics.logEvent", args: ["checkout_started", {}] },
  ]);
});

test("identify sets the user id and answers the native SDK's promise, so Trace waits until the user is set", async () => {
  const fake = fakeFirebase({ hold: ["setUserId"] });
  const identified = open(fake).identify?.({ user: { id: "ada" } });

  expect(fake.calls).toEqual([
    { method: "setUserId", args: [fake.analytics, "ada"] },
  ]);
  expect(await getProgress(identified)).toBe("pending");

  fake.held[0]?.();

  await expect(identified).resolves.toBeUndefined();
});

test("a user id longer than GA4's 256 characters is refused as UNSUPPORTED before Firebase sees it", async () => {
  const fake = fakeFirebase();
  const session = open(fake);

  expect(
    getThrown(() => session.identify?.({ user: { id: "a".repeat(257) } })),
  ).toEqual(
    expect.objectContaining({
      name: "TraceError",
      code: "UNSUPPORTED",
      message: "Firebase keeps user ids of at most 256 characters.",
    }),
  );
  expect(fake.calls).toEqual([]);

  await session.identify?.({ user: { id: "a".repeat(256) } });
  await session.identify?.({ user: { id: "🙂".repeat(256) } });

  expect(fake.calls).toEqual([
    { method: "setUserId", args: [fake.analytics, "a".repeat(256)] },
    { method: "setUserId", args: [fake.analytics, "🙂".repeat(256)] },
  ]);
});

test("traits set user properties as text and a removal sends null, once the native SDK has set them", async () => {
  const fake = fakeFirebase();

  await expect(
    open(fake).traits?.({
      user: { id: "ada" },
      set: { plan: "pro", seats: 4, trial: false },
      remove: ["role"],
    }),
  ).resolves.toBeUndefined();
  expect(fake.calls).toEqual([
    {
      method: "setUserProperties",
      args: [
        fake.analytics,
        { role: null, plan: "pro", seats: "4", trial: "false" },
      ],
    },
  ]);
});

test("a user property GA4 would ignore is left out, never cut, and the update is reported UNSUPPORTED once the rest reached Firebase", async () => {
  const fake = fakeFirebase();

  await expect(
    open(fake).traits?.({
      user: { id: "ada" },
      set: {
        plan: "pro",
        bio: "b".repeat(37),
        customer_id: "c_1",
        nested: { a: 1 },
      },
      remove: [],
    }),
  ).rejects.toEqual(PARTIAL_TRAITS);
  expect(fake.calls).toEqual([
    { method: "setUserProperties", args: [fake.analytics, { plan: "pro" }] },
  ]);
});

test("an update with nothing Firebase can keep calls nothing and is reported UNSUPPORTED", async () => {
  const fake = fakeFirebase();

  await expect(
    open(fake).traits?.({ user: null, set: { nested: { a: 1 } }, remove: [] }),
  ).rejects.toEqual(PARTIAL_TRAITS);
  expect(fake.calls).toEqual([]);
});

test("a traits update the native SDK refuses fails with its error, and the next reset still nulls what it tried to set", async () => {
  const fake = fakeFirebase();
  const session = open(fake);
  const failure = new Error("Firebase could not set the user properties.");

  fake.state.failures["setUserProperties"] = failure;

  await expect(
    session.traits?.({ user: null, set: { plan: "pro" }, remove: [] }),
  ).rejects.toBe(failure);

  fake.state.failures = {};
  await session.reset?.();

  expect(fake.calls).toEqual([
    { method: "setUserProperties", args: [fake.analytics, { plan: "pro" }] },
    { method: "setUserId", args: [fake.analytics, null] },
    { method: "setUserProperties", args: [fake.analytics, { plan: null }] },
  ]);
});

test("reset clears the user id and nulls every user property name the adapter sent since the last reset, removed ones included", async () => {
  const fake = fakeFirebase();
  const session = open(fake);

  await session.traits?.({
    user: { id: "ada" },
    set: { plan: "pro", seats: 4 },
    remove: [],
  });
  await session.traits?.({
    user: { id: "ada" },
    set: { role: "admin" },
    remove: ["seats", "legacy"],
  });
  await session.identify?.({ user: { id: "ada" } });

  expect(await session.reset?.()).toBeUndefined();
  expect(await session.reset?.()).toBeUndefined();
  expect(fake.calls).toEqual([
    {
      method: "setUserProperties",
      args: [fake.analytics, { plan: "pro", seats: "4" }],
    },
    {
      method: "setUserProperties",
      args: [fake.analytics, { seats: null, legacy: null, role: "admin" }],
    },
    { method: "setUserId", args: [fake.analytics, "ada"] },
    { method: "setUserId", args: [fake.analytics, null] },
    {
      method: "setUserProperties",
      args: [
        fake.analytics,
        { plan: null, seats: null, legacy: null, role: null },
      ],
    },
    { method: "setUserId", args: [fake.analytics, null] },
  ]);
});

test("reset nulls the user properties an earlier session of the same adapter set", async () => {
  const fake = fakeFirebase();

  const adapter = firebase({
    sdk: fake.sdk,
    analytics: fake.analytics,
    map: byName,
  });

  await adapter
    .open()
    .traits?.({ user: null, set: { plan: "pro" }, remove: [] });
  await adapter.open().reset?.();

  expect(fake.calls).toEqual([
    { method: "setUserProperties", args: [fake.analytics, { plan: "pro" }] },
    { method: "setUserId", args: [fake.analytics, null] },
    { method: "setUserProperties", args: [fake.analytics, { plan: null }] },
  ]);
});

test("a reset whose setUserId the native SDK refuses keeps every name it meant to null for the next reset", async () => {
  const fake = fakeFirebase();
  const session = open(fake);
  const failure = new Error("Firebase could not clear the user id.");

  await session.traits?.({ user: null, set: { plan: "pro" }, remove: [] });

  fake.state.failures["setUserId"] = failure;

  await expect(session.reset?.()).rejects.toBe(failure);

  fake.state.failures = {};
  await session.reset?.();

  expect(fake.calls).toEqual([
    { method: "setUserProperties", args: [fake.analytics, { plan: "pro" }] },
    { method: "setUserId", args: [fake.analytics, null] },
    { method: "setUserId", args: [fake.analytics, null] },
    { method: "setUserProperties", args: [fake.analytics, { plan: null }] },
  ]);
});

test("a reset whose nulling call the native SDK refuses after it cleared the user id keeps every name it meant to null for the next reset", async () => {
  const fake = fakeFirebase();
  const session = open(fake);
  const failure = new Error("Firebase could not null the user properties.");

  await session.traits?.({ user: null, set: { plan: "pro" }, remove: [] });

  fake.state.failures["setUserProperties"] = failure;

  await expect(session.reset?.()).rejects.toBe(failure);

  fake.state.failures = {};
  await session.reset?.();

  expect(fake.calls).toEqual([
    { method: "setUserProperties", args: [fake.analytics, { plan: "pro" }] },
    { method: "setUserId", args: [fake.analytics, null] },
    { method: "setUserProperties", args: [fake.analytics, { plan: null }] },
    { method: "setUserId", args: [fake.analytics, null] },
    { method: "setUserProperties", args: [fake.analytics, { plan: null }] },
  ]);
});

test("a traits update made while a reset still waits for the native SDK is nulled by the next reset", async () => {
  const fake = fakeFirebase({ hold: ["setUserId"] });
  const session = open(fake);

  await session.traits?.({ user: null, set: { plan: "pro" }, remove: [] });

  const first = session.reset?.();

  await session.traits?.({ user: null, set: { role: "admin" }, remove: [] });
  fake.held[0]?.();
  await first;

  const second = session.reset?.();

  fake.held[1]?.();
  await second;

  expect(fake.calls).toEqual([
    { method: "setUserProperties", args: [fake.analytics, { plan: "pro" }] },
    { method: "setUserId", args: [fake.analytics, null] },
    { method: "setUserProperties", args: [fake.analytics, { role: "admin" }] },
    { method: "setUserProperties", args: [fake.analytics, { plan: null }] },
    { method: "setUserId", args: [fake.analytics, null] },
    { method: "setUserProperties", args: [fake.analytics, { role: null }] },
  ]);
});

test("the session has no group, flush or dispose, because Firebase offers no groups or flush and nothing waits to be released", () => {
  const session = open();

  expect(session.group).toBeUndefined();
  expect(session.flush).toBeUndefined();
  expect(session.dispose).toBeUndefined();
});

test("collection switches Firebase's own collection both ways, right after open, and answers once the native SDK has switched it", async () => {
  const fake = fakeFirebase({ hold: ["setAnalyticsCollectionEnabled"] });
  const session = open(fake);
  const closed = session.collection?.(false);

  expect(await getProgress(closed)).toBe("pending");

  fake.held[0]?.();

  await expect(closed).resolves.toBeUndefined();

  const opened = session.collection?.(true);

  fake.held[1]?.();

  await expect(opened).resolves.toBeUndefined();
  expect(fake.calls).toEqual([
    {
      method: "setAnalyticsCollectionEnabled",
      args: [fake.analytics, false],
    },
    { method: "setAnalyticsCollectionEnabled", args: [fake.analytics, true] },
  ]);
});

test("through Trace, a user switch resets Firebase between the users, and each event is logged after the identity it belongs to", async () => {
  const fake = fakeFirebase();
  const trace = createTrace(fake);

  trace.start();
  trace.user({ id: "ada", traits: { plan: "pro" } });

  expect(await trace.track("Note Added", { note: "ada" }).settled).toEqual({
    state: "settled",
    outcomes: SUBMITTED,
  });

  trace.user({ id: "bob" });

  expect(await trace.track("Note Added", { note: "bob" }).settled).toEqual({
    state: "settled",
    outcomes: SUBMITTED,
  });
  expect(fake.calls).toEqual([
    { method: "setUserId", args: [fake.analytics, "ada"] },
    { method: "setUserProperties", args: [fake.analytics, { plan: "pro" }] },
    { method: "analytics.logEvent", args: ["note_added", { note: "ada" }] },
    { method: "setUserId", args: [fake.analytics, null] },
    { method: "setUserProperties", args: [fake.analytics, { plan: null }] },
    { method: "setUserId", args: [fake.analytics, "bob"] },
    { method: "analytics.logEvent", args: ["note_added", { note: "bob" }] },
  ]);
});

test("through Trace, an event reaches the native SDK before a user switch in the same tick resets it, because track calls logEvent before it awaits anything", async () => {
  const fake = fakeFirebase();
  const trace = createTrace(fake);

  trace.start();
  trace.user({ id: "ada" });

  expect(
    await trace.track("Note Added", { note: "ada first" }).settled,
  ).toEqual({ state: "settled", outcomes: SUBMITTED });

  const ada = trace.track("Note Added", { note: "ada" });

  trace.user({ id: "bob" });

  const bob = trace.track("Note Added", { note: "bob" });

  expect(await ada.settled).toEqual({ state: "settled", outcomes: SUBMITTED });
  expect(await bob.settled).toEqual({ state: "settled", outcomes: SUBMITTED });
  expect(fake.calls).toEqual([
    { method: "setUserId", args: [fake.analytics, "ada"] },
    {
      method: "analytics.logEvent",
      args: ["note_added", { note: "ada first" }],
    },
    { method: "analytics.logEvent", args: ["note_added", { note: "ada" }] },
    { method: "setUserId", args: [fake.analytics, null] },
    { method: "setUserId", args: [fake.analytics, "bob"] },
    { method: "analytics.logEvent", args: ["note_added", { note: "bob" }] },
  ]);
});

test("through Trace, an event waits until the native SDK has set the user it belongs to", async () => {
  const fake = fakeFirebase({ hold: ["setUserId"] });
  const trace = createTrace(fake);

  trace.start();
  trace.user({ id: "ada" });

  const receipt = trace.track("Note Added", { note: "ada" });

  expect(fake.calls).toEqual([
    { method: "setUserId", args: [fake.analytics, "ada"] },
  ]);

  fake.held[0]?.();

  expect(await receipt.settled).toEqual({
    state: "settled",
    outcomes: SUBMITTED,
  });
  expect(fake.calls).toEqual([
    { method: "setUserId", args: [fake.analytics, "ada"] },
    { method: "analytics.logEvent", args: ["note_added", { note: "ada" }] },
  ]);
});

test("through Trace, a user id longer than GA4 keeps is an identity step unsupported, and the event goes without a user id", async () => {
  const fake = fakeFirebase();
  const trace = createTrace(fake);
  const steps = watchIdentitySteps(trace);

  trace.start();
  trace.user({ id: "a".repeat(257) });

  expect(await trace.track("Note Added", { note: "long id" }).settled).toEqual({
    state: "settled",
    outcomes: SUBMITTED,
  });
  expect(steps).toEqual([
    { type: "identity step unsupported", context: { step: "identify" } },
  ]);
  expect(fake.calls).toEqual([
    { method: "analytics.logEvent", args: ["note_added", { note: "long id" }] },
  ]);
});

test("through Trace, a trait GA4 would ignore is an identity step unsupported, the rest is set and the events keep flowing", async () => {
  const fake = fakeFirebase();
  const trace = createTrace(fake);
  const steps = watchIdentitySteps(trace);

  trace.start();
  trace.user({ id: "ada", traits: { plan: "pro", bio: "b".repeat(37) } });

  expect(await trace.track("Note Added", { note: "after" }).settled).toEqual({
    state: "settled",
    outcomes: SUBMITTED,
  });
  expect(steps).toEqual([
    { type: "identity step unsupported", context: { step: "traits" } },
  ]);
  expect(fake.calls).toEqual([
    { method: "setUserId", args: [fake.analytics, "ada"] },
    { method: "setUserProperties", args: [fake.analytics, { plan: "pro" }] },
    { method: "analytics.logEvent", args: ["note_added", { note: "after" }] },
  ]);
});

test("through Trace, a gated destination whose purpose is still unknown opens with Firebase's collection off", () => {
  const fake = fakeFirebase();
  const trace = createTrace(fake, { consent: { product: ["analytics"] } });

  trace.start();

  expect(fake.calls).toEqual([
    {
      method: "setAnalyticsCollectionEnabled",
      args: [fake.analytics, false],
    },
  ]);
});

test("through Trace, granting consent turns Firebase's collection on and withdrawing it turns collection off, and nothing is logged meanwhile", async () => {
  const fake = fakeFirebase();
  const trace = createTrace(fake, { consent: { product: ["analytics"] } });

  trace.consent.set({ analytics: "granted" });
  trace.start();

  const granted = await trace.track("Note Added", { note: "granted" }).settled;

  trace.consent.set({ analytics: "denied" });

  const denied = await trace.track("Note Added", { note: "denied" }).settled;

  expect(granted).toEqual({ state: "settled", outcomes: SUBMITTED });
  expect(denied).toEqual({ state: "dropped", reason: "consent" });
  expect(fake.calls).toEqual([
    { method: "setAnalyticsCollectionEnabled", args: [fake.analytics, true] },
    { method: "analytics.logEvent", args: ["note_added", { note: "granted" }] },
    {
      method: "setAnalyticsCollectionEnabled",
      args: [fake.analytics, false],
    },
  ]);
});

test("through Trace, a collection switch the native SDK refuses is reported as destination collection failed", async () => {
  const fake = fakeFirebase();
  const trace = createTrace(fake, { consent: { product: ["analytics"] } });

  const reported = new Promise<TraceDiagnosticEvent>((resolve) => {
    onTestFinished(
      trace.diagnostics.events.subscribe((record) => {
        if (record.type === "destination collection failed") {
          resolve(record);
        }
      }),
    );
  });

  fake.state.failures["setAnalyticsCollectionEnabled"] = new Error(
    "Firebase could not switch collection.",
  );
  trace.start();

  expect(await reported).toEqual({
    source: "destination",
    type: "destination collection failed",
    destination: { name: "product" },
    event: null,
    timestamp: TIMESTAMP,
    context: { enabled: false },
  });
});

test("through Trace, a mapping that throws fails the event with its error", async () => {
  const fake = fakeFirebase();
  const error = new Error("the mapping is broken");

  const trace = createTrace(fake, {}, () => {
    throw error;
  });

  trace.start();

  expect(await trace.track("Note Added", { note: "x" }).settled).toEqual({
    state: "settled",
    outcomes: { product: { status: "failed", error } },
  });
  expect(fake.calls).toEqual([]);
});

test("through Trace, an event the native SDK refuses fails with its error", async () => {
  const fake = fakeFirebase();
  const failure = new Error("Firebase could not log the event.");
  const trace = createTrace(fake);

  fake.state.failures["analytics.logEvent"] = failure;
  trace.start();

  expect(await trace.track("Note Added", { note: "x" }).settled).toEqual({
    state: "settled",
    outcomes: { product: { status: "failed", error: failure } },
  });
});

test("through Trace, without the native module, as in Expo Go, the destination opens, an anonymous event fails with React Native Firebase's error, and a signed-in user's event is skipped as identity-failed", async () => {
  const fake = fakeFirebase();
  const trace = createTrace(fake);
  const steps = watchIdentitySteps(trace);

  fake.state.missing = true;
  trace.start();

  expect(trace.destination("product").status.get()).toEqual({
    state: "ready",
  });
  expect(await trace.track("Note Added", { note: "x" }).settled).toEqual({
    state: "settled",
    outcomes: {
      product: {
        status: "failed",
        error: new Error(
          "You attempted to use a Firebase module that's not installed natively on your project by calling firebase.analytics().",
        ),
      },
    },
  });

  trace.user({ id: "ada" });

  expect(await trace.track("Note Added", { note: "ada" }).settled).toEqual({
    state: "settled",
    outcomes: { product: { status: "skipped", reason: "identity-failed" } },
  });
  expect(steps).toEqual([
    {
      type: "identity step failed",
      context: { step: "identify", reason: "error" },
    },
    {
      type: "identity step failed",
      context: { step: "reset", reason: "error" },
    },
  ]);
  expect(fake.calls).toEqual([
    { method: "analytics.logEvent", args: ["note_added", { note: "x" }] },
    { method: "setUserId", args: [fake.analytics, "ada"] },
    { method: "setUserId", args: [fake.analytics, null] },
  ]);
});

test("through Trace, the native handle is the analytics instance once the destination is open, and null before, and flush reports unsupported", async () => {
  const fake = fakeFirebase();
  const trace = createTrace(fake);

  expect(trace.destination("product").native).toBe(null);

  trace.start();

  expect(trace.destination("product").native).toBe(fake.analytics);
  expect(await trace.flush()).toEqual({
    drained: true,
    destinations: { product: { status: "unsupported" } },
  });
});

test("Trace never initializes or closes the SDK", async () => {
  const fake = fakeFirebase();
  const trace = createTrace(fake, { consent: { product: ["analytics"] } });

  trace.consent.set({ analytics: "granted" });
  trace.start();
  trace.user({ id: "ada", traits: { plan: "pro" } });
  await trace.track("Note Added", { note: "signed in" }).settled;
  trace.user(null);
  await trace.track("Note Added", { note: "signed out" }).settled;
  await trace.flush();
  trace.consent.set({ analytics: "denied" });
  trace.dispose();

  expect(fake.calls.map(({ method }) => method)).toEqual([
    "setAnalyticsCollectionEnabled",
    "setUserId",
    "setUserProperties",
    "analytics.logEvent",
    "setUserId",
    "setUserProperties",
    "analytics.logEvent",
    "setAnalyticsCollectionEnabled",
  ]);
});
