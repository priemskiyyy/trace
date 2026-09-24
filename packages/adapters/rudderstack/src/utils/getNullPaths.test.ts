import { expect, test } from "vitest";

import { getNullPaths } from "src/utils/getNullPaths";

test("a null value is its own path", () => {
  expect(getNullPaths(null, "properties.coupon")).toStrictEqual([
    "properties.coupon",
  ]);
});

test("every null object member below the value is a path, in the object's order", () => {
  expect(
    getNullPaths({ a: null, b: { c: null, d: 1 }, e: null }, "traits"),
  ).toStrictEqual(["traits.a", "traits.b.c", "traits.e"]);
});

test("a null list item is no path, because RudderStack sends it as null, but a null member of an object in a list is", () => {
  expect(
    getNullPaths([null, { note: null, sku: "sku_1" }, 1], "properties.lines"),
  ).toStrictEqual(["properties.lines.1.note"]);
});

test("text, numbers, booleans, empty objects and empty lists have no null path", () => {
  expect(
    [
      getNullPaths("text", "a"),
      getNullPaths(0, "b"),
      getNullPaths(false, "c"),
      getNullPaths({}, "d"),
      getNullPaths([], "e"),
    ].flat(),
  ).toStrictEqual([]);
});
