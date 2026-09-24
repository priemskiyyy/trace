import { event, Trace, TraceError } from "@priemskiyyy/trace";
import type { TraceDiagnosticEvent, TrackContext } from "@priemskiyyy/trace";
import { afterEach, expect, test, vi } from "vitest";

import { fakeMixpanel } from "src/fakeMixpanel.fixture";
import { mixpanel } from "src/mixpanel";
import { createTrackedEvent, TRACKED_EVENT } from "src/trackedEvent.fixture";

type FakeMixpanel = ReturnType<typeof fakeMixpanel>;

const { id: EVENT_ID, timestamp: NOW } = TRACKED_EVENT;
const DAY = 24 * 60 * 60 * 1000;
const VISITOR = "visitor-7";
const TOKEN = "mixpanel-test-token";
const ANONYMOUS = { generation: 0, user: null, traits: {}, groups: {} };

afterEach(() => {
  vi.useRealTimers();
});

const createContext = ({
  now = NOW,
  currentGeneration = 1,
}: { now?: number; currentGeneration?: number } = {}): TrackContext => ({
  signal: new AbortController().signal,
  currentGeneration: () => currentGeneration,
  now: () => now,
});

const open = (
  fake: FakeMixpanel = fakeMixpanel(),
  options: { anonymousId?: string } = {},
) => mixpanel({ sdk: fake.sdk, ...options }).open();

const createTrace = (
  fake: FakeMixpanel,
  {
    anonymousId,
    now = () => NOW,
  }: { anonymousId?: string; now?: () => number } = {},
) =>
  new Trace({
    events: {
      "App Opened": event(),
      "Checkout Started": event<{ plan: string; password: string }>(),
    },
    destinations: {
      product: mixpanel({
        sdk: fake.sdk,
        ...(anonymousId === undefined ? {} : { anonymousId }),
      }),
    },
    now,
  });

const getThrown = (run: () => unknown) => {
  try {
    run();
  } catch (error) {
    return error;
  }

  return null;
};

const getMethods = ({ calls }: FakeMixpanel) =>
  calls.map(({ method }) => method);

const nextMacrotask = () =>
  new Promise((resolve) => {
    setImmediate(resolve);
  });

const watch = (answer: unknown) => {
  const watched = { settled: false };

  Promise.resolve(answer).then(
    () => {
      watched.settled = true;
    },
    () => {
      watched.settled = true;
    },
  );

  return watched;
};

const getPropertiesOfSize = (size: number) => {
  const overhead = JSON.stringify({
    event: "Checkout Started",
    properties: {
      time: NOW,
      $insert_id: EVENT_ID,
      $user_id: "ada",
      text: "",
    },
  }).length;

  return { text: "x".repeat(size - overhead) };
};

test("creating the adapter reads and calls nothing on the mixpanel client", () => {
  const fake = fakeMixpanel();
  const reads: PropertyKey[] = [];

  const sdk = new Proxy(fake.sdk, {
    get: (target, key, receiver) => {
      reads.push(key);

      return Reflect.get(target, key, receiver);
    },
  });

  expect(mixpanel({ sdk, anonymousId: VISITOR }).name).toBe("mixpanel-node");
  expect(reads).toStrictEqual([]);
  expect(fake.calls).toStrictEqual([]);
});

test("open never refuses and calls nothing, because the mixpanel client sends from the moment init returns it", () => {
  const fake = fakeMixpanel();

  expect(mixpanel({ sdk: fake.sdk }).open().native).toBe(fake.sdk);
  expect(fake.calls).toStrictEqual([]);
});

test("an event is one track call with its user, the anonymous id, its time, its id, its properties over its context and its memberships, and is backend-acknowledged once Mixpanel accepted it", async () => {
  const fake = fakeMixpanel();

  const answer = await open(fake, { anonymousId: VISITOR }).track(
    createTrackedEvent({
      properties: { cart: { id: "cart_1" }, value: 49.5, token: "forged" },
      context: { value: 1, locale: "de" },
      identity: {
        generation: 1,
        user: { id: "ada" },
        traits: { plan: "pro" },
        groups: { workspace: { id: "w_1", traits: { tier: "team" } } },
      },
    }),
    createContext(),
  );

  expect(fake.calls).toStrictEqual([
    {
      method: "track",
      args: [
        "Checkout Started",
        {
          time: NOW,
          $insert_id: EVENT_ID,
          $user_id: "ada",
          $device_id: VISITOR,
          cart: { id: "cart_1" },
          value: 49.5,
          locale: "de",
          workspace: "w_1",
        },
      ],
    },
  ]);
  expect(answer).toStrictEqual({
    status: "submitted",
    evidence: "backend-acknowledged",
    losses: [
      { path: "properties.token", reason: "omitted" },
      { path: "context.value", reason: "omitted" },
    ],
  });
});

test("a membership whose group id or type Mixpanel would cut is left off the event with an invalid loss, never sent cut, because a cut id would file the event under another group", async () => {
  const fake = fakeMixpanel();
  const longType = "t".repeat(256);

  const answer = await open(fake).track(
    createTrackedEvent({
      identity: {
        generation: 1,
        user: { id: "ada" },
        traits: {},
        groups: {
          workspace: { id: "w".repeat(256), traits: {} },
          [longType]: { id: "w_2", traits: {} },
        },
      },
    }),
    createContext(),
  );

  expect(fake.calls).toStrictEqual([
    {
      method: "track",
      args: [
        "Checkout Started",
        { time: NOW, $insert_id: EVENT_ID, $user_id: "ada" },
      ],
    },
  ]);
  expect(answer).toStrictEqual({
    status: "submitted",
    evidence: "backend-acknowledged",
    losses: [
      { path: "identity.groups.workspace", reason: "invalid" },
      { path: `identity.groups.${longType}`, reason: "invalid" },
    ],
  });
});

test("an identified event without an anonymous id carries only $user_id, and an anonymous event only $device_id", async () => {
  const fake = fakeMixpanel();

  await open(fake).track(createTrackedEvent(), createContext());
  await open(fake, { anonymousId: VISITOR }).track(
    createTrackedEvent({ identity: ANONYMOUS }),
    createContext(),
  );

  expect(fake.calls).toStrictEqual([
    {
      method: "track",
      args: [
        "Checkout Started",
        { time: NOW, $insert_id: EVENT_ID, $user_id: "ada" },
      ],
    },
    {
      method: "track",
      args: [
        "Checkout Started",
        { time: NOW, $insert_id: EVENT_ID, $device_id: VISITOR },
      ],
    },
  ]);
});

test("an event with neither a user nor an anonymous id is skipped as unidentified before the mixpanel client, which would file it under nobody", () => {
  const fake = fakeMixpanel();

  expect(
    open(fake).track(
      createTrackedEvent({ identity: ANONYMOUS, properties: { plan: "pro" } }),
      createContext(),
    ),
  ).toStrictEqual({ status: "skipped", reason: "unidentified" });
  expect(fake.calls).toStrictEqual([]);
});

test("the answer waits for Mixpanel's answer to the event's own request", async () => {
  const fake = fakeMixpanel();

  fake.state.holding = true;

  const answering = open(fake).track(createTrackedEvent(), createContext());
  const answer = watch(answering);

  await nextMacrotask();

  expect(answer.settled).toBe(false);

  fake.release();

  await expect(answering).resolves.toStrictEqual({
    status: "submitted",
    evidence: "backend-acknowledged",
    losses: [],
  });
});

test("an event Mixpanel refuses rejects with the client's error", async () => {
  const fake = fakeMixpanel();
  const refused = new Error("Mixpanel Server Error: 0");

  fake.state.failure = refused;

  await expect(
    open(fake).track(createTrackedEvent(), createContext()),
  ).rejects.toBe(refused);
});

test("the client writes into the object it is given, so the adapter hands it a fresh one: the token reaches Mixpanel and the frozen event stays untouched", async () => {
  const fake = fakeMixpanel();
  const tracked = createTrackedEvent({ properties: { plan: "pro" } });

  await open(fake).track(tracked, createContext());

  expect(fake.requests).toStrictEqual([
    {
      endpoint: "/track",
      data: {
        event: "Checkout Started",
        properties: {
          time: NOW,
          $insert_id: EVENT_ID,
          $user_id: "ada",
          plan: "pro",
          token: TOKEN,
          mp_lib: "node",
          $lib_version: "0.24.0",
        },
      },
    },
  ]);
  expect(tracked.properties).toStrictEqual({ plan: "pro" });
});

test("an event keeps the user it was accepted with after the Trace's user changed, because the mixpanel client takes the user on every call and holds nobody's session", async () => {
  const fake = fakeMixpanel();

  await expect(
    open(fake).track(
      createTrackedEvent(),
      createContext({ currentGeneration: 4 }),
    ),
  ).resolves.toStrictEqual({
    status: "submitted",
    evidence: "backend-acknowledged",
    losses: [],
  });
  expect(fake.calls).toStrictEqual([
    {
      method: "track",
      args: [
        "Checkout Started",
        { time: NOW, $insert_id: EVENT_ID, $user_id: "ada" },
      ],
    },
  ]);
});

test("track answers failed with DELIVERY_FAILED before any call when the user id is over 255 characters, which Mixpanel would cut and merge that user with another, and one of 255 is sent whole", async () => {
  const kept = fakeMixpanel();
  const refused = fakeMixpanel();

  expect(
    open(refused).track(
      createTrackedEvent({
        identity: {
          generation: 1,
          user: { id: "u".repeat(256) },
          traits: {},
          groups: {},
        },
      }),
      createContext(),
    ),
  ).toStrictEqual({
    status: "failed",
    error: new TraceError({
      code: "DELIVERY_FAILED",
      message:
        "Mixpanel keeps the first 255 characters of a distinct id, so this user would share an identity with any id that starts the same.",
    }),
  });
  expect(refused.calls).toStrictEqual([]);

  await expect(
    open(kept).track(
      createTrackedEvent({
        identity: {
          generation: 1,
          user: { id: "u".repeat(255) },
          traits: {},
          groups: {},
        },
      }),
      createContext(),
    ),
  ).resolves.toMatchObject({ status: "submitted" });
  expect(getMethods(kept)).toStrictEqual(["track"]);
});

test("track answers failed with DELIVERY_FAILED before any call when anonymousId is over 255 characters, which Mixpanel would cut and merge that visitor with another, and one of 255 is sent whole", async () => {
  const kept = fakeMixpanel();
  const refused = fakeMixpanel();

  expect(
    open(refused, { anonymousId: "v".repeat(256) }).track(
      createTrackedEvent({ identity: ANONYMOUS }),
      createContext(),
    ),
  ).toStrictEqual({
    status: "failed",
    error: new TraceError({
      code: "DELIVERY_FAILED",
      message:
        "Mixpanel keeps the first 255 characters of a distinct id, so this visitor would share an identity with any id that starts the same.",
    }),
  });
  expect(refused.calls).toStrictEqual([]);

  await expect(
    open(kept, { anonymousId: "v".repeat(255) }).track(
      createTrackedEvent({ identity: ANONYMOUS }),
      createContext(),
    ),
  ).resolves.toMatchObject({ status: "submitted" });
  expect(getMethods(kept)).toStrictEqual(["track"]);
});

test("an event older than five days on the context's clock is dropped as provider-filtered with an unsupported timestamp, and one exactly five days old is sent", async () => {
  const fake = fakeMixpanel();
  const session = open(fake);

  expect(
    session.track(
      createTrackedEvent(),
      createContext({ now: NOW + 5 * DAY + 1 }),
    ),
  ).toStrictEqual({
    status: "dropped",
    reason: "provider-filtered",
    losses: [{ path: "timestamp", reason: "unsupported" }],
  });
  expect(fake.calls).toStrictEqual([]);

  await expect(
    session.track(createTrackedEvent(), createContext({ now: NOW + 5 * DAY })),
  ).resolves.toMatchObject({ status: "submitted" });
  expect(getMethods(fake)).toStrictEqual(["track"]);
});

test("an event of 999,999 bytes of JSON is sent, and one of 1,000,000 is dropped as provider-filtered with an invalid size, without reaching Mixpanel", async () => {
  const fake = fakeMixpanel();
  const session = open(fake);
  const fits = createTrackedEvent({ properties: getPropertiesOfSize(999_999) });

  const over = createTrackedEvent({
    properties: getPropertiesOfSize(1_000_000),
  });

  expect(session.track(over, createContext())).toStrictEqual({
    status: "dropped",
    reason: "provider-filtered",
    losses: [
      { path: "properties.text", reason: "truncated" },
      { path: "properties", reason: "invalid" },
    ],
  });
  expect(fake.calls).toStrictEqual([]);

  await expect(session.track(fits, createContext())).resolves.toStrictEqual({
    status: "submitted",
    evidence: "backend-acknowledged",
    losses: [{ path: "properties.text", reason: "truncated" }],
  });
  expect(getMethods(fake)).toStrictEqual(["track"]);
});

test("traits set the user's profile and then unset it, the unset waiting for Mixpanel's answer to the set, and the step answers at the call", async () => {
  const fake = fakeMixpanel();

  fake.state.holding = true;

  expect(
    open(fake).traits?.({
      user: { id: "ada" },
      set: { plan: "pro", $email: "ada@example.com" },
      remove: ["role"],
    }),
  ).toBeUndefined();

  await nextMacrotask();

  expect(fake.calls).toStrictEqual([
    {
      method: "people.set",
      args: ["ada", { plan: "pro", $email: "ada@example.com" }],
    },
  ]);

  fake.release();
  await nextMacrotask();

  expect(fake.calls).toStrictEqual([
    {
      method: "people.set",
      args: ["ada", { plan: "pro", $email: "ada@example.com" }],
    },
    { method: "people.unset", args: ["ada", ["role"]] },
  ]);
});

test("traits that only remove, or only set, make only that call", async () => {
  const removing = fakeMixpanel();
  const setting = fakeMixpanel();

  open(removing).traits?.({ user: { id: "ada" }, set: {}, remove: ["role"] });
  open(setting).traits?.({
    user: { id: "ada" },
    set: { plan: "pro" },
    remove: [],
  });
  await nextMacrotask();

  expect(getMethods(removing)).toStrictEqual(["people.unset"]);
  expect(getMethods(setting)).toStrictEqual(["people.set"]);
});

test("traits without a user are refused as unsupported and send nothing, because Mixpanel keeps traits on a user's profile", () => {
  const fake = fakeMixpanel();

  expect(
    getThrown(() =>
      open(fake, { anonymousId: VISITOR }).traits?.({
        user: null,
        set: { plan: "pro" },
        remove: [],
      }),
    ),
  ).toStrictEqual(
    new TraceError({
      code: "UNSUPPORTED",
      message:
        "Mixpanel keeps traits on a user's profile, and this update has no user.",
    }),
  );
  expect(fake.calls).toStrictEqual([]);
});

test("a user id over 255 characters, which Mixpanel would cut, fails traits with DELIVERY_FAILED before any call, so two users sharing the part it keeps never merge", () => {
  const fake = fakeMixpanel();
  const user = { id: "u".repeat(256) };

  expect(
    getThrown(() =>
      open(fake).traits?.({ user, set: { plan: "pro" }, remove: [] }),
    ),
  ).toStrictEqual(
    new TraceError({
      code: "DELIVERY_FAILED",
      message:
        "Mixpanel keeps the first 255 characters of a distinct id, so this user would share an identity with any id that starts the same.",
    }),
  );
  expect(fake.calls).toStrictEqual([]);
});

test("a trait Mixpanel would cut, refuse or take as a control key is left out, the rest is sent, and the step throws UNSUPPORTED", async () => {
  const fake = fakeMixpanel();

  expect(
    getThrown(() =>
      open(fake).traits?.({
        user: { id: "ada" },
        set: { bio: "x".repeat(256), ip: "203.0.113.7", plan: "pro" },
        remove: ["role"],
      }),
    ),
  ).toStrictEqual(
    new TraceError({
      code: "UNSUPPORTED",
      message:
        "Mixpanel cannot keep every trait in this update as it is; the others are sent.",
    }),
  );

  await nextMacrotask();

  expect(fake.calls).toStrictEqual([
    { method: "people.set", args: ["ada", { plan: "pro" }] },
    { method: "people.unset", args: ["ada", ["role"]] },
  ]);
});

test("a membership sets the group's profile, unsets its removed traits and records the membership on the user's profile, each request waiting for the one before it, and the step answers at the call", async () => {
  const fake = fakeMixpanel();

  fake.state.holding = true;

  expect(
    open(fake).group?.({
      user: { id: "ada" },
      group: {
        type: "workspace",
        id: "w_1",
        traits: { tier: "enterprise", legacy: null },
      },
    }),
  ).toBeUndefined();

  for (const count of [1, 2, 3]) {
    await nextMacrotask();

    expect(fake.calls).toHaveLength(count);

    fake.release();
    fake.state.holding = true;
  }

  expect(fake.calls).toStrictEqual([
    {
      method: "groups.set",
      args: ["workspace", "w_1", { tier: "enterprise" }],
    },
    { method: "groups.unset", args: ["workspace", "w_1", ["legacy"]] },
    { method: "people.set", args: ["ada", { workspace: ["w_1"] }] },
  ]);
});

test("a membership without group traits only records the membership", async () => {
  const fake = fakeMixpanel();

  open(fake).group?.({
    user: { id: "ada" },
    group: { type: "workspace", id: "w_1", traits: {} },
  });
  await nextMacrotask();

  expect(fake.calls).toStrictEqual([
    { method: "people.set", args: ["ada", { workspace: ["w_1"] }] },
  ]);
});

test("a membership without a user sets the group's profile and is refused as unsupported, because the membership lives on a user's profile", async () => {
  const fake = fakeMixpanel();

  expect(
    getThrown(() =>
      open(fake, { anonymousId: VISITOR }).group?.({
        user: null,
        group: { type: "workspace", id: "w_1", traits: { tier: "team" } },
      }),
    ),
  ).toStrictEqual(
    new TraceError({
      code: "UNSUPPORTED",
      message:
        "Mixpanel keeps a membership on a user's profile, and this update has no user; the group's own properties are sent.",
    }),
  );

  await nextMacrotask();

  expect(fake.calls).toStrictEqual([
    { method: "groups.set", args: ["workspace", "w_1", { tier: "team" }] },
  ]);
});

test("leaving a group unsets the membership on the user's profile, and without a user there is nothing to unset", async () => {
  const fake = fakeMixpanel();
  const session = open(fake);

  session.group?.({
    user: { id: "ada" },
    group: { type: "workspace", id: null, traits: {} },
  });
  session.group?.({
    user: null,
    group: { type: "workspace", id: null, traits: {} },
  });
  await nextMacrotask();

  expect(fake.calls).toStrictEqual([
    { method: "people.unset", args: ["ada", ["workspace"]] },
  ]);
});

test("a trait removal whose name is longer than 255 characters is left out, because Mixpanel would cut it and remove another property, one of 255 characters is sent, and the step throws UNSUPPORTED", async () => {
  const fake = fakeMixpanel();

  expect(
    getThrown(() =>
      open(fake).traits?.({
        user: { id: "ada" },
        set: { plan: "pro" },
        remove: ["role", "n".repeat(256), "n".repeat(255)],
      }),
    ),
  ).toStrictEqual(
    new TraceError({
      code: "UNSUPPORTED",
      message:
        "Mixpanel cannot keep every trait in this update as it is; the others are sent.",
    }),
  );

  await nextMacrotask();

  expect(fake.calls).toStrictEqual([
    { method: "people.set", args: ["ada", { plan: "pro" }] },
    { method: "people.unset", args: ["ada", ["role", "n".repeat(255)]] },
  ]);
});

test("a group trait removal whose name is longer than 255 characters is left out, one of 255 characters is sent, and the step throws UNSUPPORTED", async () => {
  const fake = fakeMixpanel();

  expect(
    getThrown(() =>
      open(fake).group?.({
        user: { id: "ada" },
        group: {
          type: "workspace",
          id: "w_1",
          traits: {
            tier: "team",
            legacy: null,
            ["n".repeat(256)]: null,
            ["n".repeat(255)]: null,
          },
        },
      }),
    ),
  ).toStrictEqual(
    new TraceError({
      code: "UNSUPPORTED",
      message:
        "Mixpanel cannot keep every part of this group update as it is; the rest is sent.",
    }),
  );

  await nextMacrotask();

  expect(fake.calls).toStrictEqual([
    { method: "groups.set", args: ["workspace", "w_1", { tier: "team" }] },
    {
      method: "groups.unset",
      args: ["workspace", "w_1", ["legacy", "n".repeat(255)]],
    },
    { method: "people.set", args: ["ada", { workspace: ["w_1"] }] },
  ]);
});

test("a group type over 255 characters is refused before any call, joining or leaving, and one of 255 is kept", async () => {
  const fake = fakeMixpanel();
  const session = open(fake);
  const long = "t".repeat(256);

  const refused = new TraceError({
    code: "UNSUPPORTED",
    message:
      "Mixpanel would cut this group's type past 255 characters, so the membership was left out.",
  });

  expect(
    getThrown(() =>
      session.group?.({
        user: { id: "ada" },
        group: { type: long, id: "w_1", traits: {} },
      }),
    ),
  ).toStrictEqual(refused);
  expect(
    getThrown(() =>
      session.group?.({
        user: { id: "ada" },
        group: { type: long, id: null, traits: {} },
      }),
    ),
  ).toStrictEqual(refused);
  expect(fake.calls).toStrictEqual([]);

  session.group?.({
    user: { id: "ada" },
    group: { type: "t".repeat(255), id: null, traits: {} },
  });
  await nextMacrotask();

  expect(fake.calls).toStrictEqual([
    { method: "people.unset", args: ["ada", ["t".repeat(255)]] },
  ]);
});

test("a group type that is a name Mixpanel owns is refused before any call, joining or leaving, so the membership cannot rewrite Mixpanel's own property on the user's profile", () => {
  const fake = fakeMixpanel();
  const session = open(fake);

  const refusals = [
    { type: "distinct_id", id: "w_1" },
    { type: "distinct_id", id: null },
    { type: "$device_id", id: "w_1" },
    { type: "bucket", id: "w_1" },
  ].map(({ type, id }) =>
    getThrown(() =>
      session.group?.({ user: { id: "ada" }, group: { type, id, traits: {} } }),
    ),
  );

  expect(refusals).toStrictEqual(
    Array.from(
      { length: 4 },
      () =>
        new TraceError({
          code: "UNSUPPORTED",
          message:
            "Mixpanel owns this name, so it cannot be a group type: the membership would overwrite Mixpanel's own property on the user's profile.",
        }),
    ),
  );
  expect(fake.calls).toStrictEqual([]);
});

test("a group trait Mixpanel would cut, refuse or take as a control key is left out, the rest is sent, and the step throws UNSUPPORTED", async () => {
  const fake = fakeMixpanel();

  expect(
    getThrown(() =>
      open(fake).group?.({
        user: { id: "ada" },
        group: {
          type: "workspace",
          id: "w_1",
          traits: { $ignore_time: true, about: "x".repeat(256), tier: "team" },
        },
      }),
    ),
  ).toStrictEqual(
    new TraceError({
      code: "UNSUPPORTED",
      message:
        "Mixpanel cannot keep every part of this group update as it is; the rest is sent.",
    }),
  );

  await nextMacrotask();

  expect(fake.calls).toStrictEqual([
    { method: "groups.set", args: ["workspace", "w_1", { tier: "team" }] },
    { method: "people.set", args: ["ada", { workspace: ["w_1"] }] },
  ]);
});

test("a membership whose group id Mixpanel would cut sends no group request, leaves the type on the user's profile, and the step throws UNSUPPORTED", async () => {
  const fake = fakeMixpanel();
  const id = "w".repeat(256);

  const refusal = getThrown(() =>
    open(fake).group?.({
      user: { id: "ada" },
      group: { type: "workspace", id, traits: { tier: "team" } },
    }),
  );

  await nextMacrotask();

  expect(refusal).toStrictEqual(
    new TraceError({
      code: "UNSUPPORTED",
      message:
        "Mixpanel would cut this group's id past 255 characters, so the membership was left out and any earlier group of this type was left.",
    }),
  );
  expect(fake.calls).toStrictEqual([
    { method: "people.unset", args: ["ada", ["workspace"]] },
  ]);
});

test("a membership whose group id Mixpanel would cut and has no user sends no group request and leaves nothing, and the step throws UNSUPPORTED", () => {
  const fake = fakeMixpanel();
  const id = "w".repeat(256);

  expect(
    getThrown(() =>
      open(fake, { anonymousId: VISITOR }).group?.({
        user: null,
        group: { type: "workspace", id, traits: { tier: "team" } },
      }),
    ),
  ).toStrictEqual(
    new TraceError({
      code: "UNSUPPORTED",
      message:
        "Mixpanel would cut this group's id past 255 characters, so the membership was left out and any earlier group of this type was left.",
    }),
  );
  expect(fake.calls).toStrictEqual([]);
});

test("a later profile update never overtakes an earlier one: each profile request of a session waits for Mixpanel's answer to the one before it, across traits and groups", async () => {
  const fake = fakeMixpanel();
  const session = open(fake);

  fake.state.holding = true;
  session.traits?.({ user: { id: "ada" }, set: { plan: "pro" }, remove: [] });
  session.traits?.({ user: { id: "ada" }, set: {}, remove: ["plan"] });
  session.group?.({
    user: { id: "ada" },
    group: { type: "workspace", id: null, traits: {} },
  });
  await nextMacrotask();

  expect(getMethods(fake)).toStrictEqual(["people.set"]);

  fake.releaseNewestFirst();
  await nextMacrotask();

  expect(getMethods(fake)).toStrictEqual(["people.set", "people.unset"]);

  fake.releaseNewestFirst();
  await nextMacrotask();

  expect(fake.calls).toStrictEqual([
    { method: "people.set", args: ["ada", { plan: "pro" }] },
    { method: "people.unset", args: ["ada", ["plan"]] },
    { method: "people.unset", args: ["ada", ["workspace"]] },
  ]);

  fake.releaseNewestFirst();
});

test("a group type named __proto__ stays a key of its own, on the user's profile and on the event", async () => {
  const fake = fakeMixpanel();
  const session = open(fake);

  session.group?.({
    user: { id: "ada" },
    group: { type: "__proto__", id: "w_1", traits: {} },
  });
  await nextMacrotask();
  await session.track(
    createTrackedEvent({
      identity: {
        generation: 1,
        user: { id: "ada" },
        traits: {},
        groups: Object.fromEntries([["__proto__", { id: "w_1", traits: {} }]]),
      },
    }),
    createContext(),
  );

  expect(fake.calls).toStrictEqual([
    {
      method: "people.set",
      args: ["ada", Object.fromEntries([["__proto__", ["w_1"]]])],
    },
    {
      method: "track",
      args: [
        "Checkout Started",
        Object.fromEntries([
          ["time", NOW],
          ["$insert_id", EVENT_ID],
          ["$user_id", "ada"],
          ["__proto__", "w_1"],
        ]),
      ],
    },
  ]);
});

test("the session has no identify, no reset, no collection and no dispose, because the mixpanel client holds nobody and has no switch", () => {
  const session = open(fakeMixpanel(), { anonymousId: VISITOR });

  expect(session.identify).toBeUndefined();
  expect(session.reset).toBeUndefined();
  expect(session.collection).toBeUndefined();
  expect(session.dispose).toBeUndefined();
});

test("flush waits for the session's requests in flight and queued, profile updates included, and answers flushed once Mixpanel accepted them", async () => {
  const fake = fakeMixpanel();
  const session = open(fake);

  fake.state.holding = true;
  session.traits?.({
    user: { id: "ada" },
    set: { plan: "pro" },
    remove: ["role"],
  });

  const tracking = session.track(createTrackedEvent(), createContext());

  const flushing = session.flush?.({
    timeout: 1_000,
    signal: new AbortController().signal,
  });

  const flushed = watch(flushing);

  await nextMacrotask();
  fake.release();
  fake.state.holding = true;
  await nextMacrotask();

  expect(getMethods(fake)).toStrictEqual([
    "track",
    "people.set",
    "people.unset",
  ]);
  expect(flushed.settled).toBe(false);

  fake.release();

  await expect(flushing).resolves.toStrictEqual({ status: "flushed" });
  await expect(tracking).resolves.toMatchObject({ status: "submitted" });
});

test("flush answers failed with DELIVERY_FAILED when Mixpanel refused a request since the last flush", async () => {
  const fake = fakeMixpanel();
  const session = open(fake);

  fake.state.holding = true;
  session.traits?.({ user: { id: "ada" }, set: { plan: "pro" }, remove: [] });

  const flushing = session.flush?.({
    timeout: 1_000,
    signal: new AbortController().signal,
  });

  fake.state.failure = new Error("Mixpanel Server Error: 0");
  fake.release();

  await expect(flushing).resolves.toStrictEqual({
    status: "failed",
    error: new TraceError({
      code: "DELIVERY_FAILED",
      message:
        "Mixpanel did not accept 1 of the requests sent since the last flush.",
    }),
  });
});

test("a session's flush waits only for its own requests, so a request of another session over the same client does not hold it", async () => {
  const fake = fakeMixpanel();
  const adapter = mixpanel({ sdk: fake.sdk });
  const first = adapter.open();
  const second = adapter.open();

  fake.state.holding = true;
  first.track(createTrackedEvent(), createContext());

  await expect(
    second.flush?.({ timeout: 1_000, signal: new AbortController().signal }),
  ).resolves.toStrictEqual({ status: "flushed" });
  fake.release();
});

test("the native handle is the mixpanel client the application created", () => {
  const fake = fakeMixpanel();

  expect(open(fake).native).toBe(fake.sdk);
});

test("every open answers a new session over the same client", () => {
  const fake = fakeMixpanel();
  const adapter = mixpanel({ sdk: fake.sdk });
  const first = adapter.open();
  const second = adapter.open();

  expect(second).not.toBe(first);
  expect(second.native).toBe(fake.sdk);
});

test("Trace never initializes or configures the mixpanel client", async () => {
  const fake = fakeMixpanel();
  const trace = createTrace(fake, { anonymousId: VISITOR });

  trace.start();
  trace.user({ id: "ada", traits: { plan: "pro" } });
  trace.group("workspace", { id: "w_1", traits: { tier: "team" } });
  trace.track("App Opened");
  trace.group("workspace", null);
  trace.user(null);
  trace.track("App Opened");
  await trace.flush();
  trace.dispose();

  expect(getMethods(fake)).toStrictEqual([
    "track",
    "track",
    "people.set",
    "groups.set",
    "people.set",
    "people.unset",
  ]);
});

test("through a Trace, the receipt is backend-acknowledged and carries the sanitizer's losses and then Mixpanel's", async () => {
  const fake = fakeMixpanel();
  const trace = createTrace(fake);

  trace.start();
  trace.user({ id: "ada" });

  const receipt = trace.track("Checkout Started", {
    plan: "pro",
    password: "hunter2",
  });

  await expect(receipt.settled).resolves.toStrictEqual({
    state: "settled",
    outcomes: {
      product: {
        status: "submitted",
        evidence: "backend-acknowledged",
        event: null,
        losses: [{ path: "properties.password", reason: "redacted" }],
      },
    },
  });
  expect(fake.calls).toStrictEqual([
    {
      method: "track",
      args: [
        "Checkout Started",
        { time: NOW, $insert_id: receipt.id, $user_id: "ada", plan: "pro" },
      ],
    },
  ]);
});

test("through a Trace, an event Mixpanel refuses settles failed with the client's error", async () => {
  const fake = fakeMixpanel();
  const trace = createTrace(fake);
  const refused = new Error("Mixpanel Server Error: 0");

  fake.state.failure = refused;
  trace.start();
  trace.user({ id: "ada" });

  await expect(trace.track("App Opened").settled).resolves.toStrictEqual({
    state: "settled",
    outcomes: { product: { status: "failed", error: refused } },
  });
});

test("through a Trace, a user switch needs no reset: each event carries its own user, and each user's traits reach only that user's profile", async () => {
  const fake = fakeMixpanel();
  const trace = createTrace(fake, { anonymousId: VISITOR });

  trace.start();
  trace.user({ id: "ada", traits: { plan: "pro" } });

  const first = trace.track("App Opened");

  trace.user({ id: "bob", traits: { role: "admin" } });

  const second = trace.track("App Opened");

  await trace.flush();

  expect(fake.calls).toStrictEqual([
    {
      method: "track",
      args: [
        "App Opened",
        {
          time: NOW,
          $insert_id: first.id,
          $user_id: "ada",
          $device_id: VISITOR,
        },
      ],
    },
    {
      method: "track",
      args: [
        "App Opened",
        {
          time: NOW,
          $insert_id: second.id,
          $user_id: "bob",
          $device_id: VISITOR,
        },
      ],
    },
    { method: "people.set", args: ["ada", { plan: "pro" }] },
    { method: "people.set", args: ["bob", { role: "admin" }] },
  ]);
});

test("through a Trace, a trait's removal reaches Mixpanel only once Mixpanel answered its earlier set, so the removal never lands first", async () => {
  const fake = fakeMixpanel();
  const trace = createTrace(fake);

  fake.state.holding = true;
  trace.start();
  trace.user({ id: "ada", traits: { plan: "pro" } });
  trace.traits({ plan: null });
  await nextMacrotask();

  expect(fake.calls).toStrictEqual([
    { method: "people.set", args: ["ada", { plan: "pro" }] },
  ]);

  fake.release();

  await expect(trace.flush()).resolves.toEqual({
    drained: true,
    destinations: { product: { status: "flushed" } },
  });
  expect(fake.calls).toStrictEqual([
    { method: "people.set", args: ["ada", { plan: "pro" }] },
    { method: "people.unset", args: ["ada", ["plan"]] },
  ]);
});

test("through a Trace, after a sign-out an event carries the anonymous id alone, and without one it is skipped as unidentified", async () => {
  const withVisitor = fakeMixpanel();
  const withoutVisitor = fakeMixpanel();
  const visited = createTrace(withVisitor, { anonymousId: VISITOR });
  const unvisited = createTrace(withoutVisitor);

  for (const trace of [visited, unvisited]) {
    trace.start();
    trace.user({ id: "ada" });
    trace.track("App Opened");
    trace.user(null);
  }

  const anonymous = visited.track("App Opened");
  const unidentified = unvisited.track("App Opened");

  await expect(anonymous.settled).resolves.toMatchObject({
    outcomes: { product: { status: "submitted" } },
  });
  await expect(unidentified.settled).resolves.toStrictEqual({
    state: "settled",
    outcomes: { product: { status: "skipped", reason: "unidentified" } },
  });
  expect(withVisitor.calls.at(-1)).toStrictEqual({
    method: "track",
    args: [
      "App Opened",
      { time: NOW, $insert_id: anonymous.id, $device_id: VISITOR },
    ],
  });
  expect(getMethods(withoutVisitor)).toStrictEqual(["track"]);
});

test("through a Trace, traits set while anonymous are reported unsupported, and reach the user's profile once the user signs in", async () => {
  const fake = fakeMixpanel();
  const trace = createTrace(fake, { anonymousId: VISITOR });
  const diagnostics: TraceDiagnosticEvent[] = [];

  trace.diagnostics.events.subscribe((diagnostic) => {
    diagnostics.push(diagnostic);
  });
  trace.start();
  trace.traits({ plan: "pro" });
  trace.user({ id: "ada" });
  trace.track("App Opened");
  await trace.flush();

  expect(getMethods(fake)).toStrictEqual(["track", "people.set"]);
  expect(fake.calls.at(-1)).toStrictEqual({
    method: "people.set",
    args: ["ada", { plan: "pro" }],
  });
  expect(
    diagnostics.flatMap(({ type, context }) => {
      if (type !== "identity step unsupported") {
        return [];
      }

      return [context];
    }),
  ).toStrictEqual([{ step: "traits" }]);
});

test("through a Trace, a membership reaches the group and the user's profile, every later event carries the group, and an owned group type is an unsupported step", async () => {
  const fake = fakeMixpanel();
  const trace = createTrace(fake);
  const diagnostics: TraceDiagnosticEvent[] = [];

  trace.diagnostics.events.subscribe((diagnostic) => {
    diagnostics.push(diagnostic);
  });
  trace.start();
  trace.user({ id: "ada" });
  trace.group("workspace", { id: "w_1", traits: { tier: "team" } });
  trace.group("distinct_id", { id: "w_2" });

  const receipt = trace.track("App Opened");

  await expect(receipt.settled).resolves.toStrictEqual({
    state: "settled",
    outcomes: {
      product: {
        status: "submitted",
        evidence: "backend-acknowledged",
        event: null,
        losses: [{ path: "identity.groups.distinct_id", reason: "omitted" }],
      },
    },
  });

  await trace.flush();

  expect(fake.calls).toStrictEqual([
    {
      method: "track",
      args: [
        "App Opened",
        {
          time: NOW,
          $insert_id: receipt.id,
          $user_id: "ada",
          workspace: "w_1",
        },
      ],
    },
    { method: "groups.set", args: ["workspace", "w_1", { tier: "team" }] },
    { method: "people.set", args: ["ada", { workspace: ["w_1"] }] },
  ]);
  expect(
    diagnostics.flatMap(({ type, context }) => {
      if (type !== "identity step unsupported") {
        return [];
      }

      return [context];
    }),
  ).toStrictEqual([{ step: "group" }]);
});

test("through a Trace, a consent-gated Mixpanel receives nothing until consent is granted, and has no switch of its own", async () => {
  const fake = fakeMixpanel();

  const trace = new Trace({
    events: { "App Opened": event() },
    destinations: { product: mixpanel({ sdk: fake.sdk }) },
    consent: { product: ["analytics"] },
    now: () => NOW,
  });

  trace.start();
  trace.user({ id: "ada" });

  const before = trace.track("App Opened");

  trace.consent.set({ analytics: "granted" });

  const after = trace.track("App Opened");

  await expect(before.settled).resolves.toStrictEqual({
    state: "dropped",
    reason: "consent",
  });
  await expect(after.settled).resolves.toMatchObject({
    outcomes: { product: { status: "submitted" } },
  });
  expect(fake.calls).toStrictEqual([
    {
      method: "track",
      args: [
        "App Opened",
        { time: NOW, $insert_id: after.id, $user_id: "ada" },
      ],
    },
  ]);
});

test("through a Trace, the five-day window runs on the Trace's own clock, not the wall clock", async () => {
  const clock = Date.UTC(2030, 0, 10);
  const fake = fakeMixpanel();
  const trace = createTrace(fake, { now: () => clock });

  trace.start();
  trace.user({ id: "ada" });

  const tooOld = trace.track("App Opened", undefined, {
    timestamp: clock - 5 * DAY - 1,
  });

  const oldest = trace.track("App Opened", undefined, {
    timestamp: clock - 5 * DAY,
  });

  await expect(tooOld.settled).resolves.toStrictEqual({
    state: "settled",
    outcomes: {
      product: {
        status: "dropped",
        reason: "provider-filtered",
        losses: [{ path: "timestamp", reason: "unsupported" }],
      },
    },
  });
  await expect(oldest.settled).resolves.toMatchObject({
    outcomes: { product: { status: "submitted" } },
  });
  expect(fake.calls).toStrictEqual([
    {
      method: "track",
      args: [
        "App Opened",
        { time: clock - 5 * DAY, $insert_id: oldest.id, $user_id: "ada" },
      ],
    },
  ]);
});

test("through a Trace, an event Mixpanel does not answer within the timeout is indeterminate, and a later flush still waits for its request", async () => {
  vi.useFakeTimers();

  const fake = fakeMixpanel();
  const trace = createTrace(fake);

  fake.state.holding = true;
  trace.start();
  trace.user({ id: "ada" });

  const receipt = trace.track("App Opened");

  await vi.advanceTimersByTimeAsync(5_000);

  await expect(receipt.settled).resolves.toStrictEqual({
    state: "settled",
    outcomes: { product: { status: "indeterminate", reason: "timeout" } },
  });

  const waiting = trace.flush({ timeout: 1_000 });

  await vi.advanceTimersByTimeAsync(1_000);

  expect(await waiting).toEqual({
    drained: false,
    destinations: { product: { status: "timeout" } },
  });

  const landing = trace.flush({ timeout: 1_000 });

  await vi.advanceTimersByTimeAsync(0);
  fake.release();

  expect(await landing).toEqual({
    drained: true,
    destinations: { product: { status: "flushed" } },
  });
});

test("through a Trace, a profile update Mixpanel refuses skips no event, and the next flush reports the refusal", async () => {
  const fake = fakeMixpanel();
  const trace = createTrace(fake);

  fake.state.holding = true;
  trace.start();
  trace.user({ id: "ada", traits: { plan: "pro" } });

  const receipt = trace.track("App Opened");

  await nextMacrotask();

  expect(getMethods(fake)).toStrictEqual(["track", "people.set"]);

  fake.release(1);
  fake.state.failure = new Error("Mixpanel Server Error: 0");
  fake.release();
  fake.state.failure = null;

  await expect(receipt.settled).resolves.toStrictEqual({
    state: "settled",
    outcomes: {
      product: {
        status: "submitted",
        evidence: "backend-acknowledged",
        event: null,
        losses: [],
      },
    },
  });
  await expect(trace.flush()).resolves.toEqual({
    drained: true,
    destinations: {
      product: {
        status: "failed",
        error: new TraceError({
          code: "DELIVERY_FAILED",
          message:
            "Mixpanel did not accept 1 of the requests sent since the last flush.",
        }),
      },
    },
  });
});

test("through a Trace, an event is not held behind a profile request: it is sent while Mixpanel has yet to answer the update before it", async () => {
  const fake = fakeMixpanel();
  const trace = createTrace(fake);

  fake.state.holding = true;
  trace.start();
  trace.user({ id: "ada", traits: { plan: "pro" } });

  const receipt = trace.track("App Opened");

  await nextMacrotask();

  expect(getMethods(fake)).toStrictEqual(["track", "people.set"]);

  fake.release();

  await expect(receipt.settled).resolves.toStrictEqual({
    state: "settled",
    outcomes: {
      product: {
        status: "submitted",
        evidence: "backend-acknowledged",
        event: null,
        losses: [],
      },
    },
  });
});

test("through a Trace, a profile request Mixpanel never answers does not skip the next event", async () => {
  vi.useFakeTimers();

  const fake = fakeMixpanel();
  const trace = createTrace(fake);

  fake.state.holding = true;
  trace.start();
  trace.user({ id: "ada", traits: { plan: "pro" } });
  await vi.advanceTimersByTimeAsync(0);
  fake.state.holding = false;

  const receipt = trace.track("App Opened");

  await vi.advanceTimersByTimeAsync(10_000);

  await expect(receipt.settled).resolves.toStrictEqual({
    state: "settled",
    outcomes: {
      product: {
        status: "submitted",
        evidence: "backend-acknowledged",
        event: null,
        losses: [],
      },
    },
  });
  expect(getMethods(fake)).toStrictEqual(["people.set", "track"]);

  fake.release();
});

test("through a Trace, a flush waits for the profile updates made after the last event, answering flushed only once Mixpanel answered all three requests", async () => {
  const fake = fakeMixpanel();
  const trace = createTrace(fake);

  fake.state.holding = true;
  trace.start();
  trace.user({ id: "ada", traits: { plan: "pro" } });
  trace.group("workspace", { id: "w_1", traits: { tier: "team" } });

  const flushing = trace.flush();
  const flushed = watch(flushing);

  for (const count of [1, 2, 3]) {
    await nextMacrotask();

    expect(fake.calls).toHaveLength(count);
    expect(flushed.settled).toBe(false);

    fake.release();
    fake.state.holding = true;
  }

  await expect(flushing).resolves.toEqual({
    drained: true,
    destinations: { product: { status: "flushed" } },
  });
  expect(fake.calls).toStrictEqual([
    { method: "people.set", args: ["ada", { plan: "pro" }] },
    { method: "groups.set", args: ["workspace", "w_1", { tier: "team" }] },
    { method: "people.set", args: ["ada", { workspace: ["w_1"] }] },
  ]);
});

test("per-request Traces over one shared client never mix their users or visitors, however their calls interleave and whatever order Mixpanel answers in", async () => {
  const fake = fakeMixpanel();

  const createRequest = (id: string, anonymousId: string) => {
    const trace = createTrace(fake, { anonymousId });

    trace.start();
    trace.user({ id, traits: { plan: id } });

    return trace;
  };

  fake.state.holding = true;

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
    fake.releaseNewestFirst();
    await nextMacrotask();
  }

  const getTrack = (
    id: string,
    userId: string,
    deviceId: string,
    groups: Record<string, string> = {},
  ) => ({
    method: "track",
    args: [
      "App Opened",
      {
        time: NOW,
        $insert_id: id,
        $user_id: userId,
        $device_id: deviceId,
        ...groups,
      },
    ],
  });

  expect(fake.calls).toHaveLength(10);
  expect(fake.calls).toEqual(
    expect.arrayContaining([
      { method: "people.set", args: ["ada", { plan: "ada" }] },
      { method: "people.set", args: ["bob", { plan: "bob" }] },
      { method: "groups.set", args: ["workspace", "w_ada", { tier: "ada" }] },
      { method: "groups.set", args: ["workspace", "w_bob", { tier: "bob" }] },
      { method: "people.set", args: ["ada", { workspace: ["w_ada"] }] },
      { method: "people.set", args: ["bob", { workspace: ["w_bob"] }] },
      getTrack(first.id, "ada", "visitor-a"),
      getTrack(second.id, "bob", "visitor-b"),
      getTrack(third.id, "bob", "visitor-b", { workspace: "w_bob" }),
      getTrack(fourth.id, "ada", "visitor-a", { workspace: "w_ada" }),
    ]),
  );
});

test("one adapter shared at module scope by per-request Traces never mixes their users", async () => {
  const fake = fakeMixpanel();
  const adapter = mixpanel({ sdk: fake.sdk });

  const createRequest = (id: string) => {
    const trace = new Trace({
      events: { "App Opened": event() },
      destinations: { product: adapter },
      now: () => NOW,
    });

    trace.start();
    trace.user({ id, traits: { plan: id } });

    return trace;
  };

  fake.state.holding = true;

  const ada = createRequest("ada");
  const bob = createRequest("bob");

  bob.group("workspace", { id: "w_bob" });

  const first = bob.track("App Opened");
  const second = ada.track("App Opened");
  const flushed = watch(Promise.all([ada.flush(), bob.flush()]));

  while (!flushed.settled) {
    fake.releaseNewestFirst();
    await nextMacrotask();
  }

  expect(fake.calls).toHaveLength(5);
  expect(fake.calls).toEqual(
    expect.arrayContaining([
      { method: "people.set", args: ["ada", { plan: "ada" }] },
      { method: "people.set", args: ["bob", { plan: "bob" }] },
      { method: "people.set", args: ["bob", { workspace: ["w_bob"] }] },
      {
        method: "track",
        args: [
          "App Opened",
          {
            time: NOW,
            $insert_id: first.id,
            $user_id: "bob",
            workspace: "w_bob",
          },
        ],
      },
      {
        method: "track",
        args: [
          "App Opened",
          { time: NOW, $insert_id: second.id, $user_id: "ada" },
        ],
      },
    ]),
  );
});
