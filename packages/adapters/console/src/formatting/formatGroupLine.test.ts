import { expect, test } from "vitest";

import { formatGroupLine } from "src/formatting/formatGroupLine";

test.each([
  {
    group: { type: "workspace", id: "w_1", traits: { tier: "enterprise" } },
    line: '[trace] group "workspace" "w_1" ["tier"]',
  },
  {
    group: { type: "workspace", id: "w_1", traits: {} },
    line: '[trace] group "workspace" "w_1"',
  },
  {
    group: { type: "workspace", id: null, traits: {} },
    line: '[trace] group "workspace" left',
  },
])(
  "a group update is summarized by its type and its membership, its trait keys or that it was left: $line",
  ({ group, line }) => {
    expect(formatGroupLine({ user: { id: "user_42" }, group })).toBe(line);
  },
);
