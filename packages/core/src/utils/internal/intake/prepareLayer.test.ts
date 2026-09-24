import { expect, test, vi } from "vitest";

import type { PrivacyPolicy } from "src/types/internal/PrivacyPolicy";
import type { StandardSchema } from "src/types/StandardSchema";
import { DEFAULT_LIMITS } from "src/utils/constants/limits";
import { prepareLayer } from "src/utils/internal/intake/prepareLayer";
import { isSensitiveKey } from "src/utils/isSensitiveKey";

const POLICY: PrivacyPolicy = {
  redact: isSensitiveKey,
  limits: DEFAULT_LIMITS,
};

const accepting = (
  accepts: (value: unknown) => boolean,
  transform: (value: unknown) => unknown = (value) => value,
) => {
  const validate = vi.fn((value: unknown) =>
    accepts(value)
      ? { value: transform(value) }
      : { issues: [{ message: "Refused." }] },
  );

  const schema: StandardSchema<unknown, unknown> = {
    "~standard": { version: 1, vendor: "test", validate },
  };

  return { schema, validate };
};

test("each key is sanitized under the root's path and keeps its own losses", () => {
  const { layer, refused } = prepareLayer(
    { app: { version: "2.4.0", token: "t_1" }, note: "x".repeat(2_001) },
    { root: "context", policy: POLICY },
  );

  expect([...layer]).toEqual([
    [
      "app",
      {
        value: { version: "2.4.0" },
        losses: [{ path: "context.app.token", reason: "redacted" }],
      },
    ],
    [
      "note",
      {
        value: "x".repeat(2_000),
        losses: [{ path: "context.note", reason: "truncated" }],
      },
    ],
  ]);
  expect(refused).toEqual([]);
});

test("a key removed whole keeps its losses and carries no value", () => {
  const { layer } = prepareLayer(
    { password: "hunter2", plan: "pro" },
    { root: "traits", policy: POLICY },
  );

  expect([...layer]).toEqual([
    [
      "password",
      {
        value: undefined,
        losses: [{ path: "traits.password", reason: "redacted" }],
      },
    ],
    ["plan", { value: "pro", losses: [] }],
  ]);
});

test("a null is a removal redact is asked about: a key it names is withheld with no loss, so it clears locally and is never sent", () => {
  const redact = vi.fn(isSensitiveKey);

  const { layer } = prepareLayer(
    { role: null, password: null },
    { root: "traits", policy: { redact, limits: DEFAULT_LIMITS } },
  );

  expect([...layer]).toEqual([
    ["role", { value: null, losses: [] }],
    ["password", { value: undefined, losses: [] }],
  ]);
  expect(redact.mock.calls).toEqual([
    ["role", "traits.role"],
    ["password", "traits.password"],
  ]);
});

test("an undefined value, a getter and a non-enumerable key are not given, and no getter runs", () => {
  const input: Record<string, unknown> = { plan: undefined, seats: 3 };

  Object.defineProperty(input, "secret", {
    enumerable: true,
    get: () => {
      throw new Error("a getter ran");
    },
  });
  Object.defineProperty(input, "hidden", { enumerable: false, value: 1 });

  const { layer, refused } = prepareLayer(input, {
    root: "traits",
    policy: POLICY,
  });

  expect([...layer]).toEqual([["seats", { value: 3, losses: [] }]]);
  expect(refused).toEqual([]);
});

test("nothing given is an empty layer, and anything but a plain object is refused under its root", () => {
  for (const input of [undefined, null]) {
    const { layer, refused } = prepareLayer(input, {
      root: "traits",
      policy: POLICY,
    });

    expect([...layer]).toEqual([]);
    expect(refused).toEqual([]);
  }

  class Plan {
    plan = "pro";
  }

  for (const input of [
    "pro",
    3,
    ["pro"],
    new Plan(),
    new Map([["plan", "pro"]]),
    new Date(0),
  ]) {
    const { layer, refused } = prepareLayer(input, {
      root: "groups.workspace",
      policy: POLICY,
    });

    expect([...layer]).toEqual([]);
    expect(refused).toEqual(["groups.workspace"]);
  }
});

test("a key named __proto__ is omitted and never reaches a prototype", () => {
  const { layer } = prepareLayer(JSON.parse('{"__proto__":{"polluted":1}}'), {
    root: "context",
    policy: POLICY,
  });

  expect([...layer]).toEqual([
    [
      "__proto__",
      {
        value: undefined,
        losses: [{ path: "context.__proto__", reason: "omitted" }],
      },
    ],
  ]);
  expect(Reflect.get({}, "polluted")).toBeUndefined();
});

test("the whole input is bounded in one walk: keys past the breadth are cut, and a loss of the whole object rides with every key of the call", () => {
  const { layer } = prepareLayer(
    { a: 1, b: 2, c: 3 },
    {
      root: "traits",
      policy: { ...POLICY, limits: { ...DEFAULT_LIMITS, breadth: 2 } },
    },
  );

  const truncated = [{ path: "traits", reason: "truncated" }];

  expect([...layer]).toEqual([
    ["a", { value: 1, losses: truncated }],
    ["b", { value: 2, losses: truncated }],
    ["c", { value: undefined, losses: truncated }],
  ]);
});

test("the total size is spent by the whole input, so a key that no longer fits is cut with its own loss", () => {
  const { layer } = prepareLayer(
    { a: "x".repeat(10), b: "y".repeat(10) },
    {
      root: "traits",
      policy: { ...POLICY, limits: { ...DEFAULT_LIMITS, totalSize: 30 } },
    },
  );

  expect([...layer]).toEqual([
    ["a", { value: "x".repeat(10), losses: [] }],
    [
      "b",
      { value: undefined, losses: [{ path: "traits.b", reason: "truncated" }] },
    ],
  ]);
});

test("the losses of one call stay within the breadth, and one truncated loss of the root stands for the rest", () => {
  const { layer } = prepareLayer(
    { a: { token: 1, secret: 2 }, b: { password: 3, cookie: 4 } },
    {
      root: "traits",
      policy: { ...POLICY, limits: { ...DEFAULT_LIMITS, breadth: 2 } },
    },
  );

  expect([...layer]).toEqual([
    [
      "a",
      {
        value: {},
        losses: [
          { path: "traits.a.token", reason: "redacted" },
          { path: "traits.a.secret", reason: "redacted" },
          { path: "traits", reason: "truncated" },
        ],
      },
    ],
    ["b", { value: {}, losses: [{ path: "traits", reason: "truncated" }] }],
  ]);
});

test("a loss of the whole object the walk records twice rides once with each key", () => {
  const { layer } = prepareLayer(
    { a: { token: "t_1" }, b: 2 },
    {
      root: "traits",
      policy: { ...POLICY, limits: { ...DEFAULT_LIMITS, breadth: 1 } },
    },
  );

  expect([...layer]).toEqual([
    ["a", { value: {}, losses: [{ path: "traits", reason: "truncated" }] }],
    [
      "b",
      { value: undefined, losses: [{ path: "traits", reason: "truncated" }] },
    ],
  ]);
});

test("with a schema, each key is validated by its own validator, which sees the raw value once, and its output is sanitized", () => {
  const seats = accepting(
    (value) => typeof value === "string",
    (value) => Number(value),
  );

  const since = accepting((value) => value instanceof Date);
  const joined = new Date(0);

  const { layer, refused } = prepareLayer(
    { seats: "3", since: joined },
    {
      root: "traits",
      policy: POLICY,
      schema: new Map([
        ["seats", seats.schema],
        ["since", since.schema],
      ]),
    },
  );

  expect([...layer]).toEqual([
    ["seats", { value: 3, losses: [] }],
    [
      "since",
      {
        value: "1970-01-01T00:00:00.000Z",
        losses: [{ path: "traits.since", reason: "coerced" }],
      },
    ],
  ]);
  expect(seats.validate.mock.calls).toEqual([["3"]]);
  expect(since.validate.mock.calls).toEqual([[joined]]);
  expect(refused).toEqual([]);
});

test("with a schema, an invalid or undeclared key is refused under its path and costs only itself", () => {
  const plan = accepting((value) => value === "free" || value === "pro");
  const seats = accepting((value) => typeof value === "number");

  const { layer, refused } = prepareLayer(
    { plan: "enterprise", seats: 3, role: "admin" },
    {
      root: "groups.workspace",
      policy: POLICY,
      schema: new Map([
        ["plan", plan.schema],
        ["seats", seats.schema],
      ]),
    },
  );

  expect([...layer]).toEqual([["seats", { value: 3, losses: [] }]]);
  expect(refused).toEqual(["groups.workspace.plan", "groups.workspace.role"]);
});

test("a null removes a declared key without validation, while an undeclared key is refused whatever its value", () => {
  const plan = accepting(() => true);

  const { layer, refused } = prepareLayer(
    { plan: null, role: null, toString: "x" },
    {
      root: "traits",
      policy: POLICY,
      schema: new Map([["plan", plan.schema]]),
    },
  );

  expect([...layer]).toEqual([["plan", { value: null, losses: [] }]]);
  expect(refused).toEqual(["traits.role", "traits.toString"]);
  expect(plan.validate.mock.calls).toEqual([]);
});

test("a validator that throws refuses only its own key", () => {
  const plan: StandardSchema<unknown, unknown> = {
    "~standard": {
      version: 1,
      vendor: "test",
      validate: () => {
        throw new Error("validator exploded");
      },
    },
  };

  const { layer, refused } = prepareLayer(
    { plan: "pro", seats: 3 },
    {
      root: "traits",
      policy: POLICY,
      schema: new Map([
        ["plan", plan],
        ["seats", accepting(() => true).schema],
      ]),
    },
  );

  expect([...layer]).toEqual([["seats", { value: 3, losses: [] }]]);
  expect(refused).toEqual(["traits.plan"]);
});

test("a redact that throws reaches the caller, which decides what the failure costs", () => {
  const failure = new Error("redact exploded");

  const policy: PrivacyPolicy = {
    redact: () => {
      throw failure;
    },
    limits: DEFAULT_LIMITS,
  };

  expect(() =>
    prepareLayer({ plan: "pro" }, { root: "traits", policy }),
  ).toThrow(failure);
});
