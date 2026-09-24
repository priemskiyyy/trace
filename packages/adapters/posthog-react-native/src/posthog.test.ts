import { event, Trace, TraceError } from "@priemskiyyy/trace";
import type { TraceDiagnosticEvent, TrackContext } from "@priemskiyyy/trace";
import { expect, onTestFinished, test } from "vitest";

import { fakePostHog } from "src/fakePostHog.fixture";
import { posthog } from "src/posthog";
import { createTrackedEvent } from "src/trackedEvent.fixture";

type FakePostHog = ReturnType<typeof fakePostHog>;

const EVENT_ID = "3f0b6f64-6c1e-4d7a-9a4e-2b9c1d3e5f70";
const TIMESTAMP = 1_767_225_600_000;

const events = {
  "Note Added": event<{ note: string }>(),
};

const createContext = (
  signal = new AbortController().signal,
): TrackContext => ({
  signal,
  currentGeneration: () => 1,
  now: () => TIMESTAMP,
});

const createFlushContext = () => ({
  timeout: 1_000,
  signal: new AbortController().signal,
});

const open = (fake: FakePostHog = fakePostHog()) =>
  posthog({ sdk: fake.sdk }).open();

const createTrace = (
  fake: FakePostHog,
  options: { consent?: { product: ["analytics"] } } = {},
) => {
  const trace = new Trace({
    events,
    destinations: { product: posthog({ sdk: fake.sdk }) },
    now: () => TIMESTAMP,
    ...options,
  });

  onTestFinished(trace.dispose);

  return trace;
};

const getThrown = (run: () => unknown) => {
  try {
    run();
  } catch (error) {
    return error;
  }

  return null;
};

const getMethods = ({ calls }: FakePostHog) =>
  calls.map(({ method }) => method);

const release = ({ held }: FakePostHog) => {
  held.splice(0).forEach((settle) => settle());
};

const getNotes = ({ queue }: FakePostHog) =>
  queue.flatMap(({ event: name, distinct_id, properties }) => {
    if (name !== "Note Added") {
      return [];
    }

    return [[properties.note, distinct_id]];
  });

const getIdentityDiagnostics = (diagnostics: TraceDiagnosticEvent[]) =>
  diagnostics.flatMap(({ type, context }) => {
    if (!type.startsWith("identity step")) {
      return [];
    }

    return [{ type, context }];
  });

const watchDiagnostics = (trace: Trace<typeof events, { product: never }>) => {
  const diagnostics: TraceDiagnosticEvent[] = [];

  onTestFinished(
    trace.diagnostics.events.subscribe((diagnostic) => {
      diagnostics.push(diagnostic);
    }),
  );

  return diagnostics;
};

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

test("creating the adapter calls nothing on PostHog", () => {
  const fake = fakePostHog({ loaded: false });

  posthog({ sdk: fake.sdk });

  expect(fake.calls).toStrictEqual([]);
});

test("opening calls nothing and accepts an enabled client still loading its storage, since posthog-react-native takes calls from its creation and each call waits for it", () => {
  const fake = fakePostHog({ loaded: false });

  const session = posthog({ sdk: fake.sdk }).open();

  expect(session.native).toBe(fake.sdk);
  expect(fake.calls).toStrictEqual([]);
});

test("opening refuses a disabled client with UNSUPPORTED before calling anything, since it sends and flushes nothing", () => {
  const fake = fakePostHog({ disabled: true });

  expect(getThrown(posthog({ sdk: fake.sdk }).open)).toStrictEqual(
    new TraceError({
      code: "UNSUPPORTED",
      message:
        "PostHog is disabled, by disabled: true or a missing API key, so it would send and flush nothing.",
    }),
  );
  expect(fake.calls).toStrictEqual([]);
});

test("an event is one capture, once the client has loaded its storage, with its properties over its context, its timestamp and its id as uuid", async () => {
  const fake = fakePostHog();

  const answer = await open(fake).track(
    createTrackedEvent({
      properties: { cart: { id: "cart_1" }, value: 49.5, currency: "EUR" },
      context: { currency: "USD", locale: "de" },
    }),
    createContext(),
  );

  expect(fake.calls).toStrictEqual([
    { method: "ready", args: [] },
    {
      method: "capture",
      args: [
        "Checkout Started",
        { currency: "EUR", locale: "de", cart: { id: "cart_1" }, value: 49.5 },
        { timestamp: new Date(TIMESTAMP), uuid: EVENT_ID },
      ],
    },
  ]);
  expect(fake.queue).toStrictEqual([
    {
      event: "Checkout Started",
      distinct_id: "anonymous-1",
      properties: {
        currency: "EUR",
        locale: "de",
        cart: { id: "cart_1" },
        value: 49.5,
        $session_id: "session-1",
      },
      timestamp: new Date(TIMESTAMP),
      uuid: EVENT_ID,
    },
  ]);
  expect(answer).toStrictEqual({
    status: "submitted",
    evidence: "sdk-call-returned",
    losses: [{ path: "context.currency", reason: "omitted" }],
  });
});

test("PostHog's own names are left out of an event, each an omitted loss, so no event can change the person or its groups", async () => {
  const fake = fakePostHog();

  const answer = await open(fake).track(
    createTrackedEvent({
      properties: {
        plan: "pro",
        $set: { email: "grace@example.com" },
        distinct_id: "grace",
      },
      context: { $groups: { company: "other" }, token: "phc_other" },
    }),
    createContext(),
  );

  expect(fake.calls[1]).toStrictEqual({
    method: "capture",
    args: [
      "Checkout Started",
      { plan: "pro" },
      { timestamp: new Date(TIMESTAMP), uuid: EVENT_ID },
    ],
  });
  expect(fake.state.groups).toBe(null);
  expect(answer).toStrictEqual({
    status: "submitted",
    evidence: "sdk-call-returned",
    losses: [
      { path: "properties.$set", reason: "omitted" },
      { path: "properties.distinct_id", reason: "omitted" },
      { path: "context.$groups", reason: "omitted" },
      { path: "context.token", reason: "omitted" },
    ],
  });
});

test.each(["$identify", "$create_alias", "$merge_dangerously"])(
  "an event named %s, one of PostHog's own person events, is skipped as unsupported and never reaches the client",
  async (name) => {
    const fake = fakePostHog();

    expect(
      await open(fake).track(
        createTrackedEvent({ name, properties: { alias: "grace" } }),
        createContext(),
      ),
    ).toStrictEqual({ status: "skipped", reason: "unsupported" });
    expect(fake.calls).toStrictEqual([]);
  },
);

test("an event waits for the client's storage, and then goes under the person the storage held", async () => {
  const fake = fakePostHog({ loaded: false });

  fake.state.distinctId = "ada";

  const answering = open(fake).track(createTrackedEvent(), createContext());

  await Promise.resolve();

  expect(getMethods(fake)).toStrictEqual(["ready"]);

  fake.finishLoading();

  expect(await answering).toStrictEqual({
    status: "submitted",
    evidence: "sdk-call-returned",
    losses: [],
  });
  expect(fake.queue.map(({ distinct_id }) => distinct_id)).toStrictEqual([
    "ada",
  ]);
});

test("an event Trace gave up on while the client loaded its storage, at its timeout or on disposal, is never captured", async () => {
  const fake = fakePostHog({ loaded: false });
  const controller = new AbortController();

  const answering = open(fake).track(
    createTrackedEvent(),
    createContext(controller.signal),
  );

  controller.abort();
  fake.finishLoading();

  expect(await answering).toStrictEqual({
    status: "indeterminate",
    reason: "ambiguous",
  });
  expect(getMethods(fake)).toStrictEqual(["ready"]);
  expect(fake.queue).toStrictEqual([]);
});

test("an event an opted-out client drops is still submitted, because capture answers nothing and proves only that the call returned", async () => {
  const fake = fakePostHog({ defaultOptIn: false });

  expect(
    await open(fake).track(createTrackedEvent(), createContext()),
  ).toStrictEqual({
    status: "submitted",
    evidence: "sdk-call-returned",
    losses: [],
  });
  expect(getMethods(fake)).toStrictEqual(["ready", "capture"]);
  expect(fake.queue).toStrictEqual([]);
});

test("every call waits for the client's storage, and reaches it in the order it was made once the storage has loaded", async () => {
  const fake = fakePostHog({ loaded: false });
  const session = open(fake);

  const answers = [
    session.collection?.(true),
    session.identify?.({ user: { id: "ada" } }),
    session.traits?.({ user: { id: "ada" }, set: { plan: "pro" }, remove: [] }),
    session.group?.({
      user: { id: "ada" },
      group: { type: "workspace", id: "w_1", traits: {} },
    }),
    session.track(createTrackedEvent(), createContext()),
    session.reset?.(),
    session.flush?.(createFlushContext()),
  ];

  await Promise.resolve();

  expect(getMethods(fake)).toStrictEqual([
    "ready",
    "ready",
    "ready",
    "ready",
    "ready",
    "ready",
    "ready",
  ]);

  fake.finishLoading();
  await Promise.all(answers);

  expect(getMethods(fake).slice(7)).toStrictEqual([
    "optIn",
    "identify",
    "unsetPersonProperties",
    "setPersonProperties",
    "group",
    "capture",
    "reset",
    "optIn",
    "flush",
  ]);
});

test("a user is PostHog's identify, and traits unset the removed names, then set the values", async () => {
  const fake = fakePostHog();
  const session = open(fake);

  await session.identify?.({ user: { id: "ada" } });
  await session.traits?.({
    user: { id: "ada" },
    set: { plan: "pro", profile: { score: null } },
    remove: ["legacy"],
  });

  expect(fake.calls).toStrictEqual([
    { method: "ready", args: [] },
    { method: "identify", args: ["ada"] },
    { method: "ready", args: [] },
    { method: "unsetPersonProperties", args: [["legacy"]] },
    {
      method: "setPersonProperties",
      args: [{ plan: "pro", profile: { score: null } }],
    },
  ]);
  expect(
    fake.queue.map(({ event: name, distinct_id }) => [name, distinct_id]),
  ).toStrictEqual([
    ["$identify", "ada"],
    ["$set", "ada"],
    ["$set", "ada"],
  ]);
});

test("traits that only set or only remove hand the client an empty part too, which posthog-react-native ignores", async () => {
  const fake = fakePostHog();
  const session = open(fake);

  await session.traits?.({ user: null, set: { plan: "pro" }, remove: [] });
  await session.traits?.({ user: null, set: {}, remove: ["plan"] });

  expect(
    fake.calls.flatMap(({ method, args }) => {
      if (method === "ready") {
        return [];
      }

      return [[method, ...args]];
    }),
  ).toStrictEqual([
    ["unsetPersonProperties", []],
    ["setPersonProperties", { plan: "pro" }],
    ["unsetPersonProperties", ["plan"]],
    ["setPersonProperties", {}],
  ]);
  expect(fake.queue.map(({ properties }) => properties)).toStrictEqual([
    { $set: { plan: "pro" }, $set_once: {}, $session_id: "session-1" },
    { $unset: ["plan"], $session_id: "session-1" },
  ]);
});

test("an id PostHog refuses, or one it would shorten, rejects the identify and never reaches the client", async () => {
  const fake = fakePostHog();
  const session = open(fake);

  await expect(
    session.identify?.({ user: { id: "guest" } }),
  ).rejects.toStrictEqual(
    new TraceError({
      code: "UNSUPPORTED",
      message:
        "PostHog refuses to identify a person by a placeholder id like this one, so the person stays anonymous there.",
    }),
  );
  await expect(
    session.identify?.({ user: { id: "u".repeat(201) } }),
  ).rejects.toStrictEqual(
    new TraceError({
      code: "DELIVERY_FAILED",
      message:
        "PostHog keeps the first 200 characters of a distinct id, so this user would share a person with any id that starts the same.",
    }),
  );
  expect(getMethods(fake)).toStrictEqual(["ready", "ready"]);
});

test("a membership is PostHog's group, and leaving one registers the memberships the client holds without it", async () => {
  const fake = fakePostHog();
  const session = open(fake);

  fake.state.groups = { project: "p1" };

  await session.group?.({
    user: { id: "ada" },
    group: { type: "workspace", id: "w_1", traits: { tier: "team" } },
  });
  await session.group?.({
    user: { id: "ada" },
    group: { type: "workspace", id: null, traits: {} },
  });

  expect(fake.calls).toStrictEqual([
    { method: "ready", args: [] },
    { method: "group", args: ["workspace", "w_1", { tier: "team" }] },
    { method: "ready", args: [] },
    { method: "getPersistedProperty", args: ["props"] },
    { method: "register", args: [{ $groups: { project: "p1" } }] },
  ]);
  expect(fake.state.groups).toStrictEqual({ project: "p1" });
});

test("reset is PostHog's reset, after which the last collection choice is applied again, since the reset forgets it", async () => {
  const fake = fakePostHog({ defaultOptIn: false });
  const session = open(fake);

  await session.collection?.(true);
  await session.identify?.({ user: { id: "ada" } });

  expect(await session.reset?.()).toBe(undefined);
  expect(getMethods(fake)).toStrictEqual([
    "ready",
    "optIn",
    "ready",
    "identify",
    "ready",
    "reset",
    "optIn",
  ]);
  expect(fake.state).toStrictEqual({
    distinctId: null,
    anonymousId: "anonymous-2",
    groups: null,
    optedOut: false,
    failures: {},
  });
});

test("reset applies an opt-out again, since the reset returns consent to a default that opts in", async () => {
  const fake = fakePostHog();
  const session = open(fake);

  await session.collection?.(false);
  await session.reset?.();

  expect(getMethods(fake)).toStrictEqual([
    "ready",
    "optOut",
    "ready",
    "reset",
    "optOut",
  ]);
  expect(fake.state.optedOut).toBe(true);
});

test("reset settles only once the client has taken the collection choice it applies again, and rejects with it", async () => {
  const fake = fakePostHog({ hold: ["optOut"] });
  const session = open(fake);
  const failure = new Error("Storage is full");

  const closing = session.collection?.(false);

  await fake.sdk.ready();
  release(fake);
  await closing;

  let settled = false;

  const resetting = Promise.resolve(session.reset?.()).then(() => {
    settled = true;
  });

  await fake.sdk.ready();

  expect(getMethods(fake)).toStrictEqual([
    "ready",
    "ready",
    "optOut",
    "ready",
    "ready",
    "reset",
    "optOut",
  ]);
  expect(settled).toBe(false);

  release(fake);
  await resetting;

  expect(settled).toBe(true);

  fake.state.failures.optOut = failure;

  const failing = session.reset?.();

  await fake.sdk.ready();
  release(fake);

  await expect(failing).rejects.toBe(failure);
});

test("reset leaves consent to the client's configuration when Trace never switched collection", async () => {
  const fake = fakePostHog();

  await open(fake).reset?.();

  expect(getMethods(fake)).toStrictEqual(["ready", "reset"]);
  expect(fake.state.optedOut).toBe(null);
});

test("collection opts in and out, and answers once the client's own promise settles, rejecting with it", async () => {
  const fake = fakePostHog({ hold: ["optOut"] });
  const session = open(fake);
  const failure = new Error("Storage is full");

  let settled = false;

  const closing = Promise.resolve(session.collection?.(false)).then(() => {
    settled = true;
  });

  await fake.sdk.ready();

  expect(getMethods(fake)).toStrictEqual(["ready", "ready", "optOut"]);
  expect(fake.state.optedOut).toBe(true);
  expect(settled).toBe(false);

  fake.held.forEach((release) => release());
  await closing;

  expect(settled).toBe(true);
  expect(await session.collection?.(true)).toBe(undefined);
  expect(fake.state.optedOut).toBe(false);

  fake.state.failures.optIn = failure;

  await expect(session.collection?.(true)).rejects.toBe(failure);
});

test("flush sends the client's queue: settling is flushed, and a batch PostHog refused rejects, keeping the queue", async () => {
  const fake = fakePostHog();
  const session = open(fake);
  const failure = new Error("PostHog answered 503");

  await session.track(
    createTrackedEvent({ properties: { note: "sent" } }),
    createContext(),
  );

  expect(await session.flush?.(createFlushContext())).toStrictEqual({
    status: "flushed",
  });
  expect(fake.sent.map(({ properties }) => properties.note)).toStrictEqual([
    "sent",
  ]);

  fake.state.failures.flush = failure;

  await session.track(
    createTrackedEvent({ properties: { note: "kept" } }),
    createContext(),
  );

  await expect(session.flush?.(createFlushContext())).rejects.toBe(failure);
  expect(fake.queue.map(({ properties }) => properties.note)).toStrictEqual([
    "kept",
  ]);
});

test("the native handle is the client the application created, and every open answers a new session over it", () => {
  const fake = fakePostHog();
  const adapter = posthog({ sdk: fake.sdk });
  const first = adapter.open();
  const second = adapter.open();

  expect(first.native).toBe(fake.sdk);
  expect(second).not.toBe(first);
  expect(second.native).toBe(fake.sdk);
});

test("through Trace, calls made before the client loads its storage keep their order, so an event tracked before a sign-in stays anonymous and the next goes under the user", async () => {
  const fake = fakePostHog({ loaded: false });
  const trace = createTrace(fake);

  trace.start();

  const anonymous = trace.track("Note Added", { note: "before sign-in" });

  trace.user({ id: "ada" });

  const ada = trace.track("Note Added", { note: "from ada" });

  await Promise.resolve();

  expect(fake.queue).toStrictEqual([]);

  fake.finishLoading();

  expect(await anonymous.settled).toStrictEqual(SUBMITTED);
  expect(await ada.settled).toStrictEqual(SUBMITTED);
  expect(
    fake.queue.map(({ event: name, distinct_id }) => [name, distinct_id]),
  ).toStrictEqual([
    ["Note Added", "anonymous-1"],
    ["$identify", "ada"],
    ["Note Added", "ada"],
  ]);
  expect(getNotes(fake)).toStrictEqual([
    ["before sign-in", "anonymous-1"],
    ["from ada", "ada"],
  ]);
});

test("through Trace, an event still in flight when the user switches keeps its user, because PostHog resets and identifies the next one only after it", async () => {
  const fake = fakePostHog();
  const trace = createTrace(fake);

  trace.start();
  trace.user({ id: "ada" });
  await trace.track("Note Added", { note: "first" }).settled;

  const inFlight = trace.track("Note Added", { note: "in flight" });

  trace.user({ id: "bob" });

  const bob = trace.track("Note Added", { note: "from bob" });

  expect(await inFlight.settled).toStrictEqual(SUBMITTED);
  expect(await bob.settled).toStrictEqual(SUBMITTED);
  expect(getNotes(fake)).toStrictEqual([
    ["first", "ada"],
    ["in flight", "ada"],
    ["from bob", "bob"],
  ]);
  expect(
    fake.calls.flatMap(({ method, args }) => {
      if (method === "ready" || method === "getPersistedProperty") {
        return [];
      }

      return [[method, ...args.slice(0, 1)]];
    }),
  ).toStrictEqual([
    ["identify", "ada"],
    ["capture", "Note Added"],
    ["capture", "Note Added"],
    ["reset"],
    ["identify", "bob"],
    ["capture", "Note Added"],
  ]);
});

test("through Trace, leaving a group before the client has loaded its storage keeps every other membership the storage restores", async () => {
  const fake = fakePostHog({ loaded: false });
  const trace = createTrace(fake);

  fake.state.groups = { company: "acme", project: "p1" };

  trace.start();
  trace.group("company", null);

  const receipt = trace.track("Note Added", { note: "after leaving" });

  fake.finishLoading();

  expect(await receipt.settled).toStrictEqual(SUBMITTED);
  expect(fake.state.groups).toStrictEqual({ project: "p1" });
  expect(fake.queue.map(({ properties }) => properties.$groups)).toStrictEqual([
    { project: "p1" },
  ]);
});

test("through Trace, a user switch resets PostHog before the next identify, and the granted collection comes back, so the next user's events are captured", async () => {
  const fake = fakePostHog({ defaultOptIn: false });
  const trace = createTrace(fake, { consent: { product: ["analytics"] } });

  trace.consent.set({ analytics: "granted" });
  trace.start();
  trace.user({ id: "ada" });
  await trace.track("Note Added", { note: "from ada" }).settled;
  trace.user({ id: "bob" });

  const receipt = trace.track("Note Added", { note: "from bob" });

  expect(await receipt.settled).toStrictEqual(SUBMITTED);
  expect(
    getMethods(fake).flatMap((method) => {
      if (method === "ready" || method === "capture") {
        return [];
      }

      return [method];
    }),
  ).toStrictEqual(["optIn", "identify", "reset", "optIn", "identify"]);
  expect(getNotes(fake)).toStrictEqual([
    ["from ada", "ada"],
    ["from bob", "bob"],
  ]);
});

test("through Trace, a gated destination opens opted out while its purpose is unknown, is opted in once it is granted and out once it is withdrawn, and gets nothing meanwhile", async () => {
  const fake = fakePostHog();
  const trace = createTrace(fake, { consent: { product: ["analytics"] } });

  trace.start();

  const unknown = await trace.track("Note Added", { note: "unknown" }).settled;

  trace.consent.set({ analytics: "granted" });
  await trace.track("Note Added", { note: "granted" }).settled;
  trace.consent.set({ analytics: "denied" });

  const denied = await trace.track("Note Added", { note: "denied" }).settled;

  trace.consent.set({ analytics: "granted" });
  await trace.track("Note Added", { note: "granted again" }).settled;

  expect(unknown).toStrictEqual({ state: "dropped", reason: "consent" });
  expect(denied).toStrictEqual({ state: "dropped", reason: "consent" });
  expect(
    getMethods(fake).flatMap((method) => {
      if (method !== "optIn" && method !== "optOut") {
        return [];
      }

      return [method];
    }),
  ).toStrictEqual(["optOut", "optIn", "optOut", "optIn"]);
  expect(getNotes(fake)).toStrictEqual([
    ["granted", "anonymous-1"],
    ["granted again", "anonymous-1"],
  ]);
});

test("through Trace, a placeholder id is an identity step unsupported, and the events stay anonymous", async () => {
  const fake = fakePostHog();
  const trace = createTrace(fake);
  const diagnostics = watchDiagnostics(trace);

  trace.start();
  trace.user({ id: "guest" });
  await trace.track("Note Added", { note: "as a guest" }).settled;

  expect(getIdentityDiagnostics(diagnostics)).toStrictEqual([
    { type: "identity step unsupported", context: { step: "identify" } },
  ]);
  expect(getMethods(fake)).toStrictEqual(["ready", "ready", "capture"]);
  expect(getNotes(fake)).toStrictEqual([["as a guest", "anonymous-1"]]);
});

test("through Trace, a user whose id PostHog would shorten is an identity step failed, that user's events are skipped as identity-failed, and the next user is unaffected", async () => {
  const fake = fakePostHog();
  const trace = createTrace(fake);
  const diagnostics = watchDiagnostics(trace);

  trace.start();
  trace.user({ id: "u".repeat(201) });

  const skipped = await trace.track("Note Added", { note: "long id" }).settled;

  trace.user({ id: "bob" });

  const bob = trace.track("Note Added", { note: "from bob" });

  expect(skipped).toStrictEqual({
    state: "settled",
    outcomes: { product: { status: "skipped", reason: "identity-failed" } },
  });
  expect(await bob.settled).toStrictEqual(SUBMITTED);
  expect(getIdentityDiagnostics(diagnostics)).toStrictEqual([
    {
      type: "identity step failed",
      context: { step: "identify", reason: "error" },
    },
    {
      type: "identity step failed",
      context: { step: "identify", reason: "error" },
    },
  ]);
  expect(getNotes(fake)).toStrictEqual([["from bob", "bob"]]);
});

test('through Trace, under personProfiles "never" posthog-react-native ignores the user and Trace cannot tell, so no step is reported and the events stay anonymous', async () => {
  const fake = fakePostHog({ personProfiles: "never" });
  const trace = createTrace(fake);
  const diagnostics = watchDiagnostics(trace);

  trace.start();
  trace.user({ id: "ada", traits: { plan: "pro" } });

  const receipt = trace.track("Note Added", { note: "as ada" });

  expect(await receipt.settled).toStrictEqual(SUBMITTED);
  expect(getIdentityDiagnostics(diagnostics)).toStrictEqual([]);
  expect(
    getMethods(fake).flatMap((method) => {
      if (method === "ready") {
        return [];
      }

      return [method];
    }),
  ).toStrictEqual([
    "identify",
    "unsetPersonProperties",
    "setPersonProperties",
    "capture",
  ]);
  expect(fake.queue.map(({ event: name }) => name)).toStrictEqual([
    "Note Added",
  ]);
  expect(getNotes(fake)).toStrictEqual([["as ada", "anonymous-1"]]);
});

test("through Trace, the receipt carries the sanitizer's losses and then PostHog's", async () => {
  const fake = fakePostHog();

  const trace = new Trace({
    events: {
      "Checkout Started": event<{ plan: string; password: string }>(),
    },
    destinations: { product: posthog({ sdk: fake.sdk }) },
    defaults: { context: { plan: "free", locale: "de" } },
  });

  onTestFinished(trace.dispose);
  trace.start();

  const receipt = trace.track("Checkout Started", {
    plan: "pro",
    password: "hunter2",
  });

  expect(await receipt.settled).toStrictEqual({
    state: "settled",
    outcomes: {
      product: {
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
  expect(fake.queue.map(({ properties }) => properties)).toStrictEqual([
    { plan: "pro", locale: "de", $session_id: "session-1" },
  ]);
});

test("through Trace, flush answers flushed once PostHog accepted the queue, and failed with the batch it refused", async () => {
  const fake = fakePostHog();
  const trace = createTrace(fake);
  const failure = new Error("PostHog answered 503");

  trace.start();
  await trace.track("Note Added", { note: "sent" }).settled;

  expect(await trace.flush({ timeout: 1_000 })).toEqual({
    drained: true,
    destinations: { product: { status: "flushed" } },
  });

  fake.state.failures.flush = failure;
  await trace.track("Note Added", { note: "kept" }).settled;

  expect(await trace.flush({ timeout: 1_000 })).toEqual({
    drained: true,
    destinations: { product: { status: "failed", error: failure } },
  });
  expect(fake.sent.map(({ properties }) => properties.note)).toStrictEqual([
    "sent",
  ]);
  expect(fake.queue.map(({ properties }) => properties.note)).toStrictEqual([
    "kept",
  ]);
});

test("through Trace, the native handle is the injected client once the destination is ready, and null before", () => {
  const fake = fakePostHog();
  const trace = createTrace(fake);

  expect(trace.destination("product").native).toBe(null);

  trace.start();

  expect(trace.destination("product").native).toBe(fake.sdk);
});

test("Trace never initializes or shuts PostHog down", async () => {
  const fake = fakePostHog();
  const trace = createTrace(fake, { consent: { product: ["analytics"] } });

  trace.consent.set({ analytics: "granted" });
  trace.start();
  trace.user({ id: "ada", traits: { plan: "pro" } });
  trace.group("workspace", { id: "w_1", traits: { tier: "team" } });
  await trace.track("Note Added", { note: "all of it" }).settled;
  trace.group("workspace", null);
  trace.user(null);
  await trace.flush();
  trace.dispose();

  expect(new Set(getMethods(fake))).toStrictEqual(
    new Set([
      "ready",
      "optIn",
      "identify",
      "unsetPersonProperties",
      "setPersonProperties",
      "group",
      "capture",
      "getPersistedProperty",
      "register",
      "reset",
      "flush",
    ]),
  );
});
