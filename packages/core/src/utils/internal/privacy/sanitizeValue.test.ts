import { runInNewContext } from "node:vm";
import { expect, test, vi } from "vitest";

import type { PrivacyPolicy } from "src/types/internal/PrivacyPolicy";
import type { MappingLoss } from "src/types/MappingLoss";
import { DEFAULT_LIMITS } from "src/utils/constants/limits";
import { sanitizeValue } from "src/utils/internal/privacy/sanitizeValue";
import { isSensitiveKey } from "src/utils/isSensitiveKey";

const policy = (
  redact: PrivacyPolicy["redact"] = () => false,
): PrivacyPolicy => ({ redact, limits: DEFAULT_LIMITS });

const limited = (limits: Partial<PrivacyPolicy["limits"]>): PrivacyPolicy => ({
  redact: () => false,
  limits: { ...DEFAULT_LIMITS, ...limits },
});

const isDeepFrozen = (value: unknown): boolean => {
  if (typeof value !== "object" || value === null) {
    return true;
  }

  return Object.isFrozen(value) && Object.values(value).every(isDeepFrozen);
};

const nestedArrays = (leaf: unknown, levels: number): unknown => {
  if (levels === 0) {
    return leaf;
  }

  return new Array<unknown>(DEFAULT_LIMITS.breadth).fill(
    nestedArrays(leaf, levels - 1),
  );
};

const refusing = <TTarget extends object>(
  target: TTarget,
  keys: (string | symbol)[],
) =>
  new Proxy(target, {
    getOwnPropertyDescriptor: (inner, key) => {
      if (keys.includes(key)) {
        throw new Error(`${String(key)} must not be inspected.`);
      }

      return Reflect.getOwnPropertyDescriptor(inner, key);
    },
  });

test("plain data comes back equal but never as the same objects", () => {
  const input = {
    cartId: "cart_1",
    value: 49,
    nested: { ok: true, tags: ["a"] },
  };

  const sanitized = sanitizeValue(input, policy(), "properties");

  expect(sanitized).toStrictEqual({ value: input, losses: [] });
  expect(sanitized.value).not.toBe(input);
  expect(sanitized.value.nested).not.toBe(input.nested);
});

test("the result is deep frozen and the input is never mutated", () => {
  const input = { nested: { list: [{ note: "n".repeat(10) }] }, token: "t" };
  const before = structuredClone(input);

  const { value, losses } = sanitizeValue(
    input,
    { redact: isSensitiveKey, limits: { ...DEFAULT_LIMITS, stringLength: 5 } },
    "properties",
  );

  expect(value).toStrictEqual({ nested: { list: [{ note: "nnnnn" }] } });
  expect(isDeepFrozen(value)).toBe(true);
  expect(isDeepFrozen(losses)).toBe(true);
  expect(input).toStrictEqual(before);
  expect(Object.isFrozen(input)).toBe(false);
  expect(Object.isFrozen(input.nested.list)).toBe(false);
});

test("redact is asked for every key with its dotted path under the root", () => {
  const asked: string[] = [];

  sanitizeValue(
    { card: { cvc: "123" } },
    policy((_key, path) => {
      asked.push(path);

      return false;
    }),
    "properties",
  );

  expect(asked).toEqual(["properties.card", "properties.card.cvc"]);
});

test("a redacted key is removed and recorded as a redacted loss", () => {
  expect(
    sanitizeValue(
      { token: "t", plan: "pro" },
      policy(isSensitiveKey),
      "traits",
    ),
  ).toEqual({
    value: { plan: "pro" },
    losses: [{ path: "traits.token", reason: "redacted" }],
  });
});

test("a key the predicate names is removed at any depth, and the predicate sees each key as written", () => {
  const keys: string[] = [];

  const sanitized = sanitizeValue(
    { auth: { SessionId: "abc" }, sessionid: "def", plan: "pro" },
    policy((key) => {
      keys.push(key);

      return key.toLowerCase() === "sessionid";
    }),
    "context",
  );

  expect(sanitized).toStrictEqual({
    value: { auth: {}, plan: "pro" },
    losses: [
      { path: "context.auth.SessionId", reason: "redacted" },
      { path: "context.sessionid", reason: "redacted" },
    ],
  });
  expect(keys).toEqual(["auth", "SessionId", "sessionid", "plan"]);
});

test("a path the predicate names is removed whole, and nothing under it is read", () => {
  const asked: string[] = [];

  const sanitized = sanitizeValue(
    { billing: { note: "x" }, upload: { note: "x" } },
    policy((_key, path) => {
      asked.push(path);

      return path === "properties.billing";
    }),
    "properties",
  );

  expect(sanitized).toStrictEqual({
    value: { upload: { note: "x" } },
    losses: [{ path: "properties.billing", reason: "redacted" }],
  });
  expect(asked).toEqual([
    "properties.billing",
    "properties.upload",
    "properties.upload.note",
  ]);
});

test("redaction cannot be undone by a later layer", () => {
  const { value } = sanitizeValue(
    { password: "hunter2", plan: "pro" },
    policy((key) => key === "password"),
    "properties",
  );

  expect(() => Object.assign(value, { password: "hunter2" })).toThrow(
    TypeError,
  );
  expect(JSON.stringify(value)).toBe('{"plan":"pro"}');
});

test("isSensitiveKey as the predicate removes the usual credentials", () => {
  const { value } = sanitizeValue(
    {
      accessToken: "a",
      Authorization: "b",
      password: "c",
      clientSecret: "d",
      cookie: "e",
      api_key: "f",
      apiKey: "g",
      plan: "pro",
    },
    policy(isSensitiveKey),
    "properties",
  );

  expect(value).toStrictEqual({ plan: "pro" });
});

test("a redact that throws propagates, so the caller can fail closed", () => {
  const failure = new Error("redact exploded");

  expect(() =>
    sanitizeValue(
      { note: "text" },
      policy(() => {
        throw failure;
      }),
      "properties",
    ),
  ).toThrow(failure);
});

test("an array item that is removed keeps its position as null", () => {
  expect(
    sanitizeValue(
      { cards: ["4111", "4222"], list: ["a", () => {}, "c"] },
      policy((_key, path) => path === "properties.cards.0"),
      "properties",
    ),
  ).toStrictEqual({
    value: { cards: [null, "4222"], list: ["a", null, "c"] },
    losses: [
      { path: "properties.cards.0", reason: "redacted" },
      { path: "properties.list.1", reason: "invalid" },
    ],
  });
});

test("an array hole is carried as null, never as a value inherited from the prototype", () => {
  const list = new Array<unknown>(1);
  const prototype: unknown[] = [];

  Object.defineProperty(prototype, "0", { value: "inherited" });
  Object.setPrototypeOf(list, prototype);

  expect(sanitizeValue({ list }, policy(), "properties")).toStrictEqual({
    value: { list: [null] },
    losses: [{ path: "properties.list.0", reason: "omitted" }],
  });
});

test("an array is read by its length and its indices only", () => {
  const list = refusing(Object.assign([1, 2], { unrelated: "ignored" }), [
    "unrelated",
  ]);

  expect(sanitizeValue({ list }, policy(), "properties")).toStrictEqual({
    value: { list: [1, 2] },
    losses: [],
  });
});

test("a Date becomes an ISO string and a bigint a decimal string, each a coerced loss that removes nothing", () => {
  expect(
    sanitizeValue(
      { when: new Date("2026-09-20T10:00:00.000Z"), big: 10n },
      policy(),
      "properties",
    ),
  ).toStrictEqual({
    value: { when: "2026-09-20T10:00:00.000Z", big: "10" },
    losses: [
      { path: "properties.when", reason: "coerced" },
      { path: "properties.big", reason: "coerced" },
    ],
  });
});

test("a Date is formatted by the built-in method, never by an override on the instance", () => {
  const when = new Date("2026-09-20T10:00:00.000Z");
  const format = vi.fn(() => "unfiltered application data");

  when.toISOString = format;

  expect(sanitizeValue({ when }, policy(), "properties").value).toStrictEqual({
    when: "2026-09-20T10:00:00.000Z",
  });
  expect(format).not.toHaveBeenCalled();
});

test("non-finite numbers, functions and symbols are removed as invalid", () => {
  expect(
    sanitizeValue(
      {
        nan: Number.NaN,
        endless: Number.POSITIVE_INFINITY,
        below: Number.NEGATIVE_INFINITY,
        onDone: () => {},
        marker: Symbol("s"),
        plan: "pro",
      },
      policy(),
      "properties",
    ),
  ).toStrictEqual({
    value: { plan: "pro" },
    losses: [
      { path: "properties.nan", reason: "invalid" },
      { path: "properties.endless", reason: "invalid" },
      { path: "properties.below", reason: "invalid" },
      { path: "properties.onDone", reason: "invalid" },
      { path: "properties.marker", reason: "invalid" },
    ],
  });
});

test("an invalid Date is removed as invalid, undefined is omitted, and null is carried", () => {
  expect(
    sanitizeValue(
      { never: new Date("not a date"), missing: undefined, nothing: null },
      policy(),
      "properties",
    ),
  ).toStrictEqual({
    value: { nothing: null },
    losses: [
      { path: "properties.never", reason: "invalid" },
      { path: "properties.missing", reason: "omitted" },
    ],
  });
});

test("an object that is not plain, such as a Map, a Set, an Error, a typed array or a class instance, is removed as unsupported", () => {
  class Cart {
    id = "cart_1";
  }

  const unreadablePrototype = new Proxy(
    {},
    {
      getPrototypeOf: () => {
        throw new Error("getPrototypeOf trap");
      },
    },
  );

  expect(
    sanitizeValue(
      {
        map: new Map([["a", 1]]),
        set: new Set([1]),
        error: new TypeError("boom"),
        bytes: new Uint8Array([1, 2]),
        cart: new Cart(),
        unreadablePrototype,
        plan: "pro",
      },
      policy(),
      "properties",
    ),
  ).toStrictEqual({
    value: { plan: "pro" },
    losses: [
      { path: "properties.map", reason: "unsupported" },
      { path: "properties.set", reason: "unsupported" },
      { path: "properties.error", reason: "unsupported" },
      { path: "properties.bytes", reason: "unsupported" },
      { path: "properties.cart", reason: "unsupported" },
      { path: "properties.unreadablePrototype", reason: "unsupported" },
    ],
  });
  expect(sanitizeValue(new Cart(), policy(), "traits")).toStrictEqual({
    value: {},
    losses: [{ path: "traits", reason: "unsupported" }],
  });
});

test("a plain object, an array or a Date from another realm is still read", () => {
  const foreign: unknown = runInNewContext(
    '({ cart: { id: "cart_1" }, tags: ["a"], when: new Date("2026-09-20T10:00:00.000Z") })',
  );

  expect(sanitizeValue(foreign, policy(), "properties")).toStrictEqual({
    value: {
      cart: { id: "cart_1" },
      tags: ["a"],
      when: "2026-09-20T10:00:00.000Z",
    },
    losses: [{ path: "properties.when", reason: "coerced" }],
  });
});

test("getters and toJSON never run, because values are read through property descriptors", () => {
  const getter = vi.fn(() => "computed");
  const toJSON = vi.fn(() => "serialized");
  const slice = vi.fn(() => ["substituted"]);
  const list = ["first"];
  const input = { toJSON, cartId: "cart_1", list };

  Object.defineProperty(list, "1", { get: getter, enumerable: true });
  Object.defineProperty(list, "slice", { value: slice });
  Object.defineProperty(input, "total", { get: getter, enumerable: true });

  expect(sanitizeValue(input, policy(), "properties")).toStrictEqual({
    value: { cartId: "cart_1", list: ["first", null] },
    losses: [
      { path: "properties.toJSON", reason: "invalid" },
      { path: "properties.list.1", reason: "omitted" },
      { path: "properties.total", reason: "omitted" },
    ],
  });
  expect(getter).not.toHaveBeenCalled();
  expect(toJSON).not.toHaveBeenCalled();
  expect(slice).not.toHaveBeenCalled();
});

test("__proto__, constructor and prototype keys are skipped", () => {
  const input: unknown = JSON.parse(
    '{"__proto__": {"admin": true}, "constructor": 1, "prototype": 2, "plan": "pro"}',
  );

  expect(sanitizeValue(input, policy(), "properties")).toStrictEqual({
    value: { plan: "pro" },
    losses: [
      { path: "properties.__proto__", reason: "omitted" },
      { path: "properties.constructor", reason: "omitted" },
      { path: "properties.prototype", reason: "omitted" },
    ],
  });
});

test("a circular reference is cut where it would repeat", () => {
  const input: Record<string, unknown> = { cartId: "cart_1" };

  input.self = input;

  expect(sanitizeValue(input, policy(), "properties")).toStrictEqual({
    value: { cartId: "cart_1" },
    losses: [{ path: "properties.self", reason: "truncated" }],
  });
});

test("the same object used twice side by side is not mistaken for a cycle", () => {
  const shared = { id: 1 };

  expect(
    sanitizeValue({ first: shared, second: shared }, policy(), "properties"),
  ).toStrictEqual({
    value: { first: { id: 1 }, second: { id: 1 } },
    losses: [],
  });
});

test("depth, breadth, string length and total size bounds truncate and report", () => {
  expect(
    sanitizeValue(
      { a: { b: { c: "too deep" } } },
      limited({ depth: 2 }),
      "properties",
    ),
  ).toStrictEqual({
    value: { a: {} },
    losses: [{ path: "properties.a.b", reason: "truncated" }],
  });
  expect(
    sanitizeValue({ a: 1, b: 2, c: 3 }, limited({ breadth: 2 }), "properties"),
  ).toStrictEqual({
    value: { a: 1, b: 2 },
    losses: [{ path: "properties", reason: "truncated" }],
  });
  expect(
    sanitizeValue(
      { list: [1, 2, 3, 4] },
      limited({ breadth: 3 }),
      "properties",
    ),
  ).toStrictEqual({
    value: { list: [1, 2, 3] },
    losses: [{ path: "properties.list", reason: "truncated" }],
  });
  expect(
    sanitizeValue(
      { note: "n".repeat(20) },
      limited({ stringLength: 5 }),
      "properties",
    ),
  ).toStrictEqual({
    value: { note: "nnnnn" },
    losses: [{ path: "properties.note", reason: "truncated" }],
  });
  expect(
    sanitizeValue(
      { first: "a".repeat(30), second: "b".repeat(30), third: "c".repeat(30) },
      limited({ totalSize: 60 }),
      "properties",
    ),
  ).toStrictEqual({
    value: { first: "a".repeat(30) },
    losses: [
      { path: "properties.second", reason: "truncated" },
      { path: "properties", reason: "truncated" },
    ],
  });
});

test("empty strings, objects and arrays still count against the total size", () => {
  expect(
    sanitizeValue(
      { list: ["", [], {}, "", [], {}] },
      limited({ totalSize: 21 }),
      "properties",
    ),
  ).toStrictEqual({
    value: { list: ["", [], {}] },
    losses: [{ path: "properties.list", reason: "truncated" }],
  });
});

test("null, a removed array item and a Date each cost the characters they serialize to", () => {
  const when = new Date("2026-09-20T10:00:00.000Z");

  expect(
    sanitizeValue(
      { list: [null, null, null] },
      limited({ totalSize: 21 }),
      "properties",
    ),
  ).toStrictEqual({
    value: { list: [null] },
    losses: [
      { path: "properties.list.1", reason: "truncated" },
      { path: "properties.list", reason: "truncated" },
    ],
  });
  expect(
    sanitizeValue(
      { list: [Number.NaN, Number.NaN, Number.NaN] },
      limited({ totalSize: 21 }),
      "properties",
    ),
  ).toStrictEqual({
    value: { list: [null] },
    losses: [
      { path: "properties.list.0", reason: "invalid" },
      { path: "properties.list.1", reason: "invalid" },
      { path: "properties.list", reason: "truncated" },
    ],
  });
  expect(
    sanitizeValue(
      { when, then: when },
      limited({ totalSize: 60 }),
      "properties",
    ),
  ).toStrictEqual({
    value: { when: "2026-09-20T10:00:00.000Z" },
    losses: [
      { path: "properties.when", reason: "coerced" },
      { path: "properties.then", reason: "truncated" },
    ],
  });
});

test.each<[string, unknown, number, number, MappingLoss[], number]>([
  [
    "null",
    null,
    4,
    199_186,
    [
      { path: "properties.list.0.15.40.12", reason: "truncated" },
      { path: "properties.list.0.15.40", reason: "truncated" },
      { path: "properties.list.0.15", reason: "truncated" },
      { path: "properties.list.0", reason: "truncated" },
      { path: "properties.list", reason: "truncated" },
    ],
    40_322,
  ],
  [
    "values that cannot be carried",
    Number.NaN,
    4,
    199_186,
    [
      ...Array.from({ length: 50 }, (_, index): MappingLoss => ({
        path: `properties.list.0.0.0.${index}`,
        reason: "invalid",
      })),
      { path: "properties", reason: "truncated" },
    ],
    40_322,
  ],
  [
    "Dates",
    new Date("2026-09-20T10:00:00.000Z"),
    3,
    199_842,
    [
      ...Array.from({ length: 50 }, (_, index): MappingLoss => ({
        path: `properties.list.0.0.${index}`,
        reason: "coerced",
      })),
      { path: "properties", reason: "truncated" },
    ],
    7_543,
  ],
])(
  "nested arrays of %s stay within the total size, and so do their losses and the walk",
  (_label, leaf, levels, size, expectedLosses, walked) => {
    let asked = 0;

    const { value, losses } = sanitizeValue(
      { list: nestedArrays(leaf, levels) },
      policy(() => {
        asked += 1;

        return false;
      }),
      "properties",
    );

    expect({ size: JSON.stringify(value).length, losses, asked }).toEqual({
      size,
      losses: expectedLosses,
      asked: walked,
    });
  },
);

test("losses stop at the breadth limit, and one truncated loss at the root says more were lost", () => {
  expect(
    sanitizeValue(
      {
        a: { x: Number.NaN, y: Number.NaN },
        b: { x: Number.NaN, y: Number.NaN },
      },
      limited({ breadth: 3 }),
      "properties",
    ),
  ).toStrictEqual({
    value: { a: {}, b: {} },
    losses: [
      { path: "properties.a.x", reason: "invalid" },
      { path: "properties.a.y", reason: "invalid" },
      { path: "properties.b.x", reason: "invalid" },
      { path: "properties", reason: "truncated" },
    ],
  });
});

test("a string the budget removes records one loss, not a cut and then a removal", () => {
  expect(
    sanitizeValue(
      { note: "n".repeat(3000) },
      limited({ totalSize: 1000 }),
      "properties",
    ),
  ).toStrictEqual({
    value: {},
    losses: [{ path: "properties.note", reason: "truncated" }],
  });
});

test("a truncated object stops inspecting keys once it finds one past the limit, and a truncated array never reads items past it", () => {
  const object = refusing({ first: 1, second: 2, third: 3, ignored: 4 }, [
    "ignored",
  ]);

  const list = refusing([1, 2, 3, 4], ["2", "3"]);

  expect(
    sanitizeValue({ object, list }, limited({ breadth: 2 }), "properties"),
  ).toStrictEqual({
    value: { object: { first: 1, second: 2 }, list: [1, 2] },
    losses: [
      { path: "properties.object", reason: "truncated" },
      { path: "properties.list", reason: "truncated" },
    ],
  });
});

test("non-enumerable properties are not carried and do not count against the breadth limit", () => {
  const input = Object.defineProperties(
    {},
    {
      firstHidden: { value: "private" },
      visible: { value: "kept", enumerable: true },
      lastHidden: { value: "private" },
    },
  );

  expect(
    sanitizeValue(input, limited({ breadth: 1 }), "properties"),
  ).toStrictEqual({ value: { visible: "kept" }, losses: [] });
});

test("symbol keys are never inspected or carried", () => {
  const hidden = Symbol("hidden");
  const input = refusing({ visible: 1, [hidden]: 2 }, [hidden]);

  expect(sanitizeValue(input, policy(), "properties")).toStrictEqual({
    value: { visible: 1 },
    losses: [],
  });
});

test("a container's values are read before the predicate is asked about its keys", () => {
  const input = { first: "one", second: "original" };

  expect(
    sanitizeValue(
      input,
      policy(() => {
        input.second = "changed";

        return false;
      }),
      "properties",
    ),
  ).toStrictEqual({
    value: { first: "one", second: "original" },
    losses: [],
  });
});

test("an object or array that cannot be read is removed as invalid, never thrown", () => {
  const hostile = new Proxy(
    {},
    {
      ownKeys: () => {
        throw new Error("ownKeys trap");
      },
    },
  );

  const revocable = Proxy.revocable({}, {});

  revocable.revoke();

  expect(
    sanitizeValue(
      {
        hostile,
        unreadableLength: refusing([1, 2], ["length"]),
        unreadableItem: refusing([1, 2], ["0"]),
        revoked: revocable.proxy,
        plan: "pro",
      },
      policy(),
      "properties",
    ),
  ).toStrictEqual({
    value: { plan: "pro" },
    losses: [
      { path: "properties.hostile", reason: "invalid" },
      { path: "properties.unreadableLength", reason: "invalid" },
      { path: "properties.unreadableItem", reason: "invalid" },
      { path: "properties.revoked", reason: "invalid" },
    ],
  });
});

test("an absent root is an empty object, and an array or a primitive root is reported invalid", () => {
  const empty = { value: {}, losses: [] };

  const invalid = {
    value: {},
    losses: [{ path: "traits", reason: "invalid" }],
  };

  expect(sanitizeValue(undefined, policy(), "traits")).toStrictEqual(empty);
  expect(sanitizeValue(null, policy(), "traits")).toStrictEqual(empty);
  expect(sanitizeValue(["plan"], policy(), "traits")).toStrictEqual(invalid);
  expect(sanitizeValue("plan", policy(), "traits")).toStrictEqual(invalid);
  expect(
    Object.isFrozen(sanitizeValue(undefined, policy(), "traits").value),
  ).toBe(true);
});
