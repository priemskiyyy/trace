import { expect, test } from "vitest";

import type { Layer } from "src/types/internal/Layer";
import type { MappingLoss } from "src/types/MappingLoss";
import { keepLosses } from "src/utils/internal/intake/keepLosses";

test("each key keeps the losses it arrived with last, a key that arrives without any forgets its own, and other keys are left alone", () => {
  const redacted: MappingLoss[] = [
    { path: "traits.token", reason: "redacted" },
  ];

  const truncated: MappingLoss[] = [
    { path: "traits.bio", reason: "truncated" },
  ];

  const kept = new Map<string, MappingLoss[]>([
    ["token", redacted],
    ["bio", truncated],
    ["seats", [{ path: "traits.seats", reason: "invalid" }]],
  ]);

  const layer: Layer = new Map([
    ["token", { value: undefined, losses: [] }],
    ["bio", { value: "b".repeat(10), losses: truncated }],
    ["plan", { value: "pro", losses: [] }],
    ["note", { value: {}, losses: redacted }],
  ]);

  keepLosses(kept, layer);

  expect([...kept]).toEqual([
    ["bio", truncated],
    ["seats", [{ path: "traits.seats", reason: "invalid" }]],
    ["note", redacted],
  ]);
});
