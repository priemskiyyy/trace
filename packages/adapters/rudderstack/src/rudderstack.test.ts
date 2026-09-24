import { event, Trace } from "@priemskiyyy/trace";
import type { TraceDiagnosticEvent } from "@priemskiyyy/trace";
import { expect, test } from "vitest";

import { fakeRudderStack } from "src/fakeRudderStack.fixture";
import { rudderstack } from "src/rudderstack";
import { createTrackedEvent } from "src/trackedEvent.fixture";
import { MAX_EVENT_SIZE } from "src/utils/constants/limits";

type FakeRudderStack = ReturnType<typeof fakeRudderStack>;

const TIMESTAMP = 1_767_225_600_000;
const ISO_TIMESTAMP = "2026-01-01T00:00:00.000Z";
const WORKSPACE = { type: "workspace" };

const GROUP_RESET = {
  entries: {
    userId: false,
    userTraits: false,
    groupId: true,
    groupTraits: true,
    sessionInfo: false,
    authToken: false,
  },
};

const UNSUPPORTED_TRAITS = expect.objectContaining({
  name: "TraceError",
  code: "UNSUPPORTED",
  message:
    "RudderStack keeps a removed trait on its profiles and merges an object or list trait into the one it holds, so neither was applied as asked; the rest of the update was sent.",
});

const createContext = () => ({
  signal: new AbortController().signal,
  currentGeneration: () => 1,
  now: () => TIMESTAMP,
});

const open = (
  fake: FakeRudderStack = fakeRudderStack(),
  options: { group?: { type: string } } = {},
) => rudderstack({ sdk: fake.sdk, ...options }).open();

const createTrace = (
  fake: FakeRudderStack,
  options: { group?: { type: string } } = {},
) =>
  new Trace({
    events: { "App Opened": event() },
    destinations: { rudderstack: rudderstack({ sdk: fake.sdk, ...options }) },
  });

const getThrown = (run: () => unknown) => {
  try {
    run();
  } catch (error) {
    return error;
  }

  return null;
};

const getMethods = ({ calls }: FakeRudderStack) =>
  calls.map(([method]) => method);

const getUnsupportedSteps = (diagnostics: TraceDiagnosticEvent[]) =>
  diagnostics.flatMap(({ type, context }) => {
    if (type !== "identity step unsupported") {
      return [];
    }

    return [context];
  });

const getPropertiesOfSize = (size: number) => {
  const overhead = JSON.stringify({
    event: "Checkout Started",
    properties: { text: "" },
  }).length;

  return { text: "x".repeat(size - overhead) };
};

test("creating the adapter calls nothing on the SDK", () => {
  const fake = fakeRudderStack({ loaded: false });

  rudderstack({ sdk: fake.sdk, group: WORKSPACE });

  expect(fake.calls).toStrictEqual([]);
});

test("open never refuses and calls nothing, because RudderStack holds every call made before it loads and sends it once loaded", () => {
  const fake = fakeRudderStack({ loaded: false });
  const session = open(fake);

  expect(fake.calls).toStrictEqual([]);
  expect(session.track(createTrackedEvent(), createContext())).toStrictEqual({
    status: "submitted",
    evidence: "sdk-call-returned",
    losses: [],
  });
  expect(fake.events).toStrictEqual([]);

  fake.sdk.load("write-key", "https://dataplane.example.test");

  expect(fake.events).toMatchObject([
    { type: "track", event: "Checkout Started" },
  ]);
});

test("an event is one track call with its name, its properties over its context and its time as the original timestamp, and no message id, which RudderStack makes itself", () => {
  const fake = fakeRudderStack();

  const answer = open(fake).track(
    createTrackedEvent({
      properties: { cart: { id: "cart_1" }, value: 49.5, currency: "EUR" },
      context: { currency: "USD", locale: "de" },
    }),
    createContext(),
  );

  expect(fake.calls).toStrictEqual([
    [
      "track",
      "Checkout Started",
      { cart: { id: "cart_1" }, value: 49.5, currency: "EUR", locale: "de" },
      { originalTimestamp: ISO_TIMESTAMP },
    ],
  ]);
  expect(answer).toStrictEqual({
    status: "submitted",
    evidence: "sdk-call-returned",
    losses: [{ path: "context.currency", reason: "omitted" }],
  });
});

test("a reserved name and a null member are reported on the answer, and the null never reaches the wire", () => {
  const fake = fakeRudderStack();

  const answer = open(fake).track(
    createTrackedEvent({
      properties: { id: "p_1", coupon: null, value: 1 },
    }),
    createContext(),
  );

  expect(answer).toStrictEqual({
    status: "submitted",
    evidence: "sdk-call-returned",
    losses: [
      { path: "properties.id", reason: "invalid" },
      { path: "properties.coupon", reason: "unsupported" },
    ],
  });
  expect(fake.events).toMatchObject([{ properties: { value: 1 } }]);
});

test("an event at RudderStack's 32 KB limit is sent, and one byte more is dropped as provider-filtered without reaching RudderStack", () => {
  const fake = fakeRudderStack();
  const session = open(fake);
  const fits = getPropertiesOfSize(MAX_EVENT_SIZE);
  const over = getPropertiesOfSize(MAX_EVENT_SIZE + 1);

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
    ["track", "Checkout Started", fits, { originalTimestamp: ISO_TIMESTAMP }],
  ]);
});

test("the size counts UTF-8 bytes, so text of fewer than 32,768 characters can still pass the limit", () => {
  const fake = fakeRudderStack();

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

test("null members, which RudderStack leaves out, do not count toward its 32 KB, so an event that fits without them is sent", () => {
  const fake = fakeRudderStack();
  const properties = { ...getPropertiesOfSize(MAX_EVENT_SIZE), padding: null };

  expect(
    open(fake).track(createTrackedEvent({ properties }), createContext()),
  ).toStrictEqual({
    status: "submitted",
    evidence: "sdk-call-returned",
    losses: [{ path: "properties.padding", reason: "unsupported" }],
  });
  expect(getMethods(fake)).toStrictEqual(["track"]);
});

test("losses follow the event's shape: each property's first, then the context's, then the whole event's size last", () => {
  const answer = open().track(
    createTrackedEvent({
      properties: {
        plan: "pro",
        id: "p_1",
        ...getPropertiesOfSize(MAX_EVENT_SIZE + 100),
      },
      context: { plan: "free" },
    }),
    createContext(),
  );

  expect(answer).toStrictEqual({
    status: "dropped",
    reason: "provider-filtered",
    losses: [
      { path: "properties.id", reason: "invalid" },
      { path: "context.plan", reason: "omitted" },
      { path: "properties", reason: "invalid" },
    ],
  });
});

test("identify moves RudderStack to the user with an empty trait set, so the traits it holds are kept", () => {
  const fake = fakeRudderStack();
  const session = open(fake);

  session.traits?.({ user: null, set: { plan: "pro" }, remove: [] });

  expect(session.identify?.({ user: { id: "ada" } })).toBeUndefined();
  expect(fake.calls).toStrictEqual([
    ["identify", { plan: "pro" }],
    ["identify", "ada", {}],
  ]);
  expect(fake.state).toMatchObject({
    userId: "ada",
    userTraits: { plan: "pro" },
  });
});

test("traits reach RudderStack for the user it holds", () => {
  const fake = fakeRudderStack();

  expect(
    open(fake).traits?.({
      user: { id: "ada" },
      set: { plan: "pro", seats: 4 },
      remove: [],
    }),
  ).toBeUndefined();
  expect(fake.calls).toStrictEqual([["identify", { plan: "pro", seats: 4 }]]);
});

test("a removed trait is sent as null, which RudderStack leaves out, so the update is reported unsupported once the rest was sent", () => {
  const fake = fakeRudderStack();
  const session = open(fake);

  session.traits?.({
    user: null,
    set: { plan: "pro", role: "admin" },
    remove: [],
  });

  expect(
    getThrown(() =>
      session.traits?.({ user: null, set: { seats: 4 }, remove: ["role"] }),
    ),
  ).toStrictEqual(UNSUPPORTED_TRAITS);
  expect(fake.calls[1]).toStrictEqual(["identify", { role: null, seats: 4 }]);
  expect(fake.events.at(-1)).toStrictEqual(
    expect.objectContaining({ context: { traits: { plan: "pro", seats: 4 } } }),
  );
});

test("an object or list trait is left out, because RudderStack would merge it into the value it holds, and the update is reported unsupported once the rest was sent", () => {
  const fake = fakeRudderStack();

  expect(
    getThrown(() =>
      open(fake).traits?.({
        user: null,
        set: { plan: "pro", address: { city: "Kyiv" }, tags: ["new"] },
        remove: [],
      }),
    ),
  ).toStrictEqual(UNSUPPORTED_TRAITS);
  expect(fake.calls).toStrictEqual([["identify", { plan: "pro" }]]);
  expect(fake.state.userTraits).toStrictEqual({ plan: "pro" });
});

test("an update with nothing RudderStack can take calls nothing and is reported unsupported", () => {
  const fake = fakeRudderStack();

  expect(
    getThrown(() =>
      open(fake).traits?.({
        user: null,
        set: { address: { city: "Kyiv" } },
        remove: [],
      }),
    ),
  ).toStrictEqual(UNSUPPORTED_TRAITS);
  expect(fake.calls).toStrictEqual([]);
});

test("a membership of the configured type clears RudderStack's group, then sends the membership with its traits", () => {
  const fake = fakeRudderStack();

  expect(
    open(fake, { group: WORKSPACE }).group?.({
      user: { id: "ada" },
      group: { type: "workspace", id: "w_1", traits: { tier: "enterprise" } },
    }),
  ).toBeUndefined();
  expect(fake.calls).toStrictEqual([
    ["reset", GROUP_RESET],
    ["group", "w_1", { tier: "enterprise" }],
  ]);
});

test("a new group carries only its own traits, because RudderStack would merge in the traits of the group before", () => {
  const fake = fakeRudderStack();
  const session = open(fake, { group: WORKSPACE });

  session.group?.({
    user: { id: "ada" },
    group: { type: "workspace", id: "w_1", traits: { tier: "enterprise" } },
  });
  session.group?.({
    user: { id: "ada" },
    group: { type: "workspace", id: "w_2", traits: { seats: 3 } },
  });

  expect(fake.events).toMatchObject([
    { type: "group", groupId: "w_1", traits: { tier: "enterprise" } },
    { type: "group", groupId: "w_2", traits: { seats: 3 } },
  ]);
  expect(fake.state.groupTraits).toStrictEqual({ seats: 3 });
});

test("a removed group trait is sent as null, which RudderStack leaves out, so the update is reported unsupported once the rest was sent", () => {
  const fake = fakeRudderStack();

  expect(
    getThrown(() =>
      open(fake, { group: WORKSPACE }).group?.({
        user: { id: "ada" },
        group: {
          type: "workspace",
          id: "w_1",
          traits: { tier: null, seats: 3 },
        },
      }),
    ),
  ).toStrictEqual(
    expect.objectContaining({
      name: "TraceError",
      code: "UNSUPPORTED",
      message:
        "RudderStack leaves out every null it sends, so a removed group trait stays on the group; the rest of the update was sent.",
    }),
  );
  expect(fake.events).toMatchObject([
    { type: "group", groupId: "w_1", traits: { seats: 3 } },
  ]);
});

test("a membership of another type is refused as unsupported and sends nothing", () => {
  const fake = fakeRudderStack();
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
        'RudderStack keeps one group, and this destination sends only the "workspace" type.',
    }),
  );
  expect(fake.calls).toStrictEqual([]);
});

test("leaving the group is refused as unsupported and sends nothing, because RudderStack has no call to leave one", () => {
  const fake = fakeRudderStack();
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
      message: "RudderStack has no call to leave a group.",
    }),
  );
  expect(fake.calls).toStrictEqual([]);
});

test("without a group type the session has no group method", () => {
  expect(open().group).toBeUndefined();
});

test("reset clears RudderStack's user, traits and group, and its anonymous id too", () => {
  const fake = fakeRudderStack();
  const session = open(fake, { group: WORKSPACE });

  session.identify?.({ user: { id: "ada" } });
  session.group?.({
    user: { id: "ada" },
    group: { type: "workspace", id: "w_1", traits: { tier: "enterprise" } },
  });

  expect(session.reset?.()).toBeUndefined();
  expect(fake.calls.at(-1)).toStrictEqual([
    "reset",
    { entries: { anonymousId: true } },
  ]);
  expect(fake.state).toStrictEqual({
    loaded: true,
    userId: "",
    userTraits: {},
    anonymousId: "anonymous-2",
    groupId: "",
    groupTraits: {},
  });
});

test("the session has no collection, no flush and no dispose, because RudderStack offers no reversible switch or queue to drive", () => {
  const session = open();

  expect(session.collection).toBeUndefined();
  expect(session.flush).toBeUndefined();
  expect(session.dispose).toBeUndefined();
});

test("the native handle is the RudderStack instance the application created", () => {
  const fake = fakeRudderStack();

  expect(open(fake).native).toBe(fake.sdk);
});

test("every open answers a new session over the same instance", () => {
  const fake = fakeRudderStack();
  const adapter = rudderstack({ sdk: fake.sdk });
  const first = adapter.open();
  const second = adapter.open();

  expect(second).not.toBe(first);
  expect(second.native).toBe(fake.sdk);
});

test("Trace never loads or closes the SDK", () => {
  const fake = fakeRudderStack();
  const session = open(fake, { group: WORKSPACE });

  session.identify?.({ user: { id: "ada" } });
  session.traits?.({ user: { id: "ada" }, set: { plan: "pro" }, remove: [] });
  session.group?.({
    user: { id: "ada" },
    group: { type: "workspace", id: "w_1", traits: {} },
  });
  session.track(createTrackedEvent(), createContext());
  session.reset?.();

  expect(getMethods(fake)).toStrictEqual([
    "identify",
    "identify",
    "reset",
    "group",
    "track",
    "reset",
  ]);
});

test("through a Trace, the receipt carries the sanitizer's losses and then RudderStack's", async () => {
  const fake = fakeRudderStack();

  const trace = new Trace({
    events: { "Checkout Started": event<{ plan: string; password: string }>() },
    destinations: { rudderstack: rudderstack({ sdk: fake.sdk }) },
    defaults: { context: { plan: "free", locale: "de" } },
  });

  trace.start();

  const receipt = trace.track("Checkout Started", {
    plan: "pro",
    password: "hunter2",
  });

  await expect(receipt.settled).resolves.toStrictEqual({
    state: "settled",
    outcomes: {
      rudderstack: {
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
      "Checkout Started",
      { plan: "pro", locale: "de" },
      { originalTimestamp: expect.any(String) },
    ],
  ]);
});

test("through a Trace, a user switch resets RudderStack and its anonymous id before the next user, so each event keeps its own user", async () => {
  const fake = fakeRudderStack();
  const trace = createTrace(fake);

  trace.start();
  trace.user({ id: "ada", traits: { plan: "pro" } });
  await trace.track("App Opened").settled;
  trace.user({ id: "bob" });
  await trace.track("App Opened").settled;

  expect(getMethods(fake)).toStrictEqual([
    "identify",
    "identify",
    "track",
    "reset",
    "identify",
    "track",
  ]);
  expect(fake.events).toMatchObject([
    { type: "identify", userId: "ada", context: { traits: {} } },
    { type: "identify", userId: "ada", context: { traits: { plan: "pro" } } },
    { type: "track", userId: "ada", anonymousId: "anonymous-1" },
    { type: "identify", userId: "bob", context: { traits: {} } },
    { type: "track", userId: "bob", anonymousId: "anonymous-2" },
  ]);
});

test("through a Trace, traits set while anonymous stay with the user who signs in", async () => {
  const fake = fakeRudderStack();
  const trace = createTrace(fake);

  trace.start();
  trace.traits({ plan: "pro" });
  await trace.track("App Opened").settled;
  trace.user({ id: "ada" });
  await trace.track("App Opened").settled;

  expect(getMethods(fake)).toStrictEqual([
    "identify",
    "track",
    "identify",
    "track",
  ]);
  expect(fake.events).toMatchObject([
    { type: "identify", userId: "", context: { traits: { plan: "pro" } } },
    { type: "track", userId: "", context: { traits: { plan: "pro" } } },
    { type: "identify", userId: "ada", context: { traits: { plan: "pro" } } },
    { type: "track", userId: "ada", context: { traits: { plan: "pro" } } },
  ]);
});

test("through a Trace, an object trait never reaches RudderStack, so it holds no merge Trace did not ask for, and each step is reported unsupported", async () => {
  const fake = fakeRudderStack();
  const trace = createTrace(fake);
  const diagnostics: TraceDiagnosticEvent[] = [];

  trace.diagnostics.events.subscribe((diagnostic) => {
    diagnostics.push(diagnostic);
  });
  trace.start();
  trace.user({
    id: "ivy",
    traits: { plan: "pro", address: { city: "Lviv", line1: "Shevchenka 1" } },
  });
  await trace.track("App Opened").settled;
  trace.traits({ address: { city: "Kyiv" } });
  await trace.track("App Opened").settled;

  expect(getUnsupportedSteps(diagnostics)).toStrictEqual([
    { step: "traits" },
    { step: "traits" },
  ]);
  expect(fake.state.userTraits).toStrictEqual({ plan: "pro" });
  expect(fake.events.at(-1)).toStrictEqual(
    expect.objectContaining({ context: { traits: { plan: "pro" } } }),
  );
});

test("through a Trace, a removed trait and another group type are reported as unsupported steps while events still go out", async () => {
  const fake = fakeRudderStack();
  const trace = createTrace(fake, { group: WORKSPACE });
  const diagnostics: TraceDiagnosticEvent[] = [];

  trace.diagnostics.events.subscribe((diagnostic) => {
    diagnostics.push(diagnostic);
  });
  trace.start();
  trace.user({ id: "ada", traits: { plan: "pro", role: "admin" } });
  trace.traits({ role: null });
  trace.group("team", { id: "t_1" });

  await expect(trace.track("App Opened").settled).resolves.toMatchObject({
    outcomes: { rudderstack: { status: "submitted" } },
  });
  expect(getUnsupportedSteps(diagnostics)).toStrictEqual([
    { step: "traits" },
    { step: "group" },
  ]);
  expect(fake.events.at(-1)).toMatchObject({
    type: "track",
    userId: "ada",
    context: { traits: { plan: "pro" } },
  });
});

test("through a Trace, a consent-gated RudderStack receives nothing until consent is granted, and has no switch of its own", async () => {
  const fake = fakeRudderStack();

  const trace = new Trace({
    events: { "App Opened": event() },
    destinations: { rudderstack: rudderstack({ sdk: fake.sdk }) },
    consent: { rudderstack: ["analytics"] },
  });

  trace.start();

  const before = trace.track("App Opened");

  trace.consent.set({ analytics: "granted" });

  const after = trace.track("App Opened");

  await expect(before.settled).resolves.toStrictEqual({
    state: "dropped",
    reason: "consent",
  });
  await expect(after.settled).resolves.toMatchObject({
    outcomes: { rudderstack: { status: "submitted" } },
  });
  expect(getMethods(fake)).toStrictEqual(["track"]);
});
