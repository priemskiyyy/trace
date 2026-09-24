import type { TrackedEvent } from "@priemskiyyy/trace";
import { expect, test } from "vitest";

import { getPostHogProperties } from "src/utils/getPostHogProperties";

const createEvent = (
  properties: Record<string, unknown>,
  context: Record<string, unknown>,
  name = "Checkout",
): TrackedEvent => ({
  id: "0b5f6c9e-8f1a-4c2d-9a3b-2f6e1d4c7a88",
  name,
  properties,
  context,
  identity: { generation: 1, user: { id: "ada" }, traits: {}, groups: {} },
  timestamp: 1_767_225_600_000,
});

test("the context goes under the properties, and a context key a property shadows is an omitted loss", () => {
  expect(
    getPostHogProperties(
      createEvent(
        { plan: "pro", seats: 12, trial: false, coupon: null },
        { plan: "free", locale: "de" },
      ),
      65_535,
    ),
  ).toStrictEqual({
    properties: {
      locale: "de",
      plan: "pro",
      seats: 12,
      trial: false,
      coupon: null,
    },
    losses: [{ path: "context.plan", reason: "omitted" }],
  });
});

test.each([
  "distinct_id",
  "token",
  "$set",
  "$set_once",
  "$unset",
  "$groups",
  "$process_person_profile",
  "$session_id",
])(
  "%s is left out of the properties and of the context, each an omitted loss",
  (key) => {
    expect(
      getPostHogProperties(
        createEvent({ [key]: "property", value: 1 }, { locale: "de" }),
        65_535,
      ),
    ).toStrictEqual({
      properties: { locale: "de", value: 1 },
      losses: [{ path: `properties.${key}`, reason: "omitted" }],
    });
    expect(
      getPostHogProperties(
        createEvent({ value: 1 }, { [key]: "context", locale: "de" }),
        65_535,
      ),
    ).toStrictEqual({
      properties: { locale: "de", value: 1 },
      losses: [{ path: `context.${key}`, reason: "omitted" }],
    });
  },
);

test("a string longer than posthog-js keeps, wherever it sits, is a truncated loss and goes whole, since posthog-js cuts it", () => {
  expect(
    getPostHogProperties(
      createEvent(
        {
          note: "abcdefghi",
          cart: { label: "abcdefghij", tags: ["ab", "abcdefghij"] },
          exact: "abcdefgh",
        },
        { page: { title: "abcdefghij" }, referrer: "abcdefghi" },
      ),
      8,
    ),
  ).toStrictEqual({
    properties: {
      page: { title: "abcdefghij" },
      referrer: "abcdefghi",
      note: "abcdefghi",
      cart: { label: "abcdefghij", tags: ["ab", "abcdefghij"] },
      exact: "abcdefgh",
    },
    losses: [
      { path: "properties.note", reason: "truncated" },
      { path: "properties.cart.label", reason: "truncated" },
      { path: "properties.cart.tags.1", reason: "truncated" },
      { path: "context.page.title", reason: "truncated" },
      { path: "context.referrer", reason: "truncated" },
    ],
  });
});

test("a context key left out whole reports no cut of its own", () => {
  expect(
    getPostHogProperties(
      createEvent(
        { note: "short" },
        { note: "abcdefghij", $set: "abcdefghij" },
      ),
      8,
    ),
  ).toStrictEqual({
    properties: { note: "short" },
    losses: [
      { path: "context.note", reason: "omitted" },
      { path: "context.$set", reason: "omitted" },
    ],
  });
});

test("a name longer than posthog-js keeps is a truncated loss too, since posthog-js cuts every string it sends", () => {
  expect(
    getPostHogProperties(createEvent({}, {}, "Checkout Started"), 8),
  ).toStrictEqual({
    properties: {},
    losses: [{ path: "name", reason: "truncated" }],
  });
});

test("the losses follow the event's shape: the name's first, then the properties', then the context's", () => {
  expect(
    getPostHogProperties(
      createEvent(
        { $set: "x", note: "abcdefghi" },
        { note: "c", referrer: "abcdefghi" },
        "Checkout Started",
      ),
      8,
    ).losses,
  ).toStrictEqual([
    { path: "name", reason: "truncated" },
    { path: "properties.$set", reason: "omitted" },
    { path: "properties.note", reason: "truncated" },
    { path: "context.note", reason: "omitted" },
    { path: "context.referrer", reason: "truncated" },
  ]);
});
