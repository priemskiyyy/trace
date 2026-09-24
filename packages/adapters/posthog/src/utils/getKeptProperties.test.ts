import { expect, test } from "vitest";

import { getKeptProperties } from "src/utils/getKeptProperties";

test("a string of the limit's length is kept, and a value holding one character more anywhere in it is left out whole and named by its own path", () => {
  expect(
    getKeptProperties(
      {
        exact: "abcdefgh",
        note: "abcdefghi",
        profile: { bio: "abcdefghi", plan: "pro" },
        tags: ["ab", "abcdefghi"],
        history: [{ steps: [{ label: "abcdefghi" }] }],
        plan: "pro",
      },
      "traits",
      8,
    ),
  ).toStrictEqual({
    properties: { exact: "abcdefgh", plan: "pro" },
    refused: ["traits.note", "traits.profile", "traits.tags", "traits.history"],
  });
});

test("a number, a boolean and null are kept, since posthog-js cuts only strings", () => {
  expect(
    getKeptProperties(
      { seats: 123_456_789, trial: true, coupon: null, list: [1, false] },
      "group.workspace",
      8,
    ),
  ).toStrictEqual({
    properties: {
      seats: 123_456_789,
      trial: true,
      coupon: null,
      list: [1, false],
    },
    refused: [],
  });
});
