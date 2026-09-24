import { expect, test } from "vitest";

import { createTrackedEvent } from "src/trackedEvent.fixture";
import { getVercelProperties } from "src/utils/getVercelProperties";

const TIMESTAMP_LOSS = { path: "timestamp", reason: "unsupported" };

test("text, numbers, booleans and null are sent as they are, up to the limit, and every one past it is truncated", () => {
  expect(
    getVercelProperties(
      createTrackedEvent({
        properties: {
          plan: "pro",
          seats: 3,
          beta: true,
          coupon: null,
        },
      }),
      3,
    ),
  ).toStrictEqual({
    properties: { plan: "pro", seats: 3, beta: true },
    losses: [
      { path: "properties.coupon", reason: "truncated" },
      TIMESTAMP_LOSS,
    ],
  });
});

test("null counts as a property Vercel takes", () => {
  expect(
    getVercelProperties(createTrackedEvent({ properties: { coupon: null } }), 2)
      .properties,
  ).toStrictEqual({ coupon: null });
});

test("an object or an array is left out as unsupported and takes no place, so development and production see the same event", () => {
  expect(
    getVercelProperties(
      createTrackedEvent({
        properties: {
          cart: { id: "cart_1" },
          tags: ["gift"],
          plan: "pro",
          seats: 3,
        },
      }),
      2,
    ),
  ).toStrictEqual({
    properties: { plan: "pro", seats: 3 },
    losses: [
      { path: "properties.cart", reason: "unsupported" },
      { path: "properties.tags", reason: "unsupported" },
      TIMESTAMP_LOSS,
    ],
  });
});

test("the context is never sent, each key an omitted loss, because it would take the plan's few places", () => {
  expect(
    getVercelProperties(
      createTrackedEvent({
        properties: { plan: "pro" },
        context: { locale: "de", plan: "free" },
      }),
      2,
    ),
  ).toStrictEqual({
    properties: { plan: "pro" },
    losses: [
      { path: "context.locale", reason: "omitted" },
      { path: "context.plan", reason: "omitted" },
      TIMESTAMP_LOSS,
    ],
  });
});

test("text over 255 characters is cut to 255, a truncated loss, and 255 is sent whole", () => {
  expect(
    getVercelProperties(
      createTrackedEvent({
        properties: { note: "n".repeat(256), bio: "b".repeat(255) },
      }),
      2,
    ),
  ).toStrictEqual({
    properties: { note: "n".repeat(255), bio: "b".repeat(255) },
    losses: [{ path: "properties.note", reason: "truncated" }, TIMESTAMP_LOSS],
  });
});

test("a cut never leaves half of a character that takes two UTF-16 code units", () => {
  expect(
    getVercelProperties(
      createTrackedEvent({ properties: { note: `${"n".repeat(254)}😀tail` } }),
      2,
    ).properties,
  ).toStrictEqual({ note: "n".repeat(254) });
});

test("a property name over 255 characters is left out as invalid, because Vercel drops it, and 255 is sent", () => {
  const long = "k".repeat(256);
  const longest = "k".repeat(255);

  expect(
    getVercelProperties(
      createTrackedEvent({ properties: { [long]: "a", [longest]: "b" } }),
      2,
    ),
  ).toStrictEqual({
    properties: { [longest]: "b" },
    losses: [{ path: `properties.${long}`, reason: "invalid" }, TIMESTAMP_LOSS],
  });
});

test("losses come in order: properties, then context, then the timestamp", () => {
  expect(
    getVercelProperties(
      createTrackedEvent({
        properties: {
          cart: { id: "cart_1" },
          plan: "pro",
          note: "n".repeat(256),
          seats: 3,
        },
        context: { locale: "de" },
      }),
      2,
    ).losses,
  ).toStrictEqual([
    { path: "properties.cart", reason: "unsupported" },
    { path: "properties.note", reason: "truncated" },
    { path: "properties.seats", reason: "truncated" },
    { path: "context.locale", reason: "omitted" },
    TIMESTAMP_LOSS,
  ]);
});
