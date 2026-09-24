import { expect, test } from "vitest";

import { getLossesByKey } from "src/utils/internal/intake/getLossesByKey";

test("a loss belongs to the key its path names, nested or not", () => {
  const { byKey, rest } = getLossesByKey(["plan", "profile"], "traits", [
    { path: "traits.plan", reason: "redacted" },
    { path: "traits.profile.secret", reason: "redacted" },
    { path: "traits.profile.bio", reason: "truncated" },
  ]);

  expect([...byKey]).toEqual([
    ["plan", [{ path: "traits.plan", reason: "redacted" }]],
    [
      "profile",
      [
        { path: "traits.profile.secret", reason: "redacted" },
        { path: "traits.profile.bio", reason: "truncated" },
      ],
    ],
  ]);
  expect(rest).toEqual([]);
});

test("a loss of the whole object belongs to no key, even to a key its path ends with", () => {
  const { byKey, rest } = getLossesByKey(["plan", "lan", ""], "traits", [
    { path: "traits", reason: "truncated" },
    { path: "traitsplan", reason: "invalid" },
  ]);

  expect([...byKey]).toEqual([]);
  expect(rest).toEqual([
    { path: "traits", reason: "truncated" },
    { path: "traitsplan", reason: "invalid" },
  ]);
});

test("a key with a dot in it wins over a shorter key it starts with", () => {
  const { byKey } = getLossesByKey(["a", "a.b"], "context", [
    { path: "context.a.b", reason: "redacted" },
    { path: "context.a.c", reason: "truncated" },
    { path: "context.a.b.d", reason: "invalid" },
  ]);

  expect([...byKey]).toEqual([
    [
      "a.b",
      [
        { path: "context.a.b", reason: "redacted" },
        { path: "context.a.b.d", reason: "invalid" },
      ],
    ],
    ["a", [{ path: "context.a.c", reason: "truncated" }]],
  ]);
});

test("an empty key owns its own path and what is nested under it", () => {
  const { byKey, rest } = getLossesByKey([""], "groups.workspace", [
    { path: "groups.workspace.", reason: "redacted" },
    { path: "groups.workspace..inner", reason: "truncated" },
  ]);

  expect([...byKey]).toEqual([
    [
      "",
      [
        { path: "groups.workspace.", reason: "redacted" },
        { path: "groups.workspace..inner", reason: "truncated" },
      ],
    ],
  ]);
  expect(rest).toEqual([]);
});
