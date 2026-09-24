import { expect, test } from "vitest";

import { inspectContext } from "src/utils/inspectContext";

const range = (length: number) => Array.from({ length }, (_, index) => index);

test("plain data is copied as it is", () => {
  expect(
    inspectContext({
      name: "Checkout Started",
      destinations: ["product", "backend"],
      losses: [{ path: "properties.card", reason: "truncated" }],
      drained: true,
      capacity: 100,
      user: null,
    }),
  ).toEqual({
    name: "Checkout Started",
    destinations: ["product", "backend"],
    losses: [{ path: "properties.card", reason: "truncated" }],
    drained: true,
    capacity: 100,
    user: null,
  });
  expect(inspectContext(undefined)).toBeUndefined();
});

test("a key that looks like a secret is redacted at any depth, and a key named __proto__ stays an own key", () => {
  expect(
    inspectContext({
      authorization: "Bearer abc",
      nested: { apiToken: "abc", plan: "pro" },
      list: [{ password: "abc" }],
      ...Object.fromEntries([["__proto__", "kept"]]),
    }),
  ).toEqual({
    authorization: "[Redacted]",
    nested: { apiToken: "[Redacted]", plan: "pro" },
    list: [{ password: "[Redacted]" }],
    ...Object.fromEntries([["__proto__", "kept"]]),
  });
});

test("values JSON cannot hold are named, and getters are never run", () => {
  let ran = false;

  const copy = inspectContext({
    count: 7n,
    callback: () => {},
    marker: Symbol("marker"),
    get trap() {
      ran = true;

      return "boom";
    },
  });

  expect(ran).toBe(false);
  expect(copy).toEqual({
    count: "7n",
    callback: "[function]",
    marker: "[symbol]",
    trap: "[Accessor]",
  });
});

test("a long string is cut at 2000 characters", () => {
  expect(inspectContext({ note: "a".repeat(2_000) })).toEqual({
    note: "a".repeat(2_000),
  });
  expect(inspectContext({ note: "a".repeat(2_001) })).toEqual({
    note: `${"a".repeat(2_000)}… [Truncated]`,
  });
});

test("an object or array keeps its first 50 entries, and says when it had more", () => {
  const wide = Object.fromEntries(
    range(51).map((index) => [`key${index}`, index]),
  );

  expect(inspectContext(range(50))).toEqual(range(50));
  expect(inspectContext(range(51))).toEqual([...range(50), "[Truncated]"]);
  expect(inspectContext(wide)).toEqual({
    ...Object.fromEntries(range(50).map((index) => [`key${index}`, index])),
    "…": "[Truncated]",
  });
});

test("a chain is cut below six levels", () => {
  const chain = range(8).reduce<unknown>((next) => ({ next }), "bottom");

  expect(inspectContext(chain)).toEqual(
    range(7).reduce<unknown>((next) => ({ next }), "[Truncated]"),
  );
});

test("a repeated reference is copied once and named after that", () => {
  const shared = { plan: "pro" };

  expect(inspectContext({ first: shared, second: shared })).toEqual({
    first: { plan: "pro" },
    second: "[Circular or repeated reference]",
  });
});

test("the copy stops after 200 values and says where", () => {
  const rows = range(5).map(() => range(50));

  expect(inspectContext(rows)).toEqual([
    range(50),
    range(50),
    range(50),
    [...range(45), "[Truncated]"],
    "[Truncated]",
  ]);
});
