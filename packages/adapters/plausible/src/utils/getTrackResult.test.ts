import { TraceError } from "@priemskiyyy/trace";
import type { MappingLoss } from "@priemskiyyy/trace";
import { expect, test } from "vitest";

import { getTrackResult } from "src/utils/getTrackResult";

const LOSSES: MappingLoss[] = [{ path: "timestamp", reason: "unsupported" }];

test.each([200, 202, 299])(
  "a %i status is submitted with the evidence of Plausible's callback, and no stronger",
  (status) => {
    expect(getTrackResult({ status }, LOSSES)).toStrictEqual({
      status: "submitted",
      evidence: "sdk-callback-completed",
      losses: LOSSES,
    });
  },
);

test.each([199, 300, 400, 500])(
  "a %i status fails the event with DELIVERY_FAILED",
  (status) => {
    expect(getTrackResult({ status }, LOSSES)).toStrictEqual({
      status: "failed",
      error: new TraceError({
        code: "DELIVERY_FAILED",
        message: `Plausible answered the event with the status ${status}.`,
      }),
    });
  },
);

test("a network error fails the event with that error", () => {
  const error = new TypeError("Failed to fetch");

  expect(getTrackResult({ error }, LOSSES)).toStrictEqual({
    status: "failed",
    error,
  });
});

test("no answer means Plausible ignored the event, which is dropped as provider-filtered", () => {
  expect(getTrackResult(undefined, LOSSES)).toStrictEqual({
    status: "dropped",
    reason: "provider-filtered",
    losses: LOSSES,
  });
});
