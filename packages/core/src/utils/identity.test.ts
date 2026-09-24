import { expect, test, vi } from "vitest";

import { createMockAdapter } from "src/mock/createMockAdapter";
import type { MockIdentityCall } from "src/mock/types/MockIdentityCall";
import type { Receipt } from "src/types/Receipt";
import type { StandardSchema } from "src/types/StandardSchema";
import type { TraceDiagnosticEvent } from "src/types/TraceDiagnosticEvent";
import { event } from "src/utils/event";
import { Trace } from "src/utils/Trace";

const events = {
  "App Opened": event(),
  "Signed Out": event(),
};

const accepting = (
  accepts: (value: unknown) => boolean,
): StandardSchema<unknown> => ({
  "~standard": {
    version: 1,
    vendor: "test",
    validate: (value) =>
      accepts(value) ? { value } : { issues: [{ message: "Refused." }] },
  },
});

const create = () => {
  const mock = createMockAdapter();

  const trace = new Trace({
    events,
    destinations: { product: mock.adapter },
    now: () => 1_000,
  });

  const identity = () => mock.sessions[0]?.identity ?? [];
  const tracked = () => mock.sessions[0]?.events ?? [];

  return { mock, trace, identity, tracked };
};

test("signing in from anonymous starts a generation and keeps the traits and groups set while anonymous", () => {
  const { trace, identity, tracked } = create();

  trace.start();
  trace.traits({ plan: "free" });
  trace.group("workspace", { id: "w_1" });
  trace.user({ id: "ada" });
  trace.track("App Opened");

  expect(tracked()[0]?.identity).toEqual({
    generation: 1,
    user: { id: "ada" },
    traits: { plan: "free" },
    groups: { workspace: { id: "w_1", traits: {} } },
  });
  expect(identity()).toEqual<MockIdentityCall[]>([
    { kind: "traits", user: null, set: { plan: "free" }, remove: [] },
    {
      kind: "group",
      user: null,
      group: { type: "workspace", id: "w_1", traits: {} },
    },
    { kind: "identify", user: { id: "ada" } },
  ]);
});

test("signing in again as the same user keeps the generation and merges the traits", () => {
  const { trace, identity, tracked } = create();

  trace.start();
  trace.user({ id: "ada", traits: { plan: "free" } });
  trace.user({ id: "ada", traits: { seats: 3 } });
  trace.track("App Opened");

  expect(tracked()[0]?.identity).toMatchObject({
    generation: 1,
    user: { id: "ada" },
    traits: { plan: "free", seats: 3 },
  });
  expect(identity()).toEqual<MockIdentityCall[]>([
    { kind: "identify", user: { id: "ada" } },
    { kind: "traits", user: { id: "ada" }, set: { plan: "free" }, remove: [] },
    { kind: "traits", user: { id: "ada" }, set: { seats: 3 }, remove: [] },
  ]);
});

test("switching users starts a clean generation: traits and groups are cleared and the provider is reset before the next user is identified", () => {
  const { trace, identity, tracked } = create();

  trace.start();
  trace.user({ id: "ada", traits: { plan: "free" } });
  trace.group("workspace", { id: "w_1" });
  trace.user({ id: "bob", traits: { seats: 3 } });
  trace.track("App Opened");

  expect(tracked()[0]?.identity).toEqual({
    generation: 2,
    user: { id: "bob" },
    traits: { seats: 3 },
    groups: {},
  });
  expect(identity().slice(-3)).toEqual<MockIdentityCall[]>([
    { kind: "reset" },
    { kind: "identify", user: { id: "bob" } },
    { kind: "traits", user: { id: "bob" }, set: { seats: 3 }, remove: [] },
  ]);
});

test("signing out starts a clean anonymous generation and resets the provider", () => {
  const { trace, identity, tracked } = create();

  trace.start();
  trace.user({ id: "ada", traits: { plan: "free" } });
  trace.user(null);
  trace.track("App Opened");

  expect(tracked()[0]?.identity).toEqual({
    generation: 2,
    user: null,
    traits: {},
    groups: {},
  });
  expect(identity().at(-1)).toEqual({ kind: "reset" });
});

test("signing out while anonymous changes nothing, so anonymous ids never rotate", () => {
  const { trace, identity } = create();
  const types: string[] = [];

  trace.diagnostics.events.subscribe(({ type }) => types.push(type));
  trace.start();
  trace.user(null);
  trace.user(null);

  expect(identity()).toEqual([]);
  expect(trace.diagnostics.get().identity).toEqual({
    generation: 0,
    user: null,
  });
  expect(types).not.toContain("user changed");
});

test("an empty or non-string id is refused with a diagnostic, and nothing changes", () => {
  const { trace, identity } = create();
  const refused: TraceDiagnosticEvent[] = [];

  trace.diagnostics.events.subscribe((diagnostic) => {
    if (diagnostic.type === "user refused") {
      refused.push(diagnostic);
    }
  });
  trace.start();
  trace.user({ id: "" });
  trace.user({ id: "   " });
  // @ts-expect-error A JavaScript caller can pass an id that is not a string.
  trace.user({ id: 42 });
  // @ts-expect-error A JavaScript caller can pass a bare id instead of a user.
  trace.user("ada");

  expect(identity()).toEqual([]);
  expect(trace.diagnostics.get().identity).toEqual({
    generation: 0,
    user: null,
  });
  expect(refused).toEqual(
    Array.from({ length: 4 }, () => ({
      source: "identity",
      type: "user refused",
      destination: null,
      event: null,
      timestamp: 1_000,
      context: null,
    })),
  );
});

test("a user change is recorded with its generation and user", () => {
  const { trace } = create();
  const changes: unknown[] = [];

  trace.diagnostics.events.subscribe(({ type, source, context }) => {
    if (type === "user changed") {
      changes.push({ source, context });
    }
  });
  trace.user({ id: "ada" });
  trace.user(null);

  expect(changes).toEqual([
    { source: "identity", context: { generation: 1, user: { id: "ada" } } },
    { source: "identity", context: { generation: 2, user: null } },
  ]);
});

test("traits merge, and a null removes a trait", () => {
  const { trace, identity, tracked } = create();

  trace.start();
  trace.traits({ plan: "pro", role: "admin" });
  trace.traits({ plan: "free", role: null });
  trace.track("App Opened");

  expect(tracked()[0]?.identity.traits).toEqual({ plan: "free" });
  expect(identity()).toEqual<MockIdentityCall[]>([
    {
      kind: "traits",
      user: null,
      set: { plan: "pro", role: "admin" },
      remove: [],
    },
    { kind: "traits", user: null, set: { plan: "free" }, remove: ["role"] },
  ]);
});

test("a group sets a membership: a different id starts its traits fresh, and the same id merges them", () => {
  const { trace, identity, tracked } = create();

  trace.start();
  trace.group("workspace", { id: "w_1", traits: { plan: "pro" } });
  trace.group("workspace", { id: "w_1", traits: { seats: 3 } });
  trace.group("workspace", { id: "w_2", traits: { seats: 5 } });
  trace.track("App Opened");

  expect(tracked()[0]?.identity.groups).toEqual({
    workspace: { id: "w_2", traits: { seats: 5 } },
  });
  expect(
    identity().map((call) => (call.kind === "group" ? call.group : call)),
  ).toEqual([
    { type: "workspace", id: "w_1", traits: { plan: "pro" } },
    { type: "workspace", id: "w_1", traits: { plan: "pro", seats: 3 } },
    { type: "workspace", id: "w_2", traits: { seats: 5 } },
  ]);
});

test("a null group leaves the membership", () => {
  const { trace, identity, tracked } = create();

  trace.start();
  trace.group("workspace", { id: "w_1" });
  trace.group("workspace", null);
  trace.track("App Opened");

  expect(tracked()[0]?.identity.groups).toEqual({});
  expect(identity().at(-1)).toEqual({
    kind: "group",
    user: null,
    group: { type: "workspace", id: null, traits: {} },
  });
});

test("a user switch or a sign-out drops what the previous user left pending on every destination as identity-changed", async () => {
  const product = createMockAdapter();
  const research = createMockAdapter();

  const trace = new Trace({
    events,
    destinations: { product: product.adapter, research: research.adapter },
  });

  trace.user({ id: "ada" });

  const ada = trace.track("App Opened");

  trace.user({ id: "bob" });

  const bob = trace.track("App Opened");

  trace.user(null);
  trace.start();

  const dropped = {
    state: "settled",
    outcomes: {
      product: { status: "dropped", reason: "identity-changed" },
      research: { status: "dropped", reason: "identity-changed" },
    },
  };

  await expect(ada.settled).resolves.toEqual(dropped);
  await expect(bob.settled).resolves.toEqual(dropped);
  expect(product.sessions[0]?.events).toEqual([]);
  expect(research.sessions[0]?.events).toEqual([]);
});

test("an anonymous event waiting when the user signs in is still sent, before the sign-in reaches the provider", () => {
  const log: string[] = [];

  const mock = createMockAdapter({
    onTrack: ({ event: tracked }) => {
      log.push(`track ${tracked.identity.user?.id ?? "anonymous"}`);
    },
    onIdentity: (call) => {
      log.push(
        call.kind === "identify" ? `identify ${call.user.id}` : call.kind,
      );
    },
  });

  const trace = new Trace({ events, destinations: { product: mock.adapter } });

  trace.track("App Opened");
  trace.user({ id: "ada" });
  trace.track("App Opened");
  trace.start();

  expect(log).toEqual(["track anonymous", "identify ada", "track ada"]);
});

test("an event whose user signs out while it is being accepted is dropped as identity-changed, never sent under the next identity", async () => {
  const { mock, trace, tracked } = create();

  trace.user({ id: "ada" });
  trace.start();
  trace.events.subscribe((accepted) => {
    if (accepted.name === "Signed Out") {
      trace.user(null);
    }
  });

  const receipt = trace.track("Signed Out");

  await expect(receipt.settled).resolves.toEqual({
    state: "settled",
    outcomes: { product: { status: "dropped", reason: "identity-changed" } },
  });
  expect(tracked()).toEqual([]);
  expect(mock.sessions[0]?.identity.at(-1)).toEqual({ kind: "reset" });
});

test("traits and group traits are validated per key by the schema, and an invalid or undeclared key costs only itself", () => {
  const mock = createMockAdapter();
  const plan = accepting((value) => value === "free" || value === "pro");
  const count = accepting((value) => typeof value === "number");

  const trace = new Trace({
    events,
    destinations: { product: mock.adapter },
    schema: {
      traits: { plan, seats: count },
      groups: { workspace: { plan } },
    },
  });

  const refused: unknown[] = [];

  trace.diagnostics.events.subscribe(({ type, source, context }) => {
    if (type === "traits refused" || type === "group refused") {
      refused.push({ type, source, context });
    }
  });
  trace.start();
  trace.user({ id: "ada", traits: { plan: "enterprise", seats: 3 } });
  // @ts-expect-error A JavaScript caller can set a trait the schema does not declare.
  trace.traits({ role: "admin" });
  trace.group("workspace", {
    id: "w_1",
    // @ts-expect-error A JavaScript caller can set a group trait the schema does not declare.
    traits: { plan: "enterprise", size: 3 },
  });
  // @ts-expect-error A JavaScript caller can join a group type the schema does not declare.
  trace.group("team", { id: "t_1" });
  trace.track("App Opened");

  expect(mock.sessions[0]?.events[0]?.identity).toEqual({
    generation: 1,
    user: { id: "ada" },
    traits: { seats: 3 },
    groups: { workspace: { id: "w_1", traits: {} } },
  });
  expect(refused).toEqual([
    {
      type: "traits refused",
      source: "identity",
      context: { path: "traits.plan" },
    },
    {
      type: "traits refused",
      source: "identity",
      context: { path: "traits.role" },
    },
    {
      type: "traits refused",
      source: "identity",
      context: { path: "groups.workspace.plan" },
    },
    {
      type: "traits refused",
      source: "identity",
      context: { path: "groups.workspace.size" },
    },
    {
      type: "group refused",
      source: "identity",
      context: { path: "groups.team" },
    },
  ]);
});

test("traits and group traits are sanitized before anything keeps or sends them", () => {
  const { trace, identity, tracked } = create();

  trace.start();
  trace.user({
    id: "ada",
    traits: { apiKey: "k_1", note: "x".repeat(2_001), joined: new Date(0) },
  });
  trace.group("workspace", {
    id: "w_1",
    traits: { secret: "s_1", size: 3 },
  });
  trace.track("App Opened");

  expect(tracked()[0]?.identity).toEqual({
    generation: 1,
    user: { id: "ada" },
    traits: { note: "x".repeat(2_000), joined: "1970-01-01T00:00:00.000Z" },
    groups: { workspace: { id: "w_1", traits: { size: 3 } } },
  });
  expect(identity()).toEqual<MockIdentityCall[]>([
    { kind: "identify", user: { id: "ada" } },
    {
      kind: "traits",
      user: { id: "ada" },
      set: { note: "x".repeat(2_000), joined: "1970-01-01T00:00:00.000Z" },
      remove: [],
    },
    {
      kind: "group",
      user: { id: "ada" },
      group: { type: "workspace", id: "w_1", traits: { size: 3 } },
    },
  ]);
});

test("user, traits, group and context return nothing and never throw, even for untyped garbage", () => {
  const { trace, identity } = create();
  const { proxy, revoke } = Proxy.revocable({}, {});

  revoke();
  trace.start();

  const unreadable = {
    get id(): never {
      throw new Error("unreadable id");
    },
  };

  const answers = [
    // @ts-expect-error A JavaScript caller can call user with nothing.
    trace.user(undefined),
    // @ts-expect-error A JavaScript caller can pass a bare id instead of a user.
    trace.user("ada"),
    // @ts-expect-error A JavaScript caller can pass a number instead of a user.
    trace.user(42),
    // @ts-expect-error A JavaScript caller can pass a user without an id.
    trace.user({}),
    // @ts-expect-error A JavaScript caller can pass an id that is not a string.
    trace.user({ id: { value: "ada" } }),
    trace.user(unreadable),
    // @ts-expect-error A JavaScript caller can pass a user that cannot be read.
    trace.user(proxy),
    // @ts-expect-error A JavaScript caller can call traits with nothing.
    trace.traits(undefined),
    // @ts-expect-error A JavaScript caller can pass null traits.
    trace.traits(null),
    // @ts-expect-error A JavaScript caller can pass traits that are not an object.
    trace.traits("pro"),
    // @ts-expect-error A JavaScript caller can pass a list of traits.
    trace.traits(["pro"]),
    trace.traits(proxy),
    // @ts-expect-error A JavaScript caller can call group with nothing.
    trace.group(undefined, undefined),
    // @ts-expect-error A JavaScript caller can pass a group type that is not a string.
    trace.group(42, { id: "w_1" }),
    trace.group("", { id: "w_1" }),
    // @ts-expect-error A JavaScript caller can pass a bare id instead of a membership.
    trace.group("workspace", "w_1"),
    // @ts-expect-error A JavaScript caller can pass a group id that is not a string.
    trace.group("workspace", { id: 5 }),
    trace.group("workspace", unreadable),
    // @ts-expect-error A JavaScript caller can pass a symbol as the group type.
    trace.group(Symbol("workspace"), { id: "w_1" }),
    // @ts-expect-error A JavaScript caller can call context with nothing.
    trace.context(undefined),
    // @ts-expect-error A JavaScript caller can pass a null context.
    trace.context(null),
    // @ts-expect-error A JavaScript caller can pass a context that is not an object.
    trace.context("home"),
    trace.context(proxy),
  ];

  expect(answers).toEqual(Array.from({ length: 23 }, () => undefined));

  trace.track("App Opened");

  expect(identity()).toEqual([]);
  expect(trace.diagnostics.get().identity).toEqual({
    generation: 0,
    user: null,
  });
});

test("a valid user with traits that are not an object signs in and refuses the traits", () => {
  const { trace, tracked } = create();
  const refused: unknown[] = [];

  trace.diagnostics.events.subscribe(({ type, context }) => {
    if (type === "traits refused") {
      refused.push(context);
    }
  });
  trace.start();
  // @ts-expect-error A JavaScript caller can pass traits that are not an object.
  trace.user({ id: "ada", traits: "pro" });
  trace.track("App Opened");

  expect(tracked()[0]?.identity).toMatchObject({
    user: { id: "ada" },
    traits: {},
  });
  expect(refused).toEqual([{ path: "traits" }]);
});

test.each([
  ["redact throws on them", { id: "bob", traits: { nickname: "b" } }],
  [
    "they cannot be read",
    {
      id: "bob",
      get traits(): never {
        throw new Error("unreadable traits");
      },
    },
  ],
])(
  "a switch whose traits cannot be prepared because %s still switches: the provider is reset, the previous user's pending events drop and the traits are refused",
  async (_, next) => {
    const mock = createMockAdapter();

    const trace = new Trace({
      events,
      destinations: { product: mock.adapter },
      privacy: {
        redact: (key) => {
          if (key === "nickname") {
            throw new Error("redact exploded");
          }

          return false;
        },
      },
    });

    const refused: unknown[] = [];

    trace.diagnostics.events.subscribe(({ type, context }) => {
      if (type === "traits refused" || type === "user refused") {
        refused.push({ type, context });
      }
    });
    trace.user({ id: "ada" });

    const pending = trace.track("Signed Out");

    trace.user(next);
    trace.start();
    trace.track("App Opened");

    await expect(pending.settled).resolves.toEqual({
      state: "settled",
      outcomes: { product: { status: "dropped", reason: "identity-changed" } },
    });
    expect(mock.sessions[0]?.events.map(({ identity }) => identity)).toEqual([
      { generation: 2, user: { id: "bob" }, traits: {}, groups: {} },
    ]);
    expect(mock.sessions[0]?.identity).toEqual<MockIdentityCall[]>([
      { kind: "reset" },
      { kind: "identify", user: { id: "bob" } },
    ]);
    expect(refused).toEqual([
      { type: "traits refused", context: { path: "traits" } },
    ]);
  },
);

test("a refused membership is reported as group refused with its path, and nothing changes", () => {
  const { trace, identity } = create();
  const refused: unknown[] = [];

  const unreadable = {
    get id(): never {
      throw new Error("unreadable id");
    },
  };

  trace.diagnostics.events.subscribe(({ type, source, context }) => {
    if (type === "group refused" || type === "traits refused") {
      refused.push({ type, source, context });
    }
  });
  trace.start();
  // @ts-expect-error A JavaScript caller can pass a group type that is not a string.
  trace.group(42, { id: "w_1" });
  // @ts-expect-error A JavaScript caller can pass a group id that is not a string.
  trace.group("workspace", { id: 5 });
  trace.group("workspace", unreadable);
  // @ts-expect-error A JavaScript caller can pass a bare id instead of a membership.
  trace.group("workspace", "w_1");
  trace.group("workspace", { id: "   " });
  trace.group("", { id: "w_1" });
  trace.group("", null);

  expect(identity()).toEqual([]);
  expect(trace.diagnostics.get().identity).toEqual({
    generation: 0,
    user: null,
  });
  expect(refused).toEqual(
    [
      "groups",
      "groups.workspace",
      "groups.workspace",
      "groups.workspace",
      "groups.workspace",
      "groups.",
      "groups.",
    ].map((path) => ({
      type: "group refused",
      source: "identity",
      context: { path },
    })),
  );
});

test("a membership whose traits cannot be prepared still joins, and the traits are refused under the group's path", () => {
  const mock = createMockAdapter();

  const trace = new Trace({
    events,
    destinations: { product: mock.adapter },
    privacy: {
      redact: (key) => {
        if (key === "nickname") {
          throw new Error("redact exploded");
        }

        return false;
      },
    },
  });

  const refused: unknown[] = [];

  trace.diagnostics.events.subscribe(({ type, context }) => {
    if (type === "group refused" || type === "traits refused") {
      refused.push({ type, context });
    }
  });
  trace.start();
  trace.group("workspace", { id: "w_1", traits: { nickname: "core" } });
  // @ts-expect-error A JavaScript caller can pass group traits that are not an object.
  trace.group("team", { id: "t_1", traits: "core" });
  trace.track("App Opened");

  expect(mock.sessions[0]?.events[0]?.identity.groups).toEqual({
    workspace: { id: "w_1", traits: {} },
    team: { id: "t_1", traits: {} },
  });
  expect(refused).toEqual([
    { type: "traits refused", context: { path: "groups.workspace" } },
    { type: "traits refused", context: { path: "groups.team" } },
  ]);
});

test("a diagnostics listener that starts the Trace when the user changes never lets the previous user's pending events out", async () => {
  const { mock, trace } = create();

  trace.user({ id: "ada" });

  const pending = trace.track("App Opened");

  trace.diagnostics.events.subscribe(({ type }) => {
    if (type === "user changed") {
      trace.start();
    }
  });
  trace.user({ id: "bob" });

  await expect(pending.settled).resolves.toEqual({
    state: "settled",
    outcomes: { product: { status: "dropped", reason: "identity-changed" } },
  });
  expect(mock.sessions[0]?.events).toEqual([]);
});

const createSwitching = () => {
  const mock = createMockAdapter();

  const switching: StandardSchema<unknown> = {
    "~standard": {
      version: 1,
      vendor: "test",
      validate: (value) => {
        trace.user({ id: "bob" });

        return { value };
      },
    },
  };

  const trace = new Trace({
    events,
    destinations: { product: mock.adapter },
    schema: {
      traits: { plan: switching },
      groups: { workspace: { plan: switching } },
    },
  });

  return { mock, trace };
};

test.each<
  [string, (trace: ReturnType<typeof createSwitching>["trace"]) => void]
>([
  ["user", (trace) => trace.user({ id: "carol", traits: { plan: "pro" } })],
  ["traits", (trace) => trace.traits({ plan: "pro" })],
  [
    "group",
    (trace) => trace.group("workspace", { id: "w_1", traits: { plan: "pro" } }),
  ],
])(
  "a validator that switches the user while %s is prepared leaves the switch standing, and the change it interrupted is never applied",
  (_, change) => {
    const { mock, trace } = createSwitching();

    trace.user({ id: "ada" });
    trace.start();
    change(trace);
    trace.track("App Opened");

    expect(mock.sessions[0]?.events[0]?.identity).toEqual({
      generation: 2,
      user: { id: "bob" },
      traits: {},
      groups: {},
    });
  },
);

test("traits that cannot be prepared are refused as a whole, and nothing changes", () => {
  const mock = createMockAdapter();

  const trace = new Trace({
    events,
    destinations: { product: mock.adapter },
    privacy: {
      redact: (key) => {
        if (key === "nickname") {
          throw new Error("redact exploded");
        }

        return false;
      },
    },
  });

  const refused: unknown[] = [];

  trace.diagnostics.events.subscribe(({ type, context }) => {
    if (type === "traits refused") {
      refused.push(context);
    }
  });
  trace.start();
  trace.traits({ plan: "pro" });
  trace.traits({ nickname: "a", plan: "free" });
  trace.track("App Opened");

  expect(mock.sessions[0]?.events[0]?.identity.traits).toEqual({ plan: "pro" });
  expect(refused).toEqual([{ path: "traits" }]);
});

test("a user or a membership refused for its id or its type never has its traits read or prepared", () => {
  const redact = vi.fn(() => false);

  const trace = new Trace({
    events,
    destinations: { product: createMockAdapter().adapter },
    privacy: { redact },
  });

  for (const id of [42, "", "   "]) {
    // @ts-expect-error A JavaScript caller can pass an id that is not a string.
    trace.user({ id, traits: { plan: "pro" } });
    // @ts-expect-error A JavaScript caller can pass an id that is not a string.
    trace.group("workspace", { id, traits: { plan: "pro" } });
  }

  for (const type of ["", "   "]) {
    trace.group(type, { id: "w_1", traits: { plan: "pro" } });
  }

  expect(redact.mock.calls).toEqual([]);
});

const createPair = () => {
  const product = createMockAdapter();
  const research = createMockAdapter();

  const trace = new Trace({
    events,
    destinations: { product: product.adapter, research: research.adapter },
  });

  return { product, research, trace };
};

type Pair = ReturnType<typeof createPair>;

test.each<[string, (trace: Pair["trace"], pending: Receipt) => void]>([
  [
    "a diagnostics listener",
    (trace) =>
      trace.diagnostics.events.subscribe(({ type, destination }) => {
        if (type === "event dropped" && destination?.name === "product") {
          trace.start();
        }
      }),
  ],
  [
    "a receipt listener",
    (trace, pending) => pending.status.subscribe(trace.start),
  ],
])(
  "%s that starts the Trace while the first destination's drops land never lets a later destination send the previous user's events",
  async (_, listen) => {
    const { product, research, trace } = createPair();

    trace.user({ id: "ada" });

    const pending = trace.track("App Opened");

    listen(trace, pending);
    trace.user({ id: "bob" });

    await expect(pending.settled).resolves.toEqual({
      state: "settled",
      outcomes: {
        product: { status: "dropped", reason: "identity-changed" },
        research: { status: "dropped", reason: "identity-changed" },
      },
    });
    expect(product.sessions[0]?.events).toEqual([]);
    expect(research.sessions[0]?.events).toEqual([]);
  },
);

test.each<[string, (trace: Pair["trace"]) => void]>([
  [
    "a user",
    (trace) =>
      trace.user({
        get id() {
          trace.user({ id: "bob" });

          return "carol";
        },
      }),
  ],
  [
    "a membership",
    (trace) =>
      trace.group("workspace", {
        get id() {
          trace.user({ id: "bob" });

          return "w_ada";
        },
      }),
  ],
])(
  "%s whose id getter switches the user is never applied to the next user",
  (_, change) => {
    const { product, trace } = createPair();

    trace.start();
    trace.user({ id: "ada" });
    change(trace);
    trace.track("App Opened");

    expect(product.sessions[0]?.events[0]?.identity).toEqual({
      generation: 2,
      user: { id: "bob" },
      traits: {},
      groups: {},
    });
  },
);

test("memberships are bounded by the breadth: a further type is refused as group refused, while a type already held may change", () => {
  const mock = createMockAdapter();
  const refused: unknown[] = [];

  const trace = new Trace({
    events,
    destinations: { product: mock.adapter },
    privacy: { limits: { breadth: 2 } },
  });

  trace.diagnostics.events.subscribe(({ type, context }) => {
    if (type === "group refused") {
      refused.push(context);
    }
  });
  trace.start();
  trace.group("workspace", { id: "w_1" });
  trace.group("team", { id: "t_1" });
  trace.group("project", { id: "p_1" });
  trace.group("team", { id: "t_2" });
  trace.track("App Opened");
  trace.group("workspace", null);
  trace.group("project", { id: "p_1" });
  trace.track("App Opened");

  expect(
    mock.sessions[0]?.events.map(({ identity }) => identity.groups),
  ).toEqual([
    { workspace: { id: "w_1", traits: {} }, team: { id: "t_2", traits: {} } },
    { team: { id: "t_2", traits: {} }, project: { id: "p_1", traits: {} } },
  ]);
  expect(refused).toEqual([{ path: "groups.project" }]);
});
