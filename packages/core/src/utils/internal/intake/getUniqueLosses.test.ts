import { expect, test } from "vitest";

import type { MappingLoss } from "src/types/MappingLoss";
import { getUniqueLosses } from "src/utils/internal/intake/getUniqueLosses";

test("each path and reason pair is kept once, where it first appeared, and the same path with another reason is kept", () => {
  const first: MappingLoss = { path: "properties.card", reason: "truncated" };

  const losses = getUniqueLosses([
    first,
    { path: "timestamp", reason: "unsupported" },
    { path: "properties.card", reason: "truncated" },
    { path: "properties.card", reason: "redacted" },
    { path: "timestamp", reason: "unsupported" },
  ]);

  expect(losses).toEqual([
    { path: "properties.card", reason: "truncated" },
    { path: "timestamp", reason: "unsupported" },
    { path: "properties.card", reason: "redacted" },
  ]);
  expect(losses[0]).toBe(first);
});
