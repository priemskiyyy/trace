import { event, Trace } from "@priemskiyyy/trace";
import type { MappingLoss, TrackedEvent } from "@priemskiyyy/trace";
import { afterEach, expect, onTestFinished, test } from "vitest";

import { fakeGtag } from "src/fakeGtag.fixture";
import { ga4 } from "src/ga4";
import { googleAnalytics } from "src/googleAnalytics";
import { createTrackedEvent } from "src/trackedEvent.fixture";
import type { Ga4EventMap } from "src/types/Ga4EventMap";

type FakeGtag = ReturnType<typeof fakeGtag>;

const MEASUREMENT = { id: "G-TRACE12345" };

const COLLECTION_SWITCH = `ga-disable-${MEASUREMENT.id}`;

const TIMESTAMP = 1_767_225_600_000;

const TIMESTAMP_LOSS: MappingLoss = {
  path: "timestamp",
  reason: "unsupported",
};

const PARTIAL_TRAITS = expect.objectContaining({
  name: "TraceError",
  code: "UNSUPPORTED",
  message:
    "Google Analytics cannot keep every user property in this update; the others were set.",
});

const SUBMITTED = {
  web: {
    status: "submitted",
    evidence: "sdk-call-returned",
    event: null,
    losses: [TIMESTAMP_LOSS],
  },
};

afterEach(() => {
  Reflect.deleteProperty(globalThis, COLLECTION_SWITCH);
});

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

const getCollectionSwitch = (): unknown =>
  Reflect.get(globalThis, COLLECTION_SWITCH);

const createContext = () => ({
  signal: new AbortController().signal,
  currentGeneration: () => 1,
  now: () => TIMESTAMP,
});

const open = (fake: FakeGtag = fakeGtag(), eventMap = byName) =>
  googleAnalytics({
    sdk: fake.sdk,
    measurement: MEASUREMENT,
    map: eventMap,
  }).open();

const createTrace = (
  fake: FakeGtag,
  options: { consent?: { web: ["analytics"] } } = {},
  eventMap: Ga4EventMap = map,
) => {
  const trace = new Trace({
    events,
    destinations: {
      web: googleAnalytics({
        sdk: fake.sdk,
        measurement: MEASUREMENT,
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

const getSentNotes = (fake: FakeGtag) =>
  fake.sent.map(({ parameters, user, properties }) => ({
    note: parameters["note"],
    user,
    properties,
  }));

const getThrown = (run: () => unknown) => {
  try {
    run();
  } catch (error) {
    return error;
  }

  return null;
};

test("creating the adapter sends nothing to gtag", () => {
  const fake = fakeGtag();

  googleAnalytics({ sdk: fake.sdk, measurement: MEASUREMENT, map: byName });

  expect(fake.dataLayer).toEqual([]);
  expect(getCollectionSwitch()).toBeUndefined();
});

test("open sends nothing to gtag, because gtag queues every command until gtag.js has loaded", () => {
  const fake = fakeGtag();

  open(fake);

  expect(fake.dataLayer).toEqual([]);
  expect(getCollectionSwitch()).toBeUndefined();
});

test("the native handle is the gtag function the application defined", () => {
  const fake = fakeGtag();

  expect(open(fake).native).toBe(fake.sdk);
});

test("a mapped event is sent to the measurement under its GA4 name with its items first and the context under its parameters, submitted with the evidence the call proves", async () => {
  const fake = fakeGtag();

  const answer = await open(fake, map).track(
    createTrackedEvent({
      name: "Checkout Started",
      properties: {
        total: 49.5,
        currency: "EUR",
        lines: [{ sku: "sku_1", price: 49.5, quantity: 1 }],
      },
      context: {
        app_version: "2.4.0",
        currency: "USD",
        app: { build: 7 },
        client_id: "555.555",
      },
    }),
    createContext(),
  );

  expect(fake.dataLayer).toEqual([
    [
      "event",
      "begin_checkout",
      {
        items: [{ item_id: "sku_1", price: 49.5, quantity: 1 }],
        value: 49.5,
        currency: "EUR",
        app_version: "2.4.0",
        send_to: MEASUREMENT.id,
      },
    ],
  ]);
  expect(answer).toEqual({
    status: "submitted",
    evidence: "sdk-call-returned",
    losses: [
      { path: "context.currency", reason: "omitted" },
      { path: "context.app", reason: "unsupported" },
      { path: "context.client_id", reason: "omitted" },
      TIMESTAMP_LOSS,
    ],
  });
});

test("the map receives the frozen event every destination sees", async () => {
  const seen: TrackedEvent[] = [];
  const tracked = createTrackedEvent();

  await open(fakeGtag(), (received) => {
    seen.push(received);

    return null;
  }).track(tracked, createContext());

  expect(seen).toHaveLength(1);
  expect(seen[0]).toBe(tracked);
});

test("a mapping that answers null keeps the event from Google Analytics as provider-filtered", async () => {
  const fake = fakeGtag();

  const answer = await open(fake, map).track(
    createTrackedEvent({ name: "Internal Ping" }),
    createContext(),
  );

  expect(answer).toEqual({ status: "dropped", reason: "provider-filtered" });
  expect(fake.dataLayer).toEqual([]);
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
])("a mapped name GA4 accepts, %j, is sent as it is", async (name) => {
  const fake = fakeGtag();

  const answer = await open(fake).track(
    createTrackedEvent({ name }),
    createContext(),
  );

  expect(fake.dataLayer).toEqual([
    ["event", name, { send_to: MEASUREMENT.id }],
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
    const fake = fakeGtag();

    const answer = await open(fake).track(
      createTrackedEvent({ name }),
      createContext(),
    );

    expect(answer).toEqual({
      status: "dropped",
      reason: "provider-filtered",
      losses: [{ path: "name", reason: "invalid" }],
    });
    expect(fake.dataLayer).toEqual([]);
  },
);

test("a mapping that throws throws out of track, which Trace answers as failed, and sends nothing", () => {
  const fake = fakeGtag();
  const error = new Error("the mapping is broken");

  const session = open(fake, () => {
    throw error;
  });

  expect(
    getThrown(() => session.track(createTrackedEvent(), createContext())),
  ).toBe(error);
  expect(fake.dataLayer).toEqual([]);
});

test("items on an event outside GA4's ecommerce events never reach gtag and are reported unsupported, because gtag.js drops them silently", async () => {
  const fake = fakeGtag();

  const answer = await open(fake, () => ({
    name: "select_content",
    parameters: { content_type: "product" },
    items: [{ item_id: "sku_1" }],
  })).track(createTrackedEvent(), createContext());

  expect(fake.dataLayer).toEqual([
    [
      "event",
      "select_content",
      { content_type: "product", send_to: MEASUREMENT.id },
    ],
  ]);
  expect(answer).toEqual({
    status: "submitted",
    evidence: "sdk-call-returned",
    losses: [{ path: "items", reason: "unsupported" }, TIMESTAMP_LOSS],
  });
});

test("identify sets the user id of the measurement at once, without another page view", () => {
  const fake = fakeGtag();

  expect(open(fake).identify?.({ user: { id: "ada" } })).toBeUndefined();
  expect(fake.dataLayer).toEqual([
    [
      "config",
      MEASUREMENT.id,
      { update: true, send_page_view: false, user_id: "ada" },
    ],
  ]);
});

test("only the first identity config carries send_page_view: false, so no config of the adapter ever adds a page_view", () => {
  const fake = fakeGtag();
  const session = open(fake);

  session.identify?.({ user: { id: "ada" } });
  session.traits?.({ user: { id: "ada" }, set: { plan: "pro" }, remove: [] });
  session.reset?.();

  expect(fake.dataLayer).toEqual([
    [
      "config",
      MEASUREMENT.id,
      { update: true, send_page_view: false, user_id: "ada" },
    ],
    [
      "config",
      MEASUREMENT.id,
      { update: true, user_properties: { plan: "pro" } },
    ],
    ["config", MEASUREMENT.id, { update: true, user_id: null }],
    [
      "config",
      MEASUREMENT.id,
      { update: true, user_properties: { plan: null } },
    ],
  ]);
});

test("a user id longer than GA4's 256 characters is refused as UNSUPPORTED before gtag sees it", () => {
  const fake = fakeGtag();
  const session = open(fake);

  expect(
    getThrown(() => session.identify?.({ user: { id: "a".repeat(257) } })),
  ).toEqual(
    expect.objectContaining({
      name: "TraceError",
      code: "UNSUPPORTED",
      message: "Google Analytics keeps user ids of at most 256 characters.",
    }),
  );
  expect(fake.dataLayer).toEqual([]);

  session.identify?.({ user: { id: "a".repeat(256) } });
  session.identify?.({ user: { id: "🙂".repeat(256) } });

  expect(fake.dataLayer).toEqual([
    [
      "config",
      MEASUREMENT.id,
      { update: true, send_page_view: false, user_id: "a".repeat(256) },
    ],
    ["config", MEASUREMENT.id, { update: true, user_id: "🙂".repeat(256) }],
  ]);
});

test("an identity change right after an event reaches gtag at once and never that event, because gtag.js applies commands in the order they arrive", async () => {
  const fake = fakeGtag();
  const session = open(fake);

  session.identify?.({ user: { id: "ada" } });
  await session.track(createTrackedEvent({ name: "first" }), createContext());

  expect(session.identify?.({ user: { id: "bob" } })).toBeUndefined();

  await session.track(createTrackedEvent({ name: "second" }), createContext());

  expect(fake.sent.map(({ name, user }) => ({ name, user }))).toEqual([
    { name: "first", user: "ada" },
    { name: "second", user: "bob" },
  ]);
});

test("traits set user properties on the measurement and a removal sends null", () => {
  const fake = fakeGtag();

  expect(
    open(fake).traits?.({
      user: { id: "ada" },
      set: { plan: "pro", seats: 4 },
      remove: ["role"],
    }),
  ).toBeUndefined();
  expect(fake.dataLayer).toEqual([
    [
      "config",
      MEASUREMENT.id,
      {
        update: true,
        send_page_view: false,
        user_properties: { role: null, plan: "pro", seats: 4 },
      },
    ],
  ]);
});

test("a user property GA4 would ignore is left out, never cut, and the update is reported UNSUPPORTED once the rest reached gtag", () => {
  const fake = fakeGtag();
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
  expect(fake.dataLayer).toEqual([
    [
      "config",
      MEASUREMENT.id,
      { update: true, send_page_view: false, user_properties: { plan: "pro" } },
    ],
  ]);
});

test("an update with nothing GA4 can keep sends nothing and is reported UNSUPPORTED", () => {
  const fake = fakeGtag();
  const session = open(fake);

  expect(
    getThrown(() =>
      session.traits?.({ user: null, set: { nested: { a: 1 } }, remove: [] }),
    ),
  ).toEqual(PARTIAL_TRAITS);
  expect(fake.dataLayer).toEqual([]);
});

test("reset clears the user id and nulls every user property name the adapter ever sent, removed ones included", () => {
  const fake = fakeGtag();
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

  expect(session.reset?.()).toBeUndefined();
  expect(session.reset?.()).toBeUndefined();
  expect(fake.dataLayer.slice(2)).toEqual([
    ["config", MEASUREMENT.id, { update: true, user_id: null }],
    [
      "config",
      MEASUREMENT.id,
      {
        update: true,
        user_properties: { plan: null, seats: null, legacy: null, role: null },
      },
    ],
    ["config", MEASUREMENT.id, { update: true, user_id: null }],
  ]);
});

test("reset nulls the user properties an earlier session of the same adapter set", () => {
  const fake = fakeGtag();

  const adapter = googleAnalytics({
    sdk: fake.sdk,
    measurement: MEASUREMENT,
    map: byName,
  });

  adapter.open().traits?.({ user: null, set: { plan: "pro" }, remove: [] });
  adapter.open().reset?.();

  expect(fake.dataLayer).toEqual([
    [
      "config",
      MEASUREMENT.id,
      { update: true, send_page_view: false, user_properties: { plan: "pro" } },
    ],
    ["config", MEASUREMENT.id, { update: true, user_id: null }],
    [
      "config",
      MEASUREMENT.id,
      { update: true, user_properties: { plan: null } },
    ],
  ]);
});

test("the measurement id is read once, so changing the options afterwards moves nothing to another measurement", async () => {
  const fake = fakeGtag();
  const measurement = { id: MEASUREMENT.id };

  const adapter = googleAnalytics({
    sdk: fake.sdk,
    measurement,
    map: byName,
  });

  measurement.id = "G-SECOND67890";

  const session = adapter.open();

  session.identify?.({ user: { id: "ada" } });
  await session.track(
    createTrackedEvent({ name: "after_change" }),
    createContext(),
  );
  session.collection?.(false);

  expect(fake.dataLayer).toEqual([
    [
      "config",
      MEASUREMENT.id,
      { update: true, send_page_view: false, user_id: "ada" },
    ],
    ["event", "after_change", { send_to: MEASUREMENT.id }],
  ]);
  expect(getCollectionSwitch()).toBe(true);
  expect(Object.hasOwn(globalThis, "ga-disable-G-SECOND67890")).toBe(false);
});

test("the session has no group, no flush and no dispose, because gtag offers none of them", () => {
  const session = open();

  expect(session.group).toBeUndefined();
  expect(session.flush).toBeUndefined();
  expect(session.dispose).toBeUndefined();
});

test("collection flips gtag.js's ga-disable switch for the measurement both ways, and sends no command", () => {
  const fake = fakeGtag();
  const session = open(fake);

  expect(session.collection?.(false)).toBeUndefined();
  expect(getCollectionSwitch()).toBe(true);
  expect(session.collection?.(true)).toBeUndefined();
  expect(getCollectionSwitch()).toBe(false);
  expect(fake.dataLayer).toEqual([]);
});

test("through Trace, a user switch sends each event under the user it was tracked for, with a reset between the users", async () => {
  const fake = fakeGtag();
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
  expect(await second.settled).toEqual({
    state: "settled",
    outcomes: SUBMITTED,
  });
  expect(fake.dataLayer).toEqual([
    [
      "config",
      MEASUREMENT.id,
      { update: true, send_page_view: false, user_id: "ada" },
    ],
    [
      "config",
      MEASUREMENT.id,
      { update: true, user_properties: { plan: "pro" } },
    ],
    ["event", "note_added", { note: "ada", send_to: MEASUREMENT.id }],
    ["config", MEASUREMENT.id, { update: true, user_id: null }],
    [
      "config",
      MEASUREMENT.id,
      { update: true, user_properties: { plan: null } },
    ],
    ["config", MEASUREMENT.id, { update: true, user_id: "bob" }],
    ["event", "note_added", { note: "bob", send_to: MEASUREMENT.id }],
  ]);
  expect(getSentNotes(fake)).toEqual([
    { note: "ada", user: "ada", properties: { plan: "pro" } },
    { note: "bob", user: "bob", properties: {} },
  ]);
});

test("through Trace, a sign-out sends the next event with no user id and none of the previous user's properties", async () => {
  const fake = fakeGtag();
  const trace = createTrace(fake);

  trace.start();
  trace.user({ id: "ada", traits: { plan: "pro" } });
  trace.track("Note Added", { note: "signed in" });
  trace.user(null);

  expect(
    await trace.track("Note Added", { note: "signed out" }).settled,
  ).toEqual({ state: "settled", outcomes: SUBMITTED });
  expect(getSentNotes(fake)).toEqual([
    { note: "signed in", user: "ada", properties: { plan: "pro" } },
    { note: "signed out", user: null, properties: {} },
  ]);
});

test("through Trace, a user id longer than GA4 keeps is an identity step unsupported, and the event goes without a user id", async () => {
  const fake = fakeGtag();
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
  expect(getSentNotes(fake)).toEqual([
    { note: "long id", user: null, properties: {} },
  ]);
});

test("through Trace, a trait GA4 would ignore is an identity step unsupported, the rest is set and the events keep flowing", async () => {
  const fake = fakeGtag();
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
  expect(getSentNotes(fake)).toEqual([
    { note: "after", user: "ada", properties: { plan: "pro" } },
  ]);
});

test("through Trace, a gated destination whose purpose is still unknown opens with gtag.js's collection off", () => {
  const fake = fakeGtag();
  const trace = createTrace(fake, { consent: { web: ["analytics"] } });

  trace.start();

  expect(getCollectionSwitch()).toBe(true);
  expect(fake.dataLayer).toEqual([]);
});

test("through Trace, a gated destination whose purpose is already granted opens with collection on", () => {
  const fake = fakeGtag();
  const trace = createTrace(fake, { consent: { web: ["analytics"] } });

  trace.consent.set({ analytics: "granted" });
  trace.start();

  expect(getCollectionSwitch()).toBe(false);
});

test("through Trace, granting consent turns collection on and withdrawing it turns collection off, and nothing is sent meanwhile", async () => {
  const fake = fakeGtag();
  const trace = createTrace(fake, { consent: { web: ["analytics"] } });

  trace.start();

  expect(getCollectionSwitch()).toBe(true);

  trace.consent.set({ analytics: "granted" });

  expect(getCollectionSwitch()).toBe(false);

  const granted = await trace.track("Note Added", { note: "granted" }).settled;

  trace.consent.set({ analytics: "denied" });

  expect(getCollectionSwitch()).toBe(true);

  const denied = await trace.track("Note Added", { note: "denied" }).settled;

  expect(granted).toEqual({ state: "settled", outcomes: SUBMITTED });
  expect(denied).toEqual({ state: "dropped", reason: "consent" });
  expect(getSentNotes(fake)).toEqual([
    { note: "granted", user: null, properties: {} },
  ]);
});

test("through Trace, a destination consent does not name never touches the switch", async () => {
  const fake = fakeGtag();
  const trace = createTrace(fake);

  trace.start();
  await trace.track("Note Added", { note: "ungated" }).settled;

  expect(getCollectionSwitch()).toBeUndefined();
});

test("through Trace, a mapping that throws fails the event with its error", async () => {
  const fake = fakeGtag();
  const error = new Error("the mapping is broken");

  const trace = createTrace(fake, {}, () => {
    throw error;
  });

  trace.start();

  expect(await trace.track("Note Added", { note: "x" }).settled).toEqual({
    state: "settled",
    outcomes: { web: { status: "failed", error } },
  });
  expect(fake.dataLayer).toEqual([]);
});

test("through Trace, a gtag that throws fails the event with its error", async () => {
  const error = new TypeError("dataLayer.push is not a function");

  const trace = new Trace({
    events,
    destinations: {
      web: googleAnalytics({
        sdk: () => {
          throw error;
        },
        measurement: MEASUREMENT,
        map,
      }),
    },
  });

  onTestFinished(trace.dispose);
  trace.start();

  expect(await trace.track("Note Added", { note: "x" }).settled).toEqual({
    state: "settled",
    outcomes: { web: { status: "failed", error } },
  });
});

test("through Trace, the native handle is gtag once the destination is open, and null before", () => {
  const fake = fakeGtag();
  const trace = createTrace(fake);

  expect(trace.destination("web").native).toBe(null);

  trace.start();

  expect(trace.destination("web").native).toBe(fake.sdk);
});

test("Trace never initializes or closes the SDK", async () => {
  const fake = fakeGtag();
  const trace = createTrace(fake, { consent: { web: ["analytics"] } });

  trace.consent.set({ analytics: "granted" });
  trace.start();
  trace.user({ id: "ada", traits: { plan: "pro" } });
  await trace.track("Note Added", { note: "all of it" }).settled;
  trace.user(null);
  await trace.flush();
  trace.consent.set({ analytics: "denied" });
  trace.dispose();

  expect(fake.dataLayer).toEqual([
    [
      "config",
      MEASUREMENT.id,
      { update: true, send_page_view: false, user_id: "ada" },
    ],
    [
      "config",
      MEASUREMENT.id,
      { update: true, user_properties: { plan: "pro" } },
    ],
    ["event", "note_added", { note: "all of it", send_to: MEASUREMENT.id }],
    ["config", MEASUREMENT.id, { update: true, user_id: null }],
    [
      "config",
      MEASUREMENT.id,
      { update: true, user_properties: { plan: null } },
    ],
  ]);
});
