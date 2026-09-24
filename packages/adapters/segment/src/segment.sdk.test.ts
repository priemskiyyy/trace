// @vitest-environment jsdom
import { event, Trace } from "@priemskiyyy/trace";
import { testAnalyticsAdapter } from "@priemskiyyy/trace/testing";
import { Analytics, AnalyticsBrowser } from "@segment/analytics-next";
import { expect, test, vi } from "vitest";

import { segment } from "src/segment";
import { createTrackedEvent } from "src/trackedEvent.fixture";

type Request = { path: string; body: unknown };

type Waiter = { matches: (request: Request) => boolean; resolve: () => void };

const WRITE_KEY = "trace-test-write-key";
const TIMESTAMP = 1_767_225_600_000;

const requests: Request[] = [];
const waiters: Waiter[] = [];
const failing = new Set<unknown>();

const context = {
  signal: new AbortController().signal,
  currentGeneration: () => 1,
  now: () => TIMESTAMP,
};

const getMessageId = (body: unknown) =>
  typeof body === "object" && body !== null && "messageId" in body
    ? body.messageId
    : undefined;

// analytics-next 1.84.3 in jsdom: cdnSettings skip the CDN, and every request lands here.
vi.stubGlobal(
  "fetch",
  vi.fn(async (url: string, init: RequestInit) => {
    const body: unknown = JSON.parse(String(init.body));
    const request = { path: new URL(url).pathname, body };

    requests.push(request);

    for (const waiter of waiters.filter(({ matches }) => matches(request))) {
      waiters.splice(waiters.indexOf(waiter), 1);
      waiter.resolve();
    }

    if (failing.delete(getMessageId(body))) {
      return new Response("{}", { status: 500 });
    }

    return new Response("{}", { status: 200 });
  }),
);

const [analytics] = await AnalyticsBrowser.load(
  {
    writeKey: WRITE_KEY,
    cdnSettings: { integrations: { "Segment.io": { apiKey: WRITE_KEY } } },
  },
  { disableClientPersistence: true },
);

const [withoutRetries] = await AnalyticsBrowser.load(
  {
    writeKey: "trace-test-write-key-without-retries",
    cdnSettings: {
      integrations: {
        "Segment.io": { apiKey: "trace-test-write-key-without-retries" },
      },
    },
  },
  { disableClientPersistence: true, retryQueue: false },
);

const reached = (matches: (request: Request) => boolean) =>
  new Promise<void>((resolve) => {
    if (requests.some(matches)) {
      resolve();

      return;
    }

    waiters.push({ matches, resolve });
  });

const isEvent = (messageId: string) => (request: Request) =>
  request.path === "/v1/t" && getMessageId(request.body) === messageId;

const getSent = (messageId: string) =>
  requests.find(isEvent(messageId))?.body ?? null;

const getAttempts = (messageId: string) =>
  requests.flatMap((request) => {
    if (
      !isEvent(messageId)(request) ||
      typeof request.body !== "object" ||
      request.body === null
    ) {
      return [];
    }

    return [
      {
        userId: "userId" in request.body ? request.body.userId : undefined,
        anonymousId:
          "anonymousId" in request.body ? request.body.anonymousId : undefined,
      },
    ];
  });

const getThrown = (run: () => unknown) => {
  try {
    run();
  } catch (error) {
    return error;
  }

  return null;
};

test("an Analytics that AnalyticsBrowser.load has not finished reports it is not initialized, so open refuses it", () => {
  const unloaded = new Analytics({ writeKey: WRITE_KEY });

  expect(unloaded.initialized).toBe(false);
  expect(getThrown(() => segment({ sdk: unloaded }).open())).toStrictEqual(
    expect.objectContaining({ name: "TraceError", code: "NOT_INITIALIZED" }),
  );
  expect(analytics.initialized).toBe(true);
});

test("the real SDK sends the event with its id as the message id, its time and its properties over its context", async () => {
  analytics.reset();

  const session = segment({ sdk: analytics }).open();
  const id = "5f1c2b3a-4d5e-4f60-8a7b-9c0d1e2f3a4b";

  const answer = session.track(
    createTrackedEvent({
      id,
      properties: { cart: { id: "cart_1" }, value: 49.5, coupon: null },
      context: { value: 1, locale: "de" },
    }),
    context,
  );

  await reached(isEvent(id));

  expect(answer).toStrictEqual({
    status: "submitted",
    evidence: "sdk-call-returned",
    losses: [{ path: "context.value", reason: "omitted" }],
  });
  expect(getSent(id)).toMatchObject({
    type: "track",
    event: "Checkout Started",
    messageId: id,
    timestamp: new Date(TIMESTAMP).toISOString(),
    properties: {
      locale: "de",
      cart: { id: "cart_1" },
      value: 49.5,
      coupon: null,
    },
    userId: null,
  });
});

test("identify, traits with a removal and a group reach the real SDK as Segment's own calls", async () => {
  analytics.reset();

  const session = segment({
    sdk: analytics,
    group: { type: "workspace" },
  }).open();

  session.identify?.({ user: { id: "ada" } });
  session.traits?.({
    user: { id: "ada" },
    set: { plan: "pro" },
    remove: ["role"],
  });
  session.group?.({
    user: { id: "ada" },
    group: { type: "workspace", id: "w_1", traits: { tier: "enterprise" } },
  });

  await reached(
    (request) =>
      request.path === "/v1/g" &&
      typeof request.body === "object" &&
      request.body !== null &&
      "groupId" in request.body &&
      request.body.groupId === "w_1",
  );

  const sent = requests.flatMap(({ path, body }) => {
    if (typeof body !== "object" || body === null) {
      return [];
    }

    const userId = "userId" in body ? body.userId : undefined;

    if (userId !== "ada" || path === "/v1/t") {
      return [];
    }

    return [
      {
        path,
        traits: "traits" in body ? body.traits : undefined,
        groupId: "groupId" in body ? body.groupId : undefined,
      },
    ];
  });

  expect(sent).toStrictEqual([
    { path: "/v1/i", traits: {}, groupId: undefined },
    { path: "/v1/i", traits: { role: null, plan: "pro" }, groupId: undefined },
    { path: "/v1/g", traits: { tier: "enterprise" }, groupId: "w_1" },
  ]);
});

test("through a Trace, a user switch resets the real SDK before the next user, so each event keeps its user and a new anonymous id", async () => {
  analytics.reset();

  const trace = new Trace({
    events: { "App Opened": event() },
    destinations: { segment: segment({ sdk: analytics }) },
  });

  trace.start();
  trace.user({ id: "dee" });

  const first = trace.track("App Opened");

  await first.settled;
  trace.user({ id: "eve" });

  const second = trace.track("App Opened");

  await expect(second.settled).resolves.toMatchObject({
    outcomes: { segment: { status: "submitted" } },
  });
  await reached(isEvent(second.id));

  const dee = getSent(first.id);
  const eve = getSent(second.id);

  expect(dee).toMatchObject({ userId: "dee", anonymousId: expect.any(String) });
  expect(eve).toMatchObject({ userId: "eve", anonymousId: expect.any(String) });

  const deeAnonymousId =
    typeof dee === "object" && dee !== null && "anonymousId" in dee
      ? dee.anonymousId
      : undefined;

  const eveAnonymousId =
    typeof eve === "object" && eve !== null && "anonymousId" in eve
      ? eve.anonymousId
      : undefined;

  expect(eveAnonymousId).not.toBe(deeAnonymousId);
  trace.dispose();
});

test("through a Trace, an anonymous event the real SDK sends after a sign-in goes out under the user who signed in, as it fills a missing user when it sends", async () => {
  analytics.reset();

  const trace = new Trace({
    events: { "Before Sign-In": event() },
    destinations: { segment: segment({ sdk: analytics }) },
  });

  trace.start();

  const receipt = trace.track("Before Sign-In");
  const anonymousId = analytics.user().anonymousId();

  trace.user({ id: "fay" });
  await reached(isEvent(receipt.id));

  expect(getAttempts(receipt.id)).toStrictEqual([
    { userId: "fay", anonymousId },
  ]);
  trace.dispose();
});

test("through a Trace, an anonymous event the real SDK retries after a failed attempt goes out under the user it holds by then, with its earlier anonymous id", async () => {
  analytics.reset();

  const trace = new Trace({
    events: { "Retried Anonymously": event() },
    destinations: { segment: segment({ sdk: analytics }) },
  });

  trace.start();

  const receipt = trace.track("Retried Anonymously");
  const anonymousId = analytics.user().anonymousId();

  failing.add(receipt.id);
  await reached(isEvent(receipt.id));
  trace.user({ id: "gil" });
  trace.user({ id: "hal" });
  await reached(() => getAttempts(receipt.id).length === 2);

  expect(getAttempts(receipt.id)).toStrictEqual([
    { userId: null, anonymousId },
    { userId: "hal", anonymousId },
  ]);
  trace.dispose();
});

test("with retryQueue off, the real SDK drops an anonymous event whose attempt failed instead of retrying it, so no later user can take it", async () => {
  withoutRetries.reset();

  const trace = new Trace({
    events: { "Dropped Anonymously": event() },
    destinations: { segment: segment({ sdk: withoutRetries }) },
  });

  const dropped = new Promise<unknown>((resolve) => {
    withoutRetries.on("error", resolve);
  });

  trace.start();

  const receipt = trace.track("Dropped Anonymously");
  const anonymousId = withoutRetries.user().anonymousId();

  failing.add(receipt.id);
  await reached(isEvent(receipt.id));
  trace.user({ id: "ivy" });
  trace.user({ id: "jay" });

  await expect(dropped).resolves.toMatchObject({ code: "delivery_failure" });
  expect(getAttempts(receipt.id)).toStrictEqual([
    { userId: null, anonymousId },
  ]);
  trace.dispose();
});

testAnalyticsAdapter({
  name: "segment over analytics-next 1.84.3",
  createAdapter: () =>
    segment({ sdk: analytics, group: { type: "workspace" } }),
});
