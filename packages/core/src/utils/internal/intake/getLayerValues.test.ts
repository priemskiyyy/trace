import { expect, test } from "vitest";

import { getLayerValues } from "src/utils/internal/intake/getLayerValues";

test("the values of a layer are the keys that carry one, nulls included", () => {
  const values = getLayerValues(
    new Map([
      ["plan", { value: "pro", losses: [] }],
      ["role", { value: null, losses: [] }],
      [
        "token",
        {
          value: undefined,
          losses: [{ path: "traits.token", reason: "redacted" }],
        },
      ],
    ]),
  );

  expect(values).toEqual({ plan: "pro", role: null });
  expect(Object.hasOwn(values, "token")).toBe(false);
});

test("a key named like a member of Object.prototype is an own key of the record", () => {
  const values = getLayerValues(
    new Map([["hasOwnProperty", { value: 1, losses: [] }]]),
  );

  expect(Object.entries(values)).toEqual([["hasOwnProperty", 1]]);
});
