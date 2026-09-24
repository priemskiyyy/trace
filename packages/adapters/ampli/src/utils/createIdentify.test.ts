import { Identify } from "@amplitude/analytics-browser";
import { expect, test } from "vitest";

import { createIdentify } from "src/utils/createIdentify";

const nest = (layers: number, leaf: unknown): unknown =>
  layers === 0 ? leaf : { next: nest(layers - 1, leaf) };

const manyKeys = (count: number) =>
  Object.fromEntries(
    Array.from({ length: count }, (_, index) => [`k${index}`, index]),
  );

test.each([
  {
    set: { plan: "pro", seats: 3 },
    remove: [],
    properties: { $set: { plan: "pro", seats: 3 } },
  },
  {
    set: {},
    remove: ["role", "team"],
    properties: { $unset: { role: "-", team: "-" } },
  },
  {
    set: { plan: "pro" },
    remove: ["role"],
    properties: { $set: { plan: "pro" }, $unset: { role: "-" } },
  },
  { set: {}, remove: [], properties: {} },
])(
  "one Identify sets every changed trait and unsets every removed one: $properties",
  ({ set, remove, properties }) => {
    const { identify, refused } = createIdentify(Identify, {
      user: { id: "user_42" },
      set,
      remove,
    });

    expect(identify.getUserProperties()).toStrictEqual(properties);
    expect(refused).toStrictEqual([]);
  },
);

test.each([
  {
    value: { line1: "Main St", line2: null },
    sent: { line1: "Main St" },
    refused: ["traits.value.line2"],
  },
  {
    value: [{ sku: "a", quantity: null }, { sku: "b" }],
    sent: [{ sku: "a" }, { sku: "b" }],
    refused: ["traits.value.0.quantity"],
  },
])(
  "a null held under an object key in a trait is stripped and its path named, and the rest of the trait is set: $refused",
  ({ value, sent, refused }) => {
    const created = createIdentify(Identify, {
      user: { id: "user_42" },
      set: { value },
      remove: [],
    });

    expect(created.identify.getUserProperties()).toStrictEqual({
      $set: { value: sent },
    });
    expect(created.refused).toStrictEqual(refused);
  },
);

test.each([
  {
    part: "a null in a list, whose later items it would shift",
    value: ["alpha", null, "beta"],
  },
  { part: "a boolean in a list", value: ["beta", true] },
  { part: "a list in a list", value: [[1, 2], 3] },
  {
    part: "a null in an object beside a part Identify refuses",
    value: { score: null, tags: [true] },
  },
  { part: "an object of 1,001 keys", value: { wide: manyKeys(1001) } },
  { part: "a string of 1,025 characters", value: "x".repeat(1025) },
  {
    part: "a string of 1,025 characters in an object",
    value: { name: "ada", note: "x".repeat(1025) },
  },
  {
    part: "a string of 1,025 characters in a list",
    value: ["beta", "t".repeat(1025)],
  },
  { part: "an object past the 40th layer", value: nest(40, "leaf") },
])(
  "a trait holding $part is left out whole and named once, never sent in part, and the other traits are set",
  ({ value }) => {
    const created = createIdentify(Identify, {
      user: { id: "user_42" },
      set: { value, plan: "pro" },
      remove: [],
    });

    expect(created.identify.getUserProperties()).toStrictEqual({
      $set: { plan: "pro" },
    });
    expect(created.refused).toStrictEqual(["traits.value"]);
  },
);

test("a trait at each of Amplitude's limits is set whole: 1,000 keys, 1,024 characters and 40 layers", () => {
  const value = {
    wide: manyKeys(1000),
    note: "y".repeat(1024),
    tags: ["y".repeat(1024)],
    deep: nest(37, "leaf"),
  };

  const { identify, refused } = createIdentify(Identify, {
    user: { id: "user_42" },
    set: { value, fits: nest(39, "leaf") },
    remove: [],
  });

  expect(identify.getUserProperties()).toStrictEqual({
    $set: { value, fits: nest(39, "leaf") },
  });
  expect(refused).toStrictEqual([]);
});

test("every update gets an Identify of its own", () => {
  const update = { user: null, set: { plan: "pro" }, remove: [] };

  expect(createIdentify(Identify, update).identify).not.toBe(
    createIdentify(Identify, update).identify,
  );
});
