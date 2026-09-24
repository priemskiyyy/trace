// @vitest-environment jsdom
import { event, Trace, TraceError } from "@priemskiyyy/trace";
import type { TrackContext, TrackedEvent } from "@priemskiyyy/trace";
import { testAnalyticsAdapter } from "@priemskiyyy/trace/testing";
import mixpanelBrowser from "mixpanel-browser";
import type { BeforeSendHookPayload, Config } from "mixpanel-browser";
import { afterEach, beforeAll, expect, test, vi } from "vitest";

import { mixpanel } from "src/mixpanel";
import { createTrackedEvent, TRACKED_EVENT } from "src/trackedEvent.fixture";

type Request = { endpoint: string; data: unknown };

const requests: Request[] = [];
let isFiltering = false;
let isOffline = false;
let earlyCall: unknown = null;
let earlyOpen: unknown = null;

class RecordingRequest {
  #url = "";

  open = (_method: string, url: string) => {
    this.#url = url;
  };

  setRequestHeader = () => {};

  send = (body: string) => {
    if (isOffline) {
      throw new Error("The network is unreachable.");
    }

    requests.push({
      endpoint: new URL(this.#url).pathname,
      data: JSON.parse(new URLSearchParams(body).get("data") ?? "null"),
    });
  };
}

const NOW = Date.now();
const TOKEN = "test-token";

const CONFIG = {
  api_host: "https://mixpanel.example.test",
  api_payload_format: "json",
  batch_requests: false,
  persistence: "cookie",
  opt_out_tracking_persistence_type: "cookie",
  hooks: {
    before_send_events: (event: BeforeSendHookPayload) =>
      isFiltering ? null : event,
  },
} satisfies Partial<Config>;

const context: TrackContext = {
  signal: new AbortController().signal,
  currentGeneration: () => 0,
  now: () => NOW,
};

const createCurrentEvent = (tracked: Partial<TrackedEvent> = {}) =>
  createTrackedEvent({ timestamp: NOW, ...tracked });

const getThrown = (task: () => unknown) => {
  try {
    task();
  } catch (error) {
    return error;
  }

  return null;
};

const openSession = () => mixpanel({ sdk: mixpanelBrowser }).open();

beforeAll(() => {
  vi.stubGlobal("XMLHttpRequest", RecordingRequest);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("{}", { status: 200 })),
  );

  earlyCall = getThrown(() => mixpanelBrowser.track("Too early"));
  earlyOpen = getThrown(() => openSession());

  mixpanelBrowser.init(TOKEN, CONFIG);
});

afterEach(() => {
  requests.length = 0;
  isFiltering = false;
  isOffline = false;
  mixpanelBrowser.clear_opt_in_out_tracking();
  mixpanelBrowser.reset();
});

test("before the application initializes it, the real SDK throws from its methods and open refuses with NOT_INITIALIZED, and once it is initialized open succeeds", () => {
  expect(earlyCall).toBeInstanceOf(TypeError);
  expect(earlyOpen).toBeInstanceOf(TraceError);
  expect(earlyOpen).toMatchObject({ code: "NOT_INITIALIZED" });
  expect(openSession().native).toBe(mixpanelBrowser);
});

test("the real SDK sends one /track request with the event's properties, its context, its time and its id, and cuts the strings the losses name", () => {
  const event = createCurrentEvent({
    properties: {
      cart: { id: "c_1" },
      note: "x".repeat(300),
      distinct_id: "grace",
    },
    context: { app: { version: "2.4.0" } },
  });

  expect(openSession().track(event, context)).toEqual({
    status: "submitted",
    evidence: "sdk-call-returned",
    losses: [
      { path: "properties.note", reason: "truncated" },
      { path: "properties.distinct_id", reason: "omitted" },
    ],
  });
  expect(requests).toMatchObject([
    {
      endpoint: "/track/",
      data: {
        event: "Checkout Started",
        properties: {
          cart: { id: "c_1" },
          note: "x".repeat(255),
          app: { version: "2.4.0" },
          time: event.timestamp,
          $insert_id: event.id,
          token: "test-token",
          distinct_id: expect.stringMatching(/^\$device:/),
        },
      },
    },
  ]);
});

test("the real SDK answers null when before_send_events drops an event and nothing while opted out, and both are provider-filtered", () => {
  const session = openSession();

  const filtered = {
    status: "dropped",
    reason: "provider-filtered",
    losses: [],
  };

  isFiltering = true;

  expect(session.track(createCurrentEvent(), context)).toEqual(filtered);

  isFiltering = false;
  session.collection?.(false);

  expect(session.track(createCurrentEvent(), context)).toEqual(filtered);

  session.collection?.(true);

  expect(requests).toEqual([]);
});

test("a request the real SDK cannot start answers false, which fails with DELIVERY_FAILED", () => {
  isOffline = true;

  const result = openSession().track(createCurrentEvent(), context);

  expect(result).toEqual({ status: "failed", error: expect.any(TraceError) });
  expect(result).toMatchObject({ error: { code: "DELIVERY_FAILED" } });
});

test("identify, traits and a group reach the real SDK's /track, /engage and /groups endpoints", () => {
  const session = openSession();
  const ada = { id: "ada" };

  session.identify?.({ user: ada });
  session.traits?.({ user: ada, set: { plan: "pro" }, remove: ["role"] });
  session.group?.({
    user: ada,
    group: {
      type: "workspace",
      id: "w_1",
      traits: { seats: 3, legacy: null },
    },
  });

  expect(requests).toMatchObject([
    {
      endpoint: "/track/",
      data: {
        event: "$identify",
        properties: {
          distinct_id: "ada",
          $anon_distinct_id: expect.stringMatching(/^\$device:/),
        },
      },
    },
    {
      endpoint: "/engage/",
      data: { $distinct_id: "ada", $set: { plan: "pro" } },
    },
    { endpoint: "/engage/", data: { $distinct_id: "ada", $unset: ["role"] } },
    {
      endpoint: "/engage/",
      data: { $distinct_id: "ada", $set: { workspace: ["w_1"] } },
    },
    {
      endpoint: "/groups/",
      data: { $group_key: "workspace", $group_id: "w_1", $set: { seats: 3 } },
    },
    {
      endpoint: "/groups/",
      data: { $group_key: "workspace", $group_id: "w_1", $unset: ["legacy"] },
    },
  ]);
});

test("traits identify their user first, so they reach a user the real SDK restored from storage in a new page load", () => {
  openSession().identify?.({ user: { id: "ada" } });
  requests.length = 0;

  const reloaded = mixpanelBrowser.init(TOKEN, CONFIG, "reloaded");

  mixpanel({ sdk: reloaded })
    .open()
    .traits?.({ user: { id: "ada" }, set: { plan: "pro" }, remove: [] });

  expect(reloaded.get_distinct_id()).toBe("ada");
  expect(requests).toContainEqual({
    endpoint: "/engage/",
    data: expect.objectContaining({
      $distinct_id: "ada",
      $set: expect.objectContaining({ plan: "pro" }),
    }),
  });
});

test("a group type Mixpanel owns is refused before the real SDK sees it, so the distinct id and device id stay the user's own", () => {
  const session = openSession();
  const ada = { id: "ada" };

  session.identify?.({ user: ada });
  requests.length = 0;

  const refusals = [
    getThrown(() =>
      session.group?.({
        user: ada,
        group: { type: "distinct_id", id: "w_1", traits: {} },
      }),
    ),
    getThrown(() =>
      session.group?.({
        user: ada,
        group: { type: "distinct_id", id: null, traits: {} },
      }),
    ),
    getThrown(() =>
      session.group?.({
        user: ada,
        group: { type: "$device_id", id: "w_1", traits: {} },
      }),
    ),
  ];

  session.track(createCurrentEvent(), context);

  expect(
    refusals.map((refusal) => refusal instanceof TraceError && refusal.code),
  ).toEqual(["UNSUPPORTED", "UNSUPPORTED", "UNSUPPORTED"]);
  expect(mixpanelBrowser.get_distinct_id()).toBe("ada");
  expect(requests).toMatchObject([
    {
      endpoint: "/track/",
      data: {
        properties: { distinct_id: "ada", $device_id: expect.any(String) },
      },
    },
  ]);
});

test("a property named like a group the user is in is omitted, so the real SDK's /track keeps the membership", () => {
  const session = openSession();

  session.group?.({
    user: null,
    group: { type: "workspace", id: "w_1", traits: {} },
  });
  requests.length = 0;

  const event = createCurrentEvent({
    properties: { workspace: "Acme", plan: "pro" },
    identity: {
      ...TRACKED_EVENT.identity,
      groups: { workspace: { id: "w_1", traits: {} } },
    },
  });

  expect(session.track(event, context)).toEqual({
    status: "submitted",
    evidence: "sdk-call-returned",
    losses: [{ path: "properties.workspace", reason: "omitted" }],
  });
  expect(requests).toMatchObject([
    {
      endpoint: "/track/",
      data: { properties: { workspace: ["w_1"], plan: "pro" } },
    },
  ]);
});

test("leaving a group through the real SDK takes the membership off later events without a stray group_key", () => {
  const session = openSession();
  const ada = { id: "ada" };

  session.identify?.({ user: ada });
  session.group?.({
    user: ada,
    group: { type: "workspace", id: "w_1", traits: {} },
  });
  requests.length = 0;
  session.track(createCurrentEvent(), context);
  session.group?.({
    user: ada,
    group: { type: "workspace", id: null, traits: {} },
  });
  session.track(createCurrentEvent(), context);

  expect(requests).toMatchObject([
    { endpoint: "/track/", data: { properties: { workspace: ["w_1"] } } },
    {
      endpoint: "/engage/",
      data: { $distinct_id: "ada", $unset: ["workspace"] },
    },
    { endpoint: "/track/", data: { properties: { distinct_id: "ada" } } },
  ]);
  expect(requests[2]?.data).not.toHaveProperty(["properties", "workspace"]);
  expect(requests[2]?.data).not.toHaveProperty(["properties", "group_key"]);
});

test("reset through the real SDK forgets the user, so the next event is anonymous", () => {
  const session = openSession();

  session.identify?.({ user: { id: "ada" } });
  session.reset?.();
  requests.length = 0;
  session.track(createCurrentEvent(), context);

  expect(requests).toMatchObject([
    {
      endpoint: "/track/",
      data: {
        properties: { distinct_id: expect.stringMatching(/^\$device:/) },
      },
    },
  ]);
  expect(requests[0]?.data).not.toHaveProperty(["properties", "$user_id"]);
});

test("collection off and on through the real SDK deletes no profile, sends no $opt_in and keeps the user", () => {
  const session = openSession();

  session.identify?.({ user: { id: "ada" } });
  requests.length = 0;
  session.collection?.(false);
  session.collection?.(true);
  session.track(createCurrentEvent(), context);

  expect(requests).toMatchObject([
    {
      endpoint: "/track/",
      data: {
        event: "Checkout Started",
        properties: { distinct_id: "ada", $user_id: "ada" },
      },
    },
  ]);
});

test("an id the real SDK refuses to identify throws UNSUPPORTED and sends nothing", () => {
  const refusal = getThrown(() =>
    openSession().identify?.({ user: { id: "$device:ada" } }),
  );

  expect(refusal).toBeInstanceOf(TraceError);
  expect(refusal).toMatchObject({ code: "UNSUPPORTED" });
  expect(requests).toEqual([]);
});

test("through a real Trace, a user id mixpanel-browser would cut never reaches it: that user's events are skipped as identity-failed, and the next user's go under their own id", async () => {
  const trace = new Trace({
    events: { "Checkout Started": event<Record<string, unknown>>() },
    destinations: { product: mixpanel({ sdk: mixpanelBrowser }) },
  });

  trace.start();
  trace.user({ id: "u".repeat(256) });

  const skipped = await trace.track("Checkout Started", {}).settled;

  trace.user({ id: "bob" });

  const bob = await trace.track("Checkout Started", {}).settled;

  trace.dispose();

  expect([skipped, bob]).toEqual([
    {
      state: "settled",
      outcomes: { product: { status: "skipped", reason: "identity-failed" } },
    },
    {
      state: "settled",
      outcomes: {
        product: {
          status: "submitted",
          evidence: "sdk-call-returned",
          event: null,
          losses: [],
        },
      },
    },
  ]);
  expect(requests).toMatchObject([
    {
      endpoint: "/track/",
      data: { event: "$identify", properties: { distinct_id: "bob" } },
    },
    {
      endpoint: "/track/",
      data: { event: "Checkout Started", properties: { distinct_id: "bob" } },
    },
  ]);
  expect(mixpanelBrowser.get_distinct_id()).toBe("bob");
});

testAnalyticsAdapter({
  name: "mixpanel over mixpanel-browser 2.83.0",
  createAdapter: () => mixpanel({ sdk: mixpanelBrowser }),
});
