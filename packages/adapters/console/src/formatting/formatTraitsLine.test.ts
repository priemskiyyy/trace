import { expect, test } from "vitest";

import { formatTraitsLine } from "src/formatting/formatTraitsLine";

test.each([
  {
    set: { plan: "pro", seats: 3 },
    remove: [],
    line: '[trace] traits "user_42" set ["plan","seats"]',
  },
  {
    set: {},
    remove: ["role", "team"],
    line: '[trace] traits "user_42" remove ["role","team"]',
  },
  {
    set: { plan: "pro" },
    remove: ["role"],
    line: '[trace] traits "user_42" set ["plan"] remove ["role"]',
  },
  {
    set: {},
    remove: [],
    line: '[trace] traits "user_42"',
  },
])(
  "a traits update is summarized by its user and the keys it sets and removes: $line",
  ({ set, remove, line }) => {
    expect(formatTraitsLine({ user: { id: "user_42" }, set, remove })).toBe(
      line,
    );
  },
);

test("a traits update without a user names the user as anonymous", () => {
  expect(
    formatTraitsLine({ user: null, set: { plan: "free" }, remove: [] }),
  ).toBe('[trace] traits anonymous set ["plan"]');
});
