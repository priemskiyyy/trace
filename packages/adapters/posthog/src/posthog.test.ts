import { event, Trace, TraceError } from "@priemskiyyy/trace";
import type {
  TraceDiagnosticEvent,
  TrackContext,
  TrackedEvent,
} from "@priemskiyyy/trace";
import { expect, onTestFinished, test } from "vitest";

import { fakePostHog } from "src/fakePostHog.fixture";
import { posthog } from "src/posthog";

const EVENT_ID = "0b5f6c9e-8f1a-4c2d-9a3b-2f6e1d4c7a88";
const TIMESTAMP = 1_767_225_600_000;

const context: TrackContext = {
  signal: new AbortController().signal,
  currentGeneration: () => 1,
  now: () => TIMESTAMP,
};

const events = {
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
    id: EVENT_ID,
    name: "Checkout Started",
    properties: { cart: { id: "cart_1" }, value: 49.5 },
    context: { app: { version: "2.4.0" } },
    identity: { generation: 1, user: { id: "ada" }, traits: {}, groups: {} },
    timestamp: TIMESTAMP,
    ...overrides,
  });

const open = (fake = fakePostHog()) => ({
  fake,
  session: posthog({ sdk: fake.sdk }).open(),
});

const createTrace = (
  fake = fakePostHog(),
  options: { consent?: { product: ["analytics"] } } = {},
) => {
  const trace = new Trace({
    events,
    destinations: { product: posthog({ sdk: fake.sdk }) },
    now: () => TIMESTAMP,
    ...options,
  });

  onTestFinished(trace.dispose);

  return { fake, trace };
};

const getThrown = (call: () => unknown) => {
  try {
    call();
  } catch (error) {
    return error;
  }

  return null;
};

const getIdentityDiagnostics = (diagnostics: TraceDiagnosticEvent[]) =>
  diagnostics.flatMap(({ type, context: detail }) => {
    if (!type.startsWith("identity step")) {
      return [];
    }

    return [{ type, detail }];
  });

const getSubmitted = (id: string) => ({
  state: "settled",
  outcomes: {
    product: {
      status: "submitted",
      evidence: "sdk-call-returned",
      event: { id },
      losses: [],
    },
  },
});

const NOTHING_CALLED = {
  init: 0,
  shutdown: 0,
  capture: [],
  identify: [],
  setPersonProperties: [],
  unsetPersonProperties: [],
  group: [],
  register: [],
  reset: 0,
  opt_in_capturing: [],
  opt_out_capturing: 0,
};

test("creating the adapter calls nothing on PostHog", () => {
  const fake = fakePostHog({ loaded: false });

  posthog({ sdk: fake.sdk });

  expect(fake.calls).toStrictEqual(NOTHING_CALLED);
});

test("open refuses a PostHog that was never initialized with NOT_INITIALIZED, and opens once the application has", () => {
  const fake = fakePostHog({ loaded: false });
  const adapter = posthog({ sdk: fake.sdk });

  expect(getThrown(adapter.open)).toStrictEqual(
    new TraceError({
      code: "NOT_INITIALIZED",
      message:
        "PostHog is not initialized. Call posthog.init before trace.start().",
    }),
  );
  expect(fake.calls).toStrictEqual(NOTHING_CALLED);

  fake.sdk.init("phc_project_key");

  expect(adapter.open().native).toBe(fake.sdk);
});

test.each(["always", "on_reject"] satisfies ("always" | "on_reject")[])(
  "open refuses cookieless_mode %s with UNSUPPORTED, before calling anything",
  (mode) => {
    const fake = fakePostHog({ config: { cookieless_mode: mode } });

    expect(getThrown(posthog({ sdk: fake.sdk }).open)).toStrictEqual(
      new TraceError({
        code: "UNSUPPORTED",
        message: `PostHog's cookieless_mode "${mode}" ignores opt-out or replaces the person on a consent change, so Trace cannot gate it or keep its identity.`,
      }),
    );
    expect(fake.calls).toStrictEqual(NOTHING_CALLED);
  },
);

test("an event is one capture with its properties over its context, its timestamp and its id as uuid", () => {
  const { fake, session } = open();

  const answer = session.track(createEvent(), context);

  expect(fake.calls.capture).toStrictEqual([
    {
      event: "Checkout Started",
      properties: {
        app: { version: "2.4.0" },
        cart: { id: "cart_1" },
        value: 49.5,
      },
      options: { timestamp: new Date(TIMESTAMP), uuid: EVENT_ID },
    },
  ]);
  expect(fake.captured).toStrictEqual([
    {
      uuid: EVENT_ID,
      event: "Checkout Started",
      properties: {
        $groups: {},
        distinct_id: "anonymous-1",
        app: { version: "2.4.0" },
        cart: { id: "cart_1" },
        value: 49.5,
        token: "phc_fake",
        $process_person_profile: true,
      },
      timestamp: new Date(TIMESTAMP),
    },
  ]);
  expect(answer).toStrictEqual({
    status: "submitted",
    evidence: "sdk-call-returned",
    event: { id: EVENT_ID },
    losses: [],
  });
});

test("an event's losses are the adapter's: a shadowed context key, a control key, and a string posthog-js cuts", () => {
  const { fake, session } = open(
    fakePostHog({ config: { properties_string_max_length: 40 } }),
  );

  const note = "n".repeat(41);

  const answer = session.track(
    createEvent({
      properties: { plan: "pro", note, distinct_id: "grace" },
      context: { plan: "free" },
    }),
    context,
  );

  expect(fake.calls.capture[0]?.properties).toStrictEqual({
    plan: "pro",
    note,
  });
  expect(fake.captured[0]?.properties).toStrictEqual({
    $groups: {},
    distinct_id: "anonymous-1",
    plan: "pro",
    note: note.slice(0, 40),
    token: "phc_fake",
    $process_person_profile: true,
  });
  expect(answer).toStrictEqual({
    status: "submitted",
    evidence: "sdk-call-returned",
    event: { id: EVENT_ID },
    losses: [
      { path: "properties.note", reason: "truncated" },
      { path: "properties.distinct_id", reason: "omitted" },
      { path: "context.plan", reason: "omitted" },
    ],
  });
});

test.each(["$identify", "$create_alias", "$merge_dangerously"])(
  "an event named %s, one of PostHog's own person events, is skipped as unsupported and never captured",
  (name) => {
    const { fake, session } = open();

    expect(
      session.track(
        createEvent({ name, properties: { alias: "grace" } }),
        context,
      ),
    ).toStrictEqual({ status: "skipped", reason: "unsupported" });
    expect(fake.calls.capture).toStrictEqual([]);
  },
);

test("the receipt names the event by the uuid PostHog kept, which posthog-js cuts past properties_string_max_length", () => {
  const { fake, session } = open(
    fakePostHog({ config: { properties_string_max_length: 20 } }),
  );

  expect(
    session.track(createEvent({ properties: {}, context: {} }), context),
  ).toStrictEqual({
    status: "submitted",
    evidence: "sdk-call-returned",
    event: { id: "0b5f6c9e-8f1a-4c2d-9" },
    losses: [],
  });
  expect(fake.captured.map(({ uuid }) => uuid)).toStrictEqual([
    "0b5f6c9e-8f1a-4c2d-9",
  ]);
});

test("an event PostHog drops, through opt-out or before_send, is provider-filtered with its losses", () => {
  const { fake, session } = open();

  fake.state.filtered = true;

  const answer = session.track(
    createEvent({ properties: { plan: "pro" }, context: { plan: "free" } }),
    context,
  );

  expect(fake.calls.capture).toStrictEqual([
    {
      event: "Checkout Started",
      properties: { plan: "pro" },
      options: { timestamp: new Date(TIMESTAMP), uuid: EVENT_ID },
    },
  ]);
  expect(answer).toStrictEqual({
    status: "dropped",
    reason: "provider-filtered",
    losses: [{ path: "context.plan", reason: "omitted" }],
  });
});

test("a user, traits and groups go through PostHog's own calls", () => {
  const { fake, session } = open();

  session.identify?.({ user: { id: "ada" } });
  session.traits?.(
    freeze({ user: { id: "ada" }, set: { plan: "pro" }, remove: ["legacy"] }),
  );
  session.group?.(
    freeze({
      user: { id: "ada" },
      group: { type: "workspace", id: "w_1", traits: { tier: "team" } },
    }),
  );
  session.group?.({
    user: { id: "ada" },
    group: { type: "team", id: "t_1", traits: {} },
  });
  session.group?.({
    user: { id: "ada" },
    group: { type: "workspace", id: null, traits: {} },
  });

  expect(fake.calls.identify).toStrictEqual(["ada"]);
  expect(fake.calls.unsetPersonProperties).toStrictEqual([["legacy"]]);
  expect(fake.calls.setPersonProperties).toStrictEqual([{ plan: "pro" }]);
  expect(fake.calls.group).toStrictEqual([
    { type: "workspace", key: "w_1", properties: { tier: "team" } },
    { type: "team", key: "t_1", properties: undefined },
  ]);
  expect(fake.calls.register).toStrictEqual([{ $groups: { team: "t_1" } }]);
  expect(fake.state.groups).toStrictEqual({ team: "t_1" });
});

test("reset is PostHog's reset, after which the last collection state is applied again", () => {
  const { fake, session } = open(
    fakePostHog({ config: { opt_out_capturing_by_default: true } }),
  );

  session.collection?.(true);
  session.identify?.({ user: { id: "ada" } });

  const answer = session.reset?.();

  expect(answer).toBe(undefined);
  expect(fake.calls.reset).toBe(1);
  expect(fake.calls.opt_in_capturing).toStrictEqual([
    { captureEventName: false },
    { captureEventName: false },
  ]);
  expect(fake.state).toStrictEqual({
    distinctId: "anonymous-2",
    groups: {},
    groupProperties: {},
    optedOut: false,
    filtered: false,
  });
});

test("reset applies an opt-out again, since PostHog's reset returns consent to a default that opts in", () => {
  const { fake, session } = open();

  session.collection?.(false);
  session.reset?.();

  expect(fake.calls.opt_out_capturing).toBe(2);
  expect(fake.state.optedOut).toBe(true);
});

test("reset leaves consent to PostHog's configuration when Trace never switched collection", () => {
  const { fake, session } = open();

  session.reset?.();

  expect(fake.calls.opt_in_capturing).toStrictEqual([]);
  expect(fake.calls.opt_out_capturing).toBe(0);
});

test("after reset, leaving a group registers only the memberships written since", () => {
  const { fake, session } = open();

  session.group?.({
    user: { id: "ada" },
    group: { type: "workspace", id: "w_1", traits: {} },
  });
  session.reset?.();
  session.group?.({
    user: null,
    group: { type: "team", id: "t_1", traits: {} },
  });
  session.group?.({
    user: null,
    group: { type: "team", id: null, traits: {} },
  });

  expect(fake.calls.register).toStrictEqual([{ $groups: {} }]);
});

test("collection opts in without an $opt_in event and opts out, in either direction right after open", () => {
  const closed = open();

  const granted = open(
    fakePostHog({ config: { opt_out_capturing_by_default: true } }),
  );

  closed.session.collection?.(false);
  granted.session.collection?.(true);

  expect(closed.fake.calls.opt_out_capturing).toBe(1);
  expect(closed.fake.state.optedOut).toBe(true);
  expect(granted.fake.calls.opt_in_capturing).toStrictEqual([
    { captureEventName: false },
  ]);
  expect(granted.fake.state.optedOut).toBe(false);
  expect(granted.fake.captured).toStrictEqual([]);
});

test("there is no flush: posthog-js sends its batches on its own schedule", () => {
  const { session } = open();

  expect(session.flush).toBe(undefined);
});

test("native is the SDK the application injected", () => {
  const { fake, session } = open();

  expect(session.native).toBe(fake.sdk);
});

test("through Trace, a PostHog that was never initialized fails the start, and a start after init delivers the event tracked meanwhile", async () => {
  const { fake, trace } = createTrace(fakePostHog({ loaded: false }));

  trace.start();

  const receipt = trace.track("Note Added", { note: "during boot" });

  expect(trace.destination("product").status.get()).toStrictEqual({
    state: "failed",
    error: new TraceError({
      code: "NOT_INITIALIZED",
      message:
        "PostHog is not initialized. Call posthog.init before trace.start().",
    }),
  });
  expect(fake.calls.capture).toStrictEqual([]);

  fake.sdk.init("phc_project_key");
  trace.start();

  expect(await receipt.settled).toStrictEqual(getSubmitted(receipt.id));
  expect(fake.captured.map(({ event: name }) => name)).toStrictEqual([
    "Note Added",
  ]);
});

test("through Trace, a cookieless PostHog fails the destination with UNSUPPORTED and receives nothing", async () => {
  const { fake, trace } = createTrace(
    fakePostHog({ config: { cookieless_mode: "on_reject" } }),
  );

  trace.start();
  trace.user({ id: "ada" });

  const receipt = trace.track("Note Added", { note: "never sent" });

  expect(trace.destination("product").status.get()).toStrictEqual({
    state: "failed",
    error: new TraceError({
      code: "UNSUPPORTED",
      message: `PostHog's cookieless_mode "on_reject" ignores opt-out or replaces the person on a consent change, so Trace cannot gate it or keep its identity.`,
    }),
  });

  trace.dispose();

  expect(await receipt.settled).toStrictEqual({
    state: "settled",
    outcomes: { product: { status: "dropped", reason: "disposed" } },
  });
  expect(fake.calls).toStrictEqual(NOTHING_CALLED);
});

test("through Trace, a user switch resets PostHog before the next identify, and the granted collection comes back, so the next user's events are captured", async () => {
  const { fake, trace } = createTrace(
    fakePostHog({ config: { opt_out_capturing_by_default: true } }),
    { consent: { product: ["analytics"] } },
  );

  trace.consent.set({ analytics: "granted" });
  trace.start();
  trace.user({ id: "ada" });
  await trace.track("Note Added", { note: "from ada" }).settled;
  trace.user({ id: "bob" });

  const receipt = trace.track("Note Added", { note: "from bob" });
  const settled = await receipt.settled;

  expect(fake.calls.identify).toStrictEqual(["ada", "bob"]);
  expect(fake.calls.reset).toBe(1);
  expect(fake.calls.opt_in_capturing).toStrictEqual([
    { captureEventName: false },
    { captureEventName: false },
  ]);
  expect(
    fake.captured.map(({ properties }) => [
      properties.note,
      properties.distinct_id,
    ]),
  ).toStrictEqual([
    ["from ada", "ada"],
    ["from bob", "bob"],
  ]);
  expect(settled).toStrictEqual(getSubmitted(receipt.id));
});

test("through Trace, a gated destination opens opted in while its purpose is granted, is opted out when it is withdrawn, and gets nothing meanwhile", async () => {
  const { fake, trace } = createTrace(
    fakePostHog({ config: { opt_out_capturing_by_default: true } }),
    { consent: { product: ["analytics"] } },
  );

  trace.consent.set({ analytics: "granted" });
  trace.start();
  await trace.track("Note Added", { note: "granted" }).settled;
  trace.consent.set({ analytics: "denied" });

  const denied = await trace.track("Note Added", { note: "denied" }).settled;

  expect(fake.calls.opt_in_capturing).toStrictEqual([
    { captureEventName: false },
  ]);
  expect(fake.calls.opt_out_capturing).toBe(1);
  expect(denied).toStrictEqual({ state: "dropped", reason: "consent" });
  expect(fake.calls.capture.map(({ properties }) => properties)).toStrictEqual([
    { note: "granted" },
  ]);
});

test("through Trace, a gated destination whose purpose is still unknown opens opted out", () => {
  const { fake, trace } = createTrace(fakePostHog(), {
    consent: { product: ["analytics"] },
  });

  trace.start();

  expect(fake.calls.opt_out_capturing).toBe(1);
  expect(fake.calls.opt_in_capturing).toStrictEqual([]);
  expect(fake.state.optedOut).toBe(true);
});

test('through Trace, under person_profiles "never" identity steps are unsupported, events stay with the anonymous person, and a sign-out still resets', async () => {
  const { fake, trace } = createTrace(
    fakePostHog({ config: { person_profiles: "never" } }),
  );

  const diagnostics: TraceDiagnosticEvent[] = [];

  onTestFinished(
    trace.diagnostics.events.subscribe((diagnostic) => {
      diagnostics.push(diagnostic);
    }),
  );
  trace.start();
  trace.user({ id: "ada", traits: { plan: "pro" } });
  trace.group("workspace", { id: "w_1" });

  const receipt = trace.track("Note Added", { note: "anonymous" });
  const settled = await receipt.settled;

  trace.user(null);

  expect(getIdentityDiagnostics(diagnostics)).toStrictEqual([
    { type: "identity step unsupported", detail: { step: "identify" } },
    { type: "identity step unsupported", detail: { step: "traits" } },
    { type: "identity step unsupported", detail: { step: "group" } },
  ]);
  expect(fake.calls.identify).toStrictEqual([]);
  expect(fake.calls.setPersonProperties).toStrictEqual([]);
  expect(fake.calls.group).toStrictEqual([]);
  expect(fake.calls.reset).toBe(1);
  expect(
    fake.captured.map(({ properties }) => properties.distinct_id),
  ).toStrictEqual(["anonymous-1"]);
  expect(settled).toStrictEqual(getSubmitted(receipt.id));
});

test("through Trace, an id posthog-js refuses is an identity step unsupported, and the events stay anonymous", async () => {
  const { fake, trace } = createTrace();
  const diagnostics: TraceDiagnosticEvent[] = [];

  onTestFinished(
    trace.diagnostics.events.subscribe((diagnostic) => {
      diagnostics.push(diagnostic);
    }),
  );
  trace.start();
  trace.user({ id: "null" });
  await trace.track("Note Added", { note: "refused" }).settled;

  expect(getIdentityDiagnostics(diagnostics)).toStrictEqual([
    { type: "identity step unsupported", detail: { step: "identify" } },
  ]);
  expect(fake.calls.identify).toStrictEqual([]);
  expect(
    fake.captured.map(({ properties }) => properties.distinct_id),
  ).toStrictEqual(["anonymous-1"]);
});

test("through Trace, a user whose id PostHog would shorten is an identity step failed, that user's events are skipped as identity-failed, and the next user is unaffected", async () => {
  const { fake, trace } = createTrace();
  const diagnostics: TraceDiagnosticEvent[] = [];

  onTestFinished(
    trace.diagnostics.events.subscribe((diagnostic) => {
      diagnostics.push(diagnostic);
    }),
  );
  trace.start();
  trace.user({ id: "u".repeat(201) });

  const skipped = await trace.track("Note Added", { note: "long id" }).settled;

  trace.user({ id: "bob" });

  const bob = trace.track("Note Added", { note: "from bob" });

  expect(skipped).toStrictEqual({
    state: "settled",
    outcomes: { product: { status: "skipped", reason: "identity-failed" } },
  });
  expect(await bob.settled).toStrictEqual(getSubmitted(bob.id));
  expect(getIdentityDiagnostics(diagnostics)).toStrictEqual([
    {
      type: "identity step failed",
      detail: { step: "identify", reason: "error" },
    },
    {
      type: "identity step failed",
      detail: { step: "identify", reason: "error" },
    },
  ]);
  expect(fake.calls.identify).toStrictEqual(["bob"]);
  expect(
    fake.captured.map(({ properties }) => [
      properties.note,
      properties.distinct_id,
    ]),
  ).toStrictEqual([["from bob", "bob"]]);
});

test("through Trace, a group whose key posthog-js would cut is an identity step unsupported, and the user's events keep flowing without it", async () => {
  const { fake, trace } = createTrace(
    fakePostHog({ config: { properties_string_max_length: 40 } }),
  );

  const diagnostics: TraceDiagnosticEvent[] = [];

  onTestFinished(
    trace.diagnostics.events.subscribe((diagnostic) => {
      diagnostics.push(diagnostic);
    }),
  );
  trace.start();
  trace.user({ id: "ada" });
  trace.group("workspace", { id: "k".repeat(41) });

  const receipt = trace.track("Note Added", { note: "after" });

  expect(await receipt.settled).toStrictEqual(getSubmitted(receipt.id));
  expect(getIdentityDiagnostics(diagnostics)).toStrictEqual([
    { type: "identity step unsupported", detail: { step: "group" } },
  ]);
  expect(fake.calls.group).toStrictEqual([]);
  expect(
    fake.captured.map(({ properties }) => [
      properties.distinct_id,
      properties.$groups,
    ]),
  ).toStrictEqual([["ada", {}]]);
});

test("through Trace, a flush reports unsupported for PostHog", async () => {
  const { trace } = createTrace();

  trace.start();

  expect(await trace.flush({ timeout: 1_000 })).toEqual({
    drained: true,
    destinations: { product: { status: "unsupported" } },
  });
});

test("through Trace, the native handle is the injected SDK once the destination is ready, and null before", () => {
  const { fake, trace } = createTrace();

  expect(trace.destination("product").native).toBe(null);

  trace.start();

  expect(trace.destination("product").native).toBe(fake.sdk);
});

test("Trace never initializes or closes PostHog", async () => {
  const { fake, trace } = createTrace(fakePostHog(), {
    consent: { product: ["analytics"] },
  });

  trace.consent.set({ analytics: "granted" });
  trace.start();
  trace.user({ id: "ada", traits: { plan: "pro" } });
  trace.group("workspace", { id: "w_1", traits: { tier: "team" } });
  trace.track("Note Added", { note: "all of it" });
  trace.group("workspace", null);
  trace.user(null);
  await trace.flush();
  trace.dispose();

  expect(fake.calls.init).toBe(0);
  expect(fake.calls.shutdown).toBe(0);
});
