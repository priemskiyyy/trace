import { createServer } from "node:http";

import { event, Trace } from "@priemskiyyy/trace";
import { testAnalyticsAdapter } from "@priemskiyyy/trace/testing";
import Mixpanel from "mixpanel";
import { afterAll, beforeEach, expect, test, vi } from "vitest";

import { mixpanel } from "src/mixpanel";
import { createTrackedEvent, TRACKED_EVENT } from "src/trackedEvent.fixture";

type Received = { endpoint: string; data: unknown };

const { timestamp: NOW } = TRACKED_EVENT;
const TOKEN = "trace-test-token";
const VISITOR = "visitor-7";
const ANONYMOUS = { generation: 0, user: null, traits: {}, groups: {} };

const received: Received[] = [];
const held: (() => void)[] = [];
const arrivals: { count: number; resolve: () => void }[] = [];
const state = { answer: "1", holding: false };

// mixpanel 0.24.0 sends every call as a GET with base64 JSON in its query; this server on 127.0.0.1 answers as Mixpanel does, with 1 or 0.
const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");

  const data: unknown = JSON.parse(
    Buffer.from(url.searchParams.get("data") ?? "", "base64").toString(),
  );

  received.push({ endpoint: url.pathname, data });

  for (const arrival of [...arrivals]) {
    if (received.length >= arrival.count) {
      arrivals.splice(arrivals.indexOf(arrival), 1);
      arrival.resolve();
    }
  }

  const answer = state.answer;

  const handleAnswer = () => {
    response.end(answer);
  };

  if (state.holding) {
    held.push(handleAnswer);

    return;
  }

  handleAnswer();
});

await new Promise<void>((resolve) => {
  server.listen(0, "127.0.0.1", resolve);
});

const address = server.address();

if (address === null || typeof address === "string") {
  throw new Error("The local Mixpanel server did not start on a port.");
}

vi.stubEnv("HTTPS_PROXY", "");
vi.stubEnv("HTTP_PROXY", "");

const client = Mixpanel.init(TOKEN, {
  host: `127.0.0.1:${address.port}`,
  protocol: "http",
  keepAlive: false,
});

vi.unstubAllEnvs();

beforeEach(() => {
  received.length = 0;
  state.answer = "1";
  state.holding = false;
});

afterAll(async () => {
  for (const handleAnswer of held.splice(0)) {
    handleAnswer();
  }

  server.closeAllConnections();
  await new Promise((resolve) => {
    server.close(resolve);
  });
});

const context = {
  signal: new AbortController().signal,
  currentGeneration: () => 1,
  now: () => NOW,
};

const release = () => {
  state.holding = false;

  for (const handleAnswer of held.splice(0)) {
    handleAnswer();
  }
};

const answerNewestFirst = () => {
  for (const handleAnswer of held.splice(0).reverse()) {
    handleAnswer();
  }
};

const nextMacrotask = () =>
  new Promise((resolve) => {
    setImmediate(resolve);
  });

const watch = (answer: Promise<unknown>) => {
  const watched = { settled: false };

  answer.then(() => {
    watched.settled = true;
  });

  return watched;
};

const createTrace = (anonymousId?: string) =>
  new Trace({
    events: { "App Opened": event() },
    destinations: {
      product: mixpanel({
        sdk: client,
        ...(anonymousId === undefined ? {} : { anonymousId }),
      }),
    },
    now: () => NOW,
  });

const arrived = (count: number) =>
  new Promise<void>((resolve) => {
    if (received.length >= count) {
      resolve();

      return;
    }

    arrivals.push({ count, resolve });
  });

const answered = (
  call: (callback: (error: Error | undefined) => void) => void,
) =>
  new Promise<Error | undefined>((resolve) => {
    call(resolve);
  });

test("the real client sends the event as one request with its user, the anonymous id, its time, its id, its token and its properties over its context, and Mixpanel's 1 makes it backend-acknowledged", async () => {
  const session = mixpanel({ sdk: client, anonymousId: VISITOR }).open();
  const id = "5f1c2b3a-4d5e-4f60-8a7b-9c0d1e2f3a4b";

  const answer = await session.track(
    createTrackedEvent({
      id,
      properties: { cart: { id: "cart_1" }, value: 49.5, token: "forged" },
      context: { value: 1, locale: "de" },
      identity: {
        generation: 1,
        user: { id: "ada" },
        traits: {},
        groups: { workspace: { id: "w_1", traits: {} } },
      },
    }),
    context,
  );

  expect(answer).toStrictEqual({
    status: "submitted",
    evidence: "backend-acknowledged",
    losses: [
      { path: "properties.token", reason: "omitted" },
      { path: "context.value", reason: "omitted" },
    ],
  });
  expect(received).toStrictEqual([
    {
      endpoint: "/track",
      data: {
        event: "Checkout Started",
        properties: {
          time: NOW,
          $insert_id: id,
          $user_id: "ada",
          $device_id: VISITOR,
          cart: { id: "cart_1" },
          value: 49.5,
          locale: "de",
          workspace: "w_1",
          token: TOKEN,
          mp_lib: "node",
          $lib_version: "0.24.0",
        },
      },
    },
  ]);
});

test("through a Trace, Mixpanel's 0 fails the event with the real client's own error", async () => {
  const trace = createTrace();

  state.answer = "0";
  trace.start();
  trace.user({ id: "ada" });

  await expect(trace.track("App Opened").settled).resolves.toStrictEqual({
    state: "settled",
    outcomes: {
      product: {
        status: "failed",
        error: new Error("Mixpanel Server Error: 0"),
      },
    },
  });
  trace.dispose();
});

test("the real client writes its token into the object it is given, so the frozen object of an event would reach Mixpanel without one", async () => {
  const frozen = Object.freeze({ $user_id: "ada", time: NOW });

  await answered((callback) => {
    client.track("Checkout Started", frozen, callback);
  });

  expect(received).toStrictEqual([
    {
      endpoint: "/track",
      data: {
        event: "Checkout Started",
        properties: { $user_id: "ada", time: NOW },
      },
    },
  ]);
});

test("the real client sends an event with no id at all, which Mixpanel would file under nobody, so the adapter skips it as unidentified", async () => {
  const session = mixpanel({ sdk: client }).open();

  await answered((callback) => {
    client.track("Nobody's Event", { time: NOW }, callback);
  });

  expect(
    session.track(createTrackedEvent({ identity: ANONYMOUS }), context),
  ).toStrictEqual({ status: "skipped", reason: "unidentified" });
  expect(received).toStrictEqual([
    {
      endpoint: "/track",
      data: {
        event: "Nobody's Event",
        properties: {
          time: NOW,
          token: TOKEN,
          mp_lib: "node",
          $lib_version: "0.24.0",
        },
      },
    },
  ]);
});

test("traits and a membership reach the real client as /engage and /groups requests for the user, in the order they were made, and flush waits for them", async () => {
  const session = mixpanel({ sdk: client }).open();

  session.traits?.({
    user: { id: "ada" },
    set: { plan: "pro" },
    remove: ["role"],
  });
  session.group?.({
    user: { id: "ada" },
    group: { type: "workspace", id: "w_1", traits: { tier: "team" } },
  });

  await expect(
    session.flush?.({ timeout: 1_000, signal: new AbortController().signal }),
  ).resolves.toStrictEqual({ status: "flushed" });
  expect(received).toStrictEqual([
    {
      endpoint: "/engage",
      data: { $set: { plan: "pro" }, $token: TOKEN, $distinct_id: "ada" },
    },
    {
      endpoint: "/engage",
      data: { $unset: ["role"], $token: TOKEN, $distinct_id: "ada" },
    },
    {
      endpoint: "/groups",
      data: {
        $set: { tier: "team" },
        $token: TOKEN,
        $group_key: "workspace",
        $group_id: "w_1",
      },
    },
    {
      endpoint: "/engage",
      data: {
        $set: { workspace: ["w_1"] },
        $token: TOKEN,
        $distinct_id: "ada",
      },
    },
  ]);
});

test("the real client moves an ip trait out of the profile into the request's own $ip, which is why the adapter leaves it out", async () => {
  await answered((callback) => {
    client.people.set("ada", { ip: "203.0.113.7", plan: "pro" }, callback);
  });

  expect(received).toStrictEqual([
    {
      endpoint: "/engage",
      data: {
        $set: { plan: "pro" },
        $token: TOKEN,
        $distinct_id: "ada",
        $ip: "203.0.113.7",
      },
    },
  ]);
});

test("the real client sends a removal of ip or $ignore_time as it is, moving those keys only out of a set", async () => {
  await answered((callback) => {
    client.people.unset("ada", ["ip", "$ignore_time"], callback);
  });

  expect(received).toStrictEqual([
    {
      endpoint: "/engage",
      data: {
        $unset: ["ip", "$ignore_time"],
        $token: TOKEN,
        $distinct_id: "ada",
      },
    },
  ]);
});

test("flush waits until Mixpanel has answered every request in flight", async () => {
  const session = mixpanel({ sdk: client }).open();
  const outcome = { flushed: false };

  state.holding = true;

  const tracking = session.track(createTrackedEvent(), context);

  const flushing = Promise.resolve(
    session.flush?.({ timeout: 1_000, signal: new AbortController().signal }),
  ).then((result) => {
    outcome.flushed = true;

    return result;
  });

  await arrived(1);

  expect(outcome.flushed).toBe(false);

  release();

  await expect(flushing).resolves.toStrictEqual({ status: "flushed" });
  await expect(tracking).resolves.toMatchObject({
    status: "submitted",
    evidence: "backend-acknowledged",
  });
});

test("through a Trace, each event reaches the real client under its own user, and each user's traits under that user's profile", async () => {
  const trace = createTrace(VISITOR);

  trace.start();
  trace.user({ id: "ada", traits: { plan: "pro" } });

  const first = trace.track("App Opened");

  trace.user({ id: "bob" });

  const second = trace.track("App Opened");

  await expect(trace.flush()).resolves.toEqual({
    drained: true,
    destinations: { product: { status: "flushed" } },
  });
  expect(received).toHaveLength(3);
  expect(received).toEqual(
    expect.arrayContaining([
      {
        endpoint: "/engage",
        data: { $set: { plan: "pro" }, $token: TOKEN, $distinct_id: "ada" },
      },
      {
        endpoint: "/track",
        data: {
          event: "App Opened",
          properties: expect.objectContaining({
            $insert_id: first.id,
            $user_id: "ada",
            $device_id: VISITOR,
          }),
        },
      },
      {
        endpoint: "/track",
        data: {
          event: "App Opened",
          properties: expect.objectContaining({
            $insert_id: second.id,
            $user_id: "bob",
            $device_id: VISITOR,
          }),
        },
      },
    ]),
  );
  trace.dispose();
});

test("through a Trace, a trait's removal reaches the real client only once Mixpanel answered its earlier set, and a flush does not answer while the removal is in flight", async () => {
  const trace = createTrace();
  const unset = vi.spyOn(client.people, "unset");

  state.holding = true;
  trace.start();
  trace.user({ id: "ada", traits: { plan: "pro" } });
  trace.traits({ plan: null });
  await arrived(1);

  expect(unset.mock.calls).toStrictEqual([]);

  held.shift()?.();
  await arrived(2);

  expect(unset.mock.calls).toStrictEqual([
    ["ada", ["plan"], expect.any(Function)],
  ]);

  const flushing = trace.flush();
  const flushed = watch(flushing);

  await nextMacrotask();

  expect(flushed.settled).toBe(false);

  release();

  await expect(flushing).resolves.toEqual({
    drained: true,
    destinations: { product: { status: "flushed" } },
  });
  expect(received).toStrictEqual([
    {
      endpoint: "/engage",
      data: { $set: { plan: "pro" }, $token: TOKEN, $distinct_id: "ada" },
    },
    {
      endpoint: "/engage",
      data: { $unset: ["plan"], $token: TOKEN, $distinct_id: "ada" },
    },
  ]);
  trace.dispose();
});

test("through a Trace, a flush waits for the profile updates made after the last event, until Mixpanel answered all three of the real client's requests", async () => {
  const trace = createTrace();

  state.holding = true;
  trace.start();
  trace.user({ id: "ada", traits: { plan: "pro" } });
  trace.group("workspace", { id: "w_1", traits: { tier: "team" } });

  const flushing = trace.flush();
  const flushed = watch(flushing);

  for (const count of [1, 2, 3]) {
    await arrived(count);
    await nextMacrotask();

    expect(flushed.settled).toBe(false);

    held.shift()?.();
  }

  await expect(flushing).resolves.toEqual({
    drained: true,
    destinations: { product: { status: "flushed" } },
  });
  expect(received).toStrictEqual([
    {
      endpoint: "/engage",
      data: { $set: { plan: "pro" }, $token: TOKEN, $distinct_id: "ada" },
    },
    {
      endpoint: "/groups",
      data: {
        $set: { tier: "team" },
        $token: TOKEN,
        $group_key: "workspace",
        $group_id: "w_1",
      },
    },
    {
      endpoint: "/engage",
      data: {
        $set: { workspace: ["w_1"] },
        $token: TOKEN,
        $distinct_id: "ada",
      },
    },
  ]);
  trace.dispose();
});

test("per-request Traces over one real client never mix their users or visitors, whatever order Mixpanel answers in", async () => {
  const createRequest = (id: string, anonymousId: string) => {
    const trace = createTrace(anonymousId);

    trace.start();
    trace.user({ id, traits: { plan: id } });

    return trace;
  };

  state.holding = true;

  const ada = createRequest("ada", "visitor-a");
  const bob = createRequest("bob", "visitor-b");
  const first = ada.track("App Opened");
  const second = bob.track("App Opened");

  bob.group("workspace", { id: "w_bob", traits: { tier: "bob" } });
  ada.group("workspace", { id: "w_ada", traits: { tier: "ada" } });

  const third = bob.track("App Opened");
  const fourth = ada.track("App Opened");

  const flushed = watch(Promise.all([ada.flush(), bob.flush()]));

  while (!flushed.settled) {
    answerNewestFirst();
    await nextMacrotask();
  }

  const getProfile = (id: string, set: Record<string, unknown>) => ({
    endpoint: "/engage",
    data: { $set: set, $token: TOKEN, $distinct_id: id },
  });

  const getGroup = (id: string, tier: string) => ({
    endpoint: "/groups",
    data: {
      $set: { tier },
      $token: TOKEN,
      $group_key: "workspace",
      $group_id: id,
    },
  });

  const getTrack = (
    id: string,
    userId: string,
    deviceId: string,
    groups: Record<string, string> = {},
  ) => ({
    endpoint: "/track",
    data: {
      event: "App Opened",
      properties: {
        time: NOW,
        $insert_id: id,
        $user_id: userId,
        $device_id: deviceId,
        ...groups,
        token: TOKEN,
        mp_lib: "node",
        $lib_version: "0.24.0",
      },
    },
  });

  expect(received).toHaveLength(10);
  expect(received).toEqual(
    expect.arrayContaining([
      getProfile("ada", { plan: "ada" }),
      getProfile("bob", { plan: "bob" }),
      getGroup("w_ada", "ada"),
      getGroup("w_bob", "bob"),
      getProfile("ada", { workspace: ["w_ada"] }),
      getProfile("bob", { workspace: ["w_bob"] }),
      getTrack(first.id, "ada", "visitor-a"),
      getTrack(second.id, "bob", "visitor-b"),
      getTrack(third.id, "bob", "visitor-b", { workspace: "w_bob" }),
      getTrack(fourth.id, "ada", "visitor-a", { workspace: "w_ada" }),
    ]),
  );
  ada.dispose();
  bob.dispose();
});

testAnalyticsAdapter({
  name: "mixpanel over the mixpanel 0.24.0 client",
  createAdapter: () => mixpanel({ sdk: client, anonymousId: VISITOR }),
});
