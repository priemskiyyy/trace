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

test("a string goes whole however long it is, because posthog-node cuts none and PostHog documents no limit for one", () => {
  const long = "n".repeat(70_000);

  expect(
    getPostHogProperties(
      createTrackedEvent({
        properties: { note: long, cart: { tags: [long] } },
        context: { page: long },
      }),
    ),
  ).toStrictEqual({
    properties: { page: long, note: long, cart: { tags: [long] } },
    losses: [],
  });
});

test("the losses follow the event's shape: the properties' first, then the context's", () => {
  expect(
    getPostHogProperties(
      createTrackedEvent({
        properties: { note: "a", $set: { plan: "pro" }, token: "phc" },
        context: { note: "b", $groups: { team: "t_1" }, locale: "de" },
      }),
    ).losses,
  ).toStrictEqual([
    { path: "properties.$set", reason: "omitted" },
    { path: "properties.token", reason: "omitted" },
    { path: "context.note", reason: "omitted" },
    { path: "context.$groups", reason: "omitted" },
  ]);
});
