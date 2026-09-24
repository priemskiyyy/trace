import { event, Trace } from "@priemskiyyy/trace";
import type { TraceDiagnosticEvent, TrackContext } from "@priemskiyyy/trace";
import { expect, test } from "vitest";

import { fakePostHog } from "src/fakePostHog.fixture";
import { posthog } from "src/posthog";
import { createTrackedEvent, TRACKED_EVENT } from "src/trackedEvent.fixture";

type FakePostHog = ReturnType<typeof fakePostHog>;

type Options = { anonymousId?: string };

const { id: EVENT_ID, timestamp: TIMESTAMP } = TRACKED_EVENT;
const VISITOR = "visitor-7";
const ANONYMOUS = { generation: 0, user: null, traits: {}, groups: {} };

const createContext = (currentGeneration = 1): TrackContext => ({
  signal: new AbortController().signal,
  currentGeneration: () => currentGeneration,
  now: () => TIMESTAMP,
});

const createFlushContext = () => ({
  timeout: 1_000,
  signal: new AbortController().signal,
});

const open = (fake: FakePostHog = fakePostHog(), options: Options = {}) =>
  posthog({ sdk: fake.sdk, ...options }).open();

const createTrace = (fake: FakePostHog, options: Options = {}) =>
  new Trace({
    events: {
      "App Opened": event(),
      "Checkout Started": event<{ plan: string; password: string }>(),
    },
    destinations: { posthog: posthog({ sdk: fake.sdk, ...options }) },
    now: () => TIMESTAMP,
  });

const getThrown = (run: () => unknown) => {
  try {
    run();
  } catch (error) {
    return error;
  }

  return null;
};

const getMethods = ({ calls }: FakePostHog) => calls.map(([method]) => method);

const getCapture = (
  distinctId: string,
  uuid: string,
  {
    event = "App Opened",
    groups = {},
  }: { event?: string; groups?: Record<string, string> } = {},
) => [
  "capture",
  {
    distinctId,
    event,
    properties: {},
    groups,
    timestamp: new Date(TIMESTAMP),
    uuid,
  },
];

const nextMacrotask = () =>
  new Promise((resolve) => {
    setImmediate(resolve);
  });

test("creating the adapter reads and calls nothing on posthog-node", () => {
  const fake = fakePostHog();
  const reads: PropertyKey[] = [];

  const sdk = new Proxy(fake.sdk, {
    get: (target, key, receiver) => {
      reads.push(key);

      return Reflect.get(target, key, receiver);
    },
  });

  expect(posthog({ sdk, anonymousId: VISITOR }).name).toBe("posthog-node");
  expect(reads).toStrictEqual([]);
  expect(fake.calls).toStrictEqual([]);
});

test("open never refuses and calls nothing, because posthog-node takes calls from the moment it is constructed", () => {
  const fake = fakePostHog();

  expect(posthog({ sdk: fake.sdk }).open().native).toBe(fake.sdk);
  expect(fake.calls).toStrictEqual([]);
});

test("an event is one capture for its user, with its name, its properties over its context, its memberships as groups, its time and its id as uuid", () => {
  const fake = fakePostHog();

  const answer = open(fake, { anonymousId: VISITOR }).track(
    createTrackedEvent({
      properties: { cart: { id: "cart_1" }, value: 49.5, currency: "EUR" },
      context: { currency: "USD", locale: "de" },
      identity: {
        generation: 1,
        user: { id: "ada" },
        traits: { plan: "pro" },
        groups: {
          workspace: { id: "w_1", traits: { tier: "team" } },
          team: { id: "t_1", traits: {} },
        },
      },
    }),
    createContext(),
  );

  expect(fake.calls).toStrictEqual([
    [
      "capture",
      {
        distinctId: "ada",
        event: "Checkout Started",
        properties: {
          currency: "EUR",
          locale: "de",
          cart: { id: "cart_1" },
          value: 49.5,
        },
        groups: { workspace: "w_1", team: "t_1" },
        timestamp: new Date(TIMESTAMP),
        uuid: EVENT_ID,
      },
    ],
  ]);
  expect(answer).toStrictEqual({
    status: "submitted",
    evidence: "sdk-call-returned",
    losses: [{ path: "context.currency", reason: "omitted" }],
  });
});

test("a signed-out event goes under the visitor id, and a signed-in one under its user alone", () => {
  const fake = fakePostHog();

  open(fake, { anonymousId: VISITOR }).track(
    createTrackedEvent({ identity: ANONYMOUS }),
    createContext(),
  );
  open(fake).track(createTrackedEvent(), createContext());

  expect(fake.calls).toStrictEqual([
    getCapture(VISITOR, EVENT_ID, { event: "Checkout Started" }),
    getCapture("ada", EVENT_ID, { event: "Checkout Started" }),
  ]);
});

test("an event with neither a user nor a visitor id is skipped as unidentified before posthog-node, which would file it under an enclosing withContext id or under no person", () => {
  const fake = fakePostHog();

  expect(
    open(fake).track(
      createTrackedEvent({ identity: ANONYMOUS, properties: { plan: "pro" } }),
      createContext(),
    ),
  ).toStrictEqual({ status: "skipped", reason: "unidentified" });
  expect(fake.calls).toStrictEqual([]);
});

test("a visitor id of 200 characters is sent, and one PostHog would shorten, or a blank one, never is", () => {
  const fake = fakePostHog();
  const signedOut = createTrackedEvent({ identity: ANONYMOUS });

  const answers = ["v".repeat(200), "v".repeat(201), "", "   "].map(
    (anonymousId) =>
      open(fake, { anonymousId }).track(signedOut, createContext()),
  );

  expect(answers).toStrictEqual([
    { status: "submitted", evidence: "sdk-call-returned", losses: [] },
    { status: "skipped", reason: "unidentified" },
    { status: "skipped", reason: "unidentified" },
    { status: "skipped", reason: "unidentified" },
  ]);
  expect(fake.calls).toStrictEqual([
    getCapture("v".repeat(200), EVENT_ID, { event: "Checkout Started" }),
  ]);
});

test("the names PostHog owns are left out of the properties and the context, each an omitted loss, and the properties' losses come first", () => {
  const fake = fakePostHog();

  const answer = open(fake).track(
    createTrackedEvent({
      properties: { $set: { plan: "free" }, distinct_id: "bob", value: 1 },
      context: { token: "phc_other", $groups: { team: "t_9" }, locale: "de" },
    }),
    createContext(),
  );

  expect(fake.calls).toStrictEqual([
    [
      "capture",
      {
        distinctId: "ada",
        event: "Checkout Started",
        properties: { locale: "de", value: 1 },
        groups: {},
        timestamp: new Date(TIMESTAMP),
        uuid: EVENT_ID,
      },
    ],
  ]);
  expect(answer).toStrictEqual({
    status: "submitted",
    evidence: "sdk-call-returned",
    losses: [
      { path: "properties.$set", reason: "omitted" },
      { path: "properties.distinct_id", reason: "omitted" },
      { path: "context.token", reason: "omitted" },
      { path: "context.$groups", reason: "omitted" },
    ],
  });
});

test.each(["$identify", "$create_alias", "$merge_dangerously"])(
  "an event named %s, one of PostHog's own person events, is skipped as unsupported and never captured",
  (name) => {
    const fake = fakePostHog();

    expect(
      open(fake, { anonymousId: VISITOR }).track(
        createTrackedEvent({ name, properties: { alias: "bob" } }),
        createContext(),
      ),
    ).toStrictEqual({ status: "skipped", reason: "unsupported" });
    expect(fake.calls).toStrictEqual([]);
  },
);

test("the answer comes at the call and names no provider event, because posthog-node answers nothing and sends later", () => {
  const fake = fakePostHog();

  expect(open(fake).track(createTrackedEvent(), createContext())).toStrictEqual(
    { status: "submitted", evidence: "sdk-call-returned", losses: [] },
  );
  expect(fake.sent).toStrictEqual([]);
});

test("an event keeps the user it was accepted with after the Trace's user changed, because posthog-node takes the distinct id on every call", () => {
  const fake = fakePostHog();

  expect(
    open(fake).track(createTrackedEvent(), createContext(4)),
  ).toStrictEqual({
    status: "submitted",
    evidence: "sdk-call-returned",
    losses: [],
  });
  expect(fake.calls).toStrictEqual([
    getCapture("ada", EVENT_ID, { event: "Checkout Started" }),
  ]);
});

test("identify merges the visitor into the user with an $identify naming the visitor as $anon_distinct_id", () => {
  const fake = fakePostHog();

  expect(
    open(fake, { anonymousId: VISITOR }).identify?.({ user: { id: "ada" } }),
  ).toBe(undefined);
  expect(fake.calls).toStrictEqual([
    [
      "identify",
      { distinctId: "ada", properties: { $anon_distinct_id: VISITOR } },
    ],
  ]);
});

test("identify without a visitor id PostHog can keep sends nothing, since there is nobody to merge and every call names the user anyway", () => {
  const fake = fakePostHog();

  open(fake).identify?.({ user: { id: "ada" } });
  open(fake, { anonymousId: "v".repeat(201) }).identify?.({
    user: { id: "ada" },
  });

  expect(fake.calls).toStrictEqual([]);
});

test("a user id of 200 characters is identified, and one of 201, which PostHog would shorten, fails with DELIVERY_FAILED and sends nothing, with or without a visitor id", () => {
  const fake = fakePostHog();

  const refusal = {
    name: "TraceError",
    code: "DELIVERY_FAILED",
    message:
      "PostHog keeps the first 200 characters of a distinct id, so this user would share a person with any id that starts the same.",
  };

  open(fake, { anonymousId: VISITOR }).identify?.({
    user: { id: "u".repeat(200) },
  });

  expect(
    getThrown(() =>
      open(fake, { anonymousId: VISITOR }).identify?.({
        user: { id: "u".repeat(201) },
      }),
    ),
  ).toStrictEqual(expect.objectContaining(refusal));
  expect(
    getThrown(() => open(fake).identify?.({ user: { id: "u".repeat(201) } })),
  ).toStrictEqual(expect.objectContaining(refusal));
  expect(fake.calls).toStrictEqual([
    [
      "identify",
      {
        distinctId: "u".repeat(200),
        properties: { $anon_distinct_id: VISITOR },
      },
    ],
  ]);
});

test.each(["guest", "Guest", "anonymous", "distinct_id", "null", "0", "NaN"])(
  "a placeholder distinct id, %s, fails identify with DELIVERY_FAILED and sends nothing, since every user who sends it would share one person",
  (id) => {
    const fake = fakePostHog();

    expect(
      getThrown(() =>
        open(fake, { anonymousId: VISITOR }).identify?.({ user: { id } }),
      ),
    ).toStrictEqual(
      expect.objectContaining({
        name: "TraceError",
        code: "DELIVERY_FAILED",
        message: `PostHog accepts "${id}" as an ordinary distinct id, so every user who sends this placeholder would share one person there.`,
      }),
    );
    expect(fake.calls).toStrictEqual([]);
  },
);

test.each(["Guest_42", "not-a-placeholder", "NULL0"])(
  "%s only resembles a placeholder id, so it is identified",
  (id) => {
    const fake = fakePostHog();

    open(fake, { anonymousId: VISITOR }).identify?.({ user: { id } });

    expect(fake.calls).toStrictEqual([
      [
        "identify",
        { distinctId: id, properties: { $anon_distinct_id: VISITOR } },
      ],
    ]);
  },
);

test("traits unset the removed names and then set the values on the user's person, each call empty or not, since posthog-node sends nothing for an empty one", () => {
  const fake = fakePostHog();
  const session = open(fake, { anonymousId: VISITOR });

  session.traits?.({
    user: { id: "ada" },
    set: { plan: "pro", seats: 4 },
    remove: ["role"],
  });
  session.traits?.({ user: { id: "ada" }, set: {}, remove: ["legacy"] });

  expect(fake.calls).toStrictEqual([
    ["unsetPersonProperties", { distinctId: "ada", properties: ["role"] }],
    [
      "setPersonProperties",
      { distinctId: "ada", properties: { plan: "pro", seats: 4 } },
    ],
    ["unsetPersonProperties", { distinctId: "ada", properties: ["legacy"] }],
    ["setPersonProperties", { distinctId: "ada", properties: {} }],
  ]);
  expect(fake.queued.map(({ properties }) => properties)).toStrictEqual([
    expect.objectContaining({ $unset: ["role"] }),
    expect.objectContaining({ $set: { plan: "pro", seats: 4 } }),
    expect.objectContaining({ $unset: ["legacy"] }),
  ]);
});

test("traits while signed out go to the visitor's person, and without a visitor id they are refused as unsupported and send nothing", () => {
  const withVisitor = fakePostHog();
  const withoutVisitor = fakePostHog();
  const update = { user: null, set: { plan: "pro" }, remove: [] };

  open(withVisitor, { anonymousId: VISITOR }).traits?.(update);

  expect(getThrown(() => open(withoutVisitor).traits?.(update))).toStrictEqual(
    expect.objectContaining({
      name: "TraceError",
      code: "UNSUPPORTED",
      message:
        "PostHog keeps traits on a person, and this update has neither a user nor a visitor id PostHog can keep. Pass anonymousId to reach signed-out visitors.",
    }),
  );
  expect(withVisitor.calls).toStrictEqual([
    ["unsetPersonProperties", { distinctId: VISITOR, properties: [] }],
    [
      "setPersonProperties",
      { distinctId: VISITOR, properties: { plan: "pro" } },
    ],
  ]);
  expect(withoutVisitor.calls).toStrictEqual([]);
});

test("a removal posthog-node would drop in silence, a blank name, is reported unsupported once the rest was sent", () => {
  const fake = fakePostHog();

  const thrown = getThrown(() =>
    open(fake).traits?.({
      user: { id: "ada" },
      set: { plan: "pro" },
      remove: ["role", "  "],
    }),
  );

  expect(thrown).toStrictEqual(
    expect.objectContaining({
      name: "TraceError",
      code: "UNSUPPORTED",
      message:
        "posthog-node drops the removal of a blank trait name, so that trait stays on the person; the rest was sent.",
    }),
  );
  expect(fake.queued.map(({ properties }) => properties)).toStrictEqual([
    expect.objectContaining({ $unset: ["role"] }),
    expect.objectContaining({ $set: { plan: "pro" } }),
  ]);
});

test("a membership sends the group's traits in a groupIdentify under the user, a removed trait as null", () => {
  const fake = fakePostHog();

  expect(
    open(fake, { anonymousId: VISITOR }).group?.({
      user: { id: "ada" },
      group: {
        type: "workspace",
        id: "w_1",
        traits: { tier: "team", legacy: null },
      },
    }),
  ).toBe(undefined);
  expect(fake.calls).toStrictEqual([
    [
      "groupIdentify",
      {
        groupType: "workspace",
        groupKey: "w_1",
        properties: { tier: "team", legacy: null },
        distinctId: "ada",
      },
    ],
  ]);
});

test("leaving a group sends nothing, because the membership rides on each event and the next one carries it no more", () => {
  const fake = fakePostHog();

  open(fake).group?.({
    user: null,
    group: { type: "workspace", id: null, traits: {} },
  });

  expect(fake.calls).toStrictEqual([]);
});

test("a membership without traits sends nothing and throws nothing, with or without a distinct id, because the membership rides on each event", () => {
  const fake = fakePostHog();
  const group = { type: "workspace", id: "w_1", traits: {} };

  expect(
    open(fake, { anonymousId: VISITOR }).group?.({
      user: { id: "ada" },
      group,
    }),
  ).toBe(undefined);
  expect(open(fake).group?.({ user: null, group })).toBe(undefined);
  expect(fake.calls).toStrictEqual([]);
});

test("a membership's traits while signed out go under the visitor, and without a visitor id they are refused as unsupported and send nothing", () => {
  const withVisitor = fakePostHog();
  const withoutVisitor = fakePostHog();

  const update = {
    user: null,
    group: { type: "workspace", id: "w_1", traits: { tier: "team" } },
  };

  open(withVisitor, { anonymousId: VISITOR }).group?.(update);

  expect(getThrown(() => open(withoutVisitor).group?.(update))).toStrictEqual(
    expect.objectContaining({
      name: "TraceError",
      code: "UNSUPPORTED",
      message:
        "PostHog files a group's properties under a person, and this update has neither a user nor a visitor id PostHog can keep. Pass anonymousId to reach signed-out visitors.",
    }),
  );
  expect(withVisitor.calls).toStrictEqual([
    [
      "groupIdentify",
      {
        groupType: "workspace",
        groupKey: "w_1",
        properties: { tier: "team" },
        distinctId: VISITOR,
      },
    ],
  ]);
  expect(withoutVisitor.calls).toStrictEqual([]);
});

test("flush answers flushed once posthog-node's flush resolved, which waits for PostHog to accept the queue", async () => {
  const fake = fakePostHog();
  const session = open(fake);
  const flushed: { result: unknown } = { result: null };

  session.track(createTrackedEvent(), createContext());
  Promise.resolve(session.flush?.(createFlushContext())).then((result) => {
    flushed.result = result;
  });
  await nextMacrotask();

  expect(flushed.result).toBe(null);
  expect(getMethods(fake)).toStrictEqual(["capture", "flush"]);

  fake.send();
  await nextMacrotask();

  expect(flushed.result).toStrictEqual({ status: "flushed" });
});

test("a flush posthog-node rejects rejects with its error", async () => {
  const fake = fakePostHog();
  const session = open(fake);
  const refused = new Error("HTTP error while fetching PostHog: status=500");

  session.track(createTrackedEvent(), createContext());

  const flushing = session.flush?.(createFlushContext());

  fake.refuse(refused);

  await expect(flushing).rejects.toBe(refused);
});

test("the session has no reset and no dispose, because posthog-node holds no person between calls, and no collection, because its opt-out switches every Trace over the client", () => {
  const session = open(fakePostHog(), { anonymousId: VISITOR });

  expect(session.reset).toBe(undefined);
  expect(session.collection).toBe(undefined);
  expect(session.dispose).toBe(undefined);
});

test("the native handle is the posthog-node client the application constructed", () => {
  const fake = fakePostHog();

  expect(open(fake).native).toBe(fake.sdk);
});

test("every open answers a new session over the same client", () => {
  const fake = fakePostHog();
  const adapter = posthog({ sdk: fake.sdk });
  const first = adapter.open();
  const second = adapter.open();

  expect(second).not.toBe(first);
  expect(second.native).toBe(fake.sdk);
});

test("Trace never constructs, configures or closes posthog-node", async () => {
  const fake = fakePostHog();

  const trace = createTrace(fake, { anonymousId: VISITOR });

  trace.start();
  trace.user({ id: "ada", traits: { plan: "pro" } });
  trace.group("workspace", { id: "w_1", traits: { tier: "team" } });
  trace.track("App Opened");
  trace.group("workspace", null);
  trace.user(null);
  trace.track("App Opened");

  const flushing = trace.flush();

  await nextMacrotask();
  fake.send();
  await flushing;
  trace.dispose();

  expect(getMethods(fake)).toStrictEqual([
    "identify",
    "unsetPersonProperties",
    "setPersonProperties",
    "groupIdentify",
    "capture",
    "capture",
    "flush",
  ]);
});

test("through a Trace, the receipt carries the sanitizer's losses and then PostHog's", async () => {
  const fake = fakePostHog();

  const trace = new Trace({
    events: { "Checkout Started": event<{ plan: string; password: string }>() },
    destinations: { posthog: posthog({ sdk: fake.sdk }) },
    defaults: { context: { plan: "free", $current_url: "/checkout" } },
    now: () => TIMESTAMP,
  });

  trace.start();
  trace.user({ id: "ada" });

  const receipt = trace.track("Checkout Started", {
    plan: "pro",
    password: "hunter2",
  });

  await expect(receipt.settled).resolves.toStrictEqual({
    state: "settled",
    outcomes: {
      posthog: {
        status: "submitted",
        evidence: "sdk-call-returned",
        event: null,
        losses: [
          { path: "properties.password", reason: "redacted" },
          { path: "context.plan", reason: "omitted" },
          { path: "context.$current_url", reason: "omitted" },
        ],
      },
    },
  });
  expect(fake.calls).toStrictEqual([
    [
      "capture",
      {
        distinctId: "ada",
        event: "Checkout Started",
        properties: { plan: "pro" },
        groups: {},
        timestamp: new Date(TIMESTAMP),
        uuid: receipt.id,
      },
    ],
  ]);
});

test("through a Trace, a user switch needs no reset: each event goes under its own user, each sign-in merges the visitor, and the next user's traits never carry the previous user's", async () => {
  const fake = fakePostHog();
  const trace = createTrace(fake, { anonymousId: VISITOR });

  trace.start();
  trace.user({ id: "ada", traits: { plan: "pro" } });

  const first = trace.track("App Opened");

  trace.user({ id: "bob", traits: { role: "admin" } });

  const second = trace.track("App Opened");

  await Promise.all([first.settled, second.settled]);

  expect(fake.calls).toStrictEqual([
    [
      "identify",
      { distinctId: "ada", properties: { $anon_distinct_id: VISITOR } },
    ],
    ["unsetPersonProperties", { distinctId: "ada", properties: [] }],
    ["setPersonProperties", { distinctId: "ada", properties: { plan: "pro" } }],
    getCapture("ada", first.id),
    [
      "identify",
      { distinctId: "bob", properties: { $anon_distinct_id: VISITOR } },
    ],
    ["unsetPersonProperties", { distinctId: "bob", properties: [] }],
    [
      "setPersonProperties",
      { distinctId: "bob", properties: { role: "admin" } },
    ],
    getCapture("bob", second.id),
  ]);
});

test("through a Trace, after a sign-out an event goes under the visitor id, and without one it is skipped as unidentified", async () => {
  const withVisitor = fakePostHog();
  const withoutVisitor = fakePostHog();
  const visited = createTrace(withVisitor, { anonymousId: VISITOR });
  const unvisited = createTrace(withoutVisitor);

  visited.start();
  unvisited.start();
  visited.user({ id: "ada" });
  unvisited.user({ id: "ada" });

  const visitedSignedIn = visited.track("App Opened");
  const unvisitedSignedIn = unvisited.track("App Opened");

  visited.user(null);
  unvisited.user(null);

  const anonymous = visited.track("App Opened");
  const unidentified = unvisited.track("App Opened");

  await expect(anonymous.settled).resolves.toStrictEqual({
    state: "settled",
    outcomes: {
      posthog: {
        status: "submitted",
        evidence: "sdk-call-returned",
        event: null,
        losses: [],
      },
    },
  });
  await expect(unidentified.settled).resolves.toStrictEqual({
    state: "settled",
    outcomes: { posthog: { status: "skipped", reason: "unidentified" } },
  });
  expect(withVisitor.calls).toStrictEqual([
    [
      "identify",
      { distinctId: "ada", properties: { $anon_distinct_id: VISITOR } },
    ],
    getCapture("ada", visitedSignedIn.id),
    getCapture(VISITOR, anonymous.id),
  ]);
  expect(withoutVisitor.calls).toStrictEqual([
    getCapture("ada", unvisitedSignedIn.id),
  ]);
});

test("through a Trace, a user whose id PostHog would shorten is an identity step failed, that user's events are skipped as identity-failed, and the next user is unaffected", async () => {
  const fake = fakePostHog();
  const trace = createTrace(fake, { anonymousId: VISITOR });
  const failures: TraceDiagnosticEvent["context"][] = [];

  trace.diagnostics.events.subscribe(({ type, context }) => {
    if (type === "identity step failed") {
      failures.push(context);
    }
  });
  trace.start();
  trace.user({ id: "u".repeat(201) });

  const skipped = await trace.track("App Opened").settled;

  trace.user({ id: "bob" });

  const next = trace.track("App Opened");

  await next.settled;

  expect(skipped).toStrictEqual({
    state: "settled",
    outcomes: { posthog: { status: "skipped", reason: "identity-failed" } },
  });
  expect(failures).toStrictEqual([
    { step: "identify", reason: "error" },
    { step: "identify", reason: "error" },
  ]);
  expect(fake.calls).toStrictEqual([
    [
      "identify",
      { distinctId: "bob", properties: { $anon_distinct_id: VISITOR } },
    ],
    getCapture("bob", next.id),
  ]);
});

test("through a Trace, traits set while signed out go to the visitor's person, and the sign-in merges it and sets them on the user's", async () => {
  const fake = fakePostHog();
  const trace = createTrace(fake, { anonymousId: VISITOR });

  trace.start();
  trace.traits({ plan: "pro" });
  trace.user({ id: "ada" });

  const receipt = trace.track("App Opened");

  await receipt.settled;

  expect(fake.calls).toStrictEqual([
    ["unsetPersonProperties", { distinctId: VISITOR, properties: [] }],
    [
      "setPersonProperties",
      { distinctId: VISITOR, properties: { plan: "pro" } },
    ],
    [
      "identify",
      { distinctId: "ada", properties: { $anon_distinct_id: VISITOR } },
    ],
    ["unsetPersonProperties", { distinctId: "ada", properties: [] }],
    ["setPersonProperties", { distinctId: "ada", properties: { plan: "pro" } }],
    getCapture("ada", receipt.id),
  ]);
});

test("through a Trace, a membership rides on every later event, and leaving it takes it off the next one", async () => {
  const fake = fakePostHog();
  const trace = createTrace(fake);

  trace.start();
  trace.user({ id: "ada" });
  trace.group("workspace", { id: "w_1", traits: { tier: "team" } });

  const joined = trace.track("App Opened");

  trace.group("workspace", null);

  const left = trace.track("App Opened");

  await Promise.all([joined.settled, left.settled]);

  expect(fake.calls).toStrictEqual([
    [
      "groupIdentify",
      {
        groupType: "workspace",
        groupKey: "w_1",
        properties: { tier: "team" },
        distinctId: "ada",
      },
    ],
    getCapture("ada", joined.id, { groups: { workspace: "w_1" } }),
    getCapture("ada", left.id),
  ]);
});

test("through a Trace, a consent-gated destination hands posthog-node nothing until its purpose is granted, and nothing once it is withdrawn", async () => {
  const fake = fakePostHog();

  const trace = new Trace({
    events: { "App Opened": event() },
    destinations: {
      posthog: posthog({ sdk: fake.sdk, anonymousId: VISITOR }),
    },
    consent: { posthog: ["analytics"] },
    now: () => TIMESTAMP,
  });

  trace.start();

  const before = trace.track("App Opened");

  trace.consent.set({ analytics: "granted" });

  const granted = trace.track("App Opened");

  trace.consent.set({ analytics: "denied" });

  const withdrawn = trace.track("App Opened");

  await expect(before.settled).resolves.toStrictEqual({
    state: "dropped",
    reason: "consent",
  });
  await expect(granted.settled).resolves.toStrictEqual({
    state: "settled",
    outcomes: {
      posthog: {
        status: "submitted",
        evidence: "sdk-call-returned",
        event: null,
        losses: [],
      },
    },
  });
  await expect(withdrawn.settled).resolves.toStrictEqual({
    state: "dropped",
    reason: "consent",
  });
  expect(fake.calls).toStrictEqual([getCapture(VISITOR, granted.id)]);
});

test("per-request Traces over one shared client never mix their users or visitors, however their calls interleave", async () => {
  const fake = fakePostHog();

  const createRequest = (anonymousId: string) => {
    const trace = createTrace(fake, { anonymousId });

    trace.start();

    return trace;
  };

  const ada = createRequest("visitor-a");
  const bob = createRequest("visitor-b");

  const anonymous = ada.track("App Opened");

  bob.user({ id: "bob", traits: { plan: "team" } });
  ada.user({ id: "ada", traits: { plan: "pro" } });

  const first = bob.track("App Opened");

  ada.group("workspace", { id: "w_ada" });
  bob.group("workspace", { id: "w_bob", traits: { tier: "team" } });

  const second = ada.track("App Opened");

  bob.traits({ role: "admin" });
  ada.user(null);

  const third = ada.track("App Opened");
  const fourth = bob.track("App Opened");

  await Promise.all(
    [anonymous, first, second, third, fourth].map(({ settled }) => settled),
  );

  expect(fake.calls).toStrictEqual([
    getCapture("visitor-a", anonymous.id),
    [
      "identify",
      { distinctId: "bob", properties: { $anon_distinct_id: "visitor-b" } },
    ],
    ["unsetPersonProperties", { distinctId: "bob", properties: [] }],
    [
      "setPersonProperties",
      { distinctId: "bob", properties: { plan: "team" } },
    ],
    [
      "identify",
      { distinctId: "ada", properties: { $anon_distinct_id: "visitor-a" } },
    ],
    ["unsetPersonProperties", { distinctId: "ada", properties: [] }],
    ["setPersonProperties", { distinctId: "ada", properties: { plan: "pro" } }],
    getCapture("bob", first.id),
    [
      "groupIdentify",
      {
        groupType: "workspace",
        groupKey: "w_bob",
        properties: { tier: "team" },
        distinctId: "bob",
      },
    ],
    getCapture("ada", second.id, { groups: { workspace: "w_ada" } }),
    ["unsetPersonProperties", { distinctId: "bob", properties: [] }],
    [
      "setPersonProperties",
      { distinctId: "bob", properties: { role: "admin" } },
    ],
    getCapture("visitor-a", third.id),
    getCapture("bob", fourth.id, { groups: { workspace: "w_bob" } }),
  ]);
});

test("one adapter shared at module scope by per-request Traces never mixes their users", async () => {
  const fake = fakePostHog();
  const adapter = posthog({ sdk: fake.sdk });

  const createRequest = () => {
    const trace = new Trace({
      events: { "App Opened": event() },
      destinations: { posthog: adapter },
      now: () => TIMESTAMP,
    });

    trace.start();

    return trace;
  };

  const carol = createRequest();
  const dave = createRequest();

  carol.user({ id: "carol", traits: { plan: "pro" } });
  dave.user({ id: "dave", traits: { plan: "team" } });
  dave.group("workspace", { id: "w_dave", traits: { tier: "team" } });

  const first = dave.track("App Opened");
  const second = carol.track("App Opened");

  await Promise.all([first.settled, second.settled]);

  expect(fake.calls).toStrictEqual([
    ["unsetPersonProperties", { distinctId: "carol", properties: [] }],
    [
      "setPersonProperties",
      { distinctId: "carol", properties: { plan: "pro" } },
    ],
    ["unsetPersonProperties", { distinctId: "dave", properties: [] }],
    [
      "setPersonProperties",
      { distinctId: "dave", properties: { plan: "team" } },
    ],
    [
      "groupIdentify",
      {
        groupType: "workspace",
        groupKey: "w_dave",
        properties: { tier: "team" },
        distinctId: "dave",
      },
    ],
    getCapture("dave", first.id, { groups: { workspace: "w_dave" } }),
    getCapture("carol", second.id),
  ]);
});

test("through a Trace, a flush answers flushed once PostHog accepted the queue, and failed with posthog-node's error when it refused it", async () => {
  const fake = fakePostHog();
  const trace = createTrace(fake);
  const refused = new Error("HTTP error while fetching PostHog: status=400");

  trace.start();
  trace.user({ id: "ada" });
  trace.track("App Opened");

  const accepted = trace.flush({ timeout: 1_000 });

  await nextMacrotask();
  fake.send();

  expect(await accepted).toEqual({
    drained: true,
    destinations: { posthog: { status: "flushed" } },
  });

  trace.track("App Opened");

  const refusal = trace.flush({ timeout: 1_000 });

  await nextMacrotask();
  fake.refuse(refused);

  expect(await refusal).toEqual({
    drained: true,
    destinations: { posthog: { status: "failed", error: refused } },
  });
});
