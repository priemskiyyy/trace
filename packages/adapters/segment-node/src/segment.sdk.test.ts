import { event, Trace } from "@priemskiyyy/trace";
import { testAnalyticsAdapter } from "@priemskiyyy/trace/testing";
import { Analytics } from "@segment/analytics-node";
import { afterEach, expect, test, vi } from "vitest";

import { segment } from "src/segment";
import { createTrackedEvent, TRACKED_EVENT } from "src/trackedEvent.fixture";

const { timestamp: TIMESTAMP } = TRACKED_EVENT;
const VISITOR = "visitor-7";
const ANONYMOUS = { generation: 0, user: null, traits: {}, groups: {} };

const OVERLAP_WARNING =
  "Overlapping flush calls detected. Please wait for the previous flush to finish before calling .flush again";

const context = {
  signal: new AbortController().signal,
  currentGeneration: () => 1,
  now: () => TIMESTAMP,
};

const clients: { analytics: Analytics; release: () => void }[] = [];

afterEach(async () => {
  vi.useRealTimers();

  for (const { release } of clients) {
    release();
  }

  await Promise.all(
    clients.splice(0).map(({ analytics }) => analytics.closeAndFlush()),
  );
});

const getMessageId = (message: unknown) =>
  typeof message === "object" && message !== null && "messageId" in message
    ? message.messageId
    : null;

// analytics-node 3.1.0 with its injectable httpClient: every batch lands here, and nothing reaches the network.
const createClient = () => {
  const sent: unknown[] = [];
  const held: (() => void)[] = [];
  const arrivals: { messageId: string; resolve: () => void }[] = [];
  const errors: { code: string; messageId: string | undefined }[] = [];
  const state = { holding: false, status: 200 };

  const analytics = new Analytics({
    writeKey: "trace-test-write-key",
    flushAt: 1_000,
    httpClient: (_url, { body }) => {
      const parsed: unknown = JSON.parse(body);

      if (
        typeof parsed !== "object" ||
        parsed === null ||
        !("batch" in parsed) ||
        !Array.isArray(parsed.batch)
      ) {
        throw new Error("analytics-node sent a body without a batch.");
      }

      const batch: unknown[] = parsed.batch;

      sent.push(...batch);

      for (const arrival of [...arrivals]) {
        if (
          batch.some((message) => getMessageId(message) === arrival.messageId)
        ) {
          arrivals.splice(arrivals.indexOf(arrival), 1);
          arrival.resolve();
        }
      }

      const response = { status: state.status, statusText: "" };

      if (!state.holding) {
        return Promise.resolve(response);
      }

      return new Promise((resolve) => {
        held.push(() => {
          resolve(response);
        });
      });
    },
  });

  analytics.on("error", ({ code, ctx }) => {
    errors.push({ code, messageId: ctx?.event.messageId });
  });

  const release = () => {
    state.holding = false;

    for (const answer of held.splice(0)) {
      answer();
    }
  };

  const arrived = (messageId: string) =>
    new Promise<void>((resolve) => {
      if (sent.some((message) => getMessageId(message) === messageId)) {
        resolve();

        return;
      }

      arrivals.push({ messageId, resolve });
    });

  const getSent = (messageId: string) =>
    sent.find((message) => getMessageId(message) === messageId) ?? null;

  clients.push({ analytics, release });

  return { analytics, sent, errors, state, release, arrived, getSent };
};

const createFlushContext = () => ({
  timeout: 1_000,
  signal: new AbortController().signal,
});

const getThrown = (run: () => unknown) => {
  try {
    run();
  } catch (error) {
    return error;
  }

  return null;
};

const nextMacrotask = () =>
  new Promise((resolve) => {
    setImmediate(resolve);
  });

const watch = (answer: unknown) => {
  const watched = { settled: false };

  Promise.resolve(answer).then(() => {
    watched.settled = true;
  });

  return watched;
};

test("the real SDK sends the event in its batch with its user, the anonymous id, its id as the message id, its time and its properties over its context", async () => {
  const client = createClient();

  const session = segment({
    sdk: client.analytics,
    anonymousId: VISITOR,
  }).open();

  const id = "5f1c2b3a-4d5e-4f60-8a7b-9c0d1e2f3a4b";

  const answer = session.track(
    createTrackedEvent({
      id,
      properties: { cart: { id: "cart_1" }, value: 49.5, coupon: null },
      context: { value: 1, locale: "de" },
    }),
    context,
  );

  await session.flush?.(createFlushContext());

  expect(answer).toStrictEqual({
    status: "submitted",
    evidence: "sdk-call-returned",
    losses: [{ path: "context.value", reason: "omitted" }],
  });
  expect(client.getSent(id)).toMatchObject({
    type: "track",
    event: "Checkout Started",
    userId: "ada",
    anonymousId: VISITOR,
    messageId: id,
    timestamp: new Date(TIMESTAMP).toISOString(),
    properties: {
      locale: "de",
      cart: { id: "cart_1" },
      value: 49.5,
      coupon: null,
    },
  });
});

test("the real SDK throws on a track call with neither a user id nor an anonymous id, and the adapter skips such an event as unidentified before calling it", async () => {
  const client = createClient();
  const session = segment({ sdk: client.analytics }).open();
  const id = "9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a";

  const callWithoutIds = () =>
    // @ts-expect-error analytics-node's types require a user id or an anonymous id, the rule its runtime enforces here.
    client.analytics.track({ event: "Nobody's Event", properties: {} });

  expect(getThrown(callWithoutIds)).toStrictEqual(
    expect.objectContaining({
      field: ".userId/anonymousId/previousId/groupId",
      message: ".userId/anonymousId/previousId/groupId is nil",
    }),
  );
  expect(
    session.track(createTrackedEvent({ id, identity: ANONYMOUS }), context),
  ).toStrictEqual({ status: "skipped", reason: "unidentified" });

  await session.flush?.(createFlushContext());

  expect(client.sent).toStrictEqual([]);
});

test("traits with a removal and a group reach the real SDK as identify and group calls for the user and the anonymous id", async () => {
  const client = createClient();

  const session = segment({
    sdk: client.analytics,
    group: { type: "workspace" },
    anonymousId: VISITOR,
  }).open();

  session.traits?.({
    user: { id: "ada" },
    set: { plan: "pro" },
    remove: ["role"],
  });
  session.group?.({
    user: { id: "ada" },
    group: { type: "workspace", id: "w_1", traits: { tier: "enterprise" } },
  });
  await session.flush?.(createFlushContext());

  expect(client.sent).toStrictEqual([
    expect.objectContaining({
      type: "identify",
      userId: "ada",
      anonymousId: VISITOR,
      traits: { role: null, plan: "pro" },
    }),
    expect.objectContaining({
      type: "group",
      userId: "ada",
      anonymousId: VISITOR,
      groupId: "w_1",
      traits: { tier: "enterprise" },
    }),
  ]);
});

test("the real SDK's own size check lets an event far over 32 KB into its batch, so the adapter drops one before calling it", async () => {
  const client = createClient();
  const session = segment({ sdk: client.analytics }).open();
  const id = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
  const text = "x".repeat(40_000);

  client.analytics.track({
    userId: "ada",
    event: "Checkout Started",
    properties: { text },
    messageId: "sent-straight-to-the-sdk",
  });

  const answer = session.track(
    createTrackedEvent({ id, properties: { text } }),
    context,
  );

  await session.flush?.(createFlushContext());

  expect(client.getSent("sent-straight-to-the-sdk")).toMatchObject({
    properties: { text },
  });
  expect(answer).toStrictEqual({
    status: "dropped",
    reason: "provider-filtered",
    losses: [{ path: "properties", reason: "invalid" }],
  });
  expect(client.getSent(id)).toBe(null);
});

test("a 400 answer fails every event of its batch in the real SDK, the others included, which is why an event over 32 KB never reaches it", async () => {
  const client = createClient();
  const session = segment({ sdk: client.analytics }).open();
  const first = "4e5f6a7b-8c9d-4e0f-9a1b-3c4d5e6f7a8b";
  const second = "5f6a7b8c-9d0e-4f1a-8b2c-4d5e6f7a8b9c";

  client.state.status = 400;
  session.track(createTrackedEvent({ id: first }), context);
  session.track(createTrackedEvent({ id: second }), context);
  await session.flush?.(createFlushContext());

  expect(client.errors).toStrictEqual([
    { code: "delivery_failure", messageId: first },
    { code: "delivery_failure", messageId: second },
  ]);
});

test("a flush through the real SDK answers flushed only once its batch was answered, and an overlapping flush waits for the same batch where the real SDK's second flush warns and resolves at once", async () => {
  const client = createClient();
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const adapter = segment({ sdk: client.analytics });
  const first = adapter.open();
  const second = adapter.open();
  const id = "1b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e";

  client.state.holding = true;
  client.analytics.track({
    userId: "ada",
    event: "Checked Directly",
    properties: {},
    messageId: "checked-directly",
  });

  const direct = client.analytics.flush();
  const overlapping = watch(client.analytics.flush());

  await client.arrived("checked-directly");
  await nextMacrotask();

  expect(overlapping.settled).toBe(true);
  expect(warn.mock.calls).toStrictEqual([[OVERLAP_WARNING]]);

  client.release();
  await direct;
  warn.mockClear();
  client.state.holding = true;
  first.track(createTrackedEvent({ id }), context);

  const earlier = first.flush?.(createFlushContext());
  const later = second.flush?.(createFlushContext());
  const waiting = watch(Promise.race([earlier, later]));

  await client.arrived(id);
  await nextMacrotask();

  expect(waiting.settled).toBe(false);

  client.release();

  await expect(Promise.all([earlier, later])).resolves.toStrictEqual([
    { status: "flushed" },
    { status: "flushed" },
  ]);
  expect(warn.mock.calls).toStrictEqual([]);
});

test("a Trace flush that times out leaves the real SDK's batch in flight, so a batch refused once is still retried and delivered", async () => {
  vi.useFakeTimers();

  const client = createClient();

  const trace = new Trace({
    events: { "App Opened": event() },
    destinations: {
      segment: segment({ sdk: client.analytics, anonymousId: VISITOR }),
    },
  });

  trace.start();
  client.state.holding = true;
  client.state.status = 503;

  const receipt = trace.track("App Opened");
  const flushing = trace.flush({ timeout: 1_000 });

  await vi.advanceTimersByTimeAsync(999);

  expect(client.sent).toStrictEqual([
    expect.objectContaining({ messageId: receipt.id }),
  ]);

  await vi.advanceTimersByTimeAsync(1);

  await expect(flushing).resolves.toEqual({
    drained: false,
    destinations: { segment: { status: "timeout" } },
  });

  client.state.status = 200;
  client.release();
  await vi.advanceTimersByTimeAsync(2_000);

  expect(client.sent).toStrictEqual([
    expect.objectContaining({ messageId: receipt.id }),
    expect.objectContaining({ messageId: receipt.id }),
  ]);
  expect(client.errors).toStrictEqual([]);
  await expect(trace.flush()).resolves.toEqual({
    drained: true,
    destinations: { segment: { status: "flushed" } },
  });
  trace.dispose();
});

test("two adapters over one real client cannot share a flush: the second answers flushed at once, before the batch was answered, because the real SDK runs one flush at a time", async () => {
  const client = createClient();
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

  const request = segment({
    sdk: client.analytics,
    anonymousId: "visitor-a",
  }).open();

  const other = segment({
    sdk: client.analytics,
    anonymousId: "visitor-b",
  }).open();

  const id = "3d4e5f6a-7b8c-4d9e-8f0a-2b3c4d5e6f7a";

  client.state.holding = true;
  request.track(createTrackedEvent({ id }), context);

  const earlier = watch(request.flush?.(createFlushContext()));

  await client.arrived(id);

  await expect(other.flush?.(createFlushContext())).resolves.toStrictEqual({
    status: "flushed",
  });
  expect(earlier.settled).toBe(false);
  expect(warn.mock.calls).toStrictEqual([[OVERLAP_WARNING]]);
});

test("through a Trace, a user switch needs no reset: each event and each identify reaches the real SDK under its own user and the anonymous id", async () => {
  const client = createClient();

  const trace = new Trace({
    events: { "App Opened": event() },
    destinations: {
      segment: segment({ sdk: client.analytics, anonymousId: VISITOR }),
    },
  });

  trace.start();
  trace.user({ id: "ada", traits: { plan: "pro" } });

  const first = trace.track("App Opened");

  trace.user({ id: "bob" });

  const second = trace.track("App Opened");

  await expect(trace.flush()).resolves.toEqual({
    drained: true,
    destinations: { segment: { status: "flushed" } },
  });
  expect(client.sent).toStrictEqual([
    expect.objectContaining({
      type: "identify",
      userId: "ada",
      anonymousId: VISITOR,
      traits: { plan: "pro" },
    }),
    expect.objectContaining({
      type: "track",
      userId: "ada",
      anonymousId: VISITOR,
      messageId: first.id,
    }),
    expect.objectContaining({
      type: "track",
      userId: "bob",
      anonymousId: VISITOR,
      messageId: second.id,
    }),
  ]);
  trace.dispose();
});

test("per-request Traces over one real client never mix their users or visitors", async () => {
  const client = createClient();

  const createRequest = (id: string, anonymousId: string) => {
    const trace = new Trace({
      events: { "App Opened": event() },
      destinations: {
        segment: segment({
          sdk: client.analytics,
          group: { type: "workspace" },
          anonymousId,
        }),
      },
    });

    trace.start();
    trace.user({ id, traits: { plan: id } });

    return trace;
  };

  const ada = createRequest("ada", "visitor-a");
  const bob = createRequest("bob", "visitor-b");
  const first = ada.track("App Opened");
  const second = bob.track("App Opened");

  bob.group("workspace", { id: "w_bob" });
  ada.group("workspace", { id: "w_ada" });

  const third = bob.track("App Opened");
  const fourth = ada.track("App Opened");

  await ada.flush();
  await bob.flush();

  const getMessage = (
    type: string,
    userId: string,
    anonymousId: string,
    fields: Record<string, unknown>,
  ) => expect.objectContaining({ type, userId, anonymousId, ...fields });

  expect(client.sent).toHaveLength(8);
  expect(client.sent).toStrictEqual(
    expect.arrayContaining([
      getMessage("identify", "ada", "visitor-a", { traits: { plan: "ada" } }),
      getMessage("identify", "bob", "visitor-b", { traits: { plan: "bob" } }),
      getMessage("group", "ada", "visitor-a", { groupId: "w_ada" }),
      getMessage("group", "bob", "visitor-b", { groupId: "w_bob" }),
      getMessage("track", "ada", "visitor-a", { messageId: first.id }),
      getMessage("track", "bob", "visitor-b", { messageId: second.id }),
      getMessage("track", "bob", "visitor-b", { messageId: third.id }),
      getMessage("track", "ada", "visitor-a", { messageId: fourth.id }),
    ]),
  );
  ada.dispose();
  bob.dispose();
});

testAnalyticsAdapter({
  name: "segment over analytics-node 3.1.0",
  createAdapter: () =>
    segment({
      sdk: createClient().analytics,
      group: { type: "workspace" },
      anonymousId: VISITOR,
    }),
});
