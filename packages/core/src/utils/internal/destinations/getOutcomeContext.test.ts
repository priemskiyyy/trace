import { expect, test } from "vitest";

import type { DestinationOutcome } from "src/types/DestinationOutcome";
import type { MappingLoss } from "src/types/MappingLoss";
import { getOutcomeContext } from "src/utils/internal/destinations/getOutcomeContext";

const LOSSES: MappingLoss[] = [{ path: "properties.card", reason: "redacted" }];

test("each outcome is described by its evidence or reason and its losses, and a failure by nothing, since its error may quote configuration", () => {
  const outcomes: DestinationOutcome[] = [
    {
      status: "submitted",
      evidence: "sdk-call-returned",
      event: { id: "provider-1" },
      losses: LOSSES,
    },
    { status: "dropped", reason: "provider-filtered", losses: LOSSES },
    { status: "dropped", reason: "buffer-overflow" },
    { status: "skipped", reason: "identity-failed" },
    { status: "indeterminate", reason: "timeout" },
    { status: "failed", error: new Error("token=abc rejected") },
  ];

  expect(outcomes.map(getOutcomeContext)).toEqual([
    { evidence: "sdk-call-returned", losses: LOSSES },
    { reason: "provider-filtered", losses: LOSSES },
    { reason: "buffer-overflow" },
    { reason: "identity-failed" },
    { reason: "timeout" },
    undefined,
  ]);
});
