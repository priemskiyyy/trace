import { event, Trace } from "@priemskiyyy/trace";
import type { MappingLoss, TrackedEvent } from "@priemskiyyy/trace";
import { afterEach, expect, onTestFinished, test, vi } from "vitest";

import { fakeFirebase } from "src/fakeFirebase.fixture";
import { firebase } from "src/firebase";
import { ga4 } from "src/ga4";
import { createTrackedEvent } from "src/trackedEvent.fixture";
import type { Ga4EventMap } from "src/types/Ga4EventMap";

type FakeFirebase = ReturnType<typeof fakeFirebase>;

afterEach(() => {
  vi.useRealTimers();
});

const TIMESTAMP = 1_767_225_600_000;

const TIMESTAMP_LOSS: MappingLoss = {
  path: "timestamp",
  reason: "unsupported",
};

const WITHDRAWN = expect.objectContaining({
  name: "TraceError",
  code: "DELIVERY_FAILED",
  message:
    "The identity change was withdrawn before Firebase had processed the events ahead of it, so it never reached Firebase.",
});

const PARTIAL_TRAITS = expect.objectContaining({
  name: "TraceError",
  code: "UNSUPPORTED",
  message:
    "Firebase cannot keep every user property in this update; the others were set.",
});

const NO_LIFECYCLE_CALLS = {
  getAnalytics: 0,
  initializeAnalytics: 0,
  isSupported: 0,
  settings: 0,
  setConsent: 0,
  setDefaultEventParameters: 0,
};

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
  options: { consent?: { product: ["analytics"] }; timeout?: number } = {},
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

const getLoggedNotes = (fake: FakeFirebase) =>
  fake.sdk.logEvent.mock.calls.map(([, , parameters]) => parameters?.["note"]);

const getThrown = (run: () => unknown) => {
  try {
    run();
  } catch (error) {
    return error;
  }

  return null;
};

test("creating the adapter calls nothing on the SDK", () => {
  const fake = fakeFirebase();

  firebase({ sdk: fake.sdk, analytics: fake.analytics, map: byName });

  expect(fake.sdk.logEvent.mock.calls).toEqual([]);
  expect(fake.sdk.setUserId.mock.calls).toEqual([]);
  expect(fake.sdk.setUserProperties.mock.calls).toEqual([]);
  expect(fake.sdk.setAnalyticsCollectionEnabled.mock.calls).toEqual([]);
  expect(fake.calls).toEqual(NO_LIFECYCLE_CALLS);
});

test("open calls nothing on the SDK, because Firebase holds what it is given until it has initialized", () => {
  const fake = fakeFirebase();

  open(fake);

  expect(fake.sdk.logEvent.mock.calls).toEqual([]);
  expect(fake.sdk.setUserId.mock.calls).toEqual([]);
  expect(fake.sdk.setUserProperties.mock.calls).toEqual([]);
  expect(fake.sdk.setAnalyticsCollectionEnabled.mock.calls).toEqual([]);
  expect(fake.calls).toEqual(NO_LIFECYCLE_CALLS);
});

test("the native handle is the analytics instance the application created", () => {
  const fake = fakeFirebase();

  expect(open(fake).native).toBe(fake.analytics);
});

test("a mapped event is logged under its GA4 name with its items first and the context under its parameters, submitted with the evidence the call proves", async () => {
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

  expect(fake.sdk.logEvent.mock.calls).toEqual([
    [
      fake.analytics,
      "begin_checkout",
      {
        items: [{ item_id: "sku_1", price: 49.5, quantity: 1 }],
        value: 49.5,
        currency: "EUR",
        app_version: "2.4.0",
        event_callback: expect.any(Function),
      },
    ],
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
  expect(fake.sdk.logEvent.mock.calls).toEqual([]);
});

test.each([
  "google_login",
  "firebase_sync",
  "ga_custom",
  "page_view",
  "Checkout",
  "подія",
  "x".repeat(40),
  "𠀀".repeat(40),
])("a mapped name GA4 accepts, %j, is logged as it is", async (name) => {
  const fake = fakeFirebase();

  const answer = await open(fake).track(
    createTrackedEvent({ name }),
    createContext(),
  );

  expect(fake.sdk.logEvent.mock.calls).toEqual([
    [fake.analytics, name, { event_callback: expect.any(Function) }],
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
  "𠀀".repeat(41),
  "query_id_lookup",
  "query_idx",
  "ad_impression",
  "app_remove",
  "app_store_refund",
  "error",
  "first_open",
  "first_visit",
  "in_app_purchase",
  "session_start",
  "user_engagement",
])(
  "a mapped name that breaks GA4's rules or is reserved, %j, is dropped as provider-filtered with an invalid name, never converted",
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
    expect(fake.sdk.logEvent.mock.calls).toEqual([]);
  },
);

test("a mapping that throws throws out of track, which Trace answers as failed, and sends nothing", () => {
  const fake = fakeFirebase();
  const error = new Error("the mapping is broken");

  const session = open(fake, () => {
    throw error;
  });

  expect(
    getThrown(() => session.track(createTrackedEvent(), createContext())),
  ).toBe(error);
  expect(fake.sdk.logEvent.mock.calls).toEqual([]);
});

test("an event Firebase refuses at once fails with that error and holds no identity change back", async () => {
  const fake = fakeFirebase({ hold: true });
  const session = open(fake);

  fake.state.deleted = true;

  const answer = await session.track(createTrackedEvent(), createContext());

  expect(answer).toEqual({
    status: "failed",
    error: new Error(
      "Firebase: Firebase App named '[DEFAULT]' already deleted (app/app-deleted).",
    ),
  });

  fake.state.deleted = false;

  expect(session.identify?.({ user: { id: "ada" } })).toBeUndefined();
  expect(fake.sdk.setUserId.mock.calls).toEqual([[fake.analytics, "ada"]]);
});

test("identify sets the user id at once while no event is being processed", () => {
  const fake = fakeFirebase();

  expect(open(fake).identify?.({ user: { id: "ada" } })).toBeUndefined();
  expect(fake.sdk.setUserId.mock.calls).toEqual([[fake.analytics, "ada"]]);
});

test("a user id longer than GA4's 256 characters is refused as UNSUPPORTED before Firebase sees it", () => {
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
  expect(fake.sdk.setUserId.mock.calls).toEqual([]);

  session.identify?.({ user: { id: "a".repeat(256) } });
  session.identify?.({ user: { id: "🙂".repeat(256) } });

  expect(fake.sdk.setUserId.mock.calls).toEqual([
    [fake.analytics, "a".repeat(256)],
    [fake.analytics, "🙂".repeat(256)],
  ]);
});

test("traits set user properties and a removal sends null", () => {
  const fake = fakeFirebase();

  expect(
    open(fake).traits?.({
      user: { id: "ada" },
      set: { plan: "pro", seats: 4 },
      remove: ["role"],
    }),
  ).toBeUndefined();
  expect(fake.sdk.setUserProperties.mock.calls).toEqual([
    [fake.analytics, { role: null, plan: "pro", seats: 4 }],
  ]);
});

test("a user property GA4 would ignore is left out, never cut, and the update is reported UNSUPPORTED once the rest reached Firebase", () => {
  const fake = fakeFirebase();
  const session = open(fake);

  expect(
    getThrown(() =>
      session.traits?.({
        user: { id: "ada" },
        set: {
          plan: "pro",
          bio: "b".repeat(37),
          customer_id: "c_1",
          nested: { a: 1 },
        },
        remove: [],
      }),
    ),
  ).toEqual(PARTIAL_TRAITS);
  expect(fake.sdk.setUserProperties.mock.calls).toEqual([
    [fake.analytics, { plan: "pro" }],
  ]);
});

test("an update with nothing Firebase can keep calls nothing and is reported UNSUPPORTED", () => {
  const fake = fakeFirebase();
  const session = open(fake);

  expect(
    getThrown(() =>
      session.traits?.({ user: null, set: { nested: { a: 1 } }, remove: [] }),
    ),
  ).toEqual(PARTIAL_TRAITS);
  expect(fake.sdk.setUserProperties.mock.calls).toEqual([]);
});

test("reset clears the user id and nulls every user property name the adapter ever sent, removed ones included", () => {
  const fake = fakeFirebase();
  const session = open(fake);

  session.traits?.({
    user: { id: "ada" },
    set: { plan: "pro", seats: 4 },
    remove: [],
  });
  session.traits?.({
    user: { id: "ada" },
    set: { role: "admin" },
    remove: ["seats", "legacy"],
  });
  session.identify?.({ user: { id: "ada" } });

  expect(session.reset?.()).toBeUndefined();
  expect(session.reset?.()).toBeUndefined();
  expect(fake.sdk.setUserId.mock.calls).toEqual([
    [fake.analytics, "ada"],
    [fake.analytics, null],
    [fake.analytics, null],
  ]);
  expect(fake.sdk.setUserProperties.mock.calls).toEqual([
    [fake.analytics, { plan: "pro", seats: 4 }],
    [fake.analytics, { seats: null, legacy: null, role: "admin" }],
    [fake.analytics, { plan: null, seats: null, legacy: null, role: null }],
  ]);
});

test("reset nulls the user properties an earlier session of the same adapter set", () => {
  const fake = fakeFirebase();

  const adapter = firebase({
    sdk: fake.sdk,
    analytics: fake.analytics,
    map: byName,
  });

  const first = adapter.open();

  first.traits?.({ user: null, set: { plan: "pro" }, remove: [] });
  first.dispose?.();
  adapter.open().reset?.();

  expect(fake.sdk.setUserProperties.mock.calls).toEqual([
    [fake.analytics, { plan: "pro" }],
    [fake.analytics, { plan: null }],
  ]);
});

test("the session has no group and no flush, because Firebase offers neither", () => {
  const session = open();

  expect(session.group).toBeUndefined();
  expect(session.flush).toBeUndefined();
});

test("an identity change waits until every event handed to Firebase before it was processed", async () => {
  const fake = fakeFirebase({ hold: true });
  const session = open(fake);

  session.track(createTrackedEvent({ name: "first" }), createContext());
  session.track(createTrackedEvent({ name: "second" }), createContext());

  const identified = session.identify?.({ user: { id: "bob" } });

  expect(identified).toBeInstanceOf(Promise);
  expect(fake.sdk.setUserId.mock.calls).toEqual([]);

  fake.callbacks[0]?.();

  expect(fake.sdk.setUserId.mock.calls).toEqual([]);

  fake.callbacks[1]?.();

  expect(fake.sdk.setUserId.mock.calls).toEqual([[fake.analytics, "bob"]]);
  await expect(identified).resolves.toBeUndefined();
});

test("a later identity change replaces the one still waiting, so only the latest reaches Firebase", async () => {
  const fake = fakeFirebase({ hold: true });
  const session = open(fake);

  session.track(createTrackedEvent(), createContext());

  const stale = session.identify?.({ user: { id: "bob" } });
  const latest = session.reset?.();

  await expect(stale).rejects.toEqual(WITHDRAWN);
  expect(fake.sdk.setUserId.mock.calls).toEqual([]);

  fake.callbacks[0]?.();

  await expect(latest).resolves.toBeUndefined();
  expect(fake.sdk.setUserId.mock.calls).toEqual([[fake.analytics, null]]);
});

test("the sessions of one adapter share one slot, so a change from the second withdraws the first's waiting change", async () => {
  const fake = fakeFirebase({ hold: true });

  const adapter = firebase({
    sdk: fake.sdk,
    analytics: fake.analytics,
    map: byName,
  });

  const first = adapter.open();
  const second = adapter.open();

  first.track(createTrackedEvent(), createContext());

  const identified = first.identify?.({ user: { id: "ada" } });

  const traits = second.traits?.({
    user: null,
    set: { plan: "pro" },
    remove: [],
  });

  await expect(identified).rejects.toEqual(WITHDRAWN);

  fake.callbacks[0]?.();

  await expect(traits).resolves.toBeUndefined();
  expect(fake.sdk.setUserId.mock.calls).toEqual([]);
  expect(fake.sdk.setUserProperties.mock.calls).toEqual([
    [fake.analytics, { plan: "pro" }],
  ]);
});

test("closing collection withdraws a waiting identity change, which a late callback no longer applies", async () => {
  const fake = fakeFirebase({ hold: true });
  const session = open(fake);

  session.track(createTrackedEvent(), createContext());

  const waiting = session.identify?.({ user: { id: "bob" } });

  session.collection?.(false);

  await expect(waiting).rejects.toEqual(WITHDRAWN);

  fake.callbacks[0]?.();

  expect(fake.sdk.setUserId.mock.calls).toEqual([]);
  expect(fake.sdk.setAnalyticsCollectionEnabled.mock.calls).toEqual([
    [fake.analytics, false],
  ]);
});

test("disposing withdraws a waiting identity change", async () => {
  const fake = fakeFirebase({ hold: true });
  const session = open(fake);

  session.track(createTrackedEvent(), createContext());

  const waiting = session.traits?.({
    user: null,
    set: { plan: "pro" },
    remove: [],
  });

  await session.dispose?.();
  await expect(waiting).rejects.toEqual(WITHDRAWN);

  fake.callbacks[0]?.();

  expect(fake.sdk.setUserProperties.mock.calls).toEqual([]);
});

test("a session opened after another was disposed still waits for the events the first handed to Firebase", async () => {
  const fake = fakeFirebase({ hold: true });

  const adapter = firebase({
    sdk: fake.sdk,
    analytics: fake.analytics,
    map: byName,
  });

  const first = adapter.open();

  first.track(createTrackedEvent(), createContext());
  await first.dispose?.();

  const waiting = adapter.open().identify?.({ user: { id: "bob" } });

  expect(fake.sdk.setUserId.mock.calls).toEqual([]);

  fake.callbacks[0]?.();

  await expect(waiting).resolves.toBeUndefined();
  expect(fake.sdk.setUserId.mock.calls).toEqual([[fake.analytics, "bob"]]);
});

test("an SDK throw while a waiting identity change is applied rejects it and never reaches gtag's callback", async () => {
  const fake = fakeFirebase({ hold: true });
  const session = open(fake);

  session.track(createTrackedEvent(), createContext());

  const waiting = session.identify?.({ user: { id: "bob" } });

  fake.state.deleted = true;

  expect(() => fake.callbacks[0]?.()).not.toThrow();
  await expect(waiting).rejects.toEqual(
    new Error(
      "Firebase: Firebase App named '[DEFAULT]' already deleted (app/app-deleted).",
    ),
  );
});

test("an event that was filtered, dropped or thrown by its mapping holds no identity change back", () => {
  const fake = fakeFirebase({ hold: true });

  const session = open(fake, ({ name }) => {
    if (name === "Broken") {
      throw new Error("the mapping is broken");
    }

    return name === "Filtered" ? null : { name, parameters: {} };
  });

  session.track(createTrackedEvent({ name: "Filtered" }), createContext());
  session.track(createTrackedEvent({ name: "1st Purchase" }), createContext());
  getThrown(() =>
    session.track(createTrackedEvent({ name: "Broken" }), createContext()),
  );

  expect(session.identify?.({ user: { id: "ada" } })).toBeUndefined();
  expect(fake.sdk.setUserId.mock.calls).toEqual([[fake.analytics, "ada"]]);
});

test("collection switches Firebase's own collection both ways, right after open", () => {
  const fake = fakeFirebase();
  const session = open(fake);

  session.collection?.(false);
  session.collection?.(true);

  expect(fake.sdk.setAnalyticsCollectionEnabled.mock.calls).toEqual([
    [fake.analytics, false],
    [fake.analytics, true],
  ]);
});

test("through Trace, a user switch waits until Firebase has processed the earlier user's event, then resets between the users", async () => {
  const fake = fakeFirebase({ hold: true });
  const trace = createTrace(fake);

  trace.start();
  trace.user({ id: "ada", traits: { plan: "pro" } });

  const first = trace.track("Note Added", { note: "ada" });

  trace.user({ id: "bob" });

  const second = trace.track("Note Added", { note: "bob" });

  expect(await first.settled).toEqual({
    state: "settled",
    outcomes: SUBMITTED,
  });
  expect(fake.sdk.setUserId.mock.calls).toEqual([[fake.analytics, "ada"]]);
  expect(getLoggedNotes(fake)).toEqual(["ada"]);

  fake.callbacks[0]?.();

  expect(await second.settled).toEqual({
    state: "settled",
    outcomes: SUBMITTED,
  });
  expect(fake.sdk.setUserId.mock.calls).toEqual([
    [fake.analytics, "ada"],
    [fake.analytics, null],
    [fake.analytics, "bob"],
  ]);
  expect(fake.sdk.setUserProperties.mock.calls).toEqual([
    [fake.analytics, { plan: "pro" }],
    [fake.analytics, { plan: null }],
  ]);
  expect(getLoggedNotes(fake)).toEqual(["ada", "bob"]);
});

test("through Trace, while Firebase never calls back, each identity change times out, and the event that needed one is skipped as identity-failed, never logged under the previous user", async () => {
  vi.useFakeTimers();

  const fake = fakeFirebase({ hold: true });
  const trace = createTrace(fake, { timeout: 1_000 });
  const steps = watchIdentitySteps(trace);

  trace.start();
  trace.user({ id: "ada" });
  trace.track("Note Added", { note: "ada" });
  trace.user({ id: "bob" });

  const second = trace.track("Note Added", { note: "bob" });

  await vi.advanceTimersByTimeAsync(2_000);

  expect(await second.settled).toEqual({
    state: "settled",
    outcomes: { product: { status: "skipped", reason: "identity-failed" } },
  });
  expect(steps).toEqual([
    {
      type: "identity step failed",
      context: { step: "reset", reason: "timeout" },
    },
    {
      type: "identity step failed",
      context: { step: "reset", reason: "timeout" },
    },
  ]);
  expect(fake.sdk.setUserId.mock.calls).toEqual([[fake.analytics, "ada"]]);
  expect(getLoggedNotes(fake)).toEqual(["ada"]);
});

test("through Trace, the event after a timeout starts over from a reset that replaces the timed-out change, and is logged under the current user", async () => {
  vi.useFakeTimers();

  const fake = fakeFirebase({ hold: true });
  const trace = createTrace(fake, { timeout: 1_000 });

  trace.start();
  trace.user({ id: "ada" });
  trace.track("Note Added", { note: "ada" });
  trace.user({ id: "bob" });

  const skipped = trace.track("Note Added", { note: "bob" });

  await vi.advanceTimersByTimeAsync(2_000);
  await skipped.settled;

  const third = trace.track("Note Added", { note: "bob again" });

  fake.callbacks[0]?.();

  expect(await third.settled).toEqual({
    state: "settled",
    outcomes: SUBMITTED,
  });
  expect(fake.sdk.setUserId.mock.calls).toEqual([
    [fake.analytics, "ada"],
    [fake.analytics, null],
    [fake.analytics, "bob"],
  ]);
  expect(getLoggedNotes(fake)).toEqual(["ada", "bob again"]);
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
  expect(fake.sdk.setUserId.mock.calls).toEqual([]);
  expect(getLoggedNotes(fake)).toEqual(["long id"]);
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
  expect(fake.sdk.setUserProperties.mock.calls).toEqual([
    [fake.analytics, { plan: "pro" }],
  ]);
});

test("through Trace, a gated destination whose purpose is still unknown opens with Firebase's collection off", () => {
  const fake = fakeFirebase();
  const trace = createTrace(fake, { consent: { product: ["analytics"] } });

  trace.start();

  expect(fake.sdk.setAnalyticsCollectionEnabled.mock.calls).toEqual([
    [fake.analytics, false],
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

  expect(fake.sdk.setAnalyticsCollectionEnabled.mock.calls).toEqual([
    [fake.analytics, true],
    [fake.analytics, false],
  ]);
  expect(granted).toEqual({ state: "settled", outcomes: SUBMITTED });
  expect(denied).toEqual({ state: "dropped", reason: "consent" });
  expect(getLoggedNotes(fake)).toEqual(["granted"]);
});

test("through Trace, withdrawing consent withdraws the identity change still waiting for Firebase, which is reported failed and never applied", async () => {
  const fake = fakeFirebase({ hold: true });
  const trace = createTrace(fake, { consent: { product: ["analytics"] } });

  const reported = new Promise((resolve) => {
    onTestFinished(
      trace.diagnostics.events.subscribe(({ type, context }) => {
        if (type.startsWith("identity step")) {
          resolve({ type, context });
        }
      }),
    );
  });

  trace.consent.set({ analytics: "granted" });
  trace.start();
  trace.user({ id: "ada" });

  const first = trace.track("Note Added", { note: "ada" });

  trace.user({ id: "bob" });

  const second = trace.track("Note Added", { note: "bob" });

  await first.settled;
  trace.consent.set({ analytics: "denied" });
  fake.callbacks[0]?.();

  expect(await second.settled).toEqual({
    state: "settled",
    outcomes: { product: { status: "dropped", reason: "consent" } },
  });
  expect(await reported).toEqual({
    type: "identity step failed",
    context: { step: "reset", reason: "error" },
  });
  expect(fake.sdk.setUserId.mock.calls).toEqual([[fake.analytics, "ada"]]);
  expect(fake.sdk.setAnalyticsCollectionEnabled.mock.calls).toEqual([
    [fake.analytics, true],
    [fake.analytics, false],
  ]);
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
  expect(fake.sdk.logEvent.mock.calls).toEqual([]);
});

test("through Trace, the native handle is the analytics instance once the destination is open, and null before", () => {
  const fake = fakeFirebase();
  const trace = createTrace(fake);

  expect(trace.destination("product").native).toBe(null);

  trace.start();

  expect(trace.destination("product").native).toBe(fake.analytics);
});

test("Trace never initializes or closes the SDK", async () => {
  const fake = fakeFirebase();
  const trace = createTrace(fake, { consent: { product: ["analytics"] } });

  trace.consent.set({ analytics: "granted" });
  trace.start();
  trace.user({ id: "ada", traits: { plan: "pro" } });
  await trace.track("Note Added", { note: "all of it" }).settled;
  trace.user(null);
  await trace.flush();
  trace.consent.set({ analytics: "denied" });
  trace.dispose();

  expect(fake.calls).toEqual(NO_LIFECYCLE_CALLS);
});
