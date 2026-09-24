// @vitest-environment jsdom
import { event, Trace } from "@priemskiyyy/trace";
import { testAnalyticsAdapter } from "@priemskiyyy/trace/testing";
import { RudderAnalytics } from "@rudderstack/analytics-js/bundled";
import { expect, test, vi } from "vitest";

import { rudderstack } from "src/rudderstack";
import { createTrackedEvent } from "src/trackedEvent.fixture";

type Request = { path: string; body: Record<string, unknown> };

type Waiter = { matches: (request: Request) => boolean; resolve: () => void };

const TIMESTAMP = 1_767_225_600_000;
const ISO_TIMESTAMP = "2026-01-01T00:00:00.000Z";

const requests: Request[] = [];
const waiters: Waiter[] = [];

const context = {
  signal: new AbortController().signal,
  currentGeneration: () => 1,
  now: () => TIMESTAMP,
};

const record = (request: Request) => {
  requests.push(request);

  for (const waiter of waiters.filter(({ matches }) => matches(request))) {
    waiters.splice(waiters.indexOf(waiter), 1);
    waiter.resolve();
  }
};

// RudderStack delivers through XMLHttpRequest; this one records each request and answers 200.
class RecordingXhr {
  status = 0;
  statusText = "";
  responseText = "";
  timeout = 0;
  withCredentials = false;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  #url = "";

  open = (_method: string, url: string) => {
    this.#url = url;
  };

  setRequestHeader = () => {};

  send = (body: string) => {
    record({ path: new URL(this.#url).pathname, body: JSON.parse(body) });
    this.status = 200;
    this.responseText = "OK";
    queueMicrotask(() => {
      this.onload?.();
    });
  };
}

vi.stubGlobal("XMLHttpRequest", RecordingXhr);

const reached = (matches: (request: Request) => boolean) =>
  new Promise<void>((resolve) => {
    if (requests.some(matches)) {
      resolve();

      return;
    }

    waiters.push({ matches, resolve });
  });

const isTrack = (name: string) => (request: Request) =>
  request.path === "/v1/track" && request.body["event"] === name;

const getTrack = (name: string) => requests.find(isTrack(name))?.body ?? null;

const getThrown = (run: () => unknown) => {
  try {
    run();
  } catch (error) {
    return error;
  }

  return null;
};

// The bundled build carries its plugins, and getSourceConfig answers in place of RudderStack's control plane.
const rudderanalytics = new RudderAnalytics();

rudderstack({ sdk: rudderanalytics })
  .open()
  .track(createTrackedEvent({ name: "Before Load" }), context);

rudderanalytics.load("trace-test-write-key", "https://dataplane.example.test", {
  getSourceConfig: () => ({
    source: {
      id: "source-1",
      name: "trace",
      workspaceId: "workspace-1",
      enabled: true,
      config: {},
      destinations: [],
    },
  }),
  polyfillIfRequired: false,
  logLevel: "NONE",
});

await new Promise<void>((resolve) => {
  rudderanalytics.ready(() => {
    resolve();
  });
});

test("an event handed over before RudderStack loaded is sent once it has, with its time as the original timestamp", async () => {
  await reached(isTrack("Before Load"));

  expect(getTrack("Before Load")).toMatchObject({
    type: "track",
    originalTimestamp: ISO_TIMESTAMP,
  });
});

test("the real SDK sends the properties over the context without reserved names or nulls, under a message id of its own", async () => {
  const session = rudderstack({ sdk: rudderanalytics }).open();

  const answer = session.track(
    createTrackedEvent({
      name: "Checkout Started",
      properties: {
        id: "p_1",
        coupon: null,
        cart: { id: "cart_1", note: null },
        value: 1,
      },
      context: { locale: "de", value: 2 },
    }),
    context,
  );

  await reached(isTrack("Checkout Started"));

  const sent = getTrack("Checkout Started");

  expect(answer).toStrictEqual({
    status: "submitted",
    evidence: "sdk-call-returned",
    losses: [
      { path: "properties.id", reason: "invalid" },
      { path: "properties.coupon", reason: "unsupported" },
      { path: "properties.cart.note", reason: "unsupported" },
      { path: "context.value", reason: "omitted" },
    ],
  });
  expect(sent?.["properties"]).toStrictEqual({
    cart: { id: "cart_1" },
    value: 1,
    locale: "de",
  });
  expect(sent?.["originalTimestamp"]).toBe(ISO_TIMESTAMP);
  expect(sent?.["messageId"]).toEqual(expect.any(String));
  expect(sent?.["messageId"]).not.toBe(createTrackedEvent().id);
});

test("identify keeps the traits the real SDK holds, and a removal never reaches the wire", async () => {
  rudderanalytics.reset({ entries: { anonymousId: true } });

  const session = rudderstack({ sdk: rudderanalytics }).open();

  session.traits?.({
    user: null,
    set: { plan: "pro", role: "admin" },
    remove: [],
  });
  session.identify?.({ user: { id: "ada" } });

  const refused = getThrown(() =>
    session.traits?.({
      user: { id: "ada" },
      set: { seats: 4 },
      remove: ["role"],
    }),
  );

  session.track(createTrackedEvent({ name: "Ada Checked Out" }), context);
  await reached(isTrack("Ada Checked Out"));

  const identified = requests.flatMap(({ path, body }) => {
    if (path !== "/v1/identify" || body["userId"] !== "ada") {
      return [];
    }

    return [body["context"]];
  });

  expect(refused).toStrictEqual(
    expect.objectContaining({ name: "TraceError", code: "UNSUPPORTED" }),
  );
  expect(identified).toStrictEqual([
    expect.objectContaining({ traits: { plan: "pro", role: "admin" } }),
    expect.objectContaining({ traits: { plan: "pro", seats: 4 } }),
  ]);
  expect(getTrack("Ada Checked Out")).toStrictEqual(
    expect.objectContaining({
      userId: "ada",
      context: expect.objectContaining({ traits: { plan: "pro", seats: 4 } }),
    }),
  );
});

test("through a Trace, an object trait never reaches the real SDK, which would merge it into the one it holds, and each step is reported unsupported", async () => {
  rudderanalytics.reset({ entries: { anonymousId: true } });

  const trace = new Trace({
    events: { "Ivy Signed In": event(), "Ivy Moved": event() },
    destinations: { rudderstack: rudderstack({ sdk: rudderanalytics }) },
  });

  const steps: unknown[] = [];

  trace.diagnostics.events.subscribe(({ type, context: step }) => {
    if (type === "identity step unsupported") {
      steps.push(step);
    }
  });
  trace.start();
  trace.user({
    id: "ivy",
    traits: { plan: "pro", address: { city: "Lviv", line1: "Shevchenka 1" } },
  });
  await trace.track("Ivy Signed In").settled;
  trace.traits({ address: { city: "Kyiv" } });
  await trace.track("Ivy Moved").settled;
  await reached(isTrack("Ivy Moved"));

  expect(steps).toStrictEqual([{ step: "traits" }, { step: "traits" }]);
  expect(rudderanalytics.getUserTraits()).toStrictEqual({ plan: "pro" });
  expect(getTrack("Ivy Moved")).toStrictEqual(
    expect.objectContaining({
      userId: "ivy",
      context: expect.objectContaining({ traits: { plan: "pro" } }),
    }),
  );
  trace.dispose();
});

test("a new group's call carries only its own traits, though the real SDK would merge in the group's before", async () => {
  const session = rudderstack({
    sdk: rudderanalytics,
    group: { type: "workspace" },
  }).open();

  session.group?.({
    user: null,
    group: { type: "workspace", id: "w_1", traits: { tier: "enterprise" } },
  });
  session.group?.({
    user: null,
    group: { type: "workspace", id: "w_2", traits: { seats: 3 } },
  });

  await reached(
    ({ path, body }) => path === "/v1/group" && body["groupId"] === "w_2",
  );

  expect(
    requests.flatMap(({ path, body }) => {
      if (path !== "/v1/group") {
        return [];
      }

      return [{ groupId: body["groupId"], traits: body["traits"] }];
    }),
  ).toStrictEqual([
    { groupId: "w_1", traits: { tier: "enterprise" } },
    { groupId: "w_2", traits: { seats: 3 } },
  ]);
});

test("through a Trace, a user switch resets the real SDK and its anonymous id before the next user, so each event keeps its user", async () => {
  const trace = new Trace({
    events: { "Dee Opened": event(), "Eve Opened": event() },
    destinations: { rudderstack: rudderstack({ sdk: rudderanalytics }) },
  });

  trace.start();
  trace.user({ id: "dee", traits: { plan: "pro" } });
  await trace.track("Dee Opened").settled;
  trace.user({ id: "eve" });
  await trace.track("Eve Opened").settled;
  await reached(isTrack("Eve Opened"));

  const dee = getTrack("Dee Opened");
  const eve = getTrack("Eve Opened");

  expect(dee).toMatchObject({
    userId: "dee",
    anonymousId: expect.any(String),
    context: { traits: { plan: "pro" } },
  });
  expect(eve).toMatchObject({
    userId: "eve",
    anonymousId: expect.any(String),
    context: { traits: {} },
  });
  expect(eve?.["anonymousId"]).not.toBe(dee?.["anonymousId"]);
  trace.dispose();
});

testAnalyticsAdapter({
  name: "rudderstack over @rudderstack/analytics-js 3.34.1",
  createAdapter: () =>
    rudderstack({ sdk: rudderanalytics, group: { type: "workspace" } }),
});
