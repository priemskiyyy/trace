import { expect, test } from "vitest";

import { createTrackedEvent } from "src/trackedEvent.fixture";
import { getSegmentProperties } from "src/utils/getSegmentProperties";

test("the context goes under the properties, and a context key a property shadows is an omitted loss", () => {
  expect(
    getSegmentProperties(
      createTrackedEvent({
        properties: { plan: "pro", seats: 12 },
        context: { plan: "free", locale: "de", screen: "checkout" },
      }),
    ),
  ).toStrictEqual({
    properties: { plan: "pro", locale: "de", screen: "checkout", seats: 12 },
    losses: [{ path: "context.plan", reason: "omitted" }],
  });
});

test("every shadowed context key is its own loss, in the context's order", () => {
  expect(
    getSegmentProperties(
      createTrackedEvent({
        properties: { b: 2, a: 1 },
        context: { a: "context", c: 3, b: "context" },
      }),
    ).losses,
  ).toStrictEqual([
    { path: "context.a", reason: "omitted" },
    { path: "context.b", reason: "omitted" },
  ]);
});

test("nested values, lists and null travel as they are, because Segment takes any JSON", () => {
  const properties = {
    cart: { id: "cart_1", lines: [{ sku: "sku_1", quantity: 2 }] },
    coupon: null,
    tags: ["new", null],
  };

  expect(
    getSegmentProperties(
      createTrackedEvent({ properties, context: { app: { version: null } } }),
    ),
  ).toStrictEqual({
    properties: { app: { version: null }, ...properties },
    losses: [],
  });
});

test("an event with neither properties nor context sends an empty object", () => {
  expect(getSegmentProperties(createTrackedEvent())).toStrictEqual({
    properties: {},
    losses: [],
  });
});
