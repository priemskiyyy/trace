import { expect, test } from "vitest";

import { createTrackedEvent } from "src/trackedEvent.fixture";
import { RESERVED_PROPERTIES } from "src/utils/constants/properties";
import { getRudderStackProperties } from "src/utils/getRudderStackProperties";

test("the context goes under the properties, and a context key a property shadows is an omitted loss", () => {
  expect(
    getRudderStackProperties(
      createTrackedEvent({
        properties: { plan: "pro", seats: 12 },
        context: { plan: "free", locale: "de" },
      }),
    ),
  ).toStrictEqual({
    properties: { plan: "pro", seats: 12, locale: "de" },
    losses: [{ path: "context.plan", reason: "omitted" }],
  });
});

test.each(RESERVED_PROPERTIES)(
  "the reserved name %s is left out of the properties and of the context, each an invalid loss, because it breaks RudderStack's reserved names",
  (key) => {
    expect(
      getRudderStackProperties(
        createTrackedEvent({
          properties: { [key]: "property", value: 1 },
          context: { [key.toUpperCase()]: "context", locale: "de" },
        }),
      ),
    ).toStrictEqual({
      properties: { value: 1, locale: "de" },
      losses: [
        { path: `properties.${key}`, reason: "invalid" },
        { path: `context.${key.toUpperCase()}`, reason: "invalid" },
      ],
    });
  },
);

test("a reserved name is left out whatever its case, as RudderStack compares it in lowercase", () => {
  expect(
    getRudderStackProperties(
      createTrackedEvent({
        properties: { ID: 1, User_Id: "u_1", identity: "kept" },
      }),
    ),
  ).toStrictEqual({
    properties: { identity: "kept" },
    losses: [
      { path: "properties.ID", reason: "invalid" },
      { path: "properties.User_Id", reason: "invalid" },
    ],
  });
});

test("a null object member stays in what is handed over and is an unsupported loss at its path, because RudderStack sends it without the key", () => {
  const properties = {
    coupon: null,
    cart: { id: "cart_1", note: null },
    tags: [null, "new"],
  };

  expect(
    getRudderStackProperties(
      createTrackedEvent({ properties, context: { app: { build: null } } }),
    ),
  ).toStrictEqual({
    properties: { ...properties, app: { build: null } },
    losses: [
      { path: "properties.coupon", reason: "unsupported" },
      { path: "properties.cart.note", reason: "unsupported" },
      { path: "context.app.build", reason: "unsupported" },
    ],
  });
});

test("losses follow the event's shape: every property loss first, then the context's", () => {
  expect(
    getRudderStackProperties(
      createTrackedEvent({
        properties: { plan: "pro", coupon: null, id: "p_1" },
        context: { extra: null, plan: "free", timestamp: 1 },
      }),
    ).losses,
  ).toStrictEqual([
    { path: "properties.coupon", reason: "unsupported" },
    { path: "properties.id", reason: "invalid" },
    { path: "context.extra", reason: "unsupported" },
    { path: "context.plan", reason: "omitted" },
    { path: "context.timestamp", reason: "invalid" },
  ]);
});

test("a context key a property shadows is omitted, even when the name is also reserved, and a reserved null is only invalid", () => {
  expect(
    getRudderStackProperties(
      createTrackedEvent({
        properties: { plan: "pro", event: "e_1" },
        context: { plan: null, event: "context", channel: null },
      }),
    ).losses,
  ).toStrictEqual([
    { path: "properties.event", reason: "invalid" },
    { path: "context.plan", reason: "omitted" },
    { path: "context.event", reason: "omitted" },
    { path: "context.channel", reason: "invalid" },
  ]);
});

test("an event with neither properties nor context sends an empty object", () => {
  expect(getRudderStackProperties(createTrackedEvent())).toStrictEqual({
    properties: {},
    losses: [],
  });
});
