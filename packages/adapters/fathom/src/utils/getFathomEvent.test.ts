import { expect, test } from "vitest";

import { createTrackedEvent } from "src/trackedEvent.fixture";
import { getFathomEvent } from "src/utils/getFathomEvent";

const TIMESTAMP_LOSS = { path: "timestamp", reason: "unsupported" };

test("every property and context key is an unsupported loss, in that order, then the timestamp, and an event without a value carries no options", () => {
  expect(
    getFathomEvent(
      createTrackedEvent({
        properties: { order_id: "order_1", total: 49.5 },
        context: { locale: "de", total: 1 },
      }),
      null,
    ),
  ).toStrictEqual({
    options: undefined,
    losses: [
      { path: "properties.order_id", reason: "unsupported" },
      { path: "properties.total", reason: "unsupported" },
      { path: "context.locale", reason: "unsupported" },
      { path: "context.total", reason: "unsupported" },
      TIMESTAMP_LOSS,
    ],
  });
});

test.each([4950, 0, -500])(
  "a value of whole cents, %i, travels as _value",
  (cents) => {
    expect(getFathomEvent(createTrackedEvent(), cents)).toStrictEqual({
      options: { _value: cents },
      losses: [TIMESTAMP_LOSS],
    });
  },
);

test.each([1998.9999999999998, 49.5, Number.NaN, Infinity, 2 ** 53])(
  "a value that is not whole cents, %d, is left out as invalid, last, and never rounded",
  (cents) => {
    expect(getFathomEvent(createTrackedEvent(), cents)).toStrictEqual({
      options: undefined,
      losses: [TIMESTAMP_LOSS, { path: "value", reason: "invalid" }],
    });
  },
);
