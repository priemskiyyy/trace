import { expect, test } from "vitest";

import { getChangedEntries } from "src/utils/internal/identity/getChangedEntries";

test("an entry is changed when its key is not held or its value differs, and an equal one is left out", () => {
  expect(
    getChangedEntries(
      { plan: "pro", seats: 3 },
      { plan: "team", seats: 3, region: "eu" },
    ),
  ).toEqual([
    ["plan", "team"],
    ["region", "eu"],
  ]);
});

test("a removal is changed until the held values carry its null, and a key only inherited is not held", () => {
  expect(getChangedEntries({}, { role: null })).toEqual([["role", null]]);
  expect(getChangedEntries({ role: null }, { role: null })).toEqual([]);
  expect(
    getChangedEntries({}, { toString: Object.prototype.toString }),
  ).toEqual([["toString", Object.prototype.toString]]);
});

test("values are compared as Object.is compares them", () => {
  expect(
    getChangedEntries(
      { ratio: Number.NaN, balance: 0 },
      { ratio: Number.NaN, balance: -0 },
    ),
  ).toEqual([["balance", -0]]);
});
