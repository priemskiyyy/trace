import { event, Trace } from "@priemskiyyy/trace";
import { testAnalyticsAdapter } from "@priemskiyyy/trace/testing";
import { PostHog } from "posthog-node";
import { afterEach, expect, test } from "vitest";

import { posthog } from "src/posthog";
import { createTrackedEvent, TRACKED_EVENT } from "src/trackedEvent.fixture";

const { id: EVENT_ID, timestamp: TIMESTAMP } = TRACKED_EVENT;
const VISITOR = "visitor-7";
const ANONYMOUS = { generation: 0, user: null, traits: {}, groups: {} };
const SENT_AT = new Date(TIMESTAMP).toISOString();

const LIBRARY = {
  $lib: "posthog-node",
  $lib_version: "5.52.6",
  $is_server: true,
  $geoip_disable: true,
};

const context = {
  signal: new AbortController().signal,
  currentGeneration: () => 1,
  now: () => TIMESTAMP,
};

const flushContext = { timeout: 1_000, signal: new AbortController().signal };

const clients: PostHog[] = [];

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.shutdown()));
});

// posthog-node 5.52.6 with its fetch option: every batch lands here, and nothing reaches the network.
const createClient = () => {
  const sent: unknown[] = [];
  const state = { status: 200 };

  const client = new PostHog("phc_trace_test", {
    host: "https://posthog.example.test",
    flushAt: 1_000,
    flushInterval: 0,
    fetchRetryCount: 0,
    disableCompression: true,
    fetch: async (_url, { body }) => {
      const parsed: unknown =
        typeof body === "string" ? JSON.parse(body) : null;

      if (
        typeof parsed !== "object" ||
        parsed === null ||
        !("batch" in parsed) ||
        !Array.isArray(parsed.batch)
      ) {
        throw new Error("posthog-node sent a body without a batch.");
      }

      const batch: unknown[] = parsed.batch;

      sent.push(...batch);

      return {
        status: state.status,
        text: async () => "",
        json: async () => ({}),
      };
    },
  });

  clients.push(client);

  return { client, sent, state };
};

const createRequestTrace = (
  client: PostHog,
  options: { anonymousId?: string } = {},
) =>
  new Trace({
    events: { "App Opened": event() },
    destinations: { posthog: posthog({ sdk: client, ...options }) },
    now: () => TIMESTAMP,
  });

const getSentEvent = (
  distinctId: string,
  uuid: string,
  properties: Record<string, unknown> = {},
) => ({
  event: "App Opened",
  distinct_id: distinctId,
  uuid,
  timestamp: SENT_AT,
  properties: { ...properties, ...LIBRARY },
});

const getSentIdentify = (distinctId: string, visitorId: string) => ({
  event: "$identify",
  distinct_id: distinctId,
  uuid: expect.any(String),
  timestamp: expect.any(String),
  properties: {
    $set: {},
    $set_once: {},
    $anon_distinct_id: visitorId,
    ...LIBRARY,
  },
});

const getSentUpdate = (
  distinctId: string,
  properties: Record<string, unknown>,
) => ({
  event: "$set",
  distinct_id: distinctId,
  uuid: expect.any(String),
  timestamp: expect.any(String),
  properties: { ...properties, ...LIBRARY },
});

const getThrown = (run: () => unknown) => {
  try {
    run();
  } catch (error) {
    return error;
  }

  return null;
};

test("the real SDK sends the event in its batch under its user, with its uuid, its time, its properties over its context and its memberships as $groups", async () => {
  const { client, sent } = createClient();
  const session = posthog({ sdk: client, anonymousId: VISITOR }).open();

  const answer = session.track(
    createTrackedEvent({
      properties: { cart: { id: "cart_1" }, value: 49.5, coupon: null },
      context: { value: 1, locale: "de" },
      identity: {
        generation: 1,
        user: { id: "ada" },
        traits: {},
        groups: { workspace: { id: "w_1", traits: { tier: "team" } } },
      },
    }),
    context,
  );

  await expect(session.flush?.(flushContext)).resolves.toStrictEqual({
    status: "flushed",
  });

  expect(answer).toStrictEqual({
    status: "submitted",
    evidence: "sdk-call-returned",
    losses: [{ path: "context.value", reason: "omitted" }],
  });
  expect(sent).toStrictEqual([
    {
      event: "Checkout Started",
      distinct_id: "ada",
      uuid: EVENT_ID,
      timestamp: SENT_AT,
      properties: {
        value: 49.5,
        locale: "de",
        cart: { id: "cart_1" },
        coupon: null,
        $groups: { workspace: "w_1" },
        ...LIBRARY,
      },
    },
  ]);
});

test("the real SDK takes a $groups property as the event's memberships and a $set property as a change to the person, which is why the adapter hands it no name PostHog owns", async () => {
  const { client, sent } = createClient();
  const session = posthog({ sdk: client }).open();
  const owned = { $groups: { team: "t_9" }, $set: { plan: "free" } };

  client.capture({
    distinctId: "ada",
    event: "Sent Directly",
    properties: owned,
  });

  const answer = session.track(
    createTrackedEvent({ properties: { ...owned, value: 1 } }),
    context,
  );

  await session.flush?.(flushContext);

  expect(answer).toStrictEqual({
    status: "submitted",
    evidence: "sdk-call-returned",
    losses: [
      { path: "properties.$groups", reason: "omitted" },
      { path: "properties.$set", reason: "omitted" },
    ],
  });
  expect(sent).toStrictEqual([
    {
      event: "Sent Directly",
      distinct_id: "ada",
      uuid: expect.any(String),
      timestamp: expect.any(String),
      properties: { ...owned, ...LIBRARY },
    },
    {
      event: "Checkout Started",
      distinct_id: "ada",
      uuid: EVENT_ID,
      timestamp: SENT_AT,
      properties: { value: 1, ...LIBRARY },
    },
  ]);
});

test("the real SDK files an event without a distinct id under an enclosing withContext id, or under no person, so the adapter skips such an event as unidentified before calling it", async () => {
  const { client, sent } = createClient();
  const session = posthog({ sdk: client }).open();

  client.withContext({ distinctId: "ada" }, () => {
    client.capture({ event: "Captured In Context" });
  });
  client.capture({ event: "Captured Without Anyone" });

  const answer = client.withContext({ distinctId: "ada" }, () =>
    session.track(createTrackedEvent({ identity: ANONYMOUS }), context),
  );

  await session.flush?.(flushContext);

  expect(answer).toStrictEqual({ status: "skipped", reason: "unidentified" });
  expect(sent).toStrictEqual([
    {
      event: "Captured In Context",
      distinct_id: "ada",
      uuid: expect.any(String),
      timestamp: expect.any(String),
      properties: { ...LIBRARY },
    },
    {
      event: "Captured Without Anyone",
      distinct_id: expect.any(String),
      uuid: expect.any(String),
      timestamp: expect.any(String),
      properties: { $process_person_profile: false, ...LIBRARY },
    },
  ]);
});

test("in the real SDK a sign-in merges the visitor, traits reach the person as $unset and $set, and a group's traits reach PostHog as a $groupidentify under the user", async () => {
  const { client, sent } = createClient();
  const session = posthog({ sdk: client, anonymousId: VISITOR }).open();

  session.identify?.({ user: { id: "ada" } });
  session.traits?.({
    user: { id: "ada" },
    set: { plan: "pro" },
    remove: ["role"],
  });
  session.group?.({
    user: { id: "ada" },
    group: {
      type: "workspace",
      id: "w_1",
      traits: { tier: "team", legacy: null },
    },
  });
  await session.flush?.(flushContext);

  expect(sent).toStrictEqual([
    getSentIdentify("ada", VISITOR),
    getSentUpdate("ada", { $unset: ["role"] }),
    getSentUpdate("ada", { $set: { plan: "pro" } }),
    {
      event: "$groupidentify",
      distinct_id: "ada",
      uuid: expect.any(String),
      timestamp: expect.any(String),
      properties: {
        $group_type: "workspace",
        $group_key: "w_1",
        $group_set: { tier: "team", legacy: null },
        ...LIBRARY,
      },
    },
  ]);
});

test("the real SDK sends nothing for an empty set or unset and drops a blank name from an unset, which the adapter reports as unsupported", async () => {
  const { client, sent } = createClient();
  const session = posthog({ sdk: client }).open();

  const thrown = getThrown(() =>
    session.traits?.({ user: { id: "ada" }, set: {}, remove: ["  "] }),
  );

  await session.flush?.(flushContext);

  expect(thrown).toStrictEqual(
    expect.objectContaining({ name: "TraceError", code: "UNSUPPORTED" }),
  );
  expect(sent).toStrictEqual([]);
});

test("a web session's $session_id and $current_url reach an event through the application's withContext, while the same names in Trace's context are left out", async () => {
  const { client, sent } = createClient();
  const trace = createRequestTrace(client);

  trace.start();
  trace.user({ id: "ada" });

  const receipt = client.withContext(
    { sessionId: "session-1", properties: { $current_url: "/checkout" } },
    () =>
      trace.track("App Opened", undefined, {
        context: { $current_url: "/ignored" },
      }),
  );

  await expect(receipt.settled).resolves.toStrictEqual({
    state: "settled",
    outcomes: {
      posthog: {
        status: "submitted",
        evidence: "sdk-call-returned",
        event: null,
        losses: [{ path: "context.$current_url", reason: "omitted" }],
      },
    },
  });
  await trace.flush();

  expect(sent).toStrictEqual([
    getSentEvent("ada", receipt.id, {
      $current_url: "/checkout",
      $session_id: "session-1",
    }),
  ]);
  trace.dispose();
});

test("per-request Traces over one real client never mix their users or visitors, even when some calls run inside another request's withContext", async () => {
  const { client, sent } = createClient();
  const shared = posthog({ sdk: client });

  const createSharedTrace = () =>
    new Trace({
      events: { "App Opened": event() },
      destinations: { posthog: shared },
      now: () => TIMESTAMP,
    });

  const ada = createRequestTrace(client, { anonymousId: "visitor-a" });
  const bob = createRequestTrace(client, { anonymousId: "visitor-b" });
  const carol = createSharedTrace();
  const dave = createSharedTrace();

  const inOtherContext = <TResult>(run: () => TResult) =>
    client.withContext({ distinctId: "context-user" }, run);

  for (const trace of [ada, bob, carol, dave]) {
    trace.start();
  }

  ada.user({ id: "ada", traits: { plan: "pro" } });
  inOtherContext(() => {
    bob.user({ id: "bob" });
  });
  bob.group("workspace", { id: "w_bob", traits: { tier: "team" } });

  const fromAda = inOtherContext(() => ada.track("App Opened"));
  const fromBob = bob.track("App Opened");

  carol.user({ id: "carol" });
  dave.user({ id: "dave" });

  const fromDave = inOtherContext(() => dave.track("App Opened"));
  const fromCarol = carol.track("App Opened");

  ada.user(null);

  const signedOut = ada.track("App Opened");

  await Promise.all(
    [ada, bob, carol, dave].map(async (trace) => {
      await trace.flush();
      trace.dispose();
    }),
  );

  expect(sent).toStrictEqual([
    getSentIdentify("ada", "visitor-a"),
    getSentUpdate("ada", { $set: { plan: "pro" } }),
    getSentIdentify("bob", "visitor-b"),
    {
      event: "$groupidentify",
      distinct_id: "bob",
      uuid: expect.any(String),
      timestamp: expect.any(String),
      properties: {
        $group_type: "workspace",
        $group_key: "w_bob",
        $group_set: { tier: "team" },
        ...LIBRARY,
      },
    },
    getSentEvent("ada", fromAda.id),
    getSentEvent("bob", fromBob.id, { $groups: { workspace: "w_bob" } }),
    getSentEvent("dave", fromDave.id),
    getSentEvent("carol", fromCarol.id),
    getSentEvent("visitor-a", signedOut.id),
  ]);
});

test("through a Trace, a flush answers flushed once PostHog answered 2xx, and failed with the real SDK's error once it answered 500", async () => {
  const { client, sent, state } = createClient();
  const trace = createRequestTrace(client);

  trace.start();
  trace.user({ id: "ada" });

  const first = trace.track("App Opened");

  await expect(trace.flush()).resolves.toEqual({
    drained: true,
    destinations: { posthog: { status: "flushed" } },
  });

  state.status = 500;

  const second = trace.track("App Opened");

  await expect(trace.flush()).resolves.toEqual({
    drained: true,
    destinations: {
      posthog: {
        status: "failed",
        error: expect.objectContaining({
          name: "PostHogFetchHttpError",
          status: 500,
        }),
      },
    },
  });
  expect(sent).toStrictEqual([
    getSentEvent("ada", first.id),
    getSentEvent("ada", second.id),
  ]);
  trace.dispose();
});

test("a flush that follows another Trace's refused flush answers flushed, because posthog-node dropped that batch, this Trace's events included", async () => {
  const { client, sent, state } = createClient();
  const ada = createRequestTrace(client, { anonymousId: "visitor-a" });
  const bob = createRequestTrace(client, { anonymousId: "visitor-b" });

  ada.start();
  bob.start();
  ada.user({ id: "ada" });
  bob.user({ id: "bob" });

  const fromAda = ada.track("App Opened");
  const fromBob = bob.track("App Opened");

  state.status = 500;

  await expect(bob.flush()).resolves.toEqual({
    drained: true,
    destinations: {
      posthog: {
        status: "failed",
        error: expect.objectContaining({
          name: "PostHogFetchHttpError",
          status: 500,
        }),
      },
    },
  });

  state.status = 200;

  await expect(ada.flush()).resolves.toEqual({
    drained: true,
    destinations: { posthog: { status: "flushed" } },
  });
  expect(sent).toStrictEqual([
    getSentIdentify("ada", "visitor-a"),
    getSentIdentify("bob", "visitor-b"),
    getSentEvent("ada", fromAda.id),
    getSentEvent("bob", fromBob.id),
  ]);
  ada.dispose();
  bob.dispose();
});

test("through a Trace, a user switch needs no reset: each event and each sign-in reaches the real SDK under its own user", async () => {
  const { client, sent } = createClient();
  const trace = createRequestTrace(client, { anonymousId: VISITOR });

  trace.start();
  trace.user({ id: "ada", traits: { plan: "pro" } });

  const first = trace.track("App Opened");

  trace.user({ id: "bob" });

  const second = trace.track("App Opened");

  await expect(trace.flush()).resolves.toEqual({
    drained: true,
    destinations: { posthog: { status: "flushed" } },
  });
  expect(sent).toStrictEqual([
    getSentIdentify("ada", VISITOR),
    getSentUpdate("ada", { $set: { plan: "pro" } }),
    getSentEvent("ada", first.id),
    getSentIdentify("bob", VISITOR),
    getSentEvent("bob", second.id),
  ]);
  trace.dispose();
});

testAnalyticsAdapter({
  name: "posthog over posthog-node 5.52.6",
  createAdapter: () =>
    posthog({ sdk: createClient().client, anonymousId: VISITOR }),
});
