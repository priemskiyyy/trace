import { expect, test } from "vitest";

import { getCutLosses } from "src/utils/getCutLosses";

test("a string of the limit's length goes without a loss, and one character more is a truncated loss", () => {
  expect(getCutLosses("abcdefgh", "properties.note", 8)).toStrictEqual([]);
  expect(getCutLosses("abcdefghi", "properties.note", 8)).toStrictEqual([
    { path: "properties.note", reason: "truncated" },
  ]);
});

test("a string inside objects and lists is named by its full path", () => {
  expect(
    getCutLosses(
      { label: "abcdefghi", tags: ["ab", "abcdefghi"], page: { title: "ok" } },
      "properties.cart",
      8,
    ),
  ).toStrictEqual([
    { path: "properties.cart.label", reason: "truncated" },
    { path: "properties.cart.tags.1", reason: "truncated" },
  ]);
});

test("a number, a boolean and null are never cut", () => {
  expect(getCutLosses(123_456_789, "properties.value", 8)).toStrictEqual([]);
  expect(getCutLosses(true, "properties.trial", 8)).toStrictEqual([]);
  expect(getCutLosses(null, "properties.coupon", 8)).toStrictEqual([]);
});
