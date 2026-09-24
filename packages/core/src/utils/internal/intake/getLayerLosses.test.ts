import { expect, test } from "vitest";

import { getLayerLosses } from "src/utils/internal/intake/getLayerLosses";

test("the losses of a layer are every key's losses, in the layer's order", () => {
  expect(
    getLayerLosses(
      new Map([
        ["plan", { value: "pro", losses: [] }],
        [
          "token",
          {
            value: undefined,
            losses: [{ path: "traits.token", reason: "redacted" }],
          },
        ],
        [
          "profile",
          {
            value: {},
            losses: [
              { path: "traits.profile.secret", reason: "redacted" },
              { path: "traits.profile.bio", reason: "truncated" },
            ],
          },
        ],
      ]),
    ),
  ).toEqual([
    { path: "traits.token", reason: "redacted" },
    { path: "traits.profile.secret", reason: "redacted" },
    { path: "traits.profile.bio", reason: "truncated" },
  ]);
});
