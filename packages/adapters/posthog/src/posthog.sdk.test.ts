// @vitest-environment jsdom
import { event, Trace, TraceError } from "@priemskiyyy/trace";
import type { TrackContext, TrackedEvent } from "@priemskiyyy/trace";
import { PostHog } from "posthog-js";
import type { CaptureResult, PostHogConfig } from "posthog-js";
import { beforeEach, expect, onTestFinished, test, vi } from "vitest";

import { posthog } from "src/posthog";

const EVENT_ID = "0b5f6c9e-8f1a-4c2d-9a3b-2f6e1d4c7a88";
const TIMESTAMP = 1_767_225_600_000;

const context: TrackContext = {
  signal: new AbortController().signal,
  currentGeneration: () => 1,
  now: () => TIMESTAMP,
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

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("{}", { status: 200 })),
  );
});

const createPostHog = (config: Partial<PostHogConfig> = {}) => {
  const events: CaptureResult[] = [];
  const filter = { dropping: false };
  const sdk = new PostHog();

  sdk.init("phc_test", {
    api_host: "https://posthog.example.test",
    persistence: "memory",
    bootstrap: { distinctID: "anonymous-1", isIdentifiedID: false },
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    capture_exceptions: false,
    disable_session_recording: true,
    disable_surveys: true,
    advanced_disable_flags: true,
    before_send: (event) => {
      if (event === null || filter.dropping) {
        return null;
      }

      events.push(event);

      return event;
    },
    ...config,
  });
  onTestFinished(() => {
    sdk.reset();
  });

  return { sdk, events, filter };
};

const getThrown = (call: () => unknown) => {
  try {
    call();
  } catch (error) {
    return error;
  }

  return null;
};

const getEvents = (events: CaptureResult[], name: string) =>
  events.filter(({ event }) => event === name);

test("the real SDK files the event under the person it holds, with its uuid, its timestamp and its properties over its context", () => {
  const { sdk, events } = createPostHog();
  const session = posthog({ sdk }).open();

  session.identify?.({ user: { id: "ada" } });

  const answer = session.track(createEvent(), context);
  const [event] = getEvents(events, "Checkout Started");

  expect(event?.uuid).toBe(EVENT_ID);
  expect(event?.timestamp).toEqual(new Date(TIMESTAMP));
  expect(event?.properties).toMatchObject({
    distinct_id: "ada",
    app: { version: "2.4.0" },
    cart: { id: "cart_1" },
    value: 49.5,
  });
  expect(answer).toStrictEqual({
    status: "submitted",
    evidence: "sdk-call-returned",
    event: { id: EVENT_ID },
    losses: [],
  });
});

test("the real SDK never receives a name it owns, so the event stays with its person, changes no one and keeps the project's token", () => {
  const { sdk, events } = createPostHog();
  const session = posthog({ sdk }).open();

  session.identify?.({ user: { id: "ada" } });

  const answer = session.track(
    createEvent({
      properties: {
        distinct_id: "grace",
        token: "phc_other",
        $set: { email: "grace@example.test" },
        $groups: { company: "other" },
        value: 49.5,
      },
      context: {},
    }),
    context,
  );

  const [event] = getEvents(events, "Checkout Started");

  expect(event?.properties.distinct_id).toBe("ada");
  expect(event?.properties.token).toBe("phc_test");
  expect(event?.properties).not.toHaveProperty("$set");
  expect(event?.properties.$groups).toBe(undefined);
  expect(event?.$set).toBe(undefined);
  expect(answer).toStrictEqual({
    status: "submitted",
    evidence: "sdk-call-returned",
    event: { id: EVENT_ID },
    losses: [
      { path: "properties.distinct_id", reason: "omitted" },
      { path: "properties.token", reason: "omitted" },
      { path: "properties.$set", reason: "omitted" },
      { path: "properties.$groups", reason: "omitted" },
    ],
  });
});

test("an event the real SDK's before_send drops is provider-filtered", () => {
  const { sdk, filter } = createPostHog();
  const session = posthog({ sdk }).open();

  filter.dropping = true;

  expect(session.track(createEvent(), context)).toStrictEqual({
    status: "dropped",
    reason: "provider-filtered",
    losses: [],
  });
});

test("the real SDK takes frozen traits as person properties, nested nulls included", () => {
  const { sdk, events } = createPostHog();
  const session = posthog({ sdk }).open();

  session.identify?.({ user: { id: "ada" } });
  session.traits?.(
    freeze({
      user: { id: "ada" },
      set: { plan: "pro", profile: { score: null }, tags: ["a", null] },
      remove: ["legacy"],
    }),
  );

  const updates = getEvents(events, "$set");

  expect(updates.map((update) => update.properties.$unset)).toEqual([
    ["legacy"],
    undefined,
  ]);
  expect(updates[1]?.properties.$set).toEqual({
    plan: "pro",
    profile: { score: null },
    tags: ["a", null],
  });
});

test("leaving one group keeps the real SDK's other memberships the session wrote", () => {
  const { sdk, events } = createPostHog();
  const session = posthog({ sdk }).open();

  session.group?.({
    user: null,
    group: { type: "workspace", id: "w_1", traits: { plan: "team" } },
  });
  session.group?.({
    user: null,
    group: { type: "team", id: "t_1", traits: {} },
  });
  session.group?.({
    user: null,
    group: { type: "workspace", id: null, traits: {} },
  });
  session.track(createEvent(), context);

  expect(sdk.getGroups()).toEqual({ team: "t_1" });
  expect(getEvents(events, "Checkout Started")[0]?.properties.$groups).toEqual({
    team: "t_1",
  });
});

test("leaving one group keeps the memberships the real SDK restored from an earlier page load", () => {
  const config: Partial<PostHogConfig> = {
    persistence: "localStorage",
    bootstrap: { distinctID: "returning-1", isIdentifiedID: false },
  };

  localStorage.clear();

  const earlier = createPostHog(config);

  posthog({ sdk: earlier.sdk })
    .open()
    .group?.({
      user: null,
      group: { type: "project", id: "p1", traits: {} },
    });

  const { sdk } = createPostHog(config);
  const session = posthog({ sdk }).open();

  expect(sdk.getGroups()).toStrictEqual({ project: "p1" });

  session.group?.({
    user: null,
    group: { type: "company", id: "acme", traits: {} },
  });
  session.group?.({
    user: null,
    group: { type: "company", id: null, traits: {} },
  });

  expect(sdk.getGroups()).toStrictEqual({ project: "p1" });
});

test("the real SDK's receipt names the event by the uuid posthog-js sends, a new one once it has cut the event's uuid past properties_string_max_length", () => {
  const { sdk, events } = createPostHog({ properties_string_max_length: 20 });
  const session = posthog({ sdk }).open();

  const answer = session.track(
    createEvent({ properties: {}, context: {} }),
    context,
  );

  const uuid = events[0]?.uuid;

  expect(uuid).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/,
  );
  expect(answer).toStrictEqual({
    status: "submitted",
    evidence: "sdk-call-returned",
    event: { id: uuid },
    losses: [],
  });
});

test("after the real SDK's reset, which forgets consent, collection is applied again without an $opt_in event", () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const { sdk, events } = createPostHog({ opt_out_capturing_by_default: true });
  const session = posthog({ sdk }).open();

  session.collection?.(true);
  session.identify?.({ user: { id: "ada" } });
  session.reset?.();
  session.track(
    createEvent({
      identity: { generation: 2, user: null, traits: {}, groups: {} },
    }),
    context,
  );

  expect(sdk.is_capturing()).toBe(true);
  expect(events.map(({ event }) => event)).toEqual([
    "$identify",
    "Checkout Started",
  ]);
  expect(warn.mock.calls).toEqual([
    [
      "[PostHog.js]",
      "reset() cleared the stored consent, and capturing is now off because of `opt_out_capturing_by_default`. Call opt_in_capturing() again, and prefer calling reset() before opting in rather than after.",
    ],
  ]);
});

test("under the real SDK's person_profiles never, identify reports UNSUPPORTED and the events stay with the anonymous person", () => {
  const { sdk, events } = createPostHog({ person_profiles: "never" });
  const session = posthog({ sdk }).open();

  const thrown = getThrown(() => session.identify?.({ user: { id: "ada" } }));

  session.track(
    createEvent({
      identity: { generation: 1, user: { id: "ada" }, traits: {}, groups: {} },
    }),
    context,
  );

  expect(thrown).toStrictEqual(
    new TraceError({
      code: "UNSUPPORTED",
      message: `PostHog's person_profiles "never" keeps no person, so it ignores identify, person properties and group properties.`,
    }),
  );
  expect(sdk.get_distinct_id()).toBe("anonymous-1");
  expect(getEvents(events, "Checkout Started")[0]?.properties).toMatchObject({
    distinct_id: "anonymous-1",
    $process_person_profile: false,
  });
});

test("the real SDK cuts a string past properties_string_max_length itself, and the receipt says so", () => {
  const { sdk, events } = createPostHog({ properties_string_max_length: 40 });
  const session = posthog({ sdk }).open();
  const note = "n".repeat(41);

  const answer = session.track(
    createEvent({ properties: { note }, context: {} }),
    context,
  );

  expect(getEvents(events, "Checkout Started")[0]?.properties.note).toBe(
    note.slice(0, 40),
  );
  expect(answer).toStrictEqual({
    status: "submitted",
    evidence: "sdk-call-returned",
    event: { id: EVENT_ID },
    losses: [{ path: "properties.note", reason: "truncated" }],
  });
});

test("the real SDK cuts an event name past properties_string_max_length too, and the receipt says so", () => {
  const { sdk, events } = createPostHog({ properties_string_max_length: 40 });
  const session = posthog({ sdk }).open();
  const name = "N".repeat(41);

  const answer = session.track(
    createEvent({ name, properties: {}, context: {} }),
    context,
  );

  expect(events.map(({ event: captured }) => captured)).toStrictEqual([
    name.slice(0, 40),
  ]);
  expect(answer).toStrictEqual({
    status: "submitted",
    evidence: "sdk-call-returned",
    event: { id: EVENT_ID },
    losses: [{ path: "name", reason: "truncated" }],
  });
});

test("an id the real SDK refuses to identify is reported unsupported, and PostHog keeps its anonymous person", () => {
  const { sdk } = createPostHog();
  const session = posthog({ sdk }).open();

  expect(
    getThrown(() => session.identify?.({ user: { id: "null" } })),
  ).toStrictEqual(
    new TraceError({
      code: "UNSUPPORTED",
      message:
        'posthog-js refuses to identify "null", so the person stays anonymous there.',
    }),
  );
  expect(sdk.get_distinct_id()).toBe("anonymous-1");
});

test("the real SDK identifies an id that only resembles its cookieless placeholder, so the adapter sends it", () => {
  const { sdk } = createPostHog();
  const session = posthog({ sdk }).open();

  session.identify?.({ user: { id: "$PostHog_Cookieless" } });

  expect(sdk.get_distinct_id()).toBe("$PostHog_Cookieless");
});

test("through Trace, the real SDK files each user's events under that user across a switch, and consent it forgot on reset comes back", async () => {
  const { sdk, events } = createPostHog({ opt_out_capturing_by_default: true });

  vi.spyOn(console, "warn").mockImplementation(() => {});

  const trace = new Trace({
    events: { "Note Added": event<{ note: string }>() },
    destinations: { product: posthog({ sdk }) },
    consent: { product: ["analytics"] },
  });

  onTestFinished(trace.dispose);
  trace.consent.set({ analytics: "granted" });
  trace.start();
  trace.user({ id: "ada" });
  await trace.track("Note Added", { note: "from ada" }).settled;
  trace.user({ id: "bob" });
  await trace.track("Note Added", { note: "from bob" }).settled;

  expect(
    getEvents(events, "Note Added").map(({ properties }) => [
      properties.note,
      properties.distinct_id,
    ]),
  ).toStrictEqual([
    ["from ada", "ada"],
    ["from bob", "bob"],
  ]);
  expect(getEvents(events, "$opt_in")).toStrictEqual([]);
});

test("through Trace, the real SDK never identifies a user whose id PostHog would shorten: that user's events are skipped as identity-failed, and the next user's go under their own id", async () => {
  const { sdk, events } = createPostHog();

  const trace = new Trace({
    events: { "Note Added": event<{ note: string }>() },
    destinations: { product: posthog({ sdk }) },
  });

  onTestFinished(trace.dispose);
  trace.start();
  trace.user({ id: "u".repeat(201) });

  const skipped = await trace.track("Note Added", { note: "long id" }).settled;

  trace.user({ id: "bob" });

  const bob = await trace.track("Note Added", { note: "from bob" }).settled;

  expect([skipped, bob]).toStrictEqual([
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
          event: { id: expect.any(String) },
          losses: [],
        },
      },
    },
  ]);
  expect(
    getEvents(events, "Note Added").map(({ properties }) => [
      properties.note,
      properties.distinct_id,
    ]),
  ).toStrictEqual([["from bob", "bob"]]);
  expect(sdk.get_distinct_id()).toBe("bob");
});

test("the real SDK takes none of a person property holding a string it would cut, the rest is set, and the update is reported unsupported", () => {
  const { sdk, events } = createPostHog({ properties_string_max_length: 40 });
  const session = posthog({ sdk }).open();

  session.identify?.({ user: { id: "ada" } });

  const thrown = getThrown(() =>
    session.traits?.(
      freeze({
        user: { id: "ada" },
        set: {
          plan: "pro",
          note: "n".repeat(41),
          profile: { bio: "b".repeat(41), name: "ada" },
        },
        remove: [],
      }),
    ),
  );

  expect(thrown).toStrictEqual(
    new TraceError({
      code: "UNSUPPORTED",
      message:
        "posthog-js would cut these values past properties_string_max_length, so they were left out: traits.note, traits.profile.",
    }),
  );
  expect(
    getEvents(events, "$set").map(({ properties }) => properties.$set),
  ).toStrictEqual([{ plan: "pro" }]);
});

test("opening a real PostHog that was never initialized is refused with NOT_INITIALIZED", () => {
  const sdk = new PostHog();

  expect(sdk.__loaded).toBe(false);
  expect(getThrown(posthog({ sdk }).open)).toStrictEqual(
    new TraceError({
      code: "NOT_INITIALIZED",
      message:
        "PostHog is not initialized. Call posthog.init before trace.start().",
    }),
  );
});

test.each(["always", "on_reject"] satisfies PostHogConfig["cookieless_mode"][])(
  "opening a real PostHog in cookieless_mode %s is refused with UNSUPPORTED",
  (mode) => {
    const { sdk } = createPostHog({ cookieless_mode: mode });

    expect(getThrown(posthog({ sdk }).open)).toStrictEqual(
      new TraceError({
        code: "UNSUPPORTED",
        message: `PostHog's cookieless_mode "${mode}" ignores opt-out or replaces the person on a consent change, so Trace cannot gate it or keep its identity.`,
      }),
    );
  },
);
