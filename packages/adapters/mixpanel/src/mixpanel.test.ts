import { event, Trace, TraceError } from "@priemskiyyy/trace";
import type { TraceDiagnosticEvent, TrackContext } from "@priemskiyyy/trace";
import { expect, test } from "vitest";

import { fakeMixpanel } from "src/fakeMixpanel.fixture";
import { mixpanel } from "src/mixpanel";
import { createTrackedEvent, TRACKED_EVENT } from "src/trackedEvent.fixture";

const { id: EVENT_ID, timestamp: NOW } = TRACKED_EVENT;
const DAY = 24 * 60 * 60 * 1000;

const EVENTS = {
  "Checkout Started": event<Record<string, unknown>>(),
};

const EVENT_DEFAULTS = {
  $os: "Mac OS X",
  $browser: "Chrome",
  mp_lib: "web",
  $lib_version: "2.83.0",
};

const PROFILE_DEFAULTS = {
  $os: "Mac OS X",
  $browser: "Chrome",
  $browser_version: 140,
};

const createContext = (now = NOW): TrackContext => ({
  signal: new AbortController().signal,
  currentGeneration: () => 0,
  now: () => now,
});

const range = (count: number) =>
  Array.from({ length: count }, (_, index) => index);

const getHeavyProperties = (last: number) => ({
  ...Object.fromEntries(
    range(124).map((index) => [
      `p${index}`,
      range(31).map(() => "x".repeat(255)),
    ]),
  ),
  pad: [...range(27).map(() => "x".repeat(255)), "x".repeat(last)],
});

const openSession = (fake = fakeMixpanel()) => ({
  fake,
  session: mixpanel({ sdk: fake.sdk }).open(),
});

const createTrace = (
  fake: ReturnType<typeof fakeMixpanel>,
  {
    gated = false,
    now = () => NOW,
  }: { gated?: boolean; now?: () => number } = {},
) =>
  new Trace({
    events: EVENTS,
    destinations: { product: mixpanel({ sdk: fake.sdk }) },
    consent: gated ? { product: ["analytics"] } : {},
    now,
  });

const getThrown = (task: () => unknown) => {
  try {
    task();
  } catch (error) {
    return error;
  }

  return null;
};

test("creating the adapter reads and calls nothing on Mixpanel", () => {
  const fake = fakeMixpanel({ loaded: false });
  const reads: PropertyKey[] = [];

  const sdk = new Proxy(fake.sdk, {
    get: (target, key, receiver) => {
      reads.push(key);

      return Reflect.get(target, key, receiver);
    },
  });

  expect(mixpanel({ sdk }).name).toBe("mixpanel");
  expect(reads).toEqual([]);
  expect(fake.calls).toEqual([]);
});

test("a Mixpanel the application has not initialized refuses to open with NOT_INITIALIZED, and opens once it is initialized", () => {
  const fake = fakeMixpanel({ loaded: false });
  const adapter = mixpanel({ sdk: fake.sdk });

  const refusal = getThrown(() => adapter.open());

  expect(refusal).toBeInstanceOf(TraceError);
  expect(refusal).toMatchObject({
    code: "NOT_INITIALIZED",
    message:
      "Mixpanel is not initialized. Call mixpanel.init before trace.start().",
  });
  expect(fake.calls).toEqual([]);

  fake.sdk.init("app-token");

  expect(adapter.open().native).toBe(fake.sdk);
  expect(fake.calls).toEqual([{ method: "init", args: ["app-token", {}] }]);
});

test("an event is one track call with its properties over its context, its time and its id, and the losses of that mapping", () => {
  const { fake, session } = openSession();

  const tracked = createTrackedEvent({
    properties: { cart: { id: "c_1" }, note: "x".repeat(300), token: "t" },
    context: { app: { version: "2.4.0" }, note: "from context" },
  });

  expect(session.track(tracked, createContext())).toEqual({
    status: "submitted",
    evidence: "sdk-call-returned",
    losses: [
      { path: "properties.note", reason: "truncated" },
      { path: "properties.token", reason: "omitted" },
      { path: "context.note", reason: "omitted" },
    ],
  });
  expect(fake.calls).toEqual([
    {
      method: "track",
      args: [
        "Checkout Started",
        {
          time: NOW,
          $insert_id: EVENT_ID,
          cart: { id: "c_1" },
          note: "x".repeat(300),
          app: { version: "2.4.0" },
        },
      ],
    },
  ]);
  expect(fake.events).toEqual([
    {
      event: "Checkout Started",
      properties: {
        ...EVENT_DEFAULTS,
        distinct_id: "$device:device-1",
        $device_id: "device-1",
        time: NOW,
        $insert_id: EVENT_ID,
        cart: { id: "c_1" },
        note: "x".repeat(255),
        app: { version: "2.4.0" },
        token: "fake-token",
      },
    },
  ]);
});

test("the five-day window runs on the Trace's clock: an event older than five days is dropped as provider-filtered, with its time unsupported, and never reaches Mixpanel", () => {
  const clock = Date.UTC(2030, 0, 10);
  const { fake, session } = openSession();
  const oldest = createTrackedEvent({ timestamp: clock - 5 * DAY });
  const tooOld = createTrackedEvent({ timestamp: clock - 5 * DAY - 1 });

  expect(session.track(oldest, createContext(clock))).toEqual({
    status: "submitted",
    evidence: "sdk-call-returned",
    losses: [],
  });
  expect(session.track(tooOld, createContext(clock))).toEqual({
    status: "dropped",
    reason: "provider-filtered",
    losses: [{ path: "timestamp", reason: "unsupported" }],
  });
  expect(fake.calls).toEqual([
    {
      method: "track",
      args: [
        "Checkout Started",
        { time: clock - 5 * DAY, $insert_id: EVENT_ID },
      ],
    },
  ]);
});

test("a time ahead of the Trace's clock is sent as it is, with no loss, since Mixpanel judges the future on its own clock at ingestion", () => {
  const { fake, session } = openSession();
  const ahead = createTrackedEvent({ timestamp: NOW + 1 });

  expect(session.track(ahead, createContext())).toEqual({
    status: "submitted",
    evidence: "sdk-call-returned",
    losses: [],
  });
  expect(fake.calls).toEqual([
    {
      method: "track",
      args: ["Checkout Started", { time: NOW + 1, $insert_id: EVENT_ID }],
    },
  ]);
});

test("an event Mixpanel would receive as 1 MB of JSON or more is dropped as provider-filtered without reaching it, and one byte less is sent", () => {
  const { fake, session } = openSession();

  const under = createTrackedEvent({ properties: getHeavyProperties(148) });
  const over = createTrackedEvent({ properties: getHeavyProperties(149) });

  expect(session.track(under, createContext())).toEqual({
    status: "submitted",
    evidence: "sdk-call-returned",
    losses: [],
  });
  expect(session.track(over, createContext())).toEqual({
    status: "dropped",
    reason: "provider-filtered",
    losses: [{ path: "properties", reason: "invalid" }],
  });
  expect(fake.calls.map(({ method }) => method)).toEqual(["track"]);
});

test("an event Mixpanel's own filters drop answers nothing and is dropped as provider-filtered, with its mapping's losses", () => {
  const { fake, session } = openSession(
    fakeMixpanel({ config: { opt_out_tracking_by_default: true } }),
  );

  const tracked = createTrackedEvent({ context: { token: "other" } });

  expect(session.track(tracked, createContext())).toEqual({
    status: "dropped",
    reason: "provider-filtered",
    losses: [{ path: "context.token", reason: "omitted" }],
  });
  expect(fake.calls).toEqual([
    {
      method: "track",
      args: ["Checkout Started", { time: NOW, $insert_id: EVENT_ID }],
    },
  ]);
  expect(fake.events).toEqual([]);
});

test("an immediate request a before_send_events hook drops answers null, and is dropped as provider-filtered as well", () => {
  const { fake, session } = openSession(
    fakeMixpanel({
      config: {
        batch_requests: false,
        hooks: { before_send_events: () => null },
      },
    }),
  );

  expect(session.track(createTrackedEvent(), createContext())).toEqual({
    status: "dropped",
    reason: "provider-filtered",
    losses: [],
  });
  expect(fake.calls).toEqual([
    {
      method: "track",
      args: ["Checkout Started", { time: NOW, $insert_id: EVENT_ID }],
    },
  ]);
  expect(fake.events).toEqual([]);
});

test("an immediate request the browser refuses to start fails with DELIVERY_FAILED", () => {
  const fake = fakeMixpanel({ config: { batch_requests: false } });

  fake.state.requestFails = true;

  const { session } = openSession(fake);
  const result = session.track(createTrackedEvent(), createContext());

  expect(result).toEqual({ status: "failed", error: expect.any(TraceError) });
  expect(result).toMatchObject({
    error: {
      code: "DELIVERY_FAILED",
      message: "Mixpanel could not start the request for this event.",
    },
  });
  expect(fake.events).toEqual([]);
});

test("identify makes the user Mixpanel's distinct id, which Mixpanel announces with $identify from the id it replaces", () => {
  const { fake, session } = openSession();

  session.identify?.({ user: { id: "ada" } });

  expect(fake.calls).toEqual([{ method: "identify", args: ["ada"] }]);
  expect(fake.state.persisted).toEqual({
    distinct_id: "ada",
    $user_id: "ada",
    $device_id: "device-1",
  });
  expect(
    fake.events.map(({ event: name, properties }) => [
      name,
      properties.$anon_distinct_id,
    ]),
  ).toEqual([["$identify", "$device:device-1"]]);
});

test("an id Mixpanel refuses to identify throws UNSUPPORTED and changes nothing", () => {
  const { fake, session } = openSession();

  const refusal = getThrown(() =>
    session.identify?.({ user: { id: "$device:ada" } }),
  );

  expect(refusal).toBeInstanceOf(TraceError);
  expect(refusal).toMatchObject({ code: "UNSUPPORTED" });
  expect(fake.calls).toEqual([{ method: "identify", args: ["$device:ada"] }]);
  expect(fake.state.persisted).toEqual({
    distinct_id: "$device:device-1",
    $device_id: "device-1",
  });
});

test("a user id over 255 characters, which mixpanel-browser would cut, fails identify and traits with DELIVERY_FAILED before any call, so two users sharing the part it keeps never merge", () => {
  const { fake, session } = openSession();
  const user = { id: "u".repeat(256) };

  const failures = [
    getThrown(() => session.identify?.({ user })),
    getThrown(() =>
      session.traits?.({ user, set: { plan: "pro" }, remove: [] }),
    ),
  ];

  const failed = {
    code: "DELIVERY_FAILED",
    message:
      "mixpanel-browser keeps the first 255 characters of a distinct id, so this user would share an identity with any id that starts the same.",
  };

  expect(
    failures.map(
      (failure) =>
        failure instanceof TraceError && {
          code: failure.code,
          message: failure.message,
        },
    ),
  ).toEqual([failed, failed]);
  expect(fake.calls).toEqual([]);
});

test("traits identify their user first, so they reach a user Mixpanel restored from its cookie, and removals are unset", () => {
  const { fake, session } = openSession(fakeMixpanel({ storedUser: "ada" }));

  session.traits?.({
    user: { id: "ada" },
    set: { plan: "pro", seats: 3 },
    remove: ["role"],
  });

  expect(fake.calls).toEqual([
    { method: "identify", args: ["ada"] },
    { method: "people.set", args: [{ plan: "pro", seats: 3 }] },
    { method: "people.unset", args: [["role"]] },
  ]);
  expect(fake.profileUpdates).toEqual([
    {
      $distinct_id: "ada",
      $set: { ...PROFILE_DEFAULTS, plan: "pro", seats: 3 },
    },
    { $distinct_id: "ada", $unset: ["role"] },
  ]);
  expect(fake.events).toEqual([]);
});

test("a traits update sends only what changed: no $set without values and no $unset without removals", () => {
  const { fake, session } = openSession(fakeMixpanel({ storedUser: "ada" }));
  const ada = { id: "ada" };

  session.traits?.({ user: ada, set: {}, remove: ["role"] });
  session.traits?.({ user: ada, set: { plan: "pro" }, remove: [] });

  expect(fake.calls).toEqual([
    { method: "identify", args: ["ada"] },
    { method: "people.unset", args: [["role"]] },
    { method: "identify", args: ["ada"] },
    { method: "people.set", args: [{ plan: "pro" }] },
  ]);
});

test("anonymous traits wait in Mixpanel's queue and reach the user who is identified next", () => {
  const { fake, session } = openSession();

  session.traits?.({ user: null, set: { plan: "pro" }, remove: ["role"] });

  expect(fake.calls).toEqual([
    { method: "people.set", args: [{ plan: "pro" }] },
    { method: "people.unset", args: [["role"]] },
  ]);
  expect(fake.profileUpdates).toEqual([]);

  session.identify?.({ user: { id: "ada" } });

  expect(fake.profileUpdates).toEqual([
    { $distinct_id: "ada", $set: { ...PROFILE_DEFAULTS, plan: "pro" } },
    { $distinct_id: "ada", $unset: ["role"] },
  ]);
});

test("a trait Mixpanel would not keep exactly is left out whole, the rest of the update is applied, and the step throws UNSUPPORTED", () => {
  const { fake, session } = openSession(fakeMixpanel({ storedUser: "ada" }));

  const refusal = getThrown(() =>
    session.traits?.({
      user: { id: "ada" },
      set: {
        plan: "pro",
        bio: "x".repeat(256),
        deep: { a: { b: { c: { d: 1 } } } },
      },
      remove: ["role"],
    }),
  );

  expect(refusal).toBeInstanceOf(TraceError);
  expect(refusal).toMatchObject({
    code: "UNSUPPORTED",
    message:
      "Mixpanel cannot keep every profile property in this update; the others were set.",
  });
  expect(fake.calls).toEqual([
    { method: "identify", args: ["ada"] },
    { method: "people.set", args: [{ plan: "pro" }] },
    { method: "people.unset", args: [["role"]] },
  ]);
});

test("profile names mixpanel-browser drops without a word are left out of traits, the rest is applied, and the step throws UNSUPPORTED", () => {
  const { fake, session } = openSession(fakeMixpanel({ storedUser: "ada" }));

  const refusal = getThrown(() =>
    session.traits?.({
      user: { id: "ada" },
      set: {
        plan: "pro",
        $distinct_id: "grace",
        $token: "other-project",
        $device_id: "device-9",
        $had_persisted_distinct_id: true,
      },
      remove: ["role", "$user_id"],
    }),
  );

  expect(refusal).toBeInstanceOf(TraceError);
  expect(refusal).toMatchObject({
    code: "UNSUPPORTED",
    message:
      "Mixpanel cannot keep every profile property in this update; the others were set.",
  });
  expect(fake.calls).toEqual([
    { method: "identify", args: ["ada"] },
    { method: "people.set", args: [{ plan: "pro" }] },
    { method: "people.unset", args: [["role"]] },
  ]);
});

test("a removal whose name mixpanel-browser would cut is left out, the rest of the update is applied, and the step throws UNSUPPORTED", () => {
  const { fake, session } = openSession(fakeMixpanel({ storedUser: "ada" }));

  const refusal = getThrown(() =>
    session.traits?.({
      user: { id: "ada" },
      set: { plan: "pro" },
      remove: ["role", "k".repeat(256)],
    }),
  );

  expect(refusal).toBeInstanceOf(TraceError);
  expect(refusal).toMatchObject({
    code: "UNSUPPORTED",
    message:
      "Mixpanel cannot keep every profile property in this update; the others were set.",
  });
  expect(fake.calls).toEqual([
    { method: "identify", args: ["ada"] },
    { method: "people.set", args: [{ plan: "pro" }] },
    { method: "people.unset", args: [["role"]] },
  ]);
});

test("a group trait Mixpanel would not keep exactly is left out whole, the rest of the update is applied, and the step throws UNSUPPORTED", () => {
  const { fake, session } = openSession();

  const refusal = getThrown(() =>
    session.group?.({
      user: null,
      group: {
        type: "workspace",
        id: "w_1",
        traits: {
          plan: "team",
          motto: "x".repeat(256),
          ids: range(256),
          legacy: null,
        },
      },
    }),
  );

  expect(refusal).toBeInstanceOf(TraceError);
  expect(refusal).toMatchObject({
    code: "UNSUPPORTED",
    message:
      "Mixpanel cannot keep every group property in this update; the others were set.",
  });
  expect(fake.calls).toEqual([
    { method: "set_group", args: ["workspace", "w_1"] },
    { method: "get_group", args: ["workspace", "w_1"] },
    { method: "group.set", args: [{ plan: "team" }] },
    { method: "group.unset", args: ["legacy"] },
  ]);
});

test("group names mixpanel-browser drops without a word are left out of group traits, the rest is applied, and the step throws UNSUPPORTED", () => {
  const { fake, session } = openSession();

  const refusal = getThrown(() =>
    session.group?.({
      user: null,
      group: {
        type: "workspace",
        id: "w_1",
        traits: {
          plan: "team",
          $group_key: "company",
          $group_id: null,
          legacy: null,
        },
      },
    }),
  );

  expect(refusal).toBeInstanceOf(TraceError);
  expect(refusal).toMatchObject({
    code: "UNSUPPORTED",
    message:
      "Mixpanel cannot keep every group property in this update; the others were set.",
  });
  expect(fake.calls).toEqual([
    { method: "set_group", args: ["workspace", "w_1"] },
    { method: "get_group", args: ["workspace", "w_1"] },
    { method: "group.set", args: [{ plan: "team" }] },
    { method: "group.unset", args: ["legacy"] },
  ]);
});

test("a group update whose only trait is past the limits still throws UNSUPPORTED, with nothing sent for the group's profile", () => {
  const { fake, session } = openSession();

  const refusal = getThrown(() =>
    session.group?.({
      user: null,
      group: {
        type: "workspace",
        id: "w_1",
        traits: {
          rows: range(4).map(() => range(254).map(() => "x".repeat(255))),
        },
      },
    }),
  );

  expect(refusal).toBeInstanceOf(TraceError);
  expect(refusal).toMatchObject({ code: "UNSUPPORTED" });
  expect(fake.calls).toEqual([
    { method: "set_group", args: ["workspace", "w_1"] },
  ]);
});

test("a group type that is a name Mixpanel owns is refused before any call, joining or leaving, so it cannot rewrite Mixpanel's identity", () => {
  const { fake, session } = openSession(fakeMixpanel({ storedUser: "ada" }));
  const ada = { id: "ada" };

  const refusals = [
    getThrown(() =>
      session.group?.({
        user: ada,
        group: { type: "distinct_id", id: "w_1", traits: { plan: "team" } },
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
    getThrown(() =>
      session.group?.({
        user: ada,
        group: { type: "bucket", id: "b_1", traits: {} },
      }),
    ),
  ];

  const refused = {
    code: "UNSUPPORTED",
    message:
      "Mixpanel owns this name, so it cannot be a group type: joining or leaving would change Mixpanel's own property on every later event.",
  };

  expect(
    refusals.map(
      (refusal) =>
        refusal instanceof TraceError && {
          code: refusal.code,
          message: refusal.message,
        },
    ),
  ).toEqual([refused, refused, refused, refused]);
  expect(fake.calls).toEqual([]);
  expect(fake.state.persisted).toEqual({
    distinct_id: "ada",
    $user_id: "ada",
    $device_id: "device-1",
  });
});

test("a group type over 255 characters, which Mixpanel would cut, is refused before any call, joining or leaving, and a type and id of 255 are kept", () => {
  const { fake, session } = openSession();
  const long = "w".repeat(256);

  const refusals = [
    getThrown(() =>
      session.group?.({
        user: null,
        group: { type: long, id: "w_1", traits: {} },
      }),
    ),
    getThrown(() =>
      session.group?.({
        user: null,
        group: { type: long, id: null, traits: {} },
      }),
    ),
  ];

  const refused = {
    code: "UNSUPPORTED",
    message:
      "Mixpanel would cut this group's type past 255 characters, so the membership was left out.",
  };

  expect(
    refusals.map(
      (refusal) =>
        refusal instanceof TraceError && {
          code: refusal.code,
          message: refusal.message,
        },
    ),
  ).toEqual([refused, refused]);
  expect(fake.calls).toEqual([]);

  session.group?.({
    user: null,
    group: { type: "t".repeat(255), id: "i".repeat(255), traits: {} },
  });

  expect(fake.calls).toEqual([
    { method: "set_group", args: ["t".repeat(255), "i".repeat(255)] },
  ]);
});

test("moving to a group whose id Mixpanel would cut leaves the earlier group of that type first, so the next event carries neither, and the step throws UNSUPPORTED", () => {
  const { fake, session } = openSession();

  session.group?.({
    user: null,
    group: { type: "workspace", id: "w_1", traits: {} },
  });

  const refusal = getThrown(() =>
    session.group?.({
      user: null,
      group: {
        type: "workspace",
        id: "w".repeat(256),
        traits: { plan: "team" },
      },
    }),
  );

  session.track(createTrackedEvent(), createContext());

  expect(refusal).toBeInstanceOf(TraceError);
  expect(refusal).toMatchObject({
    code: "UNSUPPORTED",
    message:
      "Mixpanel would cut this group's id past 255 characters, so the membership was left out and any earlier group of this type was left.",
  });
  expect(fake.calls).toEqual([
    { method: "set_group", args: ["workspace", "w_1"] },
    { method: "unregister", args: ["workspace"] },
    { method: "people.unset", args: [["workspace"]] },
    {
      method: "track",
      args: ["Checkout Started", { time: NOW, $insert_id: EVENT_ID }],
    },
  ]);
  expect(fake.events).toEqual([
    {
      event: "Checkout Started",
      properties: {
        ...EVENT_DEFAULTS,
        distinct_id: "$device:device-1",
        $device_id: "device-1",
        time: NOW,
        $insert_id: EVENT_ID,
        token: "fake-token",
      },
    },
  ]);
});

test("a group sets its membership as a super property and on the profile, and sets and unsets the group's own traits", () => {
  const { fake, session } = openSession(fakeMixpanel({ storedUser: "ada" }));
  const ada = { id: "ada" };

  session.identify?.({ user: ada });
  session.group?.({
    user: ada,
    group: {
      type: "workspace",
      id: "w_1",
      traits: { plan: "team", legacy: null },
    },
  });

  expect(fake.calls).toEqual([
    { method: "identify", args: ["ada"] },
    { method: "set_group", args: ["workspace", "w_1"] },
    { method: "get_group", args: ["workspace", "w_1"] },
    { method: "group.set", args: [{ plan: "team" }] },
    { method: "group.unset", args: ["legacy"] },
  ]);
  expect(fake.state.persisted).toEqual({
    distinct_id: "ada",
    $user_id: "ada",
    $device_id: "device-1",
    workspace: ["w_1"],
  });
  expect(fake.profileUpdates).toEqual([
    {
      $distinct_id: "ada",
      $set: { ...PROFILE_DEFAULTS, workspace: ["w_1"] },
    },
  ]);
  expect(fake.groupUpdates).toEqual([
    { $group_key: "workspace", $group_id: "w_1", $set: { plan: "team" } },
    { $group_key: "workspace", $group_id: "w_1", $unset: ["legacy"] },
  ]);
});

test("a group update that only removes traits unsets each of them and sets nothing", () => {
  const { fake, session } = openSession();

  session.group?.({
    user: null,
    group: {
      type: "workspace",
      id: "w_1",
      traits: { plan: null, legacy: null },
    },
  });

  expect(fake.calls).toEqual([
    { method: "set_group", args: ["workspace", "w_1"] },
    { method: "get_group", args: ["workspace", "w_1"] },
    { method: "group.unset", args: ["plan"] },
    { method: "group.unset", args: ["legacy"] },
  ]);
  expect(fake.groupUpdates).toEqual([
    { $group_key: "workspace", $group_id: "w_1", $unset: ["plan"] },
    { $group_key: "workspace", $group_id: "w_1", $unset: ["legacy"] },
  ]);
});

test("a membership without traits leaves the group's profile alone", () => {
  const { fake, session } = openSession();

  session.group?.({
    user: null,
    group: { type: "workspace", id: "w_1", traits: {} },
  });

  expect(fake.calls).toEqual([
    { method: "set_group", args: ["workspace", "w_1"] },
  ]);
  expect(fake.groupUpdates).toEqual([]);
});

test("leaving a group unregisters its super property and unsets it on the profile, never through remove_group", () => {
  const { fake, session } = openSession(fakeMixpanel({ storedUser: "ada" }));
  const ada = { id: "ada" };

  session.identify?.({ user: ada });
  session.group?.({
    user: ada,
    group: { type: "workspace", id: "w_1", traits: {} },
  });
  session.group?.({
    user: ada,
    group: { type: "workspace", id: null, traits: {} },
  });

  expect(fake.calls).toEqual([
    { method: "identify", args: ["ada"] },
    { method: "set_group", args: ["workspace", "w_1"] },
    { method: "unregister", args: ["workspace"] },
    { method: "people.unset", args: [["workspace"]] },
  ]);
  expect(fake.state.persisted).toEqual({
    distinct_id: "ada",
    $user_id: "ada",
    $device_id: "device-1",
  });
  expect(fake.profileUpdates).toEqual([
    {
      $distinct_id: "ada",
      $set: { ...PROFILE_DEFAULTS, workspace: ["w_1"] },
    },
    { $distinct_id: "ada", $unset: ["workspace"] },
  ]);
});

test("reset leaves Mixpanel holding nobody: a new device, no user, no super properties and no queued profile updates", () => {
  const { fake, session } = openSession(fakeMixpanel({ storedUser: "ada" }));

  fake.sdk.register({ release: "1.2.0" });
  session.traits?.({ user: null, set: { plan: "pro" }, remove: [] });
  session.reset?.();

  expect(fake.calls).toEqual([
    { method: "register", args: [{ release: "1.2.0" }] },
    { method: "people.set", args: [{ plan: "pro" }] },
    { method: "reset", args: [] },
  ]);
  expect(fake.state.persisted).toEqual({
    distinct_id: "$device:device-2",
    $device_id: "device-2",
  });
  expect(fake.state.queued).toEqual({ set: {}, unset: [] });
});

test("closing collection opts out without deleting the profile, while Mixpanel stops storing identifiers and drops what it held unsent", () => {
  const { fake, session } = openSession(fakeMixpanel({ storedUser: "ada" }));

  session.identify?.({ user: { id: "ada" } });
  session.track(createTrackedEvent(), createContext());
  session.collection?.(false);

  expect(fake.calls).toEqual([
    { method: "identify", args: ["ada"] },
    {
      method: "track",
      args: ["Checkout Started", { time: NOW, $insert_id: EVENT_ID }],
    },
    { method: "opt_out_tracking", args: [{ delete_user: false }] },
  ]);
  expect(fake.state).toMatchObject({
    optedOut: true,
    stored: false,
    unsent: [],
  });
  expect(fake.state.persisted).toEqual({
    distinct_id: "ada",
    $user_id: "ada",
    $device_id: "device-1",
  });
  expect(fake.profileUpdates).toEqual([]);
});

test("opening collection opts back in without tracking $opt_in, and Mixpanel still holds the user it held", () => {
  const { fake, session } = openSession(fakeMixpanel({ storedUser: "ada" }));

  session.identify?.({ user: { id: "ada" } });
  session.collection?.(false);
  session.collection?.(true);
  session.track(createTrackedEvent(), createContext());

  expect(fake.calls).toEqual([
    { method: "identify", args: ["ada"] },
    { method: "opt_out_tracking", args: [{ delete_user: false }] },
    { method: "opt_in_tracking", args: [{ track: expect.any(Function) }] },
    {
      method: "track",
      args: ["Checkout Started", { time: NOW, $insert_id: EVENT_ID }],
    },
  ]);
  expect(fake.state).toMatchObject({ optedOut: false, stored: true });
  expect(
    fake.events.map(({ event: name, properties }) => [
      name,
      properties.distinct_id,
    ]),
  ).toEqual([["Checkout Started", "ada"]]);
});

test("collection can be switched either way right after open", () => {
  const optedOut = openSession(
    fakeMixpanel({ config: { opt_out_tracking_by_default: true } }),
  );

  optedOut.session.collection?.(true);

  expect(optedOut.fake.calls).toEqual([
    { method: "opt_in_tracking", args: [{ track: expect.any(Function) }] },
  ]);
  expect(optedOut.fake.state.optedOut).toBe(false);
  expect(optedOut.fake.events).toEqual([]);

  const optedIn = openSession();

  optedIn.session.collection?.(false);

  expect(optedIn.fake.calls).toEqual([
    { method: "opt_out_tracking", args: [{ delete_user: false }] },
  ]);
  expect(optedIn.fake.state.optedOut).toBe(true);
  expect(optedIn.fake.profileUpdates).toEqual([]);
});

test("the session has no flush, since Mixpanel sends its batches on its own schedule, and no dispose, since the application owns Mixpanel", () => {
  const { session } = openSession();

  expect(session.flush).toBeUndefined();
  expect(session.dispose).toBeUndefined();
});

test("the native handle is the injected Mixpanel", () => {
  const { fake, session } = openSession();

  expect(session.native).toBe(fake.sdk);
});

test("Trace never initializes or configures Mixpanel, whatever it asks of the session", () => {
  const { fake, session } = openSession();
  const ada = { id: "ada" };

  session.track(createTrackedEvent(), createContext());
  session.identify?.({ user: ada });
  session.traits?.({ user: ada, set: { plan: "pro" }, remove: ["role"] });
  session.group?.({
    user: ada,
    group: { type: "workspace", id: "w_1", traits: { plan: "team" } },
  });
  session.group?.({
    user: ada,
    group: { type: "workspace", id: null, traits: {} },
  });
  session.collection?.(false);
  session.collection?.(true);
  session.reset?.();

  expect(fake.calls.map(({ method }) => method)).toEqual([
    "track",
    "identify",
    "identify",
    "people.set",
    "people.unset",
    "set_group",
    "get_group",
    "group.set",
    "unregister",
    "people.unset",
    "opt_out_tracking",
    "opt_in_tracking",
    "reset",
  ]);
  expect(fake.sdk.__loaded).toBe(true);
});

test("through a Trace, a user switch resets Mixpanel before the next user is identified, so one user's events never carry the other", async () => {
  const fake = fakeMixpanel();
  const trace = createTrace(fake);

  trace.start();
  trace.user({ id: "ada" });

  const first = trace.track("Checkout Started", {});

  trace.user({ id: "bob" });

  const second = trace.track("Checkout Started", {});

  await Promise.all([first.settled, second.settled]);

  expect(fake.calls).toEqual([
    { method: "identify", args: ["ada"] },
    {
      method: "track",
      args: ["Checkout Started", { time: NOW, $insert_id: first.id }],
    },
    { method: "reset", args: [] },
    { method: "identify", args: ["bob"] },
    {
      method: "track",
      args: ["Checkout Started", { time: NOW, $insert_id: second.id }],
    },
  ]);
  expect(
    fake.events.map(({ event: name, properties }) => [
      name,
      properties.distinct_id,
    ]),
  ).toEqual([
    ["$identify", "ada"],
    ["Checkout Started", "ada"],
    ["$identify", "bob"],
    ["Checkout Started", "bob"],
  ]);
  trace.dispose();
});

test("through a Trace, signing in keeps the anonymous traits, which Mixpanel's queue delivers to the user", () => {
  const fake = fakeMixpanel();
  const trace = createTrace(fake);

  trace.traits({ plan: "pro" });
  trace.start();
  trace.user({ id: "ada" });

  expect(fake.calls).toEqual([
    { method: "people.set", args: [{ plan: "pro" }] },
    { method: "identify", args: ["ada"] },
  ]);
  expect(fake.profileUpdates).toEqual([
    { $distinct_id: "ada", $set: { ...PROFILE_DEFAULTS, plan: "pro" } },
  ]);
  trace.dispose();
});

test("through a Trace, signing out resets Mixpanel, so the next event is anonymous", async () => {
  const fake = fakeMixpanel();
  const trace = createTrace(fake);

  trace.start();
  trace.user({ id: "ada" });

  const signedIn = trace.track("Checkout Started", {});

  trace.user(null);

  const signedOut = trace.track("Checkout Started", {});

  await Promise.all([signedIn.settled, signedOut.settled]);

  expect(fake.calls).toEqual([
    { method: "identify", args: ["ada"] },
    {
      method: "track",
      args: ["Checkout Started", { time: NOW, $insert_id: signedIn.id }],
    },
    { method: "reset", args: [] },
    {
      method: "track",
      args: ["Checkout Started", { time: NOW, $insert_id: signedOut.id }],
    },
  ]);
  expect(fake.events.at(-1)?.properties.distinct_id).toBe("$device:device-2");
  trace.dispose();
});

test("through a Trace, joining a group sets the membership and its traits, and leaving it unregisters the membership", () => {
  const fake = fakeMixpanel();
  const trace = createTrace(fake);

  trace.start();
  trace.user({ id: "ada" });
  trace.group("workspace", { id: "w_1", traits: { plan: "team" } });
  trace.group("workspace", null);

  expect(fake.calls).toEqual([
    { method: "identify", args: ["ada"] },
    { method: "set_group", args: ["workspace", "w_1"] },
    { method: "get_group", args: ["workspace", "w_1"] },
    { method: "group.set", args: [{ plan: "team" }] },
    { method: "unregister", args: ["workspace"] },
    { method: "people.unset", args: [["workspace"]] },
  ]);
  trace.dispose();
});

test("through a Trace, a property named like one of the user's group types is omitted, so the event keeps the membership Mixpanel carries under that name", async () => {
  const fake = fakeMixpanel();
  const trace = createTrace(fake);

  trace.start();
  trace.group("workspace", { id: "w_1" });

  const receipt = trace.track("Checkout Started", {
    workspace: "Acme",
    plan: "pro",
  });

  expect(await receipt.settled).toEqual({
    state: "settled",
    outcomes: {
      product: {
        status: "submitted",
        evidence: "sdk-call-returned",
        event: null,
        losses: [{ path: "properties.workspace", reason: "omitted" }],
      },
    },
  });
  expect(fake.calls).toEqual([
    { method: "set_group", args: ["workspace", "w_1"] },
    {
      method: "track",
      args: [
        "Checkout Started",
        { time: NOW, $insert_id: receipt.id, plan: "pro" },
      ],
    },
  ]);
  expect(fake.events.at(-1)?.properties.workspace).toEqual(["w_1"]);
  trace.dispose();
});

test("through a Trace, a group type Mixpanel owns is reported as an unsupported identity step, and the user's events keep their distinct id", async () => {
  const fake = fakeMixpanel();
  const records: TraceDiagnosticEvent[] = [];
  const trace = createTrace(fake);

  trace.diagnostics.events.subscribe((record) => {
    records.push(record);
  });
  trace.start();
  trace.user({ id: "ada" });
  trace.group("distinct_id", { id: "w_1" });

  const receipt = trace.track("Checkout Started", {});

  await receipt.settled;

  expect(records).toContainEqual({
    source: "identity",
    type: "identity step unsupported",
    destination: { name: "product" },
    event: null,
    timestamp: NOW,
    context: { step: "group" },
  });
  expect(fake.calls).toEqual([
    { method: "identify", args: ["ada"] },
    {
      method: "track",
      args: ["Checkout Started", { time: NOW, $insert_id: receipt.id }],
    },
  ]);
  expect(fake.events.at(-1)?.properties.distinct_id).toBe("ada");
  trace.dispose();
});

test("through a Trace, moving to a group whose id Mixpanel would cut is an unsupported identity step that leaves the earlier group, and the user's events flow without either", async () => {
  const fake = fakeMixpanel();
  const records: TraceDiagnosticEvent[] = [];
  const trace = createTrace(fake);

  trace.diagnostics.events.subscribe((record) => {
    records.push(record);
  });
  trace.start();
  trace.user({ id: "ada" });
  trace.group("workspace", { id: "w_1" });

  const first = trace.track("Checkout Started", {});

  await first.settled;
  trace.group("workspace", { id: "w".repeat(256) });

  const receipt = trace.track("Checkout Started", {});

  expect(await receipt.settled).toEqual({
    state: "settled",
    outcomes: {
      product: {
        status: "submitted",
        evidence: "sdk-call-returned",
        event: null,
        losses: [],
      },
    },
  });
  expect(
    records.flatMap(({ type, context }) =>
      type === "identity step unsupported" ? [context] : [],
    ),
  ).toEqual([{ step: "group" }]);
  expect(fake.calls).toEqual([
    { method: "identify", args: ["ada"] },
    { method: "set_group", args: ["workspace", "w_1"] },
    {
      method: "track",
      args: ["Checkout Started", { time: NOW, $insert_id: first.id }],
    },
    { method: "unregister", args: ["workspace"] },
    { method: "people.unset", args: [["workspace"]] },
    {
      method: "track",
      args: ["Checkout Started", { time: NOW, $insert_id: receipt.id }],
    },
  ]);
  expect(
    fake.events.map(({ event, properties }) => [event, properties.workspace]),
  ).toEqual([
    ["$identify", undefined],
    ["Checkout Started", ["w_1"]],
    ["Checkout Started", undefined],
  ]);
  trace.dispose();
});

test("through a Trace, a user id Mixpanel refuses is reported as an unsupported identity step, and the event still reaches Mixpanel", async () => {
  const fake = fakeMixpanel();
  const records: TraceDiagnosticEvent[] = [];
  const trace = createTrace(fake);

  trace.diagnostics.events.subscribe((record) => {
    records.push(record);
  });
  trace.start();
  trace.user({ id: "$device:ada" });

  const receipt = trace.track("Checkout Started", {});

  expect(await receipt.settled).toEqual({
    state: "settled",
    outcomes: {
      product: {
        status: "submitted",
        evidence: "sdk-call-returned",
        event: null,
        losses: [],
      },
    },
  });
  expect(records).toContainEqual({
    source: "identity",
    type: "identity step unsupported",
    destination: { name: "product" },
    event: null,
    timestamp: NOW,
    context: { step: "identify" },
  });
  expect(fake.events.at(-1)?.properties.distinct_id).toBe("$device:device-1");
  trace.dispose();
});

test("through a Trace, a user id Mixpanel would cut is an identity step failed, that user's events are skipped as identity-failed, and the next user is unaffected", async () => {
  const fake = fakeMixpanel();
  const records: TraceDiagnosticEvent[] = [];
  const trace = createTrace(fake);

  trace.diagnostics.events.subscribe((record) => {
    records.push(record);
  });
  trace.start();
  trace.user({ id: "u".repeat(256) });

  const skipped = await trace.track("Checkout Started", {}).settled;

  trace.user({ id: "bob" });

  const bob = trace.track("Checkout Started", {});

  expect(skipped).toEqual({
    state: "settled",
    outcomes: { product: { status: "skipped", reason: "identity-failed" } },
  });
  expect(await bob.settled).toEqual({
    state: "settled",
    outcomes: {
      product: {
        status: "submitted",
        evidence: "sdk-call-returned",
        event: null,
        losses: [],
      },
    },
  });
  expect(
    records.flatMap(({ type, context }) =>
      type === "identity step failed" ? [context] : [],
    ),
  ).toEqual([
    { step: "identify", reason: "error" },
    { step: "identify", reason: "error" },
  ]);
  expect(fake.calls).toEqual([
    { method: "reset", args: [] },
    { method: "reset", args: [] },
    { method: "identify", args: ["bob"] },
    {
      method: "track",
      args: ["Checkout Started", { time: NOW, $insert_id: bob.id }],
    },
  ]);
  trace.dispose();
});

test("through a Trace, a gated destination is opted out at start while consent is unknown, and its events are dropped by Trace", async () => {
  const fake = fakeMixpanel({ config: { opt_out_tracking_by_default: true } });
  const trace = createTrace(fake, { gated: true });

  trace.start();

  expect(await trace.track("Checkout Started", {}).settled).toEqual({
    state: "dropped",
    reason: "consent",
  });
  expect(fake.calls).toEqual([
    { method: "opt_out_tracking", args: [{ delete_user: false }] },
  ]);
  trace.dispose();
});

test("through a Trace, granting consent opts Mixpanel in without $opt_in and then identifies the current user", async () => {
  const fake = fakeMixpanel({ config: { opt_out_tracking_by_default: true } });
  const trace = createTrace(fake, { gated: true });

  trace.start();
  trace.user({ id: "ada" });
  trace.consent.set({ analytics: "granted" });

  const receipt = trace.track("Checkout Started", {});

  await receipt.settled;

  expect(fake.calls).toEqual([
    { method: "opt_out_tracking", args: [{ delete_user: false }] },
    { method: "opt_in_tracking", args: [{ track: expect.any(Function) }] },
    { method: "identify", args: ["ada"] },
    {
      method: "track",
      args: ["Checkout Started", { time: NOW, $insert_id: receipt.id }],
    },
  ]);
  expect(
    fake.events.map(({ event: name, properties }) => [
      name,
      properties.distinct_id,
    ]),
  ).toEqual([
    ["$identify", "ada"],
    ["Checkout Started", "ada"],
  ]);
  trace.dispose();
});

test("through a Trace, revoking consent opts Mixpanel out, and granting it again identifies nobody twice, because Mixpanel kept the user", async () => {
  const fake = fakeMixpanel({ config: { opt_out_tracking_by_default: true } });
  const trace = createTrace(fake, { gated: true });

  trace.consent.set({ analytics: "granted" });
  trace.start();
  trace.user({ id: "ada" });

  const before = trace.track("Checkout Started", {});

  trace.consent.set({ analytics: "denied" });
  trace.consent.set({ analytics: "granted" });

  const after = trace.track("Checkout Started", {});

  await Promise.all([before.settled, after.settled]);

  expect(fake.calls).toEqual([
    { method: "opt_in_tracking", args: [{ track: expect.any(Function) }] },
    { method: "identify", args: ["ada"] },
    {
      method: "track",
      args: ["Checkout Started", { time: NOW, $insert_id: before.id }],
    },
    { method: "opt_out_tracking", args: [{ delete_user: false }] },
    { method: "opt_in_tracking", args: [{ track: expect.any(Function) }] },
    {
      method: "track",
      args: ["Checkout Started", { time: NOW, $insert_id: after.id }],
    },
  ]);
  expect(fake.events.at(-1)?.properties.distinct_id).toBe("ada");
  trace.dispose();
});

test("through a Trace, a destination consent does not name is never switched on or off", async () => {
  const fake = fakeMixpanel();
  const trace = createTrace(fake);

  trace.start();

  const receipt = trace.track("Checkout Started", {});

  await receipt.settled;

  expect(fake.calls).toEqual([
    {
      method: "track",
      args: ["Checkout Started", { time: NOW, $insert_id: receipt.id }],
    },
  ]);
  trace.dispose();
});

test("through a Trace, the five-day window runs on the Trace's own clock, not the wall clock, and a time ahead of it is sent as it is", async () => {
  const clock = Date.UTC(2030, 0, 10);
  const fake = fakeMixpanel();
  const trace = createTrace(fake, { now: () => clock });

  trace.start();

  const tooOld = trace.track(
    "Checkout Started",
    {},
    {
      timestamp: clock - 5 * DAY - 1,
    },
  );

  const ahead = trace.track("Checkout Started", {}, { timestamp: clock + 1 });

  expect(await tooOld.settled).toEqual({
    state: "settled",
    outcomes: {
      product: {
        status: "dropped",
        reason: "provider-filtered",
        losses: [{ path: "timestamp", reason: "unsupported" }],
      },
    },
  });
  expect(await ahead.settled).toEqual({
    state: "settled",
    outcomes: {
      product: {
        status: "submitted",
        evidence: "sdk-call-returned",
        event: null,
        losses: [],
      },
    },
  });
  trace.dispose();
});

test("through a Trace, a receipt combines the sanitizer's losses with Mixpanel's, each once", async () => {
  const fake = fakeMixpanel();
  const trace = createTrace(fake);

  trace.start();

  const receipt = trace.track("Checkout Started", {
    password: "hunter2",
    distinct_id: "grace",
    note: "x".repeat(300),
  });

  expect(await receipt.settled).toEqual({
    state: "settled",
    outcomes: {
      product: {
        status: "submitted",
        evidence: "sdk-call-returned",
        event: null,
        losses: [
          { path: "properties.password", reason: "redacted" },
          { path: "properties.distinct_id", reason: "omitted" },
          { path: "properties.note", reason: "truncated" },
        ],
      },
    },
  });
  trace.dispose();
});

test("through a Trace, the native handle is the injected Mixpanel once the destination is ready, and flush reports unsupported", async () => {
  const fake = fakeMixpanel();
  const trace = createTrace(fake);

  expect(trace.destination("product").native).toBeNull();

  trace.start();

  expect(trace.destination("product").native).toBe(fake.sdk);
  expect(await trace.flush()).toEqual({
    drained: true,
    destinations: { product: { status: "unsupported" } },
  });
  trace.dispose();
});
