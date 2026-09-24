import { expect, test } from "vitest";

import { getCappedLosses } from "src/utils/internal/intake/getCappedLosses";

test("a list within the breadth is kept as it is, once each", () => {
  expect(
    getCappedLosses(
      [
        { path: "traits.token", reason: "redacted" },
        { path: "traits", reason: "truncated" },
        { path: "traits", reason: "truncated" },
      ],
      "traits",
      2,
    ),
  ).toEqual([
    { path: "traits.token", reason: "redacted" },
    { path: "traits", reason: "truncated" },
  ]);
});

test("a longer list keeps the first breadth losses and one truncated loss for its root", () => {
  const losses = getCappedLosses(
    [
      { path: "context.a", reason: "redacted" },
      { path: "context.b", reason: "redacted" },
      { path: "context.c", reason: "redacted" },
      { path: "context.d", reason: "redacted" },
    ],
    "context",
    2,
  );

  expect(losses).toEqual([
    { path: "context.a", reason: "redacted" },
    { path: "context.b", reason: "redacted" },
    { path: "context", reason: "truncated" },
  ]);
  expect(Object.isFrozen(losses)).toBe(true);
  expect(Object.isFrozen(losses[2])).toBe(true);
});

test("the truncated loss of the root is never repeated when it is already kept", () => {
  expect(
    getCappedLosses(
      [
        { path: "traits", reason: "truncated" },
        { path: "traits.a", reason: "redacted" },
        { path: "traits.b", reason: "redacted" },
      ],
      "traits",
      2,
    ),
  ).toEqual([
    { path: "traits", reason: "truncated" },
    { path: "traits.a", reason: "redacted" },
  ]);
});

test("a breadth of 0 keeps only the truncated loss of the root", () => {
  expect(
    getCappedLosses([{ path: "traits.a", reason: "redacted" }], "traits", 0),
  ).toEqual([{ path: "traits", reason: "truncated" }]);
  expect(getCappedLosses([], "traits", 0)).toEqual([]);
});
