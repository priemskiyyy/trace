import { expect, test } from "vitest";

import { createTrackedEvent } from "src/trackedEvent.fixture";
import { getPostHogProperties } from "src/utils/getPostHogProperties";

test("the context goes under the properties, and a context key a property shadows is an omitted loss", () => {
  expect(
    getPostHogProperties(
      createTrackedEvent({
        properties: { plan: "pro", seats: 12, trial: false, coupon: null },
        context: { plan: "free", locale: "de" },
      }),
    ),
  ).toStrictEqual({
    properties: {
      plan: "pro",
      locale: "de",
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
        createTrackedEvent({
          properties: { [key]: "property", value: 1 },
          context: { locale: "de" },
        }),
      ),
    ).toStrictEqual({
      properties: { locale: "de", value: 1 },
      losses: [{ path: `properties.${key}`, reason: "omitted" }],
    });
    expect(
      getPostHogProperties(
        createTrackedEvent({
          properties: { value: 1 },
          context: { [key]: "context", locale: "de" },
        }),
      ),
    ).toStrictEqual({
      properties: { locale: "de", value: 1 },
      losses: [{ path: `context.${key}`, reason: "omitted" }],
    });
  },
);

test("text of any length goes whole and costs no loss, since posthog-react-native cuts no string", () => {
  const note = "n".repeat(70_000);

  expect(
    getPostHogProperties(
      createTrackedEvent({
        name: "e".repeat(70_000),
        properties: { note, cart: { tags: [note] } },
        context: { referrer: note },
      }),
    ),
  ).toStrictEqual({
    properties: { referrer: note, note, cart: { tags: [note] } },
    losses: [],
  });
});

test("nested values, lists and null travel as they are", () => {
  const properties = {
    cart: { id: "cart_1", lines: [{ sku: "sku_1", quantity: 2 }] },
    coupon: null,
    tags: ["new", null],
  };

  expect(
    getPostHogProperties(
      createTrackedEvent({ properties, context: { app: { version: null } } }),
    ),
  ).toStrictEqual({
    properties: { app: { version: null }, ...properties },
    losses: [],
  });
});

test("the losses follow the event's shape: the properties' first, then the context's", () => {
  expect(
    getPostHogProperties(
      createTrackedEvent({
        properties: { note: "p", $set: "x", token: "t" },
        context: { referrer: "c", note: "c", $groups: "g" },
      }),
    ).losses,
  ).toStrictEqual([
    { path: "properties.$set", reason: "omitted" },
    { path: "properties.token", reason: "omitted" },
    { path: "context.note", reason: "omitted" },
    { path: "context.$groups", reason: "omitted" },
  ]);
});
