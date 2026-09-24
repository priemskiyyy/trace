import { expect, test } from "vitest";

import { createTrackedEvent } from "src/trackedEvent.fixture";
import { getEventLosses } from "src/utils/getEventLosses";

test("an event whose properties and context Heap keeps as they are loses only its timestamp", () => {
  expect(
    getEventLosses(
      createTrackedEvent({
        properties: { plan: "pro", value: 49.5 },
        context: { locale: "de" },
      }),
    ),
  ).toStrictEqual([{ path: "timestamp", reason: "unsupported" }]);
});

test("a context key a property shadows is omitted, because the property is sent under that name", () => {
  expect(
    getEventLosses(
      createTrackedEvent({
        properties: { plan: "pro" },
        context: { plan: "free" },
      }),
    ),
  ).toStrictEqual([
    { path: "context.plan", reason: "omitted" },
    { path: "timestamp", reason: "unsupported" },
  ]);
});

test("losses come in order: properties, then context, then the timestamp", () => {
  expect(
    getEventLosses(
      createTrackedEvent({
        properties: {
          cart: { id: "cart_1" },
          note: "n".repeat(1024),
          coupon: null,
          beta: true,
          plan: "pro",
        },
        context: {
          app: { version: "2.4.0" },
          plan: "free",
          ["k".repeat(512)]: "long",
          referrer: "",
          tags: ["gift"],
        },
      }),
    ),
  ).toStrictEqual([
    { path: "properties.cart", reason: "unsupported" },
    { path: "properties.note", reason: "truncated" },
    { path: "properties.coupon", reason: "unsupported" },
    { path: "properties.beta", reason: "coerced" },
    { path: "context.app", reason: "unsupported" },
    { path: "context.plan", reason: "omitted" },
    { path: `context.${"k".repeat(512)}`, reason: "invalid" },
    { path: "context.referrer", reason: "unsupported" },
    { path: "context.tags", reason: "coerced" },
    { path: "timestamp", reason: "unsupported" },
  ]);
});
